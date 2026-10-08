"""Application settings.

Environment is loaded with python-dotenv in this precedence order
(highest first, existing values are never overwritten):

1. Real process environment variables
2. ``backend/.env``  – backend-specific settings
3. ``<repo>/.env``   – shared secrets (e.g. PORTKEY_API_KEY)

Secrets only ever live here on the server; the mobile app never sees them.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field, SecretStr

from app import __version__

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
ENV_FILES = (BACKEND_DIR / ".env", REPO_ROOT / ".env")


def load_env_files() -> None:
    for env_file in ENV_FILES:
        if env_file.is_file():
            load_dotenv(env_file, override=False)


def _optional_secret(name: str) -> SecretStr | None:
    value = os.getenv(name, "").strip()
    return SecretStr(value) if value else None


def _csv(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


class Settings(BaseModel):
    app_name: str = "Sideline API"
    version: str = __version__
    environment: str = "development"
    log_level: str = "info"
    cors_origins: list[str] = Field(default_factory=list)

    # AI gateway (unused in Phase 1). SecretStr keeps it out of logs/reprs.
    portkey_api_key: SecretStr | None = None

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @classmethod
    def from_env(cls) -> Settings:
        load_env_files()
        return cls(
            environment=os.getenv("APP_ENV", "development"),
            log_level=os.getenv("LOG_LEVEL", "info"),
            cors_origins=_csv(
                "CORS_ORIGINS",
                "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006",
            ),
            portkey_api_key=_optional_secret("PORTKEY_API_KEY"),
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor; use as a FastAPI dependency."""
    return Settings.from_env()
