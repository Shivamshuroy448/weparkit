"""Stale-while-revalidate cache for slow external APIs (NOAA, NWS).

Request handlers must never wait on a third-party API: a 2-12 s upstream stall used to block
/api/health and time out phone requests. Readers get the cached value immediately; when it's
stale, one background thread refreshes it (a lock prevents a refresh stampede). Only the very
first read, before anything is cached, waits for a fetch.
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Generic, TypeVar

log = logging.getLogger(__name__)
T = TypeVar("T")


class SWRCache(Generic[T]):
    def __init__(self, name: str, fetch: Callable[[], T], ttl_s: float):
        self.name, self._fetch, self.ttl_s = name, fetch, ttl_s
        self._value: T | None = None
        self._at = 0.0
        self._lock = threading.Lock()
        self._refreshing = False

    @property
    def has_value(self) -> bool:
        return self._at > 0

    def _refresh(self) -> None:
        try:
            value = self._fetch()
            self._value, self._at = value, time.time()
        except Exception as exc:  # fetchers report their own errors in the value; this is a last resort
            log.warning("%s refresh failed: %s", self.name, exc)
        finally:
            with self._lock:
                self._refreshing = False

    def _start_background_refresh(self) -> None:
        with self._lock:
            if self._refreshing:
                return
            self._refreshing = True
        threading.Thread(target=self._refresh, name=f"swr-{self.name}", daemon=True).start()

    def get(self, force: bool = False) -> T | None:
        if force or not self.has_value:
            with self._lock:
                if self._refreshing and self.has_value and not force:
                    return self._value
                self._refreshing = True
            self._refresh()  # first-ever (or explicitly forced) read waits once
            return self._value
        if time.time() - self._at > self.ttl_s:
            self._start_background_refresh()
        return self._value

    def warm(self) -> None:
        """Fill the cache in the background (call at startup)."""
        if not self.has_value:
            self._start_background_refresh()

    def clear(self) -> None:
        self._value, self._at = None, 0.0
