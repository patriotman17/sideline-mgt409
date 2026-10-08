"""Eligibility, featured-moment ranking, and deterministic resolution on the real Chiefs-Bills and
Super Bowl LVIII data."""

from __future__ import annotations

from itertools import pairwise

from app.predictions.config import PredictionConfig
from app.predictions.models import PredictionStatus, PredictionType
from app.predictions.rules import Revealed, detect, new_drive_started
from app.replay.engine import replay
from app.replay.models import PlayKind
from tests.predictions.helpers import EVERY, final, ledger_at, pred

T = PredictionType


def revealed(game, cursor):
    snaps = [
        e for e in game.events[:cursor] if e.kind not in (PlayKind.TIMEOUT, PlayKind.END_QUARTER, PlayKind.GAME_START)
    ]
    return Revealed(info=game.info, state=replay(game, cursor), last_snap=snaps[-1] if snaps else None, cursor=cursor)


def offered(game, t):
    """Cursors where the detectors find an eligible ``t`` candidate (before ranking)."""
    return {
        k
        for k in range(len(game.events) + 1)
        if any(p.type is t for p in detect(revealed(game, k), next_score_pending=False))
    }


def featured(game):
    return [(p.opened_cursor, p.type) for p in final(game).all()]


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
    div = offered(divisional, T.FOURTH_DOWN_CONVERSION)
    assert div == {5, 23, 150, 157}  # 4th&1, 4th&5 at BUF 29, 4th&3 at midfield, late 4th&9 trailing
    assert 127 not in div  # BUF's fake punt on 4th&5 at its own 30 wasn't a predictable spot
    assert {94, 116, 131} <= offered(super_bowl, T.FOURTH_DOWN_CONVERSION)


# ---------------------------------------------------------------- featured moments (ranking + pacing)


def test_featured_moments_per_game(divisional, super_bowl):
    """Regression: the exact featured questions for both games (5-10 per game, high-leverage first)."""
    assert featured(divisional) == [
        (2, T.NEXT_SCORE),  # opening drive
        (45, T.NEXT_PLAY_GAIN_5),  # 3rd & 6 in the red zone
        (85, T.NEXT_SCORE),  # second-half kickoff
        (128, T.DRIVE_TOUCHDOWN),  # takeaway, short field, Q4
        (150, T.FOURTH_DOWN_CONVERSION),  # BUF 4th & 3 at midfield, down 3 late
        (158, T.NEXT_SCORE),  # KC ball after the missed field goal, 1:43 left
    ]
    assert featured(super_bowl) == [
        (2, T.NEXT_SCORE),
        (82, T.NEXT_SCORE),
        (117, T.DRIVE_TOUCHDOWN),  # muffed punt recovered at the SF 16
        (130, T.NEXT_PLAY_GAIN_5),
        (146, T.NEXT_PLAY_GAIN_5),  # 3rd & goal at the 3
        (155, T.FOURTH_DOWN_CONVERSION),
        (171, T.NEXT_SCORE),  # tied, end of regulation
        (188, T.NEXT_PLAY_GAIN_5),  # OT, 3rd & goal-to-go at the 9
        (194, T.FOURTH_DOWN_CONVERSION),  # OT 4th & 1 at the KC 34
    ]
    for game in (divisional, super_bowl):
        assert 5 <= len(final(game).all()) <= 10


def test_featured_questions_carry_their_reasons(divisional):
    led = final(divisional)
    assert pred(led, T.NEXT_SCORE, 2).tags == ["Opening drive"]
    late = pred(led, T.FOURTH_DOWN_CONVERSION, 150)
    assert late.tags == ["4th down", "Late game", "One-score game"] and late.importance >= 85
    assert all(p.importance >= 60 for p in led.all())


def test_cooldowns_space_questions_out(divisional, super_bowl):
    cfg = PredictionConfig()
    for game in (divisional, super_bowl):
        snaps = [i + 1 for i, e in enumerate(game.events) if e.kind not in (PlayKind.TIMEOUT, PlayKind.END_QUARTER)]
        prev = None
        for p in final(game).all():
            if prev is not None:
                gap = sum(1 for s in snaps if prev.opened_cursor < s <= p.opened_cursor)
                limit = cfg.critical_cooldown_snaps if p.importance >= cfg.critical_score else cfg.cooldown_snaps
                assert gap >= limit, (prev.id, p.id, gap)
            prev = p


