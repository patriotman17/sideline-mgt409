"""Synchronized week API: one simulated clock drives every game of an NFL week.

Sessions are per viewer and token-protected exactly like replay sessions (``X-Session-Token``; unknown
ids and bad tokens are both 404). Responses contain only what has happened by the session's clock:
scheduled games show no score, live games show the current state, finals appear only once reached.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.replay.catalog import get_catalog
from app.replay.models import Team
from app.replay.source import ATTRIBUTION, LICENSE
from app.replay.week import (
    DEFAULT_SPEED,
    ET,
    SPEEDS,
    ClockStatus,
    GamePhase,
    HoldLevel,
    Moment,
    WeekSession,
    WeekSessionManager,
    WeekSessionNotFound,
    WeekSlate,
    slates_from,
)

router = APIRouter(tags=["week"])


@lru_cache
def get_slates() -> dict[tuple[int, int], WeekSlate]:
    return slates_from(get_catalog().list())


@lru_cache
def get_week_manager() -> WeekSessionManager:
    return WeekSessionManager()


SlatesDep = Annotated[dict[tuple[int, int], WeekSlate], Depends(get_slates)]
WeekManagerDep = Annotated[WeekSessionManager, Depends(get_week_manager)]


# ---------------------------------------------------------------- schemas


class SlateSummary(BaseModel):
    season: int
    week: int
    title: str
    games: int
    starts_at: datetime
    ends_at: datetime


class PresetOut(BaseModel):
    key: str
    label: str
    at: datetime


class MomentOption(BaseModel):
    id: str
    label: str


class MomentOut(BaseModel):
    """A featured question that is open right now (it closes at the next snap). Same id as in the
    game's replay, so answering there works. Never includes its outcome."""

    prediction_id: str
    type: str
    question: str
    options: list[MomentOption]
    tags: list[str]
    big_moment: bool
    team: str | None
    situation: str
    points: int


class HoldOut(BaseModel):
    game_id: str
    seconds_left: float
    moment: MomentOut


class WeekGame(BaseModel):
    game_id: str
    away: Team
    home: Team
    kickoff_at: datetime
    kickoff_label: str = Field(description='Listed kickoff in ET, e.g. "Sun 1:00 PM"')
    window_key: str
    window_label: str
    venue: str | None
    neutral_site: bool
    #: Closing spread (pregame info): positive = home favored.
    spread_line: float | None = None
    phase: GamePhase
    #: Plays revealed so far (0 when scheduled). Used to open the game's replay at this moment.
    cursor: int
    away_score: int | None = None
    home_score: int | None = None
    quarter: int | None = None
    clock_seconds: int | None = None
    #: "Q2 4:12", "Half", "End Q3", "Final", "Final/OT".
    period_label: str | None = None
    possession: str | None = None
    down: int | None = None
    distance: int | None = None
    yardline_100: int | None = None
    ball_on: str | None = None
    home_win_probability: float | None = None
    #: The featured question open right now in this game, if any.
    moment: MomentOut | None = None


class WeekSnapshot(BaseModel):
    session_id: str
    season: int
    week: int
    title: str
    status: ClockStatus
    speed: float
    speeds: list[float]
    sim_time: datetime
    sim_time_label: str = Field(description='Clock time in ET, e.g. "Sun, Oct 5 · 2:30 PM ET"')
    starts_at: datetime
    ends_at: datetime
    presets: list[PresetOut]
    games: list[WeekGame]
    live_games: int
    #: Set while the clock is stopped on a big moment in a watched game.
    hold: HoldOut | None = None
    watched: list[str] = Field(default_factory=list)
    attribution: str
    license: str


class CreatedWeekSession(WeekSnapshot):
    session_token: str = Field(description="Secret for X-Session-Token. Returned only once.")


