"""Supabase-backed historical data: same games as the local extracts, integrity checks, fallback."""

from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.replay import catalog as catalog_module
from app.replay.catalog import DEFAULT_DATA_DIR, build_catalog
from app.replay.history_db import HistoryIntegrityError, games_from_rows, rows_sha256
from app.replay.ingest import load_game_file

GAMES = ["2025_05_SF_LA", "2025_05_MIN_CLE", "2023_20_KC_BUF"]


def fake_db(game_ids: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """What history.games / history.plays hold after scripts/import_history_to_supabase.py."""
    games: list[dict[str, Any]] = []
    plays: list[dict[str, Any]] = []
    for gid in game_ids:
        path = DEFAULT_DATA_DIR / f"{gid}.csv"
        with path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        meta = json.loads(path.with_suffix(".source.json").read_text())
        games.append(
            {
                "game_id": gid,
                "source": meta["source"],
                "source_url": meta["source_url"],
                "source_sha256": meta["source_sha256"],
                "retrieved_at": meta["retrieved_at"],
                "license": meta["license"],
                "attribution": meta["attribution"],
                "row_count": len(rows),
                "rows_sha256": rows_sha256(rows),
            }
        )
        # Postgres returns jsonb as dicts; some drivers return text. Cover both.
        plays += [{"game_id": gid, "row_index": i, "row": r if i % 2 else json.dumps(r)} for i, r in enumerate(rows)]
    return games, plays


def test_games_from_supabase_rows_equal_the_local_extracts():
    games, plays = fake_db(GAMES)
    loaded = {g.info.game_id: g for g in games_from_rows(games, plays)}
    for gid in GAMES:
        local = load_game_file(DEFAULT_DATA_DIR / f"{gid}.csv")
        remote = loaded[gid]
        assert remote.events == local.events and remote.info == local.info
        assert remote.warnings == () and "CC BY 4.0" in (remote.provenance.license or "")


def test_tampered_or_incomplete_rows_are_rejected():
    games, plays = fake_db(["2025_05_SF_LA"])
    with pytest.raises(HistoryIntegrityError):
        games_from_rows(games, plays[:-1])  # a missing row
    tampered = [dict(p) for p in plays]
    row = tampered[5]["row"]
    row = json.loads(row) if isinstance(row, str) else dict(row)
    row["yards_gained"] = "99"
    tampered[5]["row"] = row
    with pytest.raises(HistoryIntegrityError):
        games_from_rows(games, tampered)


def test_import_script_and_loader_hash_rows_identically():
    spec = importlib.util.spec_from_file_location(
        "importer", Path(__file__).resolve().parents[2] / "scripts" / "import_history_to_supabase.py"
    )
    assert spec and spec.loader
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    rows = importer.read_rows(DEFAULT_DATA_DIR / "2025_05_KC_JAX.csv")
    assert importer.rows_sha256(rows) == rows_sha256(rows)
    sql, game, _ = importer.game_sql(DEFAULT_DATA_DIR / "2025_05_KC_JAX.csv")
    assert sql.count("::jsonb)") == len(rows) == len(game.events) and "on conflict (game_id)" in sql


def test_catalog_uses_supabase_when_configured(monkeypatch):
    monkeypatch.setattr(catalog_module, "postgres_fetch", lambda dsn: lambda: fake_db(GAMES))
    settings = Settings(replay_data_source="supabase", supabase_db_url=SecretStr("postgresql://reader@db/x"))
    cat = build_catalog(settings)
    ids = {g.info.game_id for g in cat.list()}
    assert set(GAMES) <= ids  # everything in Supabase…
    assert ids == {g.info.game_id for g in build_catalog(Settings()).list()}  # …plus local-only games
    assert cat.source == "supabase+local"
    only_db = build_catalog(settings, data_dir=Path("/nonexistent"))
    assert only_db.source == "supabase" and {g.info.game_id for g in only_db.list()} == set(GAMES)


def test_catalog_falls_back_to_local_files(monkeypatch, caplog):
    local_count = len(build_catalog(Settings()).list())
    assert build_catalog(Settings()).source == "local"
    # Configured but no connection string.
    assert build_catalog(Settings(replay_data_source="supabase")).source == "local"

    # Unreachable database: falls back, and never logs the connection string.
    def boom():
        raise OSError("connection to postgresql://reader:hunter2@db failed")

    monkeypatch.setattr(catalog_module, "postgres_fetch", lambda dsn: boom)
    cat = build_catalog(
        Settings(replay_data_source="supabase", supabase_db_url=SecretStr("postgresql://reader:hunter2@db/x"))
    )
    assert cat.source == "local" and len(cat.list()) == local_count
    assert "hunter2" not in caplog.text and "OSError" in caplog.text
