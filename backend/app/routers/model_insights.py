"""Model Insights router exposing feature analytics, SHAP explanations, and AI summaries."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
import orjson
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    import aioredis  # type: ignore

from app.dependencies import get_redis
from app.schemas.model_insight_schemas import (
    FeatureDistributionResponse,
    FeatureImportanceResponse,
    ModelStatusResponse,
    ShapExplainRequest,
    ShapJobStatus,
    ShapResultResponse,
    SummaryRequest,
    SummaryResult,
)
from app.security import decode_token, verify_jwt_token
from app.utils.model_loader import MODEL_STATUS_CACHE_KEY, bundle_to_status, load_model_bundle
from app.utils.shap_helpers import (
    FEATURE_IMPORTANCE_CACHE_KEY,
    SHAPUnavailableError,
    ShapComputationResult,
    compute_feature_importance,
    compute_shap_values,
    encode_json,
    load_validation_frame,
    make_job_id,
    run_in_executor,
)

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
FEATURE_DISTRIBUTION_PREFIX = "model:feature_distribution:"
SHAP_JOB_PREFIX = "shap:job:"
SUMMARY_JOB_PREFIX = "model:summary:"
SUMMARY_LAST_KEY = "model:summary:last"

router = APIRouter(prefix="/api/model", tags=["Model Insights"])
ws_router = APIRouter()
limiter = Limiter(key_func=get_remote_address, storage_uri=REDIS_URL, default_limits=[])


# -----------------------------------------------------------------------------
# Rate limit handler
# -----------------------------------------------------------------------------
def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return consistent response for rate-limit breaches."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please retry shortly."},
    )


# -----------------------------------------------------------------------------
# WebSocket manager
# -----------------------------------------------------------------------------
class InsightsWebsocketManager:
    """Track WebSocket clients interested in model insight updates."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        if not self._connections:
            return
        payload = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        async with self._lock:
            for connection in list(self._connections):
                try:
                    await connection.send_text(payload)
                except Exception:
                    stale.append(connection)
            for connection in stale:
                self._connections.discard(connection)


insights_ws_manager = InsightsWebsocketManager()


# -----------------------------------------------------------------------------
# Utility helpers
# -----------------------------------------------------------------------------
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _redis_json_response(raw: str | None) -> Dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# -----------------------------------------------------------------------------
# Core cached / compute helpers
# -----------------------------------------------------------------------------
async def _cache_model_status(redis: aioredis.Redis) -> ModelStatusResponse:
    bundle = load_model_bundle()
    payload = bundle_to_status(bundle)
    await redis.set(MODEL_STATUS_CACHE_KEY, orjson.dumps(payload))
    return ModelStatusResponse(**payload)


async def _get_cached_status(redis: aioredis.Redis) -> ModelStatusResponse:
    cached = await redis.get(MODEL_STATUS_CACHE_KEY)
    if cached:
        payload = _redis_json_response(cached)
        if payload:
            return ModelStatusResponse(**payload)
    return await _cache_model_status(redis)


async def _get_feature_importance(redis: aioredis.Redis) -> FeatureImportanceResponse:
    cached = await redis.get(FEATURE_IMPORTANCE_CACHE_KEY)
    bundle = load_model_bundle()
    model_name = bundle.name if bundle else "unknown"
    if cached:
        payload = _redis_json_response(cached)
        if payload and isinstance(payload.get("features"), list):
            return FeatureImportanceResponse(model=model_name, features=payload["features"])

    features = compute_feature_importance(bundle)
    await redis.set(
        FEATURE_IMPORTANCE_CACHE_KEY,
        orjson.dumps({"model": model_name, "features": features}),
    )
    return FeatureImportanceResponse(model=model_name, features=features)


async def _compute_distribution(
    feature: str,
    *,
    samples: int,
    redis: aioredis.Redis,
) -> FeatureDistributionResponse:
    cache_key = f"{FEATURE_DISTRIBUTION_PREFIX}{feature}:{samples}"
    cached = await redis.get(cache_key)
    if cached:
        payload = _redis_json_response(cached)
        if payload:
            return FeatureDistributionResponse(**payload)

    bundle = load_model_bundle()
    frame = load_validation_frame(bundle, sample_size=max(samples, 200))
    if frame is None or feature not in frame.columns:
        raise HTTPException(status_code=404, detail=f"No distribution data available for feature '{feature}'")

    series = frame[feature].dropna()
    clipped = series.clip(lower=series.quantile(0.01), upper=series.quantile(0.99))
    bins = min(30, max(10, int(len(clipped) ** 0.5)))
    counts, bin_edges = np.histogram(clipped, bins=bins)  # type: ignore[name-defined]
    percentiles = {p: float(clipped.quantile(p / 100)) for p in (10, 25, 50, 75, 90)}
    statistics = {
        "mean": float(clipped.mean()),
        "std": float(clipped.std()),
        "min": float(clipped.min()),
        "max": float(clipped.max()),
    }
    response = FeatureDistributionResponse(
        feature=feature,
        histogram_bins=[float(edge) for edge in bin_edges[:-1]],
        counts=[float(value) for value in counts],
        sample_percentiles=percentiles,
        statistics=statistics,
    )
    await redis.set(cache_key, orjson.dumps(response.dict()))
    return response


async def _ensure_authorised_websocket(websocket: WebSocket) -> None:
    raw_header = websocket.headers.get("Authorization")
    token: Optional[str] = None
    if raw_header and raw_header.lower().startswith("bearer "):
        token = raw_header.split(" ", 1)[1]
    else:
        token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)


async def _broadcast_feature_importance(redis: aioredis.Redis) -> None:
    importance = await _get_feature_importance(redis)
    await insights_ws_manager.broadcast(
        {"type": "feature_importance_update", "payload": importance.dict()["features"]}
    )


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.get(
    "/status",
    response_model=ModelStatusResponse,
    summary="Return current model status and metadata.",
    dependencies=[Depends(verify_jwt_token)],
)
async def get_model_status(redis: aioredis.Redis = Depends(get_redis)) -> ModelStatusResponse:
    return await _get_cached_status(redis)


@router.get(
    "/feature-importance",
    response_model=FeatureImportanceResponse,
    dependencies=[Depends(verify_jwt_token)],
)
async def get_feature_importance(redis: aioredis.Redis = Depends(get_redis)) -> FeatureImportanceResponse:
    return await _get_feature_importance(redis)


@router.get(
    "/feature-distribution",
    response_model=FeatureDistributionResponse,
    dependencies=[Depends(verify_jwt_token)],
)
async def get_feature_distribution(
    feature: str = Query(..., description="Feature name to sample distribution for."),
    samples: int = Query(500, ge=100, le=5000),
    redis: aioredis.Redis = Depends(get_redis),
) -> FeatureDistributionResponse:
    return await _compute_distribution(feature, samples=samples, redis=redis)


# -----------------------------------------------------------------------------
# SHAP and Summary jobs (unchanged core logic)
# -----------------------------------------------------------------------------
# (keep your SHAP, summary, and websocket functions unchanged — they remain valid)
# -----------------------------------------------------------------------------

# -------------------------------------------------------------------------
# Safe global handler registration hook (to be called from main.py)
# -------------------------------------------------------------------------
def register_rate_limit_handler(app):
    """Register RateLimitExceeded handler globally (correct way)."""
    try:
        app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    except Exception as e:
        import logging
        logging.warning(f"Failed to register rate-limit handler: {e}")
