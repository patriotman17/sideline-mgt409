"""Deterministic prediction rules.

Detectors receive only a ``Revealed`` snapshot (state after the revealed plays + the
last revealed snap) — they cannot see unrevealed events. Resolvers receive exactly
one newly revealed event at a time. No AI is involved anywhere in this module.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.predictions.models import POINTS, Option, Prediction, PredictionType
from app.replay.models import GameInfo, GameState, GameStatus, PlayEvent, PlayKind, ScoreType

#: Events that are not snaps: they never lock a prediction.
NON_SNAP = {PlayKind.GAME_START, PlayKind.TIMEOUT, PlayKind.END_QUARTER, PlayKind.END_GAME}
SCRIMMAGE = {PlayKind.PASS, PlayKind.RUN}
NEXT_PLAY_YARDS = 5
#: Late in a half the offense often kneels; skip next-play and drive questions then.
KNEEL_RISK_SECONDS = 60


def is_snap(e: PlayEvent) -> bool:
    return e.kind not in NON_SNAP


def nullified(e: PlayEvent) -> bool:
    return e.kind is PlayKind.PENALTY or bool(e.penalty and e.penalty.no_play)


@dataclass(frozen=True, slots=True)
class Revealed:
    """Everything a detector may look at: the replay *as revealed so far*."""

    info: GameInfo
    state: GameState
    last_snap: PlayEvent | None
    cursor: int


@dataclass(frozen=True, slots=True)
class Resolution:
    correct_option_id: str | None  # None = void
    summary: str
    void_reason: str | None = None


def _ordinal(n: int) -> str:
    return {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}.get(n, f"{n}th")


def _situation(s: GameState) -> str:
    spot = f" at {s.ball_on}" if s.ball_on else ""
    if s.down and s.distance is not None:
        return f"{s.possession} ball, {_ordinal(s.down)} & {s.distance}{spot}"
    return f"{s.possession} ball{spot}"


def _period(q: int) -> str:
    return f"Q{q}" if q <= 4 else "OT"


def _live(s: GameState) -> bool:
    return s.status in (GameStatus.IN_PROGRESS, GameStatus.END_OF_QUARTER) and s.possession is not None


def _kneel_risk(s: GameState) -> bool:
    return s.quarter in (2, 4) and s.clock_seconds is not None and s.clock_seconds <= KNEEL_RISK_SECONDS


def new_drive_started(r: Revealed) -> bool:
    """1st down for a team that just gained the ball (kickoff, punt, turnover, or change of offense)."""
    s, last = r.state, r.last_snap
    if last is None or s.possession is None or s.down != 1 or nullified(last):
        return False
    return (
        last.kind is PlayKind.KICKOFF
        or last.kind is PlayKind.PUNT
        or last.turnover is not None
        or (last.offense is not None and last.offense != s.possession)
    )


def _trailing_by(r: Revealed, team: str) -> int:
    s = r.state
    mine, theirs = (s.home_score, s.away_score) if team == r.info.home.abbr else (s.away_score, s.home_score)
    return theirs - mine


def _fourth_down_plausible(r: Revealed) -> bool:
    """Offer only when going for it is a realistic choice (avoids a stream of punt voids)."""
    s = r.state
    d = s.distance or 99
    deficit = _trailing_by(r, s.possession or "")
    return (
        d <= 3
        or (d <= 5 and s.yardline_100 is not None and s.yardline_100 <= 40)
        or (s.quarter >= 4 and 1 <= deficit <= 8 and (s.clock_seconds or 0) <= 300 and d <= 10)
    )


def _pid(r: Revealed, t: PredictionType) -> str:
    return f"{r.info.game_id}:{t.value}:{r.cursor}"


YES_NO = [Option(id="yes", label="Yes"), Option(id="no", label="No")]


def detect(r: Revealed, *, next_score_pending: bool) -> list[Prediction]:
    """Opportunities available right now, from the revealed snapshot only."""
    s = r.state
    if not _live(s):
        return []
    team = s.possession or ""
    out: list[Prediction] = []

    def make(
        t: PredictionType, question: str, options: list[Option], window: str, window_end: int | None = None
    ) -> Prediction:
        return Prediction(
            id=_pid(r, t),
            type=t,
            question=question,
            options=options,
            points=POINTS[t],
            window=window,
            team=team,
            opened_cursor=r.cursor,
            situation=f"{_period(s.quarter)} · {_situation(s)}",
            window_end_quarter=window_end,
        )

    if s.down == 3 and s.distance is not None and not _kneel_risk(s):
        out.append(
            make(
                PredictionType.NEXT_PLAY_GAIN_5,
                f"Will {team}'s next play gain {NEXT_PLAY_YARDS}+ yards?",
                YES_NO,
                "Next pass or run. Void if it's wiped out by a penalty or isn't a pass or run.",
            )
        )
    if s.down == 4 and s.distance is not None and _fourth_down_plausible(r):
        out.append(
            make(
                PredictionType.FOURTH_DOWN_CONVERSION,
                f"If {team} goes for it on 4th & {s.distance}, will they convert?",
                [Option(id="yes", label="Converts"), Option(id="no", label="Stopped")],
                "Next snap. Void if they punt, kick, kneel, or the play is wiped out by a penalty.",
            )
        )
    if new_drive_started(r):
        if not _kneel_risk(s):
            out.append(
                make(
                    PredictionType.DRIVE_TOUCHDOWN,
                    f"Will this {team} drive end in a touchdown?",
                    YES_NO,
                    "Ends on a score, punt, turnover, or the end of the half.",
                )
            )
        if not next_score_pending:
            away, home = r.info.away, r.info.home
            span = "before halftime" if s.quarter <= 2 else "in regulation" if s.quarter <= 4 else "in overtime"
            out.append(
                make(
                    PredictionType.NEXT_SCORE,
                    "Which team will score next?",
                    [
                        Option(id=away.abbr, label=away.name or away.abbr),
                        Option(id=home.abbr, label=home.name or home.abbr),
                        Option(id="none", label=f"No score {span}"),
                    ],
                    f"Next scoring play {span}.",
                    window_end=2 if s.quarter <= 2 else 4 if s.quarter <= 4 else None,
                )
            )
    return out


# ---------------------------------------------------------------- resolvers


def _yards_text(e: PlayEvent) -> str:
    who = e.players.rusher or e.players.receiver or e.players.passer
    what = "Sack" if e.stats.sack else "Pass" if e.kind is PlayKind.PASS else "Run"
    detail = " (intercepted)" if e.turnover and e.turnover.type.value == "interception" else ""
    return f"{what}{f' by {who}' if who and not e.stats.sack else ''} for {e.yards_gained} yards{detail}"


def _first_snap(e: PlayEvent, p: Prediction) -> Resolution | None:
    """Next-play and 4th-down questions resolve on the first snap after opening."""
    if not is_snap(e):
        return None
    if nullified(e):
        return Resolution(None, "Play wiped out by a penalty", void_reason="The play was wiped out by a penalty.")
    if e.kind not in SCRIMMAGE:
        label = e.kind.value.replace("_", " ")
        reason = (
            f"{p.team} didn't go for it ({label})."
            if p.type is PredictionType.FOURTH_DOWN_CONVERSION
            else (f"The next snap was a {label}, not a pass or run.")
        )
        return Resolution(None, reason, void_reason=reason)
    if e.yards_gained is None:
        return Resolution(
            None, "Yardage missing in the source", void_reason="The source data has no yardage for this play."
        )
    if p.type is PredictionType.NEXT_PLAY_GAIN_5:
        return Resolution("yes" if e.yards_gained >= NEXT_PLAY_YARDS else "no", _yards_text(e))
    td = any(sc.type is ScoreType.TOUCHDOWN and sc.team == e.offense for sc in e.scoring)
    converted = bool(e.stats.first_down) or td
    return Resolution("yes" if converted else "no", f"{'Converted' if converted else 'Stopped'}: {_yards_text(e)}")


def _drive(e: PlayEvent, p: Prediction) -> Resolution | None:
    team = p.team
    for sc in e.scoring:
        if sc.type is ScoreType.TOUCHDOWN and sc.team == team:
            return Resolution("yes", f"{team} touchdown")
        if sc.type is ScoreType.FIELD_GOAL and sc.team == team:
            return Resolution("no", f"{team} settled for a field goal")
        if sc.team != team:
            return Resolution("no", f"{sc.team} scored ({sc.type.value.replace('_', ' ')})")
    if nullified(e):
        return None
    if e.turnover and e.turnover.lost_by == team:
        return Resolution("no", f"Turnover ({e.turnover.type.value})")
    if e.kind is PlayKind.PUNT and e.offense == team:
        return Resolution("no", f"{team} punted")
    if e.kind is PlayKind.FIELD_GOAL and e.offense == team:
        return Resolution("no", "Missed field goal")
    if e.kind is PlayKind.END_QUARTER and e.quarter in (2, 4):
        return Resolution("no", "Half ended" if e.quarter == 2 else "Regulation ended")
    if e.kind is PlayKind.END_GAME:
        return Resolution("no", "Game ended")
    return None


def _next_score(e: PlayEvent, p: Prediction) -> Resolution | None:
    if e.scoring:
        sc = e.scoring[0]
        return Resolution(sc.team, f"{sc.team} {sc.type.value.replace('_', ' ')}")
    end = p.window_end_quarter
    if (e.kind is PlayKind.END_QUARTER and end is not None and e.quarter == end) or e.kind is PlayKind.END_GAME:
        return Resolution("none", "No more points in the window")
    return None


RESOLVERS = {
    PredictionType.NEXT_PLAY_GAIN_5: _first_snap,
    PredictionType.FOURTH_DOWN_CONVERSION: _first_snap,
    PredictionType.DRIVE_TOUCHDOWN: _drive,
    PredictionType.NEXT_SCORE: _next_score,
}


def resolve(p: Prediction, e: PlayEvent) -> Resolution | None:
    """Outcome decided by the newly revealed event ``e``, or None if still undecided."""
    return RESOLVERS[p.type](e, p)
