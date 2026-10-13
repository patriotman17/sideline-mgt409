"""In-memory catalog of ingested historical games (loaded once per process).

Source: committed local extracts (default), or Supabase's history.* tables when
``REPLAY_DATA_SOURCE=supabase`` and ``SUPABASE_DB_URL`` are set. Supabase rows go through the same
ingestion. Games that exist only locally (not imported yet) are still included, and any problem
(unreachable, bad checksum, no games) falls back to the local files so the guest demo always works.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from app.core.config import Settings, get_settings
from app.replay.history_db import load_games_from_supabase, postgres_fetch
from app.replay.ingest import load_games
from app.replay.models import Game

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "nflverse"
log = logging.getLogger("sideline.replay")

DataSource = Literal["local", "supabase", "supabase+local"]


class GameCatalog:
    def __init__(self, games: list[Game], source: DataSource = "local"):
        self._games = {g.info.game_id: g for g in games}
        self.source: DataSource = source

    @classmethod
    def from_directory(cls, directory: Path) -> GameCatalog:
        return cls(list(load_games(directory)) if directory.is_dir() else [])

    def get(self, game_id: str) -> Game | None:
        return self._games.get(game_id)

    def list(self) -> list[Game]:
        return sorted(self._games.values(), key=lambda g: (g.info.game_date or "", g.info.game_id))


def build_catalog(settings: Settings, data_dir: Path = DEFAULT_DATA_DIR) -> GameCatalog:
    if settings.replay_data_source == "supabase":
        if settings.supabase_db_url is None:
            log.warning("REPLAY_DATA_SOURCE=supabase but SUPABASE_DB_URL is not set; using local extracts")
        else:
            try:
                games = load_games_from_supabase(postgres_fetch(settings.supabase_db_url.get_secret_value()))
                if games:
                    # Supabase is authoritative for what it has; local-only games (e.g. not imported yet)
                    # are kept so nothing disappears from the app.
                    in_db = {g.info.game_id for g in games}
                    local_only = [g for g in GameCatalog.from_directory(data_dir).list() if g.info.game_id not in in_db]
                    log.info("Loaded %d games from Supabase (+%d local-only)", len(games), len(local_only))
                    return GameCatalog(games + local_only, source="supabase+local" if local_only else "supabase")
                log.warning("Supabase history has no games; using local extracts")
            except Exception as exc:  # never log the exception text: it could contain connection details
                log.warning("Could not load games from Supabase (%s); using local extracts", type(exc).__name__)
    return GameCatalog.from_directory(data_dir)


@lru_cache
def get_catalog() -> GameCatalog:
    return build_catalog(get_settings())
