"""Agent audit logging: one JSON line per AI request. Secrets are never written.

Records hold only metadata (no headers, no keys). Free text that could echo a
secret (errors, questions) passes through ``redact`` first.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.core.config import BACKEND_DIR, Settings

logger = logging.getLogger("sideline.ai.audit")

AuditStatus = Literal[
    "ok",
    "cached",
    "not_configured",
    "budget_exceeded",
    "rate_limited",
    "limit_exceeded",
    "blocked",
    "clarification",
    "withheld",
    "model_error",
    "timeout",
    "error",
]

_SECRET_PATTERNS = [
    re.compile(r"(?i)bearer\s+[a-z0-9._\-]+"),
    re.compile(r"\b(sk|pk|rk)-[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"(?i)(x-portkey-api-key|api[_-]?key)[\"':=\s]+[^\s\"',}]+"),
]


class ToolCallRecord(BaseModel):
    name: str
    args: dict[str, object] = Field(default_factory=dict)
    ok: bool = True
    duration_ms: float = 0.0
    error: str | None = None


class AuditRecord(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="milliseconds"))
    request_id: str
    kind: Literal["ask", "insight", "preview", "assistant"]
    status: AuditStatus
    game_id: str
    cursor: int
    session: str | None = Field(default=None, description="Truncated session id (never the token)")
    model: str | None = None
    prompt_version: str | None = None
    question: str | None = None
    latency_ms: float = 0.0
    requests: int = 0
    input_tokens: int = 0
    #: Part of input_tokens served from the provider's prompt cache (billed at a discount).
    cached_input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float | None = None
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    grounding_issues: list[str] = Field(default_factory=list)
    history_turns: int = 0
    context_fingerprint: str | None = None
    #: "knowledge/style" phrasing preset (e.g. "casual/simple"); never free text.
    answer_style: str | None = None
    error_type: str | None = None
    error: str | None = None


class AuditLog:
    def __init__(self, settings: Settings, *, keep: int = 500):
        self._secrets = [
            s for s in [settings.portkey_api_key.get_secret_value() if settings.portkey_api_key else None] if s
        ]
        path = settings.ai_audit_log_path
        self._path = (BACKEND_DIR / path) if path and not Path(path).is_absolute() else (Path(path) if path else None)
        self._recent: deque[AuditRecord] = deque(maxlen=keep)
        self._lock = threading.Lock()

    def redact(self, text: str | None, *, max_length: int = 500) -> str | None:
        if text is None:
            return None
        for secret in self._secrets:
            text = text.replace(secret, "[REDACTED]")
        for pattern in _SECRET_PATTERNS:
            text = pattern.sub("[REDACTED]", text)
        return text[:max_length]

    def write(self, record: AuditRecord) -> AuditRecord:
        record = record.model_copy(
            update={"question": self.redact(record.question, max_length=300), "error": self.redact(record.error)}
        )
        line = record.model_dump_json()
        with self._lock:
            self._recent.append(record)
            if self._path:
                try:
                    self._path.parent.mkdir(parents=True, exist_ok=True)
                    with self._path.open("a", encoding="utf-8") as fh:
                        fh.write(line + "\n")
                except OSError:
                    logger.warning("could not write audit log to %s", self._path)
        logger.info("ai_audit %s", line)
        return record

    def recent(self, limit: int = 50) -> list[AuditRecord]:
        with self._lock:
            return list(self._recent)[-limit:]

    @staticmethod
    def dumps(records: list[AuditRecord]) -> str:
        return json.dumps([r.model_dump() for r in records])
