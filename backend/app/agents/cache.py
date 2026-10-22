"""Small thread-safe LRU cache with TTL (shared, in-memory)."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Generic, TypeVar

V = TypeVar("V")


class TTLCache(Generic[V]):
    def __init__(
        self, *, maxsize: int = 1000, ttl_seconds: float = 6 * 3600, clock: Callable[[], float] = time.monotonic
    ):
        self._data: OrderedDict[Hashable, tuple[float, V]] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> V | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            stored, value = item
            if self._clock() - stored > self._ttl:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: Hashable, value: V) -> None:
        with self._lock:
            self._data[key] = (self._clock(), value)
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)
