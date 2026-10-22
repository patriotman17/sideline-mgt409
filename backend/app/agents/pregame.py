"""Sideline Preview: a second, smaller agent that writes a pregame preview for one game.

It reads only the deterministic season context (``app/pregame/season.py``: weeks before this game's
week) through two read-only tools. The prompt is written entirely by the server (no user text reaches
it), so there is nothing to inject. Previews are shared by every user and cached per game + data
version, so the whole week costs one call per game.

Safeguards beyond the shared runner (budget, usage limits, timeout, audit):
- ``check_preview`` drops evidence citing tools that weren't called and flags any number that no tool
  returned (``grounding_issues``; confidence drops to low).
- ``mentions_result`` withholds a preview that states this game's real final score. The model may know
  how these 2025 games ended; the instructions forbid it, and this check enforces it.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Literal, get_args

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

from app.agents.agent import ToolTracking, ToolUnavailable, _run_tool
from app.agents.audit import ToolCallRecord
from app.pregame.season import Leader, Matchup, Result, Storyline

#: Bump when the preview instructions or tool outputs change (invalidates cached previews).
PREVIEW_PROMPT_VERSION = "pg.1"

PreviewTool = Literal["get_matchup_overview", "get_team_leaders"]
PREVIEW_TOOLS: tuple[str, ...] = get_args(PreviewTool)


class PreviewEvidence(BaseModel):
    tool: PreviewTool
    fact: str = Field(max_length=200, description="The specific fact used, as stated by the tool")


class PregamePreview(BaseModel):
    headline: str = Field(max_length=80, description="A short, punchy title for the matchup (no result)")
    preview: str = Field(max_length=600, description="2-3 sentences previewing the game")
    evidence: list[PreviewEvidence] = Field(default_factory=list, max_length=4)
    confidence: Literal["high", "medium", "low"]


INSTRUCTIONS = """\
You are Sideline, writing a short pregame preview of an NFL game that has NOT kicked off yet.

Rules (in priority order):
1. Grounding: use only facts returned by your tools. Call get_matchup_overview first; call
   get_team_leaders for any player you mention. Never invent or estimate numbers, players or results.
2. No future knowledge: the tools cover only the weeks before this game. This is a real past game and you
   may recognize it: NEVER state, hint at, or predict the winner, the score, or anything that happened in
   this game or later in the season. No predictions, no betting talk, no injuries (you have no injury data).
3. Data limits: no formations, schemes, injuries, weather or betting lines. Season numbers only.
4. Style: a headline of at most 8 words and a preview of 2-3 sentences (at most 450 characters) that a
   casual fan understands. Lead with what makes this matchup interesting. Use player names as the tools
   give them (e.g. 'J.Allen'). Add 1-4 evidence items citing the tool and fact you used.
