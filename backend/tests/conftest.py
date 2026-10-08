"""Fixtures shared across test packages."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.replay.conftest import catalog, clock, divisional, super_bowl  # noqa: F401


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
