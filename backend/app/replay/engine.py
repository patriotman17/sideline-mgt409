"""Deterministic replay engine.

``apply_event`` is a pure function: (state, event) -> new state. The state at
cursor ``k`` is ``fold(apply_event, events[:k])`` and therefore cannot depend on
any event at or beyond ``k`` — this is the core no-future-leakage guarantee.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.replay.models import Game, GameState, GameStatus, PlayEvent, PlayKind

#: Number of revealed plays returned in ``GameState.recent_plays``.
RECENT_PLAYS_LIMIT = 30
#: Seconds in a regulation quarter.
QUARTER_SECONDS = 15 * 60


def initial_state(game: Game) -> GameState:
    return GameState(game_id=game.info.game_id)


def _add_points(linescore: tuple[int, ...], quarter: int, points: int) -> tuple[int, ...]:
    padded = list(linescore) + [0] * max(0, quarter - len(linescore))
    padded[quarter - 1] += points
    return tuple(padded)


def _ensure_period(linescore: tuple[int, ...], quarter: int) -> tuple[int, ...]:
    return linescore + (0,) * max(0, quarter - len(linescore))


def _status_for(event: PlayEvent) -> GameStatus:
    if event.kind is PlayKind.END_GAME:
        return GameStatus.FINAL
    if event.kind is PlayKind.END_QUARTER:
        if event.quarter == 2:
            return GameStatus.HALFTIME
        if event.quarter == 4:
            return GameStatus.END_OF_REGULATION
        return GameStatus.END_OF_QUARTER
    return GameStatus.IN_PROGRESS


def apply_event(state: GameState, event: PlayEvent, game: Game) -> GameState:
    """Advance the scoreboard by exactly one event."""
    home, away = game.info.home.abbr, game.info.away.abbr
    update: dict[str, object] = {}

    # Period and clock.
    quarter = max(1, event.quarter)
    update["quarter"] = quarter
    if event.clock_after_seconds is not None:
        update["clock_seconds"] = event.clock_after_seconds
    elif event.clock_seconds is not None:
        update["clock_seconds"] = event.clock_seconds
    status = _status_for(event)
    update["status"] = status

    # Score, attributed per period.
    home_score, away_score = state.home_score, state.away_score
    home_ls = _ensure_period(state.home_linescore, quarter)
    away_ls = _ensure_period(state.away_linescore, quarter)
    for score in event.scoring:
        if score.team == home:
            home_score += score.points
            home_ls = _add_points(home_ls, quarter, score.points)
        elif score.team == away:
            away_score += score.points
            away_ls = _add_points(away_ls, quarter, score.points)
    update |= {"home_score": home_score, "away_score": away_score, "home_linescore": home_ls, "away_linescore": away_ls}

    # Possession, down, distance and field position: the situation the play left behind.
    if status is GameStatus.FINAL:
        update |= {"possession": None, "down": None, "distance": None, "yardline_100": None, "ball_on": None}
    elif event.after.possession is not None:
        update |= {
            "possession": event.after.possession,
            "down": event.after.down,
            "distance": event.after.distance,
            "yardline_100": event.after.yardline_100,
            "ball_on": event.after.ball_on,
        }

    # Timeouts: trust the source when present, otherwise apply the timeout ourselves.
    home_to, away_to = state.home_timeouts, state.away_timeouts
    if event.home_timeouts_after is not None:
        home_to = event.home_timeouts_after
    elif event.kind is PlayKind.TIMEOUT and event.timeout_team == home and home_to:
        home_to -= 1
    if event.away_timeouts_after is not None:
        away_to = event.away_timeouts_after
    elif event.kind is PlayKind.TIMEOUT and event.timeout_team == away and away_to:
        away_to -= 1
    update |= {"home_timeouts": home_to, "away_timeouts": away_to}

    # Win probability: the source model's post-play estimate; a final is certain.
    wp = state.home_win_probability
    if status is GameStatus.FINAL:
        wp = 1.0 if home_score > away_score else 0.0 if home_score < away_score else 0.5
    elif event.home_win_probability_after is not None:
        wp = event.home_win_probability_after
    update["home_win_probability"] = wp

    # Feed.
    update["plays_revealed"] = state.plays_revealed + 1
    update["last_play"] = event
    if event.kind is not PlayKind.GAME_START:
        update["recent_plays"] = (event, *state.recent_plays)[:RECENT_PLAYS_LIMIT]

    if event.kind is PlayKind.GAME_START:
        update |= {"clock_seconds": QUARTER_SECONDS, "status": GameStatus.IN_PROGRESS}

    return state.model_copy(update=update)


def replay(game: Game, cursor: int, events: Sequence[PlayEvent] | None = None) -> GameState:
    """State after the first ``cursor`` events (clamped to the game length)."""
    source = game.events if events is None else events
    cursor = max(0, min(cursor, len(source)))
    state = initial_state(game)
    for event in source[:cursor]:
        state = apply_event(state, event, game)
    return state
