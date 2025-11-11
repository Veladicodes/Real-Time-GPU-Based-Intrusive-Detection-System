"""Real-time analytics engine for RT-GIDS log processing."""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import re
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)

LOG_LINE_REGEX = re.compile(
    r"""
    ^\[
    (?P<timestamp>[^\]]+)
    \]                    # closing bracket
    \s*
    (?P<status>.+?)
    \|
    \s*Src\s+IP:\s*(?P<src_ip>[^\s\|]+)?
    \s*\|
    \s*Src\s+Port:\s*(?P<src_port>\d+)
    \s*\|
    \s*Dst\s+IP:\s*(?P<dst_ip>[^\s\|]+)?
    \s*\|
    \s*Dst\s+Port:\s*(?P<dst_port>\d+)
    """,
    re.VERBOSE | re.IGNORECASE,
)


@dataclass(slots=True)
class ParsedLogLine:
    """Structured representation of a log entry."""

    raw: str
    timestamp: dt.datetime
    traffic_type: str
    src_ip: Optional[str]
    src_port: Optional[int]
    dst_ip: Optional[str]
    dst_port: Optional[int]
    category: str


class AnalyticsEngine:
    """Maintains rolling metrics for REST endpoints and WebSocket feeds."""

    def __init__(self, attack_history_limit: int = 1000) -> None:
        self._lock = asyncio.Lock()
        self._total_packets = 0
        self._attack_packets = 0
        self._attack_history: Deque[ParsedLogLine] = deque(maxlen=attack_history_limit)
        self._minute_buckets: Dict[str, Dict[str, int]] = defaultdict(lambda: {"attack": 0, "normal": 0})
        self._blocked_ips: Counter[str] = Counter()

    async def bootstrap_from_lines(self, lines: Iterable[str]) -> None:
        """Process historical log lines to seed caches."""
        async with self._lock:
            for line in lines:
                parsed = self._parse_line(line)
                if not parsed:
                    continue
                self._update_metrics_locked(parsed)

    async def handle_line(self, line: str) -> Optional[ParsedLogLine]:
        """Parse and integrate a new log line into analytics state."""
        parsed = self._parse_line(line)
        if not parsed:
            logger.debug("Failed to parse log line: %s", line)
            return None

        async with self._lock:
            self._update_metrics_locked(parsed)
        return parsed

    def _parse_line(self, line: str) -> Optional[ParsedLogLine]:
        """Return structured data extracted from a raw log line."""
        match = LOG_LINE_REGEX.search(line)
        timestamp: Optional[dt.datetime] = None
        traffic_type = "UNKNOWN"
        src_ip: Optional[str] = None
        dst_ip: Optional[str] = None
        src_port: Optional[int] = None
        dst_port: Optional[int] = None

        if match:
            raw_ts = match.group("timestamp")
            try:
                timestamp = dt.datetime.fromisoformat(raw_ts)
            except ValueError:
                try:
                    timestamp = dt.datetime.strptime(raw_ts, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    logger.debug("Could not parse timestamp: %s", raw_ts)
            traffic_type = match.group("status").strip()
            src_ip = match.group("src_ip")
            dst_ip = match.group("dst_ip")
            src_port = self._safe_int(match.group("src_port"))
            dst_port = self._safe_int(match.group("dst_port"))
        else:
            # Fallback for legacy log format without IPs
            timestamp = self._extract_timestamp(line)
            traffic_type = self._extract_status(line)
            src_port = self._extract_port(line, "Src Port")
            dst_port = self._extract_port(line, "Dst Port")

        category = "attack" if "attack" in traffic_type.lower() else "normal"
        return ParsedLogLine(
            raw=line.strip(),
            timestamp=timestamp or dt.datetime.utcnow(),
            traffic_type=traffic_type,
            src_ip=src_ip,
            src_port=src_port,
            dst_ip=dst_ip,
            dst_port=dst_port,
            category=category,
        )

    @staticmethod
    def _extract_timestamp(line: str) -> Optional[dt.datetime]:
        if not line.startswith("["):
            return None
        try:
            closing = line.index("]")
        except ValueError:
            return None
        raw = line[1:closing]
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                return dt.datetime.strptime(raw, fmt)
            except ValueError:
                continue
        return None

    @staticmethod
    def _extract_status(line: str) -> str:
        if "]" in line:
            rest = line.split("]", 1)[1]
            return rest.split("|", 1)[0].strip()
        return line.strip()

    @staticmethod
    def _extract_port(line: str, label: str) -> Optional[int]:
        pattern = rf"{label}:\s*(\d+)"
        match = re.search(pattern, line)
        if match:
            return AnalyticsEngine._safe_int(match.group(1))
        return None

    @staticmethod
    def _safe_int(value: Optional[str]) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None

    def _update_metrics_locked(self, parsed: ParsedLogLine) -> None:
        self._total_packets += 1
        minute_key = parsed.timestamp.strftime("%Y-%m-%d %H:%M")
        self._minute_buckets[minute_key][parsed.category] += 1

        if parsed.category == "attack":
            self._attack_packets += 1
            if parsed.src_ip:
                self._blocked_ips.update([parsed.src_ip])
            self._attack_history.append(parsed)

    async def get_metrics(self) -> Dict[str, int]:
        async with self._lock:
            normal_packets = self._total_packets - self._attack_packets
            return {
                "total_packets": self._total_packets,
                "attack_packets": self._attack_packets,
                "normal_packets": max(normal_packets, 0),
                "unique_ips_blocked": len(self._blocked_ips),
            }

    async def get_attacks(self, limit: Optional[int] = None) -> List[Dict[str, object]]:
        async with self._lock:
            entries = list(self._attack_history)
            if limit:
                entries = entries[-limit:]
            return [
                {
                    "timestamp": entry.timestamp.isoformat(),
                    "src_ip": entry.src_ip,
                    "src_port": entry.src_port,
                    "dst_ip": entry.dst_ip,
                    "dst_port": entry.dst_port,
                    "description": entry.traffic_type,
                }
                for entry in entries
            ]

    async def get_top_ips(self, limit: int = 10) -> List[Tuple[str, int]]:
        async with self._lock:
            return self._blocked_ips.most_common(limit)

    async def get_minute_breakdown(self) -> Dict[str, Dict[str, int]]:
        async with self._lock:
            return dict(self._minute_buckets)

    async def summarize_last_hour(self) -> str:  # pragma: no cover - stub for future AI feature
        """Placeholder for AI-generated hourly summaries."""
        return "Summary generation is not implemented yet."


