from __future__ import annotations

import secrets
import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.api_token import ApiToken
from app.models.user import User
from app.schemas.api_token import ApiTokenCreate, ApiTokenCreated, ApiTokenRead

router = APIRouter(prefix="/api/settings/tokens", tags=["api-tokens"])

_admin = require_role("admin")


@router.get("/", response_model=list[ApiTokenRead])
async def list_tokens(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(
        select(ApiToken).order_by(ApiToken.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ApiTokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(
    body: ApiTokenCreate,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    raw_token = secrets.token_urlsafe(48)
    token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()

    token = ApiToken(
        name=body.name,
        token_hash=token_hash,
        token_prefix=raw_token[:8],
        created_by_id=user.id,
        expires_at=body.expires_at,
    )
    db.add(token)
    await db.flush()
    await db.refresh(token)

    return ApiTokenCreated(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        created_by_id=token.created_by_id,
        created_at=token.created_at,
        expires_at=token.expires_at,
        last_used_at=token.last_used_at,
        is_revoked=token.is_revoked,
        raw_token=raw_token,
    )


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    token = await db.get(ApiToken, token_id)
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    token.is_revoked = True
    await db.flush()
