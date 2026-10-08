"""Engine: deterministic scoreboard updates, using real nflverse games."""

from __future__ import annotations

from app.replay.engine import apply_event, initial_state, replay
from app.replay.models import GameStatus, PlayKind, TurnoverType


def state_after(game, predicate):
    """State right after the first event matching ``predicate``."""
    event = next(e for e in game.events if predicate(e))
    return event, replay(game, event.sequence + 1)


# ---------------------------------------------------------------- final scores


def test_final_scores_match_official_results(divisional, super_bowl):
    for game, (away, home) in ((divisional, (27, 24)), (super_bowl, (22, 25))):
        final = replay(game, len(game.events))
        assert final.status is GameStatus.FINAL
        assert (final.away_score, final.home_score) == (away, home)
        assert (final.away_score, final.home_score) == (game.final_away_score, game.final_home_score)
        assert sum(final.away_linescore) == away and sum(final.home_linescore) == home


def test_score_matches_source_after_every_play(divisional, super_bowl):
    for game in (divisional, super_bowl):
        state = initial_state(game)
        for e in game.events:
            state = apply_event(state, e, game)
            if e.source_home_score_after is not None:
                assert (state.home_score, state.away_score) == (e.source_home_score_after, e.source_away_score_after)


def test_super_bowl_linescore_includes_overtime(super_bowl):
    final = replay(super_bowl, len(super_bowl.events))
    assert final.away_linescore == (0, 10, 0, 9, 3)  # SF
    assert final.home_linescore == (0, 3, 10, 6, 6)  # KC, walk-off TD in OT


def test_replay_is_deterministic(divisional):
    assert replay(divisional, 120) == replay(divisional, 120)


# ---------------------------------------------------------------- scoring


def test_field_goal_scores_three_and_flips_possession_for_kickoff(divisional):
    fg, state = state_after(divisional, lambda e: e.kind is PlayKind.FIELD_GOAL and e.scoring)
    assert fg.offense == "BUF"
    assert (state.home_score, state.away_score) == (3, 0)
    assert state.home_linescore[0] == 3
    assert state.possession == "KC"  # receives the kickoff


def test_touchdown_then_extra_point(divisional):
    td, after_td = state_after(divisional, lambda e: any(s.type == "touchdown" for s in e.scoring))
    xp = divisional.events[td.sequence + 1]
    assert xp.kind is PlayKind.EXTRA_POINT
    after_xp = replay(divisional, xp.sequence + 1)
    scorer_is_home = td.scoring[0].team == divisional.info.home.abbr
    before = replay(divisional, td.sequence)
    delta_td = (
        (after_td.home_score - before.home_score) if scorer_is_home else (after_td.away_score - before.away_score)
    )
    delta_xp = (
        (after_xp.home_score - after_td.home_score) if scorer_is_home else (after_xp.away_score - after_td.away_score)
    )
    assert (delta_td, delta_xp) == (6, 1)


def test_blocked_extra_point_scores_nothing(super_bowl):
    blocked = next(e for e in super_bowl.events if e.kind is PlayKind.EXTRA_POINT and "Blocked" in e.description)
    before = replay(super_bowl, blocked.sequence)
    after = replay(super_bowl, blocked.sequence + 1)
    assert (after.home_score, after.away_score) == (before.home_score, before.away_score)


# ---------------------------------------------------------------- turnovers & possession


def test_interception_changes_possession(super_bowl):
    pick, state = state_after(super_bowl, lambda e: e.turnover and e.turnover.type is TurnoverType.INTERCEPTION)
    assert pick.offense == "KC"
    assert state.possession == "SF"
    assert state.down == 1


def test_lost_fumble_changes_possession(divisional):
    fumble, state = state_after(divisional, lambda e: e.turnover and e.turnover.type is TurnoverType.FUMBLE)
    assert fumble.offense == "KC"
    assert state.possession == "BUF"


def test_muffed_punt_keeps_ball_with_kicking_team(super_bowl):
    _, state = state_after(super_bowl, lambda e: e.kind is PlayKind.PUNT and e.turnover)
    assert state.possession == "KC"


def test_punt_hands_ball_to_receiving_team(divisional):
    punt, state = state_after(divisional, lambda e: e.kind is PlayKind.PUNT and not e.turnover and not e.penalty)
    assert state.possession == punt.defense
    assert state.down == 1


