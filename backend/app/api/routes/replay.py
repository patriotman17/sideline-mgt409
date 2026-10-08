"""Historical replay API.

Sessions are addressed by unguessable ids so concurrent users never share
playback state. Responses never include events past the session cursor, the
final score, or source warnings (which can quote scores) — only a count.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.replay.catalog import GameCatalog, get_catalog
from app.replay.models import Game, GameState, Team
from app.replay.sessions import (
    MAX_SPEED,
    MIN_SPEED,
    SECONDS_PER_PLAY,
    InvalidTransition,
    PlaybackStatus,
    ReplaySession,
    ReplaySessionManager,
    SessionNotFound,
)

router = APIRouter(tags=["replay"])


@lru_cache
def get_session_manager() -> ReplaySessionManager:
    return ReplaySessionManager()


CatalogDep = Annotated[GameCatalog, Depends(get_catalog)]
ManagerDep = Annotated[ReplaySessionManager, Depends(get_session_manager)]


# ---------------------------------------------------------------- schemas


class GameSummary(BaseModel):
    game_id: str
    title: str
    season: int | None
    season_type: str | None
    week: int | None
    game_date: str | None
    venue: str | None
    home: Team
    away: Team
    spread_line: float | None = Field(description="Closing spread; positive = home favored")
    total_line: float | None
    total_events: int
    attribution: str | None
    license: str | None
    is_test_fixture: bool
    data_warnings: int = Field(
        description="Count of source validation issues (details withheld: they can reveal scores)"
    )


class PlaybackInfo(BaseModel):
    status: PlaybackStatus
    speed: float
    seconds_per_play: float
    cursor: int
    total_events: int
    progress: float


class ReplaySnapshot(BaseModel):
    session_id: str
    game: GameSummary
    playback: PlaybackInfo
    state: GameState


class CreateSessionRequest(BaseModel):
    game_id: str
    speed: float = Field(default=1.0, ge=MIN_SPEED, le=MAX_SPEED)
    autoplay: bool = False


class SpeedRequest(BaseModel):
    speed: float = Field(ge=MIN_SPEED, le=MAX_SPEED)


class StepRequest(BaseModel):
    plays: int = Field(default=1, ge=1, le=50)


# ---------------------------------------------------------------- helpers


def summarize(game: Game) -> GameSummary:
    info = game.info
    return GameSummary(
        game_id=info.game_id,
        title=info.title,
        season=info.season,
        season_type=info.season_type,
        week=info.week,
        game_date=info.game_date,
        venue=info.venue,
        home=info.home,
        away=info.away,
        spread_line=info.spread_line,
        total_line=info.total_line,
        total_events=len(game.events),
        attribution=game.provenance.attribution,
        license=game.provenance.license,
        is_test_fixture=game.provenance.is_test_fixture,
        data_warnings=len(game.warnings),
    )


def snapshot(session: ReplaySession) -> ReplaySnapshot:
    playback_status, speed, cursor, state = session.snapshot()
    total = session.total_events
    return ReplaySnapshot(
        session_id=session.id,
        game=summarize(session.game),
        playback=PlaybackInfo(
            status=playback_status,
            speed=speed,
            seconds_per_play=SECONDS_PER_PLAY,
            cursor=cursor,
            total_events=total,
            progress=round(cursor / total, 4) if total else 1.0,
        ),
        state=state,
    )


def _session(manager: ReplaySessionManager, session_id: str) -> ReplaySession:
    try:
        return manager.get(session_id)
    except SessionNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Replay session not found or expired") from None


def _control(manager: ReplaySessionManager, session_id: str, action: str, *args: object) -> ReplaySnapshot:
    session = _session(manager, session_id)
    try:
        getattr(session, action)(*args)
    except InvalidTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return snapshot(session)


# ---------------------------------------------------------------- routes


@router.get("/games", response_model=list[GameSummary])
def list_games(catalog: CatalogDep) -> list[GameSummary]:
    """Historical games available for replay (no results included)."""
    return [summarize(g) for g in catalog.list()]


@router.post("/sessions", response_model=ReplaySnapshot, status_code=status.HTTP_201_CREATED)
def create_session(body: CreateSessionRequest, catalog: CatalogDep, manager: ManagerDep) -> ReplaySnapshot:
    game = catalog.get(body.game_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown game: {body.game_id}")
    session = manager.create(game, speed=body.speed)
    if body.autoplay:
        session.play()
    return snapshot(session)


@router.get("/sessions/{session_id}", response_model=ReplaySnapshot)
def get_session(session_id: str, manager: ManagerDep) -> ReplaySnapshot:
    """Current state. Poll this while playing (the cursor advances with wall-clock time)."""
    return snapshot(_session(manager, session_id))


@router.post("/sessions/{session_id}/play", response_model=ReplaySnapshot)
def play(session_id: str, manager: ManagerDep) -> ReplaySnapshot:
    return _control(manager, session_id, "play")


@router.post("/sessions/{session_id}/pause", response_model=ReplaySnapshot)
def pause(session_id: str, manager: ManagerDep) -> ReplaySnapshot:
    return _control(manager, session_id, "pause")


@router.post("/sessions/{session_id}/resume", response_model=ReplaySnapshot)
def resume(session_id: str, manager: ManagerDep) -> ReplaySnapshot:
    return _control(manager, session_id, "resume")


@router.post("/sessions/{session_id}/restart", response_model=ReplaySnapshot)
def restart(session_id: str, manager: ManagerDep) -> ReplaySnapshot:
    return _control(manager, session_id, "restart")


@router.post("/sessions/{session_id}/step", response_model=ReplaySnapshot)
def step(session_id: str, manager: ManagerDep, body: StepRequest | None = None) -> ReplaySnapshot:
    return _control(manager, session_id, "step", (body or StepRequest()).plays)


@router.put("/sessions/{session_id}/speed", response_model=ReplaySnapshot)
def set_speed(session_id: str, body: SpeedRequest, manager: ManagerDep) -> ReplaySnapshot:
    return _control(manager, session_id, "set_speed", body.speed)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, manager: ManagerDep) -> Response:
    try:
        manager.delete(session_id)
    except SessionNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Replay session not found or expired") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
