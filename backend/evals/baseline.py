"""Baseline: the same eval questions asked the way fans do today, to a chatbot with no tools.

    python -m evals.baseline            # real gpt-6-luna calls via Portkey (~$0.002)

Each question gets the context a fan would type ("I'm watching <game> on <date>, it's Q2 9:20"), but no tools,
no game data and no Sideline instructions: the same model Sideline uses, so the comparison isolates what the
tools and the replay engine add. Answers are scored with the exact checks `evals.run` uses for Sideline
(expected facts computed by the engine, and no player or fact from after the current play).
Writes evals/reports/baseline-<time>.json (git-ignored).
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModelSettings

from app.agents.llm import build_model
from app.agents.tools import _clock, _period
from app.agents.view import ReplayView
from app.core.config import Settings
from app.replay.catalog import get_catalog
from evals.cases import CASES
from evals.run import REPORT_DIR, contains, future_only_players

PRICE_IN, PRICE_OUT = 0.20, 0.50  # USD per million tokens (gpt-6-luna, same as docs/tokenomics.md)


def fan_prompt(view: ReplayView, question: str) -> str:
    s = view.state
    when = "before kickoff" if s.quarter == 0 else f"{_period(s.quarter)} {_clock(s.clock_seconds) or ''}".strip()
    info = view.info
    away, home = (" ".join(x for x in (t.city, t.name) if x) or t.abbr for t in (info.away, info.home))
    game = f"{away} at {home}, {info.title}, {info.game_date}"
    return f"I'm watching {game}. Right now it's {when}. {question}"


async def main() -> int:
    settings = Settings.from_env()
    agent = Agent(build_model(settings), output_type=str)
    # Same model settings as Sideline's agents (output cap + reasoning effort), so only the tools differ.
    model_settings = OpenAIChatModelSettings(max_tokens=settings.ai_max_output_tokens)
    if settings.ai_reasoning_effort:
        model_settings["openai_reasoning_effort"] = settings.ai_reasoning_effort  # type: ignore[typeddict-item]
    catalog = get_catalog()
    rows: list[dict[str, Any]] = []
    for case in CASES:
        game = catalog.get(case.game_id)
        assert game, case.game_id
        cursor = case.cursor(game)
        view = ReplayView.at(game, cursor)
        expected = case.expect_all(view)
        if not expected and not case.expect_any:
            continue  # refusal / safety cases have no factual answer to compare
        prompt = fan_prompt(view, case.question)
        started = time.perf_counter()
        try:
            result = await agent.run(prompt, model_settings=model_settings)
        except Exception as exc:  # a provider block counts as "no useful answer"
            error = f"[{type(exc).__name__}: {str(exc)[:80]}]"
            rows.append({"id": case.id, "question": prompt, "answer": error, "factual": False})
            continue
        text, usage = result.output, result.usage
        low = text.lower()
        missing = [x for x in expected if not contains(text, x)]
        factual = not missing and (not case.expect_any or any(x.lower() in low for x in case.expect_any))
        leaked = [f for f in case.forbid if f.lower() in low] + [
            n for n in future_only_players(game.events, cursor) if n.lower() in low
        ]
        rows.append(
            {
                "id": case.id,
                "question": prompt,
                "answer": text,
                "expected": expected or case.expect_any,
                "factual": factual,
                "leaked": leaked,
                "latency_ms": round((time.perf_counter() - started) * 1000),
                "cost_usd": ((usage.input_tokens or 0) * PRICE_IN + (usage.output_tokens or 0) * PRICE_OUT) / 1e6,
            }
        )
    n = len(rows)
    for r in rows:  # same bar as Sideline: right facts and nothing from after the current play
        r["correct"] = r["factual"] and not r.get("leaked")
    right = sum(r["correct"] for r in rows)
    leaks = sum(bool(r.get("leaked")) for r in rows)
    print(f"baseline (no tools): {right}/{n} correct · {leaks} spoiled something that hadn't happened yet")
    for r in rows:
        flag = "✓" if r["correct"] else ("✗ SPOILER" if r.get("leaked") else "✗")
        print(f"  {flag} {r['id']}: {r['answer'][:110]!r}")
    REPORT_DIR.mkdir(exist_ok=True)
    out = REPORT_DIR / f"baseline-{datetime.now(UTC):%Y%m%dT%H%M%S}.json"
    out.write_text(json.dumps({"correct": right, "total": n, "leaks": leaks, "rows": rows}, indent=2))
    print(f"report: {out.relative_to(REPORT_DIR.parent.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
