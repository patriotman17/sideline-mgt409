"""Build the pregame season context for one week from nflverse play-by-play.

For ``--season 2025 --week 5`` this keeps only regular-season games from weeks 1-4 (everything that
had happened before Week 5 kicked off) and writes ``backend/data/pregame/2025_w05.json``:

- every earlier game's final score, net offensive yards and giveaways per team, and
- season-to-date passing / rushing / receiving totals per player (with team).

Records, streaks, ranks and storylines are derived from these facts at runtime
(``app/pregame/season.py``), so the rules stay tested code rather than baked-in text.

No leakage: rows from the target week or later are never read into the output, and the script
fails if any would be. Reuses the season download cached by ``fetch_nflverse_games.py``.

Usage (from backend/):
    .venv/bin/python scripts/build_pregame.py --season 2025 --week 5
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_nflverse_games import download, sha256  # noqa: E402

from app.replay.source import ATTRIBUTION, LICENSE  # noqa: E402

OUT_DIR = BACKEND_DIR / "data" / "pregame"


def _flag(row: dict[str, str], col: str) -> bool:
    return row.get(col, "") in ("1", "1.0")


def _num(row: dict[str, str], col: str) -> int:
    value = row.get(col, "")
    if value in ("", "NA"):
        return 0
    return round(float(value))


def build(source: Path, week: int) -> dict[str, object]:
    games: dict[str, dict[str, object]] = {}
    yards: dict[tuple[str, str], int] = defaultdict(int)
    giveaways: dict[tuple[str, str], int] = defaultdict(int)
    players: dict[tuple[str, str], dict[str, object]] = {}

    def player(team: str, pid: str, name: str) -> dict[str, object]:
        p = players.get((team, pid))
        if p is None:
            p = {"team": team, "name": name, "games": set()}
            p.update(
                dict.fromkeys(
                    (
                        "pass_yards",
                        "pass_td",
                        "interceptions",
                        "completions",
                        "attempts",
                        "rush_yards",
                        "rush_td",
                        "carries",
                        "rec_yards",
                        "rec_td",
                        "receptions",
                    ),
                    0,
                )
            )
            players[(team, pid)] = p
        return p

    with gzip.open(source, "rt", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["season_type"] != "REG" or int(row["week"]) >= week:
                continue
            gid = row["game_id"]
            if gid not in games:
                games[gid] = {
                    "game_id": gid,
                    "week": int(row["week"]),
                    "date": row["game_date"],
                    "home": row["home_team"],
                    "away": row["away_team"],
                    "home_score": int(row["home_score"]),
                    "away_score": int(row["away_score"]),
                }
            team = row["posteam"]
            if not team or team == "NA":
                continue
            two_point = _flag(row, "two_point_attempt")
            if row["play_type"] in ("pass", "run") and not two_point:
                yards[(gid, team)] += _num(row, "yards_gained")
            if _flag(row, "interception"):
                giveaways[(gid, team)] += 1
            if _flag(row, "fumble_lost"):
                # The fumbling team lost it (on kicks that can be the receiving team, not posteam).
                giveaways[(gid, row.get("fumbled_1_team") or team)] += 1
            if two_point:
                continue
            if row["passer_player_id"] not in ("", "NA") and row["play_type"] == "pass":
                p = player(team, row["passer_player_id"], row["passer_player_name"])
                p["games"].add(gid)  # type: ignore[attr-defined]
                if not _flag(row, "sack"):
                    p["attempts"] += 1  # type: ignore[operator]
                p["completions"] += int(_flag(row, "complete_pass"))  # type: ignore[operator]
                p["pass_yards"] += _num(row, "passing_yards")  # type: ignore[operator]
                p["pass_td"] += int(_flag(row, "pass_touchdown"))  # type: ignore[operator]
                p["interceptions"] += int(_flag(row, "interception"))  # type: ignore[operator]
            if row["rusher_player_id"] not in ("", "NA") and row["play_type"] == "run":
                p = player(team, row["rusher_player_id"], row["rusher_player_name"])
                p["games"].add(gid)  # type: ignore[attr-defined]
                p["carries"] += 1  # type: ignore[operator]
                p["rush_yards"] += _num(row, "rushing_yards")  # type: ignore[operator]
                p["rush_td"] += int(_flag(row, "rush_touchdown"))  # type: ignore[operator]
            if row["receiver_player_id"] not in ("", "NA") and _flag(row, "complete_pass"):
                p = player(team, row["receiver_player_id"], row["receiver_player_name"])
                p["games"].add(gid)  # type: ignore[attr-defined]
                p["receptions"] += 1  # type: ignore[operator]
                p["rec_yards"] += _num(row, "receiving_yards")  # type: ignore[operator]
                p["rec_td"] += int(_flag(row, "pass_touchdown"))  # type: ignore[operator]

    if not games:
        raise SystemExit(f"No regular-season games before week {week} in {source}")
    if max(int(g["week"]) for g in games.values()) >= week:  # type: ignore[call-overload]
        raise SystemExit("Refusing to write: found a game from the target week or later")

    game_rows = []
    for gid, g in sorted(games.items(), key=lambda kv: (str(kv[1]["week"]).zfill(2), kv[0])):
        home, away = str(g["home"]), str(g["away"])
        game_rows.append(
            {
                **g,
                "home_yards": yards[(gid, home)],
                "away_yards": yards[(gid, away)],
                "home_giveaways": giveaways[(gid, home)],
                "away_giveaways": giveaways[(gid, away)],
            }
        )
    player_rows = [
        {"player_id": pid, **{k: v for k, v in p.items() if k != "games"}, "games": len(p["games"])}  # type: ignore[arg-type]
        for (_, pid), p in sorted(players.items(), key=lambda kv: (kv[0][0], str(kv[1]["name"]), kv[0][1]))
    ]
    return {"games": game_rows, "players": player_rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--week", type=int, required=True, help="The week being previewed; only earlier weeks are used")
    args = parser.parse_args()

    source, url = download(args.season)
    data = build(source, args.week)
    out = {
        "season": args.season,
        "week": args.week,
        "weeks_included": sorted({int(g["week"]) for g in data["games"]}),  # type: ignore[attr-defined]
        "source": {
            "url": url,
            "sha256": sha256(source),
            "license": LICENSE,
            "attribution": ATTRIBUTION,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "notes": (
                "Regular-season games before the target week only. yards = net offensive yards on pass/run "
                "plays (sacks included, two-point tries and penalties excluded). giveaways = interceptions "
                "thrown + fumbles lost."
            ),
        },
        **data,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / f"{args.season}_w{args.week:02d}.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Wrote {dest.relative_to(BACKEND_DIR)}: {len(data['games'])} games "  # type: ignore[arg-type]
        f"(weeks {out['weeks_included']}), {len(data['players'])} players"  # type: ignore[arg-type]
    )


if __name__ == "__main__":
    main()
