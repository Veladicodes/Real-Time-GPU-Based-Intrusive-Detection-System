"""FastAPI application entrypoint for RT-GIDS backend."""

import asyncio
import logging
import os
from datetime import datetime, timezone
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

try:
    import redis.asyncio as aioredis
except ImportError:
    import aioredis

# Observability & metrics
from app.observability import REQUESTS, metrics_response

# Core services
from app.services.ml_service import MLService
from app.services.model_service import ModelService
from app.services.narrative_service import NarrativeService
from app.services.summary_service import SummaryService
from app.services.telemetry_service import TelemetryService

# Routers
from app.routers import (
    dashboard_metrics as dashboard,
    feature_importance,
    logs,
    metrics,
    model,
    shap_explain,
    summary,
    threats,
)
from app.routers.model_insights import (
    insights_ws_manager,
    limiter as model_insights_limiter,
    router as model_insights_router,
    ws_router as model_insights_ws_router,
    register_rate_limit_handler,  # ✅ helper instead of manual add
)
from app.routers.system_diagnostics import router as system_router

from slowapi.middleware import SlowAPIMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

# ----------------------------------------------------------
# Application setup
# ----------------------------------------------------------

app = FastAPI(title="RT-GIDS Tier-0 Backend", version="1.0")
telemetry_logger = logging.getLogger("rtgids.telemetry")

# ----------------------------------------------------------
# Environment variables
# ----------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    REDIS_URL = (
        "redis://host.docker.internal:6379/0"
        if os.path.exists("/.dockerenv")
        else "redis://localhost:6379/0"
    )

MODELS_DIR = os.getenv("RTGIDS_MODELS_DIR", "/data/models")

# ----------------------------------------------------------
# Initialize core services
# ----------------------------------------------------------
telemetry = TelemetryService(REDIS_URL, simulate=False)
ml_service = MLService(MODELS_DIR)
model_service = ModelService(MODELS_DIR).load()
summary_service = SummaryService()
narrative_service = NarrativeService(summary_service=summary_service)

# Redis client holder
redis_client: aioredis.Redis | None = None

# Store globally accessible services in app state
app.state.telemetry = telemetry
app.state.telemetry_service = telemetry
app.state.ml_service = ml_service
app.state.model_service = model_service
app.state.summary_service = summary_service
app.state.narrative_service = narrative_service

# ----------------------------------------------------------
# Initialize Limiter (Critical Fix)
# ----------------------------------------------------------
try:
    # Try connecting Limiter with Redis if available
    app.state.limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=REDIS_URL,  # will auto-fallback if not reachable
    )
    app.state.limiter_enabled = True
    telemetry_logger.info("[Limiter] ✅ Initialized with Redis backend.")
except Exception as exc:
    telemetry_logger.warning("[Limiter] ⚠️ Falling back to in-memory limiter: %s", exc)
    app.state.limiter = Limiter(key_func=get_remote_address)
    app.state.limiter_enabled = False

# ----------------------------------------------------------
# Middleware setup
# ----------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach SlowAPI limiter middleware
app.add_middleware(SlowAPIMiddleware)
app.state.rate_limiter = model_insights_limiter
app.state.model_insights_ws_manager = insights_ws_manager

# ✅ Proper rate-limit handler registration (clean)
register_rate_limit_handler(app)


@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    """Measure latency and increment Prometheus metrics per request."""
    start = perf_counter()
    response = await call_next(request)
    duration = perf_counter() - start

    REQUESTS.labels(
        endpoint=request.url.path,
        method=request.method,
        status=str(response.status_code),
    ).inc()

    response.headers["X-Request-Duration"] = f"{duration:.6f}"
    return response


# ----------------------------------------------------------
# Lifecycle events
# ----------------------------------------------------------

async def init_redis_with_retry(
    url: str, attempts: int = 5, delay: float = 3.0
) -> aioredis.Redis:
    """Create a Redis connection with retry logic."""
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            client = await aioredis.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                health_check_interval=30,
                socket_keepalive=True,
            )
            await client.ping()
            telemetry_logger.info("[Telemetry] ✅ Connected to Redis at %s", url)
            return client
        except Exception as exc:
            last_error = exc
            telemetry_logger.warning(
                "[Telemetry] ⚠️ Redis connection attempt %s/%s failed: %s",
                attempt,
                attempts,
                exc,
            )
            if attempt < attempts:
                await asyncio.sleep(delay)
    raise RuntimeError("Failed to connect to Redis after 5 attempts") from last_error


@app.on_event("startup")
async def startup_event():
    """Initialize background services."""
    global redis_client
    if redis_client is None:
        redis_client = await init_redis_with_retry(REDIS_URL)
        app.state.redis = redis_client
        telemetry.attach_redis_client(redis_client)

    await telemetry.startup()

    # ✅ Safe startup for ML worker
    try:
        ml_service.load()
        if not ml_service.worker_running:
            ml_service.start_worker()
    except Exception as exc:
        telemetry_logger.error("❌ ML Service startup failed: %s", exc)


@app.on_event("shutdown")
async def shutdown_event():
    """Clean shutdown for background workers."""
    await telemetry.shutdown()
    await ml_service.stop_worker()

    global redis_client
    if redis_client:
        try:
            await redis_client.close()
            telemetry_logger.info("[Redis] Connection closed cleanly")
        finally:
            redis_client = None


# ----------------------------------------------------------
# Routers & routes
# ----------------------------------------------------------
app.include_router(logs.router)
app.include_router(metrics.router, prefix="/api/metrics")
app.include_router(model.router)
app.include_router(feature_importance.router)
app.include_router(shap_explain.router)
app.include_router(summary.router)
app.include_router(threats.router)
app.include_router(dashboard.router)
app.include_router(model_insights_router)
app.include_router(model_insights_ws_router)
app.include_router(system_router)

# Prometheus metrics
app.add_route("/metrics", metrics_response)


# ----------------------------------------------------------
# Health check endpoint
# ----------------------------------------------------------
@app.get("/api/health")
async def health():
    """Simple service heartbeat with latency metrics."""
    start = perf_counter()
    latency_ms: float | None = None

    if redis_client is not None:
        try:
            await redis_client.ping()
            latency_ms = (perf_counter() - start) * 1_000
        except Exception:
            latency_ms = None

    backend_time = datetime.utcnow().isoformat() + "Z"
    return {
        "status": "ok",
        "service": "RT-GIDS",
        "latency_ms": round(latency_ms, 2) if latency_ms is not None else None,
        "backend_time": backend_time,
    }


# ----------------------------------------------------------
# Factory for uvicorn --factory compatibility
# ----------------------------------------------------------
def create_app():
    """Return FastAPI app instance for test or factory mode."""
    return app
