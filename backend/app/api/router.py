"""Versioned API router. Feature routers mount here."""

from fastapi import APIRouter

from app.api.routes import account, ai, assistant, predictions, pregame, replay, week

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(replay.router, prefix="/replay")
api_router.include_router(predictions.router, prefix="/replay")
api_router.include_router(ai.router, prefix="/ai")
api_router.include_router(account.router)
api_router.include_router(week.router, prefix="/week")
api_router.include_router(pregame.router, prefix="/pregame")
api_router.include_router(assistant.router, prefix="/assistant")
