"""Historical season stats (1999-2024): correct, never 2025, same data from Supabase or the local files."""

from __future__ import annotations

import pytest

from app.agents.assistant import career_tool, season_leaders_tool, season_summary_tool, team_history_tool
from app.history_stats.data import (
    LAST_ALLOWED_SEASON,
    HistoryIntegrityError,
    HistoryStats,
    content_sha256,
    load_history,
    load_local,
)


@pytest.fixture(scope="module")
def local():
    return load_local()


@pytest.fixture(scope="module")
def h(local):
    return HistoryStats(local)


def test_files_match_their_checksum_and_stop_at_2024(local):
    assert local.meta["content_sha256"] == content_sha256(local.players, local.teams)
    assert max(r.season for r in local.players) == LAST_ALLOWED_SEASON == 2024
    assert min(r.season for r in local.teams) == 1999
    assert len(local.teams) == 829  # 31 teams in 1999-2001, then 32


def test_a_2025_row_is_refused(local):
    bad = local.players[0]._replace(season=2025)
    tampered = type(local)(players=[*local.players, bad], teams=local.teams, meta=local.meta, source="local")
    with pytest.raises(HistoryIntegrityError):
        HistoryStats(tampered)


def test_known_records(h):
    brady = h.find_players("Tom Brady")[0]
    assert sum(r.pass_td for r in brady) == 649  # official regular-season career total
    assert h.leaders(2012, "rush_yards", 1)[0].player_name == "Adrian Peterson"
    ne07 = next(r for r in h.team_seasons("NE") if r.season == 2007)
    assert (ne07.wins, ne07.losses, ne07.playoff_result) == (16, 0, "Lost Super Bowl")
    champs = {r.season: r.team for r in h.data.teams if r.playoff_result == "Won Super Bowl"}
    assert champs[2015] == "DEN" and champs[2024] == "PHI" and len(champs) == 26


def test_tools(h):
    career = career_tool(h, "Peyton Manning")
    assert career.player == "Peyton Manning"  # type: ignore[union-attr]
    assert career.incomplete_career_warning  # type: ignore[union-attr]  # his career began in 1998
    assert career_tool(h, "Patrick Mahomes").incomplete_career_warning is None  # type: ignore[union-attr]
    assert career_tool(h, "Nobody Atall").available is False  # type: ignore[union-attr]
    lead = season_leaders_tool(h, 2007, "pass_td", 1)
    assert lead.leaders[0].player == "Tom Brady" and lead.leaders[0].value == 50  # type: ignore[union-attr]
    assert season_leaders_tool(h, 2025, "pass_td").available is False  # type: ignore[union-attr]
    team = team_history_tool(h, "NE", 2007)
    assert "16-0" in team.seasons[0] and "Lost Super Bowl" in team.seasons[0]  # type: ignore[union-attr]
    assert team_history_tool(h, "ZZZ").available is False  # type: ignore[union-attr]
    summary = season_summary_tool(h, 2019)
    assert summary.super_bowl_champion == "KC" and summary.super_bowl_runner_up == "SF"  # type: ignore[union-attr]


def _rows(local):
    build = {
        "first_season": 1999,
        "last_season": 2024,
        "sources": local.meta["sources"],
        "license": local.meta["license"],
        "attribution": local.meta["attribution"],
        "generated_at": "2026-10-22 19:02:00+00",
        "content_sha256": local.meta["content_sha256"],
    }
    return build, [r._asdict() for r in local.players], [t._asdict() for t in local.teams]


def test_supabase_copy_gives_the_same_data_in_any_order(local):
    build, players, teams = _rows(local)
    remote = load_history(lambda: (build, players[::-1], teams[::-1]))
    assert remote.source == "supabase"
    assert HistoryStats(remote).version == HistoryStats(local).version


def test_tampered_or_missing_supabase_data_falls_back_to_local(local):
    build, players, teams = _rows(local)
    players[0] = {**players[0], "pass_td": players[0]["pass_td"] + 1}
    assert load_history(lambda: (build, players, teams)).source == "local"
    assert load_history(lambda: (None, [], [])).source == "local"

    def broken():
        raise ConnectionError("password=secret")

    assert load_history(broken).source == "local"
