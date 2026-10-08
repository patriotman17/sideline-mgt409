"""Spending and rate safeguards (in-memory, per process)."""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal


class BudgetExceeded(RuntimeError):
    pass


class RateLimited(RuntimeError):
    pass


class SpendTracker:
    """Daily (UTC) spend cap across all AI calls."""

    def __init__(self, daily_budget_usd: float, *, today: Callable[[], str] | None = None):
        self._budget = Decimal(str(daily_budget_usd))
        self._today = today or (lambda: datetime.now(UTC).date().isoformat())
        self._day = self._today()
        self._spent = Decimal("0")
        self._lock = threading.Lock()

    def _roll(self) -> None:
        day = self._today()
        if day != self._day:
            self._day, self._spent = day, Decimal("0")

    def check(self) -> None:
        with self._lock:
            self._roll()
            if self._spent >= self._budget:
                raise BudgetExceeded(f"Daily AI budget of ${self._budget} reached; try again tomorrow.")

    def record(self, cost: Decimal | None, *, fallback: Decimal = Decimal("0")) -> None:
        with self._lock:
            self._roll()
            self._spent += cost if cost is not None else fallback

    @property
    def spent_today(self) -> Decimal:
        with self._lock:
            self._roll()
            return self._spent

    @property
    def budget(self) -> Decimal:
        return self._budget


class RateLimiter:
    """Sliding-window limit per key (e.g. per replay session)."""

    def __init__(self, per_minute: int, *, clock: Callable[[], float] = time.monotonic):
        self._limit = per_minute
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        now = self._clock()
        with self._lock:
            window = self._hits.setdefault(key, deque())
            while window and now - window[0] >= 60:
                window.popleft()
            if len(window) >= self._limit:
                raise RateLimited("Too many questions; wait a moment and try again.")
            window.append(now)
