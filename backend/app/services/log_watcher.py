"""Asynchronous log tailing and WebSocket broadcasting."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Dict, Optional, Set

import aiofiles
from watchfiles import Change, awatch

from app.services.analytics import AnalyticsEngine
from app.utils.file_utils import ensure_log_dir, get_latest_log_file

logger = logging.getLogger(__name__)


if TYPE_CHECKING:  # pragma: no cover
    from starlette.websockets import WebSocket


class ConnectionManager:
    """Track active WebSocket connections for the log stream."""

    def __init__(self) -> None:
        self._connections: Set["WebSocket"] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: "WebSocket") -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        logger.info("WebSocket client connected. Total: %s", len(self._connections))

    async def disconnect(self, websocket: "WebSocket") -> None:
        async with self._lock:
            self._connections.discard(websocket)
        logger.info("WebSocket client disconnected. Total: %s", len(self._connections))

    async def broadcast(self, message: Dict[str, object]) -> None:
        payload = json.dumps(message)
        async with self._lock:
            connections = list(self._connections)
        if not connections:
            return

        await asyncio.gather(
            *[
                self._send_safe(connection, payload)
                for connection in connections
            ],
            return_exceptions=True,
        )

    async def _send_safe(self, websocket: "WebSocket", payload: str) -> None:
        try:
            await websocket.send_text(payload)
        except Exception as exc:  # pragma: no cover - defensive programming
            logger.warning("WebSocket send failed: %s", exc, exc_info=exc)
            await self.disconnect(websocket)


class LogWatcher:
    """Tail the latest RT-GIDS log file and publish incremental updates."""

    def __init__(
        self,
        logs_dir: Path,
        analytics: AnalyticsEngine,
        manager: ConnectionManager,
        poll_interval: float = 0.5,
    ) -> None:
        self.logs_dir = ensure_log_dir(logs_dir)
        self.analytics = analytics
        self.manager = manager
        self.poll_interval = poll_interval
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._current_file: Optional[Path] = None

    async def start(self) -> None:
        if self._task and not self._task.done():
            logger.debug("LogWatcher already running.")
            return

        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name="log-watcher")
        logger.info("LogWatcher background task started.")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                logger.debug("LogWatcher task cancelled.")

    async def _run(self) -> None:
        try:
            while not self._stop_event.is_set():
                latest = get_latest_log_file(self.logs_dir)
                if latest is None:
                    latest = await self._wait_for_new_file()
                    if latest is None:
                        continue

                if latest != self._current_file:
                    logger.info("Switching to latest log file: %s", latest.name)
                    await self._bootstrap_file(latest)
                    self._current_file = latest

                await self._tail_file(latest)
        except asyncio.CancelledError:  # pragma: no cover - lifecycle handling
            logger.info("LogWatcher loop cancelled.")
        except Exception as exc:  # pragma: no cover - global safeguard
            logger.exception("LogWatcher encountered an error: %s", exc)

    async def _wait_for_new_file(self) -> Optional[Path]:
        """Block until a new log file is created or stop event fires."""
        logger.debug("Waiting for new log files in %s", self.logs_dir)
        async for changes in awatch(self.logs_dir, stop_event=self._stop_event):
            if self._stop_event.is_set():
                return None
            for change, path_str in changes:
                if change in (Change.added, Change.modified):
                    path = Path(path_str)
                    if path.name.startswith("detection_log_") and path.suffix == ".txt":
                        logger.info("Detected new log file: %s", path.name)
                        return path
        return None

    async def _bootstrap_file(self, file_path: Path) -> None:
        """Load existing contents to seed analytics without broadcasting."""
        logger.debug("Bootstrapping analytics from %s", file_path)
        try:
            async with aiofiles.open(file_path, mode="r", encoding="utf-8") as handle:
                lines = []
                async for line in handle:
                    lines.append(line.rstrip("\n"))
            if lines:
                await self.analytics.bootstrap_from_lines(lines)
        except FileNotFoundError:
            logger.warning("File removed before bootstrap: %s", file_path)

    async def _tail_file(self, file_path: Path) -> None:
        """Stream appended lines to analytics and WebSocket clients."""
        try:
            async with aiofiles.open(file_path, mode="r", encoding="utf-8") as handle:
                await handle.seek(0, 2)  # move to end of file
                while not self._stop_event.is_set():
                    line = await handle.readline()
                    if not line:
                        await asyncio.sleep(self.poll_interval)
                        latest = get_latest_log_file(self.logs_dir)
                        if latest != file_path:
                            logger.info("Detected newer log file: %s", latest)
                            self._current_file = None
                            break
                        continue

                    parsed = await self.analytics.handle_line(line)
                    if not parsed:
                        continue

                    message = {
                        "timestamp": parsed.timestamp.isoformat(),
                        "line": parsed.raw,
                        "type": parsed.category,
                    }
                    await self.manager.broadcast(message)
        except FileNotFoundError:
            logger.warning("Log file disappeared while tailing: %s", file_path)
            await asyncio.sleep(self.poll_interval)
        except Exception as exc:  # pragma: no cover - resilience
            logger.exception("Error while tailing log file: %s", exc)
            await asyncio.sleep(self.poll_interval)


