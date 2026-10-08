"""Historical replay API (+ Ask Sideline and insights for a replay session).

Sessions are isolated per id and protected by a per-session secret token sent in
the ``X-Session-Token`` header (returned once at creation; never in URLs or logs).
Responses never include events past the session cursor, the final score, or
source warnings (which can quote scores) — only a count.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.agents.budget import RateLimited as RateLimitedError
from app.agents.insights import Insight, latest_insights
from app.agents.service import AIError, AIService, AskResult, AsOf, as_of
from app.agents.view import ReplayView
from app.core.config import get_settings
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


@lru_cache
def get_ai_service() -> AIService:
    return AIService(get_settings())


CatalogDep = Annotated[GameCatalog, Depends(get_catalog)]
ManagerDep = Annotated[ReplaySessionManager, Depends(get_session_manager)]
AIDep = Annotated[AIService, Depends(get_ai_service)]


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
    #: True when the server paused playback because a new prediction opened.
    paused_for_prediction: bool = False
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


class CreatedSession(ReplaySnapshot):
    session_token: str = Field(description="Secret for X-Session-Token. Returned only once.")


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class InsightsResponse(BaseModel):
    as_of: AsOf
    ai_configured: bool
    insights: list[Insight]


class CreateSessionRequest(BaseModel):
    game_id: str
    speed: float = Field(default=1.0, ge=MIN_SPEED, le=MAX_SPEED)
    autoplay: bool = False
    #: Pause playback when a new prediction opens so there's time to answer.
    pause_for_predictions: bool = True


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
            paused_for_prediction=session.pause_reason == "prediction",
            speed=speed,
            seconds_per_play=SECONDS_PER_PLAY,
            cursor=cursor,
            total_events=total,
            progress=round(cursor / total, 4) if total else 1.0,
        ),
        state=state,
    )


def authorized_session(
    session_id: str,
    manager: ManagerDep,
    x_session_token: Annotated[str | None, Header()] = None,
) -> ReplaySession:
    """Resolve a session and require its token. Unknown ids and bad tokens are indistinguishable (404)."""
    try:
        session = manager.get(session_id)
    except SessionNotFound:
        session = None
    if session is None or not session.check_token(x_session_token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Replay session not found or expired")
    return session


SessionDep = Annotated[ReplaySession, Depends(authorized_session)]


def _control(session: ReplaySession, action: str, *args: object) -> ReplaySnapshot:
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


@router.post("/sessions", response_model=CreatedSession, status_code=status.HTTP_201_CREATED)
def create_session(body: CreateSessionRequest, catalog: CatalogDep, manager: ManagerDep) -> CreatedSession:
    game = catalog.get(body.game_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown game: {body.game_id}")
    session = manager.create(game, speed=body.speed, pause_for_predictions=body.pause_for_predictions)
    if body.autoplay:
        session.play()
    return CreatedSession(**snapshot(session).model_dump(), session_token=session.token)


@router.get("/sessions/{session_id}", response_model=ReplaySnapshot)
def get_session(session: SessionDep) -> ReplaySnapshot:
    """Current state. Poll this while playing (the cursor advances with wall-clock time)."""
    return snapshot(session)


@router.post("/sessions/{session_id}/play", response_model=ReplaySnapshot)
def play(session: SessionDep) -> ReplaySnapshot:
    return _control(session, "play")


@router.post("/sessions/{session_id}/pause", response_model=ReplaySnapshot)
def pause(session: SessionDep) -> ReplaySnapshot:
    return _control(session, "pause")


@router.post("/sessions/{session_id}/resume", response_model=ReplaySnapshot)
def resume(session: SessionDep) -> ReplaySnapshot:
    return _control(session, "resume")


@router.post("/sessions/{session_id}/restart", response_model=ReplaySnapshot)
def restart(session: SessionDep) -> ReplaySnapshot:
    return _control(session, "restart")


@router.post("/sessions/{session_id}/step", response_model=ReplaySnapshot)
def step(session: SessionDep, body: StepRequest | None = None) -> ReplaySnapshot:
    return _control(session, "step", (body or StepRequest()).plays)


@router.put("/sessions/{session_id}/speed", response_model=ReplaySnapshot)
def set_speed(body: SpeedRequest, session: SessionDep) -> ReplaySnapshot:
    return _control(session, "set_speed", body.speed)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session: SessionDep, manager: ManagerDep) -> Response:
    try:
        manager.delete(session.id)
    except SessionNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Replay session not found or expired") from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- Ask Sideline + insights


def _ai_http_error(exc: AIError) -> HTTPException:
    return HTTPException(exc.status_code, {"code": exc.code, "message": exc.message})


@router.post("/sessions/{session_id}/ask", response_model=AskResult)
async def ask(body: AskRequest, session: SessionDep, ai: AIDep) -> AskResult:
    """Answer a question using only data revealed at this session's current replay position."""
    cursor = session.snapshot()[2]  # captured once: the answer is "as of" this play
    try:
        return await ai.ask(
            game=session.game,
            cursor=cursor,
            question=body.question,
            session_id=session.id,
            conversation=session.conversation,
        )
    except AIError as exc:
        raise _ai_http_error(exc) from None


