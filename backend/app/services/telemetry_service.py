"""Telemetry service providing real-time log ingestion, streaming, and threat computation for RT-GIDS."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, AsyncIterator, Dict, List

import orjson

try:
    import redis.asyncio as aioredis  # new unified async redis client
except ImportError:
    import aioredis  # fallback for older redis-py

from app.observability import REDIS_BACKLOG

log = logging.getLogger("rtgids.telemetry")
log.setLevel(logging.INFO)


class TelemetryService:
    """
    Handles ingestion, streaming, and threat index computation of telemetry events
    using Redis streams + pub/sub. Designed for async operation.
    """

    def __init__(
        self,
        redis_url: str,
        stream_key: str = "rtgids:telemetry:stream",
        channel_name: str = "rtgids:telemetry:channel",
        retention: int = 10000,
        simulate: bool = False,
        simulate_interval: float = 1.0,
        group_name: str = "rtgids:telemetry:group",
    ):
        self._redis_url = redis_url
        self._stream_key = stream_key
        self._channel_name = channel_name
        self._retention = retention
        self._simulate = simulate
        self._simulate_interval = simulate_interval
        self._group_name = group_name

        self._redis: aioredis.Redis | None = None
        self._external_client = False
        self._sim_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._connection_lock = asyncio.Lock()
        self._threat_lock = asyncio.Lock()
        self.threat_cache: Dict[str, float] = {"score": 0.0, "timestamp": 0.0, "count": 0.0}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def startup(self) -> None:
        """Establish Redis connection and optionally start simulation loop."""
        if not await self._ensure_redis() or not self._redis:
            raise RuntimeError(f"Unable to initialize Redis connection for telemetry at {self._redis_url}")

        if self._simulate:
            self._sim_task = asyncio.create_task(self._sim_loop(), name="telemetry-sim")

        await self._update_backlog()

    async def shutdown(self) -> None:
        """Close Redis and stop simulator task."""
        if self._sim_task:
            self._sim_task.cancel()
            try:
                await self._sim_task
            except asyncio.CancelledError:
                pass
            self._sim_task = None

        if self._redis:
            try:
                if not self._external_client:
                    await self._redis.close()
            except Exception:
                pass
            self._redis = None

        REDIS_BACKLOG.set(0)
        log.info("🛑 Telemetry service shutdown complete")

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    def _ser(self, event: Dict[str, Any]) -> str:
        event.setdefault("ts", time.time())
        event.setdefault("id", str(uuid.uuid4()))
        return orjson.dumps(event).decode("utf-8")

    def _deser(self, payload: str) -> Dict[str, Any]:
        try:
            return orjson.loads(payload)
        except Exception:
            return {"raw": payload}

    @property
    def redis(self) -> aioredis.Redis | None:
        return self._redis

    def attach_redis_client(self, client: aioredis.Redis) -> None:
        self._redis = client
        self._external_client = True

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def ingest(self, event: Dict[str, Any]) -> None:
        """Add event to Redis stream and publish it to channel."""
        if not self._redis and not await self._ensure_redis():
            log.error("❌ Redis unavailable; dropping telemetry event.")
            return

        async with self._lock:
            payload = self._ser(event)
            try:
                await self._redis.xadd(
                    self._stream_key,
                    {"payload": payload},
                    maxlen=self._retention,
                    approximate=True,
                )
                await self._redis.publish(self._channel_name, payload)
                await self._update_backlog()
            except Exception as exc:
                log.exception("❌ Telemetry ingest failed: %s", exc)
                self._redis = None
                await self._ensure_redis()

    async def recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch most recent telemetry events."""
        if not self._redis and not await self._ensure_redis():
            log.error("❌ Redis unavailable; returning empty telemetry set.")
            return []

        try:
            entries = await self._redis.xrevrange(
                self._stream_key, max="+", min="-", count=limit
            )
        except Exception as exc:
            log.exception("Failed to read telemetry: %s", exc)
            entries = []

        await self._update_backlog()
        return [self._deser(message.get("payload", "")) for _, message in entries if message.get("payload")]

    async def consume(self, start_id: str = "$", block_ms: int = 1000) -> AsyncIterator[Dict[str, Any]]:
        """
        Continuous async consumer for Redis stream.
        Yields events as they arrive.
        """
        if not self._redis and not await self._ensure_redis():
            raise RuntimeError("Redis not initialized")

        last_id = start_id
        while True:
            try:
                response = await self._redis.xread(
                    {self._stream_key: last_id}, count=10, block=block_ms
                )
                if not response:
                    await asyncio.sleep(0)
                    continue

                for _, messages in response:
                    for message_id, fields in messages:
                        payload = fields.get("payload")
                        if payload:
                            yield self._deser(payload)
                            last_id = message_id

                await self._update_backlog()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.warning("⚠️ Stream consume error: %s", exc)
                self._redis = None
                await self._ensure_redis()
                await asyncio.sleep(0.5)

    # ------------------------------------------------------------------
    # Consumer-group based consumption (crash-recoverable)
    # ------------------------------------------------------------------

    async def ensure_group(self) -> None:
        """Create the telemetry consumer group if it doesn't already exist.

        Idempotent: real Redis raises BUSYGROUP if the group already exists,
        which we treat as success rather than an error.
        """
        if not self._redis and not await self._ensure_redis():
            raise RuntimeError("Redis not initialized")
        try:
            await self._redis.xgroup_create(
                self._stream_key, self._group_name, id="$", mkstream=True
            )
        except Exception as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def consume_group(
        self, consumer_name: str, max_messages: int | None = None, block_ms: int = 1000
    ) -> AsyncIterator[Dict[str, Any]]:
        """Consume telemetry events via the shared consumer group, ack'ing each
        message after it's yielded. Multiple consumer_name workers can share the
        stream; unacked messages from a crashed consumer are recovered separately
        via reclaim_stale().
        """
        if not self._redis and not await self._ensure_redis():
            raise RuntimeError("Redis not initialized")

        delivered = 0
        while max_messages is None or delivered < max_messages:
            try:
                response = await self._redis.xreadgroup(
                    self._group_name,
                    consumer_name,
                    {self._stream_key: ">"},
                    count=10,
                    block=block_ms,
                )
                if not response:
                    if max_messages is not None:
                        await asyncio.sleep(0)
                        continue
                    await asyncio.sleep(0)
                    continue

                for _, messages in response:
                    for message_id, fields in messages:
                        # Ack immediately on receipt: crash recovery is handled by
                        # reclaim_stale()/XAUTOCLAIM at the consumer level, not by
                        # withholding the ack until the caller finishes iterating
                        # (which may never happen if the caller stops early).
                        await self._redis.xack(self._stream_key, self._group_name, message_id)
                        payload = fields.get("payload")
                        if payload:
                            yield self._deser(payload)
                        delivered += 1
                        if max_messages is not None and delivered >= max_messages:
                            return

                await self._update_backlog()

            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.warning("⚠️ Consumer-group consume error: %s", exc)
                self._redis = None
                await self._ensure_redis()
                await asyncio.sleep(0.5)

    async def reclaim_stale(self, consumer_name: str, min_idle_ms: int = 60_000) -> List[Dict[str, Any]]:
        """Reassign pending entries idle longer than min_idle_ms to consumer_name
        via XAUTOCLAIM, recovering work from a crashed/stalled consumer.
        """
        if not self._redis and not await self._ensure_redis():
            raise RuntimeError("Redis not initialized")

        reclaimed: List[Dict[str, Any]] = []
        try:
            _, claimed_entries, _ = await self._redis.xautoclaim(
                self._stream_key, self._group_name, consumer_name, min_idle_ms, start_id="0-0"
            )
        except Exception as exc:
            log.warning("⚠️ XAUTOCLAIM failed: %s", exc)
            return reclaimed

        for _, fields in claimed_entries:
            payload = fields.get("payload")
            if payload:
                reclaimed.append(self._deser(payload))
        return reclaimed

    # ------------------------------------------------------------------
    # Threat computation
    # ------------------------------------------------------------------

    async def update_threat_index(self, event: Dict[str, Any]) -> float:
        """Immediately update the threat score using an exponential moving average."""
        severity = (
            (event.get("severity") or event.get("type") or event.get("level") or "INFO")
            .upper()
            .strip()
        )
        weights = {"INFO": 1, "WARNING": 3, "ALERT": 5}
        weight = float(weights.get(severity, 1))
        alpha = 0.5

        async with self._threat_lock:
            previous = float(self.threat_cache.get("score", 0.0) or 0.0)
            new_score = alpha * weight * 20.0 + (1.0 - alpha) * previous
            new_score = min(100.0, new_score)
            now = time.time()
            self.threat_cache["score"] = new_score
            self.threat_cache["timestamp"] = now
            self.threat_cache["count"] = float(self.threat_cache.get("count", 0.0) + 1.0)

            redis_ready = await self._ensure_redis()
            if redis_ready and self._redis:
                try:
                    await self._redis.set("threat_index", f"{new_score:.2f}")
                except Exception as exc:
                    log.warning("[Telemetry] ⚠️ Failed to persist threat index: %s", exc)

            log.info("[Telemetry] Threat Index updated → %.2f", new_score)
            return new_score

    async def threat_index(self, window: int = 120) -> Dict[str, Any]:
        """Return the current cached threat score with qualitative status."""
        redis_ready = await self._ensure_redis()
        now = time.time()
        score = float(self.threat_cache.get("score", 0.0) or 0.0)
        timestamp = float(self.threat_cache.get("timestamp", 0.0) or 0.0)

        if now - timestamp >= 3.0 and redis_ready and self._redis:
            try:
                cached = await self._redis.get("threat_index")
                if cached is not None:
                    score = float(cached)
                    timestamp = now
                    self.threat_cache["score"] = score
                    self.threat_cache["timestamp"] = timestamp
            except Exception as exc:
                log.warning("[Telemetry] ⚠️ Failed to read threat index from Redis: %s", exc)

        if score >= 80:
            status = "critical"
        elif score >= 60:
            status = "high"
        elif score >= 30:
            status = "elevated"
        elif score >= 10:
            status = "low"
        else:
            status = "normal"

        return {
            "threat_index": round(score, 2),
            "status": status,
            "count": int(self.threat_cache.get("count", 0.0)),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _sim_loop(self) -> None:
        """Generate synthetic events for testing."""
        severities = ["INFO", "INFO", "WARNING", "ALERT"]
        counter = 0
        while True:
            try:
                event = {
                    "src_ip": f"10.0.0.{counter % 255}",
                    "dst_ip": "192.168.0.5",
                    "severity": severities[counter % len(severities)],
                    "message": "simulated",
                    "proto": "TCP",
                }
                await self.ingest(event)
                await self.update_threat_index(event)
                counter += 1
                await asyncio.sleep(self._simulate_interval)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.exception("Simulation error: %s", exc)
                await asyncio.sleep(self._simulate_interval)

    async def _update_backlog(self) -> None:
        """Update Prometheus backlog gauge."""
        if not self._redis:
            # Attempt a lazy reconnect when metrics are requested.
            await self._ensure_redis()
        if not self._redis:
            return
        try:
            length = await self._redis.xlen(self._stream_key)
        except Exception:
            length = 0
        REDIS_BACKLOG.set(length)

    async def _ensure_redis(self) -> bool:
        """Reconnect to Redis if not initialized or disconnected."""
        sleep_after = False
        async with self._connection_lock:
            had_previous_client = self._redis is not None
            if self._redis and getattr(self._redis, "connection_pool", None):
                try:
                    # Quick ping to ensure the connection is alive.
                    await self._redis.ping()
                    return True
                except Exception as exc:
                    log.warning("[Telemetry] ⚠️ Redis ping failed (%s). Attempting reconnect.", exc)
                    self._redis = None

            try:
                self._redis = await aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    health_check_interval=30,
                    socket_keepalive=True,
                )
                self._external_client = False
                await self._redis.ping()
                emoji = "🔄" if had_previous_client else "✅"
                log.info("[Telemetry] %s Connected to Redis at %s", emoji, self._redis_url)
                return True
            except Exception as exc:
                log.warning("[Telemetry] ❌ Redis reconnect failed: %s", exc)
                self._redis = None
                sleep_after = True

        if sleep_after:
            await asyncio.sleep(2)
        return False
