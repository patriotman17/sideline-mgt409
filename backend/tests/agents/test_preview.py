"""Sideline Preview agent: grounded, cached once per game, never states the game's result. No paid calls."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agents.pregame import PregamePreview, PreviewDeps, check_preview, matchup_overview, mentions_result
from app.agents.service import AIError
from app.api.routes.replay import get_ai_service
from app.main import create_app
from app.pregame.season import season_for
from app.replay.catalog import get_catalog
from tests.agents.conftest import scripted

GAME = "2025_05_NE_BUF"


def run(coro):
    import asyncio

    return asyncio.run(coro)


@pytest.fixture(scope="module")
def game_and_matchup():
    game = get_catalog().get(GAME)
    season = season_for(2025, 5)
    assert game is not None and season is not None
    return game, season.matchup(game.info.home.abbr, game.info.away.abbr)


def good_preview(returns: dict[str, Any]) -> dict[str, Any]:
    home = returns["get_matchup_overview"]["home"]
    return {
        "headline": "Unbeaten Bills host the Patriots",
        "preview": f"{home['team']} is {home['record']} and scores {home['points_per_game']} points a game.",
        "evidence": [{"tool": "get_matchup_overview", "fact": f"{home['team']} is {home['record']}"}],
        "confidence": "high",
    }


def counting(model):
    calls = {"n": 0}
    inner = model.function

    def fn(messages, info):
        calls["n"] += 1
        return inner(messages, info)

    model.function = fn
    return model, calls


def test_preview_is_grounded_and_audited(make_service, game_and_matchup):
    game, matchup = game_and_matchup
    service = make_service(scripted([("get_matchup_overview", {})], good_preview))
    result = run(service.preview(game=game, matchup=matchup, client="t"))
    assert result.status == "ok"
    assert result.preview.preview == "BUF is 4-0 and scores 33.2 points a game."
    assert result.grounding_issues == []
    assert result.preview.confidence == "high"
    record = service.audit.recent(1)[0]
    assert record.kind == "preview" and record.status == "ok"
    assert [c.name for c in record.tool_calls] == ["get_matchup_overview"]
    assert record.cached_input_tokens == 0 and record.input_tokens > 0


def test_one_model_call_per_game_then_cached_for_everyone(make_service, game_and_matchup):
    game, matchup = game_and_matchup
    model, calls = counting(scripted([("get_matchup_overview", {})], good_preview))
    service = make_service(model)
    first = run(service.preview(game=game, matchup=matchup, client="a"))
    n = calls["n"]
    second = run(service.preview(game=game, matchup=matchup, client="b"))
    assert calls["n"] == n  # no new model call
    assert second.status == "cached" and second.usage.input_tokens == 0
    assert second.preview == first.preview
    assert service.cached_preview(game=game, matchup=matchup) is not None


def test_concurrent_requests_share_one_call(make_service, game_and_matchup):
    import asyncio

    game, matchup = game_and_matchup
    model, calls = counting(scripted([("get_matchup_overview", {})], good_preview))
    service = make_service(model)

    async def many():
        return await asyncio.gather(*(service.preview(game=game, matchup=matchup, client=str(i)) for i in range(5)))

    results = asyncio.run(many())
    assert sorted(r.status for r in results) == ["cached"] * 4 + ["ok"]
    assert calls["n"] == 2  # one run = tool call turn + answer turn


def test_invented_numbers_are_flagged(make_service, game_and_matchup):
    game, matchup = game_and_matchup

    def invented(returns):
        out = good_preview(returns)
        out["preview"] = "BUF has 412 sacks this season."
        return out

    service = make_service(scripted([("get_matchup_overview", {})], invented))
    result = run(service.preview(game=game, matchup=matchup, client="t"))
    assert any("412" in i for i in result.grounding_issues)
    assert result.preview.confidence == "low"


def test_stating_the_real_final_score_is_withheld(make_service, game_and_matchup):
    game, matchup = game_and_matchup
    final = f"{game.final_away_score}-{game.final_home_score}"

    def leak(returns):
        out = good_preview(returns)
        out["preview"] = f"NE pulls off the upset, {final}."
        return out

    service = make_service(scripted([("get_matchup_overview", {})], leak))
    with pytest.raises(AIError) as err:
        run(service.preview(game=game, matchup=matchup, client="t"))
    assert err.value.code == "withheld" and err.value.status_code == 502
    assert final not in err.value.message
    assert service.audit.recent(1)[0].status == "withheld"
    assert service.cached_preview(game=game, matchup=matchup) is None  # never cached


def test_mentions_result_patterns():
    assert mentions_result("a 23-20 win", 20, 23)
    assert mentions_result("won 20 to 23", 23, 20)
    assert mentions_result(f"23{chr(0x2013)}20", 20, 23)  # en dash
    assert not mentions_result("123-20", 20, 23)
    assert not mentions_result("23-21", 20, 23)


def test_team_leaders_rejects_teams_outside_the_matchup(game_and_matchup):
    from app.agents.pregame import TeamLeadersOut

    _, matchup = game_and_matchup
    deps = PreviewDeps(matchup=matchup)
    from app.agents.agent import ToolUnavailable, _run_tool

    def run():
        raise ValueError("not in matchup")

    assert isinstance(_run_tool(deps, "get_team_leaders", {"team": "KC"}, run), ToolUnavailable)
    assert deps.tool_calls[0].ok is False
    assert TeamLeadersOut(team="BUF", leaders=matchup.home.leaders).leaders[0].player == "J.Allen"


def test_evidence_from_uncalled_tools_is_dropped(game_and_matchup):
    _, matchup = game_and_matchup
    deps = PreviewDeps(matchup=matchup)
    deps.saw(matchup_overview(matchup))
    preview = PregamePreview(
        headline="x",
        preview="BUF is 4-0.",
        evidence=[{"tool": "get_team_leaders", "fact": "J.Allen"}],
        confidence="high",
    )
    checked, issues = check_preview(preview, deps)
    assert checked.evidence == [] and checked.confidence == "low"
    assert "evidence cited a tool that was not called" in issues


def test_budget_and_config_guards(make_service, game_and_matchup):
    game, matchup = game_and_matchup
    broke = make_service(scripted([("get_matchup_overview", {})], good_preview), ai_daily_budget_usd=0.0)
    with pytest.raises(AIError) as err:
        run(broke.preview(game=game, matchup=matchup, client="t"))
    assert err.value.code == "budget_exceeded"
    unconfigured = make_service(scripted([], good_preview), portkey_api_key=None)
    with pytest.raises(AIError) as err:
        run(unconfigured.preview(game=game, matchup=matchup, client="t"))
    assert err.value.code == "not_configured"


def test_preview_endpoint_and_cached_copy_on_get(make_service):
    app = create_app()
    service = make_service(scripted([("get_matchup_overview", {})], good_preview))
    app.dependency_overrides[get_ai_service] = lambda: service
    client = TestClient(app)
    r = client.post(f"/api/v1/pregame/{GAME}/preview")
    assert r.status_code == 200, r.text
    assert r.json()["preview"]["headline"] == "Unbeaten Bills host the Patriots"
    again = client.get(f"/api/v1/pregame/{GAME}").json()
    assert again["ai_preview"]["preview"]["headline"] == "Unbeaten Bills host the Patriots"
    assert client.post("/api/v1/pregame/nope/preview").status_code == 404
