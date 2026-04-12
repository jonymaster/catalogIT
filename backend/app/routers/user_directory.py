"""Read-only user listing for editors and admins (pickers, assignments)."""

from __future__ import annotations

from math import ceil

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.user import User
from app.schemas.user import UserDirectoryPage, UserRead, user_read_from_orm

router = APIRouter(prefix="/api/users", tags=["users"])

_writer = require_role("admin", "editor")

_MAX_DIRECTORY_PAGE = 50


@router.get("/page", response_model=UserDirectoryPage)
async def list_users_paginated(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=_MAX_DIRECTORY_PAGE),
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    total = int(
        (await db.execute(select(func.count()).select_from(User))).scalar_one()
    )
    total_pages = max(1, ceil(total / per_page)) if total > 0 else 1
    offset = (page - 1) * per_page
    result = await db.execute(
        select(User)
        .options(selectinload(User.permission_rows))
        .order_by(User.email)
        .offset(offset)
        .limit(per_page)
    )
    items = [user_read_from_orm(u) for u in result.scalars().all()]
    return UserDirectoryPage(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/", response_model=list[UserRead])
async def list_users_for_directory(
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(
        select(User).options(selectinload(User.permission_rows)).order_by(User.email)
    )
    return [user_read_from_orm(u) for u in result.scalars().all()]
