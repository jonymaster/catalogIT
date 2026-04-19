"""Read-only user listing for editors and admins (pickers, assignments)."""

from __future__ import annotations

from math import ceil
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.user import User
from app.schemas.user import UserDirectoryPage, UserRead, user_read_from_orm

router = APIRouter(prefix="/api/users", tags=["users"])

_writer = require_role("admin", "editor")

_MAX_DIRECTORY_PAGE = 50


def _directory_search_filter(q: str | None) -> Any:
    if not q or not q.strip():
        return None
    term = f"%{q.strip()}%"
    return or_(
        User.email.ilike(term),
        User.first_name.ilike(term),
        User.last_name.ilike(term),
        User.display_name.ilike(term),
    )


@router.get("/page", response_model=UserDirectoryPage)
async def list_users_paginated(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=_MAX_DIRECTORY_PAGE),
    q: str | None = Query(None),
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    filt = _directory_search_filter(q)
    count_stmt = select(func.count()).select_from(User)
    list_stmt = (
        select(User)
        .options(selectinload(User.permission_rows))
        .order_by(User.email)
    )
    if filt is not None:
        count_stmt = count_stmt.where(filt)
        list_stmt = list_stmt.where(filt)

    total = int((await db.execute(count_stmt)).scalar_one())
    total_pages = max(1, ceil(total / per_page)) if total > 0 else 1
    offset = (page - 1) * per_page
    result = await db.execute(list_stmt.offset(offset).limit(per_page))
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
