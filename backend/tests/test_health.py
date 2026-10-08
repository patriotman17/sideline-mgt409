from pydantic import SecretStr

from app import __version__
from app.core.config import Settings, get_settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_health_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "Sideline API"
    assert body["version"] == __version__
    assert body["environment"] == get_settings().environment


def test_health_does_not_leak_secrets():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        portkey_api_key=SecretStr("test-secret-value")
    )
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert "test-secret-value" not in res.text


def test_cors_allows_expo_web_origin(client):
    res = client.get("/health", headers={"Origin": "http://localhost:8081"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:8081"


def test_unknown_route_404(client):
    assert client.get("/api/v1/does-not-exist").status_code == 404