"""


class TeamLeadersOut(BaseModel):
    team: str
    leaders: list[Leader]


class TeamOverview(BaseModel):
    team: str
    record: str
    streak: str | None
    last_results: list[str]
    points_per_game: float
    points_allowed_per_game: float
    yards_per_game: float
    turnover_margin: int
    league_ranks: dict[str, int]


class MatchupOverview(BaseModel):
    matchup: str
    season: int
    week: int
    data_covers_weeks: list[int]
    away: TeamOverview
    home: TeamOverview
    earlier_meetings: list[str]
    storylines: list[str]
    data_limitations: str


def _overview(form_team: str, m: Matchup) -> TeamOverview:
    f = m.home if form_team == m.home.team else m.away
    return TeamOverview(
        team=f.team,
        record=f.record,
        streak=f.streak,
        last_results=[f"Week {r.week}: {r.label}" for r in f.last_results],
        points_per_game=f.points_per_game,
        points_allowed_per_game=f.points_allowed_per_game,
        yards_per_game=f.yards_per_game,
        turnover_margin=f.turnover_margin,
        league_ranks=f.ranks,
    )


def matchup_overview(m: Matchup) -> MatchupOverview:
    def meeting(r: Result) -> str:
        return f"Week {r.week}: {m.home.team} {r.label}"

    def story(s: Storyline) -> str:
        return s.text

    return MatchupOverview(
        matchup=f"{m.away.team} @ {m.home.team}",
        season=m.season,
        week=m.week,
        data_covers_weeks=m.weeks_included,
        away=_overview(m.away.team, m),
        home=_overview(m.home.team, m),
        earlier_meetings=[meeting(r) for r in m.meetings],
        storylines=[story(s) for s in m.storylines],
        data_limitations=(
            f"Regular-season games from weeks {m.weeks_included[0]}-{m.weeks_included[-1]} only; nothing from "
            f"Week {m.week} or later. Ranks are among all 32 teams (1 = best; 'allowed' 1 = fewest). {m.notes}"
        ),
    )


@dataclass
class PreviewDeps(ToolTracking):
    matchup: Matchup
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    #: Every number the tools returned this run (for the invented-number check).
    seen: list[str] = field(default_factory=list)

    def saw[M: BaseModel](self, out: M) -> M:
        self.seen.append(out.model_dump_json())
        return out


preview_agent: Agent[PreviewDeps, PregamePreview] = Agent(
    output_type=PregamePreview,
    deps_type=PreviewDeps,
    instructions=INSTRUCTIONS,
    retries=1,
    name="sideline_preview",
    defer_model_check=True,
)


@preview_agent.tool
def get_matchup_overview(ctx: RunContext[PreviewDeps]) -> MatchupOverview | ToolUnavailable:
    """Both teams' season so far (weeks before this game only): records, streaks, last results, points
    scored/allowed and yards per game, turnover margin, league ranks, earlier meetings, storylines."""
    deps = ctx.deps
    return _run_tool(deps, "get_matchup_overview", {}, lambda: deps.saw(matchup_overview(deps.matchup)))


@preview_agent.tool
def get_team_leaders(ctx: RunContext[PreviewDeps], team: str) -> TeamLeadersOut | ToolUnavailable:
    """A team's season leaders in passing, rushing and receiving yards (with TDs and league rank).

    Args:
        team: One of the two teams in this matchup, e.g. "BUF".
    """
    deps = ctx.deps

    def run() -> TeamLeadersOut:
        m = deps.matchup
        code = team.strip().upper()
        form = m.home if code == m.home.team else m.away if code == m.away.team else None
        if form is None:
            raise ValueError(f"{team!r} is not in this matchup ({m.away.team} @ {m.home.team})")
        return deps.saw(TeamLeadersOut(team=form.team, leaders=form.leaders))

    return _run_tool(deps, "get_team_leaders", {"team": team}, run)


# ---------------------------------------------------------------- checks

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> set[str]:
    out = set()
    for raw in _NUMBER.findall(text):
        value = raw.replace(",", "")
        out.add(value)
        if value.endswith(".0"):
            out.add(value[:-2])
    return out


def check_preview(preview: PregamePreview, deps: PreviewDeps) -> tuple[PregamePreview, list[str]]:
    """Drop evidence from uncalled tools; flag numbers no tool returned (likely invented)."""
    called = {c.name for c in deps.tool_calls if c.ok}
    issues: list[str] = []
    evidence = [e for e in preview.evidence if e.tool in called]
    if len(evidence) < len(preview.evidence):
        issues.append("evidence cited a tool that was not called")
    known = set()
    for blob in deps.seen:
        known |= _numbers(blob)
        # Tool outputs are JSON; also accept integers written inside strings like "4-0" or "W 31-19".
        known |= _numbers(json.dumps(json.loads(blob)))
    unknown = sorted(n for n in _numbers(f"{preview.headline} {preview.preview}") if n not in known)
    if unknown:
        issues.append(f"numbers not returned by any tool: {', '.join(unknown[:6])}")
    if not called:
        issues.append("no tool was called")
    confidence = "low" if issues else preview.confidence
    return preview.model_copy(update={"evidence": evidence, "confidence": confidence}), issues


def mentions_result(text: str, home_score: int, away_score: int) -> bool:
    """True if ``text`` states this game's real final score ("31-28", "28 to 31", en/em dashes too)."""
    a, b = sorted((home_score, away_score), reverse=True)
    sep = r"\s*(?:-|\u2013|\u2014|to)\s*"
    pattern = rf"(?<!\d)(?:{a}{sep}{b}|{b}{sep}{a})(?!\d)"
    return re.search(pattern, text) is not None
