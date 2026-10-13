"""Replay controls vs predictions: no farming via rewind/restart/speed, atomic submissions."""

from __future__ import annotations

import threading

import pytest

from app.predictions.config import DEFAULT_CONFIG
from app.predictions.ledger import PredictionError, visible_items
from app.predictions.models import PredictionStatus, PredictionType
from app.replay.sessions import SECONDS_PER_PLAY, PlaybackStatus, ReplaySession, ReplaySessionManager, SessionNotFound
from tests.replay.conftest import PLAIN

T = PredictionType
WINDOW = DEFAULT_CONFIG.pick_window_seconds
OPENING = "2023_20_KC_BUF:next_score:2"  # the first featured question: who scores first (BUF, a FG at play 16)


def session(game, clock, *, pause: bool = False, speed: float = 1.0, plain: bool = False) -> ReplaySession:
    config = PLAIN if plain else DEFAULT_CONFIG
    return ReplaySession(game, clock=clock, pause_for_predictions=pause, speed=speed, prediction_config=config)


def open_ids(s: ReplaySession) -> list[str]:
    s.snapshot()  # advance to "now" first, like every API read
    return [
        i.prediction.id for i in visible_items(s.predictions, s.cursor) if i.prediction.status is PredictionStatus.OPEN
    ]


def test_pause_for_picks_is_off_by_default(divisional, clock):
    assert ReplaySession(divisional, clock=clock).pause_for_predictions is False
    assert ReplaySessionManager(clock=clock).create(divisional).pause_for_predictions is False
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 50)
    st, _, cursor, _ = s.snapshot()
    assert st is PlaybackStatus.PLAYING and cursor > 2 and s.pause_reason is None


def test_pick_window_holds_the_next_snap(divisional, clock):
    """With pause off, a featured question adds a short beat before the next snap (play 3)."""
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 2)  # play 2 revealed: the opening question opens
    assert open_ids(s) == [OPENING] and s.cursor == 2
    assert s.pick_window_left() == SECONDS_PER_PLAY + WINDOW
    clock.advance(SECONDS_PER_PLAY + WINDOW - 0.01)
    assert s.snapshot()[2] == 2 and s.snapshot()[0] is PlaybackStatus.PLAYING
    clock.advance(0.01)
    assert s.snapshot()[2] == 3 and s.pick_window_left() is None


def test_pick_window_timeline_does_not_depend_on_polling(divisional, clock):
    from tests.replay.conftest import FakeClock

    polled_clock, idle_clock = FakeClock(), FakeClock()
    polled, idle = session(divisional, polled_clock), session(divisional, idle_clock)
    polled.play()
    idle.play()
    for _ in range(400):
        polled_clock.advance(0.5)
        polled.snapshot()
    idle_clock.advance(200)
    assert polled.snapshot()[2] == idle.snapshot()[2]


def test_answering_ends_the_pick_window_early(divisional, clock):
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 2 + 1)
    _, created, resumed = s.submit_prediction(OPENING, "BUF")
    assert created and not resumed  # it never paused
    assert s.pick_window_left() is None
    clock.advance(SECONDS_PER_PLAY)
    assert s.snapshot()[2] == 3  # normal pace from the moment of the answer


def test_pick_window_scales_with_speed(divisional, clock):
    s = session(divisional, clock, speed=4)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 2 / 4)
    assert s.pick_window_left() == (SECONDS_PER_PLAY + WINDOW) / 4


def test_pause_for_picks_stops_exactly_where_a_question_opens(divisional, clock):
    s = session(divisional, clock, pause=True)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 50)
    st, _, cursor, _ = s.snapshot()
    assert (st, cursor, s.pause_reason) == (PlaybackStatus.PAUSED, 2, "prediction")
    assert open_ids(s) == [OPENING]
    clock.advance(1000)
    assert s.snapshot()[2] == 2  # stays put until the user acts


def test_answering_every_open_question_resumes_playback(divisional, clock):
    s = session(divisional, clock, pause=True)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 10)
    _, created, resumed = s.submit_prediction(OPENING, "BUF")
    assert created and resumed and s.snapshot()[0] is PlaybackStatus.PLAYING


def test_submit_after_the_play_is_due_is_rejected_even_without_polling(divisional, clock):
    """The server advances to 'now' before validating, so a late answer finds the question locked."""
    s = session(divisional, clock, plain=True)
    s.step(2)  # the opening question opens at play 2
    pid = open_ids(s)[0]
    s.play()
    clock.advance(SECONDS_PER_PLAY * 1.01)  # the next snap is due; nobody has polled
    with pytest.raises(PredictionError) as exc:
        s.submit_prediction(pid, "BUF")
    assert exc.value.code == "locked"


def test_step_stops_at_a_new_question_only_with_pause_on(divisional, clock):
    s = session(divisional, clock, pause=True)
    s.step(20)
    assert s.cursor == 2 and s.pause_reason == "prediction"
    off = session(divisional, clock)
    off.step(20)
    assert off.cursor == 20 and off.pause_reason is None


