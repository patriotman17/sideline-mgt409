"""Versioned API router. Feature routers (games, assistant, parties) mount here."""

from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")

# Phase 2+: api_router.include_router(games.router, prefix="/games")
# Phase 2+: api_router.include_router(assistant.router, prefix="/assistant")
