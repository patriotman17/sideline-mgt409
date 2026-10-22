from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
    #: Where each dataset was loaded from ("supabase" / "local"), once loaded; never connection details.
    data_sources: dict[str, str] = {}


@router.get("/health", response_model=HealthResponse)
@router.get("/api/v1/status", response_model=HealthResponse)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Liveness probe. Must never expose secrets or configuration values.

    `/health` is for the host's health checks; the app uses `/api/v1/status`, because some privacy /
    tracker blockers refuse any browser request to a path named `/health` (seen on iOS Safari and Dia)."""
    from app.history_stats.data import get_history_stats
    from app.replay.catalog import get_catalog

    sources: dict[str, str] = {}
    if get_catalog.cache_info().currsize:  # only report what's already loaded (never trigger a load here)
        sources["games"] = get_catalog().source
    if get_history_stats.cache_info().currsize:
        history = get_history_stats()
        sources["history"] = history.data.source if history else "unavailable"
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        environment=settings.environment,
        data_sources=sources,
    )