class ConversationTurnOut(BaseModel):
    request_id: str
    question: str
    answer: str
    cursor: int
    period: str
    clock: str | None


class ConversationOut(BaseModel):
    cursor: int
    turns: list[ConversationTurnOut] = Field(description="Turns asked at or before the current replay position")
    hidden_later: int = Field(description="Turns from later replay positions, hidden until the replay reaches them")


@router.get("/sessions/{session_id}/conversation", response_model=ConversationOut)
def get_conversation(session: SessionDep) -> ConversationOut:
    """The chat as the server will use it at the current position (lets clients stay in sync after rewinds)."""
    cursor = session.snapshot()[2]
    turns, hidden = session.conversation.visible(cursor)
    return ConversationOut(
        cursor=cursor,
        turns=[
            ConversationTurnOut(
                request_id=t.request_id,
                question=t.question,
                answer=t.answer,
                cursor=t.cursor,
                period=t.period,
                clock=t.clock,
            )
            for t in turns
        ],
        hidden_later=hidden,
    )


@router.delete("/sessions/{session_id}/conversation", status_code=status.HTTP_204_NO_CONTENT)
def reset_conversation(session: SessionDep) -> Response:
    """Start a new Ask Sideline chat for this session (forgets earlier turns)."""
    session.conversation.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{session_id}/insights", response_model=InsightsResponse)
async def insights(
    session: SessionDep,
    ai: AIDep,
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    explain: Annotated[int, Query(ge=0, le=3, description="Max new AI explanations to generate")] = 2,
) -> InsightsResponse:
    """Noteworthy moments so far (deterministic), with cached/new AI explanations."""
    view = ReplayView.at(session.game, session.snapshot()[2])
    items = latest_insights(view, limit=limit)
    for item in items:
        cached = ai.cached_explanation(game=session.game, sequence=item.play_sequence, kind=item.kind)
        if cached:
            item.explanation, item.explanation_status = cached, "cached"
    budget = explain
    for item in items:
        if budget <= 0 or item.explanation or item.importance < 3:
            continue
        budget -= 1
        try:
            ai.limiter.hit(f"{session.id}:insights")
            item.explanation = await ai.explain(
                game=session.game,
                sequence=item.play_sequence,
                kind=item.kind,
                headline=item.headline,
                facts=", ".join(f"{k}: {v}" for k, v in item.facts.items() if v is not None),
            )
            item.explanation_status = "generated"
        except RateLimitedError:
            item.explanation_status = "rate_limited"
            break
        except AIError as exc:
            item.explanation_status = (
                exc.code if exc.code in ("not_configured", "budget_exceeded", "rate_limited", "blocked") else "error"
            )
            if exc.code in ("not_configured", "budget_exceeded"):
                break
    return InsightsResponse(as_of=as_of(view), ai_configured=ai.settings.ai_configured, insights=items)
