"""HTTP API for listing games, starting replays and controlling playback."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes.replay import get_session_manager
from app.main import create_app
from app.replay.sessions import SECONDS_PER_PLAY, ReplaySessionManager
from tests.replay.conftest import DIVISIONAL, PLAIN, SUPER_BOWL, FakeClock

BASE = "/api/v1/replay"


@pytest.fixture
def api_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def client(api_clock: FakeClock) -> TestClient:
    app = create_app()
    manager = ReplaySessionManager(clock=api_clock, prediction_config=PLAIN)
    app.dependency_overrides[get_session_manager] = lambda: manager
    return TestClient(app)


def start(client: TestClient, game_id: str = DIVISIONAL, **body: Any) -> dict[str, Any]:
    # Playback-mechanics tests: no automatic pauses for predictions.
    res = client.post(f"{BASE}/sessions", json={"game_id": game_id, "pause_for_predictions": False, **body})
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    # Every later request for this session must carry its token.
    client.headers["X-Session-Token"] = data["session_token"]
    return data


def test_list_games_has_no_results(client):
    res = client.get(f"{BASE}/games")
    assert res.status_code == 200
    games = {g["game_id"]: g for g in res.json()}
    assert set(games) == {DIVISIONAL, SUPER_BOWL}
    div = games[DIVISIONAL]
    assert (div["away"]["abbr"], div["home"]["abbr"], div["title"]) == ("KC", "BUF", "AFC Divisional Round")
    assert "CC BY 4.0" in div["license"]
    assert div["data_warnings"] == 0
    text = res.text
    assert "final" not in text.lower() and "home_score" not in text


def test_start_session_pregame(client):
    snap = start(client)
    assert snap["playback"]["status"] == "ready"
    assert snap["playback"]["cursor"] == 0
    state = snap["state"]
    assert (state["status"], state["home_score"], state["away_score"], state["recent_plays"]) == ("pregame", 0, 0, [])


def test_unknown_game_and_session_404(client):
    assert client.post(f"{BASE}/sessions", json={"game_id": "nope"}).status_code == 404
    assert client.get(f"{BASE}/sessions/does-not-exist").status_code == 404
    assert client.post(f"{BASE}/sessions/does-not-exist/play").status_code == 404


def test_playback_controls(client, api_clock):
    sid = start(client)["session_id"]
    assert client.post(f"{BASE}/sessions/{sid}/play").json()["playback"]["status"] == "playing"
    api_clock.advance(SECONDS_PER_PLAY * 16)
    snap = client.get(f"{BASE}/sessions/{sid}").json()
    assert snap["playback"]["cursor"] == 16
    assert (snap["state"]["home_score"], snap["state"]["away_score"]) == (3, 0)

    assert client.post(f"{BASE}/sessions/{sid}/pause").json()["playback"]["status"] == "paused"
    api_clock.advance(100)
    assert client.get(f"{BASE}/sessions/{sid}").json()["playback"]["cursor"] == 16

    assert client.post(f"{BASE}/sessions/{sid}/resume").json()["playback"]["status"] == "playing"
    snap = client.put(f"{BASE}/sessions/{sid}/speed", json={"speed": 4}).json()
    assert snap["playback"]["speed"] == 4
    api_clock.advance(SECONDS_PER_PLAY)
    assert client.get(f"{BASE}/sessions/{sid}").json()["playback"]["cursor"] == 20

    snap = client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 2}).json()
    assert (snap["playback"]["status"], snap["playback"]["cursor"]) == ("paused", 22)

    snap = client.post(f"{BASE}/sessions/{sid}/restart").json()
    assert (snap["playback"]["status"], snap["playback"]["cursor"], snap["state"]["home_score"]) == ("ready", 0, 0)


def test_speed_validation(client):
    sid = start(client)["session_id"]
    assert client.put(f"{BASE}/sessions/{sid}/speed", json={"speed": 0}).status_code == 422
    assert client.put(f"{BASE}/sessions/{sid}/speed", json={"speed": 1000}).status_code == 422
    assert client.post(f"{BASE}/sessions", json={"game_id": DIVISIONAL, "speed": -1}).status_code == 422


def test_invalid_transition_is_409(client, api_clock):
    sid = start(client, speed=50, autoplay=True)["session_id"]
    api_clock.advance(60)  # 166 plays at 50x finish in ~10s (well inside the idle TTL)
    snap = client.get(f"{BASE}/sessions/{sid}").json()
    assert snap["playback"]["status"] == "finished"
    assert snap["state"]["status"] == "final"
    assert (snap["state"]["away_score"], snap["state"]["home_score"]) == (27, 24)
    assert client.post(f"{BASE}/sessions/{sid}/play").status_code == 409


def test_sessions_do_not_interfere(client, api_clock):
    sa = start(client, autoplay=True)
    sb = start(client)
    ha, hb = {"X-Session-Token": sa["session_token"]}, {"X-Session-Token": sb["session_token"]}
    a, b = sa["session_id"], sb["session_id"]
    api_clock.advance(SECONDS_PER_PLAY * 30)
    client.post(f"{BASE}/sessions/{b}/step", json={"plays": 5}, headers=hb)
    assert client.get(f"{BASE}/sessions/{a}", headers=ha).json()["playback"]["cursor"] == 30
    assert client.get(f"{BASE}/sessions/{b}", headers=hb).json()["playback"]["cursor"] == 5
    assert client.get(f"{BASE}/sessions/{a}", headers=hb).status_code == 404  # tokens aren't interchangeable


def test_snapshot_never_leaks_future_plays(client, divisional):
    sid = start(client)["session_id"]
    k = 40
    body = client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 40}).text
    # Some plays repeat verbatim (e.g. touchback kickoffs), so only check text unique to the future.
    revealed = {e.description for e in divisional.events[:k]}
    future = {e.description for e in divisional.events[k:] if len(e.description) > 30} - revealed
    assert future
    leaked = [d for d in future if d in body]
    assert not leaked, f"future plays leaked: {leaked[:2]}"
    assert "final_home_score" not in body and "final_away_score" not in body


def test_delete_session(client):
    sid = start(client)["session_id"]
    assert client.delete(f"{BASE}/sessions/{sid}").status_code == 204
    assert client.get(f"{BASE}/sessions/{sid}").status_code == 404
    assert client.delete(f"{BASE}/sessions/{sid}").status_code == 404