class CreateWeekRequest(BaseModel):
    season: int
    week: int
    start_at: datetime | None = None
    preset: str | None = Field(default=None, description="Start at a TV window, e.g. 'sun-early'")
    speed: float = DEFAULT_SPEED
    autoplay: bool = False


class SeekRequest(BaseModel):
    at: datetime | None = None
    preset: str | None = None


class WeekSpeedRequest(BaseModel):
    speed: float


class WatchRequest(BaseModel):
    #: The game you're viewing and/or your #1 team's game. Empty list = the clock never stops.
    game_ids: list[str] = Field(default_factory=list, max_length=4)
    level: HoldLevel = "big"


# ---------------------------------------------------------------- helpers


def _et_label(t: datetime, fmt: str) -> str:
    return t.astimezone(ET).strftime(fmt).replace(" 0", " ")


def _period_label(phase: GamePhase, quarter: int, clock: int | None, game_status: str) -> str | None:
    if phase is GamePhase.SCHEDULED:
        return None
    if phase is GamePhase.FINAL:
        return "Final/OT" if quarter > 4 else "Final"
    if game_status == "halftime":
        return "Half"
    if game_status in ("end_of_quarter", "end_of_regulation"):
        return f"End Q{quarter}" if quarter <= 4 else "End OT"
    q = f"Q{quarter}" if quarter <= 4 else "OT"
    return f"{q} {clock // 60}:{clock % 60:02d}" if clock is not None else q


def _moment_out(m: Moment) -> MomentOut:
    p = m.prediction
    return MomentOut(
        prediction_id=p.id,
        type=p.type.value,
        question=p.question,
        options=[MomentOption(id=o.id, label=o.label) for o in p.options],
        tags=p.tags,
        big_moment=p.big_moment,
        team=p.team,
        situation=p.situation,
        points=p.points,
    )


def week_snapshot(session: WeekSession) -> WeekSnapshot:
    clock_status, speed, sim = session.snapshot()
    held = session.hold()
    slate = session.slate
    games: list[WeekGame] = []
    for s in slate.games:
        phase, cursor, st = slate.state(s.game.info.game_id, sim)
        info = s.game.info
        g = WeekGame(
            game_id=info.game_id,
            away=info.away,
            home=info.home,
            kickoff_at=s.kickoff,
            kickoff_label=_et_label(s.kickoff, "%a %I:%M %p"),
            window_key=s.window_key,
            window_label=s.window_label,
            venue=info.venue,
            neutral_site=info.neutral_site,
            spread_line=info.spread_line,
            phase=phase,
            cursor=cursor,
        )
        if phase is not GamePhase.SCHEDULED:
            g = g.model_copy(
                update={
                    "away_score": st.away_score,
                    "home_score": st.home_score,
                    "quarter": st.quarter,
                    "clock_seconds": st.clock_seconds,
                    "period_label": _period_label(phase, st.quarter, st.clock_seconds, st.status.value),
                }
            )
        if phase is GamePhase.LIVE and (open_moment := s.open_moment(cursor)) is not None:
            g = g.model_copy(update={"moment": _moment_out(open_moment)})
        if phase is GamePhase.LIVE:
            g = g.model_copy(
                update={
                    "possession": st.possession,
                    "down": st.down,
                    "distance": st.distance,
                    "yardline_100": st.yardline_100,
                    "ball_on": st.ball_on,
                    "home_win_probability": st.home_win_probability,
                }
            )
        games.append(g)
    return WeekSnapshot(
        session_id=session.id,
        season=slate.season,
        week=slate.week,
        title=slate.title,
        status=clock_status,
        speed=speed,
        speeds=list(SPEEDS),
        sim_time=sim,
        sim_time_label=_et_label(sim, "%a, %b %d · %I:%M %p") + " ET",
        starts_at=slate.starts_at,
        ends_at=slate.ends_at,
        presets=[PresetOut(key=p.key, label=p.label, at=p.at) for p in slate.presets],
        games=games,
        live_games=sum(g.phase is GamePhase.LIVE for g in games),
        hold=(
            HoldOut(game_id=held[0].game_id, seconds_left=round(held[1], 1), moment=_moment_out(held[0].moment))
            if held
            else None
        ),
        watched=list(session.watched),
        attribution=ATTRIBUTION,
        license=LICENSE,
    )


