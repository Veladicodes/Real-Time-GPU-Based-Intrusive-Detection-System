import os
import time
from typing import Any, Dict

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

JWT_SECRET = os.getenv("RTGIDS_JWT_SECRET", "change-me-in-prod")
JWT_ALG = os.getenv("RTGIDS_JWT_ALG", "HS256")
API_TOKEN = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")
JWT_LIFETIME_SECONDS = 24 * 60 * 60  # 24h expiry

bearer = HTTPBearer(auto_error=False)


def issue_token(subject: str = "api-client") -> Dict[str, Any]:
    """Issue a signed JWT with a 24h expiry for the given subject."""
    now = int(time.time())
    claims = {"sub": subject, "iat": now, "exp": now + JWT_LIFETIME_SECONDS}
    access_token = jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALG)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": JWT_LIFETIME_SECONDS,
    }


def decode_token(raw_token: str) -> Dict[str, Any]:
    if raw_token.startswith("api::"):
        token = raw_token.split("api::", 1)[1]
        if token != API_TOKEN:
            raise HTTPException(status_code=401, detail="Invalid API token")
        return {"type": "api_token"}
    try:
        # require=["exp"] rejects any JWT that omits an expiry claim, so a token
        # can never grant indefinite access even if it's otherwise validly signed.
        return jwt.decode(
            raw_token, JWT_SECRET, algorithms=[JWT_ALG], options={"require": ["exp"]}
        )
    except jwt.ExpiredSignatureError as exc:  # pragma: no cover - depends on runtime clock
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except Exception as exc:  # pragma: no cover - unexpected decode failure
        raise HTTPException(status_code=401, detail="Invalid JWT") from exc


def verify_jwt_token(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Dict[str, Any]:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing credentials")
    return decode_token(creds.credentials)
