from __future__ import annotations

from app.predictions.ledger import PredictionLedger
from app.predictions.models import Prediction, PredictionType
from app.replay.engine import apply_event, initial_state
from app.replay.models import Game


def ledger_at(game: Game, cursor: int) -> PredictionLedger:
    """Feed the ledger the first ``cursor`` events, exactly as a session reveals them."""
    ledger = PredictionLedger(game.info)
    state = initial_state(game)
    for i, e in enumerate(game.events[:cursor]):
        state = apply_event(state, e, game)
        ledger.observe(e, state, i + 1)
    return ledger


def final(game: Game) -> PredictionLedger:
    return ledger_at(game, len(game.events))


def pred(ledger: PredictionLedger, t: PredictionType, opened: int) -> Prediction:
    p = ledger.get(f"{ledger.info.game_id}:{t.value}:{opened}")
    assert p is not None, f"no {t.value} opened at {opened}"
    return p
