"""Versioned API router. Feature routers mount here."""

from fastapi import APIRouter

from app.api.routes import ai, replay

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(replay.router, prefix="/replay")
api_router.include_router(ai.router, prefix="/ai")
