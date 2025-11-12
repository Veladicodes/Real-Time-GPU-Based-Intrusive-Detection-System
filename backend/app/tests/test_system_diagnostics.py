from __future__ import annotations

import asyncio
from typing import Any, Dict

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies import get_redis
from app.main import app


class FakeRedis:
    def __init__(self) -> None:
        self.store: Dict[str, Any] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value):
        self.store[key] = value

    async def ping(self):
        return True

    async def info(self, section: str | None = None):
        return {
            "keyspace_hits": 150,
            "keyspace_misses": 30,
        }

    async def close(self):
        return None


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch):
    redis = FakeRedis()

    async def _override():
        yield redis

    app.dependency_overrides[get_redis] = _override
    app.state.redis = redis
    yield redis
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app, lifespan="off")
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_status_endpoint(client: AsyncClient):
    response = await client.get("/api/system/status")
    assert response.status_code == 200
    payload = response.json()
    assert "cpu_load" in payload
    assert "warnings" in payload
    assert "maintenance_mode" in payload


@pytest.mark.asyncio
async def test_toggle_maintenance(client: AsyncClient, fake_redis: FakeRedis):
    response = await client.post("/api/system/maintenance", json={"enabled": True})
    assert response.status_code == 200
    payload = response.json()
    assert payload["maintenance"] is True
    assert fake_redis.store.get("system:maintenance") == "1"


@pytest.mark.asyncio
async def test_system_scan_trigger(client: AsyncClient):
    response = await client.post("/api/system/scan")
    assert response.status_code == 200
    assert response.json()["status"] in {"scan_started", "scan_in_progress"}
    await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_fleet_endpoint(client: AsyncClient):
    response = await client.get("/api/system/fleet")
    assert response.status_code == 200
    fleet = response.json()
    assert isinstance(fleet, list)
    assert fleet
    assert "status" in fleet[0]

