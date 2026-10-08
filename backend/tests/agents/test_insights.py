"""Deterministic insight rules."""

from __future__ import annotations

from app.agents.insights import detect_insights, latest_insights
from app.agents.view import ReplayView


def kinds_at(game, cursor):
    return [(i.play_sequence, i.kind) for i in detect_insights(ReplayView.at(game, cursor))]


def test_known_divisional_moments(divisional):
    found = kinds_at(divisional, len(divisional.events))
    assert (127, "turnover") in found  # BUF failed fake punt (turnover on downs)
    assert (129, "turnover") in found  # KC fumble
    assert (157, "missed_kick") in found  # BUF missed FG late
    assert sum(1 for _, k in found if k == "lead_change") == 5
    assert found[-1] == (165, "final")


def test_known_super_bowl_moments(super_bowl):
    found = kinds_at(super_bowl, len(super_bowl.events))
    assert (172, "end_of_regulation") in found
    assert (134, "missed_kick") in found  # blocked PAT
    assert (205, "lead_change") in found  # walk-off TD


def test_no_insights_beyond_cursor(super_bowl):
    for cursor in (0, 50, 120):
        assert all(seq < cursor for seq, _ in kinds_at(super_bowl, cursor))


def test_latest_insights_newest_first(divisional):
    items = latest_insights(ReplayView.at(divisional, len(divisional.events)), limit=3)
    assert [i.play_sequence for i in items] == sorted((i.play_sequence for i in items), reverse=True)
    assert len(items) == 3
