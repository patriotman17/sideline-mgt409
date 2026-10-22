"""Season-to-date context for a matchup, from ``data/pregame/<season>_w<week>.json``.

Everything here is computed by rules from earlier weeks' results (built by
``scripts/build_pregame.py``): records, streaks, last results, per-game averages, league ranks, team
leaders and short storylines. No AI decides any of it.

No leakage: a matchup in week *w* only ever sees games with ``week < w``. The data file is already
limited to earlier weeks, and ``SeasonData`` filters again (defense in depth, tested).
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable, Mapping, Sequence
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.config import BACKEND_DIR, get_settings

log = logging.getLogger("sideline.pregame")

PREGAME_DIR = BACKEND_DIR / "data" / "pregame"

LeaderCategory = Literal["passing", "rushing", "receiving"]


# ---------------------------------------------------------------- source data (the JSON file)


class PastGame(BaseModel):
    game_id: str
    week: int
    date: str
    home: str
    away: str
    home_score: int
    away_score: int
    home_yards: int
    away_yards: int
    home_giveaways: int
    away_giveaways: int


class PlayerSeason(BaseModel):
    player_id: str
    team: str
    name: str
    games: int
    pass_yards: int = 0
    pass_td: int = 0
    interceptions: int = 0
    completions: int = 0
    attempts: int = 0
    rush_yards: int = 0
    rush_td: int = 0
    carries: int = 0
    rec_yards: int = 0
    rec_td: int = 0
    receptions: int = 0


class SourceInfo(BaseModel):
    url: str
    sha256: str
    license: str
    attribution: str
    generated_at: str
    notes: str


class PregameFile(BaseModel):
    season: int
    week: int
    weeks_included: list[int]
    source: SourceInfo
    games: list[PastGame]
    players: list[PlayerSeason]


# ---------------------------------------------------------------- output (API + agent tools)


class Result(BaseModel):
    week: int
    opponent: str
    home: bool
    points_for: int
    points_against: int
    outcome: Literal["W", "L", "T"]

    @property
    def label(self) -> str:
        where = "vs" if self.home else "@"
        return f"{self.outcome} {self.points_for}-{self.points_against} {where} {self.opponent}"


class Leader(BaseModel):
    category: LeaderCategory
    player: str
    yards: int
    touchdowns: int
    #: e.g. "92/135, 8 TD, 2 INT" or "77 carries" or "42 catches".
    line: str
    league_rank: int


class TeamForm(BaseModel):
    team: str
    games: int
    wins: int
    losses: int
    ties: int
    record: str
    #: "W3" = won the last three; "L1"; None before any game.
    streak: str | None
    last_results: list[Result] = Field(description="Most recent first, at most 2")
    points_per_game: float
    points_allowed_per_game: float
    yards_per_game: float
    turnover_margin: int
    #: League ranks among all teams (1 = best): points scored, fewest allowed, yards, turnover margin.
    ranks: dict[str, int]
    leaders: list[Leader]


class Storyline(BaseModel):
    key: str
    text: str


class Matchup(BaseModel):
    season: int
    week: int
    weeks_included: list[int]
    home: TeamForm
    away: TeamForm
    #: Earlier meetings this season (rare this early).
    meetings: list[Result] = Field(description="From the home team's point of view")
    storylines: list[Storyline]
    data_version: str
    attribution: str
    notes: str


# ---------------------------------------------------------------- rules


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _rank(values: dict[str, float], team: str, *, higher_is_better: bool = True) -> int:
    """Standard competition rank (ties share the better rank)."""
    mine = values[team]
    if higher_is_better:
        return 1 + sum(1 for v in values.values() if v > mine)
    return 1 + sum(1 for v in values.values() if v < mine)


class SeasonData:
    def __init__(self, data: PregameFile, *, data_version: str):
        self.data = data
        self.data_version = data_version
        # Defense in depth: never use a game from the previewed week or later.
        self.games = sorted((g for g in data.games if g.week < data.week), key=lambda g: (g.week, g.game_id))
        # Fixed order, whatever the source's row order, so ties always break the same way.
        self.players = sorted(data.players, key=lambda p: (p.team, p.player_id))
        self.teams = sorted({g.home for g in self.games} | {g.away for g in self.games})

    # ------------------------------------------------------------ per team

    def results(self, team: str) -> list[Result]:
        out = []
        for g in self.games:
            if team not in (g.home, g.away):
                continue
            home = g.home == team
            pf, pa = (g.home_score, g.away_score) if home else (g.away_score, g.home_score)
            outcome: Literal["W", "L", "T"] = "W" if pf > pa else "L" if pf < pa else "T"
            out.append(
                Result(
                    week=g.week,
                    opponent=g.away if home else g.home,
                    home=home,
                    points_for=pf,
                    points_against=pa,
                    outcome=outcome,
                )
            )
        return sorted(out, key=lambda r: r.week)

    def _totals(self, team: str) -> tuple[int, int, int, int, int]:
        """(games, points for, points against, yards, turnover margin)."""
        games = pf = pa = yards = margin = 0
        for g in self.games:
            if team == g.home:
                games += 1
                pf += g.home_score
                pa += g.away_score
                yards += g.home_yards
                margin += g.away_giveaways - g.home_giveaways
            elif team == g.away:
                games += 1
                pf += g.away_score
                pa += g.home_score
                yards += g.away_yards
                margin += g.home_giveaways - g.away_giveaways
        return games, pf, pa, yards, margin

    @cached_property
    def _league(self) -> dict[str, dict[str, float]]:
        table: dict[str, dict[str, float]] = {"points": {}, "allowed": {}, "yards": {}, "turnovers": {}}
        for team in self.teams:
            games, pf, pa, yards, margin = self._totals(team)
            n = max(games, 1)
            table["points"][team] = pf / n
            table["allowed"][team] = pa / n
            table["yards"][team] = yards / n
            table["turnovers"][team] = margin
        return table

    def team_table(self) -> list[dict[str, float | int | str]]:
        """Every team's season so far, for league-wide rankings: record, points and yards for/against per
        game, takeaways, giveaways and turnover margin."""
        rows: list[dict[str, float | int | str]] = []
        for team in self.teams:
            games = wins = losses = ties = pf = pa = yf = ya = take = give = 0
            for g in self.games:
                if team not in (g.home, g.away):
                    continue
                home = team == g.home
                mine, theirs = (g.home_score, g.away_score) if home else (g.away_score, g.home_score)
                games += 1
                pf += mine
                pa += theirs
                yf += g.home_yards if home else g.away_yards
                ya += g.away_yards if home else g.home_yards
                give += g.home_giveaways if home else g.away_giveaways
                take += g.away_giveaways if home else g.home_giveaways
                wins += mine > theirs
                losses += mine < theirs
                ties += mine == theirs
            n = max(games, 1)
            rows.append(
                {
                    "team": team,
                    "games": games,
                    "record": f"{wins}-{losses}" + (f"-{ties}" if ties else ""),
                    "win_pct": round((wins + ties / 2) / n, 3),
                    "points_per_game": round(pf / n, 1),
                    "points_allowed_per_game": round(pa / n, 1),
                    "yards_per_game": round(yf / n, 1),
                    "yards_allowed_per_game": round(ya / n, 1),
                    "point_differential": pf - pa,
                    "takeaways": take,
                    "giveaways": give,
                    "turnover_margin": take - give,
                }
            )
        return rows

    def leaders(self, team: str) -> list[Leader]:
        out: list[Leader] = []
        specs: tuple[tuple[LeaderCategory, str], ...] = (
            ("passing", "pass_yards"),
            ("rushing", "rush_yards"),
            ("receiving", "rec_yards"),
        )
        for category, field in specs:
            league = sorted(self.players, key=lambda p: (-getattr(p, field), p.name, p.player_id))
            mine = [p for p in league if p.team == team and getattr(p, field) > 0]
            if not mine:
                continue
            best = mine[0]
            value = getattr(best, field)
            rank = 1 + sum(1 for p in league if getattr(p, field) > value)
            if category == "passing":
                line = f"{best.completions}/{best.attempts}, {best.pass_td} TD, {best.interceptions} INT"
                td = best.pass_td
            elif category == "rushing":
                line = f"{best.carries} carries, {best.rush_td} TD"
                td = best.rush_td
            else:
                line = f"{best.receptions} catches, {best.rec_td} TD"
                td = best.rec_td
            out.append(
                Leader(category=category, player=best.name, yards=value, touchdowns=td, line=line, league_rank=rank)
            )
        return out

    def form(self, team: str) -> TeamForm:
        results = self.results(team)
        games, pf, pa, yards, margin = self._totals(team)
        wins = sum(r.outcome == "W" for r in results)
        losses = sum(r.outcome == "L" for r in results)
        ties = sum(r.outcome == "T" for r in results)
        streak = None
        if results:
            last = results[-1].outcome
            run = 0
            for r in reversed(results):
                if r.outcome != last:
                    break
                run += 1
            streak = f"{last}{run}"
        n = max(games, 1)
        league = self._league
        return TeamForm(
            team=team,
            games=games,
            wins=wins,
            losses=losses,
            ties=ties,
            record=f"{wins}-{losses}" + (f"-{ties}" if ties else ""),
            streak=streak,
            last_results=list(reversed(results[-2:])),
            points_per_game=round(pf / n, 1),
            points_allowed_per_game=round(pa / n, 1),
            yards_per_game=round(yards / n, 1),
            turnover_margin=margin,
            ranks={
                "points": _rank(league["points"], team),
                "allowed": _rank(league["allowed"], team, higher_is_better=False),
                "yards": _rank(league["yards"], team),
                "turnovers": _rank(league["turnovers"], team),
            },
            leaders=self.leaders(team),
        )

    # ------------------------------------------------------------ matchup

    def matchup(self, home: str, away: str) -> Matchup:
        if home not in self.teams or away not in self.teams:
            raise KeyError(f"No season data for {away} @ {home}")
        h, a = self.form(home), self.form(away)
        meetings = [r for r in self.results(home) if r.opponent == away]
        return Matchup(
            season=self.data.season,
            week=self.data.week,
            weeks_included=sorted({g.week for g in self.games}),
            home=h,
            away=a,
            meetings=meetings,
            storylines=storylines(h, a, meetings, teams=len(self.teams)),
            data_version=self.data_version,
            attribution=self.data.source.attribution,
            notes=self.data.source.notes,
        )


def _team_lines(f: TeamForm, teams: int) -> list[Storyline]:
    out: list[Storyline] = []
    t = f.team
    if f.games and f.wins == f.games:
        out.append(Storyline(key=f"{t}:unbeaten", text=f"{t} is {f.record}, one of the league's unbeaten teams."))
    elif f.games and f.losses == f.games:
        out.append(Storyline(key=f"{t}:winless", text=f"{t} is {f.record} and still looking for its first win."))
    elif f.streak and int(f.streak[1:]) >= 3:
        word = "won" if f.streak[0] == "W" else "lost"
        out.append(Storyline(key=f"{t}:streak", text=f"{t} has {word} {f.streak[1:]} straight."))
    if f.ranks["points"] <= 3:
        out.append(
            Storyline(
                key=f"{t}:offense",
                text=f"{t} scores {f.points_per_game} points a game, {_ordinal(f.ranks['points'])} in the NFL.",
            )
        )
    if f.ranks["allowed"] <= 3:
        out.append(
            Storyline(
                key=f"{t}:defense",
                text=(
                    f"{t} allows just {f.points_allowed_per_game} points a game, "
                    f"{_ordinal(f.ranks['allowed'])} fewest in the NFL."
                ),
            )
        )
    elif f.ranks["allowed"] > teams - 3:
        out.append(
            Storyline(
                key=f"{t}:leaky",
                text=f"{t} is giving up {f.points_allowed_per_game} points a game, among the most in the NFL.",
            )
        )
    if f.turnover_margin >= 4 or f.turnover_margin <= -4:
        sign = f"+{f.turnover_margin}" if f.turnover_margin > 0 else str(f.turnover_margin)
        out.append(Storyline(key=f"{t}:turnovers", text=f"{t} is {sign} in turnover margin."))
    for leader in f.leaders:
        if leader.league_rank == 1:
            out.append(
                Storyline(
                    key=f"{t}:leader:{leader.category}",
                    text=f"{leader.player} ({t}) leads the NFL with {leader.yards:,} {leader.category} yards.",
                )
            )
    if f.last_results:
        last = f.last_results[0]
        if abs(last.points_for - last.points_against) >= 20:
            word = "won" if last.outcome == "W" else "lost"
            out.append(
                Storyline(
                    key=f"{t}:last",
                    text=f"{t} {word} by {abs(last.points_for - last.points_against)} last week ({last.label}).",
                )
            )
    return out


def storylines(
    home: TeamForm, away: TeamForm, meetings: list[Result], *, teams: int, limit: int = 5
) -> list[Storyline]:
    out: list[Storyline] = []
    if meetings:
        m = meetings[-1]
        out.append(Storyline(key="rematch", text=f"Rematch: {home.team} met {away.team} in Week {m.week} ({m.label})."))
    if home.last_results and away.last_results:
        lh, la = home.last_results[0].outcome, away.last_results[0].outcome
        if lh == la == "L":
            out.append(Storyline(key="both_lost", text="Both teams are coming off a loss."))
        elif lh == la == "W":
            out.append(Storyline(key="both_won", text="Both teams won last week."))
    # Alternate teams so neither side crowds out the other.
    a_lines, h_lines = _team_lines(away, teams), _team_lines(home, teams)
    for i in range(max(len(a_lines), len(h_lines))):
        out.extend(lines[i] for lines in (a_lines, h_lines) if i < len(lines))
    return out[:limit]


# ---------------------------------------------------------------- loading


def content_sha256(data: PregameFile) -> str:
    """Canonical hash of a build's content (everything except ``generated_at``). The same for the local
    file and the Supabase copy, so it doubles as the import check and the AI cache's data version."""
    payload = data.model_dump(mode="json")
    payload["source"].pop("generated_at", None)
    # Row order doesn't matter (Postgres and Python sort names differently): hash in a fixed order.
    payload["games"].sort(key=lambda g: (g["week"], g["game_id"]))
    payload["players"].sort(key=lambda p: (p["team"], p["player_id"]))
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def from_data(data: PregameFile) -> SeasonData:
    return SeasonData(data, data_version=content_sha256(data)[:12])


