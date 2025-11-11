"""Dashboard metrics endpoint aggregating threat, system, and model telemetry."""

from __future__ import annotations

import asyncio
import subprocess
import time
from datetime import datetime
from typing import Any, Dict, Optional

import psutil
from fastapi import APIRouter, Depends, Request

try:
    from redis.asyncio import Redis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - legacy fallback
    from aioredis import Redis  # type: ignore

from app.dependencies import get_redis
from app.services.narrative_service import NarrativeService
from app.services.summary_service import SummaryService

router = APIRouter(tags=["Dashboard Metrics"])

summary_service = SummaryService()
narrative_service = NarrativeService(summary_service=summary_service)


async def _collect_threat_metrics(request: Request, redis: Redis) -> Dict[str, Any]:
    telemetry = getattr(request.app.state, "telemetry", None)
    if telemetry is not None:
        try:
            snapshot = await telemetry.threat_index()
            if snapshot:
                return {
                    "index": float(snapshot.get("threat_index", 0.0)),
                    "count": int(snapshot.get("count", 0)),
                    "status": snapshot.get("status", "normal"),
                }
        except Exception:
            pass

    try:
        raw_index = await redis.get("threat_index")
        raw_count = await redis.get("attack_count")
        index_value = float(raw_index) if raw_index is not None else 0.0
        return {
            "index": index_value,
            "count": int(raw_count) if raw_count is not None else 0,
            "status": "critical" if index_value >= 80 else "high" if index_value >= 60 else "normal",
        }
    except Exception:
        return {"index": 0.0, "count": 0, "status": "unknown"}


async def _collect_system_metrics(redis: Redis) -> Dict[str, Any]:
    memory = psutil.virtual_memory()
    cpu_percent = psutil.cpu_percent(interval=None)
    latency = await _measure_latency(redis)
    gpu_stats = await _query_gpu_stats()
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory.percent,
        "memory_used": memory.used,
        "memory_total": memory.total,
        "gpu_util": gpu_stats.get("util"),
        "gpu_memory_used": gpu_stats.get("mem_used"),
        "gpu_memory_total": gpu_stats.get("mem_total"),
        "uptime_sec": time.time() - psutil.boot_time(),
        "redis_latency_ms": latency,
    }


async def _measure_latency(redis: Redis) -> Optional[float]:
    try:
        start = time.perf_counter()
        await redis.ping()
        return (time.perf_counter() - start) * 1_000
    except Exception:
        return None


async def _query_gpu_stats() -> Dict[str, Optional[float]]:
    def _run() -> Dict[str, Optional[float]]:
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=utilization.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                check=False,
            )
            output = (result.stdout or "").strip()
            if not output:
                return {"util": None, "mem_used": None, "mem_total": None}
            util, mem_used, mem_total = [part.strip() for part in output.split(",")]
            return {
                "util": float(util) if util else None,
                "mem_used": float(mem_used) if mem_used else None,
                "mem_total": float(mem_total) if mem_total else None,
            }
        except FileNotFoundError:
            return {"util": None, "mem_used": None, "mem_total": None}
        except Exception:
            return {"util": None, "mem_used": None, "mem_total": None}

    return await asyncio.to_thread(_run)


async def _collect_redis_metrics(redis: Redis) -> Dict[str, Any]:
    try:
        info = await redis.info(section="default")
    except Exception as exc:
        return {"error": str(exc)}

    hits = info.get("keyspace_hits", 0)
    misses = info.get("keyspace_misses", 0)
    ops = info.get("instantaneous_ops_per_sec", 0)
    hit_rate = hits / max(hits + misses, 1)
    return {
        "connected_clients": info.get("connected_clients"),
        "used_memory_human": info.get("used_memory_human"),
        "ops_per_sec": ops,
        "hit_rate": hit_rate,
        "keyspace": info.get("db0", {}).get("keys") if isinstance(info.get("db0"), dict) else None,
    }


async def _collect_model_metrics(request: Request) -> Dict[str, Any]:
    ml_service = getattr(request.app.state, "ml_service", None)
    model_service = getattr(request.app.state, "model_service", None)

    if model_service is not None:
        try:
            info = model_service.info()
            return {
                "name": info.get("model_path"),
                "features": len(info.get("features", [])),
                "status": "loaded",
            }
        except Exception:
            pass

    if ml_service is not None:
        summary = ml_service.summary()
        model_obj = getattr(ml_service, "model", None)
        feature_count = getattr(model_obj, "n_features_in_", None) if model_obj is not None else None
        if feature_count is None and model_obj is not None and hasattr(model_obj, "feature_names_in_"):
            feature_count = len(model_obj.feature_names_in_)
        return {
            "name": summary.get("path") or summary.get("model"),
            "status": summary.get("status", "unknown"),
            "features": feature_count,
        }

    return {"name": None, "status": "unavailable", "features": None}


@router.get("/api/dashboard/metrics")
async def get_dashboard_metrics(
    request: Request,
    redis: Redis = Depends(get_redis),
    minutes: int = 5,
) -> Dict[str, Any]:
    """
    Aggregate threat, system, Redis, model, and summary insights in a single payload.

    Intended for the real-time dashboard view. Tail latency kept low by relying on cached
    telemetry where available and limiting Redis calls.
    """
    threat_metrics, system_metrics, redis_metrics, model_metrics = await asyncio.gather(
        _collect_threat_metrics(request, redis),
        _collect_system_metrics(redis),
        _collect_redis_metrics(redis),
        _collect_model_metrics(request),
    )

    summary_stats = await summary_service.get_summary(redis, minutes=minutes)
    narrative = await narrative_service.generate(redis, minutes=minutes)

    return {
        "threat": threat_metrics,
        "system": system_metrics,
        "redis": redis_metrics,
        "model": model_metrics,
        "summary": {
            **summary_stats,
            "narrative": narrative,
        },
        "meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "minutes": minutes,
        },
    }

