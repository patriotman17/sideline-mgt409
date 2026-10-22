"""Build historical NFL stats (1999-2024) for Ask Sideline from nflverse.

Downloads (cached in backend/.cache/, git-ignored):
- `stats_player/stats_player_reg_<season>.csv.gz`: regular-season totals per player and season.
- `schedules/games.csv.gz`: every game's result, for team records and playoff outcomes.

Writes `backend/data/history/`:
- `player_seasons.csv.gz`: one row per player and season (offense, defense and kicking basics; players with
  no stats in these columns are dropped).
- `team_seasons.csv`: one row per team and season: regular-season W-L-T, points for/against, playoff result.
- `source.json`: provenance (URLs, SHA-256 of every downloaded file, license, attribution) + content hash.

2025 is never included: the app's featured week is in 2025, and its season context comes from the
leak-safe pregame data instead. `--last` above 2024 is refused.

Usage (from backend/):
    .venv/bin/python scripts/build_history_stats.py            # 1999-2024
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_nflverse_games import sha256  # noqa: E402

from app.history_stats.data import (  # noqa: E402
    LAST_ALLOWED_SEASON,
    PLAYER_COLUMNS,
    TEAM_COLUMNS,
    content_sha256,
)
from app.replay.source import ATTRIBUTION, LICENSE  # noqa: E402

CACHE = BACKEND_DIR / ".cache" / "nflverse" / "stats"
OUT = BACKEND_DIR / "data" / "history"
PLAYER_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{season}.csv.gz"
GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz"

#: source column -> our column (ints).
SOURCE_INTS = {
    "games": "games",
    "completions": "completions",
    "attempts": "attempts",
    "passing_yards": "pass_yards",
    "passing_tds": "pass_td",
    "passing_interceptions": "interceptions",
    "carries": "carries",
    "rushing_yards": "rush_yards",
    "rushing_tds": "rush_td",
    "receptions": "receptions",
    "targets": "targets",
    "receiving_yards": "rec_yards",
    "receiving_tds": "rec_td",
    "def_tackles_solo": "tackles",
    "def_sacks": "sacks",
    "def_interceptions": "def_interceptions",
    "fg_made": "fg_made",
    "fg_att": "fg_att",
}

PLAYOFF_ROUND = {
    "WC": "Wild Card Round",
    "DIV": "Divisional Round",
    "CON": "Conference Championship",
    "SB": "Super Bowl",
}
ROUND_ORDER = {"WC": 1, "DIV": 2, "CON": 3, "SB": 4}


def download(url: str, dest: Path) -> Path:
    if not dest.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {url}")
        with httpx.stream("GET", url, follow_redirects=True, timeout=120) as resp:
            resp.raise_for_status()
            tmp = dest.with_suffix(".part")
            with tmp.open("wb") as fh:
                for chunk in resp.iter_bytes():
                    fh.write(chunk)
            tmp.rename(dest)
    return dest


def _int(value: str | None) -> int:
    if value in (None, "", "NA"):
        return 0
    return round(float(value))


def player_rows(path: Path, season: int) -> list[dict[str, object]]:
    out = []
    with gzip.open(path, "rt", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("season_type") not in ("REG", None) or int(row["season"]) != season:
                continue
            stats = {ours: _int(row.get(src)) for src, ours in SOURCE_INTS.items()}
            if not any(v for k, v in stats.items() if k != "games"):
                continue
            out.append(
                {
                    "season": season,
                    "player_id": row["player_id"],
                    "player_name": row.get("player_display_name") or row.get("player_name") or row["player_id"],
                    "position": row.get("position") or "",
                    "team": row.get("recent_team") or "",
                    **stats,
                }
            )
    return out


def team_rows(path: Path, first: int, last: int) -> list[dict[str, object]]:
    reg: dict[tuple[int, str], dict[str, int]] = defaultdict(lambda: dict(wins=0, losses=0, ties=0, pf=0, pa=0))
    best: dict[tuple[int, str], tuple[int, bool]] = {}  # deepest round reached, won it?
    with gzip.open(path, "rt", newline="", encoding="utf-8") as fh:
        for g in csv.DictReader(fh):
            season = int(g["season"])
            if not first <= season <= last or g["home_score"] in ("", "NA"):
                continue
            hs, as_ = int(g["home_score"]), int(g["away_score"])
            for team, pf, pa in ((g["home_team"], hs, as_), (g["away_team"], as_, hs)):
                key = (season, team)
                if g["game_type"] == "REG":
                    r = reg[key]
                    r["pf"] += pf
                    r["pa"] += pa
                    r["wins" if pf > pa else "losses" if pf < pa else "ties"] += 1
                elif g["game_type"] in ROUND_ORDER:
                    depth = ROUND_ORDER[g["game_type"]]
                    if key not in best or depth >= best[key][0]:
                        best[key] = (depth, pf > pa)
    rows = []
    for (season, team), r in sorted(reg.items()):
        if (season, team) in best:
            depth, won = best[(season, team)]
            rnd = next(k for k, v in ROUND_ORDER.items() if v == depth)
            result = "Won Super Bowl" if rnd == "SB" and won else f"Lost {PLAYOFF_ROUND[rnd]}"
        else:
            result = "Missed playoffs"
        rows.append(
            {
                "season": season,
                "team": team,
                "wins": r["wins"],
                "losses": r["losses"],
                "ties": r["ties"],
                "points_for": r["pf"],
                "points_against": r["pa"],
                "playoff_result": result,
            }
        )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--first", type=int, default=1999)
    ap.add_argument("--last", type=int, default=LAST_ALLOWED_SEASON)
    args = ap.parse_args()
    if args.last > LAST_ALLOWED_SEASON:
        raise SystemExit(f"Refusing seasons after {LAST_ALLOWED_SEASON} (the featured 2025 week must not leak)")

    sources: list[dict[str, str]] = []
    players: list[dict[str, object]] = []
    for season in range(args.first, args.last + 1):
        url = PLAYER_URL.format(season=season)
        path = download(url, CACHE / f"stats_player_reg_{season}.csv.gz")
        sources.append({"url": url, "sha256": sha256(path)})
        players.extend(player_rows(path, season))
    games = download(GAMES_URL, CACHE / "games.csv.gz")
    sources.append({"url": GAMES_URL, "sha256": sha256(games)})
    teams = team_rows(games, args.first, args.last)

    OUT.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=PLAYER_COLUMNS, lineterminator="\n")
    w.writeheader()
    w.writerows(sorted(players, key=lambda r: (r["season"], r["player_id"])))
    # mtime=0: the same data always produces the same bytes.
    (OUT / "player_seasons.csv.gz").write_bytes(gzip.compress(buf.getvalue().encode("utf-8"), mtime=0))
    with (OUT / "team_seasons.csv").open("w", newline="", encoding="utf-8") as fh:
        tw = csv.DictWriter(fh, fieldnames=TEAM_COLUMNS, lineterminator="\n")
        tw.writeheader()
        tw.writerows(teams)
    from app.history_stats.data import HistoryFile, load_local

    data: HistoryFile = load_local(OUT, verify=False)
    meta = {
        "first_season": args.first,
        "last_season": args.last,
        "sources": sources,
        "license": LICENSE,
        "attribution": ATTRIBUTION.replace("Play-by-play data", "Player and team stats"),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "content_sha256": content_sha256(data.players, data.teams),
        "player_rows": len(data.players),
        "team_rows": len(data.teams),
    }
    (OUT / "source.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} player seasons and {len(teams)} team seasons ({args.first}-{args.last}) to {OUT}")


if __name__ == "__main__":
    main()
