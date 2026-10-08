"""Deterministic team and player statistics computed from *revealed* plays only.

Counting rules follow the play-by-play flags (never the description text):
* Plays wiped out by penalty (``no_play``) and two-point tries don't count,
  matching official box-score conventions.
* A team's net passing yards = gross passing yards + sack yardage (negative).
* Player names are the source's abbreviated forms (e.g. "J.Allen").
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.view import ReplayView
from app.replay.models import PlayEvent, PlayKind, ScoreType, TurnoverType

_SCRIMMAGE = {PlayKind.PASS, PlayKind.RUN, PlayKind.KNEEL, PlayKind.SPIKE}


def counted(events: Iterable[PlayEvent]) -> list[PlayEvent]:
    """Plays that count toward stats."""
    return [
        e
        for e in events
        if e.kind not in (PlayKind.PENALTY, PlayKind.TWO_POINT) and not (e.penalty and e.penalty.no_play)
    ]


# ---------------------------------------------------------------- team stats


class DownConversions(BaseModel):
    conversions: int = 0
    attempts: int = 0


class TeamStats(BaseModel):
    team: str
    points: int
    scrimmage_plays: int = 0
    total_yards: int = 0
    passing_yards_net: int = 0
    rushing_yards: int = 0
    pass_attempts: int = 0
    completions: int = 0
    rush_attempts: int = 0
    sacks_taken: int = 0
    sack_yards_lost: int = 0
    first_downs: int = 0
    third_down: DownConversions = Field(default_factory=DownConversions)
    fourth_down: DownConversions = Field(default_factory=DownConversions)
    turnovers: int = 0
    penalties: int = 0
    penalty_yards: int = 0
    timeouts_remaining: int | None = None


def team_stats(view: ReplayView) -> list[TeamStats]:
    s = view.state
    teams = {
        view.away: TeamStats(team=view.away, points=s.away_score, timeouts_remaining=s.away_timeouts),
        view.home: TeamStats(team=view.home, points=s.home_score, timeouts_remaining=s.home_timeouts),
    }
    for e in view.events:
        # Penalties count even on nullified plays.
        if e.penalty and e.penalty.team in teams:
            t = teams[e.penalty.team]
            t.penalties += 1
            t.penalty_yards += abs(e.penalty.yards or 0)
        # Official "turnovers" = interceptions + lost fumbles (not turnovers on downs).
        if e.turnover and e.turnover.lost_by in teams and e.turnover.type is not TurnoverType.DOWNS:
            teams[e.turnover.lost_by].turnovers += 1

    for e in counted(view.events):
        if e.offense not in teams or e.kind not in _SCRIMMAGE:
            continue
        t = teams[e.offense]
        st = e.stats
        t.scrimmage_plays += 1
        if st.sack:
            t.sacks_taken += 1
            t.sack_yards_lost += -(e.yards_gained or 0)
            t.passing_yards_net += e.yards_gained or 0
        elif st.pass_attempt:
            t.pass_attempts += 1
            t.completions += 1 if st.complete_pass else 0
            t.passing_yards_net += st.passing_yards or 0
        if st.rush_attempt and not st.sack:
            t.rush_attempts += 1
            t.rushing_yards += st.rushing_yards or 0
        if st.first_down:
            t.first_downs += 1
        down = e.before.down
        if down in (3, 4) and e.kind in (PlayKind.PASS, PlayKind.RUN):
            bucket = t.third_down if down == 3 else t.fourth_down
            bucket.attempts += 1
            touchdown = any(sc.type is ScoreType.TOUCHDOWN and sc.team == e.offense for sc in e.scoring)
            if st.first_down or touchdown:
                bucket.conversions += 1
    for t in teams.values():
        t.total_yards = t.passing_yards_net + t.rushing_yards
    return [teams[view.away], teams[view.home]]


# ---------------------------------------------------------------- player stats


class PassingLine(BaseModel):
    completions: int = 0
    attempts: int = 0
    yards: int = 0
    touchdowns: int = 0
    interceptions: int = 0
    sacks: int = 0


class RushingLine(BaseModel):
    attempts: int = 0
    yards: int = 0
    touchdowns: int = 0
    long: int | None = None


class ReceivingLine(BaseModel):
    receptions: int = 0
    targets: int = 0
    yards: int = 0
    touchdowns: int = 0
    long: int | None = None


class KickingLine(BaseModel):
    field_goals_made: int = 0
    field_goals_attempted: int = 0
    long_made: int | None = None
    extra_points_made: int = 0
    extra_points_attempted: int = 0


class DefenseLine(BaseModel):
    interceptions: int = 0
    sacks: int = 0


class PlayerStats(BaseModel):
    player: str
    team: str | None = None
    passing: PassingLine | None = None
    rushing: RushingLine | None = None
    receiving: ReceivingLine | None = None
    kicking: KickingLine | None = None
    defense: DefenseLine | None = None


def player_stats(view: ReplayView) -> dict[str, PlayerStats]:
    """All credited players' stats so far, keyed by source name."""
    players: dict[str, PlayerStats] = {}

    def get(name: str, team: str | None) -> PlayerStats:
        p = players.get(name)
        if p is None:
            p = players[name] = PlayerStats(player=name, team=team)
        return p

    for e in counted(view.events):
        pl, st = e.players, e.stats
        if pl.passer and (st.pass_attempt or st.sack):
            line = get(pl.passer, e.offense).passing or PassingLine()
            if st.sack:
                line.sacks += 1
            else:
                line.attempts += 1
                if st.complete_pass:
                    line.completions += 1
                    line.yards += st.passing_yards or 0
                line.touchdowns += 1 if st.pass_touchdown else 0
                line.interceptions += 1 if e.turnover and e.turnover.type is TurnoverType.INTERCEPTION else 0
            get(pl.passer, e.offense).passing = line
        if pl.rusher and st.rush_attempt:
            line_r = get(pl.rusher, e.offense).rushing or RushingLine()
            gained = st.rushing_yards or 0
            line_r.attempts += 1
            line_r.yards += gained
            line_r.touchdowns += 1 if st.rush_touchdown else 0
            line_r.long = gained if line_r.long is None else max(line_r.long, gained)
            get(pl.rusher, e.offense).rushing = line_r
        if pl.receiver and st.pass_attempt and not st.sack:
            line_c = get(pl.receiver, e.offense).receiving or ReceivingLine()
            line_c.targets += 1
            if st.complete_pass:
                gained = st.receiving_yards or 0
                line_c.receptions += 1
                line_c.yards += gained
                line_c.long = gained if line_c.long is None else max(line_c.long, gained)
            line_c.touchdowns += 1 if st.pass_touchdown else 0
            get(pl.receiver, e.offense).receiving = line_c
        if pl.kicker and e.kind in (PlayKind.FIELD_GOAL, PlayKind.EXTRA_POINT):
            line_k = get(pl.kicker, e.offense).kicking or KickingLine()
            made = any(sc.type in (ScoreType.FIELD_GOAL, ScoreType.EXTRA_POINT) for sc in e.scoring)
            if e.kind is PlayKind.FIELD_GOAL:
                line_k.field_goals_attempted += 1
                if made:
                    line_k.field_goals_made += 1
                    dist = st.kick_distance
                    if dist is not None:
                        line_k.long_made = dist if line_k.long_made is None else max(line_k.long_made, dist)
            else:
                line_k.extra_points_attempted += 1
                line_k.extra_points_made += 1 if made else 0
            get(pl.kicker, e.offense).kicking = line_k
        if pl.interceptor:
            p = get(pl.interceptor, e.defense)
            p.defense = p.defense or DefenseLine()
            p.defense.interceptions += 1
        if pl.sacker and st.sack:
            p = get(pl.sacker, e.defense)
            p.defense = p.defense or DefenseLine()
            p.defense.sacks += 1
    return players


