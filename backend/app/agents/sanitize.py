"""Treat external text (play descriptions, user questions) as untrusted data."""

from __future__ import annotations

import re

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩]")
_WS = re.compile(r"\s+")


def clean_text(value: str | None, *, max_length: int = 300) -> str:
    """Strip control/bidi characters, collapse whitespace, and truncate."""
    if not value:
        return ""
    text = _WS.sub(" ", _CONTROL.sub("", value)).strip()
    return text if len(text) <= max_length else text[: max_length - 1].rstrip() + "…"


def normalize_question(question: str) -> str:
    """Canonical form used for cache keys."""
    return re.sub(r"[^\w\s]", "", clean_text(question, max_length=500).lower()).strip()
