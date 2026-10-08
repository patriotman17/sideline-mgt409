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

from app.agents.conversation import Conversation
from app.replay.engine import apply_event, initial_state, replay
from app.replay.models import Game, GameState, PlayEvent

Clock = Callable[[], float]

#: Wall-clock seconds between plays at 1x speed.
SECONDS_PER_PLAY = 3.0
MIN_SPEED = 0.25
MAX_SPEED = 50.0


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
    def __init__(self, game: Game, *, speed: float = 1.0, clock: Clock = time.monotonic, session_id: str | None = None):
        self.id = session_id or uuid.uuid4().hex
        #: Secret returned once at creation; only its hash is kept. Required for every session request.
        self.token = secrets.token_urlsafe(32)
        self._token_hash = hashlib.sha256(self.token.encode()).digest()
        self.game = game
        #: Ask Sideline chat for this session only (isolated; expires with the session).
        self.conversation = Conversation()
        self._clock = clock
        self._lock = threading.RLock()
        self._speed = validate_speed(speed)
        self._status = PlaybackStatus.READY
        self._anchor_cursor = 0
        self._anchor_time = clock()
        self._cursor = 0
        self._state = initial_state(game)
        self.last_access = clock()

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

    def _advance_to(self, cursor: int) -> None:
        cursor = max(0, min(cursor, self.total_events))
        if cursor < self._cursor:
            self._state = replay(self.game, cursor)
        else:
            for event in self.game.events[self._cursor : cursor]:
                self._state = apply_event(self._state, event, self.game)
        self._cursor = cursor
        if self._cursor >= self.total_events:
            self._status = PlaybackStatus.FINISHED

    def _sync(self) -> float:
        now = self._clock()
        self.last_access = now
        self._advance_to(self._target_cursor(now))
        return now

    def _reanchor(self, now: float) -> None:
        self._anchor_cursor = self._cursor
        self._anchor_time = now

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
                self._reanchor(now)

    def pause(self) -> None:
        with self._lock:
            self._sync()
            if self._status is PlaybackStatus.PLAYING:
                self._status = PlaybackStatus.PAUSED

    def resume(self) -> None:
        with self._lock:
            now = self._sync()
            if self._status is PlaybackStatus.FINISHED:
                raise InvalidTransition("Replay has finished; restart it to play again.")
            if self._status is PlaybackStatus.READY:
                raise InvalidTransition("Replay hasn't started; use play.")
            if self._status is PlaybackStatus.PAUSED:
                self._status = PlaybackStatus.PLAYING
                self._reanchor(now)

    def restart(self) -> None:
        with self._lock:
            now = self._sync()
            self._advance_to(0)
            self._status = PlaybackStatus.READY
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
            self._advance_to(self._cursor + plays)
            if self._status is not PlaybackStatus.FINISHED and self._cursor > 0:
                self._status = PlaybackStatus.PAUSED
            self._reanchor(now)

    def set_speed(self, speed: float) -> None:
        with self._lock:
            now = self._sync()
            self._speed = validate_speed(speed)
            self._reanchor(now)


class ReplaySessionManager:
    """Isolated sessions keyed by unguessable ids, with idle expiry and a cap."""

    def __init__(self, *, clock: Clock = time.monotonic, ttl_seconds: float = 2 * 60 * 60, max_sessions: int = 500):
        self._clock = clock
        self._ttl = ttl_seconds
        self._max = max_sessions
        self._sessions: dict[str, ReplaySession] = {}
        self._lock = threading.Lock()

    def create(self, game: Game, *, speed: float = 1.0) -> ReplaySession:
        session = ReplaySession(game, speed=speed, clock=self._clock)
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
