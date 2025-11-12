"""Threat analytics websocket and API endpoints."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, validator

try:
  import redis.asyncio as aioredis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - fallback
  import aioredis  # type: ignore

from app.dependencies import get_redis, get_redis_url

router = APIRouter(prefix="/api/threats", tags=["Threats"])

EVENT_STREAM_KEY = "threat:events"
STATUS_HASH_KEY = "threat:status"
SUSPICIOUS_SET_KEY = "threat:suspicious"
ACTIVE_KEY = "threat:active"
BLOCKED_KEY = "threat:blocked"
CONF_SUM_KEY = "threat:confidence:sum"
CONF_COUNT_KEY = "threat:confidence:count"
PUB_CHANNEL = "threat:events:pub"


class ThreatEventIn(BaseModel):
  timestamp: datetime | None = None
  ip: str
  threat_type: str
  confidence: float = Field(ge=0.0, le=1.0)
  geo: str | None = None
  vector: float = Field(ge=0.0, le=360.0)
  status: str = Field(default="Monitoring")

  @validator("timestamp", pre=True, always=True)
  def default_timestamp(cls, value: datetime | None) -> datetime:
    return value or datetime.now(timezone.utc)

  @validator("status")
  def normalise_status(cls, value: str) -> str:
    normalised = (value or "Monitoring").strip().title()
    if normalised not in {"Active", "Blocked", "Monitoring"}:
      return "Monitoring"
    return normalised


async def get_current_stats(redis: aioredis.Redis) -> Dict[str, Any]:
  active = max(int(await redis.get(ACTIVE_KEY) or 0), 0)
  blocked = max(int(await redis.get(BLOCKED_KEY) or 0), 0)
  suspicious = await redis.scard(SUSPICIOUS_SET_KEY)
  sum_conf = float(await redis.get(CONF_SUM_KEY) or 0.0)
  count_conf = int(await redis.get(CONF_COUNT_KEY) or 0)
  avg_conf = round(sum_conf / count_conf, 2) if count_conf else 0.0
  return {
    "active_threats": active,
    "blocked_attacks": blocked,
    "suspicious_ips": suspicious,
    "avg_confidence": avg_conf,
  }


async def record_threat_event(redis: aioredis.Redis, event: ThreatEventIn) -> Dict[str, Any]:
  payload = event.dict()
  payload["timestamp"] = payload["timestamp"].isoformat()

  ip = payload["ip"]
  status = payload["status"]
  confidence = float(payload["confidence"])

  prev_status = await redis.hget(STATUS_HASH_KEY, ip)

  pipe = redis.pipeline()

  if prev_status == "Active":
    pipe.decr(ACTIVE_KEY)
    pipe.srem(SUSPICIOUS_SET_KEY, ip)
  elif prev_status == "Blocked":
    pipe.decr(BLOCKED_KEY)

  if status == "Active":
    pipe.incr(ACTIVE_KEY)
    pipe.sadd(SUSPICIOUS_SET_KEY, ip)
  elif status == "Blocked":
    pipe.incr(BLOCKED_KEY)
    pipe.srem(SUSPICIOUS_SET_KEY, ip)
  else:
    pipe.sadd(SUSPICIOUS_SET_KEY, ip)

  pipe.hset(STATUS_HASH_KEY, ip, status)
  pipe.incrbyfloat(CONF_SUM_KEY, confidence)
  pipe.incr(CONF_COUNT_KEY)
  pipe.xadd(EVENT_STREAM_KEY, {"event": json.dumps(payload)}, maxlen=500, approximate=True)
  pipe.publish(PUB_CHANNEL, json.dumps(payload))
  await pipe.execute()

  # Ensure counters do not dip below zero.
  for key in (ACTIVE_KEY, BLOCKED_KEY):
    value = int(await redis.get(key) or 0)
    if value < 0:
      await redis.set(key, 0)

  return payload


async def threat_stream(redis: aioredis.Redis) -> AsyncIterator[Dict[str, Any]]:
  pubsub = redis.pubsub()
  await pubsub.subscribe(PUB_CHANNEL)
  try:
    async for message in pubsub.listen():
      if message["type"] != "message":
        continue
      try:
        payload = json.loads(message["data"])
      except (TypeError, json.JSONDecodeError):
        continue
      yield payload
  finally:
    await pubsub.unsubscribe(PUB_CHANNEL)
    await pubsub.close()


async def get_redis_connection() -> aioredis.Redis:
  return aioredis.from_url(get_redis_url(), encoding="utf-8", decode_responses=True)


@router.get("/recent")
async def recent_threats(n: int = Query(50, ge=1, le=200), redis: aioredis.Redis = Depends(get_redis)):
  entries = await redis.xrevrange(EVENT_STREAM_KEY, count=n)
  events: List[Dict[str, Any]] = []
  for _, data in reversed(entries):
    raw = data.get("event")
    if not raw:
      continue
    try:
      events.append(json.loads(raw))
    except json.JSONDecodeError:
      continue
  return events


@router.get("/stats")
async def threat_stats(redis: aioredis.Redis = Depends(get_redis)):
  return await get_current_stats(redis)


@router.post("/test")
async def threat_test(event: ThreatEventIn, redis: aioredis.Redis = Depends(get_redis)):
  payload = await record_threat_event(redis, event)
  return {"status": "queued", "event": payload}


@router.websocket("/ws/threats")
async def websocket_threats(websocket: WebSocket):
  redis = await get_redis_connection()
  await websocket.accept()
  try:
    recent_entries = await redis.xrevrange(EVENT_STREAM_KEY, count=50)
    for _, data in reversed(recent_entries):
      raw = data.get("event")
      if not raw:
        continue
      try:
        await websocket.send_json(json.loads(raw))
      except json.JSONDecodeError:
        continue

    async for payload in threat_stream(redis):
      await websocket.send_json(payload)
  except WebSocketDisconnect:
    pass
  finally:
    await redis.close()


@router.websocket("/ws/stats")
async def websocket_stats(websocket: WebSocket):
  redis = await get_redis_connection()
  await websocket.accept()
  try:
    while True:
      stats = await get_current_stats(redis)
      await websocket.send_json(stats)
      await asyncio.sleep(2)
  except WebSocketDisconnect:
    pass
  finally:
    await redis.close()


