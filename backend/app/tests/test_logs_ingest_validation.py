"""TDD coverage for Pydantic range-validated telemetry ingestion.

User journey:
  As the RT-GIDS ingestion boundary, I want /api/logs/ingest to reject
  malformed events (out-of-range ports, invalid IPs, oversized fields) with a
  422 instead of silently accepting an untyped dict and forwarding garbage
  into the Redis stream and ML pipeline.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

import app.security as security_module
from app.main import app
from app.services.telemetry_service import TelemetryService


class _FakeTelemetry(TelemetryService):
    """No-op telemetry stub so ingest tests don't block on real Redis connects.

    Subclasses TelemetryService (rather than duck-typing) because logs.py
    enforces isinstance(telemetry, TelemetryService) before accepting it.
    """

    def __init__(self) -> None:
        super().__init__("redis://unused")

    async def ingest(self, event: dict) -> None:
        return None

    async def update_threat_index(self, event: dict) -> float:
        return 0.0


@pytest.fixture(autouse=True)
def _known_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security_module, "API_TOKEN", "test-api-token")
    monkeypatch.setenv("RTGIDS_API_TOKEN", "test-api-token")
    monkeypatch.setattr(app.state, "telemetry_service", _FakeTelemetry(), raising=False)
    monkeypatch.setattr(app.state, "telemetry", _FakeTelemetry(), raising=False)
    monkeypatch.setattr(app.state, "maintenance_mode", False, raising=False)


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


AUTH = {"Authorization": "Bearer test-api-token"}


@pytest.mark.asyncio
async def test_ingest_accepts_a_well_formed_event(client: AsyncClient) -> None:
    payload = {
        "src_ip": "10.0.0.5",
        "dst_ip": "192.168.1.1",
        "src_port": 443,
        "dst_port": 8080,
        "proto": "TCP",
        "severity": "ALERT",
        "message": "test event",
    }
    response = await client.post("/api/logs/ingest", json=payload, headers=AUTH)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_ingest_rejects_out_of_range_port(client: AsyncClient) -> None:
    payload = {"src_ip": "10.0.0.5", "dst_port": 99999, "severity": "ALERT"}
    response = await client.post("/api/logs/ingest", json=payload, headers=AUTH)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ingest_rejects_negative_port(client: AsyncClient) -> None:
    payload = {"src_ip": "10.0.0.5", "src_port": -1, "severity": "ALERT"}
    response = await client.post("/api/logs/ingest", json=payload, headers=AUTH)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ingest_rejects_invalid_ip_address(client: AsyncClient) -> None:
    payload = {"src_ip": "not-an-ip-address", "severity": "ALERT"}
    response = await client.post("/api/logs/ingest", json=payload, headers=AUTH)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ingest_still_accepts_unknown_extra_fields(client: AsyncClient) -> None:
    # attack.py / run_rtgids.py style events carry extra fields (label, is_attack,
    # bytes_in/out, timestamp) that must keep working without a schema change.
    payload = {
        "src_ip": "10.0.0.5",
        "severity": "CRITICAL",
        "label": "DDoS",
        "is_attack": True,
        "bytes_in": 1200,
        "bytes_out": 300,
        "timestamp": "2026-09-30T00:00:00Z",
    }
    response = await client.post("/api/logs/ingest", json=payload, headers=AUTH)
    assert response.status_code == 200
