"""TDD coverage for the global API rate limit matching the documented 100/minute.

User journey:
  As the RT-GIDS operator, I want every API route protected by a default
  100 requests/minute limit (not just the two hand-picked model-insights
  routes that currently have an explicit @limiter.limit decorator), so the
  documented "100 req/min rate limiting" claim is actually enforced globally.
"""

from __future__ import annotations

from app.routers.model_insights import limiter


def _default_limit_strings() -> list[str]:
    return [
        limit_group._LimitGroup__limit_provider
        for limit_group in limiter._default_limits
    ]


def test_limiter_has_a_global_default_limit_configured() -> None:
    assert limiter._default_limits, "Limiter has no default_limits; only per-route limits apply"


def test_limiter_default_limit_is_100_per_minute() -> None:
    assert "100/minute" in _default_limit_strings()
