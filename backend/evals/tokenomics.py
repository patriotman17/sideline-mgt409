"""Measure Sideline's AI token usage and cost with real model calls, then project monthly cost.

    python -m evals.tokenomics            # real gpt-6-luna calls via Portkey (~$0.05); needs PORTKEY_API_KEY

One shared AIService (as in production: shared caches, budget, audit) serves a simulated session of three
fans on 2025 Week 5:
- Ask AI inside games: standalone questions at the same moments (shared cache), plus a multi-turn chat each.
- "Why?" explanations of key moments (shared per play).
- Pregame previews: written once per game (startup pre-generation), then opened by every fan (cache).
- Ask Sideline: rules, this season, history and "scores now", with some overlap between fans.
Every number comes from the audit log of those real calls (input, cached input and output tokens, cost).

Also measures one cost cut directly: the chat history window (6 turns / 3,000 chars) versus an unlimited
history on the same 8-turn conversation (input tokens per turn, and both sets of answers for comparison).

Writes evals/reports/tokenomics-<time>.json and prints a Markdown summary (used in the report).
"""

from __future__ import annotations

import asyncio
import json
import statistics
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.agents.audit import AuditLog, AuditRecord
from app.agents.budget import RateLimiter, SpendTracker
from app.agents.conversation import Conversation
from app.agents.insights import detect_insights
from app.agents.llm import build_model
from app.agents.service import AIError, AIService
from app.agents.view import ReplayView
from app.api.routes.week import get_slates
from app.core.config import Settings
from app.history_stats.data import get_history_stats
from app.pregame.season import season_for
from app.replay.catalog import get_catalog

REPORT_DIR = Path(__file__).resolve().parent / "reports"

# ---------------------------------------------------------------- the simulated session

GAMES = ["2025_05_NE_BUF", "2025_05_DEN_PHI", "2025_05_KC_JAX"]
#: Questions many fans ask at the same moments (standalone, so the answer cache can share them).
COMMON = ["What's the score?", "Who has the most rushing yards?", "Who's winning the turnover battle?"]
#: A short chat with follow-ups (context-dependent: each fan's own conversation).
CHAT = [
    "Who is the leading passer?",
    "How many touchdowns has he thrown?",
    "What about the other team?",
    "Who has the most receiving yards now?",
]
ASSISTANT_FANS = [
    ["What's a two-point conversion?", "Who leads the NFL in rushing?", "How are the Bills doing?",
     "Who won the Super Bowl after the 2019 season?", "How many career touchdowns did Tom Brady throw?"],
    ["What is pass interference?", "Who leads the NFL in rushing?", "Is Josh Allen good this year?",
     "Who led the NFL in passing yards in 2013?", "How did the 2007 Patriots do?"],
    ["What's a two-point conversion?", "How are the Eagles doing this season?", "Who leads the NFL in receiving?",
     "Who won the Super Bowl after the 2019 season?", "What does a safety mean?"],
]  # fmt: skip
HISTORY_CHAT = [
    "Who is the Bills' quarterback?",
    "How many passing yards does he have?",
    "And rushing yards?",
    "What about the Patriots' quarterback?",
    "Who has more touchdowns between them?",
    "Who leads the game in rushing?",
    "How many carries does he have?",
    "What about the other team's top rusher?",
    "Who has the most receiving yards?",
    "How many catches is that?",
    "What's the score?",
    "Who has more first downs?",
    "Any turnovers so far?",
    "Who forced them?",
    "What happened on the last scoring play?",
    "Who is the leading passer now?",
]

# ---------------------------------------------------------------- monthly model (assumptions, stated in the report)

ASSUMPTIONS = {
    "games_watched_per_user_per_month": 8,  # about two games a week during the season
    "ask_ai_questions_per_game": 5,
    "why_explanations_per_game": 2,
    "assistant_questions_per_user_per_month": 10,
    "preview_generations_per_month": 14 * 4 * 2,  # 14 games/week, 4 weeks, written twice a week (restarts)
}


@dataclass
class KindStats:
    kind: str
    requests: int  # user-facing requests
    model_calls: int
    cache_hits: int
    avg_input: float
    avg_cached_input: float
    avg_output: float
    avg_model_requests: float
    avg_cost_per_call: float
    p50_latency_ms: float
    total_cost: float


def stats_for(kind: str, records: list[AuditRecord]) -> KindStats:
    rs = [r for r in records if r.kind == kind]
    calls = [r for r in rs if r.status == "ok"]
    hits = [r for r in rs if r.status == "cached"]

    def avg(f: str) -> float:
        return round(statistics.fmean(getattr(r, f) for r in calls), 1) if calls else 0.0

    costs = [r.estimated_cost_usd or 0.0 for r in calls]
    return KindStats(
        kind=kind,
        requests=len(calls) + len(hits),
        model_calls=len(calls),
        cache_hits=len(hits),
        avg_input=avg("input_tokens"),
        avg_cached_input=avg("cached_input_tokens"),
        avg_output=avg("output_tokens"),
        avg_model_requests=avg("requests"),
        avg_cost_per_call=round(statistics.fmean(costs), 6) if costs else 0.0,
        p50_latency_ms=round(statistics.median(r.latency_ms for r in calls), 0) if calls else 0.0,
        total_cost=round(sum(costs), 6),
    )


