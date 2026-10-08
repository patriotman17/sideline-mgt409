from __future__ import annotations

from collections.abc import Callable

import pytest

from app.replay.catalog import DEFAULT_DATA_DIR, GameCatalog
from app.replay.ingest import build_game
from app.replay.models import Game, Provenance
from app.replay.source import COLUMNS

DIVISIONAL = "2023_20_KC_BUF"  # KC 27 @ BUF 24, 2024-01-21
SUPER_BOWL = "2023_22_SF_KC"  # SF 22 vs KC 25 (OT), 2024-02-11

# Synthetic rows are clearly labeled test fixtures, never shipped as game data.
FIXTURE_PROVENANCE = Provenance(source="synthetic test fixture", is_test_fixture=True)


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture(scope="session")
def catalog() -> GameCatalog:
    return GameCatalog.from_directory(DEFAULT_DATA_DIR)


@pytest.fixture(scope="session")
def divisional(catalog: GameCatalog) -> Game:
    game = catalog.get(DIVISIONAL)
    assert game is not None
    return game


@pytest.fixture(scope="session")
def super_bowl(catalog: GameCatalog) -> Game:
    game = catalog.get(SUPER_BOWL)
    assert game is not None
    return game


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


def make_row(**values: object) -> dict[str, str]:
    """A source-shaped row with every column blank unless overridden."""
    base = {c: "" for c in COLUMNS}
    base.update(
        game_id="TEST_01_AAA_BBB",
        season="2023",
        season_type="REG",
        week="1",
        home_team="BUF",
        away_team="KC",
        qtr="1",
    )
    base.update({k: str(v) for k, v in values.items()})
    return base


@pytest.fixture
def fixture_game() -> Callable[..., Game]:
    def build(*rows: dict[str, str]) -> Game:
        return build_game(list(rows), FIXTURE_PROVENANCE)

    return build
