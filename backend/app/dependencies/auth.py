from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timezone

import secrets

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.api_token import ApiToken
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)

ROLE_HIERARCHY = {"viewer": 0, "editor": 1, "admin": 2}


def _utc_now_naive() -> datetime:
    """UTC now as naive datetime for columns stored as TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _authenticate_via_api_token(raw_token: str, db: AsyncSession) -> User | None:
    """Try to match a raw bearer token against stored API tokens."""
    prefix = raw_token[:8]
    result = await db.execute(
        select(ApiToken).where(
            ApiToken.token_prefix == prefix,
            ApiToken.is_revoked == False,  # noqa: E712
        )
    )
    candidates = result.scalars().all()

    for candidate in candidates:
        if candidate.expires_at and candidate.expires_at < _utc_now_naive():
            continue
        if bcrypt.checkpw(raw_token.encode(), candidate.token_hash.encode()):
            candidate.last_used_at = _utc_now_naive()
            user = await db.get(User, candidate.created_by_id)
            if user and user.is_active:
                return user
    return None


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via JWT or API token, returning the User."""
    raw_token = token or (bearer.credentials if bearer else None)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    settings = get_settings()
    try:
        payload = jwt.decode(raw_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        user = await _authenticate_via_api_token(raw_token, db)
        if user:
            return user
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_role(*allowed_roles: str) -> Callable:
    """Return a dependency that enforces the user has one of the given roles."""
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user
    return _check


def require_scim_token(
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Validate the static SCIM Bearer token used for provisioning."""
    settings = get_settings()
    if not bearer or not settings.SCIM_TOKEN or not secrets.compare_digest(bearer.credentials, settings.SCIM_TOKEN):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid SCIM token")
    return bearer.credentials
