"""Replay sessions: per-user playback of a game over wall-clock time.

Each session owns its cursor, speed and status; the underlying ``Game`` is
immutable and shared. The cursor is derived lazily from an injectable clock,
so no background tasks are needed and tests can control time exactly.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import secrets
import threading
import time
import uuid
from collections.abc import Callable
from enum import StrEnum
from typing import Literal

from app.agents.conversation import Conversation
from app.predictions.config import DEFAULT_CONFIG, PredictionConfig
from app.predictions.ledger import PredictionLedger
from app.predictions.models import Answer, Prediction
from app.replay.engine import apply_event, initial_state, replay
from app.replay.models import Game, GameState, PlayEvent

Clock = Callable[[], float]

#: Wall-clock seconds between plays at 1x speed.
SECONDS_PER_PLAY = 3.0
MIN_SPEED = 0.25
MAX_SPEED = 50.0


#: How predictions interrupt playback: "off" (a short pick window only), "big" (default: big moments
#: hold the next snap for a few real seconds), "all" (pause at every question until answered).
MomentHolds = Literal["off", "big", "all"]


class PlaybackStatus(StrEnum):
    READY = "ready"
    PLAYING = "playing"
    PAUSED = "paused"
    FINISHED = "finished"


class InvalidTransition(Exception):
    """A playback control isn't valid in the session's current status."""


class SessionNotFound(KeyError):
    pass


def validate_speed(speed: float) -> float:
    if not math.isfinite(speed) or not MIN_SPEED <= speed <= MAX_SPEED:
        raise ValueError(f"speed must be between {MIN_SPEED} and {MAX_SPEED}")
    return speed


class ReplaySession:
    def __init__(
        self,
        game: Game,
        *,
        speed: float = 1.0,
        clock: Clock = time.monotonic,
        session_id: str | None = None,
        pause_for_predictions: bool = False,
        prediction_config: PredictionConfig = DEFAULT_CONFIG,
        start_cursor: int = 0,
        moment_holds: MomentHolds = "big",
    ):
        self.id = session_id or uuid.uuid4().hex
        #: Secret returned once at creation; only its hash is kept. Required for every session request.
        self.token = secrets.token_urlsafe(32)
        self._token_hash = hashlib.sha256(self.token.encode()).digest()
        self.game = game
        #: Ask Sideline chat for this session only (isolated; expires with the session).
        self.conversation = Conversation()
        #: Prediction lifecycle for this session. Only ever moves forward (see ``_advance_to``).
        self.predictions = PredictionLedger(game.info, prediction_config)
        #: "big" (default): big moments hold the next snap for a few real seconds; other questions get a
        #: short pick window. "all" stops at every question until answered; "off" = pick window only.
        self.moment_holds: MomentHolds = "all" if pause_for_predictions else moment_holds
        #: True while the current hold is a big-moment hold (vs. an ordinary pick window).
        self._moment_hold = False
        self._last_opened: list[Prediction] = []
        #: Clock time when the current pick window ends (None = no window).
        self._pick_window_until: float | None = None
        #: Why playback is paused, when the server paused it ("prediction"); None otherwise.
        self.pause_reason: str | None = None
        self._clock = clock
        self._lock = threading.RLock()
        self._speed = validate_speed(speed)
        self._status = PlaybackStatus.READY
        self._anchor_cursor = 0
        self._anchor_time = clock()
        self._cursor = 0
        self._state = initial_state(game)
        self.last_access = clock()
        if start_cursor > 0:
            # Joined mid-game (e.g. from the synchronized week): reveal everything up to here at once,
            # paused. Earlier questions were never answerable, so Picks hides them (``visible_from``).
            self._advance_to(start_cursor)
            self.predictions.visible_from = self._cursor
            if self._status is not PlaybackStatus.FINISHED:
                self._status = PlaybackStatus.PAUSED
            self._reanchor(clock())

    def check_token(self, token: str | None) -> bool:
        if not token:
            return False
        return hmac.compare_digest(hashlib.sha256(token.encode()).digest(), self._token_hash)

    # -- time -------------------------------------------------------------

    @property
    def total_events(self) -> int:
        return len(self.game.events)

    def _target_cursor(self, now: float) -> int:
        if self._status is not PlaybackStatus.PLAYING:
            return self._cursor
        elapsed = max(0.0, now - self._anchor_time)
        advanced = int(elapsed * self._speed / SECONDS_PER_PLAY)
        return min(self.total_events, self._anchor_cursor + advanced)

    def _advance_to(self, cursor: int, *, stop_on_prediction: bool = False) -> bool:
        """Move the cursor. Forward moves reveal events one at a time; every event beyond the
        high-water mark (furthest play ever revealed) goes through the prediction ledger exactly
        once, in order. Returns True if it stopped early because a prediction opened."""
        cursor = max(0, min(cursor, self.total_events))
        stopped = False
        if cursor < self._cursor:
            self._state = replay(self.game, cursor)
            self._cursor = cursor
        else:
            for index in range(self._cursor, cursor):
                event = self.game.events[index]
                self._state = apply_event(self._state, event, self.game)
                self._cursor = index + 1
                if self._cursor > self.predictions.high_water:
                    opened = self.predictions.observe(event, self._state, self._cursor)
                    self._last_opened = opened
                    if opened and stop_on_prediction and self._cursor < self.total_events:
                        stopped = True
                        break
        if self._cursor >= self.total_events:
            self._status = PlaybackStatus.FINISHED
        return stopped

    def _sync(self) -> float:
        now = self._clock()
        self.last_access = now
        if self._status is not PlaybackStatus.PLAYING:
            self._advance_to(self._target_cursor(now))
            return now
        while self._advance_to(self._target_cursor(now), stop_on_prediction=True):
            if self.pause_for_predictions:
                self._status = PlaybackStatus.PAUSED
                self.pause_reason = "prediction"
                break
            # The next snap waits: a big-moment hold (fixed REAL seconds, so there's time to answer at
            # any speed) or an ordinary pick window (scaled by speed). Anchored to when this play was
            # *due* (not when it was polled), so the timeline is the same however often clients poll.
            cfg = self.predictions.config
            spp = SECONDS_PER_PLAY / self._speed
            due = self._anchor_time + (self._cursor - self._anchor_cursor) * spp
            big = self.moment_holds == "big" and any(p.big_moment for p in self._last_opened)
            self._moment_hold = big
            self._anchor_cursor = self._cursor
            self._anchor_time = due + (cfg.big_moment_hold_seconds if big else cfg.pick_window_seconds / self._speed)
            self._pick_window_until = self._anchor_time + spp  # when the next snap is due
        return now

    def _reanchor(self, now: float) -> None:
        self._anchor_cursor = self._cursor
        self._anchor_time = now
        self._pick_window_until = None

    def pick_window_left(self) -> float | None:
        """Seconds until the next snap while a pick window holds playback (None otherwise)."""
        with self._lock:
            now = self._sync()
            if self._status is not PlaybackStatus.PLAYING or self._pick_window_until is None:
                return None
            left = self._pick_window_until - now
            return round(left, 2) if left > 0 else None

    # -- reads ------------------------------------------------------------

    def snapshot(self) -> tuple[PlaybackStatus, float, int, GameState]:
        with self._lock:
            self._sync()
            return self._status, self._speed, self._cursor, self._state

    def visible_events(self) -> tuple[PlayEvent, ...]:
        """Events revealed so far. The only sanctioned input for future AI context."""
        with self._lock:
            self._sync()
            return self.game.events[: self._cursor]

    # -- controls ---------------------------------------------------------

    def play(self) -> None:
        with self._lock:
            now = self._sync()
            if self._status is PlaybackStatus.FINISHED:
                raise InvalidTransition("Replay has finished; restart it to play again.")
            if self._status is not PlaybackStatus.PLAYING:
                self._status = PlaybackStatus.PLAYING
                self.pause_reason = None
                self._reanchor(now)

    def pause(self) -> None:
        with self._lock:
            self._sync()
            if self._status is PlaybackStatus.PLAYING:
                self._status = PlaybackStatus.PAUSED
                self.pause_reason = None

    def resume(self) -> None:
        with self._lock:
            now = self._sync()
            if self._status is PlaybackStatus.FINISHED:
                raise InvalidTransition("Replay has finished; restart it to play again.")
            if self._status is PlaybackStatus.READY:
                raise InvalidTransition("Replay hasn't started; use play.")
            if self._status is PlaybackStatus.PAUSED:
                self._status = PlaybackStatus.PLAYING
                self.pause_reason = None
                self._reanchor(now)

    def restart(self) -> None:
        """Back to kickoff. Predictions are NOT reset: the ledger keeps its high-water mark, so no
        question is re-offered and none open again until the replay passes where it left off."""
        with self._lock:
            now = self._sync()
            self._advance_to(0)
            self._status = PlaybackStatus.READY
            self.pause_reason = None
            self._reanchor(now)

    def step(self, plays: int = 1) -> None:
        """Advance manually by N events (pauses a running replay first)."""
        if plays < 1:
            raise ValueError("plays must be at least 1")
        with self._lock:
            now = self._sync()
            if self._status is PlaybackStatus.FINISHED:
                raise InvalidTransition("Replay has finished; restart it to step again.")
            if self._status is PlaybackStatus.PLAYING:
                self._status = PlaybackStatus.PAUSED
            stopped = self._advance_to(self._cursor + plays, stop_on_prediction=self.pause_for_predictions)
            if self._status is not PlaybackStatus.FINISHED and self._cursor > 0:
                self._status = PlaybackStatus.PAUSED
            self.pause_reason = "prediction" if stopped else None
            self._reanchor(now)

    def set_speed(self, speed: float) -> None:
        with self._lock:
            now = self._sync()
            self._speed = validate_speed(speed)
            self._reanchor(now)

    # -- predictions --------------------------------------------------------

    def submit_prediction(self, prediction_id: str, option_id: str) -> tuple[Answer, bool, bool]:
        """Atomically: advance to *now*, then validate and record the answer.

        Syncing first means that if the locking play is already due, the prediction locks
        before the answer is checked — answers can never arrive after the outcome.
        Returns (answer, created, resumed_playback).
        """
        with self._lock:
            now = self._sync()
            answer, created = self.predictions.answer(prediction_id, option_id, self._cursor)
            resumed = False
            all_answered = created and not self.predictions.unanswered_open(self._cursor)
            if all_answered and self._status is PlaybackStatus.PAUSED and self.pause_reason == "prediction":
                self._status = PlaybackStatus.PLAYING
                self.pause_reason = None
                self._reanchor(now)
                resumed = True
            elif all_answered and self._pick_window_until is not None and self._pick_window_until > now:
                self._reanchor(now)  # answered during the pick window: carry on at normal pace
            return answer, created, resumed

    @property
    def pause_for_predictions(self) -> bool:
        return self.moment_holds == "all"

    def set_pause_for_predictions(self, enabled: bool) -> None:
        self.set_moment_holds("all" if enabled else "big")

    def set_moment_holds(self, level: MomentHolds) -> None:
        with self._lock:
            self._sync()
            self.moment_holds = level

    def moment_hold_active(self) -> bool:
        """True while playback is waiting out a big-moment hold."""
        return self._moment_hold and self.pick_window_left() is not None

    def locked(self) -> threading.RLock:
        """The session lock, for building consistent multi-part reads (e.g. prediction reports)."""
        return self._lock

    @property
    def cursor(self) -> int:
        return self._cursor


class ReplaySessionManager:
    """Isolated sessions keyed by unguessable ids, with idle expiry and a cap."""

    def __init__(
        self,
        *,
        clock: Clock = time.monotonic,
        ttl_seconds: float = 2 * 60 * 60,
        max_sessions: int = 500,
        prediction_config: PredictionConfig = DEFAULT_CONFIG,
    ):
        self._clock = clock
        self._prediction_config = prediction_config
        self._ttl = ttl_seconds
        self._max = max_sessions
        self._sessions: dict[str, ReplaySession] = {}
        self._lock = threading.Lock()

    def create(
        self,
        game: Game,
        *,
        speed: float = 1.0,
        pause_for_predictions: bool = False,
        start_cursor: int = 0,
        moment_holds: MomentHolds = "big",
    ) -> ReplaySession:
        session = ReplaySession(
            game,
            speed=speed,
            clock=self._clock,
            pause_for_predictions=pause_for_predictions,
            prediction_config=self._prediction_config,
            start_cursor=start_cursor,
            moment_holds=moment_holds,
        )
        with self._lock:
            self._evict()
            if len(self._sessions) >= self._max:
                oldest = min(self._sessions.values(), key=lambda s: s.last_access)
                del self._sessions[oldest.id]
            self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> ReplaySession:
        with self._lock:
            self._evict()
            session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFound(session_id)
        return session

    def delete(self, session_id: str) -> None:
        with self._lock:
            if self._sessions.pop(session_id, None) is None:
                raise SessionNotFound(session_id)

    def __len__(self) -> int:
        return len(self._sessions)

    def _evict(self) -> None:
        cutoff = self._clock() - self._ttl
        for sid in [sid for sid, s in self._sessions.items() if s.last_access < cutoff]:
            del self._sessions[sid]
