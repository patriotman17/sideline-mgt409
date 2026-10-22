from app.core.config import BACKEND_DIR, ENV_FILES, REPO_ROOT, Settings, load_env_files


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


def test_env_lookup_order_is_repo_then_one_folder_up():
    assert (BACKEND_DIR / ".env", REPO_ROOT / ".env", REPO_ROOT.parent / ".env") == ENV_FILES


def _isolate_key(monkeypatch):
    """Unset the key but register it with monkeypatch, so whatever load_dotenv sets is undone after the test."""
    monkeypatch.setenv("PORTKEY_API_KEY", "placeholder")
    monkeypatch.delenv("PORTKEY_API_KEY")


def _layout(tmp_path):
    repo = tmp_path / "repo"
    (repo / "backend").mkdir(parents=True)
    return (repo / "backend" / ".env", repo / ".env", tmp_path / ".env")


def test_key_one_folder_above_the_repo_is_found(tmp_path, monkeypatch):
    _isolate_key(monkeypatch)
    backend, repo, parent = _layout(tmp_path)
    parent.write_text("PORTKEY_API_KEY=pk-from-parent\n")
    assert load_env_files((backend, repo, parent)) == [parent]
    s = Settings.from_env()
    assert s.portkey_api_key is not None and s.portkey_api_key.get_secret_value() == "pk-from-parent"


def test_repo_env_wins_over_the_folder_above(tmp_path, monkeypatch):
    _isolate_key(monkeypatch)
    backend, repo, parent = _layout(tmp_path)
    repo.write_text("PORTKEY_API_KEY=pk-from-repo\n")
    parent.write_text("PORTKEY_API_KEY=pk-from-parent\n")
    load_env_files((backend, repo, parent))
    s = Settings.from_env()
    assert s.portkey_api_key is not None and s.portkey_api_key.get_secret_value() == "pk-from-repo"


def test_process_environment_wins_over_env_files(tmp_path, monkeypatch):
    monkeypatch.setenv("PORTKEY_API_KEY", "pk-from-process")
    backend, repo, parent = _layout(tmp_path)
    parent.write_text("PORTKEY_API_KEY=pk-from-parent\n")
    load_env_files((backend, repo, parent))
    s = Settings.from_env()
    assert s.portkey_api_key is not None and s.portkey_api_key.get_secret_value() == "pk-from-process"


def test_cors_origins_accept_bare_hosts(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("CORS_ORIGINS", "sideline-web.onrender.com, http://localhost:8081/ ,https://x.example")
    assert Settings.from_env().cors_origins == [
        "https://sideline-web.onrender.com",
        "http://localhost:8081",
        "https://x.example",
    ]