def find_players(stats: dict[str, PlayerStats], query: str) -> list[PlayerStats]:
    """Match "Allen", "J.Allen" or "josh allen" against abbreviated source names."""
    q = query.strip().lower().replace(" ", "")
    if not q:
        return []
    exact = [p for name, p in stats.items() if name.lower().replace(" ", "") == q]
    if exact:
        return exact
    last = query.strip().split()[-1].lower()
    return [p for name, p in stats.items() if name.lower().split(".")[-1] == last or q in name.lower()]


def top_performers(stats: dict[str, PlayerStats]) -> dict[str, list[PlayerStats]]:
    """Leaders by category so far (top 3 each)."""
    by: dict[str, list[PlayerStats]] = defaultdict(list)
    ranked = {
        "passing": sorted(
            (p for p in stats.values() if p.passing), key=lambda p: -(p.passing.yards if p.passing else 0)
        ),
        "rushing": sorted(
            (p for p in stats.values() if p.rushing), key=lambda p: -(p.rushing.yards if p.rushing else 0)
        ),
        "receiving": sorted(
            (p for p in stats.values() if p.receiving), key=lambda p: -(p.receiving.yards if p.receiving else 0)
        ),
    }
    for category, players in ranked.items():
        by[category] = players[:3]
    return dict(by)


