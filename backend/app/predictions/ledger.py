"""Per-session prediction ledger: lifecycle, answers, and stats.

The ledger only moves *forward*: ``observe`` must be called once per newly revealed
event, in order. The session tracks a high-water mark (furthest play ever revealed),
so restarting/rewinding never re-opens a question or creates new ones until the
replay passes that mark — outcomes already seen can't be farmed.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel

from app.predictions.config import DEFAULT_CONFIG, PredictionConfig
from app.predictions.models import Answer, Outcome, Prediction, PredictionStats, PredictionStatus, PredictionType
from app.predictions.rules import Revealed, detect, is_snap, rank, resolve
from app.replay.models import GameInfo, GameState, PlayEvent


class PredictionError(Exception):
    """Client-safe rejection. ``code`` maps to an HTTP status in the API layer."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class PredictionLedger:
    def __init__(self, info: GameInfo, config: PredictionConfig = DEFAULT_CONFIG):
        self.info = info
        self.config = config
        self._predictions: dict[str, Prediction] = {}
        self._answers: dict[str, Answer] = {}
        self._resolution_order: list[str] = []
        self.high_water = 0
        #: Questions opened before this play are hidden (the viewer joined mid-game and never saw them).
        self.visible_from = 0
        self._last_snap: PlayEvent | None = None
        #: Pacing state — all derived from plays already revealed, so ranking stays deterministic.
        self._snaps = 0
        self._last_featured_snap: int | None = None
        self._per_quarter: dict[int, int] = {}
        self._last_snap_by_type: dict[PredictionType, int] = {}

    # ------------------------------------------------------------ forward processing

    def observe(self, event: PlayEvent, state_after: GameState, cursor_after: int) -> list[Prediction]:
        """Apply one newly revealed event: lock/resolve pending questions, then detect new ones."""
        if cursor_after != self.high_water + 1:
            raise ValueError(f"events must be observed in order (expected {self.high_water + 1}, got {cursor_after})")
        for p in list(self._predictions.values()):
            if p.status not in (PredictionStatus.OPEN, PredictionStatus.LOCKED):
                continue
            outcome = resolve(p, event)
            if p.status is PredictionStatus.OPEN and (is_snap(event) or outcome is not None):
                p.status, p.locked_cursor = PredictionStatus.LOCKED, cursor_after
            if outcome is not None:
                p.resolved_cursor = cursor_after
                p.resolution_summary = outcome.summary
                if outcome.correct_option_id is None:
                    p.status, p.void_reason = PredictionStatus.VOID, outcome.void_reason
                else:
                    p.status, p.correct_option_id = PredictionStatus.RESOLVED, outcome.correct_option_id
                self._resolution_order.append(p.id)
        if is_snap(event):
            self._last_snap = event
            self._snaps += 1
        self.high_water = cursor_after

        pending_next_score = any(
            p.type is PredictionType.NEXT_SCORE and p.status in (PredictionStatus.OPEN, PredictionStatus.LOCKED)
            for p in self._predictions.values()
        )
        # One question at a time: a timeout or quarter break doesn't change the situation, so it
        # must not stack a second question on one that's still open.
        if any(p.status is PredictionStatus.OPEN for p in self._predictions.values()):
            return []
        revealed = Revealed(info=self.info, state=state_after, last_snap=self._last_snap, cursor=cursor_after)
        best = self._feature(revealed, detect(revealed, next_score_pending=pending_next_score))
        if best is None:
            return []
        self._predictions[best.id] = best
        self._last_featured_snap = self._snaps
        self._last_snap_by_type[best.type] = self._snaps
        self._per_quarter[state_after.quarter] = self._per_quarter.get(state_after.quarter, 0) + 1
        return [best]

    def _feature(self, r: Revealed, candidates: list[Prediction]) -> Prediction | None:
        """Pick at most one featured question: the highest-ranked candidate that clears the bar,
        the cooldown since the last question, and the per-quarter cap (critical moments get a
        shorter cooldown and ignore the cap). Ties keep detector order, so it's deterministic."""
        cfg = self.config
        ranked = [rank(p, r, cfg) for p in candidates if p.id not in self._predictions]
        ranked = [
            p
            for p in ranked
            if p.importance >= cfg.min_score
            and self._snaps - self._last_snap_by_type.get(p.type, -cfg.type_cooldown_snaps) >= cfg.type_cooldown_snaps
        ]
        if not ranked:
            return None
        best = max(ranked, key=lambda p: p.importance)  # max() keeps the first of equal scores
        critical = best.importance >= cfg.critical_score
        if self._last_featured_snap is not None:
            since = self._snaps - self._last_featured_snap
            if since < (cfg.critical_cooldown_snaps if critical else cfg.cooldown_snaps):
                return None
        if not critical and self._per_quarter.get(r.state.quarter, 0) >= cfg.max_per_quarter:
            return None
        return best

    # ------------------------------------------------------------ answers

    def answer(self, prediction_id: str, option_id: str, cursor: int) -> tuple[Answer, bool]:
        """Record the (final) answer. Returns (answer, created). Same option again is idempotent."""
        p = self._predictions.get(prediction_id)
        if p is None or p.opened_cursor > cursor:
            raise PredictionError("not_found", "That prediction isn't available at this point in the replay.")
        existing = self._answers.get(prediction_id)
        if existing is not None:
            if existing.option_id == option_id:
                return existing, False
            raise PredictionError("already_answered", "You've already locked in an answer for this prediction.")
        if p.status is not PredictionStatus.OPEN:
            raise PredictionError("locked", "This prediction is locked — the play has already started.")
        if option_id not in {o.id for o in p.options}:
            raise PredictionError("invalid_option", "That isn't one of the answer choices.")
        a = Answer(
            prediction_id=prediction_id,
            option_id=option_id,
            answered_cursor=cursor,
            answered_at=datetime.now(UTC).isoformat(timespec="milliseconds"),
        )
        self._answers[prediction_id] = a
        return a, True

    def unanswered_open(self, cursor: int) -> list[Prediction]:
        return [
            p
            for p in self._predictions.values()
            if p.status is PredictionStatus.OPEN and p.opened_cursor <= cursor and p.id not in self._answers
        ]

    # ------------------------------------------------------------ reads

    def outcome(self, p: Prediction) -> Outcome:
        a = self._answers.get(p.id)
        if p.status is PredictionStatus.VOID:
            return "void" if a else "unanswered"
        if a is None:
            return "unanswered"
        if p.status is PredictionStatus.RESOLVED:
            return "correct" if a.option_id == p.correct_option_id else "incorrect"
        return "pending"

    def points_for(self, p: Prediction) -> int:
        return p.points if self.outcome(p) == "correct" else 0

    def get(self, prediction_id: str) -> Prediction | None:
        return self._predictions.get(prediction_id)

    def answer_for(self, prediction_id: str) -> Answer | None:
        return self._answers.get(prediction_id)

    def all(self) -> list[Prediction]:
        return list(self._predictions.values())

    def stats(self) -> PredictionStats:
        s = PredictionStats()
        streak = 0
        for pid in self._resolution_order:
            p = self._predictions[pid]
            o = self.outcome(p)
            if o == "correct":
                s.correct += 1
                s.points += p.points
                streak += 1
                s.longest_streak = max(s.longest_streak, streak)
            elif o == "incorrect":
                s.incorrect += 1
                streak = 0
            elif o == "void":
                s.void += 1  # voids neither extend nor break a streak
        s.current_streak = streak
        s.answered = len(self._answers)
        s.pending = sum(1 for pid in self._answers if self.outcome(self._predictions[pid]) == "pending")
        graded = s.correct + s.incorrect
        s.accuracy = round(s.correct / graded, 4) if graded else None
        return s


