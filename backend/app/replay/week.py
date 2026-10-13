"""Synchronized week: every game of an NFL week replayed on one shared, simulated clock.

Each play carries the real UTC time it happened (nflverse ``time_of_day``), so a single clock
reproduces the actual week: Thursday night, the London morning game, six overlapping 1 PM games, and
so on. A game's position is simply "how many of its plays had happened by the clock time", and its
state comes from the same deterministic engine (``replay``) as individual replays.

No future leakage: the scoreboard holds only the state at the clock's position. Kickoff times are
schedule information (known before a game); a game's end time, length, or final score are never
exposed before the clock reaches them, and the clock's upper bound is an estimate from the last
kickoff, not the real end of the last game.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import secrets
import threading
import time
import uuid
from bisect import bisect_right
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.replay.engine import replay
from app.replay.models import Game, GameState

Clock = Callable[[], float]
ET = ZoneInfo("America/New_York")
#: Allowed clock speeds (simulated seconds per real second). 60x = a 3-hour game in 3 minutes.
SPEEDS = (1.0, 10.0, 60.0, 300.0)
DEFAULT_SPEED = 60.0
#: How far past the last kickoff the clock may run (an estimate; never the real end of a game).
SLATE_TAIL = timedelta(hours=4, minutes=30)
#: Jump-to points start a few minutes before kickoff.
PRESET_LEAD = timedelta(minutes=5)


class WeekError(Exception):
    pass


class GamePhase(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINAL = "final"


def scheduled_kickoff(game: Game) -> datetime | None:
    """Listed kickoff: the actual kickoff floored to 5 minutes (1:02:36 PM -> 1:00 PM, 8:23 PM -> 8:20 PM)."""
    k = game.info.kickoff_at
    if k is None:
        return None
    et = k.astimezone(ET)
    return et.replace(minute=et.minute - et.minute % 5, second=0, microsecond=0).astimezone(UTC)


def window_for(game: Game) -> tuple[str, str]:
    """(key, label) of the TV window a game belongs to, from its listed kickoff in ET."""
    k = scheduled_kickoff(game)
    if k is None:
        return "other", "Other games"
    et = k.astimezone(ET)
    day = et.strftime("%A")
    if day == "Thursday":
        return "thu-night", "Thursday Night"
    if day == "Monday":
        return "mon-night", "Monday Night"
    if day == "Sunday":
        if et.hour < 12:
            return "sun-morning", "Sunday · London" if game.info.neutral_site else "Sunday morning"
        if et.hour < 16:
            return "sun-early", "Sunday · 1:00 PM"
        if et.hour < 19:
            return "sun-late", "Sunday · 4:05 & 4:25 PM"
        return "sun-night", "Sunday Night"
    return f"{day.lower()}-{et.hour:02d}", f"{day} · {et.strftime('%-I:%M %p')}"


class GameTimeline:
    """When each of a game's events happened, for mapping a clock time to a replay cursor."""

    def __init__(self, game: Game):
        if game.info.kickoff_at is None:
            raise WeekError(f"{game.info.game_id} has no kickoff time")
        self.game = game
        times: list[datetime] = []
        last = game.info.kickoff_at
        for event in game.events:
            # Marker rows (game start, quarter ends) have no timestamp: they happen with the previous
            # play. Never let time run backwards (one source game has a slightly out-of-order row).
            t = event.occurred_at or last
            last = max(last, t)
            times.append(last)
        self.times = times

    def cursor_at(self, t: datetime) -> int:
        """Number of events that had happened by ``t``."""
        return bisect_right(self.times, t)

    def phase(self, cursor: int) -> GamePhase:
        if cursor <= 0:
            return GamePhase.SCHEDULED
        return GamePhase.FINAL if cursor >= len(self.times) else GamePhase.LIVE


@dataclass(frozen=True)
class Preset:
    key: str
    label: str
    at: datetime


@dataclass(frozen=True)
class SlateGame:
    game: Game
    timeline: GameTimeline
    kickoff: datetime
    window_key: str
    window_label: str


class WeekSlate:
    """All games of one week, sorted by kickoff, with their timelines and TV windows."""

    def __init__(self, season: int, week: int, games: list[Game]):
        if not games:
            raise WeekError(f"No games for {season} week {week}")
        items = []
        for g in games:
            kickoff = scheduled_kickoff(g)
            if kickoff is None:
                raise WeekError(f"{g.info.game_id} has no kickoff time")
            key, label = window_for(g)
            items.append(SlateGame(g, GameTimeline(g), kickoff, key, label))
        self.season, self.week = season, week
        self.games = sorted(items, key=lambda s: (s.kickoff, s.game.info.game_id))
        self.by_id = {s.game.info.game_id: s for s in self.games}
        self.starts_at = self.games[0].kickoff - PRESET_LEAD
        self.ends_at = self.games[-1].kickoff + SLATE_TAIL
        presets: dict[str, Preset] = {}
        for s in self.games:
            presets.setdefault(s.window_key, Preset(s.window_key, s.window_label, s.kickoff - PRESET_LEAD))
        self.presets = list(presets.values())

    @property
    def title(self) -> str:
        return f"{self.season} · Week {self.week}"

    def state(self, game_id: str, at: datetime) -> tuple[GamePhase, int, GameState]:
        s = self.by_id[game_id]
        cursor = s.timeline.cursor_at(at)
        return s.timeline.phase(cursor), cursor, _state(s.game, cursor)


