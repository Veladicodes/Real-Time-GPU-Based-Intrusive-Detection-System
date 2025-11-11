"""Real-time log streaming and ingestion endpoints for RT-GIDS."""

from __future__ import annotations

import os

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

from app.security import decode_token
from app.services.telemetry_service import TelemetryService

router = APIRouter(prefix="/api/logs", tags=["Logs"])


# ---------------------------
# Ingest Endpoint (POST /api/logs/ingest)
# ---------------------------
@router.post("/ingest", status_code=status.HTTP_200_OK)
async def ingest_log(
    request: Request,
    payload: dict,
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

    message_text = str(payload.get("message") or "").strip()
    if message_text.lower().startswith("rt-gids auto-pulse"):
        # Ignore internal heartbeat noise to keep analyst feed clean.
        return {"status": "ignored"}

    await telemetry.ingest(payload)
    await telemetry.update_threat_index(payload)
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
