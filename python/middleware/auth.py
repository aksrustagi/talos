"""
Authentication Middleware

Validates JWT tokens on incoming requests and extracts user identity.
Falls back to header-based auth (for development) when JWT is not configured.
"""

import os
import time
from typing import Optional
from dataclasses import dataclass

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import structlog

logger = structlog.get_logger(__name__)

# Configuration — set TALOS_JWT_SECRET to enable JWT validation.
# When unset, header-based auth is used (development mode).
JWT_SECRET = os.environ.get("TALOS_JWT_SECRET")
JWT_ALGORITHM = os.environ.get("TALOS_JWT_ALGORITHM", "HS256")

# Paths that don't require authentication
PUBLIC_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}


@dataclass
class AuthUser:
    """Authenticated user context."""
    user_id: str
    university_id: str
    email: str
    department: str
    role: str          # requester, approver, admin
    auth_method: str   # "jwt" or "header"


def _decode_jwt(token: str) -> dict:
    """Decode and validate a JWT token. Returns the payload dict."""
    try:
        import jwt
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="JWT support requires PyJWT: pip install PyJWT",
        )

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    required = {"sub", "university_id", "email"}
    missing = required - set(payload.keys())
    if missing:
        raise HTTPException(
            status_code=401,
            detail=f"Token missing required claims: {missing}",
        )
    return payload


def get_auth_user(request: Request) -> AuthUser:
    """Extract authenticated user from the request.

    Priority:
    1. If TALOS_JWT_SECRET is set → require Authorization: Bearer <jwt>
    2. Otherwise → read X-User-ID etc. headers (dev mode)

    Raises HTTPException(401) on auth failure.
    """
    # Skip auth for public paths
    if request.url.path in PUBLIC_PATHS:
        return AuthUser(
            user_id="anonymous",
            university_id="anonymous",
            email="anonymous@localhost",
            department="",
            role="anonymous",
            auth_method="none",
        )

    # ---- JWT path ----
    if JWT_SECRET:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="Missing Authorization header. Expected: Bearer <jwt>",
            )
        token = auth_header[7:]
        payload = _decode_jwt(token)
        return AuthUser(
            user_id=payload["sub"],
            university_id=payload["university_id"],
            email=payload["email"],
            department=payload.get("department", ""),
            role=payload.get("role", "requester"),
            auth_method="jwt",
        )

    # ---- Header-based path (development) ----
    user_id = request.headers.get("X-User-ID", "")
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Missing X-User-ID header (or set TALOS_JWT_SECRET for JWT auth)",
        )

    return AuthUser(
        user_id=user_id,
        university_id=request.headers.get("X-University-ID", "default"),
        email=request.headers.get("X-User-Email", f"{user_id}@university.edu"),
        department=request.headers.get("X-Department", ""),
        role=request.headers.get("X-Role", "requester"),
        auth_method="header",
    )


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware that attaches AuthUser to every request.

    Access via `request.state.auth_user` in endpoint handlers.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            request.state.auth_user = get_auth_user(request)
        except HTTPException as exc:
            # Return JSON error response instead of raising
            # (BaseHTTPMiddleware doesn't propagate HTTPException correctly)
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )
        except Exception as e:
            logger.error("auth_middleware_error", error=str(e))
            return JSONResponse(
                status_code=500,
                content={"detail": "Authentication error"},
            )

        response = await call_next(request)
        return response
