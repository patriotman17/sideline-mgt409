"""Fetch historical NFL play-by-play from nflverse and extract single games.

Downloads a season file from the nflverse-data GitHub release (``pbp`` tag),
keeps only the rows for the requested games and only the columns Sideline
uses, and writes them to ``backend/data/nflverse/<game_id>.csv`` with a
``<game_id>.source.json`` provenance sidecar.

The full season download is cached in ``backend/.cache/`` (git-ignored); only
the small per-game extracts are committed.

Data: nflverse play-by-play (https://github.com/nflverse/nflverse-data),
licensed CC BY 4.0. Attribution is required wherever the data is shown.

Usage (from backend/):
    .venv/bin/python scripts/fetch_nflverse_games.py --season 2023 \
        --game 2023_20_KC_BUF --game 2023_22_SF_KC
    .venv/bin/python scripts/fetch_nflverse_games.py --season 2025 --week 5   # every REG game that week
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.replay.source import ATTRIBUTION, COLUMNS, LICENSE, OPTIONAL_COLUMNS, RELEASE_URL  # noqa: E402

CACHE_DIR = BACKEND_DIR / ".cache" / "nflverse"
OUT_DIR = BACKEND_DIR / "data" / "nflverse"


def download(season: int) -> tuple[Path, str]:
    url = RELEASE_URL.format(season=season)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"play_by_play_{season}.csv.gz"
    if not dest.exists():
        print(f"Downloading {url}")
        with httpx.stream("GET", url, follow_redirects=True, timeout=120) as resp:
            resp.raise_for_status()
            tmp = dest.with_suffix(".part")
            with tmp.open("wb") as fh:
                for chunk in resp.iter_bytes():
                    fh.write(chunk)
            tmp.rename(dest)
    else:
        print(f"Using cached {dest}")
    return dest, url


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract(
    source: Path, game_ids: set[str], *, week: int | None = None, season_type: str = "REG"
) -> tuple[dict[str, list[dict[str, str]]], list[str]]:
    """Rows for the requested games (or every ``season_type`` game in ``week``), in source order.
    Returns (rows by game id, columns written)."""
    found: dict[str, list[dict[str, str]]] = {gid: [] for gid in game_ids}
    with gzip.open(source, "rt", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fields = reader.fieldnames or []
        missing = [c for c in COLUMNS if c not in fields]
        if missing:
            raise SystemExit(f"Source schema is missing expected columns: {missing}")
        columns = COLUMNS + [c for c in OPTIONAL_COLUMNS if c in fields]
        for row in reader:
            gid = row["game_id"]
            if week is not None and row["week"] == str(week) and row["season_type"] == season_type:
                found.setdefault(gid, [])
            if gid in found:
                found[gid].append({c: row[c] for c in columns})
    return found, columns


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--game", action="append", default=[], help="nflverse game_id, e.g. 2023_20_KC_BUF")
    parser.add_argument("--week", type=int, help="Extract every game of this week (with --season-type)")
    parser.add_argument("--season-type", default="REG", choices=["REG", "POST"])
    args = parser.parse_args()
    if not args.game and args.week is None:
        parser.error("pass --game and/or --week")

    source, url = download(args.season)
    checksum = sha256(source)
    games, columns = extract(source, set(args.game), week=args.week, season_type=args.season_type)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    retrieved = datetime.now(UTC).isoformat(timespec="seconds")

    for gid, rows in games.items():
        if not rows:
            print(f"!! {gid}: not found in season {args.season}", file=sys.stderr)
            continue
        out = OUT_DIR / f"{gid}.csv"
        with out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        provenance = {
            "game_id": gid,
            "source": "nflverse play-by-play",
            "source_url": url,
            "source_sha256": checksum,
            "retrieved_at": retrieved,
            "license": LICENSE,
            "attribution": ATTRIBUTION,
            "rows": len(rows),
            "columns": columns,
        }
        (OUT_DIR / f"{gid}.source.json").write_text(json.dumps(provenance, indent=2) + "\n")
        print(f"{gid}: {len(rows)} plays -> {out.relative_to(BACKEND_DIR)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
