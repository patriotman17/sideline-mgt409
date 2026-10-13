"""Import local nflverse extracts into Supabase (``history`` schema) and verify the import.

Runs through the Supabase CLI as the project owner (``npx supabase db query --linked``), so no database
password or service key is needed here. Each game is upserted in one transaction: its ``history.games``
row (schedule + nflverse provenance + a SHA-256 of the rows) and all of its ``history.plays`` rows,
stored exactly as extracted so the backend runs the same ingestion code on them.

Usage (from backend/, after ``npx supabase login`` and ``npx supabase link``):
    .venv/bin/python scripts/import_history_to_supabase.py --season 2025 --week 5           # import
    .venv/bin/python scripts/import_history_to_supabase.py --season 2025 --week 5 --verify  # check only
    .venv/bin/python scripts/import_history_to_supabase.py --all --sql-only out.sql         # just write SQL
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.replay.ingest import build_game, load_game_file  # noqa: E402
from app.replay.models import Game, Provenance  # noqa: E402

DATA_DIR = BACKEND_DIR / "data" / "nflverse"


def rows_sha256(rows: list[dict[str, str]]) -> str:
    """Order-sensitive hash of the extract's rows in canonical JSON (same as the backend loader checks)."""
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def select_files(season: int | None, week: int | None, everything: bool) -> list[Path]:
    files = sorted(DATA_DIR.glob("*.csv"))
    if everything:
        return files
    prefix = f"{season}_{week:02d}_" if week is not None else f"{season}_"
    return [f for f in files if f.name.startswith(prefix)]


def _quote(value: object) -> str:
    """SQL literal for our own trusted, already-validated values (numbers, ISO dates, short text)."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return repr(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def _dollar(text: str) -> str:
    """Dollar-quoted literal with a random tag that can't appear in the payload."""
    while True:
        tag = f"j{secrets.token_hex(6)}"
        if f"${tag}$" not in text:
            return f"${tag}${text}${tag}$"


def game_sql(csv_path: Path) -> tuple[str, Game, list[dict[str, str]]]:
    rows = read_rows(csv_path)
    game = load_game_file(csv_path)  # validates; refuses games with ingestion errors
    if game.warnings:
        raise SystemExit(f"{game.info.game_id}: refusing to import a game with warnings: {game.warnings}")
    meta = json.loads(csv_path.with_suffix(".source.json").read_text())
    i, p = game.info, game.provenance
    columns = list(rows[0].keys())
    values = {
        "game_id": i.game_id,
        "season": i.season,
        "week": i.week,
        "season_type": i.season_type,
        "game_date": i.game_date,
        "kickoff_at": i.kickoff_at.isoformat() if i.kickoff_at else None,
        "away_team": i.away.abbr,
        "home_team": i.home.abbr,
        "venue": i.venue,
        "neutral_site": i.neutral_site,
        "source": p.source,
        "source_url": p.source_url,
        "source_sha256": p.source_sha256,
        "retrieved_at": p.retrieved_at,
        "license": p.license,
        "attribution": p.attribution,
        "row_count": len(rows),
        "rows_sha256": rows_sha256(rows),
    }
    assert meta["rows"] == len(rows), f"{i.game_id}: sidecar says {meta['rows']} rows, CSV has {len(rows)}"
    cols = ", ".join([*values, "columns"])
    vals = ", ".join([*(_quote(v) for v in values.values()), "array[" + ", ".join(map(_quote, columns)) + "]::text[]"])
    updates = ", ".join(f"{c} = excluded.{c}" for c in [*values, "columns"] if c != "game_id")
    plays = ",\n".join(
        f"  ({_quote(i.game_id)}, {n}, {_dollar(json.dumps(r, ensure_ascii=False))}::jsonb)" for n, r in enumerate(rows)
    )
    sql = (
        f"-- {i.game_id}: {len(rows)} rows\n"
        f"insert into history.games ({cols}, imported_at) values ({vals}, now())\n"
        f"  on conflict (game_id) do update set {updates}, imported_at = now();\n"
        f"delete from history.plays where game_id = {_quote(i.game_id)};\n"
        f"insert into history.plays (game_id, row_index, row) values\n{plays};\n"
    )
    return sql, game, rows


