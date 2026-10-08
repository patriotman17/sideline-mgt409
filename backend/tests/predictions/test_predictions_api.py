"""HTTP: authenticated prediction endpoints, idempotency, masking, AI explanations."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.routes.replay import get_ai_service, get_session_manager
from app.main import create_app
from app.replay.sessions import ReplaySessionManager
from tests.agents.conftest import scripted, simple_answer
from tests.replay.conftest import DIVISIONAL, FakeClock

BASE = "/api/v1/replay"


@pytest.fixture
def api(make_service):
    app = create_app()
    manager = ReplaySessionManager(clock=FakeClock())
    ai = make_service(
        scripted([("get_game_context", {})], simple_answer("Buffalo moved efficiently.", tool="get_game_context"))
    )
    app.dependency_overrides[get_session_manager] = lambda: manager
    app.dependency_overrides[get_ai_service] = lambda: ai
    return TestClient(app), ai


def start(client: TestClient, **body: Any) -> tuple[str, dict[str, str]]:
    data = client.post(f"{BASE}/sessions", json={"game_id": DIVISIONAL, **body}).json()
    return data["session_id"], {"X-Session-Token": data["session_token"]}


def test_endpoints_require_the_session_token(api):
    client, _ = api
    sid, auth = start(client)
    _other_sid, other = start(client)
    for path in ("predictions", "predictions/open", "predictions/resolved", "predictions/history", "predictions/stats"):
        assert client.get(f"{BASE}/sessions/{sid}/{path}").status_code == 404
        assert client.get(f"{BASE}/sessions/{sid}/{path}", headers=other).status_code == 404
        assert client.get(f"{BASE}/sessions/{sid}/{path}", headers=auth).status_code == 200
    assert (
        client.post(f"{BASE}/sessions/{sid}/predictions/x/answer", json={"option_id": "yes"}, headers=other).status_code
        == 404
    )


def test_full_lifecycle_over_http(api):
    client, _ = api
    sid, auth = start(client)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 2}, headers=auth)
    ov = client.get(f"{BASE}/sessions/{sid}/predictions", headers=auth).json()
    assert ov["scoring_mode"] == "demo" and "Demo scoring" in ov["scoring_note"]
    drive = next(i["prediction"] for i in ov["open"] if i["prediction"]["type"] == "drive_touchdown")
    assert "correct_option_id" in drive and drive["correct_option_id"] is None  # nothing about the outcome

    r = client.post(f"{BASE}/sessions/{sid}/predictions/{drive['id']}/answer", json={"option_id": "no"}, headers=auth)
    assert r.status_code == 200 and r.json()["created"] is True and r.json()["item"]["your_answer"] == "no"
    again = client.post(
        f"{BASE}/sessions/{sid}/predictions/{drive['id']}/answer", json={"option_id": "no"}, headers=auth
    )
    assert again.status_code == 200 and again.json()["created"] is False  # idempotent retry
    changed = client.post(
        f"{BASE}/sessions/{sid}/predictions/{drive['id']}/answer", json={"option_id": "yes"}, headers=auth
    )
    assert changed.status_code == 409 and changed.json()["detail"]["code"] == "already_answered"
    bad = client.post(
        f"{BASE}/sessions/{sid}/predictions/{drive['id']}/answer", json={"option_id": "maybe"}, headers=auth
    )
    assert bad.status_code in (409, 422)

    client.post(f"{BASE}/sessions/{sid}/settings", headers=auth)  # unknown route is harmless
    client.put(f"{BASE}/sessions/{sid}/predictions/settings", json={"pause_for_predictions": False}, headers=auth)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 20}, headers=auth)  # BUF kicks a FG at play 16
    hist = client.get(f"{BASE}/sessions/{sid}/predictions/history", headers=auth).json()
    mine = next(i for i in hist["items"] if i["prediction"]["id"] == drive["id"])
    assert (mine["outcome"], mine["points_awarded"]) == ("correct", 20)
    assert hist["stats"]["points"] == 20 and hist["stats"]["current_streak"] == 1
    assert client.get(f"{BASE}/sessions/{sid}/predictions/stats", headers=auth).json()["accuracy"] == 1.0


def test_unknown_or_future_prediction_ids_are_not_found(api):
    client, _ = api
    sid, auth = start(client)
    r = client.post(
        f"{BASE}/sessions/{sid}/predictions/{DIVISIONAL}:next_score:2/answer", json={"option_id": "BUF"}, headers=auth
    )
    assert r.status_code == 404  # not revealed yet at play 0


def test_restart_masks_results_and_reports_where_questions_resume(api):
    client, _ = api
    sid, auth = start(client, pause_for_predictions=False)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 40}, headers=auth)
    client.post(f"{BASE}/sessions/{sid}/restart", headers=auth)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 3}, headers=auth)
    ov = client.get(f"{BASE}/sessions/{sid}/predictions", headers=auth).json()
    assert ov["resumes_after_play"] == 40 and ov["open"] == []
    for item in ov["locked"] + ov["resolved"]:
        assert item["prediction"]["opened_cursor"] <= 3
    assert all(i["prediction"]["correct_option_id"] is None for i in ov["locked"])


def test_playback_snapshot_reports_pause_for_prediction(api):
    client, _ = api
    sid, auth = start(client)
    snap = client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 10}, headers=auth).json()
    assert snap["playback"]["cursor"] == 2 and snap["playback"]["paused_for_prediction"] is True


def test_ai_explains_only_resolved_predictions(api):
    client, ai = api
    sid, auth = start(client, pause_for_predictions=False)
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 2}, headers=auth)
    pid = f"{DIVISIONAL}:drive_touchdown:2"
    early = client.post(f"{BASE}/sessions/{sid}/predictions/{pid}/explain", headers=auth)
    assert early.status_code == 409 and early.json()["detail"]["code"] == "not_resolved"
    client.post(f"{BASE}/sessions/{sid}/step", json={"plays": 20}, headers=auth)
    ok = client.post(f"{BASE}/sessions/{sid}/predictions/{pid}/explain", headers=auth)
    assert ok.status_code == 200 and ok.json()["explanation"] == "Buffalo moved efficiently."
    calls = len(ai.audit.recent(100))
    again = client.post(f"{BASE}/sessions/{sid}/predictions/{pid}/explain", headers=auth)
    assert again.json() == ok.json() and len(ai.audit.recent(100)) == calls  # shared cache, no new model call
    rec = ai.audit.recent(1)[0]
    hist = client.get(f"{BASE}/sessions/{sid}/predictions/history", headers=auth).json()
    resolved_at = next(i for i in hist["items"] if i["prediction"]["id"] == pid)["prediction"]["resolved_cursor"]
    assert rec.kind == "insight" and rec.cursor == resolved_at == 16  # the view at the resolving play (FG)
