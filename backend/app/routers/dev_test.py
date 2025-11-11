"""Development utilities for triggering mock events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request

router = APIRouter(tags=["dev"])


def get_connection_manager(request: Request):
  manager = getattr(request.app.state, "connection_manager", None)
  if manager is None:  # pragma: no cover - defensive
    raise RuntimeError("Connection manager not initialised")
  return manager


@router.get("/__test/push_event")
async def push_event(
  request: Request,
  event_type: Literal["info", "warning", "alert", "critical"] = Query("alert"),
  msg: str = Query("GPU IDS spike detected"),
  confidence: Optional[int] = Query(None, ge=0, le=100),
  src: Optional[str] = Query(None),
  dst: Optional[str] = Query(None),
):
  payload = {
    "id": uuid4().hex,
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "type": event_type.upper(),
    "message": msg.replace("_", " "),
  }
  if confidence is not None:
    payload["confidence"] = confidence
  if src:
    payload["src_ip"] = src
  if dst:
    payload["dst_ip"] = dst

  manager = get_connection_manager(request)
  await manager.broadcast(payload)

  return {"status": "queued", "payload": payload}


