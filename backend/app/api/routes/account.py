"""Account endpoints (require a Supabase login token)."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.auth import AuthenticatedUser, CurrentUser

router = APIRouter(tags=["account"])


@router.get("/me", response_model=AuthenticatedUser)
def me(user: CurrentUser) -> AuthenticatedUser:
    """Who the bearer token belongs to. Profile data itself lives in Supabase behind RLS."""
    return user
