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
from typing import Literal
from zoneinfo import ZoneInfo

from app.predictions.config import DEFAULT_CONFIG
from app.predictions.ledger import PredictionLedger
from app.predictions.models import Prediction
from app.replay.engine import apply_event, initial_state, replay
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
class Moment:
    """A featured prediction in a game, as it looks when it opens. ``locked_cursor`` is only used to
    tell whether the moment is still open at a cursor (= no snap revealed since); it's never exposed."""

    prediction: Prediction
    opened_cursor: int
    locked_cursor: int
    open_at: datetime

    @property
    def big(self) -> bool:
        return self.prediction.big_moment

    def open_at_cursor(self, cursor: int) -> bool:
        return self.opened_cursor <= cursor < self.locked_cursor


def game_moments(game: Game, timeline: GameTimeline) -> tuple[Moment, ...]:
    """Every featured question of a game, from the same deterministic ledger a replay session runs,
    so the week and an opened replay agree on what's asked and when."""
    ledger = PredictionLedger(game.info, DEFAULT_CONFIG)
    state = initial_state(game)
    opened: list[Prediction] = []
    for i, event in enumerate(game.events):
        state = apply_event(state, event, game)
        opened += [p.model_copy() for p in ledger.observe(event, state, i + 1)]
    out = []
    for p in opened:
        final = ledger.get(p.id)
        locked = final.locked_cursor if final and final.locked_cursor else len(game.events) + 1
        out.append(Moment(p, p.opened_cursor, locked, timeline.times[p.opened_cursor - 1]))
    return tuple(out)


@dataclass(frozen=True)
class SlateGame:
    game: Game
    timeline: GameTimeline
    kickoff: datetime
    window_key: str
    window_label: str
    moments: tuple[Moment, ...] = ()

    def open_moment(self, cursor: int) -> Moment | None:
        return next((m for m in self.moments if m.open_at_cursor(cursor)), None)


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
            timeline = GameTimeline(g)
            items.append(SlateGame(g, timeline, kickoff, key, label, game_moments(g, timeline)))
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
    #: Stopped on a big moment in a watched game; resumes by itself after the hold (or on release).
    HELD = "held"
    FINISHED = "finished"


HoldLevel = Literal["big", "all"]
#: Real seconds the clock holds on a moment (same as a replay's big-moment hold).
HOLD_SECONDS = DEFAULT_CONFIG.big_moment_hold_seconds
MAX_WATCHED = 4


