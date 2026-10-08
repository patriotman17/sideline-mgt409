"""Per-session Ask Sideline conversation memory.

* Stored server-side on the replay session (isolated per session, expires with it).
  Clients never send history, so they can't forge earlier "assistant" turns.
* Every turn records the replay position it was answered at. ``context()`` only
  returns turns asked at or before the current cursor, so rewinding a replay can
  never surface answers about later plays.
* A bounded window (turns + characters) keeps prompts short. Older turns are
  reduced to their questions only — no stale numbers are carried forward.
"""

from __future__ import annotations

import hashlib
import re
import threading
from collections import deque
from dataclasses import dataclass

from app.agents.sanitize import clean_text, normalize_question

#: Hard cap on stored turns per session (the prompt window is smaller and configurable).
MAX_STORED_TURNS = 50


@dataclass(frozen=True, slots=True)
class Turn:
    question: str
    answer: str
    cursor: int
    period: str
    clock: str | None
    request_id: str = ""
    #: Tied players named in this answer; a following "he/his" is ambiguous between them.
    ambiguous_players: tuple[str, ...] = ()


_SINGULAR_PRONOUN = re.compile(r"\b(he|him|his|he's|she|her|hers)\b", re.IGNORECASE)


def _surname(player: str) -> str:
    return player.split(".")[-1].lower()


def ambiguous_reference(question: str, previous: Turn | None) -> tuple[str, ...]:
    """Tied players a singular pronoun could refer to, or () if the question is unambiguous."""
    if previous is None or len(previous.ambiguous_players) < 2 or not _SINGULAR_PRONOUN.search(question):
        return ()
    q = question.lower()
    if any(_surname(p) in q for p in previous.ambiguous_players):
        return ()  # the user named one of them
    return previous.ambiguous_players


def resolve_pronoun(question: str, player: str) -> str:
    """Rewrite a follow-up for one specific player: "How many catches does he have?" -> "...does C.McCaffrey have?"."""

    def sub(m: re.Match[str]) -> str:
        word = m.group(1).lower()
        return f"{player}'s" if word in ("his", "hers") else player

    return _SINGULAR_PRONOUN.sub(sub, question, count=1)


@dataclass(frozen=True, slots=True)
class ConversationContext:
    """The slice of a conversation sent to the model for one question."""

    turns: tuple[Turn, ...]
    earlier_questions: tuple[str, ...]

    @property
    def fingerprint(self) -> str:
        """Identifies the exact context, so cached answers are never reused across different contexts."""
        if not self.turns and not self.earlier_questions:
            return ""
        h = hashlib.sha256()
        for q in self.earlier_questions:
            h.update(b"Q\0" + normalize_question(q).encode() + b"\0")
        for t in self.turns:
            h.update(f"T\0{t.cursor}\0{normalize_question(t.question)}\0{t.answer}\0".encode())
        return h.hexdigest()[:16]


class Conversation:
    def __init__(self) -> None:
        self._turns: deque[Turn] = deque(maxlen=MAX_STORED_TURNS)
        self._lock = threading.Lock()

    def add(self, turn: Turn) -> None:
        with self._lock:
            self._turns.append(turn)

    def clear(self) -> None:
        with self._lock:
            self._turns.clear()

    def __len__(self) -> int:
        return len(self._turns)

    def visible(self, cursor: int) -> tuple[list[Turn], int]:
        """All turns at or before ``cursor`` (oldest first) and how many are hidden as later."""
        with self._lock:
            turns = list(self._turns)
        shown = [t for t in turns if t.cursor <= cursor]
        return shown, len(turns) - len(shown)

    def context(self, cursor: int, *, max_turns: int, max_chars: int) -> ConversationContext:
        """Recent turns visible at ``cursor`` (oldest first), within the turn and character budgets."""
        with self._lock:
            visible = [t for t in self._turns if t.cursor <= cursor]
        kept: list[Turn] = []
        used = 0
        for t in reversed(visible):
            size = len(t.question) + len(t.answer)
            if len(kept) >= max_turns or (kept and used + size > max_chars):
                break
            kept.append(t)
            used += size
        kept.reverse()
        omitted = visible[: len(visible) - len(kept)]
        earlier = tuple(clean_text(t.question, max_length=80) for t in omitted[-5:])
        return ConversationContext(turns=tuple(kept), earlier_questions=earlier)
