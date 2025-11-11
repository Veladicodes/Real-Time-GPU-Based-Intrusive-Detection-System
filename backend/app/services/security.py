"""Security utilities for RT-GIDS backend."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

ADMIN_TOKEN_ENV = "ADMIN_TOKEN"
API_TOKEN_HEADER = "X-Admin-Token"

api_key_header = APIKeyHeader(name=API_TOKEN_HEADER, auto_error=False)


def get_admin_token() -> Optional[str]:
    """Return the configured admin token from env, if any."""
    return os.getenv(ADMIN_TOKEN_ENV)


async def require_admin_token(api_key: Optional[str] = Security(api_key_header)) -> str:
    """Validate that a request includes the expected admin token.

    Currently used as a stub – write endpoints can reuse this dependency later.
    """
    expected = get_admin_token()
    if not expected:
        # When no token is configured, allow all requests (Tier-0 stub).
        return ""

    if api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
        )
    return api_key


def admin_dependency() -> Depends:
    """Helper for wiring the admin security dependency."""
    return Depends(require_admin_token)