def service(settings: Settings) -> AIService:
    return AIService(
        settings,
        model_factory=build_model,
        audit=AuditLog(settings),
        spend=SpendTracker(settings.ai_daily_budget_usd),
        limiter=RateLimiter(10_000),
    )


async def simulate(svc: AIService) -> None:
    catalog = get_catalog()
    slates = get_slates()
    season = season_for(2025, 5)
    assert season is not None
    history = get_history_stats()
    slate = slates[(2025, 5)]

    # Pregame previews: written once per game at startup, then opened by every fan.
    for item in slate.games:
        sg = item.game
        await svc.preview(
            game=sg, matchup=season.matchup(sg.info.home.abbr, sg.info.away.abbr), client="startup", rate_limited=False
        )
    for fan in range(3):
        for gid in GAMES:
            pg = catalog.get(gid)
            assert pg is not None
            await svc.preview(game=pg, matchup=season.matchup(pg.info.home.abbr, pg.info.away.abbr), client=f"fan{fan}")

    # Inside games: common questions at the same three moments, a chat each, and "Why?" on key plays.
    for gid in GAMES:
        found = catalog.get(gid)
        assert found is not None
        g = found
        cursors = [len(g.events) // 4, len(g.events) // 2, (3 * len(g.events)) // 4]
        for fan in range(3):
            for c in cursors:
                await svc.ask(game=g, cursor=c, question=COMMON[fan % len(COMMON)], session_id=f"{gid}-fan{fan}")
            chat = Conversation()
            for q in CHAT:
                await svc.ask(game=g, cursor=cursors[1], question=q, session_id=f"{gid}-chat{fan}", conversation=chat)
            view = ReplayView.at(g, cursors[2])
            for ins in detect_insights(view)[:2]:
                await svc.explain(
                    game=g,
                    sequence=ins.play_sequence,
                    kind=ins.kind,
                    headline=ins.headline,
                    facts=", ".join(f"{k}: {v}" for k, v in ins.facts.items() if v is not None),
                )

    # Ask Sideline (general assistant), no week scoreboard.
    for fan, questions in enumerate(ASSISTANT_FANS):
        asked: list[str] = []
        for q in questions:
            try:
                await svc.assist(
                    question=q,
                    previous_questions=asked,
                    season=season,
                    history=history,
                    scoreboard=None,
                    scoreboard_as_of=None,
                    unrevealed_finals=[],
                    client=f"fan{fan}",
                )
            except AIError as exc:
                print(f"assistant {q!r}: {exc.code}")
            asked.append(q)


async def history_window(settings: Settings) -> dict[str, Any]:
    """Same 8-turn chat with the default window vs an unlimited one: input tokens per turn + answers."""
    g = get_catalog().get("2025_05_NE_BUF")
    assert g is not None
    cursor = len(g.events) // 2
    out: dict[str, Any] = {}
    for label, turns, chars in (("window_6_turns", 6, 3000), ("unlimited", 50, 100_000)):
        svc = service(settings.model_copy(update={"ai_history_turns": turns, "ai_history_max_chars": chars}))
        chat = Conversation()
        per_turn = []
        for q in HISTORY_CHAT:
            res = await svc.ask(game=g, cursor=cursor, question=q, session_id=f"window-{label}", conversation=chat)
            per_turn.append({"question": q, "input_tokens": res.usage.input_tokens, "answer": res.answer.answer[:240]})
        out[label] = {
            "per_turn": per_turn,
            "total_input": sum(t["input_tokens"] for t in per_turn),
            "cost": sum(r.estimated_cost_usd or 0 for r in svc.audit.recent(100) if r.status == "ok"),
        }
    return out


IN_PRICE, OUT_PRICE = 0.20 / 1e6, 0.50 / 1e6


def cost_cuts(records: list[AuditRecord]) -> dict[str, Any]:
    """What the session would have cost without prompt caching (cached input billed at the full input price)
    and without Sideline's shared answer caches (every cache hit = another model call at that kind's average)."""
    calls = [r for r in records if r.status == "ok"]
    actual = sum(r.estimated_cost_usd or 0 for r in calls)
    no_prompt_cache = sum(r.input_tokens * IN_PRICE + r.output_tokens * OUT_PRICE for r in calls)
    by_kind: dict[str, list[float]] = {}
    for r in calls:
        by_kind.setdefault(r.kind, []).append(r.input_tokens * IN_PRICE + r.output_tokens * OUT_PRICE)
    hits = [r for r in records if r.status == "cached"]
    extra_calls = sum(statistics.fmean(by_kind[r.kind]) for r in hits if r.kind in by_kind)
    no_caches_at_all = no_prompt_cache + extra_calls
    return {
        "actual_session_cost": round(actual, 6),
        "without_prompt_caching": round(no_prompt_cache, 6),
        "without_prompt_caching_or_answer_caches": round(no_caches_at_all, 6),
        "answer_cache_hits": len(hits),
        "savings_pct_vs_no_caching": round(100 * (1 - actual / no_caches_at_all), 1) if no_caches_at_all else 0.0,
        "cached_input_share_pct": round(
            100 * sum(r.cached_input_tokens for r in calls) / max(1, sum(r.input_tokens for r in calls)), 1
        ),
    }


def project(stats: dict[str, KindStats]) -> dict[str, Any]:
    a = ASSUMPTIONS

    def effective(kind: str) -> float:
        """Average cost per user-facing request, counting cache hits as free (measured hit rate)."""
        s = stats[kind]
        return s.avg_cost_per_call * (s.model_calls / s.requests) if s.requests else 0.0

    per_user = (
        a["games_watched_per_user_per_month"] * a["ask_ai_questions_per_game"] * effective("ask")
        + a["games_watched_per_user_per_month"] * a["why_explanations_per_game"] * effective("insight")
        + a["assistant_questions_per_user_per_month"] * effective("assistant")
    )
    fixed = a["preview_generations_per_month"] * stats["preview"].avg_cost_per_call
    return {
        "effective_cost_per_request": {k: round(effective(k), 6) for k in ("ask", "insight", "assistant")},
        "ai_cost_per_user_per_month": round(per_user, 5),
        "shared_preview_cost_per_month": round(fixed, 4),
        "ai_cost_per_month": {
            "100_users": round(100 * per_user + fixed, 2),
            "10000_users": round(10_000 * per_user + fixed, 2),
        },
    }


def main() -> int:
    settings = Settings.from_env().model_copy(update={"ai_audit_log_path": None, "ai_daily_budget_usd": 5.0})
    if not settings.ai_configured:
        print("Needs PORTKEY_API_KEY (repo-root .env).")
        return 2
    svc = service(settings)

    async def run_all() -> dict[str, Any]:
        await simulate(svc)
        return await history_window(settings)

    window = asyncio.run(run_all())
    records = svc.audit.recent(10_000)
    kinds = {k: stats_for(k, records) for k in ("ask", "insight", "preview", "assistant")}
    cuts = cost_cuts(records)
    report = {
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "model": settings.ai_model,
        "prices_usd_per_mtok": {"input": 0.20, "output": 0.50, "note": "bundled genai-prices for gpt-6-luna"},
        "by_kind": {k: v.__dict__ for k, v in kinds.items()},
        "session_total_cost": round(sum(v.total_cost for v in kinds.values()), 6),
        "assumptions": ASSUMPTIONS,
        "projection": project(kinds),
        "history_window_experiment": window,
        "cost_cuts": cuts,
    }
    REPORT_DIR.mkdir(exist_ok=True)
    path = REPORT_DIR / f"tokenomics-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S')}.json"
    path.write_text(json.dumps(report, indent=2))

    print("| Agent | Requests | Model calls | Cache hits | Avg input | Avg cached input | Avg output | Avg cost/call |")
    print("|---|---|---|---|---|---|---|---|")
    for v in kinds.values():
        print(
            f"| {v.kind} | {v.requests} | {v.model_calls} | {v.cache_hits} | {v.avg_input:,.0f} | "
            f"{v.avg_cached_input:,.0f} | {v.avg_output:,.0f} | ${v.avg_cost_per_call:.6f} |"
        )
    p: dict[str, Any] = project(kinds)
    print(f"\nSession total: ${report['session_total_cost']}")
    monthly = p["ai_cost_per_month"]
    print(
        f"Per user per month: ${p['ai_cost_per_user_per_month']} "
        f"(+ shared previews ${p['shared_preview_cost_per_month']})"
    )
    print(f"100 users: ${monthly['100_users']} / month · 10,000 users: ${monthly['10000_users']} / month")
    c = cuts
    print(
        f"Cost cuts: actual ${c['actual_session_cost']} vs ${c['without_prompt_caching']} without prompt caching vs "
        f"${c['without_prompt_caching_or_answer_caches']} with no caching at all "
        f"({c['savings_pct_vs_no_caching']}% saved; {c['cached_input_share_pct']}% of input tokens cached)"
    )
    w = window
    print(
        f"History window: {w['window_6_turns']['total_input']:,} input tokens (6-turn window) vs "
        f"{w['unlimited']['total_input']:,} (unlimited) over {len(HISTORY_CHAT)} turns"
    )
    print(f"\nreport: {path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
