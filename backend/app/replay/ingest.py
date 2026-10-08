"""Convert nflverse play-by-play rows into normalized ``PlayEvent``s.

Rules:
* Source values that are blank/``NA`` become ``None`` — never guessed.
* Rows are ordered by the source order (nflverse rows are chronological).
* ``after`` fields come from the *next snap's pre-snap* columns: they describe
  the result of this play only. Scores and timeouts in nflverse already
  include the current row (verified against the 2023 data despite the data
  dictionary wording), so they are taken from the row itself.
* Scoring is derived from play flags; source score totals are used only to
  validate the engine (mismatches become ``Game.warnings``).
"""

from __future__ import annotations

import csv
import json
import re
from collections.abc import Iterable, Mapping
from pathlib import Path

from app.replay.models import (
    POINTS,
    Game,
    GameInfo,
    Penalty,
    PlayerCredits,
    PlayEvent,
    PlayKind,
    PlayStats,
    Provenance,
    ScoreType,
    Scoring,
    Situation,
    Turnover,
    TurnoverType,
)
from app.replay.teams import team

Row = Mapping[str, str]

_MISSING = {"", "NA", "NaN", "nan", "None"}

# Kinds that mark game structure rather than a snap.
_NON_SNAP = {PlayKind.GAME_START, PlayKind.END_QUARTER, PlayKind.END_GAME, PlayKind.TIMEOUT}

_POSTSEASON_ROUNDS = {19: "Wild Card Round", 20: "Divisional Round", 21: "Conference Championship"}


class IngestError(ValueError):
    """Raised when a source file cannot be turned into a game at all."""


# ---------------------------------------------------------------- field parsing


def _str(row: Row, key: str) -> str | None:
    value = (row.get(key) or "").strip()
    return None if value in _MISSING else value


def _float(row: Row, key: str) -> float | None:
    value = _str(row, key)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _int(row: Row, key: str) -> int | None:
    value = _float(row, key)
    return None if value is None else round(value)


def _flag(row: Row, key: str) -> bool:
    return _int(row, key) == 1


def _opt_flag(row: Row, key: str) -> bool | None:
    value = _int(row, key)
    return None if value is None else value == 1


def _clock_seconds(row: Row) -> int | None:
    """Prefer the ``MM:SS`` string; fall back to ``quarter_seconds_remaining``."""
    text = _str(row, "time")
    if text:
        match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
        if match:
            return int(match.group(1)) * 60 + int(match.group(2))
    return _int(row, "quarter_seconds_remaining")


def _ball_on(row: Row) -> str | None:
    spot = _str(row, "yrdln")
    if not spot:
        return None
    if spot.strip() == "50" or spot.endswith(" 50"):
        return "50"
    return spot


# ---------------------------------------------------------------- classification


def classify(row: Row) -> PlayKind:
    nfl = (_str(row, "play_type_nfl") or "").upper()
    if nfl == "GAME_START":
        return PlayKind.GAME_START
    if nfl == "END_QUARTER" or (_flag(row, "quarter_end") and not _str(row, "play_type")):
        return PlayKind.END_QUARTER
    if nfl == "END_GAME":
        return PlayKind.END_GAME
    if nfl == "TIMEOUT":
        return PlayKind.TIMEOUT

    play_type = _str(row, "play_type")
    if play_type in ("pass", "run") and _str(row, "two_point_conv_result"):
        return PlayKind.TWO_POINT
    mapping = {
        "kickoff": PlayKind.KICKOFF,
        "pass": PlayKind.PASS,
        "run": PlayKind.RUN,
        "punt": PlayKind.PUNT,
        "field_goal": PlayKind.FIELD_GOAL,
        "extra_point": PlayKind.EXTRA_POINT,
        "qb_kneel": PlayKind.KNEEL,
        "qb_spike": PlayKind.SPIKE,
    }
    if play_type in mapping:
        return mapping[play_type]
    if play_type == "no_play" and _flag(row, "penalty"):
        return PlayKind.PENALTY
    if _flag(row, "timeout"):
        return PlayKind.TIMEOUT
    return PlayKind.OTHER


def derive_scoring(row: Row) -> tuple[Scoring, ...]:
    """Points scored on this row, from explicit result flags only."""
    offense = _str(row, "posteam")
    defense = _str(row, "defteam")
    scores: list[Scoring] = []

    def add(kind: ScoreType, scorer: str | None) -> None:
        if scorer:
            scores.append(Scoring(type=kind, team=scorer, points=POINTS[kind]))

    if _flag(row, "touchdown"):
        add(ScoreType.TOUCHDOWN, _str(row, "td_team"))
    if _str(row, "field_goal_result") == "made":
        add(ScoreType.FIELD_GOAL, offense)
    if _str(row, "extra_point_result") == "good":
        add(ScoreType.EXTRA_POINT, offense)
    if _str(row, "two_point_conv_result") == "success":
        add(ScoreType.TWO_POINT, offense)
    if _flag(row, "defensive_two_point_conv") or _flag(row, "defensive_extra_point_conv"):
        add(ScoreType.DEFENSIVE_CONVERSION, defense)
    if _flag(row, "safety"):
        add(ScoreType.SAFETY, defense)
    return tuple(scores)


