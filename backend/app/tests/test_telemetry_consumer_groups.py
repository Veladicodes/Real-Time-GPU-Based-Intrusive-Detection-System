"""TDD coverage for Redis Consumer Group + XAUTOCLAIM crash recovery in TelemetryService.

User journey:
  As the RT-GIDS ingestion pipeline, I want telemetry events consumed via a Redis
  Consumer Group (not a bare XREAD), so that multiple workers can share the stream
  and a crashed worker's unacknowledged messages can be reclaimed by XAUTOCLAIM
  instead of being lost.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Tuple

import pytest

from app.services.telemetry_service import TelemetryService


class FakeGroupRedis:
    """Minimal in-memory Redis stand-in that supports the stream + consumer-group
    commands TelemetryService needs (xadd, xgroup_create, xreadgroup, xack, xautoclaim).
    """

    def __init__(self) -> None:
        # entries: list of (id, {field: value})
        self._entries: List[Tuple[str, Dict[str, str]]] = []
        self._groups: Dict[str, Dict[str, Any]] = {}
        self._counter = 0
        self._kv: Dict[str, str] = {}

    def _next_id(self) -> str:
        self._counter += 1
        return f"{self._counter}-0"

    async def ping(self) -> str:
        return "PONG"

    async def xadd(self, key: str, fields: Dict[str, str], maxlen: int | None = None, approximate: bool = True) -> str:
        entry_id = self._next_id()
        self._entries.append((entry_id, dict(fields)))
        return entry_id

    async def xlen(self, key: str) -> int:
        return len(self._entries)

    async def publish(self, channel: str, payload: str) -> int:
        return 0

    async def xgroup_create(self, key: str, groupname: str, id: str = "$", mkstream: bool = False) -> bool:
        if groupname in self._groups:
            raise Exception("BUSYGROUP Consumer Group name already exists")
        self._groups[groupname] = {"pel": {}, "last_delivered": 0}
        return True

    async def xreadgroup(
        self, groupname: str, consumername: str, streams: Dict[str, str], count: int = 10, block: int | None = None
    ) -> List[Tuple[str, List[Tuple[str, Dict[str, str]]]]]:
        group = self._groups[groupname]
        start = group["last_delivered"]
        new_entries = self._entries[start : start + count]
        group["last_delivered"] = start + len(new_entries)
        now = time.time() * 1000
        for entry_id, fields in new_entries:
            group["pel"][entry_id] = {"consumer": consumername, "delivery_ms": now, "fields": fields}
        if not new_entries:
            return []
        return [("stream", new_entries)]

    async def xack(self, key: str, groupname: str, *ids: str) -> int:
        group = self._groups[groupname]
        acked = 0
        for entry_id in ids:
            if entry_id in group["pel"]:
                del group["pel"][entry_id]
                acked += 1
        return acked

    async def xautoclaim(
        self, key: str, groupname: str, consumername: str, min_idle_time: int, start_id: str = "0-0", count: int = 100
    ) -> Tuple[str, List[Tuple[str, Dict[str, str]]], List[str]]:
        group = self._groups[groupname]
        now = time.time() * 1000
        claimed: List[Tuple[str, Dict[str, str]]] = []
        for entry_id, pel_entry in list(group["pel"].items()):
            idle = now - pel_entry["delivery_ms"]
            if idle >= min_idle_time:
                pel_entry["consumer"] = consumername
                pel_entry["delivery_ms"] = now
                claimed.append((entry_id, pel_entry["fields"]))
        return ("0-0", claimed, [])

    async def close(self) -> None:
        return None


@pytest.fixture
def telemetry() -> TelemetryService:
    svc = TelemetryService("redis://fake")
    svc.attach_redis_client(FakeGroupRedis())
    return svc


@pytest.mark.asyncio
async def test_ensure_group_creates_consumer_group_once(telemetry: TelemetryService) -> None:
    await telemetry.ensure_group()
    assert "rtgids:telemetry:group" in telemetry.redis._groups


@pytest.mark.asyncio
async def test_ensure_group_is_idempotent_across_repeated_calls(telemetry: TelemetryService) -> None:
    await telemetry.ensure_group()
    # A second call must not raise even though BUSYGROUP would be returned by real Redis.
    await telemetry.ensure_group()
    assert len(telemetry.redis._groups) == 1


@pytest.mark.asyncio
async def test_consume_group_delivers_and_acks_message(telemetry: TelemetryService) -> None:
    await telemetry.ingest({"src_ip": "10.0.0.1", "severity": "ALERT"})
    await telemetry.ensure_group()

    delivered = []
    async for event in telemetry.consume_group("worker-1", max_messages=1):
        delivered.append(event)
        break

    assert len(delivered) == 1
    assert delivered[0]["src_ip"] == "10.0.0.1"
    # Message must have been acknowledged, i.e. removed from the group's PEL.
    group = telemetry.redis._groups["rtgids:telemetry:group"]
    assert group["pel"] == {}


@pytest.mark.asyncio
async def test_reclaim_stale_recovers_unacked_messages_from_crashed_consumer(telemetry: TelemetryService) -> None:
    await telemetry.ingest({"src_ip": "10.0.0.2", "severity": "WARNING"})
    await telemetry.ensure_group()

    # Simulate consumer "worker-crashed" reading the message but never ack'ing it.
    fake = telemetry.redis
    await fake.xreadgroup("rtgids:telemetry:group", "worker-crashed", {}, count=1)
    # Force the pending entry's delivery time far enough in the past to look "stale".
    for pel_entry in fake._groups["rtgids:telemetry:group"]["pel"].values():
        pel_entry["delivery_ms"] -= 120_000  # 120s ago

    reclaimed = await telemetry.reclaim_stale("worker-recovery", min_idle_ms=60_000)

    assert len(reclaimed) == 1
    assert reclaimed[0]["src_ip"] == "10.0.0.2"
    # Ownership must now belong to the recovery consumer, not the crashed one.
    pel = fake._groups["rtgids:telemetry:group"]["pel"]
    assert all(entry["consumer"] == "worker-recovery" for entry in pel.values())
