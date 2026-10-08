"""Eligibility and deterministic resolution, on the real Chiefs-Bills and Super Bowl LVIII data."""

from __future__ import annotations

from app.predictions.models import PredictionStatus, PredictionType
from app.predictions.rules import Revealed, detect, new_drive_started
from app.replay.engine import replay
from app.replay.models import PlayKind
from tests.predictions.helpers import final, ledger_at, pred

T = PredictionType


def revealed(game, cursor):
    snaps = [
        e for e in game.events[:cursor] if e.kind not in (PlayKind.TIMEOUT, PlayKind.END_QUARTER, PlayKind.GAME_START)
    ]
    return Revealed(info=game.info, state=replay(game, cursor), last_snap=snaps[-1] if snaps else None, cursor=cursor)


# ---------------------------------------------------------------- eligibility


def test_nothing_offered_before_kickoff_or_after_the_final(divisional):
    assert detect(revealed(divisional, 0), next_score_pending=False) == []
    assert detect(revealed(divisional, len(divisional.events)), next_score_pending=False) == []


def test_drive_start_offers_drive_and_next_score_questions(divisional):
    r = revealed(divisional, 2)  # after the opening kickoff
    assert new_drive_started(r)
    kinds = {p.type for p in detect(r, next_score_pending=False)}
    assert kinds == {T.DRIVE_TOUCHDOWN, T.NEXT_SCORE}
    assert T.NEXT_SCORE not in {p.type for p in detect(r, next_score_pending=True)}


def test_next_play_only_on_third_down(divisional):
    for cursor in range(len(divisional.events) + 1):
        r = revealed(divisional, cursor)
        for p in detect(r, next_score_pending=True):
            if p.type is T.NEXT_PLAY_GAIN_5:
                assert r.state.down == 3


def test_fourth_down_offered_only_when_going_for_it_is_plausible(divisional, super_bowl):
    offered = {p.opened_cursor for p in final(divisional).all() if p.type is T.FOURTH_DOWN_CONVERSION}
    assert offered == {5, 23, 150, 157}  # 4th&1, 4th&5 at BUF 29, 4th&3 at midfield, late 4th&9 trailing
    assert 127 not in offered  # BUF's fake punt on 4th&5 at its own 30 wasn't a predictable spot
    sb = {p.opened_cursor for p in final(super_bowl).all() if p.type is T.FOURTH_DOWN_CONVERSION}
    assert {94, 116, 131} <= sb


def test_no_duplicate_question_across_a_timeout(super_bowl):
    ot_fourth = [
        p for p in final(super_bowl).all() if p.type is T.FOURTH_DOWN_CONVERSION and p.opened_cursor in (194, 195)
    ]
    assert [p.opened_cursor for p in ot_fourth] == [194]


# ---------------------------------------------------------------- resolution


def test_fourth_down_converted(divisional):
    p = pred(final(divisional), T.FOURTH_DOWN_CONVERSION, 5)
    assert (p.status, p.correct_option_id) == (PredictionStatus.RESOLVED, "yes")
    assert p.locked_cursor == p.resolved_cursor == 6


def test_fourth_down_not_attempted_is_void(divisional, super_bowl):
    fg = pred(final(divisional), T.FOURTH_DOWN_CONVERSION, 23)
    assert fg.status is PredictionStatus.VOID and "field goal" in (fg.void_reason or "")
    punt = pred(final(super_bowl), T.FOURTH_DOWN_CONVERSION, 94)
    assert punt.status is PredictionStatus.VOID and "punt" in (punt.void_reason or "")


def test_next_play_wiped_out_by_penalty_is_void(divisional):
    p = pred(final(divisional), T.NEXT_PLAY_GAIN_5, 108)
    assert p.status is PredictionStatus.VOID and "penalty" in (p.void_reason or "")


def test_next_play_yes_and_no_match_yards_gained(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for p in final(game).all():
            if p.type is T.NEXT_PLAY_GAIN_5 and p.status is PredictionStatus.RESOLVED:
                assert p.resolved_cursor is not None
                play = game.events[p.resolved_cursor - 1]
                assert play.kind in (PlayKind.PASS, PlayKind.RUN)
                assert p.correct_option_id == ("yes" if (play.yards_gained or 0) >= 5 else "no")


def test_next_play_interception_resolves_no(super_bowl):
    led = final(super_bowl)
    picked = [p for p in led.all() if p.type is T.NEXT_PLAY_GAIN_5 and "intercepted" in (p.resolution_summary or "")]
    assert picked and all(p.correct_option_id == "no" for p in picked)


def test_drive_touchdown_outcomes(divisional, super_bowl):
    div = final(divisional)
    first = pred(div, T.DRIVE_TOUCHDOWN, 2)  # BUF opening drive ends in a field goal
    assert (first.correct_option_id, first.resolution_summary) == ("no", "BUF settled for a field goal")
    yes = [p for p in div.all() if p.type is T.DRIVE_TOUCHDOWN and p.correct_option_id == "yes"]
    assert len(yes) == 6
    turnover = [
        p for p in final(super_bowl).all() if p.type is T.DRIVE_TOUCHDOWN and "Turnover" in (p.resolution_summary or "")
    ]
    assert turnover and all(p.correct_option_id == "no" for p in turnover)


def test_next_score_team_and_no_score_window(divisional, super_bowl):
    div = final(divisional)
    assert pred(div, T.NEXT_SCORE, 2).correct_option_id == "BUF"
    assert pred(div, T.NEXT_SCORE, 81).correct_option_id == "none"  # nothing more before halftime
    sb = final(super_bowl)
    assert pred(sb, T.NEXT_SCORE, 171).correct_option_id == "none"  # end of regulation, tied
    assert pred(sb, T.NEXT_SCORE, 174).correct_option_id == "SF"  # OT field goal
    assert pred(sb, T.NEXT_SCORE, 191).correct_option_id == "KC"  # walk-off TD


def test_questions_survive_quarter_breaks(divisional, super_bowl):
    """Quarter ends don't lock or resolve: the next play / drive continues in the next quarter."""
    for game in (divisional, super_bowl):
        for p in final(game).all():
            if p.resolved_cursor is None:
                continue
            between = game.events[p.opened_cursor : p.resolved_cursor]
            if any(e.kind is PlayKind.END_QUARTER and e.quarter in (1, 3) for e in between[:-1]):
                assert p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID)
                assert game.events[p.resolved_cursor - 1].kind is not PlayKind.END_QUARTER or p.type is T.NEXT_SCORE


def test_everything_resolves_by_the_final_whistle(divisional, super_bowl):
    for game in (divisional, super_bowl):
        assert all(p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID) for p in final(game).all())


def test_locks_never_come_after_the_outcome(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for p in final(game).all():
            assert p.locked_cursor is not None and p.resolved_cursor is not None
            assert p.opened_cursor < p.locked_cursor <= p.resolved_cursor
            locking = game.events[p.locked_cursor - 1]
            assert locking.kind not in (PlayKind.TIMEOUT,)


# ---------------------------------------------------------------- no future leakage


def test_ledger_never_depends_on_unrevealed_plays(divisional, super_bowl):
    """At every cursor, the ledger built from the full game equals one built from a truncated game."""
    for game in (divisional, super_bowl):
        for k in range(0, len(game.events) + 1, 7):
            truncated = game.model_copy(update={"events": game.events[:k]})
            full_k = [p.model_dump() for p in ledger_at(game, k).all()]
            trunc_k = [p.model_dump() for p in ledger_at(truncated, k).all()]
            assert full_k == trunc_k
