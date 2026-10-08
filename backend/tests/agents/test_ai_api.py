"""HTTP: Ask Sideline + insights endpoints, auth, isolation, error states."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes.replay import get_ai_service, get_session_manager
from app.main import create_app
from app.replay.sessions import ReplaySessionManager
from tests.agents.conftest import FAKE_KEY, scripted, simple_answer
from tests.replay.conftest import DIVISIONAL, FakeClock

BASE = "/api/v1/replay"


def score_answer(returns: dict[str, Any]) -> dict[str, Any]:
    s = returns["get_game_state"]["score"]
    return simple_answer(f"{s['away_team']} {s['away']}, {s['home_team']} {s['home']}")


@pytest.fixture
def app_with(make_service):
    def build(model=None, **settings):
        app = create_app()
        manager = ReplaySessionManager(clock=FakeClock())
        service = make_service(model or scripted([("get_game_state", {})], score_answer), **settings)
        app.dependency_overrides[get_session_manager] = lambda: manager
        app.dependency_overrides[get_ai_service] = lambda: service
        return TestClient(app), service

    return build


def start(client: TestClient, game_id: str = DIVISIONAL) -> tuple[str, dict[str, str]]:
    body = client.post(f"{BASE}/sessions", json={"game_id": game_id}).json()
    return body["session_id"], {"X-Session-Token": body["session_token"]}


def test_session_requires_token(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    assert client.get(f"{BASE}/sessions/{sid}").status_code == 404
    assert client.get(f"{BASE}/sessions/{sid}", headers={"X-Session-Token": "wrong"}).status_code == 404
    assert client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "score?"}).status_code == 404
    assert client.get(f"{BASE}/sessions/{sid}", headers=auth).status_code == 200


def test_token_is_only_returned_at_creation(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    body = client.get(f"{BASE}/sessions/{sid}", headers=auth).text
    assert auth["X-Session-Token"] not in body and "session_token" not in body


def test_ask_answers_as_of_current_position(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 16}, headers=auth)
    res = client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "What's the score?"}, headers=auth)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"]["answer"] == "KC 0, BUF 3"
    assert body["as_of"]["cursor"] == 16 and body["status"] == "ok"
    assert FAKE_KEY not in res.text


def test_sessions_at_different_positions_get_different_answers(app_with):
    client, _ = app_with()
    a, auth_a = start(client)
    b, auth_b = start(client)
    client.post(f"{BASE}/sessions/{a}/step", json={"plays": 16}, headers=auth_a)
    client.post(f"{BASE}/sessions/{b}/step", json={"plays": 50}, headers=auth_b)
    ra = client.post(f"{BASE}/sessions/{a}/ask", json={"question": "score?"}, headers=auth_a).json()
    rb = client.post(f"{BASE}/sessions/{b}/ask", json={"question": "score?"}, headers=auth_b).json()
    assert ra["as_of"]["cursor"] == 16 and rb["as_of"]["cursor"] == 50
    assert ra["answer"]["answer"] != rb["answer"]["answer"]
    # Another session's token can't read this session.
    assert client.post(f"{BASE}/sessions/{a}/ask", json={"question": "score?"}, headers=auth_b).status_code == 404


def test_question_validation(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    assert client.post(f"{BASE}/sessions/{sid}/ask", json={"question": ""}, headers=auth).status_code == 422
    assert client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "x" * 501}, headers=auth).status_code == 422


def test_not_configured_returns_setup_message(app_with):
    client, _ = app_with(portkey_api_key=None)
    sid, auth = start(client)
    res = client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "score?"}, headers=auth)
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["code"] == "not_configured" and "PORTKEY_API_KEY" in detail["message"]


def test_insights_with_shared_explanations(app_with):
    model = scripted([("get_game_context", {})], simple_answer("Big moment.", tool="get_game_context"))
    client, service = app_with(model)
    a, auth_a = start(client)
    b, auth_b = start(client)
    for sid, auth in ((a, auth_a), (b, auth_b)):
        client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 50}, headers=auth)
    first = client.get(f"{BASE}/sessions/{a}/insights?explain=1", headers=auth_a).json()
    assert first["insights"] and all(i["play_sequence"] < 50 for i in first["insights"])
    generated = [i for i in first["insights"] if i["explanation_status"] == "generated"]
    assert len(generated) == 1 and generated[0]["explanation"] == "Big moment."
    calls = len(service.audit.recent(100))
    second = client.get(f"{BASE}/sessions/{b}/insights?explain=0", headers=auth_b).json()
    reused = next(i for i in second["insights"] if i["id"] == generated[0]["id"])
    assert reused["explanation_status"] == "cached" and len(service.audit.recent(100)) == calls


def test_insights_without_ai_still_return_deterministic_moments(app_with):
    client, _ = app_with(portkey_api_key=None)
    sid, auth = start(client)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 50}, headers=auth)
    body = client.get(f"{BASE}/sessions/{sid}/insights", headers=auth).json()
    assert body["ai_configured"] is False and body["insights"]
    assert any(i["explanation_status"] == "not_configured" for i in body["insights"])
    assert all(i["headline"] for i in body["insights"])


def test_ai_status_exposes_no_secrets(app_with):
    client, _ = app_with()
    res = client.get("/api/v1/ai/status")
    assert res.status_code == 200 and res.json()["configured"] is True and res.json()["model"] == "gpt-6-luna"
    assert FAKE_KEY not in res.text


def test_conversation_is_kept_per_session_and_can_be_reset(app_with):
    client, _ = app_with()
    a, auth_a = start(client)
    b, auth_b = start(client)
    for sid, auth in ((a, auth_a), (b, auth_b)):
        client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 20}, headers=auth)
    first = client.post(
        f"{BASE}/sessions/{a}/ask", json={"question": "Who has the most rushing yards?"}, headers=auth_a
    ).json()
    follow = client.post(f"{BASE}/sessions/{a}/ask", json={"question": "No, which player?"}, headers=auth_a).json()
    other = client.post(f"{BASE}/sessions/{b}/ask", json={"question": "No, which player?"}, headers=auth_b).json()
    assert (first["context_turns"], follow["context_turns"], other["context_turns"]) == (0, 1, 0)

    assert client.delete(f"{BASE}/sessions/{a}/conversation", headers=auth_b).status_code == 404  # wrong token
    assert client.delete(f"{BASE}/sessions/{a}/conversation", headers=auth_a).status_code == 204
    after = client.post(f"{BASE}/sessions/{a}/ask", json={"question": "Anything else?"}, headers=auth_a).json()
    assert after["context_turns"] == 0


def test_restart_hides_turns_from_later_in_the_game(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 50}, headers=auth)
    client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "Who has the most rushing yards?"}, headers=auth)
    client.post(f"{BASE}/sessions/{sid}/restart", headers=auth)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 5}, headers=auth)
    res = client.post(
        f"{BASE}/sessions/{sid}/ask", json={"question": "How many yards does he have?"}, headers=auth
    ).json()
    assert res["context_turns"] == 0 and res["as_of"]["cursor"] == 5


def test_conversation_endpoint_hides_later_turns_after_restart(app_with):
    client, _ = app_with()
    sid, auth = start(client)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 10}, headers=auth)
    early = client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "Early question?"}, headers=auth).json()
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 40}, headers=auth)
    late = client.post(f"{BASE}/sessions/{sid}/ask", json={"question": "Late question?"}, headers=auth).json()

    convo = client.get(f"{BASE}/sessions/{sid}/conversation", headers=auth).json()
    assert [t["request_id"] for t in convo["turns"]] == [early["request_id"], late["request_id"]]
    assert convo["hidden_later"] == 0

    client.post(f"{BASE}/sessions/{sid}/restart", headers=auth)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 20}, headers=auth)
    rewound = client.get(f"{BASE}/sessions/{sid}/conversation", headers=auth).json()
    assert rewound["cursor"] == 20
    assert [t["request_id"] for t in rewound["turns"]] == [early["request_id"]]  # asked at play 10
    assert rewound["hidden_later"] == 1 and "Late question?" not in str(rewound["turns"])

    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 40}, headers=auth)
    assert len(client.get(f"{BASE}/sessions/{sid}/conversation", headers=auth).json()["turns"]) == 2  # back in view
    assert client.get(f"{BASE}/sessions/{sid}/conversation").status_code == 404  # token required
