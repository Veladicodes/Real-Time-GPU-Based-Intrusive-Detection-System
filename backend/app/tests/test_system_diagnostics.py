from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.dependencies import get_redis
from app.routers.system_diagnostics import telemetry_manager


class FakeRedis:
    def __init__(self) -> None:
        self._kv: Dict[str, str] = {}
        self._info: Dict[str, Any] = {
            "keyspace_hits": 80,
            "keyspace_misses": 20,
        }
        self._pinged: bool = False

    async def get(self, key: str) -> str | None:
        return self._kv.get(key)

    async def set(self, key: str, value: str) -> None:
        self._kv[key] = value

    async def info(self, section: str | None = None) -> Dict[str, Any]:
        return self._info

    async def ping(self) -> str:
        self._pinged = True
        return "PONG"

    async def close(self) -> None:
        return None


class FakeModelService:
    def __init__(self) -> None:
        self.model = object()

    def predict(self, _: Dict[str, Any]) -> Dict[str, Any]:
        return {"score": 0.42}


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()

    async def _override():
        yield redis

    app.dependency_overrides[get_redis] = _override
    app.state.redis = redis
    app.state.model_service = FakeModelService()
    yield redis
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture
async def client(fake_redis: FakeRedis) -> AsyncClient:
    transport = ASGITransport(app=app)
    headers = {"Authorization": "Bearer api::dev-token-abc"}
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_system_status_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/system/status")
    assert response.status_code == 200
    payload = response.json()
    assert "uptime" in payload
    assert "cpu_load" in payload
    assert "warnings" in payload
    assert isinstance(payload["warnings"], list)


@pytest.mark.asyncio
async def test_toggle_maintenance(client: AsyncClient, fake_redis: FakeRedis) -> None:
    response = await client.post("/api/system/maintenance", json={"enabled": True})
    assert response.status_code == 200
    assert response.json()["maintenance_mode"] is True
    assert await fake_redis.get("system:maintenance") == "1"


@pytest.mark.asyncio
async def test_fleet_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/system/fleet")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload[0]["id"].startswith("sensor-")


@pytest.mark.asyncio
async def test_scan_triggers_broadcast(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    events: List[Dict[str, Any]] = []
    broadcast_called = asyncio.Event()

    async def fake_broadcast(message: Dict[str, Any]) -> None:
        events.append(message)
        broadcast_called.set()

    monkeypatch.setattr(telemetry_manager, "broadcast", fake_broadcast)

    response = await client.post("/api/system/scan")
    assert response.status_code == 200
    await asyncio.wait_for(broadcast_called.wait(), timeout=1.0)
    assert events
    assert events[0]["type"] == "scan_result"


