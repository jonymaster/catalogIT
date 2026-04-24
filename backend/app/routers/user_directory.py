"""Read-only user listing and profiles."""

from __future__ import annotations

import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user, get_hardware_view_flag, require_role
from app.dependencies.db import get_audited_db
from app.models.laptop import Laptop
from app.models.service import Service
from app.models.user import User
from app.schemas.user import UserDirectoryPage, UserRead, user_read_from_orm
from app.schemas.user_profile import (
    UserLaptopLinkRead,
    UserProfileRead,
    UserServiceLinkRead,
)

router = APIRouter(prefix="/api/users", tags=["users"])

_writer = require_role("admin", "editor")

_MAX_DIRECTORY_PAGE = 50


def _escape_like_term(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _directory_search_filter(q: str | None):
    needle = (q or "").strip().lower()
    if not needle:
        return None
    like = f"%{_escape_like_term(needle)}%"
    return or_(
        func.lower(User.email).like(like, escape="\\"),
        func.lower(User.first_name).like(like, escape="\\"),
        func.lower(User.last_name).like(like, escape="\\"),
        func.lower(func.coalesce(User.display_name, "")).like(like, escape="\\"),
        func.lower(func.coalesce(User.department, "")).like(like, escape="\\"),
    )


@router.get("/page", response_model=UserDirectoryPage)
async def list_users_paginated(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=_MAX_DIRECTORY_PAGE),
    q: str | None = Query(None, max_length=255),
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


@router.get("/{user_id}/profile", response_model=UserProfileRead)
async def get_user_profile(
    user_id: uuid.UUID,
    _current_user: User = Depends(get_current_user),
    has_hardware_view: bool = Depends(get_hardware_view_flag),
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.permission_rows))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    owned_services_result = await db.execute(
        select(Service)
        .options(selectinload(Service.category_rel))
        .where(Service.owners.any(User.id == user.id))
        .order_by(Service.name)
    )
    assigned_services_result = await db.execute(
        select(Service)
        .options(selectinload(Service.category_rel))
        .where(Service.assignees.any(User.id == user.id))
        .order_by(Service.name)
    )
    if has_hardware_view:
        assigned_laptops_result = await db.execute(
            select(Laptop)
            .options(selectinload(Laptop.hardware_location))
            .where(Laptop.assigned_to_id == user.id)
            .order_by(Laptop.serial_number)
        )
        assigned_laptops_rows = list(assigned_laptops_result.scalars().all())
    else:
        assigned_laptops_rows = []

    def to_service_link(service: Service) -> UserServiceLinkRead:
        return UserServiceLinkRead(
            id=service.id,
            name=service.name,
            status=service.status,
            is_active=service.is_active,
            category_name=service.category_rel.name if service.category_rel else None,
        )

    def to_laptop_link(laptop: Laptop) -> UserLaptopLinkRead:
        return UserLaptopLinkRead(
            id=laptop.id,
            model_name=laptop.model_name,
            serial_number=laptop.serial_number,
            status=laptop.status,
            is_active=laptop.is_active,
            hardware_location_name=(
                laptop.hardware_location.name if laptop.hardware_location else None
            ),
        )

    return UserProfileRead(
        user=user_read_from_orm(user),
        owned_services=[
            to_service_link(service)
            for service in owned_services_result.scalars().all()
        ],
        assigned_services=[
            to_service_link(service) for service in assigned_services_result.scalars().all()
        ],
        assigned_laptops=[to_laptop_link(laptop) for laptop in assigned_laptops_rows],
    )
