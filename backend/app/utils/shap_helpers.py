"""Helper utilities for SHAP and model insight analytics."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd

from .model_loader import ModelBundle, ensure_booster, get_feature_names, load_model_bundle, normalise_feature_scores

try:
    import shap
except Exception:  # pragma: no cover - shap optional, fallback handled in code paths
    shap = None  # type: ignore

ValidationFrame = pd.DataFrame

VALIDATION_DATASET = Path(os.getenv("MODEL_VALIDATION_PATH", "/data/models/validation.csv"))
FEATURE_IMPORTANCE_CACHE_KEY = "model:feature_importance"


class SHAPUnavailableError(RuntimeError):
    """Raised when SHAP computations cannot be performed."""


@dataclass(slots=True)
class ShapComputationResult:
    shap_values: list[dict[str, float]]
    base_values: list[float]
    predictions: list[float]
    feature_order: list[str]


def load_validation_frame(bundle: ModelBundle | None = None, sample_size: int = 1000) -> ValidationFrame | None:
    """
    Load validation dataset for SHAP background data.

    Preference order:
        1. CSV at MODEL_VALIDATION_PATH (RTGIDS_MODELS_DIR/validation.csv by default)
        2. metrics.json["background_sample"] (if provided)
    """
    bundle = bundle or load_model_bundle()
    if VALIDATION_DATASET.exists():
        try:
            df = pd.read_csv(VALIDATION_DATASET)
            if sample_size and len(df) > sample_size:
                df = df.sample(sample_size, random_state=42)
            return df
        except Exception:  # pragma: no cover - CSV may be absent or malformed
            pass
    if bundle and bundle.metrics:
        background = bundle.metrics.get("background_sample")
        if background:
            try:
                df = pd.DataFrame(background)
                if sample_size and len(df) > sample_size:
                    df = df.sample(sample_size, random_state=42)
                return df
            except ValueError:
                return None
    return None


def compute_feature_importance(bundle: ModelBundle | None = None) -> list[dict[str, float | str]]:
    """Return feature importance using SHAP or XGBoost gain as fallback."""
    bundle = bundle or load_model_bundle()
    if bundle is None:
        return []

    features = get_feature_names(bundle)
    booster = ensure_booster(bundle.model)

    if shap is not None and booster is not None:
        try:
            explainer = shap.TreeExplainer(booster)
            background = load_validation_frame(bundle, sample_size=512)
            if background is not None and set(background.columns) >= set(features):
                values = explainer.shap_values(background[features])
                mean_abs = np.abs(values).mean(axis=0)
                raw_scores = list(zip(features, mean_abs.tolist()))
                return normalise_feature_scores(raw_scores)
        except Exception:
            # Fall back to booster gain importance below
            pass

    if booster is not None:
        importance = booster.get_score(importance_type="gain")
    else:
        importance = getattr(bundle.model, "feature_importances_", None)
        if importance is None and hasattr(bundle.model, "coef_"):
            importance = np.abs(getattr(bundle.model, "coef_"))
        if importance is None:
            return []
        if isinstance(importance, dict):
            raw_scores = list(importance.items())
        else:
            raw_scores = list(zip(features, importance))
        return normalise_feature_scores(raw_scores)

    raw_scores = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)
    return normalise_feature_scores(raw_scores)


def _align_instances(instances: Sequence[dict[str, Any]], features: Sequence[str]) -> np.ndarray:
    """Convert list of feature dictionaries into numpy matrix aligned with model features."""
    if not instances:
        raise ValueError("No instances provided")
    matrix = []
    for row in instances:
        vector = []
        for feature in features:
            value = row.get(feature, 0)
            try:
                value = float(value)
            except (TypeError, ValueError):
                # Basic encoding for categorical features: hash trick mapped to [0,1]
                value = float(abs(hash(str(value))) % 1000) / 1000.0
            vector.append(value)
        matrix.append(vector)
    return np.asarray(matrix, dtype=float)


def compute_shap_values(
    instances: Sequence[dict[str, Any]],
    *,
    bundle: ModelBundle | None = None,
    background: ValidationFrame | None = None,
) -> ShapComputationResult:
    """Compute SHAP values for provided instances."""
    bundle = bundle or load_model_bundle()
    if bundle is None:
        raise SHAPUnavailableError("Model is not loaded")

    if shap is None:
        raise SHAPUnavailableError("SHAP is not available in this environment")

    booster = ensure_booster(bundle.model)
    if booster is None:
        raise SHAPUnavailableError("Underlying booster not accessible for SHAP computation")

    features = get_feature_names(bundle)
    if not features:
        raise SHAPUnavailableError("Model feature metadata unavailable")

    background = background or load_validation_frame(bundle, sample_size=512)
    if background is None or not set(features).issubset(set(background.columns)):
        # synthesize background from provided instances
        background = pd.DataFrame(instances)
        missing = [f for f in features if f not in background.columns]
        for feature in missing:
            background[feature] = 0.0
        background = background[features]
    else:
        background = background[features]

    matrix = _align_instances(instances, features)
    explainer = shap.TreeExplainer(booster, data=background)
    shap_values = explainer.shap_values(matrix)
    expected_values = explainer.expected_value

    if isinstance(expected_values, (list, np.ndarray)):
        base_values = np.array(expected_values).reshape(-1).tolist()
    else:
        base_values = [float(expected_values)] * len(matrix)

    # Ensure shap_values shape [n_instances, n_features]
    if isinstance(shap_values, list):
        shap_matrix = np.asarray(shap_values[1] if len(shap_values) > 1 else shap_values[0])
    else:
        shap_matrix = np.asarray(shap_values)

    shap_list: list[dict[str, float]] = []
    for row in shap_matrix:
        shap_list.append({feature: float(value) for feature, value in zip(features, row)})

    # Predict scores if estimator supports probability
    predictions: list[float] = []
    try:
        if hasattr(bundle.model, "predict_proba"):
            probas = bundle.model.predict_proba(matrix)  # type: ignore[attr-defined]
            predictions = [float(x) for x in np.asarray(probas)[:, -1]]
        elif hasattr(bundle.model, "predict"):
            raw = bundle.model.predict(matrix)
            predictions = [float(x) for x in np.asarray(raw).reshape(-1).tolist()]
    except Exception:
        predictions = []

    return ShapComputationResult(
        shap_values=shap_list,
        base_values=base_values,
        predictions=predictions,
        feature_order=list(features),
    )


async def run_in_executor(func, *args, loop: asyncio.AbstractEventLoop | None = None, **kwargs):
    """Utility to run blocking SHAP computations in a thread pool."""
    loop = loop or asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


def make_job_id(prefix: str) -> str:
    return f"{prefix}:{uuid.uuid4().hex}"


def serialise_numpy(payload: Any) -> Any:
    if isinstance(payload, np.ndarray):
        return payload.tolist()
    if isinstance(payload, dict):
        return {k: serialise_numpy(v) for k, v in payload.items()}
    if isinstance(payload, list):
        return [serialise_numpy(item) for item in payload]
    if isinstance(payload, (np.float32, np.float64)):
        return float(payload)
    if isinstance(payload, (np.int32, np.int64)):
        return int(payload)
    return payload


def encode_json(payload: Any) -> str:
    return json.dumps(payload, default=serialise_numpy)

