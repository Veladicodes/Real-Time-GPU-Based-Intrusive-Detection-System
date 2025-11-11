"""Operational metrics endpoints."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict

import psutil
from fastapi import APIRouter, Depends, HTTPException, Request

from app.services.telemetry_service import TelemetryService

try:  # Optional GPU support
    import torch
except Exception:  # pragma: no cover - torch is optional
    torch = None

router = APIRouter()


def get_telemetry(request: Request) -> TelemetryService:
    telemetry = getattr(request.app.state, "telemetry", None)
    if telemetry is None:
        raise HTTPException(status_code=503, detail="Telemetry service unavailable")
    return telemetry


def _detect_gpu() -> Dict[str, Any]:
    gpu_available = False
    gpu_name: str = "Unavailable"
    if torch is not None:
        try:
            gpu_available = torch.cuda.is_available()
            if gpu_available:
                gpu_name = torch.cuda.get_device_name(0)
        except Exception:  # pragma: no cover - GPU detection failures
            gpu_available = False
            gpu_name = "Unavailable"

    return {
        "gpu_mode": "ON" if gpu_available else "OFF",
        "gpu_name": gpu_name if gpu_available else "None" if gpu_name == "Unavailable" else gpu_name,
    }


@router.get("/system")
async def system_metrics(request: Request) -> Dict[str, Any]:
    """Return consolidated system telemetry for diagnostics UI."""
    cpu_load = psutil.cpu_percent(interval=0.3)
    memory = psutil.virtual_memory()
    gpu_info = _detect_gpu()

    telemetry: TelemetryService | None = getattr(request.app.state, "telemetry", None)
    threat_snapshot: Dict[str, Any] = {}
    if telemetry is not None:
        try:
            threat_snapshot = await telemetry.threat_index()
        except Exception:
            threat_snapshot = {}

    return {
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "cpu_load": round(float(cpu_load), 2),
        "mem_util": round(float(memory.percent), 2),
        **gpu_info,
        "systems_online": 1,
        "warnings": int(threat_snapshot.get("count", 0) if threat_snapshot.get("status") == "warn" else 0),
        "maintenance": 0,
        "backend_latency": threat_snapshot.get("latency_ms", 42),
        "model_load": threat_snapshot.get("model_load_time", 64),
        "cache_hit": threat_snapshot.get("cache_hit_rate", 82),
    }


def _derive_threat_status(index: float) -> str:
    if index >= 80:
        return "critical"
    if index >= 50:
        return "warn"
    return "normal"


@router.get("/threat")
async def threat(
    telemetry: TelemetryService = Depends(get_telemetry),
) -> Dict[str, Any]:
    """Return threat index derived from telemetry cache."""
    snapshot = await telemetry.threat_index()
    count = int(snapshot.get("count", 0))

    index_raw = float(snapshot.get("threat_index") or 0.0)
    # Normalise to 0-100 scale if backend provided 0-1
    index = max(0.0, min(100.0, index_raw * 100 if index_raw <= 1 else index_raw))

    # Recompute index from alert count if telemetry wasn't available
    if index == 0 and count:
        index = min(100.0, float(count) * 8.5)

    status = snapshot.get("status") or _derive_threat_status(index)

    return {
        "index": round(index, 2),
        "count": count,
        "status": status,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
