"""Application settings.

Environment is loaded with python-dotenv in this precedence order
(highest first, existing values are never overwritten):

1. Real process environment variables
2. ``backend/.env``  - backend-specific settings
3. ``<repo>/.env``   - shared secrets (e.g. PORTKEY_API_KEY)
4. ``<repo>/../.env`` - the folder one level above the repo, so the key can live
   outside the clone entirely

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
ENV_FILES = (BACKEND_DIR / ".env", REPO_ROOT / ".env", REPO_ROOT.parent / ".env")


def load_env_files(files: tuple[Path, ...] = ENV_FILES) -> list[Path]:
    """Load each existing file in order without overriding earlier values. Returns the files loaded."""
    loaded = []
    for env_file in files:
        if env_file.is_file():
            load_dotenv(env_file, override=False)
            loaded.append(env_file)
    return loaded


def _optional_secret(name: str) -> SecretStr | None:
    value = os.getenv(name, "").strip()
    return SecretStr(value) if value else None


def _float(name: str, default: float | None) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    value = _float(name, float(default))
    return int(value) if value is not None else default


def _csv(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


class Settings(BaseModel):
    app_name: str = "Sideline API"
    version: str = __version__
    environment: str = "development"
    log_level: str = "info"
    cors_origins: list[str] = Field(default_factory=list)

    # AI gateway. SecretStr keeps keys out of logs and reprs; nothing here is sent to clients.
    portkey_api_key: SecretStr | None = None
    #: Optional Portkey routing header (e.g. "@azure-openai"); not needed when the key has a default route.
    portkey_provider: str | None = None
    ai_base_url: str = "https://api.portkey.ai/v1"
    #: Cost-efficient default; override with AI_MODEL.
    ai_model: str = "gpt-6-luna"
    ai_timeout_seconds: float = 30.0
    ai_max_output_tokens: int = 700
    ai_request_limit: int = 5
    ai_tool_calls_limit: int = 8
    ai_daily_budget_usd: float = 2.0
    ai_rate_limit_per_minute: int = 8
    #: Optional price overrides (USD per 1M tokens) when the bundled price data is wrong/missing.
    ai_input_price_per_mtok: float | None = None
    ai_output_price_per_mtok: float | None = None
    ai_audit_log_path: str | None = "logs/ai_audit.jsonl"
    #: gpt-6-luna on Azure chat completions only supports tools with reasoning_effort="none".
    #: Empty string = don't send the parameter.
    ai_reasoning_effort: str = "none"
    #: Conversation window sent with each question (older turns contribute questions only).
    ai_history_turns: int = 6
    ai_history_max_chars: int = 3000

    @property
    def ai_configured(self) -> bool:
        return self.portkey_api_key is not None and bool(self.ai_model)

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
            portkey_provider=os.getenv("PORTKEY_PROVIDER") or None,
            ai_base_url=os.getenv("AI_BASE_URL", "https://api.portkey.ai/v1"),
            ai_model=os.getenv("AI_MODEL", "gpt-6-luna"),
            ai_timeout_seconds=_float("AI_TIMEOUT_SECONDS", 30.0) or 30.0,
            ai_max_output_tokens=_int("AI_MAX_OUTPUT_TOKENS", 700),
            ai_request_limit=_int("AI_REQUEST_LIMIT", 5),
            ai_tool_calls_limit=_int("AI_TOOL_CALLS_LIMIT", 8),
            ai_daily_budget_usd=_float("AI_DAILY_BUDGET_USD", 2.0) or 0.0,
            ai_rate_limit_per_minute=_int("AI_RATE_LIMIT_PER_MINUTE", 8),
            ai_input_price_per_mtok=_float("AI_INPUT_PRICE_PER_MTOK", None),
            ai_output_price_per_mtok=_float("AI_OUTPUT_PRICE_PER_MTOK", None),
            ai_audit_log_path=os.getenv("AI_AUDIT_LOG_PATH", "logs/ai_audit.jsonl") or None,
            ai_reasoning_effort=os.getenv("AI_REASONING_EFFORT", "none"),
            ai_history_turns=_int("AI_HISTORY_TURNS", 6),
            ai_history_max_chars=_int("AI_HISTORY_MAX_CHARS", 3000),
        )


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor; use as a FastAPI dependency."""
    return Settings.from_env()
