"""Replay predictions API (Phase 2D). Same session token as the replay endpoints.

Server-authoritative: clients send only a prediction id and an option id. Positions,
locks, outcomes and points are decided by the deterministic ledger. Every read
advances the session to "now" first and hides anything revealed after the current
replay position (e.g. after a rewind).
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.agents.service import AIError
from app.api.routes.replay import AIDep, SessionDep
from app.predictions.ledger import PredictionError, PredictionItem, visible_items
from app.predictions.models import POINTS, Answer, PredictionStats, PredictionStatus, PredictionType
from app.replay.sessions import ReplaySession

router = APIRouter(tags=["predictions"])

SCORING_NOTE = (
    "Demo scoring: historical replays have known outcomes, so points are per replay session and "
    "never competitive. Each prediction can be answered once, before its play is revealed."
)


class PredictionsOverview(BaseModel):
    cursor: int
    scoring_mode: Literal["demo"] = "demo"
    scoring_note: str = SCORING_NOTE
    points_table: dict[PredictionType, int] = Field(default_factory=lambda: dict(POINTS))
    pause_for_predictions: bool
    paused_for_prediction: bool
    #: After a rewind/restart: new predictions resume only after this play (where the session left off).
    resumes_after_play: int | None
    open: list[PredictionItem]
    locked: list[PredictionItem]
    resolved: list[PredictionItem]
    stats: PredictionStats


class AnswerRequest(BaseModel):
    option_id: str = Field(min_length=1, max_length=40)


class AnswerResponse(BaseModel):
    answer: Answer
    created: bool = Field(description="False when this exact answer was already recorded (idempotent retry)")
    resumed_playback: bool
    item: PredictionItem


class HistoryResponse(BaseModel):
    cursor: int
    items: list[PredictionItem]
    stats: PredictionStats


class SettingsRequest(BaseModel):
    pause_for_predictions: bool


class ExplainResponse(BaseModel):
    prediction_id: str
    explanation: str


_HTTP = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "already_answered": status.HTTP_409_CONFLICT,
    "locked": status.HTTP_409_CONFLICT,
    "invalid_option": status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def _error(exc: PredictionError) -> HTTPException:
    return HTTPException(_HTTP.get(exc.code, 400), {"code": exc.code, "message": exc.message})


def _items(session: ReplaySession) -> tuple[int, list[PredictionItem], PredictionStats]:
    """Consistent read under the session lock (after advancing to now)."""
    with session.locked():
        session.snapshot()
        cursor = session.cursor
        return cursor, visible_items(session.predictions, cursor), session.predictions.stats()


@router.get("/sessions/{session_id}/predictions", response_model=PredictionsOverview)
def overview(session: SessionDep, resolved_limit: Annotated[int, Query(ge=0, le=100)] = 20) -> PredictionsOverview:
    """Everything the predictions UI needs in one poll: open, locked, recent results, stats."""
    with session.locked():
        cursor, items, stats = _items(session)
        high_water = session.predictions.high_water
        return PredictionsOverview(
            cursor=cursor,
            pause_for_predictions=session.pause_for_predictions,
            paused_for_prediction=session.pause_reason == "prediction",
            resumes_after_play=high_water if cursor < high_water else None,
            open=[i for i in items if i.prediction.status is PredictionStatus.OPEN],
            locked=[i for i in items if i.prediction.status is PredictionStatus.LOCKED],
            resolved=[i for i in items if i.prediction.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID)][
                :resolved_limit
            ],
            stats=stats,
        )


@router.get("/sessions/{session_id}/predictions/open", response_model=list[PredictionItem])
def open_predictions(session: SessionDep) -> list[PredictionItem]:
    _, items, _ = _items(session)
    return [i for i in items if i.prediction.status is PredictionStatus.OPEN]


@router.get("/sessions/{session_id}/predictions/resolved", response_model=list[PredictionItem])
def resolved_predictions(session: SessionDep, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> list[PredictionItem]:
    _, items, _ = _items(session)
    done = (PredictionStatus.RESOLVED, PredictionStatus.VOID)
    return [i for i in items if i.prediction.status in done][:limit]


@router.get("/sessions/{session_id}/predictions/history", response_model=HistoryResponse)
def history(session: SessionDep) -> HistoryResponse:
    """Every prediction this session has seen at or before the current position, with answers and points."""
    cursor, items, stats = _items(session)
    return HistoryResponse(cursor=cursor, items=items, stats=stats)


@router.get("/sessions/{session_id}/predictions/stats", response_model=PredictionStats)
def stats(session: SessionDep) -> PredictionStats:
    return _items(session)[2]


@router.post("/sessions/{session_id}/predictions/{prediction_id}/answer", response_model=AnswerResponse)
def answer(prediction_id: str, body: AnswerRequest, session: SessionDep) -> AnswerResponse:
    """Lock in an answer. Final once recorded; repeating the same answer is idempotent."""
    with session.locked():
        try:
            ans, created, resumed = session.submit_prediction(prediction_id, body.option_id)
        except PredictionError as exc:
            raise _error(exc) from None
        item = next(i for i in visible_items(session.predictions, session.cursor) if i.prediction.id == prediction_id)
        return AnswerResponse(answer=ans, created=created, resumed_playback=resumed, item=item)


@router.put("/sessions/{session_id}/predictions/settings", response_model=PredictionsOverview)
def settings(body: SettingsRequest, session: SessionDep) -> PredictionsOverview:
    session.set_pause_for_predictions(body.pause_for_predictions)
    return overview(session)


@router.post("/sessions/{session_id}/predictions/{prediction_id}/explain", response_model=ExplainResponse)
async def explain(prediction_id: str, session: SessionDep, ai: AIDep) -> ExplainResponse:
    """Optional AI explanation of a *resolved* prediction (outcome already revealed). The outcome itself
    always comes from the deterministic ledger; the AI only explains it. Shared cache + budget + audit."""
    _, items, _ = _items(session)
    item = next((i for i in items if i.prediction.id == prediction_id), None)
    p = item.prediction if item else None
    if p is None or p.resolved_cursor is None or p.status not in (PredictionStatus.RESOLVED, PredictionStatus.VOID):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"code": "not_resolved", "message": "Explanations are available once the result is in."},
        )
    labels = {o.id: o.label for o in p.options}
    result = labels.get(p.correct_option_id or "", "Void")
    try:
        text = await ai.explain(
            game=session.game,
            sequence=p.resolved_cursor - 1,
            kind=f"prediction_{p.type.value}",
            headline=f"{p.question} Result: {result}. {p.resolution_summary or ''}",
            facts=f"situation when asked: {p.situation}; window: {p.window}",
        )
    except AIError as exc:
        raise HTTPException(exc.status_code, {"code": exc.code, "message": exc.message}) from None
    return ExplainResponse(prediction_id=prediction_id, explanation=text)
