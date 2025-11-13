"""Aggregated attack summaries and narrative insights."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

try:
    from redis.asyncio import Redis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover
    from aioredis import Redis  # type: ignore

from app.dependencies import get_redis

router = APIRouter(prefix="/api/summary", tags=["Attack Summaries"])

class TimelinePointModel(BaseModel):
    minute: str = Field(..., description="Minute label in HH:MM format.")
    count: int = Field(..., description="Number of events in this minute.")


class SummaryResponse(BaseModel):
    attack_rate: float = Field(..., description="Average attacks per minute in the window.")
    top_ips: dict[str, int] = Field(default_factory=dict, description="Top source IPs ranked by volume.")
    top_ports: dict[str, int] = Field(default_factory=dict, description="Top destination ports targeted.")
    protocols: dict[str, int] = Field(default_factory=dict, description="Protocol distribution.")
    timeline: list[TimelinePointModel] = Field(..., description="Minute buckets for charting.")
    total_events: int = Field(..., description="Total number of high-risk events considered.")
    narrative: str = Field(..., description="Human-readable summary of current threat posture.")


@router.get(
    "/attacks",
    response_model=SummaryResponse,
    summary="Summarise recent attack telemetry.",
    response_description="Aggregated statistics for dashboards and analyst tooling.",
)
async def read_attack_summary(
    request: Request,
    minutes: int = Query(
        5,
        ge=1,
        le=60,
        description="Time window in minutes to aggregate over.",
    ),
    redis: Redis = Depends(get_redis),
) -> SummaryResponse:
    """
    Summarise the most recent telemetry signals.

    Example:

    ```
    curl 'http://localhost:8000/api/summary/attacks?minutes=5'
    ```
    """
    summary_service = getattr(request.app.state, "summary_service", None)
    narrative_service = getattr(request.app.state, "narrative_service", None)

    if summary_service is None or narrative_service is None:
        raise HTTPException(status_code=503, detail="Summary services unavailable")

    stats = await summary_service.get_summary(redis, minutes=minutes)
    narrative = await narrative_service.generate(redis, minutes=minutes)
    timeline = [TimelinePointModel(**point) for point in stats.pop("timeline", [])]

    return SummaryResponse(
        narrative=narrative,
        timeline=timeline,
        **stats,
    )


class NarrativeResponse(BaseModel):
    narrative: str = Field(..., description="Latest AI-generated narrative for threat telemetry.")
    generated_at: datetime = Field(..., description="UTC timestamp the narrative was generated.")
    minutes: int = Field(..., description="Lookback window used to generate the narrative.")


@router.get(
    "/narrative",
    response_model=NarrativeResponse,
    summary="Retrieve the latest AI-generated narrative synopsis.",
)
async def read_narrative(
    request: Request,
    minutes: int = Query(
        5,
        ge=1,
        le=60,
        description="Time window in minutes to synthesise the narrative.",
    ),
    redis: Redis = Depends(get_redis),
) -> NarrativeResponse:
    narrative_service = getattr(request.app.state, "narrative_service", None)
    if narrative_service is None:
        raise HTTPException(status_code=503, detail="Narrative service unavailable")
    narrative = await narrative_service.generate(redis, minutes=minutes)
    return NarrativeResponse(
        narrative=narrative,
        generated_at=datetime.now(timezone.utc),
        minutes=minutes,
    )


