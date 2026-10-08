"""Versioned API router. Feature routers mount here."""

from fastapi import APIRouter

from app.api.routes import replay

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(replay.router, prefix="/replay")

# Phase 2C+: api_router.include_router(assistant.router, prefix="/assistant")
