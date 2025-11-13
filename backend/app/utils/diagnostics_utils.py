"""System diagnostics helpers for RT-GIDS."""

from __future__ import annotations

import asyncio
import socket
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import orjson
import psutil

from app.utils.gpu_helpers import GPUStats, get_gpu_stats

WARN_CPU_PERCENT = 90.0
WARN_MEM_PERCENT = 85.0
WARN_DISK_FREE_PERCENT = 10.0
WARN_REDIS_LATENCY_MS = 150.0

MAINTENANCE_KEY = "system:maintenance"
WARNINGS_KEY = "system:warnings"

_PROCESS_START = time.perf_counter()


def uptime_human() -> str:
    """Return process uptime as HH:MM:SS string."""
    seconds = max(0.0, time.perf_counter() - _PROCESS_START)
    hours, remainder = divmod(int(seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


async def fetch_maintenance(redis) -> bool:
    value = await redis.get(MAINTENANCE_KEY)
    return str(value).lower() in {"1", "true", "yes", "on"}


async def set_maintenance(redis, enabled: bool) -> None:
    await redis.set(MAINTENANCE_KEY, "1" if enabled else "0")


async def gather_cache_hit(redis) -> float:
    info = await redis.info(section="stats")
    hits = float(info.get("keyspace_hits", 0))
    misses = float(info.get("keyspace_misses", 0))
    total = hits + misses
    if total <= 0:
        return 0.0
    return round((hits / total) * 100.0, 2)


async def ping_redis(redis) -> Tuple[bool, float]:
    """Return redis connectivity and latency in milliseconds."""
    start = time.perf_counter()
    try:
        await redis.ping()
    except Exception:
        return False, float("inf")
    latency_ms = (time.perf_counter() - start) * 1_000.0
    return True, round(latency_ms, 2)


def disk_warning() -> Tuple[float, float]:
    usage = psutil.disk_usage("/")
    free_percent = (usage.free / usage.total) * 100.0 if usage.total else 0.0
    return round(free_percent, 2), round(usage.free / (1024 * 1024 * 1024), 2)


def collect_cpu_memory() -> Tuple[float, float, float]:
    cpu_percent = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return (
        float(cpu_percent),
        float(memory.percent),
        float((swap.percent if hasattr(swap, "percent") else 0.0)),
    )


def collect_gpu_stats() -> GPUStats:
    return get_gpu_stats()


async def compute_warnings(
    *,
    cpu: float,
    memory: float,
    redis_ok: bool,
    redis_latency: float,
    disk_free_percent: float,
    disk_free_gb: float,
) -> List[str]:
    warnings: List[str] = []
    if cpu >= WARN_CPU_PERCENT:
        warnings.append(f"High CPU load detected ({cpu:.1f}%).")
    if memory >= WARN_MEM_PERCENT:
        warnings.append(f"Elevated memory utilisation ({memory:.1f}%).")
    if not redis_ok:
        warnings.append("Redis connection lost.")
    elif redis_latency > WARN_REDIS_LATENCY_MS:
        warnings.append(f"Redis latency elevated ({redis_latency:.0f}ms).")
    if disk_free_percent <= WARN_DISK_FREE_PERCENT:
        warnings.append(f"Low disk space: {disk_free_percent:.1f}% free ({disk_free_gb:.1f} GB).")
    return warnings


async def store_warnings(redis, warnings: List[str]) -> None:
    payload = orjson.dumps({"warnings": warnings, "timestamp": datetime.utcnow().isoformat()})
    await redis.set(WARNINGS_KEY, payload.decode("utf-8"))


async def load_warnings(redis) -> List[str]:
    raw = await redis.get(WARNINGS_KEY)
    if not raw:
        return []
    try:
        payload = orjson.loads(raw)
        return list(payload.get("warnings", []))
    except Exception:
        return []


async def gather_system_snapshot(app, redis) -> Dict[str, Any]:
    cpu_percent, mem_percent, _ = collect_cpu_memory()
    gpu_stats = collect_gpu_stats()
    disk_percent_free, disk_free_gb = disk_warning()
    redis_ok, redis_latency = await ping_redis(redis)
    cache_hit = await gather_cache_hit(redis) if redis_ok else 0.0
    maintenance = await fetch_maintenance(redis)
    warnings = await compute_warnings(
        cpu=cpu_percent,
        memory=mem_percent,
        redis_ok=redis_ok,
        redis_latency=redis_latency,
        disk_free_percent=disk_percent_free,
        disk_free_gb=disk_free_gb,
    )
    if warnings:
        await store_warnings(redis, warnings)
    else:
        await store_warnings(redis, [])

    model_load_ms = await estimate_model_load_ms(app)
    uptime = uptime_human()

    snapshot = {
        "uptime": uptime,
        "backend_latency_ms": redis_latency if redis_ok else None,
        "model_load_ms": model_load_ms,
        "cache_hit_percent": cache_hit,
        "cpu_load": round(cpu_percent, 2),
        "memory_util": round(mem_percent, 2),
        "gpu_util": round(gpu_stats.utilization, 2),
        "gpu_mem": round(gpu_stats.memory_used_mb, 2),
        "gpu_name": gpu_stats.name,
        "warnings": warnings,
        "systems_online": redis_ok,
        "maintenance_mode": maintenance,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disk_free_percent": disk_percent_free,
        "disk_free_gb": disk_free_gb,
    }
    return snapshot


async def estimate_model_load_ms(app) -> float:
    """Return a rough estimate for model load by timing a lightweight call."""
    model_service = getattr(app.state, "model_service", None)
    if model_service is None:
        return 0.0

    # Try to re-use cached results to avoid expensive reloads
    cached = getattr(app.state, "model_load_cache", None)
    if cached is not None:
        return float(cached)

    loop = asyncio.get_running_loop()
    start = time.perf_counter()
    try:
        await loop.run_in_executor(None, getattr(model_service, "load"))
    except Exception:
        return 0.0
    load_ms = (time.perf_counter() - start) * 1_000.0
    setattr(app.state, "model_load_cache", load_ms)
    return float(load_ms)


def build_fleet_snapshot() -> List[Dict[str, Any]]:
    """Return simulated fleet telemetry for now."""
    nodes = []
    base_latency = 25.0
    for idx in range(1, 5):
        latency = base_latency + idx * 6
        packet_rate = max(0, 160 - idx * 18)
        status = "online" if idx != 3 else "offline"
        if status == "offline":
            latency = None
            packet_rate = 0
        nodes.append(
            {
                "id": f"sensor-{idx}",
                "status": status,
                "latency_ms": latency,
                "packet_rate": packet_rate,
                "location": f"Edge-{idx}",
            }
        )
    return nodes


async def run_diagnostic_scan(app, redis) -> Dict[str, Any]:
    redis_ok, redis_latency = await ping_redis(redis)
    gpu_stats = collect_gpu_stats()
    disk_percent_free, disk_free_gb = disk_warning()
    network_ok = await check_network_stack()
    model_ok = await check_model_warmup(app)

    result = {
        "redis": {"ok": redis_ok, "latency_ms": redis_latency},
        "gpu": {
            "ok": gpu_stats.utilization >= 0.0,
            "name": gpu_stats.name,
            "utilization": gpu_stats.utilization,
            "memory_mb": gpu_stats.memory_used_mb,
        },
        "disk": {"ok": disk_percent_free > WARN_DISK_FREE_PERCENT, "free_percent": disk_percent_free, "free_gb": disk_free_gb},
        "network": {"ok": network_ok},
        "model": model_ok,
        "timestamp": datetime.utcnow().isoformat(),
    }
    return result


async def check_network_stack() -> bool:
    loop = asyncio.get_running_loop()

    def _socket_check() -> bool:
        try:
            socket.gethostbyname("localhost")
            return True
        except socket.error:
            return False

    return await loop.run_in_executor(None, _socket_check)


async def check_model_warmup(app) -> Dict[str, Any]:
    model_service = getattr(app.state, "model_service", None)
    if model_service is None or getattr(model_service, "model", None) is None:
        return {"ok": False, "detail": "Model not loaded"}

    loop = asyncio.get_running_loop()
    start = time.perf_counter()
    try:
        await loop.run_in_executor(
            None,
            lambda: getattr(model_service, "predict")({"feature": 0.0}),  # type: ignore[arg-type]
        )
    except Exception:
        return {"ok": False, "detail": "Warmup inference failed"}

    elapsed_ms = (time.perf_counter() - start) * 1_000.0
    return {"ok": True, "latency_ms": round(elapsed_ms, 2)}


