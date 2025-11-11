"""Model explainability endpoints leveraging SHAP when available."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, List, Mapping

import numpy as np
from fastapi import APIRouter, Body, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .feature_importance import FEATURE_IMPORTANCE_FILENAME, METRICS_FILENAME, get_models_dir

MODEL_FILENAME = "xgb_realtime_ids.joblib"

router = APIRouter(prefix="/api/model", tags=["Model Explainability"])


class ShapExplanation(BaseModel):
    """SHAP explanation for a single observation."""

    features: List[str] = Field(..., description="Ordered feature names aligned with SHAP values.")
    shap_values: List[float] = Field(..., description="Per-feature contribution to the model output.")
    base_value: float = Field(..., description="Expected value of the model (SHAP baseline).")
    prediction: float = Field(..., description="Model prediction probability for the positive class.")


def _feature_baselines() -> Dict[str, float]:
    """Attempt to load feature baselines (medians) from metrics.json if present."""
    models_dir = get_models_dir()
    metrics_path = models_dir / METRICS_FILENAME
    if not metrics_path.exists():
        return {}
    try:
        payload = metrics_path.read_text(encoding="utf-8")
        data = json.loads(payload)
    except Exception:  # pragma: no cover - metrics may be absent in CI
        return {}
    baselines = data.get("feature_medians") or data.get("baselines")
    if isinstance(baselines, Mapping):
        return {str(k): float(v) for k, v in baselines.items() if _is_number(v)}
    return {}


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


@lru_cache(maxsize=1)
def _load_feature_importance() -> Dict[str, float]:
    models_dir = get_models_dir()
    csv_path = models_dir / FEATURE_IMPORTANCE_FILENAME
    if csv_path.exists():
        content = csv_path.read_text(encoding="utf-8")
        features: List[str] = []
        importances: List[float] = []
        for line in content.splitlines():
            if not line.strip():
                continue
            parts = [segment.strip() for segment in line.split(",")]
            if len(parts) < 2:
                continue
            try:
                features.append(parts[0])
                importances.append(float(parts[1]))
            except ValueError:
                continue
        if features:
            return dict(zip(features, importances))
    metrics_path = models_dir / METRICS_FILENAME
    if metrics_path.exists():
        payload = metrics_path.read_text(encoding="utf-8")
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            data = {}
        importance_data = data.get("feature_importance") or data.get("importance")
        if isinstance(importance_data, list):
            features = []
            importances = []
            for item in importance_data:
                if isinstance(item, dict):
                    name = item.get("feature") or item.get("name")
                    value = item.get("importance") or item.get("value")
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    name, value = item[0], item[1]
                else:
                    continue
                if not isinstance(name, str):
                    continue
                try:
                    features.append(name)
                    importances.append(float(value))
                except (TypeError, ValueError):
                    continue
            if features:
                return dict(zip(features, importances))
        realtime_metrics = data.get("realtime_model") or data.get("model")
        if isinstance(realtime_metrics, dict) and "features" in realtime_metrics:
            features = list(realtime_metrics["features"])
            if features:
                weight = 1.0 / len(features)
                return {feature: weight for feature in features}
    return {}


@lru_cache(maxsize=1)
def _load_model_artifacts() -> tuple[Any, List[str]]:
    from joblib import load

    model_path = get_models_dir() / MODEL_FILENAME
    if not model_path.exists():
        raise FileNotFoundError(f"Model artefact not found: {model_path}")
    model = load(model_path)
    feature_names: List[str]
    if hasattr(model, "feature_names_in_"):
        feature_names = list(model.feature_names_in_)
    else:
        importance = list(_load_feature_importance().keys())
        feature_names = importance or list(getattr(model, "feature_names", []))
    return model, feature_names


async def _prepare_input_vector(payload: Mapping[str, Any], feature_names: List[str]) -> np.ndarray:
    vector = [float(payload.get(feature, 0.0)) for feature in feature_names]
    array = np.asarray(vector, dtype=np.float32).reshape(1, -1)
    return array


async def _compute_shap(
    model: Any,
    array: np.ndarray,
) -> tuple[List[float], float, float]:
    try:
        import shap  # type: ignore
    except ImportError:  # pragma: no cover - handled by caller
        raise

    def _explain() -> tuple[List[float], float, float]:
        try:
            explainer = shap.TreeExplainer(model)  # type: ignore[attr-defined]
        except Exception:
            explainer = shap.Explainer(model)  # type: ignore[attr-defined]
        shap_values = explainer(array)
        values = shap_values.values[0].tolist()
        base_value = float(np.ravel(shap_values.base_values)[0])
        if hasattr(model, "predict_proba"):
            prediction = float(model.predict_proba(array)[0][1])
        else:
            raw_pred = np.ravel(model.predict(array))[0]  # type: ignore[attr-defined]
            prediction = float(raw_pred)
        return values, base_value, prediction

    return await asyncio.to_thread(_explain)


def _fallback_explanation(payload: Mapping[str, Any]) -> Dict[str, Any]:
    importance = _load_feature_importance()
    baselines = _feature_baselines()
    if not importance:
        return {
            "message": "Feature importance statistics unavailable; no fallback explanation generated.",
            "contributions": {},
        }
    contributions: Dict[str, float] = {}
    for feature, weight in importance.items():
        baseline = baselines.get(feature, 0.0)
        value = float(payload.get(feature, baseline))
        contributions[feature] = round((value - baseline) * float(weight), 6)
    return {
        "message": "Approximate contributions computed from feature importance weighting.",
        "contributions": contributions,
        "baselines_used": bool(baselines),
    }


@router.post(
    "/shap",
    response_model=ShapExplanation,
    summary="Generate SHAP values for a single observation.",
)
async def shap_explain(payload: Dict[str, Any] = Body(..., description="Observation to explain.")):
    """
    Generate SHAP explanations for a submitted feature vector.

    If the optional ``shap`` dependency is not installed, the endpoint responds with ``503``
    and provides a lightweight fallback explanation derived from feature importance weights.

    Example:

    ```
    curl -X POST http://localhost:8000/api/model/shap \\
      -H "Content-Type: application/json" \\
      -d '{"dst_port": 80, "packet_length": 512, "proto": "TCP"}'
    ```
    """
    if not isinstance(payload, Mapping):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload must be a JSON object.")

    try:
        import shap  # noqa: F401  # type: ignore
        shap_available = True
    except ImportError:
        shap_available = False

    if not shap_available:
        fallback = _fallback_explanation(payload)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "message": "SHAP is an optional dependency and is not installed in this environment.",
                "fallback": fallback,
            },
        )

    try:
        model, feature_names = _load_model_artifacts()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if not feature_names:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model feature names unavailable; cannot compute SHAP values.",
        )

    array = await _prepare_input_vector(payload, feature_names)
    shap_values, base_value, prediction = await _compute_shap(model, array)
    return ShapExplanation(
        features=feature_names,
        shap_values=[round(value, 6) for value in shap_values],
        base_value=round(base_value, 6),
        prediction=round(prediction, 6),
    )


