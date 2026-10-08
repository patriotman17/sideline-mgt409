"""A leak-proof snapshot of a replay at a single cursor.

Tools receive only a ``ReplayView``. It holds the game *metadata* and the
events already revealed — never the full event list or the final score — so
an agent cannot reach future plays even by mistake.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.replay.engine import replay
from app.replay.models import Game, GameInfo, GameState, PlayEvent


@dataclass(frozen=True, slots=True)
class ReplayView:
    info: GameInfo
    cursor: int
    total_events: int
    events: tuple[PlayEvent, ...]
    state: GameState
    #: Identifies the source data so cached results are invalidated if it changes.
    data_version: str

    @classmethod
    def at(cls, game: Game, cursor: int) -> ReplayView:
        cursor = max(0, min(cursor, len(game.events)))
        return cls(
            info=game.info,
            cursor=cursor,
            total_events=len(game.events),
            events=game.events[:cursor],
            state=replay(game, cursor),
            data_version=(game.provenance.source_sha256 or "unknown")[:16],
        )

    @property
    def state_version(self) -> str:
        """Cache key component: the same game + data + cursor always yields the same facts."""
        return f"{self.info.game_id}@{self.cursor}#{self.data_version}"

    @property
    def home(self) -> str:
        return self.info.home.abbr

    @property
    def away(self) -> str:
        return self.info.away.abbr
