from app.core.config import Settings


def test_settings_read_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test, http://b.test")
    monkeypatch.setenv("PORTKEY_API_KEY", "pk-test")
    s = Settings.from_env()
    assert s.environment == "test"
    assert s.cors_origins == ["http://a.test", "http://b.test"]
    assert s.portkey_api_key is not None
    assert s.portkey_api_key.get_secret_value() == "pk-test"
    assert "pk-test" not in repr(s)


def test_blank_secret_is_none(monkeypatch):
    monkeypatch.setenv("PORTKEY_API_KEY", "   ")
    assert Settings.from_env().portkey_api_key is None
