"""Deterministic insight detection over revealed plays.

Rules decide *what* is noteworthy (no AI involved); the agent only writes a short
explanation, cached per (game, play, state version) and shared across sessions.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.agents.view import ReplayView
from app.replay.models import GameStatus, PlayEvent, PlayKind, ScoreType, TurnoverType

InsightKind = Literal[
    "touchdown",
    "field_goal",
    "safety",
    "lead_change",
    "tie",
    "turnover",
    "big_play",
    "fourth_down",
    "missed_kick",
    "halftime",
    "end_of_regulation",
    "final",
]

IMPORTANCE: dict[str, int] = {
    "final": 6,
    "lead_change": 5,
    "end_of_regulation": 5,
    "turnover": 4,
    "touchdown": 4,
    "tie": 4,
    "safety": 4,
    "fourth_down": 3,
    "missed_kick": 3,
    "big_play": 3,
    "halftime": 2,
    "field_goal": 2,
}

BIG_PLAY_YARDS = 25

ExplanationStatus = Literal[
    "generated", "cached", "pending", "not_configured", "budget_exceeded", "rate_limited", "blocked", "error"
]


class Insight(BaseModel):
    id: str
    kind: InsightKind
    play_sequence: int
    period: str
    clock: str | None
    team: str | None
    headline: str
    facts: dict[str, str | int | None]
    importance: int
    explanation: str | None = None
    explanation_status: ExplanationStatus = "pending"


def _period(q: int) -> str:
    return f"Q{q}" if q <= 4 else "OT"


def _clock(sec: int | None) -> str | None:
    return None if sec is None else f"{sec // 60}:{sec % 60:02d}"


def _player(e: PlayEvent) -> str | None:
    p = e.players
    return p.rusher or p.receiver or p.passer or p.kicker or p.interceptor


def detect_insights(view: ReplayView) -> list[Insight]:
    """All insights among revealed plays, oldest first."""
    away, home, gid = view.away, view.home, view.info.game_id
    a = h = 0
    out: list[Insight] = []

    def add(e: PlayEvent, kind: InsightKind, headline: str, team: str | None, **facts: str | int | None) -> None:
        out.append(
            Insight(
                id=f"{gid}:{e.sequence}:{kind}",
                kind=kind,
                play_sequence=e.sequence,
                period=_period(e.quarter),
                clock=_clock(e.clock_seconds),
                team=team,
                headline=headline,
                facts={"score": f"{away} {a} - {home} {h}", **facts},
                importance=IMPORTANCE[kind],
            )
        )

    for e in view.events:
        before_leader = away if a > h else home if h > a else None
        for sc in e.scoring:
            if sc.team == away:
                a += sc.points
            elif sc.team == home:
                h += sc.points
        after_leader = away if a > h else home if h > a else None
        who = _player(e)

        for sc in e.scoring:
            if sc.type is ScoreType.TOUCHDOWN:
                yards = e.yards_gained
                detail = f"{who} {yards}-yd " if who and yards is not None else ""
                add(
                    e,
                    "touchdown",
                    f"{sc.team} touchdown{': ' + detail.strip() if detail else ''}",
                    sc.team,
                    player=who,
                    yards=yards,
                )
            elif sc.type is ScoreType.FIELD_GOAL:
                dist = e.stats.kick_distance
                add(
                    e,
                    "field_goal",
                    f"{sc.team} field goal{f' from {dist} yards' if dist else ''}",
                    sc.team,
                    kicker=e.players.kicker,
                    distance=dist,
                )
            elif sc.type is ScoreType.SAFETY:
                add(e, "safety", f"Safety for {sc.team}", sc.team)
        if e.scoring and after_leader and before_leader and after_leader != before_leader:
            add(e, "lead_change", f"Lead change: {after_leader} goes ahead", after_leader)
        elif e.scoring and after_leader is None and (a or h) and before_leader is not None:
            add(e, "tie", f"Tied at {a}", None)

        if e.turnover:
            label = {
                TurnoverType.INTERCEPTION: "Interception",
                TurnoverType.FUMBLE: "Fumble lost",
                TurnoverType.DOWNS: "Turnover on downs",
            }[e.turnover.type]
            add(
                e,
                "turnover",
                f"{label}: {e.turnover.gained_by or 'defense'} takes over",
                e.turnover.gained_by,
                lost_by=e.turnover.lost_by,
                player=e.players.interceptor,
            )
        elif e.before.down == 4 and e.kind in (PlayKind.PASS, PlayKind.RUN) and not (e.penalty and e.penalty.no_play):
            converted = bool(e.stats.first_down) or any(sc.type is ScoreType.TOUCHDOWN for sc in e.scoring)
            add(
                e,
                "fourth_down",
                f"{e.offense} {'converts' if converted else 'stopped'} on 4th and {e.before.distance}",
                e.offense,
                converted=str(converted).lower(),
            )

        if (
            e.kind in (PlayKind.PASS, PlayKind.RUN)
            and (e.yards_gained or 0) >= BIG_PLAY_YARDS
            and not (e.penalty and e.penalty.no_play)
            and not e.scoring
        ):
            add(
                e,
                "big_play",
                f"{e.yards_gained}-yard {'pass' if e.kind is PlayKind.PASS else 'run'} for {e.offense}",
                e.offense,
                player=who,
                yards=e.yards_gained,
            )

        if (
            e.kind in (PlayKind.FIELD_GOAL, PlayKind.EXTRA_POINT)
            and not e.scoring
            and not (e.penalty and e.penalty.no_play)
        ):
            what = "Field goal" if e.kind is PlayKind.FIELD_GOAL else "Extra point"
            add(
                e,
                "missed_kick",
                f"{what} no good for {e.offense}",
                e.offense,
                kicker=e.players.kicker,
                distance=e.stats.kick_distance,
            )

        if e.kind is PlayKind.END_QUARTER and e.quarter == 2:
            add(e, "halftime", f"Halftime: {away} {a}, {home} {h}", None)
        elif e.kind is PlayKind.END_QUARTER and e.quarter == 4 and a == h:
            add(e, "end_of_regulation", f"Tied {a}-{h} after regulation: overtime", None)
        elif e.kind is PlayKind.END_GAME and view.state.status is GameStatus.FINAL:
            winner = away if a > h else home if h > a else None
            add(e, "final", f"Final: {away} {a}, {home} {h}", winner)
    return out


def latest_insights(view: ReplayView, *, limit: int = 8) -> list[Insight]:
    """Newest first, so the feed reads like a live ticker."""
    return list(reversed(detect_insights(view)))[:limit]
