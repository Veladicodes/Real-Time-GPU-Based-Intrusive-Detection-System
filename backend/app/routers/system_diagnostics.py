"""System diagnostics router exposing health telemetry and maintenance controls."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import orjson
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from redis.asyncio import Redis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover
    from aioredis import Redis  # type: ignore

from app.dependencies import get_redis
from app.security import decode_token, verify_jwt_token
from app.utils.diagnostics_utils import (
    MAINTENANCE_KEY,
    WARNINGS_KEY,
    build_fleet_snapshot,
    fetch_maintenance,
    gather_system_snapshot,
    load_warnings,
    run_diagnostic_scan,
    set_maintenance,
)

router = APIRouter(prefix="/api/system", tags=["System Diagnostics"])


class TelemetryBroadcaster:
    """Manage WebSocket clients and periodic telemetry publishing."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._app: Any = None
        self._running = asyncio.Event()

    async def start(self, app) -> None:
        self._app = app
        if self._task is None or self._task.done():
            self._running.set()
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._running.clear()
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:  # pragma: no cover - cooperative cancellation
                pass
            self._task = None

    async def register(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.add(websocket)

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        payload = orjson.dumps(message)
        async with self._lock:
            stale: List[WebSocket] = []
            for ws in list(self._clients):
                try:
                    await ws.send_bytes(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                self._clients.discard(ws)

    async def _run(self) -> None:
        while self._running.is_set():
            await asyncio.sleep(0)
            if self._app is None:
                await asyncio.sleep(2.0)
                continue
            redis: Optional[Redis] = getattr(self._app.state, "redis", None)
            if redis is None:
                await asyncio.sleep(2.0)
                continue
            try:
                snapshot = await gather_system_snapshot(self._app, redis)
                await self.broadcast({"type": "metrics", "payload": snapshot})
            except Exception:  # pragma: no cover - telemetry loop is best effort
                await asyncio.sleep(2.0)
                continue
            await asyncio.sleep(2.0)


telemetry_manager = TelemetryBroadcaster()


class MaintenanceRequest(BaseModel):
    enabled: bool = Field(..., description="Maintenance mode flag.")


@router.get(
    "/status",
    dependencies=[Depends(verify_jwt_token)],
)
async def system_status(request: Request, redis: Redis = Depends(get_redis)) -> Dict[str, Any]:
    snapshot = await gather_system_snapshot(request.app, redis)
    snapshot["warnings"] = await load_warnings(redis)
    return snapshot


@router.post(
    "/scan",
    dependencies=[Depends(verify_jwt_token)],
)
async def trigger_system_scan(request: Request) -> Dict[str, str]:
    app = request.app

    async def _run():
        redis: Optional[Redis] = getattr(app.state, "redis", None)
        if redis is None:
            return
        result = await run_diagnostic_scan(app, redis)
        await telemetry_manager.broadcast({"type": "scan_result", "payload": result})

    asyncio.create_task(_run())
    return {"status": "scan_started"}


@router.post(
    "/maintenance",
    dependencies=[Depends(verify_jwt_token)],
)
async def toggle_maintenance(request: Request, payload: MaintenanceRequest, redis: Redis = Depends(get_redis)) -> Dict[str, Any]:
    await set_maintenance(redis, payload.enabled)
    app = request.app
    setattr(app.state, "maintenance_mode", payload.enabled)
    await telemetry_manager.broadcast({"type": "maintenance_toggle", "payload": {"enabled": payload.enabled}})
    return {"maintenance_mode": payload.enabled}


@router.get(
    "/fleet",
    dependencies=[Depends(verify_jwt_token)],
)
async def get_fleet() -> List[Dict[str, Any]]:
    return build_fleet_snapshot()


async def _authenticate_websocket(websocket: WebSocket) -> bool:
    token: Optional[str] = None
    auth_header = websocket.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
    else:
        token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return False
    try:
        decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return False
    return True


@router.websocket("/ws/system/telemetry")
async def websocket_system(websocket: WebSocket):
    if not await _authenticate_websocket(websocket):
        return
    await websocket.accept()
    await telemetry_manager.register(websocket)
    app = websocket.app
    await telemetry_manager.start(app)
    try:
        # Attach latest snapshot upon connection
        redis: Optional[Redis] = getattr(app.state, "redis", None)
        if redis is not None:
            snapshot = await gather_system_snapshot(app, redis)
            await websocket.send_bytes(orjson.dumps({"type": "metrics", "payload": snapshot}))
            warnings = await load_warnings(redis)
            if warnings:
                await websocket.send_bytes(orjson.dumps({"type": "warnings", "payload": warnings}))

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await telemetry_manager.unregister(websocket)
    except Exception:
        await telemetry_manager.unregister(websocket)
        await websocket.close()