# ---------------------------------------------------------------- leaderboards

LeaderCategory = Literal["passing", "rushing", "receiving", "receptions", "sacks", "interceptions"]

_METRICS: dict[str, tuple[str, Callable[[PlayerStats], int | None], Callable[[PlayerStats], str]]] = {
    "passing": (
        "passing yards",
        lambda p: p.passing.yards if p.passing else None,
        lambda p: (
            f"{p.passing.completions}/{p.passing.attempts}, {p.passing.yards} yds, {p.passing.touchdowns} TD, "
            f"{p.passing.interceptions} INT"
            if p.passing
            else ""
        ),
    ),
    "rushing": (
        "rushing yards",
        lambda p: p.rushing.yards if p.rushing else None,
        lambda p: (
            f"{p.rushing.attempts} carries, {p.rushing.yards} yds, {p.rushing.touchdowns} TD" if p.rushing else ""
        ),
    ),
    "receiving": (
        "receiving yards",
        lambda p: p.receiving.yards if p.receiving else None,
        lambda p: (
            f"{p.receiving.receptions} rec on {p.receiving.targets} targets, {p.receiving.yards} yds, "
            f"{p.receiving.touchdowns} TD"
            if p.receiving
            else ""
        ),
    ),
    "receptions": (
        "receptions",
        lambda p: p.receiving.receptions if p.receiving else None,
        lambda p: f"{p.receiving.receptions} rec, {p.receiving.yards} yds" if p.receiving else "",
    ),
    "sacks": (
        "sacks",
        lambda p: p.defense.sacks if p.defense and p.defense.sacks else None,
        lambda p: f"{p.defense.sacks} sacks" if p.defense else "",
    ),
    "interceptions": (
        "interceptions",
        lambda p: p.defense.interceptions if p.defense and p.defense.interceptions else None,
        lambda p: f"{p.defense.interceptions} INT" if p.defense else "",
    ),
}


class LeaderRow(BaseModel):
    rank: int
    tied: bool = False
    player: str
    team: str | None
    value: int
    stat: str
    line: str


def leaderboard(stats: dict[str, PlayerStats], category: LeaderCategory, *, limit: int = 5) -> list[LeaderRow]:
    """Individual players ranked by one stat across both teams (ties share a rank)."""
    stat, metric, line = _METRICS[category]
    rows = [(v, p) for p in stats.values() if (v := metric(p)) is not None]
    rows.sort(key=lambda r: -r[0])
    out: list[LeaderRow] = []
    for i, (value, p) in enumerate(rows[:limit]):
        rank = out[-1].rank if out and out[-1].value == value else i + 1
        tied = sum(1 for v, _ in rows if v == value) > 1
        out.append(LeaderRow(rank=rank, tied=tied, player=p.player, team=p.team, value=value, stat=stat, line=line(p)))
    return out
