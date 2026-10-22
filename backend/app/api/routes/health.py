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


@router.get("/health", response_model=HealthResponse)
@router.get("/api/v1/status", response_model=HealthResponse)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Liveness probe. Must never expose secrets or configuration values.

    `/health` is for the host's health checks; the app uses `/api/v1/status`, because some privacy /
    tracker blockers refuse any browser request to a path named `/health` (seen on iOS Safari and Dia)."""
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        environment=settings.environment,
    )
