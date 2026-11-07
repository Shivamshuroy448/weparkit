"""Tiny WebSocket broadcaster. Clients refetch the resource named in each event.
The frontend also polls, so a dropped socket never leaves the UI stale."""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.loop = asyncio.get_running_loop()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def _send_all(self, msg: str) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def publish(self, event: str, **data) -> None:
        """Safe to call from sync route handlers (they run in a threadpool)."""
        if not self.clients or self.loop is None:
            return
        msg = json.dumps({"event": event, **data})
        try:
            asyncio.run_coroutine_threadsafe(self._send_all(msg), self.loop)
        except RuntimeError:
            pass


hub = Hub()
