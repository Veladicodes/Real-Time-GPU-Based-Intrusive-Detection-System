"""Rule-based narrative generation for security analysts."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:  # Prefer redis.asyncio but allow aioredis fallback to support legacy installs
    from redis.asyncio import Redis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - redis<4.2
    from aioredis import Redis  # type: ignore

from .summary_service import SummaryService


class NarrativeService:
    """Compose concise analyst-friendly narratives using recent telemetry statistics."""

    def __init__(self, summary_service: Optional[SummaryService] = None) -> None:
        self.summary_service = summary_service or SummaryService()

    async def generate(self, redis: Redis, minutes: int = 5) -> str:
        """
        Return a short English narration of the recent attack landscape.

        Parameters
        ----------
        redis:
            Redis connection obtained via :func:`app.dependencies.get_redis`.
        minutes:
            Lookback window used for the summary calculations.
        """
        summary = await self.summary_service.get_summary(redis, minutes=minutes)

        timestamp = datetime.now(timezone.utc).strftime("%H:%M UTC")
        total = summary.get("total_events", 0)
        attack_rate = summary.get("attack_rate", 0.0)
        top_ip = _first_item(summary.get("top_ips", {}))
        top_port = _first_item(summary.get("top_ports", {}))
        top_proto = _first_item(summary.get("protocols", {}))
        timeline = summary.get("timeline") or []

        if total == 0:
            return (
                f"As of {timestamp}, no suspicious activity was detected in the last "
                f"{minutes} minute{'s' if minutes != 1 else ''}. All monitored channels remain quiet."
            )

        sentences = [
            (
                f"As of {timestamp}, approximately {total} high-risk events were observed in the last "
                f"{minutes} minute{'s' if minutes != 1 else ''}, averaging {attack_rate:.1f} per minute."
            )
        ]

        if top_ip:
            share = (top_ip[1] / total) if total else 0.0
            sentences.append(
                f"The most active source was {top_ip[0]} accounting for {share:.0%} of alerts."
            )

        if top_port:
            sentences.append(
                f"Most probes targeted destination port {top_port[0]} ({top_port[1]} attempts)."
            )

        if top_proto:
            sentences.append(f"Traffic remained predominantly {top_proto[0]} protocol.")

        if len(timeline) >= 2:
            last_bucket = timeline[-1]["count"]
            previous_avg = (
                sum(bucket["count"] for bucket in timeline[:-1]) / max(len(timeline) - 1, 1)
            )
            if last_bucket > previous_avg * 1.5 and last_bucket >= 3:
                sentences.append("Alert frequency spiked in the most recent minute — investigate promptly.")
            elif last_bucket <= previous_avg * 0.5 and previous_avg > 0:
                sentences.append("Activity has cooled compared to the preceding minutes.")

        sentences.append("Recommend reviewing correlated alerts to confirm containment.")
        return " ".join(sentences)


def _first_item(mapping: Dict[str, Any]) -> tuple[str, float] | None:
    if not mapping:
        return None
    first_key = next(iter(mapping))
    return first_key, float(mapping[first_key])