def test_one_question_at_a_time(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for config in (PredictionConfig(), EVERY):
            ps = sorted(final(game, config).all(), key=lambda p: p.opened_cursor)
            for a, b in pairwise(ps):
                assert a.locked_cursor is not None and a.locked_cursor <= b.opened_cursor


def test_pacing_is_configurable(divisional):
    assert len(final(divisional, EVERY).all()) > 30  # ranking off: every eligible moment
    assert final(divisional, PredictionConfig(min_score=1000)).all() == []
    looser = PredictionConfig(
        min_score=45, cooldown_snaps=4, critical_cooldown_snaps=2, type_cooldown_snaps=4, max_per_quarter=4
    )
    assert len(final(divisional, looser).all()) > len(final(divisional).all())


def test_no_duplicate_question_across_a_timeout(super_bowl):
    for config in (PredictionConfig(), EVERY):
        ot_fourth = [
            p
            for p in final(super_bowl, config).all()
            if p.type is T.FOURTH_DOWN_CONVERSION and p.opened_cursor in (194, 195)
        ]
        assert [p.opened_cursor for p in ot_fourth] == [194]


# ---------------------------------------------------------------- resolution (every eligible moment)


def test_fourth_down_converted(divisional):
    p = pred(final(divisional, EVERY), T.FOURTH_DOWN_CONVERSION, 5)
    assert (p.status, p.correct_option_id) == (PredictionStatus.RESOLVED, "yes")
    assert p.locked_cursor == p.resolved_cursor == 6


def test_fourth_down_not_attempted_is_void(divisional, super_bowl):
    fg = pred(final(divisional, EVERY), T.FOURTH_DOWN_CONVERSION, 23)
    assert fg.status is PredictionStatus.VOID and "field goal" in (fg.void_reason or "")
    punt = pred(final(super_bowl, EVERY), T.FOURTH_DOWN_CONVERSION, 94)
    assert punt.status is PredictionStatus.VOID and "punt" in (punt.void_reason or "")


def test_next_play_wiped_out_by_penalty_is_void(divisional):
    p = pred(final(divisional, EVERY), T.NEXT_PLAY_GAIN_5, 108)
    assert p.status is PredictionStatus.VOID and "penalty" in (p.void_reason or "")


def test_next_play_yes_and_no_match_yards_gained(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for p in final(game, EVERY).all():
            if p.type is T.NEXT_PLAY_GAIN_5 and p.status is PredictionStatus.RESOLVED:
                assert p.resolved_cursor is not None
                play = game.events[p.resolved_cursor - 1]
                assert play.kind in (PlayKind.PASS, PlayKind.RUN)
                assert p.correct_option_id == ("yes" if (play.yards_gained or 0) >= 5 else "no")


def test_next_play_interception_resolves_no(super_bowl):
    led = final(super_bowl, EVERY)
    picked = [p for p in led.all() if p.type is T.NEXT_PLAY_GAIN_5 and "intercepted" in (p.resolution_summary or "")]
    assert picked and all(p.correct_option_id == "no" for p in picked)


def test_drive_touchdown_outcomes(divisional, super_bowl):
    div = final(divisional, EVERY)
    drives = [p for p in div.all() if p.type is T.DRIVE_TOUCHDOWN]
    assert any(p.resolution_summary and "settled for a field goal" in p.resolution_summary for p in drives)
    assert sum(p.correct_option_id == "yes" for p in drives) == 5
    turnover = [
        p
        for p in final(super_bowl, EVERY).all()
        if p.type is T.DRIVE_TOUCHDOWN and "Turnover" in (p.resolution_summary or "")
    ]
    assert turnover and all(p.correct_option_id == "no" for p in turnover)
    assert pred(final(super_bowl), T.DRIVE_TOUCHDOWN, 117).correct_option_id == "yes"  # featured: KC TD after muff


def test_next_score_team_and_no_score_window(divisional, super_bowl):
    div = final(divisional, EVERY)
    assert pred(div, T.NEXT_SCORE, 2).correct_option_id == "BUF"
    assert pred(div, T.NEXT_SCORE, 81).correct_option_id == "none"  # nothing more before halftime
    sb = final(super_bowl, EVERY)
    assert pred(sb, T.NEXT_SCORE, 171).correct_option_id == "none"  # end of regulation, tied
    assert pred(sb, T.NEXT_SCORE, 174).correct_option_id == "SF"  # OT field goal
    assert pred(sb, T.NEXT_SCORE, 191).correct_option_id == "KC"  # walk-off TD
    assert pred(final(divisional), T.NEXT_SCORE, 158).correct_option_id == "none"  # KC runs out the clock


def test_questions_survive_quarter_breaks(divisional, super_bowl):
    """Quarter ends don't lock or resolve: the next play / drive continues in the next quarter."""
    for game in (divisional, super_bowl):
        for p in final(game, EVERY).all():
            if p.resolved_cursor is None:
                continue
            between = game.events[p.opened_cursor : p.resolved_cursor]
            if any(e.kind is PlayKind.END_QUARTER and e.quarter in (1, 3) for e in between[:-1]):
                assert p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID)
                assert game.events[p.resolved_cursor - 1].kind is not PlayKind.END_QUARTER or p.type is T.NEXT_SCORE


def test_everything_resolves_by_the_final_whistle(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for config in (PredictionConfig(), EVERY):
            assert all(
                p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID) for p in final(game, config).all()
            )


def test_locks_never_come_after_the_outcome(divisional, super_bowl):
    for game in (divisional, super_bowl):
        for p in final(game, EVERY).all():
            assert p.locked_cursor is not None and p.resolved_cursor is not None
            assert p.opened_cursor < p.locked_cursor <= p.resolved_cursor
            locking = game.events[p.locked_cursor - 1]
            assert locking.kind not in (PlayKind.TIMEOUT,)


# ---------------------------------------------------------------- no future leakage


def test_ledger_never_depends_on_unrevealed_plays(divisional, super_bowl):
    """At every cursor, the ledger built from the full game equals one built from a truncated game —
    so ranking and cooldowns, like detection, only ever see revealed plays."""
    for game in (divisional, super_bowl):
        for config in (PredictionConfig(), EVERY):
            for k in range(0, len(game.events) + 1, 3):
                truncated = game.model_copy(update={"events": game.events[:k]})
                full_k = [p.model_dump() for p in ledger_at(game, k, config).all()]
                trunc_k = [p.model_dump() for p in ledger_at(truncated, k, config).all()]
                assert full_k == trunc_k
