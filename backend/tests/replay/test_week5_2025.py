"""Regression tests for the full 2025 Week 5 slate (14 games, nflverse play-by-play)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.agents.stats import player_stats
from app.agents.view import ReplayView
from app.replay.catalog import GameCatalog
from app.replay.engine import replay
from app.replay.models import Game, GameStatus, PlayKind

WEEK5 = {
    # game_id: (date, away final, home final)
    "2025_05_SF_LA": ("2025-10-02", 26, 23),  # Thursday night, overtime
    "2025_05_MIN_CLE": ("2025-10-05", 21, 17),  # London (neutral site)
    "2025_05_DAL_NYJ": ("2025-10-05", 37, 22),
    "2025_05_DEN_PHI": ("2025-10-05", 21, 17),
    "2025_05_HOU_BAL": ("2025-10-05", 44, 10),
    "2025_05_LV_IND": ("2025-10-05", 6, 40),
    "2025_05_MIA_CAR": ("2025-10-05", 24, 27),
    "2025_05_NYG_NO": ("2025-10-05", 14, 26),
    "2025_05_DET_CIN": ("2025-10-05", 37, 24),
    "2025_05_TB_SEA": ("2025-10-05", 38, 35),
    "2025_05_TEN_ARI": ("2025-10-05", 22, 21),
    "2025_05_WAS_LAC": ("2025-10-05", 27, 10),
    "2025_05_NE_BUF": ("2025-10-05", 23, 20),  # Sunday night
    "2025_05_KC_JAX": ("2025-10-06", 28, 31),  # Monday night
}
GOLDEN = json.loads((Path(__file__).parent / "data" / "week5_2025_player_yards.json").read_text())["games"]


@pytest.fixture(scope="module")
def week5(catalog: GameCatalog) -> dict[str, Game]:
    games = {gid: catalog.get(gid) for gid in WEEK5}
    missing = [gid for gid, g in games.items() if g is None]
    assert not missing, f"missing extracts: {missing}"
    return {gid: g for gid, g in games.items() if g is not None}


def test_all_14_games_ingest_cleanly(week5):
    assert len(week5) == 14
    for gid, g in week5.items():
        assert g.warnings == (), (gid, g.warnings)
        assert (g.info.season, g.info.week, g.info.season_type) == (2025, 5, "REG")
        assert g.info.game_date == WEEK5[gid][0]
        assert "CC BY 4.0" in (g.provenance.license or "") and g.provenance.source_sha256


def test_engine_final_scores_match_the_source(week5):
    for gid, g in week5.items():
        final = replay(g, len(g.events))
        assert final.status is GameStatus.FINAL, gid
        assert (final.away_score, final.home_score) == WEEK5[gid][1:], gid
        assert (final.away_score, final.home_score) == (g.final_away_score, g.final_home_score)


def test_quarters_clock_timeouts_and_sequences_are_consistent(week5):
    for gid, g in week5.items():
        seqs = [e.sequence for e in g.events]
        assert seqs == list(range(seqs[0], seqs[0] + len(seqs))), gid
        assert g.events[-1].kind is PlayKind.END_GAME, gid
        end_quarters = sum(e.kind is PlayKind.END_QUARTER for e in g.events)
        assert end_quarters == (4 if gid == "2025_05_SF_LA" else 3), gid  # only SF-LA went to OT
        prev_q, prev_clock = 1, None
        for k in range(1, len(g.events) + 1):
            s = replay(g, k) if k % 25 == 0 or k == len(g.events) else None
            if s is None:
                continue
            assert s.quarter >= prev_q, (gid, k)
            if s.quarter == prev_q and prev_clock is not None and s.clock_seconds is not None:
                assert s.clock_seconds <= prev_clock + 1, (gid, k)
            for t in (s.home_timeouts, s.away_timeouts):
                assert t is None or 0 <= t <= 3, (gid, k)
            prev_q, prev_clock = s.quarter, s.clock_seconds


def test_player_yards_match_nflverse_independent_columns(week5):
    """Engine stats vs nflverse's own passing/rushing/receiving yards (columns the extract doesn't use)."""
    compared = 0
    for gid, g in week5.items():
        stats = player_stats(ReplayView.at(g, len(g.events)))
        for name, cats in GOLDEN[gid].items():
            p = stats[name]
            mine = {
                "pass": p.passing.yards if p.passing else None,
                "rush": p.rushing.yards if p.rushing else None,
                "rec": p.receiving.yards if p.receiving else None,
            }
            for cat, yards in cats.items():
                assert mine[cat] == yards, (gid, name, cat, mine[cat], yards)
                compared += 1
    assert compared == 360


def test_no_future_leakage_mid_game(week5):
    """Halfway through any game, the revealed view knows nothing about later plays or the final."""
    for gid, g in week5.items():
        k = len(g.events) // 2
        view = ReplayView.at(g, k)
        assert len(view.events) == k
        later = {e.sequence for e in g.events[k:]}
        assert not later & {e.sequence for e in view.events}, gid
        assert view.state.status is not GameStatus.FINAL, gid
