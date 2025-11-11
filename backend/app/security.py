import os
from typing import Any, Dict

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

JWT_SECRET = os.getenv("RTGIDS_JWT_SECRET", "change-me-in-prod")
JWT_ALG = os.getenv("RTGIDS_JWT_ALG", "HS256")
API_TOKEN = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")

bearer = HTTPBearer(auto_error=False)


def decode_token(raw_token: str) -> Dict[str, Any]:
    if raw_token.startswith("api::"):
        token = raw_token.split("api::", 1)[1]
        if token != API_TOKEN:
            raise HTTPException(status_code=401, detail="Invalid API token")
        return {"type": "api_token"}
    try:
        return jwt.decode(raw_token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError as exc:  # pragma: no cover - depends on runtime clock
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except Exception as exc:  # pragma: no cover - unexpected decode failure
        raise HTTPException(status_code=401, detail="Invalid JWT") from exc


def verify_jwt_token(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Dict[str, Any]:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing credentials")
    return decode_token(creds.credentials)
