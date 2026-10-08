"""In-memory catalog of ingested historical games (loaded once per process)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.replay.ingest import load_games
from app.replay.models import Game

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "nflverse"


class GameCatalog:
    def __init__(self, games: list[Game]):
        self._games = {g.info.game_id: g for g in games}

    @classmethod
    def from_directory(cls, directory: Path) -> GameCatalog:
        return cls(list(load_games(directory)) if directory.is_dir() else [])

    def get(self, game_id: str) -> Game | None:
        return self._games.get(game_id)

    def list(self) -> list[Game]:
        return sorted(self._games.values(), key=lambda g: (g.info.game_date or "", g.info.game_id))


@lru_cache
def get_catalog() -> GameCatalog:
    return GameCatalog.from_directory(DEFAULT_DATA_DIR)
