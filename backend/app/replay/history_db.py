"""Load historical games from Supabase (``history`` schema) instead of local CSV extracts.

Connects as the read-only ``sideline_reader`` role (``SUPABASE_DB_URL``, backend-only secret). The
stored rows are the original nflverse extract rows, so they go through exactly the same ingestion
(``build_game``) and replay engine as local files; each game's ``rows_sha256`` is re-checked on load.
Queries are parameterized and read whole games server-side; nothing here is exposed to clients.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any

from app.replay.ingest import build_game
from app.replay.models import Game, Provenance

#: (games rows, plays rows) fetcher. Production uses Postgres; tests pass a fake.
Fetch = Callable[[], tuple[Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]]

GAMES_SQL = """
select game_id, source, source_url, source_sha256, retrieved_at::text as retrieved_at,
       license, attribution, row_count, rows_sha256
from history.games
order by game_id
"""
PLAYS_SQL = "select game_id, row_index, row from history.plays order by game_id, row_index"


class HistoryIntegrityError(Exception):
    """A game in the database doesn't match its recorded row count or checksum."""


def rows_sha256(rows: list[dict[str, str]]) -> str:
    """Same canonical hash the import script stores (scripts/import_history_to_supabase.py)."""
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def games_from_rows(games: Iterable[Mapping[str, Any]], plays: Iterable[Mapping[str, Any]]) -> list[Game]:
    by_game: dict[str, list[dict[str, str]]] = {}
    for p in plays:
        row = p["row"]
        if isinstance(row, str):
            row = json.loads(row)
        by_game.setdefault(str(p["game_id"]), []).append(
            {str(k): ("" if v is None else str(v)) for k, v in dict(row).items()}
        )
    out: list[Game] = []
    for g in games:
        gid = str(g["game_id"])
        rows = by_game.get(gid, [])
        if len(rows) != g["row_count"] or rows_sha256(rows) != g["rows_sha256"]:
            raise HistoryIntegrityError(f"{gid}: stored rows don't match their recorded count/checksum")
        provenance = Provenance(
            source=str(g["source"]),
            source_url=g["source_url"],
            source_sha256=g["source_sha256"],
            retrieved_at=g["retrieved_at"],
            license=g["license"],
            attribution=g["attribution"],
        )
        out.append(build_game(list(rows), provenance))
    return out


def postgres_fetch(dsn: str) -> Fetch:
    def fetch() -> tuple[Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]:
        import psycopg  # local import: only needed when the Supabase source is enabled
        from psycopg.rows import dict_row

        with (
            psycopg.connect(dsn, connect_timeout=10, row_factory=dict_row) as conn,
            conn.cursor() as cur,
        ):
            conn.read_only = True
            cur.execute(GAMES_SQL)
            games = cur.fetchall()
            cur.execute(PLAYS_SQL)
            plays = cur.fetchall()
        return games, plays

    return fetch


def load_games_from_supabase(fetch: Fetch) -> list[Game]:
    games, plays = fetch()
    return games_from_rows(games, plays)
