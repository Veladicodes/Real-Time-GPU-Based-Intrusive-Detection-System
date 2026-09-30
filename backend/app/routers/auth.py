"""Token issuance endpoint for RT-GIDS: exchange the shared API token for a
short-lived (24h) signed JWT."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import app.security as security

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class TokenRequest(BaseModel):
    api_token: str


@router.post("/token", status_code=status.HTTP_200_OK)
async def create_token(payload: TokenRequest) -> dict:
    # Read via the module object (not a name imported at module-load time) so
    # env-driven/monkeypatched changes to API_TOKEN are respected at request time.
    if payload.api_token != security.API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid API token")
    return security.issue_token()
