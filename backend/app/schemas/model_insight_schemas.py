"""Pydantic schemas for the Model Insights feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class ModelStatusResponse(BaseModel):
    model_loaded: bool = Field(..., description="Whether the inference model is available.")
    model_name: Optional[str] = Field(None, description="Identifier for the active model artifact.")
    gpu_mode: bool = Field(False, description="True if the model is running with GPU acceleration.")
    features: List[str] = Field(default_factory=list, description="Ordered list of model input features.")


class FeatureImportanceItem(BaseModel):
    name: str
    score: float
    normalized_score: float = Field(..., ge=0.0, le=1.0)


class FeatureImportanceResponse(BaseModel):
    model: str
    features: List[FeatureImportanceItem]


class FeatureDistributionResponse(BaseModel):
    feature: str
    histogram_bins: List[float]
    counts: List[float]
    sample_percentiles: Dict[str, float]
    statistics: Dict[str, float] = Field(default_factory=dict)


class ShapInstancePayload(BaseModel):
    instance_id: Optional[str] = Field(None, description="Arbitrary identifier for the instance.")
    ip: Optional[str] = Field(None, description="Source IP tied to the sample, if applicable.")
    features: Dict[str, Any]

    @validator("features")
    def _ensure_features(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if not value:
            raise ValueError("features mapping cannot be empty")
        return value


class ShapExplainRequest(BaseModel):
    instances: Optional[List[ShapInstancePayload]] = None


class ShapJobStatus(BaseModel):
    id: str
    status: str
    created_at: datetime
    completed: bool = False
    percent: float = 0.0
    message: Optional[str] = None


class ShapExplanation(BaseModel):
    instance_id: Optional[str]
    shap_values: Dict[str, float]
    base_value: Optional[float] = None
    predicted_score: Optional[float] = None


class ShapResultResponse(BaseModel):
    id: str
    completed: bool
    explanations: List[ShapExplanation]
    feature_order: List[str]
    created_at: datetime


class SummaryRequest(BaseModel):
    lookback_seconds: int = Field(3600, ge=60, le=24 * 3600)
    top_k_features: int = Field(6, ge=1, le=32)


class SummarySignal(BaseModel):
    feature: str
    signal: str
    score: Optional[float] = None


class SummaryResult(BaseModel):
    id: str
    completed: bool
    summary_text: Optional[str]
    created_at: datetime
    signals: List[SummarySignal] = Field(default_factory=list)


