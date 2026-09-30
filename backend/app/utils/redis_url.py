"""Builds the Redis connection URL, injecting scoped ACL credentials when configured.

Falls back to the plain REDIS_URL (or a sensible default) when RTGIDS_REDIS_USER /
RTGIDS_REDIS_PASSWORD aren't set, so existing default-user deployments keep working.
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit, urlunsplit


def build_redis_url() -> str:
    base_url = os.getenv("REDIS_URL")
    if not base_url:
        base_url = (
            "redis://host.docker.internal:6379/0"
            if os.path.exists("/.dockerenv")
            else "redis://localhost:6379/0"
        )

    user = os.getenv("RTGIDS_REDIS_USER")
    password = os.getenv("RTGIDS_REDIS_PASSWORD")
    if not user or not password:
        return base_url

    parts = urlsplit(base_url)
    netloc = f"{user}:{password}@{parts.hostname}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