def _preset_time(slate: WeekSlate, key: str) -> datetime:
    for p in slate.presets:
        if p.key == key:
            return p.at
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown preset {key!r}")


def authorized_week(
    session_id: str,
    manager: WeekManagerDep,
    x_session_token: Annotated[str | None, Header()] = None,
) -> WeekSession:
    """Unknown ids and bad tokens are indistinguishable (404), like replay sessions."""
    try:
        session = manager.get(session_id)
    except WeekSessionNotFound:
        session = None
    if session is None or not session.check_token(x_session_token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Week session not found or expired")
    return session


WeekDep = Annotated[WeekSession, Depends(authorized_week)]


# ---------------------------------------------------------------- routes


@router.get("/slates", response_model=list[SlateSummary])
def list_slates(slates: SlatesDep) -> list[SlateSummary]:
    """Weeks available for the synchronized mode (every game has per-play timestamps)."""
    return [
        SlateSummary(
            season=s.season, week=s.week, title=s.title, games=len(s.games), starts_at=s.starts_at, ends_at=s.ends_at
        )
        for s in sorted(slates.values(), key=lambda s: (s.season, s.week))
    ]


@router.post("/sessions", response_model=CreatedWeekSession, status_code=status.HTTP_201_CREATED)
def create_week_session(body: CreateWeekRequest, slates: SlatesDep, manager: WeekManagerDep) -> CreatedWeekSession:
    slate = slates.get((body.season, body.week))
    if slate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No synchronized data for {body.season} week {body.week}")
    start = _preset_time(slate, body.preset) if body.preset else body.start_at
    try:
        session = manager.create(slate, start_at=start, speed=body.speed)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    if body.autoplay:
        session.play()
    return CreatedWeekSession(**week_snapshot(session).model_dump(), session_token=session.token)


@router.get("/sessions/{session_id}", response_model=WeekSnapshot)
def get_week_session(session: WeekDep) -> WeekSnapshot:
    return week_snapshot(session)


@router.post("/sessions/{session_id}/play", response_model=WeekSnapshot)
def play_week(session: WeekDep) -> WeekSnapshot:
    session.play()
    return week_snapshot(session)


@router.post("/sessions/{session_id}/pause", response_model=WeekSnapshot)
def pause_week(session: WeekDep) -> WeekSnapshot:
    session.pause()
    return week_snapshot(session)


@router.post("/sessions/{session_id}/seek", response_model=WeekSnapshot)
def seek_week(body: SeekRequest, session: WeekDep) -> WeekSnapshot:
    if body.preset:
        session.seek(_preset_time(session.slate, body.preset))
    elif body.at is not None:
        session.seek(body.at)
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pass 'at' or 'preset'")
    return week_snapshot(session)


@router.put("/sessions/{session_id}/watch", response_model=WeekSnapshot)
def watch_games(body: WatchRequest, session: WeekDep) -> WeekSnapshot:
    """Which games' big moments stop this viewer's clock (12 s holds; answering releases early)."""
    try:
        session.watch(body.game_ids, body.level)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    return week_snapshot(session)


@router.post("/sessions/{session_id}/release", response_model=WeekSnapshot)
def release_hold(session: WeekDep) -> WeekSnapshot:
    """End the current hold now (e.g. the viewer answered)."""
    session.release()
    return week_snapshot(session)


@router.post("/sessions/{session_id}/speed", response_model=WeekSnapshot)
def set_week_speed(body: WeekSpeedRequest, session: WeekDep) -> WeekSnapshot:
    try:
        session.set_speed(body.speed)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    return week_snapshot(session)