# ---------------------------------------------------------------- position-aware views


class PredictionItem(BaseModel):
    """A prediction as shown at one replay position, with this session's answer."""

    prediction: Prediction
    your_answer: str | None = None
    answered_cursor: int | None = None
    outcome: Outcome
    points_awarded: int = 0
    #: Set when the outcome was revealed later than the current replay position (after a rewind):
    #: the result is hidden until the replay gets back there.
    result_hidden_until: int | None = None


def visible_items(ledger: PredictionLedger, cursor: int) -> list[PredictionItem]:
    """Predictions opened at or before ``cursor``, newest first, masking anything revealed after it."""
    out: list[PredictionItem] = []
    for p in reversed(ledger.all()):
        if p.opened_cursor > cursor:
            continue  # opened later in the game than the current position
        if p.opened_cursor < ledger.visible_from:
            continue  # before the viewer joined this game
        a = ledger.answer_for(p.id)
        revealed_at = p.resolved_cursor if p.resolved_cursor is not None else p.locked_cursor
        if revealed_at is not None and revealed_at > cursor:
            shown = p.model_copy(
                update={
                    "status": PredictionStatus.LOCKED,
                    "correct_option_id": None,
                    "void_reason": None,
                    "resolution_summary": None,
                    "resolved_cursor": None,
                }
            )
            out.append(
                PredictionItem(
                    prediction=shown,
                    your_answer=a.option_id if a else None,
                    answered_cursor=a.answered_cursor if a else None,
                    outcome="pending" if a else "unanswered",
                    result_hidden_until=revealed_at,
                )
            )
            continue
        out.append(
            PredictionItem(
                prediction=p.model_copy(),
                your_answer=a.option_id if a else None,
                answered_cursor=a.answered_cursor if a else None,
                outcome=ledger.outcome(p),
                points_awarded=ledger.points_for(p),
            )
        )
    return out
