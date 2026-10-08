"""Run the Ask Sideline evaluation harness.

    python -m evals.run                 # offline: scripted model, no API calls, no cost
    python -m evals.run --live          # real model via Portkey (uses budget; ~$0.01)
    python -m evals.run --live --case div-half-score

Writes a JSON report to evals/reports/ (git-ignored).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.agents.audit import AuditLog
from app.agents.budget import RateLimiter, SpendTracker
from app.agents.conversation import Conversation
from app.agents.llm import build_model
from app.agents.service import AIError, AIService
from app.agents.view import ReplayView
from app.core.config import Settings
from app.replay.catalog import GameCatalog, get_catalog
from evals.cases import CASES, CONVERSATIONS, ConversationCase, EvalCase

REPORT_DIR = Path(__file__).resolve().parent / "reports"
MAX_COST_PER_QUESTION = 0.005
MAX_LATENCY_MS = 20_000


@dataclass
class CaseResult:
    id: str
    category: str
    question: str
    cursor: int
    status: str
    answer: str = ""
    tools_called: list[str] = field(default_factory=list)
    checks: dict[str, bool] = field(default_factory=dict)
    failures: list[str] = field(default_factory=list)
    latency_ms: float = 0.0
    cost_usd: float | None = None
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def passed(self) -> bool:
        return all(self.checks.values()) and self.status == "ok"


def future_only_players(game_events: tuple[Any, ...], cursor: int) -> set[str]:
    """Players credited only after the cursor — naming one would be a leak."""

    def names(events: tuple[Any, ...]) -> set[str]:
        return {n for e in events for n in e.players.model_dump().values() if n}

    return names(game_events[cursor:]) - names(game_events[:cursor])


def contains(text: str, fact: str) -> bool:
    """Case-insensitive containment; numbers must match as whole numbers ("1" doesn't match "10")."""
    if fact.isdigit():
        return re.search(rf"(?<![\d.]){fact}(?![\d])", text) is not None
    return fact.lower() in text.lower()


def check(case: EvalCase, view: ReplayView, future_names: set[str], res: Any, tools: list[str]) -> CaseResult:
    answer = res.answer
    text = answer.answer
    low = text.lower()
    out = CaseResult(case.id, case.category, case.question, view.cursor, "ok", text, tools)

    expected = case.expect_all(view)
    missing = [x for x in expected if not contains(text, x)]
    out.checks["factual"] = not missing and (not case.expect_any or any(x.lower() in low for x in case.expect_any))
    if missing:
        out.failures.append(f"missing expected facts {missing}")
    if case.expect_any and not any(x.lower() in low for x in case.expect_any):
        out.failures.append(f"none of {case.expect_any} present")

    wrong_tools = case.forbid_tools & set(tools)
    out.checks["tool_selection"] = case.expect_tools <= set(tools) and not wrong_tools
    if not out.checks["tool_selection"]:
        out.failures.append(
            f"expected tools {sorted(case.expect_tools)}, avoid {sorted(case.forbid_tools)}, called {tools}"
        )

    grounded = not res.grounding_issues and (not answer.answerable or bool(answer.evidence))
    out.checks["grounding"] = grounded
    if not grounded:
        out.failures.append(f"grounding issues {res.grounding_issues or ['no evidence']}")

    leaked = [f for f in case.forbid if f.lower() in low] + [n for n in future_names if n.lower() in low]
    out.checks["no_future_leakage"] = not leaked
    if leaked:
        out.failures.append(f"leaked {leaked}")

    if case.expect_answerable is not None:
        out.checks["answerable_flag"] = answer.answerable == case.expect_answerable
        if not out.checks["answerable_flag"]:
            out.failures.append(f"answerable={answer.answerable}, expected {case.expect_answerable}")

    out.latency_ms = res.latency_ms
    out.cost_usd = res.usage.estimated_cost_usd
    out.input_tokens, out.output_tokens = res.usage.input_tokens, res.usage.output_tokens
    out.checks["cost_latency"] = (out.cost_usd or 0) <= MAX_COST_PER_QUESTION and out.latency_ms <= MAX_LATENCY_MS
    if not out.checks["cost_latency"]:
        out.failures.append(f"cost ${out.cost_usd} / latency {out.latency_ms}ms over limits")
    return out


def offline_model() -> FunctionModel:
    """Deterministic stand-in: calls every read tool, then answers with the raw facts.
    Exercises the harness end-to-end without an API key (not a measure of model quality)."""

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        # Tool results arrive as the tools' Pydantic return models.
        returns: dict[str, Any] = {
            p.tool_name: p.content for m in messages for p in getattr(m, "parts", []) if isinstance(p, ToolReturnPart)
        }
        if not returns:
            names = ["get_game_state", "get_player_stats", "get_team_stats", "get_game_context"]
            return ModelResponse(parts=[ToolCallPart(n, {}) for n in names])
        state = returns["get_game_state"]
        s = state.score
        text = f"{s.away_team} {s.away}, {s.home_team} {s.home} ({state.period} {state.clock or ''})."
        ans = {
            "answer": text,
            "evidence": [{"tool": "get_game_state", "fact": text}],
            "uncertainty": "Offline scripted model: answers only with the current score.",
            "confidence": "low",
            "answerable": True,
        }
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, ans)])

    return FunctionModel(fn, model_name="offline-scripted")


