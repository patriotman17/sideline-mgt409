"""Prediction models and the points table (documented in README/AGENTS)."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class PredictionType(StrEnum):
    NEXT_PLAY_GAIN_5 = "next_play_gain_5"
    FOURTH_DOWN_CONVERSION = "fourth_down_conversion"
    DRIVE_TOUCHDOWN = "drive_touchdown"
    NEXT_SCORE = "next_score"


#: Points for a correct answer. Incorrect and void answers earn 0.
POINTS: dict[PredictionType, int] = {
    PredictionType.NEXT_PLAY_GAIN_5: 10,
    PredictionType.NEXT_SCORE: 15,
    PredictionType.DRIVE_TOUCHDOWN: 20,
    PredictionType.FOURTH_DOWN_CONVERSION: 25,
}


class PredictionStatus(StrEnum):
    OPEN = "open"  # accepting answers
    LOCKED = "locked"  # next snap revealed; waiting for the outcome
    RESOLVED = "resolved"
    VOID = "void"  # couldn't be fairly scored (e.g. play wiped out by penalty)


class Option(BaseModel):
    id: str
    label: str


class Prediction(BaseModel):
    """One opportunity in one session. ``id`` is deterministic per game/type/position."""

    id: str
    type: PredictionType
    question: str
    options: list[Option]
    points: int
    window: str = Field(description="What resolves it, in plain words")
    team: str | None = Field(default=None, description="Offense / drive team the question is about")
    status: PredictionStatus = PredictionStatus.OPEN
    #: Replay positions (play cursors) — the server's clock for this lifecycle.
    opened_cursor: int
    locked_cursor: int | None = None
    resolved_cursor: int | None = None
    correct_option_id: str | None = None
    void_reason: str | None = None
    resolution_summary: str | None = None
    #: Situation at opening (for display); derived from revealed state only.
    situation: str
    #: Next-score window: closes at the end of this quarter (2 = half, 4 = regulation; None = game).
    window_end_quarter: int | None = None
    #: Deterministic ranking score and the reasons it was featured (e.g. "Red zone", "Late game").
    importance: int = 0
    tags: list[str] = Field(default_factory=list)


class Answer(BaseModel):
    prediction_id: str
    option_id: str
    answered_cursor: int
    answered_at: str = Field(description="Server UTC timestamp")


Outcome = Literal["correct", "incorrect", "void", "pending", "unanswered"]


class PredictionStats(BaseModel):
    scoring_mode: Literal["demo"] = "demo"
    points: int = 0
    answered: int = 0
    correct: int = 0
    incorrect: int = 0
    void: int = 0
    pending: int = 0
    accuracy: float | None = Field(default=None, description="correct / (correct + incorrect)")
    current_streak: int = 0
    longest_streak: int = 0
