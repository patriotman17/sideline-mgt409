"""Ingestion: source -> normalized events, graceful handling of bad data."""

from __future__ import annotations

from itertools import pairwise

from app.replay.ingest import classify, derive_scoring, game_title
from app.replay.models import PlayKind, ScoreType, TurnoverType
from tests.replay.conftest import make_row


def test_real_games_ingest_without_warnings(divisional, super_bowl):
    for game in (divisional, super_bowl):
        assert game.warnings == ()
        assert game.events[0].kind is PlayKind.GAME_START
        assert game.events[-1].kind is PlayKind.END_GAME
        assert [e.sequence for e in game.events] == list(range(len(game.events)))
        assert game.provenance.license and "CC BY 4.0" in game.provenance.license
        assert game.provenance.source_url and "nflverse-data" in game.provenance.source_url
        assert not game.provenance.is_test_fixture


def test_game_metadata(divisional, super_bowl):
    assert divisional.info.title == "AFC Divisional Round"
    assert (divisional.info.away.abbr, divisional.info.home.abbr) == ("KC", "BUF")
    assert divisional.info.home.name == "Bills"
    assert divisional.info.game_date == "2024-01-21"
    assert super_bowl.info.title == "Super Bowl LVIII"


def test_events_are_chronological(divisional, super_bowl):
    for game in (divisional, super_bowl):
        timed = [e for e in game.events if e.clock_seconds is not None]
        for prev, cur in pairwise(timed):
            assert cur.quarter >= prev.quarter, f"event {cur.sequence} goes back a quarter"
            if cur.quarter == prev.quarter:
                assert cur.clock_seconds <= prev.clock_seconds, f"event {cur.sequence} clock runs backwards"


def test_classification():
    assert classify(make_row(play_type="pass", two_point_conv_result="success")) is PlayKind.TWO_POINT
    assert classify(make_row(play_type="no_play", penalty="1")) is PlayKind.PENALTY
    assert classify(make_row(play_type="no_play", play_type_nfl="TIMEOUT", timeout="1")) is PlayKind.TIMEOUT
    assert classify(make_row(play_type_nfl="END_QUARTER")) is PlayKind.END_QUARTER
    assert classify(make_row(play_type="qb_kneel")) is PlayKind.KNEEL
    assert classify(make_row()) is PlayKind.OTHER


def test_scoring_derivation_covers_every_score_type():
    def kinds(row):
        return [(s.type, s.team, s.points) for s in derive_scoring(row)]

    assert kinds(make_row(posteam="KC", defteam="BUF", touchdown="1", td_team="KC")) == [(ScoreType.TOUCHDOWN, "KC", 6)]
    assert kinds(make_row(posteam="KC", field_goal_result="made")) == [(ScoreType.FIELD_GOAL, "KC", 3)]
    assert kinds(make_row(posteam="KC", field_goal_result="missed")) == []
    assert kinds(make_row(posteam="KC", extra_point_result="good")) == [(ScoreType.EXTRA_POINT, "KC", 1)]
    assert kinds(make_row(posteam="KC", extra_point_result="blocked")) == []
    assert kinds(make_row(posteam="KC", two_point_conv_result="success")) == [(ScoreType.TWO_POINT, "KC", 2)]
    assert kinds(make_row(posteam="KC", defteam="BUF", safety="1")) == [(ScoreType.SAFETY, "BUF", 2)]
    assert kinds(make_row(posteam="KC", defteam="BUF", defensive_two_point_conv="1")) == [
        (ScoreType.DEFENSIVE_CONVERSION, "BUF", 2)
    ]
    # Defensive touchdown: td_team is the defense.
    assert kinds(make_row(posteam="KC", defteam="BUF", touchdown="1", td_team="BUF")) == [
        (ScoreType.TOUCHDOWN, "BUF", 6)
    ]


def test_missing_fields_stay_none_instead_of_invented(fixture_game):
    game = fixture_game(
        make_row(play_type_nfl="GAME_START", time="15:00"),
        # No clock string, no down, no spot, "NA" everywhere it's allowed.
        make_row(
            play_type="run",
            posteam="KC",
            defteam="BUF",
            time="NA",
            quarter_seconds_remaining="842",
            down="NA",
            ydstogo="",
            yardline_100="NA",
            yards_gained="NA",
            desc="Run with sparse data",
        ),
        make_row(play_type="pass", posteam="KC", defteam="BUF", time="13:30", down="2", ydstogo="7", yrdln="KC 30"),
        make_row(play_type_nfl="END_GAME", time="00:00"),
    )
    sparse = game.events[1]
    assert sparse.clock_seconds == 842  # fell back to quarter_seconds_remaining
    assert sparse.before.down is None and sparse.before.distance is None and sparse.before.yardline_100 is None
    assert sparse.yards_gained is None
    assert sparse.after.down == 2 and sparse.after.ball_on == "KC 30"
    assert sparse.home_win_probability_after is None
    assert game.events[2].after.possession is None  # nothing after it but END GAME


def test_unattributable_score_is_flagged_not_guessed(fixture_game):
    game = fixture_game(
        make_row(play_type_nfl="GAME_START", time="15:00", total_home_score="0", total_away_score="0"),
        # Touchdown flag without td_team, but the source total says KC scored.
        make_row(
            play_type="run",
            posteam="KC",
            defteam="BUF",
            time="10:00",
            touchdown="1",
            total_home_score="0",
            total_away_score="6",
        ),
        make_row(
            play_type_nfl="END_GAME",
            time="00:00",
            total_home_score="0",
            total_away_score="6",
            home_score="0",
            away_score="6",
        ),
    )
    assert game.events[1].scoring == ()
    assert any("score mismatch" in w for w in game.warnings)


def test_missing_end_game_row_is_reported(fixture_game):
    game = fixture_game(make_row(play_type_nfl="GAME_START", time="15:00"))
    assert any("END GAME" in w for w in game.warnings)


def test_muffed_punt_turnover_is_attributed_to_the_receiving_team(super_bowl):
    muff = next(e for e in super_bowl.events if e.kind is PlayKind.PUNT and e.turnover)
    assert muff.offense == "KC"  # kicking team
    assert muff.turnover and muff.turnover.type is TurnoverType.FUMBLE
    assert (muff.turnover.lost_by, muff.turnover.gained_by) == ("SF", "KC")


def test_turnover_on_downs_detected(divisional):
    downs = [e for e in divisional.events if e.turnover and e.turnover.type is TurnoverType.DOWNS]
    assert len(downs) == 1
    assert (downs[0].turnover.lost_by, downs[0].turnover.gained_by) == ("BUF", "KC")
    assert downs[0].before.down == 4


def test_titles():
    assert game_title("POST", 19, 2023, "AFC") == "AFC Wild Card Round"
    assert game_title("POST", 21, 2023, "NFC") == "NFC Conference Championship"
    assert game_title("POST", 22, 2023, "AFC") == "Super Bowl LVIII"
    assert game_title("REG", 5, 2023, None) == "Week 5"
    assert game_title(None, None, None, None) == "NFL game"