async def run_cases(
    cases: list[EvalCase], *, model_factory: Callable[[Settings], Model], settings: Settings, catalog: GameCatalog
) -> list[CaseResult]:
    results: list[CaseResult] = []
    for case in cases:
        game = catalog.get(case.game_id)
        assert game, case.game_id
        cursor = case.cursor(game)
        view = ReplayView.at(game, cursor)
        # A fresh service per case: no cache reuse between cases, isolated rate limits.
        svc = AIService(
            settings,
            model_factory=model_factory,
            audit=AuditLog(settings),
            spend=SpendTracker(settings.ai_daily_budget_usd),
            limiter=RateLimiter(1000),
        )
        try:
            res = await svc.ask(game=game, cursor=cursor, question=case.question, session_id=f"eval-{case.id}")
        except AIError as exc:
            if exc.code == "blocked" and case.allow_blocked:
                blocked = CaseResult(
                    case.id, case.category, case.question, cursor, "ok", answer=f"[blocked] {exc.message}"
                )
                blocked.checks["blocked_safely"] = True
                results.append(blocked)
            else:
                results.append(
                    CaseResult(case.id, case.category, case.question, cursor, exc.code, failures=[exc.message])
                )
            continue
        tools = [t.name for t in svc.audit.recent(1)[0].tool_calls]
        results.append(check(case, view, future_only_players(game.events, cursor), res, tools))
    return results


async def run_conversations(
    conversations: list[ConversationCase],
    *,
    model_factory: Callable[[Settings], Model],
    settings: Settings,
    catalog: GameCatalog,
) -> list[CaseResult]:
    """Each conversation shares one service + chat; every turn is checked independently."""
    results: list[CaseResult] = []
    for conv in conversations:
        game = catalog.get(conv.game_id)
        assert game, conv.game_id
        svc = AIService(
            settings,
            model_factory=model_factory,
            audit=AuditLog(settings),
            spend=SpendTracker(settings.ai_daily_budget_usd),
            limiter=RateLimiter(1000),
        )
        chat = Conversation()
        for n, turn in enumerate(conv.turns, start=1):
            case = EvalCase(
                **{**turn.__dict__, "id": f"{conv.id}#{n}", "category": conv.category, "game_id": conv.game_id}
            )
            cursor = case.cursor(game)
            try:
                res = await svc.ask(
                    game=game, cursor=cursor, question=case.question, session_id=f"eval-{conv.id}", conversation=chat
                )
            except AIError as exc:
                results.append(
                    CaseResult(case.id, case.category, case.question, cursor, exc.code, failures=[exc.message])
                )
                break
            tools = [t.name for t in svc.audit.recent(1)[0].tool_calls]
            view = ReplayView.at(game, cursor)
            results.append(check(case, view, future_only_players(game.events, cursor), res, tools))
    return results


def summarize(results: list[CaseResult], *, mode: str, model: str) -> dict[str, Any]:
    checks: dict[str, list[bool]] = {}
    for r in results:
        for k, v in r.checks.items():
            checks.setdefault(k, []).append(v)
    costs = [r.cost_usd for r in results if r.cost_usd is not None]
    lat = sorted(r.latency_ms for r in results if r.status == "ok")
    return {
        "mode": mode,
        "model": model,
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "cases": len(results),
        "passed": sum(r.passed for r in results),
        "check_pass_rates": {k: f"{sum(v)}/{len(v)}" for k, v in checks.items()},
        "total_cost_usd": round(sum(costs), 6) if costs else None,
        "avg_cost_usd": round(sum(costs) / len(costs), 6) if costs else None,
        "p50_latency_ms": lat[len(lat) // 2] if lat else None,
        "max_latency_ms": lat[-1] if lat else None,
        "total_input_tokens": sum(r.input_tokens for r in results),
        "total_output_tokens": sum(r.output_tokens for r in results),
        "results": [asdict(r) | {"passed": r.passed} for r in results],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live", action="store_true", help="call the configured model (costs money)")
    parser.add_argument("--case", action="append", help="run only these case / conversation ids")
    args = parser.parse_args()

    settings = Settings.from_env().model_copy(update={"ai_audit_log_path": None})
    cases = [c for c in CASES if not args.case or c.id in args.case]
    conversations = [c for c in CONVERSATIONS if not args.case or c.id in args.case]
    if args.live:
        if not settings.ai_configured:
            print("Live evals need PORTKEY_API_KEY in the repo-root .env.")
            return 2
        factory: Callable[[Settings], Model] = build_model
        model_name = settings.ai_model
    else:
        factory, model_name = (lambda _s: offline_model()), "offline-scripted"
        from pydantic import SecretStr

        settings = settings.model_copy(
            update={
                "portkey_api_key": SecretStr("offline"),
                "ai_input_price_per_mtok": 0.0,
                "ai_output_price_per_mtok": 0.0,
            }
        )

    started = time.perf_counter()

    async def run_all() -> list[CaseResult]:
        single = await run_cases(cases, model_factory=factory, settings=settings, catalog=get_catalog())
        multi = await run_conversations(conversations, model_factory=factory, settings=settings, catalog=get_catalog())
        return single + multi

    results = asyncio.run(run_all())
    report = summarize(results, mode="live" if args.live else "offline", model=model_name)
    REPORT_DIR.mkdir(exist_ok=True)
    path = REPORT_DIR / f"eval-{report['mode']}-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S')}.json"
    path.write_text(json.dumps(report, indent=2))

    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        cost = f"${r.cost_usd:.5f}" if r.cost_usd is not None else "n/a"
        print(f"{mark}  {r.id:24s} {r.category:13s} {r.latency_ms:7.0f}ms {cost:>10s}  {'; '.join(r.failures)[:110]}")
    print(f"\n{report['passed']}/{report['cases']} passed · checks {report['check_pass_rates']}")
    tokens = f"{report['total_input_tokens']}/{report['total_output_tokens']}"
    print(
        f"cost total ${report['total_cost_usd']} (avg ${report['avg_cost_usd']}) · p50 {report['p50_latency_ms']}ms "
        f"· tokens in/out {tokens} · {time.perf_counter() - started:.1f}s"
    )
    print(f"report: {path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
