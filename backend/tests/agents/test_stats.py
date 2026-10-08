"""Deterministic stats vs official box scores, and revealed-only computation."""

from __future__ import annotations

from app.agents.stats import counted, player_stats, team_stats
from app.agents.view import ReplayView
from app.replay.models import PlayKind


def final(game):
    return ReplayView.at(game, len(game.events))


def test_super_bowl_box_score(super_bowl):
    ps = player_stats(final(super_bowl))
    mahomes = ps["P.Mahomes"].passing
    assert mahomes and (
        mahomes.completions,
        mahomes.attempts,
        mahomes.yards,
        mahomes.touchdowns,
        mahomes.interceptions,
    ) == (34, 46, 333, 2, 1)
    purdy = ps["B.Purdy"].passing
    assert purdy and (purdy.completions, purdy.attempts, purdy.yards, purdy.touchdowns) == (23, 38, 255, 1)
    cmc = ps["C.McCaffrey"]
    assert cmc.rushing and (cmc.rushing.attempts, cmc.rushing.yards) == (22, 80)
    assert cmc.receiving and (cmc.receiving.receptions, cmc.receiving.yards, cmc.receiving.touchdowns) == (8, 80, 1)
    kelce = ps["T.Kelce"].receiving
    assert kelce and (kelce.receptions, kelce.yards) == (9, 93)
    moody = ps["J.Moody"].kicking
    assert moody and (moody.field_goals_made, moody.field_goals_attempted, moody.long_made) == (3, 3, 55)
    assert (moody.extra_points_made, moody.extra_points_attempted) == (1, 2)  # one blocked


def test_divisional_box_score(divisional):
    ps = player_stats(final(divisional))
    allen = ps["J.Allen"]
    assert allen.passing and (
        allen.passing.completions,
        allen.passing.attempts,
        allen.passing.yards,
        allen.passing.touchdowns,
    ) == (26, 39, 186, 1)
    assert allen.rushing and (allen.rushing.attempts, allen.rushing.yards, allen.rushing.touchdowns) == (12, 72, 2)
    mahomes = ps["P.Mahomes"].passing
    assert mahomes and (mahomes.completions, mahomes.attempts, mahomes.yards, mahomes.touchdowns) == (17, 23, 215, 2)
    assert ps["T.Kelce"].receiving and ps["T.Kelce"].receiving.touchdowns == 2
    bass = ps["T.Bass"].kicking
    assert bass and (bass.field_goals_made, bass.field_goals_attempted) == (1, 2)


def test_team_stats_points_match_engine(divisional, super_bowl):
    for game in (divisional, super_bowl):
        view = final(game)
        away, home = team_stats(view)
        assert (away.points, home.points) == (view.state.away_score, view.state.home_score)
        for t in (away, home):
            assert t.total_yards == t.passing_yards_net + t.rushing_yards
            assert t.completions <= t.pass_attempts


def test_turnovers_exclude_downs(divisional):
    away, home = team_stats(final(divisional))
    assert (away.team, away.turnovers) == ("KC", 1)  # the fumble; BUF's failed fake punt is a turnover on downs
    assert (home.team, home.turnovers) == ("BUF", 0)


def test_stats_only_use_revealed_plays(divisional):
    half = next(e for e in divisional.events if e.kind is PlayKind.END_QUARTER and e.quarter == 2).sequence + 1
    early = player_stats(ReplayView.at(divisional, half))
    late = player_stats(final(divisional))
    assert early["J.Allen"].rushing and late["J.Allen"].rushing
    assert early["J.Allen"].rushing.yards < late["J.Allen"].rushing.yards
    assert all(p for p in early)  # nothing beyond the cursor
    assert ReplayView.at(divisional, half).events == divisional.events[:half]


def test_nullified_plays_do_not_count(divisional):
    nullified = [e for e in divisional.events if e.kind is PlayKind.PENALTY]
    assert nullified
    kept = counted(divisional.events)
    assert not any(e.kind is PlayKind.PENALTY for e in kept)
