from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.dependencies import get_redis


class FakeRedis:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        event_template = {
            "src_ip": "192.168.1.77",
            "dst_port": 80,
            "proto": "TCP",
            "severity": "ALERT",
        }
        self._lists: Dict[str, List[str]] = {
            "logs": [
                json.dumps({**event_template, "timestamp": (now - timedelta(minutes=1)).isoformat()}),
                json.dumps(
                    {
                        **event_template,
                        "src_ip": "10.0.0.5",
                        "dst_port": 22,
                        "timestamp": (now - timedelta(minutes=2)).isoformat(),
                    }
                ),
                json.dumps(
                    {
                        **event_template,
                        "src_ip": "203.0.113.10",
                        "dst_port": 443,
                        "proto": "UDP",
                        "timestamp": (now - timedelta(minutes=3)).isoformat(),
                    }
                ),
            ]
        }
        self._kv: Dict[str, str] = {
            "threat_index": "72.5",
            "attack_count": "12",
        }
        self._info: Dict[str, Any] = {
            "connected_clients": 3,
            "used_memory_human": "12M",
            "instantaneous_ops_per_sec": 150,
            "keyspace_hits": 90,
            "keyspace_misses": 10,
            "db0": {"keys": 42},
        }

    async def lrange(self, key: str, start: int, end: int) -> List[str]:
        items = self._lists.get(key, [])
        slice_end = None if end == -1 else end + 1
        return items[start:slice_end]

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str) -> None:
        self._kv[key] = value

    async def info(self, section: str | None = None) -> Dict[str, Any]:
        return self._info

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None


class FakeTelemetry:
    async def threat_index(self) -> Dict[str, Any]:
        return {"threat_index": 48.5, "count": 7, "status": "elevated"}


class FakeMLService:
    def summary(self) -> Dict[str, Any]:
        return {"model": "joblib", "path": "/tmp/model.joblib", "status": "ok"}

    @property
    def model(self) -> Any:
        class _Model:
            n_features_in_ = 4

        return _Model()


@pytest.fixture(autouse=True)
def configure_models_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    models_dir = tmp_path / "models"
    models_dir.mkdir()

    # Minimal feature importance file for the tests
    (models_dir / "feature_importance.csv").write_text(
        "packet_length,0.4\nprotocol,0.3\ndst_port,0.2\nsrc_port,0.1\n",
        encoding="utf-8",
    )

    # Copy an existing model artefact if available for SHAP-enabled environments
    source_model = Path("RealTime_IDS/models/xgb_realtime_ids.joblib")
    if source_model.exists():
        shutil.copy(source_model, models_dir / "xgb_realtime_ids.joblib")

    monkeypatch.setenv("RTGIDS_MODELS_DIR", str(models_dir))
    return models_dir


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()

    async def _override():
        yield redis

    app.dependency_overrides[get_redis] = _override
    yield redis
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture
async def client(fake_redis: FakeRedis) -> AsyncClient:
    # Inject lightweight test doubles for telemetry + ML services
    app.state.telemetry = FakeTelemetry()
    app.state.ml_service = FakeMLService()
    app.state.model_service = None

    transport = ASGITransport(app=app, lifespan="off")
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_feature_importance_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/model/importance")
    assert response.status_code == 200
    payload = response.json()
    assert payload["features"]
    assert len(payload["features"]) == len(payload["importance"])


@pytest.mark.asyncio
async def test_shap_explain_endpoint(client: AsyncClient) -> None:
    response = await client.post(
        "/api/model/shap",
        json={"packet_length": 512, "protocol": 6, "dst_port": 80, "src_port": 443},
    )
    assert response.status_code in (200, 503)
    payload = response.json()
    if response.status_code == 200:
        assert "features" in payload and "shap_values" in payload
    else:
        assert "fallback" in payload
        assert "message" in payload


@pytest.mark.asyncio
async def test_summary_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/summary/attacks?minutes=5")
    assert response.status_code == 200
    payload = response.json()
    assert "attack_rate" in payload
    assert "timeline" in payload and isinstance(payload["timeline"], list)
    assert "narrative" in payload and payload["narrative"]


@pytest.mark.asyncio
async def test_dashboard_metrics_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/dashboard/metrics")
    assert response.status_code == 200
    payload = response.json()
    for key in ("threat", "system", "redis", "model", "summary"):
        assert key in payload
    assert "narrative" in payload["summary"]