def load(path: Path) -> SeasonData:
    return from_data(PregameFile.model_validate(json.loads(path.read_bytes())))


@lru_cache
def season_for(season: int, week: int) -> SeasonData | None:
    """Context for games of ``week`` (built from weeks before it), or None if not built.

    With ``REPLAY_DATA_SOURCE=supabase`` + ``SUPABASE_DB_URL`` it reads ``history.pregame_*`` (checksum
    re-checked); any failure or a missing build falls back to the local file, like the game catalog."""
    settings = get_settings()
    if settings.replay_data_source == "supabase" and settings.supabase_db_url is not None:
        try:
            data = load_pregame_from_supabase(
                postgres_pregame_fetch(settings.supabase_db_url.get_secret_value()), season, week
            )
            if data is not None:
                log.info("Loaded pregame %s week %s from Supabase", season, week)
                return from_data(data)
            log.warning("No pregame build for %s week %s in Supabase; using the local file", season, week)
        except Exception as exc:  # never log the text: it could contain connection details
            log.warning("Could not load pregame data from Supabase (%s); using the local file", type(exc).__name__)
    path = PREGAME_DIR / f"{season}_w{week:02d}.json"
    return load(path) if path.exists() else None


# ---------------------------------------------------------------- Supabase (history.pregame_*)

