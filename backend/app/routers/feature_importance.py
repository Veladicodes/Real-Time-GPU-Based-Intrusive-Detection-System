"""Feature importance API endpoints."""

from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import List

import aiofiles
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

FEATURE_IMPORTANCE_FILENAME = "feature_importance.csv"
METRICS_FILENAME = "metrics.json"

router = APIRouter(prefix="/api/model", tags=["Model Explainability"])


class FeatureImportanceResponse(BaseModel):
    """Response schema containing ranked feature importance values."""

    features: List[str] = Field(..., description="Ordered feature names from the model.")
    importance: List[float] = Field(..., description="Importance scores aligned with `features`.")


def get_models_dir() -> Path:
    return Path(os.getenv("RTGIDS_MODELS_DIR", "/data/models"))


async def _read_feature_importance_csv(path: Path) -> FeatureImportanceResponse:
    async with aiofiles.open(path, "r", encoding="utf-8") as handle:
        content = await handle.read()
    reader = csv.reader(line for line in content.splitlines() if line.strip())
    features: List[str] = []
    importance: List[float] = []
    for row in reader:
        if len(row) < 2:
            continue
        feature, value = row[0].strip(), row[1].strip()
        try:
            score = float(value)
        except ValueError:
            continue
        features.append(feature)
        importance.append(score)
    if not features or len(features) != len(importance):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse feature importance CSV.",
        )
    return FeatureImportanceResponse(features=features, importance=importance)


async def _read_feature_importance_metrics(path: Path) -> FeatureImportanceResponse:
    async with aiofiles.open(path, "r", encoding="utf-8") as handle:
        payload = await handle.read()
    try:
        metrics = json.loads(payload)
    except json.JSONDecodeError as exc:  # pragma: no cover - invalid metrics file
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid metrics.json format: {exc}",
        ) from exc

    importance_data = metrics.get("feature_importance") or metrics.get("importance")
    if isinstance(importance_data, list):
        features: List[str] = []
        scores: List[float] = []
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
                score = float(value)
            except (TypeError, ValueError):
                continue
            features.append(name)
            scores.append(score)
        if features and len(features) == len(scores):
            return FeatureImportanceResponse(features=features, importance=scores)

    realtime_metrics = metrics.get("realtime_model") or metrics.get("model")
    if isinstance(realtime_metrics, dict) and "features" in realtime_metrics:
        features = list(realtime_metrics["features"])
        scores = [1.0 / len(features)] * len(features) if features else []
        if scores:
            return FeatureImportanceResponse(features=features, importance=scores)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No feature importance data available in metrics.json.",
    )


@router.get(
    "/importance",
    response_model=FeatureImportanceResponse,
    summary="Fetch model feature importance rankings.",
    response_description="Ordered feature importance data ready for chart rendering.",
)
async def read_feature_importance() -> FeatureImportanceResponse:
    """
    Return feature importance scores for the active model.

    This endpoint searches the configured ``RTGIDS_MODELS_DIR`` for either
    ``feature_importance.csv`` or ``metrics.json``. Example usage:

    ```
    curl http://localhost:8000/api/model/importance
    ```
    """
    models_dir = get_models_dir()
    csv_path = models_dir / FEATURE_IMPORTANCE_FILENAME
    if csv_path.exists():
        return await _read_feature_importance_csv(csv_path)

    metrics_path = models_dir / METRICS_FILENAME
    if metrics_path.exists():
        return await _read_feature_importance_metrics(metrics_path)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Feature importance artefacts not found in {models_dir}",
    )


