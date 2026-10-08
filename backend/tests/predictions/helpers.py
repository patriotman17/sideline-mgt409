from __future__ import annotations

from app.predictions.config import DEFAULT_CONFIG, PredictionConfig
from app.predictions.ledger import PredictionLedger
from app.predictions.models import Prediction, PredictionType
from app.replay.engine import apply_event, initial_state
from app.replay.models import Game

#: Ranking and pacing off: every eligible candidate (still one open question at a time).
#: Used to exercise the resolvers on as many real situations as possible.
EVERY = PredictionConfig(
    min_score=-1000, cooldown_snaps=0, critical_cooldown_snaps=0, type_cooldown_snaps=0, max_per_quarter=1000
)


def ledger_at(game: Game, cursor: int, config: PredictionConfig = DEFAULT_CONFIG) -> PredictionLedger:
    """Feed the ledger the first ``cursor`` events, exactly as a session reveals them."""
    ledger = PredictionLedger(game.info, config)
    state = initial_state(game)
    for i, e in enumerate(game.events[:cursor]):
        state = apply_event(state, e, game)
        ledger.observe(e, state, i + 1)
    return ledger


def final(game: Game, config: PredictionConfig = DEFAULT_CONFIG) -> PredictionLedger:
    return ledger_at(game, len(game.events), config)


def pred(ledger: PredictionLedger, t: PredictionType, opened: int) -> Prediction:
    p = ledger.get(f"{ledger.info.game_id}:{t.value}:{opened}")
    assert p is not None, f"no {t.value} opened at {opened}"
    return p
