"""TDD coverage for JWT HS256 issuance with enforced 24h expiry.

User journey:
  As an RT-GIDS API client, I want to exchange the shared API token for a signed
  JWT that expires after 24 hours, and I want the backend to reject any JWT that
  lacks an expiry claim or has expired, so that access cannot be granted forever
  by a leaked or malformed token.
"""

from __future__ import annotations

import time

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
import app.security as security_module
from app.security import decode_token


@pytest.fixture(autouse=True)
def _known_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security_module, "JWT_SECRET", "test-secret")
    monkeypatch.setattr(security_module, "JWT_ALG", "HS256")
    monkeypatch.setattr(security_module, "API_TOKEN", "test-api-token")


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.mark.asyncio
async def test_token_endpoint_issues_jwt_expiring_in_24_hours(client: AsyncClient) -> None:
    response = await client.post("/api/auth/token", json={"api_token": "test-api-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 86400

    decoded = jwt.decode(body["access_token"], "test-secret", algorithms=["HS256"])
    lifetime = decoded["exp"] - decoded["iat"]
    assert abs(lifetime - 86400) < 5  # allow a few seconds of test-run drift


@pytest.mark.asyncio
async def test_token_endpoint_rejects_wrong_api_token(client: AsyncClient) -> None:
    response = await client.post("/api/auth/token", json={"api_token": "wrong-token"})
    assert response.status_code == 401


def test_decode_token_rejects_jwt_without_exp_claim() -> None:
    token_no_exp = jwt.encode({"sub": "attacker"}, "test-secret", algorithm="HS256")
    with pytest.raises(Exception):
        decode_token(token_no_exp)


def test_decode_token_rejects_expired_jwt() -> None:
    expired = jwt.encode(
        {"sub": "api-client", "iat": int(time.time()) - 100000, "exp": int(time.time()) - 1},
        "test-secret",
        algorithm="HS256",
    )
    with pytest.raises(Exception):
        decode_token(expired)


def test_decode_token_accepts_freshly_issued_jwt() -> None:
    now = int(time.time())
    fresh = jwt.encode(
        {"sub": "api-client", "iat": now, "exp": now + 86400},
        "test-secret",
        algorithm="HS256",
    )
    claims = decode_token(fresh)
    assert claims["sub"] == "api-client"
