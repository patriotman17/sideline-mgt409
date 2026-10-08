"""Normalized replay models.

Every field that the source may omit is ``Optional``: missing or ambiguous
play-by-play values stay ``None`` rather than being invented.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class Team(Frozen):
    abbr: str
    city: str | None = None
    name: str | None = None
    conference: str | None = None


class PlayKind(StrEnum):
    GAME_START = "game_start"
    KICKOFF = "kickoff"
    PASS = "pass"
    RUN = "run"
    PUNT = "punt"
    FIELD_GOAL = "field_goal"
    EXTRA_POINT = "extra_point"
    TWO_POINT = "two_point"
    KNEEL = "kneel"
    SPIKE = "spike"
    PENALTY = "penalty"
    TIMEOUT = "timeout"
    END_QUARTER = "end_quarter"
    END_GAME = "end_game"
    OTHER = "other"


class ScoreType(StrEnum):
    TOUCHDOWN = "touchdown"
    FIELD_GOAL = "field_goal"
    EXTRA_POINT = "extra_point"
    TWO_POINT = "two_point"
    SAFETY = "safety"
    DEFENSIVE_CONVERSION = "defensive_conversion"


POINTS: dict[ScoreType, int] = {
    ScoreType.TOUCHDOWN: 6,
    ScoreType.FIELD_GOAL: 3,
    ScoreType.EXTRA_POINT: 1,
    ScoreType.TWO_POINT: 2,
    ScoreType.SAFETY: 2,
    ScoreType.DEFENSIVE_CONVERSION: 2,
}


class Scoring(Frozen):
    type: ScoreType
    team: str
    points: int


class TurnoverType(StrEnum):
    INTERCEPTION = "interception"
    FUMBLE = "fumble"
    DOWNS = "downs"


class Turnover(Frozen):
    type: TurnoverType
    lost_by: str | None = None
    gained_by: str | None = None


class Penalty(Frozen):
    team: str | None = None
    type: str | None = None
    yards: int | None = None
    #: True when the play itself was nullified (nflverse ``play_type == "no_play"``).
    no_play: bool = False


class Situation(Frozen):
    """Ball state at a snap. Any part can be unknown (e.g. PATs have no down)."""

    possession: str | None = None
    down: int | None = None
    distance: int | None = None
    #: Yards from the opponent's end zone for the team in possession.
    yardline_100: int | None = None
    #: Human-readable spot, e.g. "KC 38".
    ball_on: str | None = None


class PlayEvent(Frozen):
    """One normalized play-by-play row.

    ``after`` / ``clock_after_seconds`` / ``*_timeouts_after`` describe the
    situation immediately after this play (the next snap's pre-snap state).
    They never contain the outcome of any later play.
    """

    sequence: int
    source_play_id: int | None = None
    kind: PlayKind
    quarter: int
    clock_seconds: int | None = None
    offense: str | None = None
    defense: str | None = None
    before: Situation = Situation()
    yards_gained: int | None = None
    description: str = ""
    scoring: tuple[Scoring, ...] = ()
    turnover: Turnover | None = None
    penalty: Penalty | None = None
    timeout_team: str | None = None

    after: Situation = Situation()
    clock_after_seconds: int | None = None
    home_timeouts_after: int | None = None
    away_timeouts_after: int | None = None
    home_win_probability_after: float | None = None

    #: Source score after the play; used only to validate the engine.
    source_home_score_after: int | None = None
    source_away_score_after: int | None = None


class Provenance(Frozen):
    source: str
    source_url: str | None = None
    source_sha256: str | None = None
    retrieved_at: str | None = None
    license: str | None = None
    attribution: str | None = None
    is_test_fixture: bool = False


class GameInfo(Frozen):
    game_id: str
    title: str
    season: int | None = None
    season_type: str | None = None
    week: int | None = None
    game_date: str | None = None
    home: Team
    away: Team
    venue: str | None = None
    roof: str | None = None
    #: nflverse closing spread: positive means the home team was favored.
    spread_line: float | None = None
    total_line: float | None = None


class Game(Frozen):
    """A fully ingested historical game. Lives server-side only: the final score
    and later events must never be sent to a client ahead of the replay cursor."""

    info: GameInfo
    events: tuple[PlayEvent, ...]
    final_home_score: int | None = None
    final_away_score: int | None = None
    provenance: Provenance
    warnings: tuple[str, ...] = ()


class GameStatus(StrEnum):
    PREGAME = "pregame"
    IN_PROGRESS = "in_progress"
    END_OF_QUARTER = "end_of_quarter"
    HALFTIME = "halftime"
    END_OF_REGULATION = "end_of_regulation"
    FINAL = "final"


class GameState(Frozen):
    """Scoreboard state after the first ``plays_revealed`` events — nothing later."""

    game_id: str
    status: GameStatus = GameStatus.PREGAME
    quarter: int = 1
    clock_seconds: int | None = 900
    home_score: int = 0
    away_score: int = 0
    #: Points per period, index 0 = Q1 (index 4+ = overtime).
    home_linescore: tuple[int, ...] = ()
    away_linescore: tuple[int, ...] = ()
    possession: str | None = None
    down: int | None = None
    distance: int | None = None
    yardline_100: int | None = None
    ball_on: str | None = None
    home_timeouts: int | None = 3
    away_timeouts: int | None = 3
    home_win_probability: float | None = None
    plays_revealed: int = 0
    last_play: PlayEvent | None = None
    recent_plays: tuple[PlayEvent, ...] = Field(default=(), description="Most recent first")
