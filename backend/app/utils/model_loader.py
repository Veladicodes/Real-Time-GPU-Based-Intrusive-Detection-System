"""Utilities for loading and introspecting RT-GIDS models."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

import joblib
import numpy as np

try:
    from xgboost import Booster, XGBClassifier
except ImportError:  # pragma: no cover - xgboost optional in some test environments
    Booster = Any  # type: ignore
    XGBClassifier = Any  # type: ignore

MODELS_DIR = Path(os.getenv("RTGIDS_MODELS_DIR", "/data/models"))
MODEL_STATUS_CACHE_KEY = "model:status"


@dataclass(slots=True)
class ModelBundle:
    """Wrapper with metadata for the active inference model."""

    model: Any
    name: str
    feature_names: list[str]
    gpu_mode: bool
    metrics: dict[str, Any]


def _read_metrics(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _detect_gpu_mode(metrics: dict[str, Any]) -> bool:
    gpu_flags = {
        str(metrics.get("gpu_mode", "")).lower(),
        str(metrics.get("device", "")).lower(),
        str(metrics.get("accelerator", "")).lower(),
    }
    return any(flag in {"cuda", "gpu", "true", "1"} for flag in gpu_flags)


def _load_booster(model_dir: Path) -> ModelBundle | None:
    xgb_path = model_dir / "model.xgb"
    if xgb_path.exists():
        booster = Booster()
        booster.load_model(str(xgb_path))
        feature_names = booster.feature_names or []
        metrics = _read_metrics(model_dir / "metrics.json")
        return ModelBundle(
            model=booster,
            name=xgb_path.name,
            feature_names=feature_names,
            gpu_mode=_detect_gpu_mode(metrics),
            metrics=metrics,
        )
    return None


def _load_joblib(model_dir: Path) -> ModelBundle | None:
    for candidate in ("model.joblib", "xgb_realtime_ids.joblib", "xgb_gpu_ids.joblib"):
        path = model_dir / candidate
        if not path.exists():
            continue
        model = joblib.load(path)
        feature_names: list[str] = []
        if hasattr(model, "feature_names_in_"):
            feature_names = list(getattr(model, "feature_names_in_"))
        elif hasattr(model, "feature_names"):
            feature_names = list(getattr(model, "feature_names"))
        elif isinstance(model, Booster):
            feature_names = model.feature_names or []
        metrics = _read_metrics(model_dir / "metrics.json")
        gpu_mode = _detect_gpu_mode(metrics)
        if hasattr(model, "get_booster"):
            booster = model.get_booster()
            if booster is not None and not feature_names:
                feature_names = booster.feature_names or []
        model_name = path.name
        return ModelBundle(
            model=model,
            name=model_name,
            feature_names=feature_names,
            gpu_mode=gpu_mode,
            metrics=metrics,
        )
    return None


@lru_cache(maxsize=1)
def load_model_bundle() -> ModelBundle | None:
    """
    Load the inference model from disk.

    Preference order:
        1. Native XGBoost booster at MODELS_DIR/model.xgb
        2. Joblib serialised estimators (model.joblib, xgb_realtime_ids.joblib, xgb_gpu_ids.joblib)
    """
    if not MODELS_DIR.exists():
        return None
    bundle = _load_booster(MODELS_DIR)
    if bundle:
        return bundle
    return _load_joblib(MODELS_DIR)


def get_feature_names(bundle: ModelBundle | None = None) -> list[str]:
    """Return the ordered list of features the model expects."""
    bundle = bundle or load_model_bundle()
    if not bundle:
        return []
    if bundle.feature_names:
        return bundle.feature_names
    model = bundle.model
    if hasattr(model, "feature_importances_"):
        indices = np.argsort(model.feature_importances_)[::-1]
        return [f"f{idx}" for idx in indices]
    return []


def ensure_booster(model: Any) -> Booster | None:
    """
    Return the underlying Booster instance for SHAP / feature importance.
    Supports XGBClassifier, Booster or compatible wrappers.
    """
    if isinstance(model, Booster):
        return model
    if isinstance(model, XGBClassifier):
        return model.get_booster()
    if hasattr(model, "get_booster"):
        booster = model.get_booster()
        if isinstance(booster, Booster):
            return booster
    return None


def bundle_to_status(bundle: ModelBundle | None) -> dict[str, Any]:
    """Serialise bundle metadata into the model status payload."""
    if bundle is None:
        return {
            "model_loaded": False,
            "model_name": None,
            "gpu_mode": False,
            "features": [],
        }
    return {
        "model_loaded": True,
        "model_name": bundle.name,
        "gpu_mode": bool(bundle.gpu_mode),
        "features": get_feature_names(bundle),
    }


def normalise_feature_scores(scores: Iterable[tuple[str, float]]) -> list[dict[str, float | str]]:
    """Normalise raw feature importance values into [0, 1] range."""
    scored = [(name, float(value)) for name, value in scores]
    if not scored:
        return []
    max_score = max(abs(value) for _, value in scored) or 1.0
    return [
        {
            "name": name,
            "score": value,
            "normalized_score": float(abs(value) / max_score),
        }
        for name, value in scored
    ]

