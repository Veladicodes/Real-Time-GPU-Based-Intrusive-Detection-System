"""Model metadata, inference, and management endpoints (RT-GIDS Tier-0)."""

from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import Any, Dict
import torch

from app.security import verify_jwt_token
from app.services.ml_service import MLService
from app.services.model_service import ModelService

router = APIRouter(prefix="/api", tags=["Model"])

# -----------------------------------------------------------------------------
# Internal service getters
# -----------------------------------------------------------------------------
def _get_ml_service(request: Request) -> MLService:
    svc = getattr(request.app.state, "ml_service", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="ML service unavailable")
    return svc


def _get_model_service(request: Request) -> ModelService:
    svc = getattr(request.app.state, "model_service", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="Model service unavailable")
    return svc


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.get("/model-info", summary="Return loaded model metadata")
async def model_info(request: Request) -> Dict[str, Any]:
    """Lightweight metadata for dashboard display."""
    try:
        return _get_model_service(request).info()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Metadata retrieval failed: {exc}") from exc


@router.get("/model-importance", summary="Return feature importance or fallback weights")
async def model_importance(request: Request) -> Dict[str, Any]:
    """Expose ranked feature importance values for explainability layers."""
    model_service = _get_model_service(request)
    try:
        importance = getattr(model_service, "get_feature_importance", None)
        if callable(importance):
            data = importance()
        elif hasattr(model_service, "metrics") and "feature_importance" in model_service.metrics:
            data = model_service.metrics.get("feature_importance")
        else:
            raise ValueError("No feature importance data available")
        return {"status": "ok", "importance": data}
    except Exception as exc:
        return {"status": "unavailable", "reason": str(exc)}


@router.post("/model-predict", summary="Synchronous prediction endpoint")
async def model_predict(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Perform a quick blocking inference."""
    try:
        result = _get_model_service(request).predict(payload)
        return {"status": "ok", "result": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/model-score", summary="Asynchronous GPU inference", status_code=status.HTTP_200_OK)
async def model_score(
    request: Request,
    payload: Dict[str, Any],
    _: Dict[str, Any] = Depends(verify_jwt_token),
) -> Dict[str, Any]:
    """Run async GPU inference via MLService with JWT validation."""
    try:
        ml_service = _get_ml_service(request)
        return await ml_service.predict_async(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Async prediction failed: {exc}") from exc


@router.get("/model-summary", summary="Return high-level model statistics")
async def model_summary(request: Request) -> Dict[str, Any]:
    """Summarize current model runtime state."""
    try:
        return _get_ml_service(request).summary()
    except Exception as exc:
        return {"status": "unavailable", "reason": str(exc)}


# -----------------------------------------------------------------------------
# Enhanced dashboard endpoint (FIXED)
# -----------------------------------------------------------------------------
@router.get("/model/summary", summary="Return dashboard-friendly model metadata")
async def model_summary_dashboard(request: Request) -> Dict[str, Any]:
    """Expose lightweight model summary for the Model Insights and AI Core dashboard."""

    # --- Safe defaults ---
    fallback = {
        "model_name": "Model unavailable",
        "features": [],
        "patterns_detected": 0,
        "incidents_logged": 0,
        "precision": 0.0,
        "recall": 0.0,
        "f1_score": 0.0,
        "gpu_mode": "ON" if torch.cuda.is_available() else "OFF",
    }

    # --- Gather info from services (with isolation) ---
    try:
        info = _get_model_service(request).info()
    except Exception:
        info = {}

    try:
        summary = _get_ml_service(request).summary()
    except Exception:
        summary = {}

    # --- Determine feature set ---
    features = []
    if isinstance(summary.get("feature_importance"), list):
        features = summary["feature_importance"]
    elif isinstance(info.get("features"), list) and info["features"]:
        features = [{"name": f, "importance": round(100 / len(info["features"]), 2)} for f in info["features"]]

    # --- Merge outputs with fallbacks ---
    return {
        "model_name": info.get("model_path") or summary.get("model") or fallback["model_name"],
        "features": features or fallback["features"],
        "patterns_detected": summary.get("patterns_detected", fallback["patterns_detected"]),
        "incidents_logged": summary.get("incidents_logged", fallback["incidents_logged"]),
        "precision": summary.get("precision", fallback["precision"]),
        "recall": summary.get("recall", fallback["recall"]),
        "f1_score": summary.get("f1_score", fallback["f1_score"]),
        "gpu_mode": fallback["gpu_mode"],
    }


@router.post("/model-reload", summary="Force reload model artifacts", status_code=status.HTTP_202_ACCEPTED)
async def model_reload(
    request: Request,
    _: Dict[str, Any] = Depends(verify_jwt_token),
) -> Dict[str, str]:
    """Reload and restart MLService model worker."""
    ml_service = _get_ml_service(request)
    try:
        ml_service.load()
        ml_service.start_worker()
        return {"status": "reloaded"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reload failed: {exc}") from exc
