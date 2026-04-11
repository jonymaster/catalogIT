from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import get_current_user
from app.database import get_db
from app.dependencies.db import get_audited_db
from app.global_audit import record_global_audit_event
from app.models.user import User
from app.schemas.user import MeProfileUpdate, UserPreferencesRead, UserPreferencesUpdate, UserRead, user_read_from_orm

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/profile", response_model=UserRead)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.permission_rows))
        .where(User.id == current_user.id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_read_from_orm(user)


@router.patch("/profile", response_model=UserRead)
async def update_profile(
    body: MeProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.provisioning_source != "local":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "managed_profile",
                "message": "Profile fields are managed by your organization.",
            },
        )

    data = body.model_dump(exclude_unset=True)
    if not data:
        result = await db.execute(
            select(User)
            .options(selectinload(User.permission_rows))
            .where(User.id == user.id)
        )
        u = result.scalar_one()
        return user_read_from_orm(u)

    if "email" in data and data["email"] is not None:
        new_email = data["email"].strip()
        clash = await db.execute(
            select(User).where(User.email == new_email, User.id != user.id)
        )
        if clash.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )
        user.email = new_email

    if "first_name" in data and data["first_name"] is not None:
        user.first_name = data["first_name"].strip()
    if "last_name" in data and data["last_name"] is not None:
        user.last_name = data["last_name"].strip()
    if "display_name" in data:
        v = data["display_name"]
        user.display_name = v.strip() if isinstance(v, str) else v
        if user.display_name == "":
            user.display_name = None
    if "department" in data:
        v = data["department"]
        user.department = v.strip() if isinstance(v, str) and v.strip() else None

    await db.flush()
    await db.refresh(user)

    await record_global_audit_event(
        db,
        category="security",
        event_type="profile_updated",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=user.id,
        summary="User updated their profile",
        details={k: data[k] for k in data if k != "password"},
        entity_label=user.email,
    )
    result = await db.execute(
        select(User)
        .options(selectinload(User.permission_rows))
        .where(User.id == user.id)
    )
    u = result.scalar_one()
    return user_read_from_orm(u)


@router.get("/preferences", response_model=UserPreferencesRead)
async def get_preferences(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/preferences", response_model=UserPreferencesRead)
async def update_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, current_user.id)
    update_data = body.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        if field == "theme":
            user.theme = value if value in ("light", "dark") else "light"
            continue
        setattr(user, field, value.strip() or None if isinstance(value, str) else value)

    await db.flush()
    await db.refresh(user)
    return user
