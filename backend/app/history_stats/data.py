"""Historical NFL stats: one row per player-season and team-season, 1999-2024 (nflverse, CC BY 4.0).

Source of truth in production: Supabase `history.player_seasons` / `history.team_seasons` /
`history.stats_builds` (read as the backend-only `sideline_reader` role, checksum re-checked). Fallback and
default for local runs: the committed files in `backend/data/history/` (built by
`scripts/build_history_stats.py`). Both produce the same `content_sha256`, so either source gives the same
answers and cache keys.

2025 is excluded everywhere (the featured week is in 2025): seasons are capped at `LAST_ALLOWED_SEASON`, here
and by a database check.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import logging
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Any, NamedTuple

from app.core.config import BACKEND_DIR, get_settings

log = logging.getLogger("sideline.history_stats")

HISTORY_DIR = BACKEND_DIR / "data" / "history"
LAST_ALLOWED_SEASON = 2024

STAT_COLUMNS = [
    "games",
    "completions",
    "attempts",
    "pass_yards",
    "pass_td",
    "interceptions",
    "carries",
    "rush_yards",
    "rush_td",
    "receptions",
    "targets",
    "rec_yards",
    "rec_td",
    "tackles",
    "sacks",
    "def_interceptions",
    "fg_made",
    "fg_att",
]
PLAYER_COLUMNS = ["season", "player_id", "player_name", "position", "team", *STAT_COLUMNS]
TEAM_COLUMNS = ["season", "team", "wins", "losses", "ties", "points_for", "points_against", "playoff_result"]


class PlayerSeasonRow(NamedTuple):
    """One player-season. A NamedTuple (not a pydantic model): 42k rows stay ~10x smaller in memory."""

    season: int
    player_id: str
    player_name: str
    position: str
    team: str
    games: int
    completions: int
    attempts: int
    pass_yards: int
    pass_td: int
    interceptions: int
    carries: int
    rush_yards: int
    rush_td: int
    receptions: int
    targets: int
    rec_yards: int
    rec_td: int
    tackles: int
    sacks: int
    def_interceptions: int
    fg_made: int
    fg_att: int


class TeamSeasonRow(NamedTuple):
    season: int
    team: str
    wins: int
    losses: int
    ties: int
    points_for: int
    points_against: int
    playoff_result: str


_TEXT_PLAYER = {"player_id", "player_name", "position", "team"}


def player_row(raw: Mapping[str, Any]) -> PlayerSeasonRow:
    """Validate one row (from CSV strings or database values): ints are ints, text is text."""
    return PlayerSeasonRow._make(str(raw[c]) if c in _TEXT_PLAYER else int(raw[c]) for c in PlayerSeasonRow._fields)


def team_row(raw: Mapping[str, Any]) -> TeamSeasonRow:
    return TeamSeasonRow._make(
        str(raw[c]) if c in ("team", "playoff_result") else int(raw[c]) for c in TeamSeasonRow._fields
    )


class HistoryIntegrityError(Exception):
    """Stored rows don't match their recorded checksum."""


