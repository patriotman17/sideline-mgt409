"""A crashing endpoint still answers with CORS headers, so browsers show the error instead of "Failed to fetch"."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_unhandled_errors_keep_cors_headers(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://sideline-web.onrender.com")
    from app.core import config

    config.get_settings.cache_clear()
    try:
        app = create_app()

        @app.get("/boom")
        def boom() -> None:
            raise RuntimeError("secret detail")

        r = TestClient(app, raise_server_exceptions=False).get(
            "/boom", headers={"Origin": "https://sideline-web.onrender.com"}
        )
        assert r.status_code == 500
        assert r.headers["access-control-allow-origin"] == "https://sideline-web.onrender.com"
        assert r.json()["detail"]["code"] == "server_error"
        assert "secret" not in r.text
    finally:
        config.get_settings.cache_clear()


def test_startup_warms_up_data():
    from app.api.routes.week import get_slates

    get_slates.cache_clear()
    with TestClient(create_app()) as client:  # runs the lifespan (warm-up)
        assert get_slates.cache_info().currsize == 1  # loaded before the first request
        assert client.get("/health").status_code == 200