@dataclass(frozen=True)
class Hold:
    game_id: str
    moment: Moment
    release_wall: float


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
        #: game_id -> which moments stop the clock there ("big" or "all").
        self._watched: dict[str, HoldLevel] = {}
        self._hold: Hold | None = None
        #: Moments already held (or skipped by pausing) in this pass, so each stops the clock once.
        self._consumed: set[str] = set()

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
        """Advance the clock to now, stopping on any big moment that opens in a watched game."""
        wall = self._clock()
        self.last_access = wall
        while True:
            if self._status is ClockStatus.HELD:
                hold = self._hold
                if hold is None or wall < hold.release_wall:
                    return self._anchor_sim
                self._end_hold(at_wall=hold.release_wall)  # hold over: continue from that moment
                continue
            if self._status is not ClockStatus.PLAYING:
                return self._anchor_sim
            target = self._now_sim(wall)
            hit = self._next_moment(self._anchor_sim, target)
            if hit is not None:
                game_id, moment = hit
                # Stop exactly when the moment opened (in wall time), then hold for real seconds.
                hit_wall = self._anchor_wall + (moment.open_at - self._anchor_sim).total_seconds() / self._speed
                self._status, self._anchor_sim, self._anchor_wall = ClockStatus.HELD, moment.open_at, hit_wall
                self._hold = Hold(game_id, moment, hit_wall + HOLD_SECONDS)
                continue
            if target >= self.slate.ends_at:
                self._status, self._anchor_sim, self._anchor_wall = ClockStatus.FINISHED, target, wall
            return target

    def _next_moment(self, after: datetime, until: datetime) -> tuple[str, Moment] | None:
        best: tuple[str, Moment] | None = None
        for game_id, level in self._watched.items():
            for m in self.slate.by_id[game_id].moments:
                if m.prediction.id in self._consumed or not (after < m.open_at <= until):
                    continue
                if level == "big" and not m.big:
                    continue
                if best is None or m.open_at < best[1].open_at:
                    best = (game_id, m)
        return best

    def _end_hold(self, *, at_wall: float, then: ClockStatus = ClockStatus.PLAYING) -> None:
        if self._hold is not None:
            self._consumed.add(self._hold.moment.prediction.id)
        self._hold = None
        self._status, self._anchor_wall = then, at_wall

    def snapshot(self) -> tuple[ClockStatus, float, datetime]:
        with self._lock:
            sim = self._sync()
            return self._status, self._speed, sim

    def hold(self) -> tuple[Hold, float] | None:
        """The current hold and its real seconds left (None when not held)."""
        with self._lock:
            self._sync()
            if self._status is not ClockStatus.HELD or self._hold is None:
                return None
            return self._hold, max(0.0, self._hold.release_wall - self._clock())

    def watch(self, game_ids: list[str], level: HoldLevel = "big") -> None:
        """Games whose moments stop the clock (the one you're viewing, your #1 team's). Empty = never."""
        unknown = [g for g in game_ids if g not in self.slate.by_id]
        if unknown:
            raise ValueError(f"Unknown game ids: {unknown}")
        if len(set(game_ids)) > MAX_WATCHED:
            raise ValueError(f"Watch at most {MAX_WATCHED} games")
        with self._lock:
            self._sync()
            self._watched = dict.fromkeys(game_ids, level)
            if self._hold is not None and self._hold.game_id not in self._watched:
                self._end_hold(at_wall=self._clock())

    @property
    def watched(self) -> dict[str, HoldLevel]:
        return dict(self._watched)

    def release(self) -> None:
        """End a hold early (e.g. the viewer answered)."""
        with self._lock:
            self._sync()
            if self._status is ClockStatus.HELD:
                self._end_hold(at_wall=self._clock())

    def play(self) -> None:
        with self._lock:
            sim = self._sync()
            if self._status is ClockStatus.HELD:
                self._end_hold(at_wall=self._clock())
                return
            if sim >= self.slate.ends_at:
                sim = self.slate.starts_at  # replay the week from the start
                self._consumed.clear()
            self._status, self._anchor_sim, self._anchor_wall = ClockStatus.PLAYING, sim, self._clock()

    def pause(self) -> None:
        with self._lock:
            sim = self._sync()
            if self._status is ClockStatus.HELD:
                self._end_hold(at_wall=self._clock(), then=ClockStatus.PAUSED)
            elif self._status is ClockStatus.PLAYING:
                self._status, self._anchor_sim, self._anchor_wall = ClockStatus.PAUSED, sim, self._clock()

    def seek(self, at: datetime) -> None:
        with self._lock:
            self._sync()
            if self._status is ClockStatus.HELD:
                self._end_hold(at_wall=self._clock())
            self._anchor_sim, self._anchor_wall = self._clamp(at), self._clock()
            # Moments at or after the new time can stop the clock again.
            self._consumed = {
                pid
                for s in self.slate.games
                for m in s.moments
                if (pid := m.prediction.id) in self._consumed and m.open_at < self._anchor_sim
            }
            if self._status is ClockStatus.FINISHED:
                self._status = ClockStatus.PAUSED

    def set_speed(self, speed: float) -> None:
        with self._lock:
            sim = self._sync()
            self._speed = validate_week_speed(speed)
            if self._status is not ClockStatus.HELD:  # a hold keeps its own real-time countdown
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
