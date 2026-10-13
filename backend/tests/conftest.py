"""Fixtures shared across test packages."""

import os

# Tests never touch the network or a developer's databases: always use the committed local extracts,
# whatever backend/.env says. (Process env wins over .env files; see app/core/config.py.)
os.environ["REPLAY_DATA_SOURCE"] = "local"

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.agents.conftest import make_service  # noqa: F401
from tests.replay.conftest import catalog, clock, divisional, super_bowl  # noqa: F401


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
