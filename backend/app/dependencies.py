from __future__ import annotations

import os
from functools import lru_cache
from typing import AsyncIterator

try:
    import redis.asyncio as aioredis  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - fallback for older redis versions
    import aioredis  # type: ignore


@lru_cache
def get_redis_url() -> str:
    """
    Return the Redis connection URL from environment variables, defaulting to localhost.
    """
    return os.getenv("REDIS_URL", "redis://localhost:6379/0")


async def get_redis() -> AsyncIterator[aioredis.Redis]:
    """
    Provide an async Redis client for request-scoped usage.
    Ensures connections are closed after each request.
    """
    redis = aioredis.from_url(get_redis_url(), encoding="utf-8", decode_responses=True)
    try:
        yield redis
    finally:
        await redis.close()
