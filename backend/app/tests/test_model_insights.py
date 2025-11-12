from __future__ import annotations

import asyncio
from typing import Dict

import numpy as np
import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.dependencies import get_redis
from app.utils.model_loader import ModelBundle


class FakeRedis:
    def __init__(self) -> None:
        self._kv: Dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str | bytes) -> None:
        self._kv[key] = value.decode("utf-8") if isinstance(value, bytes) else value

    async def close(self) -> None:
        return None


class StubModel:
    feature_names_in_ = ["packet_length", "dst_port", "src_port"]

    def predict_proba(self, matrix):
        scores = np.clip(matrix[:, -1] / 1000.0, 0, 1)
        return np.column_stack([1 - scores, scores])

    def predict(self, matrix):
        return (matrix[:, -1] > 0.5).astype(int)


@pytest.fixture
def fake_bundle(monkeypatch: pytest.MonkeyPatch) -> ModelBundle:
    bundle = ModelBundle(
        model=StubModel(),
        name="unit-test-model",
        feature_names=["packet_length", "dst_port", "src_port"],
        gpu_mode=False,
        metrics={},
    )
    monkeypatch.setattr("app.routers.model_insights.load_model_bundle", lambda: bundle)
    return bundle


@pytest.fixture
def fake_importance(monkeypatch: pytest.MonkeyPatch) -> None:
    importance = [
        {"name": "packet_length", "score": 0.55, "normalized_score": 1.0},
        {"name": "dst_port", "score": 0.32, "normalized_score": 0.6},
        {"name": "src_port", "score": 0.15, "normalized_score": 0.3},
    ]
    monkeypatch.setattr("app.routers.model_insights.compute_feature_importance", lambda bundle=None: importance)


@pytest.fixture
def fake_background(monkeypatch: pytest.MonkeyPatch) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    frame = pd.DataFrame(
        {
            "packet_length": rng.normal(64, 12, size=512),
            "dst_port": rng.integers(1, 1024, size=512),
            "src_port": rng.integers(1024, 65535, size=512),
        }
    )
    monkeypatch.setattr("app.routers.model_insights.load_validation_frame", lambda bundle=None, sample_size=512: frame)
    return frame


@pytest.fixture
def fake_shap(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.utils.shap_helpers import ShapComputationResult

    result = ShapComputationResult(
        shap_values=[{"packet_length": 0.1, "dst_port": -0.02, "src_port": 0.05}],
        base_values=[0.4],
        predictions=[0.62],
        feature_order=["packet_length", "dst_port", "src_port"],
    )

    async def immediate_executor(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr("app.routers.model_insights.compute_shap_values", lambda *args, **kwargs: result)
    monkeypatch.setattr("app.routers.model_insights.run_in_executor", immediate_executor)


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()

    async def _override():
        yield redis

    app.dependency_overrides[get_redis] = _override
    app.state.redis = redis
    yield redis
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture
async def client(
    fake_redis: FakeRedis,
    fake_bundle: ModelBundle,
    fake_importance: None,
    fake_background: pd.DataFrame,
    fake_shap: None,
) -> AsyncClient:
    transport = ASGITransport(app=app, lifespan="off")
    headers = {"Authorization": "Bearer api::dev-token-abc"}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_model_status_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/model/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_loaded"] is True
    assert payload["features"]


@pytest.mark.asyncio
async def test_feature_importance_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/model/feature-importance")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["features"]) == 3
    assert payload["features"][0]["name"] == "packet_length"


@pytest.mark.asyncio
async def test_feature_distribution_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/model/feature-distribution?feature=packet_length&samples=300")
    assert response.status_code == 200
    payload = response.json()
    assert payload["feature"] == "packet_length"
    assert len(payload["histogram_bins"]) > 0


@pytest.mark.asyncio
async def test_shap_job_flow(client: AsyncClient, fake_redis: FakeRedis) -> None:
    response = await client.post("/api/model/shap/explain", json={"instances": [{"features": {"packet_length": 72}}]})
    assert response.status_code == 200
    job = response.json()
    assert job["status"] == "queued"

    # Allow background job to finish
    await asyncio.sleep(0.05)

    result = await client.get(f"/api/model/shap/result/{job['id']}")
    assert result.status_code == 200
    payload = result.json()
    assert payload["completed"] is True
    assert payload["explanations"]
    assert payload["feature_order"]


@pytest.mark.asyncio
async def test_summary_job_flow(client: AsyncClient) -> None:
    response = await client.post("/api/model/summary", json={"lookback_seconds": 1200, "top_k_features": 3})
    assert response.status_code == 200
    job = response.json()
    assert job["completed"] is False

    await asyncio.sleep(0.05)

    result = await client.get(f"/api/model/summary/{job['id']}")
    assert result.status_code == 200
    payload = result.json()
    assert payload["completed"] is True
    assert payload["summary_text"]
    assert isinstance(payload["signals"], list)