def run_cli_sql(sql: str) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as fh:
        fh.write(sql)
        path = fh.name
    try:
        out = subprocess.run(
            ["npx", "--yes", "supabase@latest", "db", "query", "--linked", "--output-format", "json", "-f", path],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        Path(path).unlink(missing_ok=True)
    if out.returncode != 0 or '"error"' in out.stdout[:200]:
        raise SystemExit(f"Supabase CLI failed:\n{out.stdout[-2000:]}\n{out.stderr[-2000:]}")
    return out.stdout


def query_rows(sql: str) -> list[dict[str, object]]:
    text = run_cli_sql(sql)
    data = json.loads(text[text.find("{") :])
    return list(data.get("rows", []))


def verify(files: list[Path]) -> bool:
    """Read every imported game back and compare it with the local extract, row for row."""
    ok = True
    for f in files:
        local_rows = read_rows(f)
        local = load_game_file(f)
        gid = local.info.game_id
        meta = query_rows(
            f"select row_count, rows_sha256, license, attribution from history.games where game_id = '{gid}'"
        )
        remote_rows: list[dict[str, str]] = []
        for r in query_rows(f"select row from history.plays where game_id = '{gid}' order by row_index"):
            row = r["row"]
            assert isinstance(row, dict), f"{gid}: unexpected row payload"
            remote_rows.append({str(k): ("" if v is None else str(v)) for k, v in row.items()})
        problems = []
        if not meta:
            problems.append("missing from history.games")
        else:
            m = meta[0]
            if m["row_count"] != len(local_rows):
                problems.append(f"row_count {m['row_count']} != {len(local_rows)}")
            if m["rows_sha256"] != rows_sha256(local_rows):
                problems.append("stored rows_sha256 differs from the local extract")
            if "CC BY 4.0" not in str(m["license"]) or not m["attribution"]:
                problems.append("license/attribution missing")
        if remote_rows != local_rows:
            problems.append(f"plays differ ({len(remote_rows)} remote vs {len(local_rows)} local rows)")
        elif rows_sha256(remote_rows) != rows_sha256(local_rows):
            problems.append("plays hash differs")
        else:
            remote_game = build_game(list(remote_rows), Provenance(**local.provenance.model_dump()))
            if remote_game.events != local.events or remote_game.warnings:
                problems.append("engine events differ when rebuilt from Supabase")
        print(
            f"{'OK ' if not problems else 'BAD'} {gid}: {len(remote_rows)} rows" + (f"  {problems}" if problems else "")
        )
        ok = ok and not problems
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int)
    ap.add_argument("--week", type=int)
    ap.add_argument("--all", action="store_true", help="every local extract")
    ap.add_argument("--verify", action="store_true", help="only verify what's in Supabase")
    ap.add_argument("--sql-only", type=Path, help="write the import SQL to this file instead of running it")
    args = ap.parse_args()
    if not args.all and args.season is None:
        ap.error("pass --season (and optionally --week) or --all")
    files = select_files(args.season, args.week, args.all)
    if not files:
        raise SystemExit("No matching local extracts")
    if args.verify:
        return 0 if verify(files) else 1

    # One transaction per game keeps each request small (~350 KB) and each game all-or-nothing.
    scripts, total = [], 0
    for f in files:
        sql, _game, rows = game_sql(f)
        scripts.append("begin;\n" + sql + "commit;\n")
        total += len(rows)
    size = sum(len(x) for x in scripts) / 1024
    print(f"{len(files)} games, {total} rows, {size:.0f} KB of SQL in {len(scripts)} transactions")
    if args.sql_only:
        args.sql_only.write_text("\n".join(scripts), encoding="utf-8")
        print(f"wrote {args.sql_only}")
        return 0
    for f, script in zip(files, scripts, strict=True):
        run_cli_sql(script)
        print(f"imported {f.stem}")
    print("verifying…")
    return 0 if verify(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
