"""AI status and (development-only) audit inspection. Never returns secrets."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.agents.audit import AuditRecord
from app.api.routes.replay import AIDep
from app.core.config import Settings, get_settings

router = APIRouter(tags=["ai"])


@router.get("/status")
def ai_status(ai: AIDep) -> dict[str, object]:
    """Whether AI is configured, the model in use, and today's estimated spend vs budget."""
    return ai.status()


@router.get("/audit", response_model=list[AuditRecord])
def ai_audit(
    ai: AIDep,
    settings: Annotated[Settings, Depends(get_settings)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AuditRecord]:
    """Recent AI audit records (development only)."""
    if not settings.is_development:
        raise HTTPException(404, "Not found")
    return ai.audit.recent(limit)
