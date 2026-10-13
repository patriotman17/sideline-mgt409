"""Synchronized week: one simulated clock over all 14 games of 2025 Week 5."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.routes.replay import get_session_manager
from app.api.routes.week import get_week_manager
from app.main import create_app
from app.predictions.ledger import visible_items
from app.replay.engine import replay
from app.replay.sessions import PlaybackStatus, ReplaySession, ReplaySessionManager
from app.replay.week import (
    ClockStatus,
    GamePhase,
    WeekSession,
    WeekSessionManager,
    WeekSlate,
    slates_from,
)
from tests.replay.conftest import PLAIN, FakeClock

BASE = "/api/v1/week"
SUN_230PM = datetime(2025, 10, 5, 18, 30, tzinfo=UTC)  # 2:30 PM ET


@pytest.fixture(scope="module")
def slate(catalog) -> WeekSlate:
    slates = slates_from(catalog.list())
    assert list(slates) == [(2025, 5)]  # the 2023 playoff games have no per-play times
    return slates[(2025, 5)]


def test_slate_matches_the_real_schedule(slate):
    windows = [(s.game.info.game_id, s.window_key) for s in slate.games]
    assert windows[0] == ("2025_05_SF_LA", "thu-night")
    assert windows[1] == ("2025_05_MIN_CLE", "sun-morning")
    assert [k for _, k in windows].count("sun-early") == 6
    assert [k for _, k in windows].count("sun-late") == 4
    assert windows[-2:] == [("2025_05_NE_BUF", "sun-night"), ("2025_05_KC_JAX", "mon-night")]
    assert [p.key for p in slate.presets] == [
        "thu-night",
        "sun-morning",
        "sun-early",
        "sun-late",
        "sun-night",
        "mon-night",
    ]
    london = slate.by_id["2025_05_MIN_CLE"]
    assert london.window_label == "Sunday · London" and london.game.info.neutral_site


def test_every_game_fits_inside_the_clock_range(slate):
    for s in slate.games:
        times = s.timeline.times
        assert times == sorted(times), s.game.info.game_id  # never runs backwards
        assert slate.starts_at < times[0] and times[-1] < slate.ends_at
        assert s.timeline.cursor_at(slate.starts_at) == 0
        assert s.timeline.cursor_at(slate.ends_at) == len(s.game.events)


def test_state_at_a_clock_time_reveals_only_plays_before_it(slate):
    for s in slate.games:
        for t in (s.kickoff - timedelta(minutes=1), SUN_230PM, s.timeline.times[len(s.timeline.times) // 2]):
            phase, cursor, state = slate.state(s.game.info.game_id, t)
            assert all(x <= t for x in s.timeline.times[:cursor])
            assert all(x > t for x in s.timeline.times[cursor:])
            assert state == replay(s.game, cursor)
            if phase is not GamePhase.FINAL:
                assert state.status.value != "final"


def test_sunday_230pm_snapshot(slate):
    phases = {s.game.info.game_id: slate.state(s.game.info.game_id, SUN_230PM)[0] for s in slate.games}
    assert phases["2025_05_SF_LA"] is GamePhase.FINAL
    assert phases["2025_05_MIN_CLE"] is GamePhase.FINAL
    assert [g for g, p in phases.items() if p is GamePhase.LIVE] == [
        s.game.info.game_id for s in slate.games if s.window_key == "sun-early"
    ]
    assert phases["2025_05_KC_JAX"] is GamePhase.SCHEDULED


def test_clock_plays_pauses_seeks_and_finishes(slate):
    clock = FakeClock()
    week = WeekSession(slate, clock=clock, speed=60.0)
    assert week.snapshot()[0] is ClockStatus.PAUSED
    start = week.snapshot()[2]
    clock.advance(100)
    assert week.snapshot()[2] == start  # paused: no time passes
    week.play()
    clock.advance(60)  # 60 real seconds at 60x = 1 simulated hour
    assert week.snapshot()[2] == start + timedelta(hours=1)
    week.pause()
    week.seek(SUN_230PM)
    assert week.snapshot()[2] == SUN_230PM
    week.seek(datetime(2030, 1, 1, tzinfo=UTC))
    assert week.snapshot()[2] == slate.ends_at  # clamped
    week.play()  # at the end: starts the week over
    assert week.snapshot()[2] == slate.starts_at
    week.seek(slate.ends_at - timedelta(seconds=30))
    clock.advance(10)
    assert week.snapshot()[0] is ClockStatus.FINISHED
    with pytest.raises(ValueError):
        week.set_speed(7)


@pytest.fixture
def api():
    app = create_app()
    clock = FakeClock()
    weeks = WeekSessionManager(clock=clock)
    replays = ReplaySessionManager(clock=clock, prediction_config=PLAIN)
    app.dependency_overrides[get_week_manager] = lambda: weeks
    app.dependency_overrides[get_session_manager] = lambda: replays
    return TestClient(app), clock


def start(client: TestClient, **body):
    r = client.post(f"{BASE}/sessions", json={"season": 2025, "week": 5, **body})
    assert r.status_code == 201, r.text
    data = r.json()
    return data, {"X-Session-Token": data["session_token"]}


def test_api_requires_the_token_and_never_shows_unplayed_scores(api):
    client, clock = api
    data, auth = start(client, preset="sun-early", speed=60)
    sid = data["session_id"]
    assert client.get(f"{BASE}/sessions/{sid}").status_code == 404
    assert client.get(f"{BASE}/sessions/{sid}", headers={"X-Session-Token": "nope"}).status_code == 404
    body = client.get(f"{BASE}/sessions/{sid}", headers=auth)
    assert body.status_code == 200 and "session_token" not in body.text
    snap = body.json()
    assert snap["sim_time_label"] == "Sun, Oct 5 · 12:55 PM ET"
    for g in snap["games"]:
        if g["phase"] == "scheduled":
            assert g["away_score"] is None and g["home_score"] is None and g["period_label"] is None
    finals = [g["game_id"] for g in snap["games"] if g["phase"] == "final"]
    assert finals == ["2025_05_SF_LA", "2025_05_MIN_CLE"]

    client.post(f"{BASE}/sessions/{sid}/play", headers=auth)
    clock.advance(95 * 60 / 60)  # 95 simulated minutes at 60x
    snap = client.get(f"{BASE}/sessions/{sid}", headers=auth).json()
    assert snap["live_games"] == 6
    live = [g for g in snap["games"] if g["phase"] == "live"]
    assert all(g["period_label"] and g["away_score"] is not None for g in live)


def test_api_seek_speed_and_validation(api):
    client, _ = api
    data, auth = start(client)
    sid = data["session_id"]
    r = client.post(f"{BASE}/sessions/{sid}/seek", json={"preset": "mon-night"}, headers=auth).json()
    assert r["sim_time_label"] == "Mon, Oct 6 · 8:10 PM ET"
    assert client.post(f"{BASE}/sessions/{sid}/seek", json={"preset": "nope"}, headers=auth).status_code == 422
    assert client.post(f"{BASE}/sessions/{sid}/seek", json={}, headers=auth).status_code == 422
    assert client.post(f"{BASE}/sessions/{sid}/speed", json={"speed": 300}, headers=auth).json()["speed"] == 300
    assert client.post(f"{BASE}/sessions/{sid}/speed", json={"speed": 2}, headers=auth).status_code == 422
    assert client.post(f"{BASE}/sessions", json={"season": 2023, "week": 20}).status_code == 404


def test_joining_a_live_game_starts_its_replay_at_that_moment(api, catalog):
    client, _ = api
    data, _auth = start(client, start_at=SUN_230PM.isoformat())
    game = next(g for g in data["games"] if g["game_id"] == "2025_05_DAL_NYJ")
    assert game["phase"] == "live" and game["cursor"] > 0
    r = client.post(
        "/api/v1/replay/sessions", json={"game_id": "2025_05_DAL_NYJ", "start_cursor": game["cursor"]}
    ).json()
    assert r["playback"]["cursor"] == game["cursor"] and r["playback"]["status"] == "paused"
    assert (r["state"]["away_score"], r["state"]["home_score"]) == (game["away_score"], game["home_score"])


def test_joined_replays_hide_questions_from_before_the_join(catalog):
    g = catalog.get("2025_05_DAL_NYJ")
    joined = ReplaySession(g, clock=FakeClock(), start_cursor=91)
    assert joined.snapshot()[0] is PlaybackStatus.PAUSED and joined.cursor == 91
    assert joined.predictions.high_water == 91 and joined.predictions.visible_from == 91
    assert all(i.prediction.opened_cursor >= 91 for i in visible_items(joined.predictions, joined.cursor))
    fresh = ReplaySession(g, clock=FakeClock())
    fresh.step(91)
    assert any(i.prediction.opened_cursor < 91 for i in visible_items(fresh.predictions, fresh.cursor))


# ---------------------------------------------------------------- big-moment holds


def _week(slate, clock, game_id, *, speed=300.0, level="big"):
    w = WeekSession(slate, clock=clock, speed=speed, start_at=next(p.at for p in slate.presets if p.key == "sun-early"))
    w.watch([game_id], level)
    w.play()
    return w


def test_moments_match_a_replay_sessions_featured_questions(slate):
    """The week asks exactly what an opened replay asks (same ids, same plays)."""
    for s in slate.games:
        session = ReplaySession(s.game, clock=FakeClock())
        session.step(len(s.game.events))
        replay_ids = [p.id for p in session.predictions.all()]
        assert [m.prediction.id for m in s.moments] == replay_ids, s.game.info.game_id
        assert all(m.prediction.big_moment == (m.prediction.importance >= 85) for m in s.moments)
    assert sum(m.big for s in slate.games for m in s.moments) == 18


def test_clock_stops_exactly_on_a_watched_big_moment_and_holds_12_real_seconds(slate):
    gid = "2025_05_DEN_PHI"
    first_big = next(m for m in slate.by_id[gid].moments if m.big)
    clock = FakeClock()
    w = _week(slate, clock, gid)
    clock.advance(1)
    while w.snapshot()[0] is not ClockStatus.HELD:
        clock.advance(1)
    _, _, sim = w.snapshot()
    assert sim == first_big.open_at
    assert slate.state(gid, sim)[1] == first_big.opened_cursor  # the game sits exactly on the moment
    hold, left = w.hold()
    assert hold.moment.prediction.id == first_big.prediction.id and 0 < left <= 12
    clock.advance(left - 0.1)
    assert w.snapshot()[0] is ClockStatus.HELD and w.snapshot()[2] == sim  # nothing moves during a hold
    clock.advance(0.2)
    assert w.snapshot()[0] is ClockStatus.PLAYING  # resumes by itself
    assert w.snapshot()[2] > sim


def test_release_pause_and_unwatching_end_a_hold_and_each_moment_holds_once(slate):
    gid = "2025_05_DEN_PHI"
    clock = FakeClock()
    w = _week(slate, clock, gid)
    while w.snapshot()[0] is not ClockStatus.HELD:
        clock.advance(1)
    first = w.hold()[0].moment.prediction.id
    w.release()
    assert w.snapshot()[0] is ClockStatus.PLAYING
    clock.advance(0.5)
    hold = w.hold()
    assert hold is None or hold[0].moment.prediction.id != first  # never the same moment twice
    while w.snapshot()[0] is not ClockStatus.HELD:
        clock.advance(1)
    w.pause()
    assert w.snapshot()[0] is ClockStatus.PAUSED and w.hold() is None
    w.play()
    while w.snapshot()[0] is not ClockStatus.HELD:
        clock.advance(1)
    w.watch([])
    assert w.snapshot()[0] is ClockStatus.PLAYING


def test_unwatched_games_and_blowouts_never_stop_the_clock(slate):
    clock = FakeClock()
    w = _week(slate, clock, "2025_05_DAL_NYJ")  # a blowout: no big moments
    for _ in range(120):
        clock.advance(1)
        assert w.snapshot()[0] is not ClockStatus.HELD
    with pytest.raises(ValueError):
        w.watch(["not-a-game"])


def test_all_level_holds_ordinary_questions_too(slate):
    gid = "2025_05_DAL_NYJ"
    clock = FakeClock()
    w = _week(slate, clock, gid, level="all")
    while w.snapshot()[0] is not ClockStatus.HELD:
        clock.advance(1)
    assert not w.hold()[0].moment.big


def test_api_reports_open_moments_and_holds_without_outcomes(api):
    client, clock = api
    data, auth = start(client, preset="sun-early", speed=300)
    sid = data["session_id"]
    r = client.put(f"{BASE}/sessions/{sid}/watch", json={"game_ids": ["2025_05_DEN_PHI"]}, headers=auth)
    assert r.status_code == 200 and r.json()["watched"] == ["2025_05_DEN_PHI"]
    assert client.put(f"{BASE}/sessions/{sid}/watch", json={"game_ids": ["x"]}, headers=auth).status_code == 422
    client.post(f"{BASE}/sessions/{sid}/play", headers=auth)
    snap = None
    for _ in range(200):
        clock.advance(1)
        snap = client.get(f"{BASE}/sessions/{sid}", headers=auth).json()
        if snap["status"] == "held":
            break
    assert snap and snap["status"] == "held"
    hold = snap["hold"]
    assert hold["game_id"] == "2025_05_DEN_PHI" and hold["moment"]["big_moment"] and hold["seconds_left"] <= 12
    game = next(g for g in snap["games"] if g["game_id"] == "2025_05_DEN_PHI")
    assert game["moment"]["prediction_id"] == hold["moment"]["prediction_id"]
    for leaked in ("correct_option_id", "resolution_summary", "locked_cursor", "resolved_cursor"):
        assert leaked not in str(hold) and leaked not in str(game["moment"])
    released = client.post(f"{BASE}/sessions/{sid}/release", headers=auth).json()
    assert released["status"] == "playing" and released["hold"] is None
