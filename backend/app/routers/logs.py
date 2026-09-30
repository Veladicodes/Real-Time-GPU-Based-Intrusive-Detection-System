"""Real-time log streaming and ingestion endpoints for RT-GIDS."""

from __future__ import annotations

import os

import ipaddress

import orjson
from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.security import decode_token
from app.utils.diagnostics_utils import fetch_maintenance
from app.services.telemetry_service import TelemetryService

router = APIRouter(prefix="/api/logs", tags=["Logs"])


class TelemetryEventIn(BaseModel):
    """Validated shape for an incoming telemetry event.

    extra="allow" so producers (attack.py, run_rtgids.py heartbeat, etc.) can
    keep attaching additional descriptive fields (label, is_attack, bytes_in/
    out, timestamp) without a schema change; only the fields we actually parse
    into network semantics are range/format checked here.
    """

    model_config = ConfigDict(extra="allow")

    src_ip: str | None = None
    dst_ip: str | None = None
    src_port: int | None = Field(default=None, ge=0, le=65535)
    dst_port: int | None = Field(default=None, ge=0, le=65535)
    proto: str | None = Field(default=None, max_length=32)
    severity: str | None = Field(default=None, max_length=32)
    message: str | None = Field(default=None, max_length=2048)

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def _validate_ip(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            ipaddress.ip_address(value)
        except ValueError as exc:
            raise ValueError(f"invalid IP address: {value!r}") from exc
        return value


# ---------------------------
# Ingest Endpoint (POST /api/logs/ingest)
# ---------------------------
@router.post("/ingest", status_code=status.HTTP_200_OK)
async def ingest_log(
    request: Request,
    payload: TelemetryEventIn,
    authorization: str | None = Header(None),
):
    """
    Ingests a single log event into Redis stream and PubSub channel.
    Accepts authenticated requests using Bearer dev token or JWT.
    """
    token_value: str | None = None
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            token_value = token.strip()
    if not token_value:
        raise HTTPException(status_code=401, detail="Missing credentials")

    # Accept explicit dev token or delegate to JWT decoder.
    expected_token = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")
    if token_value not in {expected_token, f"api::{expected_token}", "api::dev-token-abc"}:
        try:
            decode_token(token_value)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid API token") from exc

    telemetry = getattr(request.app.state, "telemetry_service", None) or getattr(request.app.state, "telemetry", None)
    if telemetry is None or not isinstance(telemetry, TelemetryService):
        raise HTTPException(status_code=503, detail="Telemetry service unavailable")

    maintenance = getattr(request.app.state, "maintenance_mode", None)
    if maintenance is None:
        redis = getattr(request.app.state, "redis", None)
        if redis is not None:
            maintenance = await fetch_maintenance(redis)
            setattr(request.app.state, "maintenance_mode", maintenance)
    if maintenance:
        raise HTTPException(status_code=503, detail="Maintenance Mode Active")

    event = payload.model_dump(exclude_none=True)

    message_text = str(event.get("message") or "").strip()
    if message_text.lower().startswith("rt-gids auto-pulse"):
        # Ignore internal heartbeat noise to keep analyst feed clean.
        return {"status": "ignored"}

    await telemetry.ingest(event)
    await telemetry.update_threat_index(event)
    return {"status": "ok"}


# ---------------------------
# WebSocket Endpoint (/api/logs/ws)
# ---------------------------
@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    """
    Live WebSocket for real-time telemetry logs.

    Supports both:
    - Query string token (?token=api::dev-token-abc)
    - Bearer token in Authorization header
    """

    # --- Resolve token ---
    token_value = websocket.query_params.get("token")

    if not token_value:
        auth_header = websocket.headers.get("authorization")
        if auth_header:
            scheme, _, header_token = auth_header.partition(" ")
            if scheme.lower() == "bearer" and header_token:
                token_value = header_token

    if not token_value:
        await websocket.close(code=4401, reason="Missing token")
        return

    # --- Token Verification ---
    # Accept dev token directly (for localhost & Tier-0 testing)
    if token_value in {"api::dev-token-abc", "dev-token-abc"}:
        verified = True
    else:
        try:
            decode_token(token_value)
            verified = True
        except Exception:
            verified = False

    if not verified:
        await websocket.close(code=4401, reason="Invalid token")
        return

    # --- Initialize telemetry service ---
    telemetry = getattr(websocket.app.state, "telemetry_service", None) or getattr(websocket.app.state, "telemetry", None)
    if telemetry is None:
        await websocket.close(code=1011, reason="Telemetry unavailable")
        return

    await telemetry.startup()

    # --- Accept the WebSocket connection ---
    await websocket.accept()
    print("✅ WebSocket connected from client")

    try:
        # Stream recent + new telemetry events to the client
        async for event in telemetry.consume():
            try:
                await websocket.send_text(orjson.dumps(event).decode())
            except Exception as send_err:
                print(f"⚠️ WebSocket send error: {send_err}")
                break

    except WebSocketDisconnect:
        print("⚠️ WebSocket client disconnected")
    except Exception as exc:
        print(f"❌ WebSocket fatal error: {exc}")
        await websocket.close(code=1011, reason=str(exc))
    finally:
        try:
            await telemetry.shutdown()
        except Exception:
            pass
        print("🧩 WebSocket session closed gracefully")
