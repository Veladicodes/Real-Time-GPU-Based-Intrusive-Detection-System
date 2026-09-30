"""Model Insights router exposing feature analytics, SHAP explanations, and AI summaries."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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
import numpy as np
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    import aioredis  # type: ignore

import httpx
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

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

FEATURE_DISTRIBUTION_PREFIX = "model:feature_distribution:"
SHAP_JOB_PREFIX = "shap:job:"
SUMMARY_JOB_PREFIX = "model:summary:"
SUMMARY_LAST_KEY = "model:summary:last"

router = APIRouter(prefix="/api/model", tags=["Model Insights"])
ws_router = APIRouter()

# ---------------------------------------------------------------
# Rate Limiting Setup
# ---------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, storage_uri=REDIS_URL, default_limits=["100/minute"])


def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom JSON handler for rate-limit violations."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please retry shortly."},
    )


# ---------------------------------------------------------------
# WebSocket Manager
# ---------------------------------------------------------------
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


# ---------------------------------------------------------------
# Utility Helpers
# ---------------------------------------------------------------
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _redis_json_response(raw: str | None) -> Dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


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
    counts, bin_edges = np.histogram(clipped, bins=bins)
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
        {
            "type": "feature_importance_update",
            "payload": importance.dict()["features"],
        }
    )


# ---------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------
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


# ---------------------------------------------------------------
# SHAP Explainability
# ---------------------------------------------------------------
async def _resolve_instances(request: ShapExplainRequest) -> List[Dict[str, Any]]:
    if request.instances:
        return [instance.features for instance in request.instances]
    bundle = load_model_bundle()
    frame = load_validation_frame(bundle, sample_size=128)
    if frame is not None:
        return frame.iloc[:5].to_dict(orient="records")
    features = bundle.feature_names if bundle else []
    if not features:
        raise HTTPException(status_code=400, detail="Unable to infer features for SHAP explanation")
    return [{feature: 0.0 for feature in features}]


async def _store_shap_job(redis: aioredis.Redis, job_id: str, payload: Dict[str, Any]) -> None:
    await redis.set(f"{SHAP_JOB_PREFIX}{job_id}", encode_json(payload))


async def _handle_shap_job(job_id: str, request_payload: ShapExplainRequest, app: Any) -> None:
    redis: aioredis.Redis | None = getattr(app.state, "redis", None)
    if redis is None:
        redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    created_at = _utc_now().isoformat()
    base_job = {
        "id": job_id,
        "status": "running",
        "created_at": created_at,
        "completed": False,
        "percent": 5.0,
    }
    await _store_shap_job(redis, job_id, base_job)
    await insights_ws_manager.broadcast({"type": "shap_progress", "job_id": job_id, "percent": 5})

    try:
        instances = await _resolve_instances(request_payload)
        bundle = load_model_bundle()
        result: ShapComputationResult = await run_in_executor(
            compute_shap_values,
            instances,
            bundle=bundle,
        )

        explanations: List[Dict[str, Any]] = []
        instance_ids = [
            inst.instance_id if request_payload.instances else None
            for inst in (request_payload.instances or [])
        ]
        for idx, shap_values in enumerate(result.shap_values):
            explanations.append(
                {
                    "instance_id": instance_ids[idx] if idx < len(instance_ids) else f"instance_{idx}",
                    "shap_values": shap_values,
                    "base_value": result.base_values[idx] if idx < len(result.base_values) else None,
                    "predicted_score": result.predictions[idx] if idx < len(result.predictions) else None,
                }
            )

        final_payload = {
            "id": job_id,
            "status": "completed",
            "created_at": created_at,
            "completed": True,
            "percent": 100.0,
            "feature_order": result.feature_order,
            "explanations": explanations,
        }
        await _store_shap_job(redis, job_id, final_payload)
        await insights_ws_manager.broadcast({"type": "shap_done", "job_id": job_id, "result": final_payload})
    except SHAPUnavailableError as exc:
        error_payload = {
            "id": job_id,
            "status": "error",
            "created_at": created_at,
            "completed": True,
            "percent": 100.0,
            "message": str(exc),
        }
        await _store_shap_job(redis, job_id, error_payload)
        await insights_ws_manager.broadcast({"type": "shap_error", "job_id": job_id, "message": str(exc)})
    except Exception as exc:
        error_payload = {
            "id": job_id,
            "status": "error",
            "created_at": created_at,
            "completed": True,
            "percent": 100.0,
            "message": f"Unexpected error during SHAP computation: {exc}",
        }
        await _store_shap_job(redis, job_id, error_payload)
        await insights_ws_manager.broadcast(
            {"type": "shap_error", "job_id": job_id, "message": str(exc)}
        )


@router.post(
    "/shap/explain",
    response_model=ShapJobStatus,
    dependencies=[Depends(verify_jwt_token)],
)
@limiter.limit("1/10seconds")
async def enqueue_shap_explain(
    request_payload: ShapExplainRequest,
    request: Request,
) -> ShapJobStatus:
    job_id = make_job_id("shap")
    created_at = _utc_now()
    asyncio.create_task(_handle_shap_job(job_id, request_payload, request.app))
    return ShapJobStatus(id=job_id, status="queued", created_at=created_at)


@router.get(
    "/shap/result/{job_id}",
    response_model=ShapResultResponse,
    dependencies=[Depends(verify_jwt_token)],
)
async def get_shap_result(job_id: str, redis: aioredis.Redis = Depends(get_redis)) -> ShapResultResponse:
    payload = _redis_json_response(await redis.get(f"{SHAP_JOB_PREFIX}{job_id}"))
    if not payload:
        raise HTTPException(status_code=404, detail="SHAP job not found")
    if "explanations" not in payload:
        payload.setdefault("explanations", [])
    return ShapResultResponse(
        id=payload.get("id", job_id),
        completed=bool(payload.get("completed")),
        explanations=payload.get("explanations", []),
        feature_order=payload.get("feature_order", []),
        created_at=datetime.fromisoformat(payload.get("created_at")),
    )


# ---------------------------------------------------------------
# AI Summary Generation
# ---------------------------------------------------------------
async def _generate_summary_text(signals: List[Dict[str, Any]], lookback_seconds: int) -> str:
    if not signals:
        return "Model has insufficient telemetry to produce a summary."

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            prompt = (
                "You are a concise cyber analyst. Given these model signals (top features and directionality), "
                "produce a 2-sentence summary describing the likely attack pattern, "
                "the most implicated ports/protocols, and an action recommendation."
            )
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                        "messages": [
                            {"role": "system", "content": prompt},
                            {
                                "role": "user",
                                "content": orjson.dumps(
                                    {"lookback_seconds": lookback_seconds, "signals": signals}
                                ).decode("utf-8"),
                            },
                        ],
                        "temperature": 0.3,
                        "max_tokens": 180,
                    },
                )
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"].strip()
                if content:
                    return content
        except Exception:
            pass

    top_features = ", ".join(f"{s['feature']} ({s['signal']})" for s in signals[:3])
    lookback_minutes = lookback_seconds // 60
    return (
        f"Past {lookback_minutes} minutes show elevated activity driven by {top_features or 'no dominant signals'}. "
        "Recommend tightening firewall rules on highlighted ports and monitoring anomalous IP chatter."
    )


async def _handle_summary_job(
    job_id: str,
    request_payload: SummaryRequest,
    app: Any,
) -> None:
    redis: aioredis.Redis | None = getattr(app.state, "redis", None)
    if redis is None:
        redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)

    created_at = _utc_now().isoformat()
    base_payload = {
        "id": job_id,
        "status": "running",
        "created_at": created_at,
        "completed": False,
        "percent": 5.0,
    }
    await redis.set(f"{SUMMARY_JOB_PREFIX}{job_id}", encode_json(base_payload))
    await insights_ws_manager.broadcast({"type": "summary_progress", "id": job_id, "percent": 5})

    try:
        feature_importance = await _get_feature_importance(redis)
        top = feature_importance.features[: request_payload.top_k_features]
        signals = [
            {
                "feature": item["name"],
                "signal": "rising" if item["normalized_score"] > 0.65 else "elevated",
                "score": item["normalized_score"],
            }
            for item in top
        ]
        summary_text = await _generate_summary_text(signals, request_payload.lookback_seconds)

        final_payload = {
            "id": job_id,
            "status": "completed",
            "created_at": created_at,
            "completed": True,
            "percent": 100.0,
            "summary_text": summary_text,
            "signals": signals,
        }
        encoded = encode_json(final_payload)
        await redis.set(f"{SUMMARY_JOB_PREFIX}{job_id}", encoded)
        await redis.set(SUMMARY_LAST_KEY, encoded)
        await insights_ws_manager.broadcast(
            {"type": "summary_done", "id": job_id, "summary_text": summary_text, "signals": signals}
        )
    except Exception as exc:
        error_payload = {
            "id": job_id,
            "status": "error",
            "created_at": created_at,
            "completed": True,
            "percent": 100.0,
            "message": str(exc),
            "summary_text": None,
            "signals": [],
        }
        await redis.set(f"{SUMMARY_JOB_PREFIX}{job_id}", encode_json(error_payload))
        await insights_ws_manager.broadcast(
            {"type": "summary_error", "id": job_id, "message": "Failed to generate AI summary"}
        )


@router.post(
    "/summary",
    response_model=SummaryResult,
    dependencies=[Depends(verify_jwt_token)],
)
@limiter.limit("1/10seconds")
async def generate_summary(
    payload: SummaryRequest,
    request: Request,
) -> SummaryResult:
    job_id = make_job_id("summary")
    created_at = _utc_now()
    asyncio.create_task(_handle_summary_job(job_id, payload, request.app))
    return SummaryResult(
        id=job_id,
        completed=False,
        summary_text=None,
        created_at=created_at,
        signals=[],
    )


@router.get(
    "/summary/{job_id}",
    response_model=SummaryResult,
    dependencies=[Depends(verify_jwt_token)],
)
async def get_summary(job_id: str, redis: aioredis.Redis = Depends(get_redis)) -> SummaryResult:
    payload = _redis_json_response(await redis.get(f"{SUMMARY_JOB_PREFIX}{job_id}"))
    if not payload:
        raise HTTPException(status_code=404, detail="Summary job not found")
    return SummaryResult(
        id=payload.get("id", job_id),
        completed=bool(payload.get("completed")),
        summary_text=payload.get("summary_text"),
        created_at=datetime.fromisoformat(payload.get("created_at")),
        signals=payload.get("signals", []),
    )


# ---------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------
@ws_router.websocket("/ws/model/insights")
async def websocket_model_insights(websocket: WebSocket) -> None:
    await _ensure_authorised_websocket(websocket)
    app = websocket.app
    redis: aioredis.Redis | None = getattr(app.state, "redis", None)
    if redis is None:
        redis = await aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)
    await insights_ws_manager.connect(websocket)
    try:
        status = await _get_cached_status(redis)
        await websocket.send_text(json.dumps({"type": "model_status", "payload": status.dict()}))

        last_summary_raw = await redis.get(SUMMARY_LAST_KEY)
        if last_summary_raw:
            summary_payload = _redis_json_response(last_summary_raw)
            if summary_payload:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "summary_done",
                            "id": summary_payload.get("id"),
                            "summary_text": summary_payload.get("summary_text"),
                            "signals": summary_payload.get("signals", []),
                        }
                    )
                )

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await insights_ws_manager.disconnect(websocket)
    except Exception:
        await insights_ws_manager.disconnect(websocket)
        await websocket.close()


# ---------------------------------------------------------------
# ✅ FIXED: Proper global registration helper
# ---------------------------------------------------------------
from fastapi import FastAPI

def register_rate_limit_handler(app: FastAPI) -> None:
    """
    Correctly register rate-limit handler and expose limiter to FastAPI app.
    Must be called once in main.py after creating the app.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