def _penalty(row: Row, kind: PlayKind) -> Penalty | None:
    if not _flag(row, "penalty"):
        return None
    return Penalty(
        team=_str(row, "penalty_team"),
        type=_str(row, "penalty_type"),
        yards=_int(row, "penalty_yards"),
        no_play=kind is PlayKind.PENALTY or _str(row, "play_type") == "no_play",
    )


def _turnover(row: Row, kind: PlayKind, after: Situation) -> Turnover | None:
    offense = _str(row, "posteam")
    defense = _str(row, "defteam")
    if _flag(row, "interception"):
        return Turnover(type=TurnoverType.INTERCEPTION, lost_by=offense, gained_by=defense)
    if _flag(row, "fumble_lost"):
        # On kicks the fumbling team is often the *receiving* team (e.g. a muffed
        # punt), so attribute by who has the ball next rather than by posteam.
        gained = after.possession
        lost = (defense if gained == offense else offense) if gained in (offense, defense) else None
        return Turnover(type=TurnoverType.FUMBLE, lost_by=lost, gained_by=gained)
    down = _int(row, "down")
    if (
        kind in (PlayKind.PASS, PlayKind.RUN)
        and down == 4
        and after.possession
        and offense
        and after.possession != offense
        and not _flag(row, "touchdown")
        and not _flag(row, "safety")
    ):
        return Turnover(type=TurnoverType.DOWNS, lost_by=offense, gained_by=after.possession)
    return None


def _players(row: Row) -> PlayerCredits:
    return PlayerCredits(
        passer=_str(row, "passer_player_name"),
        receiver=_str(row, "receiver_player_name"),
        rusher=_str(row, "rusher_player_name"),
        interceptor=_str(row, "interception_player_name"),
        sacker=_str(row, "sack_player_name"),
        kicker=_str(row, "kicker_player_name"),
        fumbler=_str(row, "fumbled_1_player_name"),
    )


def _stats(row: Row) -> PlayStats:
    return PlayStats(
        pass_attempt=_opt_flag(row, "pass_attempt"),
        complete_pass=_opt_flag(row, "complete_pass"),
        rush_attempt=_opt_flag(row, "rush_attempt"),
        sack=_opt_flag(row, "sack"),
        scramble=_opt_flag(row, "qb_scramble"),
        pass_touchdown=_opt_flag(row, "pass_touchdown"),
        rush_touchdown=_opt_flag(row, "rush_touchdown"),
        passing_yards=_int(row, "passing_yards"),
        receiving_yards=_int(row, "receiving_yards"),
        rushing_yards=_int(row, "rushing_yards"),
        kick_distance=_int(row, "kick_distance"),
        first_down=_opt_flag(row, "first_down"),
        shotgun=_opt_flag(row, "shotgun"),
        no_huddle=_opt_flag(row, "no_huddle"),
    )


def _situation(row: Row) -> Situation:
    return Situation(
        possession=_str(row, "posteam"),
        down=_int(row, "down"),
        distance=_int(row, "ydstogo"),
        yardline_100=_int(row, "yardline_100"),
        ball_on=_ball_on(row),
    )


def game_title(season_type: str | None, week: int | None, season: int | None, home_conf: str | None) -> str:
    if season_type == "POST" and week is not None:
        if week >= 22 and season is not None:
            return f"Super Bowl {_roman(season - 1965)}"
        round_name = _POSTSEASON_ROUNDS.get(week)
        if round_name:
            return f"{home_conf} {round_name}" if home_conf else round_name
    if week is not None:
        return f"Week {week}"
    return "NFL game"


