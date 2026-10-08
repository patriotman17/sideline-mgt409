"""Replay controls vs predictions: no farming via rewind/restart/speed, atomic submissions."""

from __future__ import annotations

import threading

import pytest

from app.predictions.ledger import PredictionError, visible_items
from app.predictions.models import PredictionStatus, PredictionType
from app.replay.sessions import SECONDS_PER_PLAY, PlaybackStatus, ReplaySession, ReplaySessionManager, SessionNotFound

T = PredictionType


def session(game, clock, *, pause: bool = True, speed: float = 1.0) -> ReplaySession:
    return ReplaySession(game, clock=clock, pause_for_predictions=pause, speed=speed)


def open_ids(s: ReplaySession) -> list[str]:
    s.snapshot()  # advance to "now" first, like every API read
    return [
        i.prediction.id for i in visible_items(s.predictions, s.cursor) if i.prediction.status is PredictionStatus.OPEN
    ]


def test_pause_for_picks_stops_exactly_where_a_question_opens(divisional, clock):
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 50)
    st, _, cursor, _ = s.snapshot()
    assert (st, cursor, s.pause_reason) == (PlaybackStatus.PAUSED, 2, "prediction")
    assert len(open_ids(s)) == 2
    clock.advance(1000)
    assert s.snapshot()[2] == 2  # stays put until the user acts


def test_answering_every_open_question_resumes_playback(divisional, clock):
    s = session(divisional, clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 10)
    first, second = open_ids(s)
    assert s.submit_prediction(first, "yes" if "drive" in first else "BUF")[2] is False  # one left unanswered
    _, created, resumed = s.submit_prediction(second, "yes" if "drive" in second else "BUF")
    assert created and resumed and s.snapshot()[0] is PlaybackStatus.PLAYING


def test_submit_after_the_play_is_due_is_rejected_even_without_polling(divisional, clock):
    """The server advances to 'now' before validating, so a late answer finds the question locked."""
    s = session(divisional, clock, pause=False)
    s.step(2)  # questions open at play 2
    pid = open_ids(s)[0]
    s.play()
    clock.advance(SECONDS_PER_PLAY * 1.01)  # the next snap is due; nobody has polled
    with pytest.raises(PredictionError) as exc:
        s.submit_prediction(pid, "yes" if "drive" in pid else "BUF")
    assert exc.value.code == "locked"


def test_step_stops_at_a_new_question(divisional, clock):
    s = session(divisional, clock)
    s.step(20)
    assert s.cursor == 2 and s.pause_reason == "prediction"


def test_restart_and_rewind_never_reopen_or_recreate_questions(divisional, clock):
    s = session(divisional, clock, pause=False)
    s.step(2)
    drive = next(pid for pid in open_ids(s) if "drive" in pid)
    s.step(30)  # outcome of the first drive now known (field goal at play 16)
    high = s.predictions.high_water
    before = {p.id for p in s.predictions.all()}
    s.restart()
    s.step(2)  # back to the moment the drive question opened
    assert open_ids(s) == []  # nothing is re-offered
    with pytest.raises(PredictionError) as exc:
        s.submit_prediction(drive, "no")  # the answer is known now; can't be farmed
    assert exc.value.code == "locked"
    s.step(high - 2)  # re-watch up to where we left off
    assert {p.id for p in s.predictions.all()} == before  # no new questions below the high-water mark
    assert s.predictions.high_water == high
    s.step(10)  # past the mark: new questions resume normally
    assert s.predictions.high_water > high


def test_rewind_hides_later_outcomes_until_the_replay_gets_back(divisional, clock):
    s = session(divisional, clock, pause=False)
    s.step(40)
    s.restart()
    s.step(5)
    items = visible_items(s.predictions, s.cursor)
    assert all(i.prediction.opened_cursor <= 5 for i in items)
    hidden = [i for i in items if i.result_hidden_until]
    assert hidden and all(i.prediction.correct_option_id is None for i in hidden)


def test_rapid_playback_resolves_everything_and_awards_nothing_unanswered(super_bowl, clock):
    s = session(super_bowl, clock, pause=False, speed=50)
    s.play()
    clock.advance(10_000)
    assert s.snapshot()[0] is PlaybackStatus.FINISHED
    assert all(p.status in (PredictionStatus.RESOLVED, PredictionStatus.VOID) for p in s.predictions.all())
    assert s.predictions.stats().points == 0


def test_pause_resume_and_speed_changes_keep_the_lifecycle_consistent(divisional, clock):
    s = session(divisional, clock, pause=False)
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
    pid = next(p for p in open_ids(s) if "drive" in p)
    results: list[object] = []

    def submit(option: str) -> None:
        try:
            results.append(s.submit_prediction(pid, option)[1])
        except PredictionError as exc:
            results.append(exc.code)

    threads = [threading.Thread(target=submit, args=("yes" if i % 2 else "no",)) for i in range(16)]
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
    a.submit_prediction(next(p for p in open_ids(a) if "drive" in p), "yes")
    b.step(2)
    assert a.predictions.stats().answered == 1 and b.predictions.stats().answered == 0


def test_expired_sessions_take_their_predictions_with_them(divisional, clock):
    manager = ReplaySessionManager(clock=clock, ttl_seconds=60)
    s = manager.create(divisional)
    s.step(2)
    clock.advance(61)
    with pytest.raises(SessionNotFound):
        manager.get(s.id)