#: (build row or None, games rows, players rows) for one season/week. Production uses Postgres.
PregameFetch = Callable[
    [int, int], tuple[Mapping[str, Any] | None, Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]
]

_BUILD_SQL = """
select season, week, weeks_included, source_url, source_sha256, license, attribution, notes,
       generated_at::text as generated_at, content_sha256
from history.pregame_builds where season = %s and week = %s
"""
_GAMES_SQL = """
select game_id, game_week as week, game_date::text as date, home_team as home, away_team as away,
       home_score, away_score, home_yards, away_yards, home_giveaways, away_giveaways
from history.pregame_games where season = %s and week = %s order by game_week, game_id
"""
_PLAYERS_SQL = """
select player_id, team, name, games, pass_yards, pass_td, interceptions, completions, attempts,
       rush_yards, rush_td, carries, rec_yards, rec_td, receptions
from history.pregame_players where season = %s and week = %s order by team, name, player_id
"""


class PregameIntegrityError(Exception):
    """The stored build doesn't match its recorded checksum."""


def postgres_pregame_fetch(dsn: str) -> PregameFetch:
    def fetch(
        season: int, week: int
    ) -> tuple[Mapping[str, Any] | None, Sequence[Mapping[str, Any]], Sequence[Mapping[str, Any]]]:
        import psycopg  # only needed when the Supabase source is enabled
        from psycopg.rows import dict_row

        with psycopg.connect(dsn, connect_timeout=10, row_factory=dict_row) as conn, conn.cursor() as cur:
            conn.read_only = True
            cur.execute(_BUILD_SQL, (season, week))
            build = cur.fetchone()
            cur.execute(_GAMES_SQL, (season, week))
            games = cur.fetchall()
            cur.execute(_PLAYERS_SQL, (season, week))
            players = cur.fetchall()
        return build, games, players

    return fetch


def data_from_rows(
    build: Mapping[str, Any], games: Sequence[Mapping[str, Any]], players: Sequence[Mapping[str, Any]]
) -> PregameFile:
    data = PregameFile(
        season=build["season"],
        week=build["week"],
        weeks_included=list(build["weeks_included"]),
        source=SourceInfo(
            url=build["source_url"],
            sha256=build["source_sha256"],
            license=build["license"],
            attribution=build["attribution"],
            generated_at=str(build["generated_at"]),
            notes=build["notes"],
        ),
        games=[PastGame.model_validate(dict(g)) for g in games],
        players=[PlayerSeason.model_validate(dict(p)) for p in players],
    )
    if content_sha256(data) != build["content_sha256"]:
        raise PregameIntegrityError(f"pregame {data.season} week {data.week}: content doesn't match its checksum")
    return data


def load_pregame_from_supabase(fetch: PregameFetch, season: int, week: int) -> PregameFile | None:
    build, games, players = fetch(season, week)
    return None if build is None else data_from_rows(build, games, players)
