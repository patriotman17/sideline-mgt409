"""Opportunity ranking and pacing — one place to tune how often predictions appear.

Everything here is a pure function of the *revealed* state, so ranking stays
deterministic and can never look at future plays.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.predictions.models import PredictionType


@dataclass(frozen=True)
class PredictionConfig:
    #: A candidate must score at least this to become a featured question.
    min_score: int = 60
    #: Candidates at or above this are "critical" (late/close, 4th & short, goal line).
    critical_score: int = 85
    #: Snaps that must pass after a question opens before another can open...
    cooldown_snaps: int = 10
    #: ...or fewer for critical moments.
    critical_cooldown_snaps: int = 4
    #: Snaps before the same question type can be featured again (applies to critical moments too).
    type_cooldown_snaps: int = 15
    #: Non-critical questions allowed per quarter (OT counts as its own quarter).
    max_per_quarter: int = 2
    #: Extra seconds (at 1x) the next snap waits after a question opens: a "pick window".
    pick_window_seconds: float = 8.0
    #: Big moments (importance >= critical_score) hold the game this many REAL seconds (not scaled by
    #: speed): long enough to read the situation and answer, at 1x or 300x. Answering ends it early.
    big_moment_hold_seconds: float = 12.0
    base: dict[PredictionType, int] = field(
        default_factory=lambda: {
            PredictionType.FOURTH_DOWN_CONVERSION: 55,
            PredictionType.DRIVE_TOUCHDOWN: 30,
            PredictionType.NEXT_SCORE: 25,
            PredictionType.NEXT_PLAY_GAIN_5: 20,
        }
    )


DEFAULT_CONFIG = PredictionConfig()
