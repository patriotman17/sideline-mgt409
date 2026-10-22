"""Ask Sideline (general assistant): football questions from anywhere in the app.

`POST /api/v1/assistant/ask`. Public like the pregame endpoints; rate-limited per client and covered by
the daily AI budget. If the app sends its week session (`week_session_id` + `X-Session-Token`), answers
about "now" use that viewer's scoreboard, and finals the viewer's clock hasn't reached are protected.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.agents.assistant import ScoreboardGame
from app.agents.service import AIError, AssistResult
from app.api.routes.replay import AIDep, CatalogDep, _ai_http_error
from app.api.routes.week import SlatesDep, WeekManagerDep, week_snapshot
from app.history_stats.data import get_history_stats
from app.pregame.season import season_for
from app.replay.week import WeekSessionNotFound

router = APIRouter(tags=["assistant"])


class AssistRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    #: Earlier questions the user asked in this chat (their own text only; at most 3 are used).
    previous_questions: list[Annotated[str, Field(max_length=500)]] = Field(default_factory=list, max_length=6)
    week_session_id: str | None = Field(default=None, max_length=64)


@router.post("/ask", response_model=AssistResult)
async def ask_assistant(
    body: AssistRequest,
    request: Request,
    ai: AIDep,
    catalog: CatalogDep,
    slates: SlatesDep,
    manager: WeekManagerDep,
    x_session_token: Annotated[str | None, Header()] = None,
) -> AssistResult:
    if not slates:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No season data loaded")
    # The viewer's week (optional). An unknown or wrong session is simply ignored: answers then use no
    # live scoreboard and treat every game of the featured week as not finished yet.
    session = None
    if body.week_session_id:
        try:
            candidate = manager.get(body.week_session_id)
        except WeekSessionNotFound:
            candidate = None
        if candidate is not None and candidate.check_token(x_session_token):
            session = candidate
    slate_key = (session.slate.season, session.slate.week) if session else max(slates)
    slate = slates[slate_key]
    season = season_for(*slate_key)
    if season is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No season data for this week")

    scoreboard: list[ScoreboardGame] | None = None
    as_of: str | None = None
    finished: set[str] = set()
    if session is not None:
        snap = week_snapshot(session)
        as_of = snap.sim_time_label.split(" · ", 1)[-1] if " · " in snap.sim_time_label else snap.sim_time_label
        scoreboard = []
        for g in snap.games:
            matchup = f"{g.away.abbr} @ {g.home.abbr}"
            if g.phase == "scheduled":
                scoreboard.append(ScoreboardGame(matchup, "scheduled", f"kickoff {g.kickoff_label} ET"))
            else:
                score = f"{g.away.abbr} {g.away_score}, {g.home.abbr} {g.home_score}"
                scoreboard.append(ScoreboardGame(matchup, str(g.phase), f"{score} ({g.period_label or ''})".strip()))
                if g.phase == "final":
                    finished.add(g.game_id)
    unrevealed = [
        (item.game.final_home_score, item.game.final_away_score)
        for item in slate.games
        if item.game.info.game_id not in finished
        and item.game.final_home_score is not None
        and item.game.final_away_score is not None
    ]
    client = request.client.host if request.client else "unknown"
    try:
        return await ai.assist(
            question=body.question,
            previous_questions=body.previous_questions,
            season=season,
            history=get_history_stats(),
            scoreboard=scoreboard,
            scoreboard_as_of=as_of,
            unrevealed_finals=[(h, a) for h, a in unrevealed if h is not None and a is not None],
            client=client,
        )
    except AIError as exc:
        raise _ai_http_error(exc) from None
