"""System diagnostics router providing live health telemetry and controls."""

from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional, Set

import orjson
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    import aioredis  # type: ignore

from app.dependencies import get_redis
from app.utils.diagnostics_utils import (
    build_fleet_snapshot,
    gather_system_snapshot,
    load_warnings,             # ✅ renamed (was get_cached_warnings)
    is_maintenance_mode,       # ✅ use Tier-0 name instead of get_maintenance_mode
    run_system_scan,
    set_maintenance_mode,
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

router = APIRouter(prefix="/api/system", tags=["System Diagnostics"])

# Active clients and async control locks
telemetry_clients: Set[WebSocket] = set()
telemetry_task: Optional[asyncio.Task] = None
scan_task: Optional[asyncio.Task] = None
telemetry_lock = asyncio.Lock()
scan_lock = asyncio.Lock()


class MaintenanceRequest(BaseModel):
    """Request schema for enabling or disabling maintenance mode."""
    enabled: bool = Field(..., description="Enable or disable global maintenance mode.")


# ---------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------
async def _ensure_redis(request: Request) -> aioredis.Redis:
    """Ensure Redis connection is available and cached in app state."""
    redis = getattr(request.app.state, "redis", None)
    if redis:
        try:
            await redis.ping()
            return redis
        except Exception:
            pass
    # Fallback reconnect
    redis = await aioredis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        health_check_interval=30,
    )
    request.app.state.redis = redis
    return redis


async def _broadcast(message: Dict[str, Any]) -> None:
    """Send a message to all connected WebSocket clients."""
    if not telemetry_clients:
        return
    payload = orjson.dumps(message)
    stale: List[WebSocket] = []
    for websocket in telemetry_clients.copy():
        try:
            await websocket.send_bytes(payload)
        except Exception:
            stale.append(websocket)
    for websocket in stale:
        telemetry_clients.discard(websocket)


async def _telemetry_loop(request: Request) -> None:
    """Background loop that periodically sends system telemetry snapshots."""
    try:
        while telemetry_clients:
            redis = await _ensure_redis(request)
            snapshot = await gather_system_snapshot(request.app, redis)
            await _broadcast({"type": "metrics", "payload": snapshot})
            await asyncio.sleep(2.0)
    except asyncio.CancelledError:
        pass
    finally:
        global telemetry_task
        telemetry_task = None


async def _ensure_telemetry_loop(request: Request) -> None:
    """Start telemetry loop if not already running."""
    global telemetry_task
    async with telemetry_lock:
        if telemetry_task is None or telemetry_task.done():
            telemetry_task = asyncio.create_task(
                _telemetry_loop(request),
                name="system-telemetry-loop",
            )


async def _run_scan(request: Request) -> None:
    """Perform a one-off system diagnostics scan and broadcast results."""
    try:
        redis = await _ensure_redis(request)
        result = await run_system_scan(request.app, redis)
        await _broadcast({"type": "scan_result", "payload": result})
    finally:
        global scan_task
        scan_task = None


# ---------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------
@router.get("/status")
async def read_system_status(
    request: Request, redis: aioredis.Redis = Depends(get_redis)
) -> Dict[str, Any]:
    """Return current live system telemetry snapshot."""
    snapshot = await gather_system_snapshot(request.app, redis)
    return snapshot


@router.post("/scan")
async def trigger_system_scan(request: Request) -> Dict[str, Any]:
    """Trigger a background system diagnostic scan."""
    global scan_task
    async with scan_lock:
        if scan_task and not scan_task.done():
            return {"status": "scan_in_progress"}
        scan_task = asyncio.create_task(_run_scan(request), name="system-scan")
    return {"status": "scan_started"}


@router.post("/maintenance")
async def maintenance_toggle(
    request: Request,
    body: MaintenanceRequest,
) -> Dict[str, Any]:
    """Enable or disable system maintenance mode."""
    redis = await _ensure_redis(request)
    await set_maintenance_mode(redis, body.enabled)
    await _broadcast({"type": "maintenance_toggle", "payload": {"enabled": body.enabled}})
    snapshot = await gather_system_snapshot(request.app, redis)
    return {"status": "ok", "maintenance": body.enabled, "snapshot": snapshot}


@router.get("/fleet")
async def fleet_status(
    request: Request,
    redis: aioredis.Redis = Depends(get_redis),
) -> List[Dict[str, Any]]:
    """Return simulated or cached fleet node telemetry."""
    snapshot = await gather_system_snapshot(request.app, redis)
    fleet = await build_fleet_snapshot(redis, snapshot)
    return fleet


@router.websocket("/ws/system/telemetry")
async def system_telemetry_socket(websocket: WebSocket, request: Request) -> None:
    """WebSocket endpoint for continuous system telemetry stream."""
    await websocket.accept()
    telemetry_clients.add(websocket)

    redis = await _ensure_redis(request)
    initial_snapshot = await gather_system_snapshot(request.app, redis)
    await websocket.send_bytes(orjson.dumps({"type": "metrics", "payload": initial_snapshot}))

    warnings = await load_warnings(redis)   # ✅ replaced call
    if warnings:
        await websocket.send_bytes(orjson.dumps({"type": "warnings", "payload": warnings}))

    await _ensure_telemetry_loop(request)

    try:
        while True:
            # Keep connection alive — we don’t expect messages from clients.
            await websocket.receive_text()
    except WebSocketDisconnect:
        telemetry_clients.discard(websocket)
        if not telemetry_clients and telemetry_task:
            telemetry_task.cancel()
    except Exception:
        telemetry_clients.discard(websocket)
        if not telemetry_clients and telemetry_task:
            telemetry_task.cancel()
        await websocket.close()