def test_restart_and_rewind_never_reopen_or_recreate_questions(divisional, clock):
    s = session(divisional, clock)
    s.step(2)
    drive = OPENING
    s.step(30)  # outcome known now (BUF field goal at play 16)
    high = s.predictions.high_water
    before = {p.id for p in s.predictions.all()}
    s.restart()
    s.step(2)  # back to the moment the drive question opened
    assert open_ids(s) == []  # nothing is re-offered
    with pytest.raises(PredictionError) as exc:
        s.submit_prediction(drive, "KC")  # the answer is known now; can't be farmed
    assert exc.value.code == "locked"
    s.step(high - 2)  # re-watch up to where we left off
    assert {p.id for p in s.predictions.all()} == before  # no new questions below the high-water mark
    assert s.predictions.high_water == high
    s.step(20)  # past the mark: new questions resume normally (the red-zone 3rd down at 45)
    assert s.predictions.high_water > high


def test_rewind_hides_later_outcomes_until_the_replay_gets_back(divisional, clock):
    s = session(divisional, clock)
    s.step(40)
    s.restart()
    s.step(5)
    items = visible_items(s.predictions, s.cursor)
    assert all(i.prediction.opened_cursor <= 5 for i in items)
    hidden = [i for i in items if i.result_hidden_until]
    assert hidden and all(i.prediction.correct_option_id is None for i in hidden)


def test_rapid_playback_resolves_everything_and_awards_nothing_unanswered(super_bowl, clock):
    s = session(super_bowl, clock, speed=50)
    s.play()
    clock.advance(10_000)
    assert s.snapshot()[0] is PlaybackStatus.FINISHED
    assert all(p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID) for p in s.predictions.all())
    assert s.predictions.stats().points == 0


def test_pause_resume_and_speed_changes_keep_the_lifecycle_consistent(divisional, clock):
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 7)
    s.pause()
    clock.advance(500)
    s.set_speed(10)
    s.resume()
    clock.advance(SECONDS_PER_PLAY * 3)
    for p in s.predictions.all():
        assert p.opened_cursor <= s.predictions.high_water
        if p.locked_cursor:
            assert p.locked_cursor > p.opened_cursor


def test_concurrent_submissions_record_exactly_one_answer(divisional, clock):
    s = session(divisional, clock)
    s.step(2)
    pid = OPENING
    results: list[object] = []

    def submit(option: str) -> None:
        try:
            results.append(s.submit_prediction(pid, option)[1])
        except PredictionError as exc:
            results.append(exc.code)

    threads = [threading.Thread(target=submit, args=("BUF" if i % 2 else "KC",)) for i in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count(True) == 1  # exactly one answer created
    assert set(results) <= {True, False, "already_answered"}
    assert s.predictions.answer_for(pid) is not None


def test_sessions_have_independent_ledgers(divisional, clock):
    manager = ReplaySessionManager(clock=clock)
    a = manager.create(divisional)
    b = manager.create(divisional)
    a.step(2)
    a.submit_prediction(OPENING, "BUF")
    b.step(2)
    assert a.predictions.stats().answered == 1 and b.predictions.stats().answered == 0


def test_expired_sessions_take_their_predictions_with_them(divisional, clock):
    manager = ReplaySessionManager(clock=clock, ttl_seconds=60)
    s = manager.create(divisional)
    s.step(2)
    clock.advance(61)
    with pytest.raises(SessionNotFound):
        manager.get(s.id)


# ---------------------------------------------------------------- big-moment holds (own pace)


def _first_big(game):
    from tests.predictions.helpers import final

    return next(p for p in final(game).all() if p.big_moment)


def test_big_moments_hold_twelve_real_seconds_at_any_speed(divisional, clock):
    big = _first_big(divisional)
    s = session(divisional, clock, speed=50)
    s.step(big.opened_cursor - 1)
    s.play()
    clock.advance(SECONDS_PER_PLAY / 50 + 0.001)  # the moment's play is revealed
    assert s.snapshot()[2] == big.opened_cursor and s.moment_hold_active()
    left = s.pick_window_left()
    assert left is not None and 12 < left <= 12 + SECONDS_PER_PLAY / 50 + 1e-6  # not scaled by 50x
    clock.advance(11)
    assert s.snapshot()[2] == big.opened_cursor  # still holding
    s.submit_prediction(big.id, big.options[0].id)  # answering ends the hold
    assert not s.moment_hold_active()
    clock.advance(SECONDS_PER_PLAY / 50 + 0.001)
    assert s.snapshot()[2] > big.opened_cursor


def test_moment_hold_levels(divisional, clock):
    big = _first_big(divisional)
    off = ReplaySession(divisional, clock=clock, moment_holds="off")
    off.step(big.opened_cursor - 1)
    off.play()
    clock.advance(SECONDS_PER_PLAY)
    assert not off.moment_hold_active()  # only the short pick window
    every = ReplaySession(divisional, clock=clock, moment_holds="all")
    assert every.pause_for_predictions
    every.play()
    clock.advance(SECONDS_PER_PLAY * 3)
    assert every.snapshot()[0] is PlaybackStatus.PAUSED and every.pause_reason == "prediction"
    s = session(divisional, clock)
    assert s.moment_holds == "big"
    s.set_pause_for_predictions(True)
    assert str(s.moment_holds) == "all"
