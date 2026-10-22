"""Pregame API: season-to-date context for an upcoming game, and an optional AI preview.

Public (no session): everything here comes from the weeks *before* the game, which had already happened
when it kicked off, so it can't spoil the game. The game's own result is never read, except by the
preview's leak check, which only ever withholds text.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.agents.service import AIError, PreviewResult
from app.api.routes.replay import AIDep, CatalogDep, _ai_http_error
from app.pregame.season import Matchup, season_for
from app.replay.models import Game

router = APIRouter(tags=["pregame"])


def _matchup(game_id: str, catalog: CatalogDep) -> tuple[Game, Matchup]:
    game = catalog.get(game_id)
    info = game.info if game else None
    if game is None or info is None or info.season is None or info.week is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found")
    season = season_for(info.season, info.week)
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No pregame data for {info.season} week {info.week}")
    try:
        return game, season.matchup(info.home.abbr, info.away.abbr)
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No pregame data for this matchup") from None


class PregameOut(Matchup):
    #: The shared AI preview if one has been written already (free to show; never triggers a model call).
    ai_preview: PreviewResult | None = None


@router.get("/{game_id}", response_model=PregameOut)
def get_pregame(game_id: str, catalog: CatalogDep, ai: AIDep) -> PregameOut:
    """Both teams' records, form, averages, league ranks, leaders and storylines from earlier weeks."""
    game, matchup = _matchup(game_id, catalog)
    return PregameOut(**matchup.model_dump(), ai_preview=ai.cached_preview(game=game, matchup=matchup))


@router.post("/{game_id}/preview", response_model=PreviewResult)
async def preview(game_id: str, request: Request, catalog: CatalogDep, ai: AIDep) -> PreviewResult:
    """AI pregame preview (Sideline Preview agent). Shared and cached per game; rate-limited per client."""
    game, matchup = _matchup(game_id, catalog)
    client = request.client.host if request.client else "unknown"
    try:
        return await ai.preview(game=game, matchup=matchup, client=client)
    except AIError as exc:
        raise _ai_http_error(exc) from None