def test_turnover_on_downs_gives_ball_to_defense(divisional):
    play, state = state_after(divisional, lambda e: e.turnover and e.turnover.type is TurnoverType.DOWNS)
    assert state.possession == play.defense == "KC"


# ---------------------------------------------------------------- penalties


def test_pre_snap_penalty_moves_the_ball_back_without_using_a_down(divisional):
    foul = next(e for e in divisional.events if e.penalty and e.penalty.type == "Delay of Game")
    assert foul.kind is PlayKind.PENALTY and foul.penalty.no_play and foul.penalty.yards == 5
    state = replay(divisional, foul.sequence + 1)
    assert state.down == foul.before.down
    assert state.distance == foul.before.distance + 5
    assert state.yardline_100 == foul.before.yardline_100 + 5


def test_penalty_on_scoring_try_does_not_change_score(divisional):
    foul = next(e for e in divisional.events if e.penalty and e.penalty.type == "Encroachment")
    before = replay(divisional, foul.sequence)
    after = replay(divisional, foul.sequence + 1)
    assert (after.home_score, after.away_score) == (before.home_score, before.away_score)


# ---------------------------------------------------------------- clock, quarters, timeouts


def test_quarter_transitions(divisional):
    ends = [e for e in divisional.events if e.kind is PlayKind.END_QUARTER]
    assert [e.quarter for e in ends] == [1, 2, 3]
    q1 = replay(divisional, ends[0].sequence + 1)
    assert (q1.status, q1.quarter, q1.clock_seconds) == (GameStatus.END_OF_QUARTER, 1, 0)
    first_q2 = replay(divisional, ends[0].sequence + 2)
    assert first_q2.quarter == 2 and first_q2.status is GameStatus.IN_PROGRESS
    assert first_q2.clock_seconds is not None and first_q2.clock_seconds < 900
    assert replay(divisional, ends[1].sequence + 1).status is GameStatus.HALFTIME


def test_tied_regulation_goes_to_overtime(super_bowl):
    end_reg = next(e for e in super_bowl.events if e.kind is PlayKind.END_QUARTER and e.quarter == 4)
    state = replay(super_bowl, end_reg.sequence + 1)
    assert state.status is GameStatus.END_OF_REGULATION
    assert state.home_score == state.away_score == 19
    ot = replay(super_bowl, end_reg.sequence + 2)
    assert ot.quarter == 5 and len(ot.home_linescore) == 5


def test_walk_off_overtime_ends_with_time_left(super_bowl):
    final = replay(super_bowl, len(super_bowl.events))
    assert final.status is GameStatus.FINAL and final.quarter == 5
    assert final.clock_seconds == 3
    assert final.possession is None and final.down is None
    assert final.home_win_probability == 1.0


def test_game_start_sets_full_clock(divisional):
    state = replay(divisional, 1)
    assert (state.status, state.quarter, state.clock_seconds) == (GameStatus.IN_PROGRESS, 1, 900)


def test_timeouts_decrement(divisional):
    timeout = next(e for e in divisional.events if e.kind is PlayKind.TIMEOUT and e.timeout_team == "KC")
    before = replay(divisional, timeout.sequence)
    after = replay(divisional, timeout.sequence + 1)
    assert before.away_timeouts is not None
    assert after.away_timeouts == before.away_timeouts - 1
    assert after.home_timeouts == before.home_timeouts


def test_timeout_fallback_when_source_counts_missing(fixture_game):
    from tests.replay.conftest import make_row

    game = fixture_game(
        make_row(play_type_nfl="GAME_START", time="15:00"),
        make_row(play_type="no_play", play_type_nfl="TIMEOUT", timeout="1", timeout_team="BUF", time="10:00"),
        make_row(play_type_nfl="END_GAME", time="00:00"),
    )
    state = replay(game, 2)
    assert (state.home_timeouts, state.away_timeouts) == (2, 3)


# ---------------------------------------------------------------- no future leakage


def test_state_never_depends_on_later_events(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for k in range(len(game.events) + 1):
            assert replay(game, k) == replay(game, k, events=game.events[:k])


def test_state_only_contains_revealed_plays(divisional):
    k = 50
    state = replay(divisional, k)
    assert state.plays_revealed == k
    revealed = {p.sequence for p in state.recent_plays}
    assert revealed and max(revealed) == k - 1
    assert state.last_play is not None and state.last_play.sequence == k - 1
