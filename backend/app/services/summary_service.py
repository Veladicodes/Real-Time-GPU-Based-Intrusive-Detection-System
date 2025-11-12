"""Services for aggregating recent telemetry activity into concise summaries."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, MutableMapping

try:  # Prefer redis.asyncio but allow aioredis fallback for legacy deployments
    from redis.asyncio import Redis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - fallback for redis<4.2
    from aioredis import Redis  # type: ignore


DEFAULT_LOG_KEY = "logs"


@dataclass(slots=True)
class TimelinePoint:
    """Minute-level aggregation suitable for sparkline visualisations."""
    minute: str
    count: int


@dataclass(slots=True)
class SummarySnapshot:
    """Structured summary of recent attack telemetry."""
    attack_rate: float
    top_ips: Dict[str, int]
    top_ports: Dict[str, int]
    protocols: Dict[str, int]
    timeline: List[TimelinePoint]
    total_events: int

    def as_dict(self) -> Dict[str, Any]:
        """Return a JSON-serializable dictionary representation."""
        return {
            "attack_rate": self.attack_rate,
            "top_ips": self.top_ips,
            "top_ports": self.top_ports,
            "protocols": self.protocols,
            # ✅ FIX: Support dataclass(slots=True) serialization
            "timeline": [asdict(point) for point in self.timeline],
            "total_events": self.total_events,
        }


class SummaryService:
    """
    Aggregate rolling metrics over the Redis-backed telemetry list.

    Telemetry producers are expected to LPUSH JSON-encoded dictionaries into the Redis
    list identified by ``log_key`` (defaults to ``logs``). Each entry should contain a
    timestamp field (epoch seconds or ISO 8601). When absent, the current time is used
    so the event still contributes to the moving window.
    """

    def __init__(self, log_key: str = DEFAULT_LOG_KEY, max_entries: int = 1_000) -> None:
        self.log_key = log_key
        self.max_entries = max_entries

    async def get_recent_logs(self, redis: Redis, minutes: int = 5) -> List[Dict[str, Any]]:
        """
        Return parsed telemetry events observed within the last ``minutes``.

        Only the most recent ``max_entries`` items are inspected to keep the call bounded.
        Invalid JSON payloads are ignored.
        """
        if minutes <= 0:
            raise ValueError("minutes must be a positive integer")

        try:
            raw_items = await redis.lrange(self.log_key, 0, self.max_entries - 1)
        except Exception:
            raw_items = []

        if not raw_items:
            return []

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        events: List[Dict[str, Any]] = []
        for raw in raw_items:
            try:
                entry = json.loads(raw)
                if not isinstance(entry, MutableMapping):
                    continue
            except Exception:
                continue

            ts = self._coerce_timestamp(entry)
            if ts < cutoff:
                # Redis returns newest to oldest when using lrange 0..n after LPUSH.
                continue
            entry["_timestamp"] = ts
            events.append(entry)
        return events

    async def get_summary(self, redis: Redis, minutes: int = 5) -> Dict[str, Any]:
        """Summarise telemetry events over the recent window."""
        events = await self.get_recent_logs(redis, minutes=minutes)
        if not events:
            return SummarySnapshot(
                attack_rate=0.0,
                top_ips={},
                top_ports={},
                protocols={},
                timeline=self._empty_timeline(minutes),
                total_events=0,
            ).as_dict()

        attack_counter = 0
        ips: Counter[str] = Counter()
        ports: Counter[str] = Counter()
        protos: Counter[str] = Counter()
        timeline_buckets: defaultdict[str, int] = defaultdict(int)

        for event in events:
            timestamp = event["_timestamp"]
            ips_key = self._extract_ip(event)
            port_key = self._extract_port(event)
            proto_key = self._extract_proto(event)

            if ips_key:
                ips[ips_key] += 1
            if port_key:
                ports[port_key] += 1
            if proto_key:
                protos[proto_key] += 1

            if self._is_attack(event):
                attack_counter += 1

            minute_key = timestamp.strftime("%H:%M")
            timeline_buckets[minute_key] += 1

        attack_rate = attack_counter / minutes if minutes > 0 else float(attack_counter)

        snapshot = SummarySnapshot(
            attack_rate=round(attack_rate, 2),
            top_ips=self._top_n_dict(ips),
            top_ports=self._top_n_dict(ports),
            protocols=dict(sorted(protos.items(), key=lambda kv: kv[1], reverse=True)),
            timeline=self._build_timeline(minutes, timeline_buckets),
            total_events=len(events),
        )
        return snapshot.as_dict()

    @staticmethod
    def _coerce_timestamp(event: MutableMapping[str, Any]) -> datetime:
        """Extract an aware UTC timestamp from multiple possible fields."""
        candidates: Iterable[Any] = (
            event.get("timestamp"),
            event.get("ts"),
            event.get("time"),
            event.get("@timestamp"),
        )
        for candidate in candidates:
            if candidate is None:
                continue
            if isinstance(candidate, (int, float)):
                value = float(candidate)
                if value > 1_000_000_000_000:
                    value /= 1_000
                return datetime.fromtimestamp(value, tz=timezone.utc)
            if isinstance(candidate, str):
                text = candidate.strip()
                for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
                    try:
                        dt_value = datetime.strptime(text.replace("Z", ""), fmt)
                        return dt_value.replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                try:
                    dt_value = datetime.fromisoformat(text.replace("Z", "+00:00"))
                    if dt_value.tzinfo is None:
                        dt_value = dt_value.replace(tzinfo=timezone.utc)
                    return dt_value.astimezone(timezone.utc)
                except ValueError:
                    continue
        return datetime.now(timezone.utc)

    @staticmethod
    def _extract_ip(event: MutableMapping[str, Any]) -> str | None:
        for key in ("src_ip", "source_ip", "ip_src", "attacker_ip"):
            value = event.get(key)
            if isinstance(value, str) and value:
                return value
        source = event.get("source")
        if isinstance(source, MutableMapping):
            value = source.get("ip")
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def _extract_port(event: MutableMapping[str, Any]) -> str | None:
        for key in ("dst_port", "destination_port", "port", "dest_port"):
            value = event.get(key)
            if isinstance(value, int):
                return str(value)
            if isinstance(value, str) and value.isdigit():
                return value
        destination = event.get("destination")
        if isinstance(destination, MutableMapping):
            value = destination.get("port")
            if isinstance(value, (int, str)):
                return str(value)
        return None

    @staticmethod
    def _extract_proto(event: MutableMapping[str, Any]) -> str:
        for key in ("proto", "protocol", "protocol_name"):
            value = event.get(key)
            if isinstance(value, str) and value:
                return value.upper()
        return "UNKNOWN"

    @staticmethod
    def _is_attack(event: MutableMapping[str, Any]) -> bool:
        if bool(event.get("is_attack")):
            return True
        label = str(
            event.get("label")
            or event.get("category")
            or event.get("status")
            or event.get("level")
            or ""
        ).lower()
        if "attack" in label or "malicious" in label:
            return True
        severity = str(event.get("severity") or "").upper()
        return severity in {"ALERT", "CRITICAL", "HIGH"}

    @staticmethod
    def _top_n_dict(counter: Counter[str], limit: int = 10) -> Dict[str, int]:
        return {key: int(count) for key, count in counter.most_common(limit)}

    @staticmethod
    def _empty_timeline(minutes: int) -> List[TimelinePoint]:
        now = datetime.now(timezone.utc)
        return [
            TimelinePoint(minute=(now - timedelta(minutes=offset)).strftime("%H:%M"), count=0)
            for offset in range(minutes - 1, -1, -1)
        ]

    @staticmethod
    def _build_timeline(minutes: int, buckets: MutableMapping[str, int]) -> List[TimelinePoint]:
        now = datetime.now(timezone.utc)
        timeline: List[TimelinePoint] = []
        for offset in range(minutes - 1, -1, -1):
            label = (now - timedelta(minutes=offset)).strftime("%H:%M")
            timeline.append(TimelinePoint(minute=label, count=int(buckets.get(label, 0))))
        return timeline