def content_sha256(players: Sequence[PlayerSeasonRow], teams: Sequence[TeamSeasonRow]) -> str:
    """Order-independent canonical hash of all rows (same for the local files and the Supabase copy)."""
    p = sorted((r._asdict() for r in players), key=lambda r: (r["season"], r["player_id"]))
    t = sorted((r._asdict() for r in teams), key=lambda r: (r["season"], r["team"]))
    canonical = json.dumps({"players": p, "teams": t}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass
class HistoryFile:
    players: list[PlayerSeasonRow]
    teams: list[TeamSeasonRow]
    meta: dict[str, Any]
    source: str  # "supabase" | "local"


def load_local(directory: Path = HISTORY_DIR, *, verify: bool = True) -> HistoryFile:
    with gzip.open(directory / "player_seasons.csv.gz", "rt", newline="", encoding="utf-8") as fh:
        players = [player_row(r) for r in csv.DictReader(fh)]
    with (directory / "team_seasons.csv").open(newline="", encoding="utf-8") as fh:
        teams = [team_row(r) for r in csv.DictReader(fh)]
    meta_path = directory / "source.json"
    meta: dict[str, Any] = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    if verify and meta.get("content_sha256") != content_sha256(players, teams):
        raise HistoryIntegrityError("local history files don't match source.json's content_sha256")
    return HistoryFile(players=players, teams=teams, meta=meta, source="local")


#: (build row or None, player rows, team rows). Production uses Postgres; tests pass a fake.
HistoryFetch = Callable[[], tuple[Mapping[str, Any] | None, Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]]


def postgres_history_fetch(dsn: str) -> HistoryFetch:
    def fetch() -> tuple[Mapping[str, Any] | None, Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(dsn, connect_timeout=10, row_factory=dict_row) as conn, conn.cursor() as cur:
            conn.read_only = True
            cur.execute(
                "select first_season, last_season, sources, license, attribution, generated_at::text as "
                "generated_at, content_sha256 from history.stats_builds order by imported_at desc limit 1"
            )
            build = cur.fetchone()
            cur.execute(f"select {', '.join(PLAYER_COLUMNS)} from history.player_seasons")
            players = cur.fetchall()
            cur.execute(f"select {', '.join(TEAM_COLUMNS)} from history.team_seasons")
            teams = cur.fetchall()
        return build, players, teams

    return fetch


def load_from_rows(
    build: Mapping[str, Any], players: Sequence[Mapping[str, Any]], teams: Sequence[Mapping[str, Any]]
) -> HistoryFile:
    p = [player_row(r) for r in players]
    t = [team_row(r) for r in teams]
    if content_sha256(p, t) != build["content_sha256"]:
        raise HistoryIntegrityError("Supabase history stats don't match their recorded checksum")
    meta = dict(build)
    if isinstance(meta.get("sources"), str):
        meta["sources"] = json.loads(meta["sources"])
    return HistoryFile(players=p, teams=t, meta=meta, source="supabase")


def load_history(fetch: HistoryFetch | None = None) -> HistoryFile:
    """Supabase first when configured (REPLAY_DATA_SOURCE=supabase + SUPABASE_DB_URL), else local files.
    Any Supabase failure (logged by exception type only) falls back to the local files."""
    settings = get_settings()
    if fetch is None and settings.replay_data_source == "supabase" and settings.supabase_db_url is not None:
        fetch = postgres_history_fetch(settings.supabase_db_url.get_secret_value())
    if fetch is not None:
        try:
            build, players, teams = fetch()
            if build is not None:
                data = load_from_rows(build, players, teams)
                log.info("Loaded %d player seasons from Supabase", len(data.players))
                return data
            log.warning("No history stats build in Supabase; using local files")
        except Exception as exc:  # never log the text: it could contain connection details
            log.warning("Could not load history stats from Supabase (%s); using local files", type(exc).__name__)
    return load_local()


# ---------------------------------------------------------------- queries

_NAME = re.compile(r"[a-z]+")


def _name_key(name: str) -> str:
    return " ".join(_NAME.findall(name.lower()))


class HistoryStats:
    def __init__(self, data: HistoryFile):
        if any(r.season > LAST_ALLOWED_SEASON for r in data.players) or any(
            r.season > LAST_ALLOWED_SEASON for r in data.teams
        ):
            raise HistoryIntegrityError(f"history stats include seasons after {LAST_ALLOWED_SEASON}")
        self.data = data
        self.version = content_sha256(data.players, data.teams)[:12]
        self.first = min(r.season for r in data.teams)
        self.last = max(r.season for r in data.teams)

    @cached_property
    def by_player(self) -> dict[str, list[PlayerSeasonRow]]:
        out: dict[str, list[PlayerSeasonRow]] = {}
        for r in self.data.players:
            out.setdefault(r.player_id, []).append(r)
        for rows in out.values():
            rows.sort(key=lambda r: r.season)
        return out

    def find_players(self, query: str, limit: int = 5) -> list[list[PlayerSeasonRow]]:
        """Full-name match first ("tom brady"), then last name (+ first initial). Most career yards first."""
        q = _name_key(query)
        if not q:
            return []
        words = q.split()
        exact, partial = [], []
        for rows in self.by_player.values():
            name = _name_key(rows[-1].player_name)
            if name == q:
                exact.append(rows)
                continue
            parts = name.split()
            if parts and parts[-1] == words[-1] and (len(words) == 1 or parts[0][0] == words[0][0]):
                partial.append(rows)

        def weight(rows: list[PlayerSeasonRow]) -> int:
            return -sum(r.pass_yards + r.rush_yards + r.rec_yards + 20 * (r.tackles + r.fg_made) for r in rows)

        return (sorted(exact, key=weight) + sorted(partial, key=weight))[:limit]

    def leaders(self, season: int, stat: str, limit: int = 5) -> list[PlayerSeasonRow]:
        rows = [r for r in self.data.players if r.season == season]
        return sorted(rows, key=lambda r: (-getattr(r, stat), r.player_name))[: max(1, min(limit, 10))]

    def team_seasons(self, team: str) -> list[TeamSeasonRow]:
        code = team.strip().upper()
        return sorted((r for r in self.data.teams if r.team == code), key=lambda r: r.season)

    def season_teams(self, season: int) -> list[TeamSeasonRow]:
        return [r for r in self.data.teams if r.season == season]


@lru_cache
def get_history_stats() -> HistoryStats | None:
    """Loaded once per process; None if no data is available at all (the tools then say so)."""
    try:
        return HistoryStats(load_history())
    except FileNotFoundError:
        log.warning("No historical stats files; historical questions are unavailable")
        return None