@lru_cache(maxsize=4096)
def _state(game: Game, cursor: int) -> GameState:
    # Games are immutable and hashable by identity; replay() is pure, so caching is safe.
    return replay(game, cursor)


def slates_from(games: list[Game]) -> dict[tuple[int, int], WeekSlate]:
    """Regular-season weeks where every game has per-play timestamps."""
    grouped: dict[tuple[int, int], list[Game]] = {}
    for g in games:
        i = g.info
        if i.season_type == "REG" and i.season and i.week and i.kickoff_at and any(e.occurred_at for e in g.events):
            grouped.setdefault((i.season, i.week), []).append(g)
    return {k: WeekSlate(k[0], k[1], v) for k, v in grouped.items()}


# ---------------------------------------------------------------- sessions (one shared clock per viewer)


class ClockStatus(StrEnum):
    PAUSED = "paused"
    PLAYING = "playing"
    FINISHED = "finished"


def validate_week_speed(speed: float) -> float:
    if not math.isfinite(speed) or speed not in SPEEDS:
        raise ValueError(f"speed must be one of {', '.join(f'{s:g}' for s in SPEEDS)}")
    return speed


class WeekSession:
    """A viewer's simulated clock over a slate. Wall-clock driven and lazily evaluated (like replays)."""

    def __init__(
        self,
        slate: WeekSlate,
        *,
        clock: Clock = time.monotonic,
        start_at: datetime | None = None,
        speed: float = DEFAULT_SPEED,
    ):
        self.id = uuid.uuid4().hex
        self.token = secrets.token_urlsafe(32)
        self._token_hash = hashlib.sha256(self.token.encode()).digest()
        self.slate = slate
        self._clock = clock
        self._lock = threading.RLock()
        self._speed = validate_week_speed(speed)
        self._status = ClockStatus.PAUSED
        self._anchor_sim = self._clamp(start_at or slate.starts_at)
        self._anchor_wall = clock()
        self.last_access = self._anchor_wall

    def check_token(self, token: str | None) -> bool:
        return bool(token) and hmac.compare_digest(hashlib.sha256((token or "").encode()).digest(), self._token_hash)

    def _clamp(self, t: datetime) -> datetime:
        return min(max(t, self.slate.starts_at), self.slate.ends_at)

    def _now_sim(self, wall: float) -> datetime:
        if self._status is not ClockStatus.PLAYING:
            return self._anchor_sim
        elapsed = max(0.0, wall - self._anchor_wall) * self._speed
        return self._clamp(self._anchor_sim + timedelta(seconds=elapsed))

    def _sync(self) -> datetime:
        wall = self._clock()
        self.last_access = wall
        sim = self._now_sim(wall)
        if self._status is ClockStatus.PLAYING and sim >= self.slate.ends_at:
            self._status, self._anchor_sim, self._anchor_wall = ClockStatus.FINISHED, sim, wall
        return sim

    def snapshot(self) -> tuple[ClockStatus, float, datetime]:
        with self._lock:
            sim = self._sync()
            return self._status, self._speed, sim

    def play(self) -> None:
        with self._lock:
            sim = self._sync()
            if sim >= self.slate.ends_at:
                sim = self.slate.starts_at  # replay the week from the start
            self._status, self._anchor_sim, self._anchor_wall = ClockStatus.PLAYING, sim, self._clock()

    def pause(self) -> None:
        with self._lock:
            sim = self._sync()
            if self._status is ClockStatus.PLAYING:
                self._status, self._anchor_sim, self._anchor_wall = ClockStatus.PAUSED, sim, self._clock()

    def seek(self, at: datetime) -> None:
        with self._lock:
            self._sync()
            self._anchor_sim, self._anchor_wall = self._clamp(at), self._clock()
            if self._status is ClockStatus.FINISHED:
                self._status = ClockStatus.PAUSED

    def set_speed(self, speed: float) -> None:
        with self._lock:
            sim = self._sync()
            self._speed = validate_week_speed(speed)
            self._anchor_sim, self._anchor_wall = sim, self._clock()


class WeekSessionNotFound(KeyError):
    pass


class WeekSessionManager:
    def __init__(self, *, clock: Clock = time.monotonic, ttl_seconds: float = 2 * 60 * 60, max_sessions: int = 500):
        self._clock = clock
        self._ttl = ttl_seconds
        self._max = max_sessions
        self._sessions: dict[str, WeekSession] = {}
        self._lock = threading.Lock()

    def create(
        self, slate: WeekSlate, *, start_at: datetime | None = None, speed: float = DEFAULT_SPEED
    ) -> WeekSession:
        session = WeekSession(slate, clock=self._clock, start_at=start_at, speed=speed)
        with self._lock:
            self._evict()
            if len(self._sessions) >= self._max:
                oldest = min(self._sessions.values(), key=lambda s: s.last_access)
                del self._sessions[oldest.id]
            self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> WeekSession:
        with self._lock:
            self._evict()
            session = self._sessions.get(session_id)
        if session is None:
            raise WeekSessionNotFound(session_id)
        return session

    def _evict(self) -> None:
        cutoff = self._clock() - self._ttl
        for sid in [sid for sid, s in self._sessions.items() if s.last_access < cutoff]:
            del self._sessions[sid]