def _roman(n: int) -> str:
    numerals = [(50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for value, symbol in numerals:
        while n >= value:
            out += symbol
            n -= value
    return out


# ---------------------------------------------------------------- pipeline


def normalize_rows(rows: list[Row]) -> list[PlayEvent]:
    """Normalize chronological rows of one game into events."""
    kinds = [classify(r) for r in rows]
    events: list[PlayEvent] = []
    prev_wp: float | None = None
    for i, row in enumerate(rows):
        kind = kinds[i]

        # Situation after this play = pre-snap state of the next snap.
        after = Situation()
        for j in range(i + 1, len(rows)):
            if kinds[j] not in _NON_SNAP and _str(rows[j], "posteam"):
                after = _situation(rows[j])
                break
            if kinds[j] is PlayKind.END_GAME:
                break

        # Clock after this play = start clock of the next row in the same period.
        clock_after: int | None
        if kind in (PlayKind.END_QUARTER, PlayKind.END_GAME):
            clock_after = _clock_seconds(row)
        elif i + 1 < len(rows) and _int(rows[i + 1], "qtr") == _int(row, "qtr"):
            clock_after = _clock_seconds(rows[i + 1])
        else:
            clock_after = None

        wp = _float(row, "home_wp_post")
        if wp is None and kind in _NON_SNAP:
            wp = prev_wp
        prev_wp = wp if wp is not None else prev_wp

        events.append(
            PlayEvent(
                sequence=i,
                source_play_id=_int(row, "play_id"),
                kind=kind,
                quarter=_int(row, "qtr") or (events[-1].quarter if events else 1),
                clock_seconds=_clock_seconds(row),
                offense=_str(row, "posteam") if kind not in _NON_SNAP else None,
                defense=_str(row, "defteam") if kind not in _NON_SNAP else None,
                before=_situation(row) if kind not in _NON_SNAP else Situation(),
                yards_gained=_int(row, "yards_gained") if kind not in _NON_SNAP else None,
                description=_str(row, "desc") or "",
                scoring=derive_scoring(row),
                turnover=_turnover(row, kind, after),
                penalty=_penalty(row, kind),
                timeout_team=_str(row, "timeout_team") if kind is PlayKind.TIMEOUT else None,
                players=_players(row) if kind not in _NON_SNAP else PlayerCredits(),
                stats=_stats(row) if kind not in _NON_SNAP else PlayStats(),
                after=after,
                clock_after_seconds=clock_after,
                home_timeouts_after=_int(row, "home_timeouts_remaining"),
                away_timeouts_after=_int(row, "away_timeouts_remaining"),
                home_win_probability_after=wp,
                source_home_score_after=_int(row, "total_home_score"),
                source_away_score_after=_int(row, "total_away_score"),
            )
        )
    return events


def build_game(rows: list[Row], provenance: Provenance) -> Game:
    if not rows:
        raise IngestError("No rows for game")
    first = rows[0]
    game_ids = {r.get("game_id") for r in rows}
    if len(game_ids) != 1:
        raise IngestError(f"Expected one game, got {sorted(map(str, game_ids))}")
    home_abbr = _str(first, "home_team")
    away_abbr = _str(first, "away_team")
    if not home_abbr or not away_abbr:
        raise IngestError("Missing home/away team")

    home = team(home_abbr)
    season = _int(first, "season")
    week = _int(first, "week")
    season_type = _str(first, "season_type")
    info = GameInfo(
        game_id=str(first.get("game_id")),
        title=game_title(season_type, week, season, home.conference if season_type == "POST" else None),
        season=season,
        season_type=season_type,
        week=week,
        game_date=_str(first, "game_date"),
        home=home,
        away=team(away_abbr),
        venue=_str(first, "stadium"),
        roof=_str(first, "roof"),
        spread_line=_float(first, "spread_line"),
        total_line=_float(first, "total_line"),
    )
    events = tuple(normalize_rows(rows))
    game = Game(
        info=info,
        events=events,
        final_home_score=_int(first, "home_score"),
        final_away_score=_int(first, "away_score"),
        provenance=provenance,
    )
    return game.model_copy(update={"warnings": tuple(validate(game))})


def validate(game: Game) -> list[str]:
    """Replay the game and compare against the source's own score totals."""
    from app.replay.engine import apply_event, initial_state  # local import: engine imports models only

    warnings: list[str] = []
    state = initial_state(game)
    for event in game.events:
        state = apply_event(state, event, game)
        src_home, src_away = event.source_home_score_after, event.source_away_score_after
        if (
            src_home is not None
            and src_away is not None
            and (state.home_score, state.away_score) != (src_home, src_away)
        ):
            warnings.append(
                f"score mismatch after event {event.sequence} ({event.kind}): "
                f"engine {state.away_score}-{state.home_score}, source {src_away}-{src_home}"
            )
            break  # later rows would all repeat the same mismatch
    final_known = game.final_home_score is not None and game.final_away_score is not None
    if final_known and (state.home_score, state.away_score) != (game.final_home_score, game.final_away_score):
        warnings.append(
            f"final score mismatch: engine {state.away_score}-{state.home_score}, "
            f"source {game.final_away_score}-{game.final_home_score}"
        )
    if not game.events or game.events[-1].kind is not PlayKind.END_GAME:
        warnings.append("source has no END GAME row; replay may end early")
    return warnings


def load_game_file(csv_path: Path) -> Game:
    """Load one extracted game CSV plus its ``.source.json`` provenance sidecar."""
    with csv_path.open(newline="", encoding="utf-8") as fh:
        rows: list[Row] = list(csv.DictReader(fh))
    sidecar = csv_path.with_suffix(".source.json")
    meta = json.loads(sidecar.read_text()) if sidecar.exists() else {}
    provenance = Provenance(
        source=meta.get("source", "unknown"),
        source_url=meta.get("source_url"),
        source_sha256=meta.get("source_sha256"),
        retrieved_at=meta.get("retrieved_at"),
        license=meta.get("license"),
        attribution=meta.get("attribution"),
        is_test_fixture=bool(meta.get("is_test_fixture", False)),
    )
    return build_game(rows, provenance)


def load_games(directory: Path) -> Iterable[Game]:
    for path in sorted(directory.glob("*.csv")):
        yield load_game_file(path)
