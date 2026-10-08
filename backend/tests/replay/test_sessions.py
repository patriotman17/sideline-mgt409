"""Playback controls, speed, isolation and expiry with a controllable clock."""

from __future__ import annotations

import pytest

from app.replay.sessions import (
    SECONDS_PER_PLAY,
    InvalidTransition,
    PlaybackStatus,
    ReplaySession,
    ReplaySessionManager,
    SessionNotFound,
)


def cursor(session: ReplaySession) -> int:
    return session.snapshot()[2]


def status(session: ReplaySession) -> PlaybackStatus:
    return session.snapshot()[0]


def test_new_session_is_ready_and_does_not_advance(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    clock.advance(60)
    assert status(s) is PlaybackStatus.READY and cursor(s) == 0


def test_play_advances_with_wall_clock(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 10)
    assert cursor(s) == 10
    clock.advance(SECONDS_PER_PLAY * 0.5)
    assert cursor(s) == 10  # partial interval doesn't reveal the next play


def test_pause_freezes_and_resume_continues(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 5)
    s.pause()
    clock.advance(SECONDS_PER_PLAY * 100)
    assert (status(s), cursor(s)) == (PlaybackStatus.PAUSED, 5)
    s.resume()
    clock.advance(SECONDS_PER_PLAY * 3)
    assert (status(s), cursor(s)) == (PlaybackStatus.PLAYING, 8)


def test_speed_scales_playback_and_reanchors(divisional, clock):
    s = ReplaySession(divisional, clock=clock, speed=2.0)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 5)
    assert cursor(s) == 10
    s.set_speed(10.0)
    clock.advance(SECONDS_PER_PLAY)
    assert cursor(s) == 20


@pytest.mark.parametrize("bad", [0, 0.1, 51, float("inf"), float("nan")])
def test_invalid_speed_rejected(divisional, clock, bad):
    s = ReplaySession(divisional, clock=clock)
    with pytest.raises(ValueError):
        s.set_speed(bad)


def test_restart_resets_state(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 40)
    assert s.snapshot()[3].plays_revealed == 40
    s.restart()
    st, _, cur, state = s.snapshot()
    assert (st, cur, state.plays_revealed, state.home_score, state.away_score) == (PlaybackStatus.READY, 0, 0, 0, 0)
    clock.advance(SECONDS_PER_PLAY * 10)
    assert cursor(s) == 0  # restart doesn't auto-play


def test_step_advances_manually_and_pauses(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    s.step(3)
    assert (status(s), cursor(s)) == (PlaybackStatus.PAUSED, 3)
    s.play()
    clock.advance(SECONDS_PER_PLAY * 2)
    s.step()
    assert (status(s), cursor(s)) == (PlaybackStatus.PAUSED, 6)


def test_finishes_at_end_and_blocks_play(divisional, clock):
    s = ReplaySession(divisional, clock=clock, speed=50)
    s.play()
    clock.advance(10_000)
    st, _, cur, state = s.snapshot()
    assert st is PlaybackStatus.FINISHED and cur == len(divisional.events)
    assert (state.away_score, state.home_score) == (27, 24)
    with pytest.raises(InvalidTransition):
        s.play()
    with pytest.raises(InvalidTransition):
        s.resume()
    s.restart()
    s.play()  # allowed again after restart


def test_resume_before_play_is_rejected(divisional, clock):
    with pytest.raises(InvalidTransition):
        ReplaySession(divisional, clock=clock).resume()


def test_visible_events_never_include_future_plays(divisional, clock):
    s = ReplaySession(divisional, clock=clock)
    s.step(25)
    visible = s.visible_events()
    assert len(visible) == 25 and visible[-1].sequence == 24


def test_sessions_are_isolated(divisional, super_bowl, clock):
    manager = ReplaySessionManager(clock=clock)
    a = manager.create(divisional)
    b = manager.create(divisional, speed=4)
    c = manager.create(super_bowl)
    assert len({a.id, b.id, c.id}) == 3
    a.play()
    b.step(7)
    clock.advance(SECONDS_PER_PLAY * 4)
    assert (cursor(a), cursor(b), cursor(c)) == (4, 7, 0)
    a.restart()
    assert (cursor(a), cursor(b)) == (0, 7)
    assert manager.get(b.id) is b


def test_idle_sessions_expire(divisional, clock):
    manager = ReplaySessionManager(clock=clock, ttl_seconds=60)
    s = manager.create(divisional)
    clock.advance(61)
    with pytest.raises(SessionNotFound):
        manager.get(s.id)


def test_session_cap_evicts_least_recently_used(divisional, clock):
    manager = ReplaySessionManager(clock=clock, max_sessions=2)
    first = manager.create(divisional)
    clock.advance(1)
    second = manager.create(divisional)
    clock.advance(1)
    manager.get(first.id).snapshot()  # touch first so second is the oldest
    clock.advance(1)
    manager.create(divisional)
    assert len(manager) == 2
    manager.get(first.id)
    with pytest.raises(SessionNotFound):
        manager.get(second.id)
