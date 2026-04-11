from __future__ import annotations

import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.global_audit import record_global_audit_event
from app.models.api_token import ApiToken
from app.models.user import User
from app.schemas.user import (
    AdminSetPasswordBody,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/api/settings/users", tags=["users"])

_admin = require_role("admin")


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _managed_user_detail() -> dict:
    return {
        "code": "managed_user",
        "message": "This account is managed by an external identity provider; password cannot be changed here.",
    }


@router.get("/", response_model=list[UserRead])
async def list_users(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(select(User).order_by(User.email))
    return result.scalars().all()


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    existing = await db.execute(select(User).where(User.email == body.email.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    uid = uuid.uuid4()
    user = User(
        external_id=f"local:{uid}",
        email=body.email.strip(),
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        display_name=body.display_name.strip() if body.display_name else None,
        department=body.department.strip() if body.department else None,
        role=body.role,
        password_hash=_hash_password(body.password),
        must_reset_password=body.must_reset_password,
        provisioning_source="local",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await record_global_audit_event(
        db,
        category="security",
        event_type="user_created",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=current_user.id,
        summary="User created by administrator",
        details={"email": user.email},
        entity_label=user.email,
    )
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id and body.role is not None and body.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote yourself",
        )

    if user.id == current_user.id and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    data = body.model_dump(exclude_unset=True)
    identity_keys = {"email", "first_name", "last_name", "display_name", "department"}
    if user.provisioning_source != "local":
        for k in list(data.keys()):
            if k in identity_keys:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Identity fields can only be changed for manually created users",
                )

    if "email" in data and data["email"] is not None:
        new_email = data["email"].strip()
        clash = await db.execute(
            select(User).where(User.email == new_email, User.id != user_id)
        )
        if clash.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )
        data["email"] = new_email

    for field, value in data.items():
        if field in {"first_name", "last_name"} and isinstance(value, str):
            value = value.strip()
        if field == "display_name" and isinstance(value, str):
            value = value.strip() or None
        if field == "department" and isinstance(value, str):
            value = value.strip() or None
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user


@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def admin_set_password(
    user_id: uuid.UUID,
    body: AdminSetPasswordBody,
    current_user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.provisioning_source in ("scim", "oidc"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_managed_user_detail())

    user.password_hash = _hash_password(body.new_password)
    user.must_reset_password = body.must_reset_password
    await db.flush()

    await record_global_audit_event(
        db,
        category="security",
        event_type="admin_password_reset",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=current_user.id,
        summary="Administrator reset user password",
        details={"target_email": user.email},
        entity_label=user.email,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    if user.role == "admin":
        result = await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin", User.id != user_id)
        )
        if result.scalar_one() == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last admin",
            )

    await record_global_audit_event(
        db,
        category="security",
        event_type="user_deleted",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=current_user.id,
        summary="User deleted by administrator",
        details={"email": user.email},
        entity_label=user.email,
    )

    await db.execute(delete(ApiToken).where(ApiToken.created_by_id == user_id))
    await db.delete(user)
    await db.flush()
