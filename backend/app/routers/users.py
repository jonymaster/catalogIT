from __future__ import annotations

import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.global_audit import record_global_audit_event
from app.models.api_token import ApiToken
from app.models.laptop import Laptop
from app.models.service import service_assignments, service_owners
from app.models.user import User
from app.models.user_permission import UserPermission
from app.permissions import ALLOWED_USER_PERMISSION_SLUGS
from app.schemas.user import (
    AdminSetPasswordBody,
    UserCreate,
    UserRead,
    UserUpdate,
    user_read_from_orm,
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


async def _replace_user_permissions(
    db: AsyncSession,
    user_id: uuid.UUID,
    slugs: list[str],
) -> None:
    await db.execute(delete(UserPermission).where(UserPermission.user_id == user_id))
    for slug in slugs:
        if slug in ALLOWED_USER_PERMISSION_SLUGS:
            db.add(UserPermission(user_id=user_id, permission=slug))


async def _load_user_with_permissions(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(
        select(User).options(selectinload(User.permission_rows)).where(User.id == user_id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[UserRead])
async def list_users(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(
        select(User).options(selectinload(User.permission_rows)).order_by(User.email)
    )
    users = result.scalars().all()
    return [user_read_from_orm(u) for u in users]


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

    if body.role != "admin" and body.permissions:
        await _replace_user_permissions(db, user.id, body.permissions)

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
    reloaded = await _load_user_with_permissions(db, user.id)
    return user_read_from_orm(reloaded)


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
    perms_in_body = data.pop("permissions", None)
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

    if user.role == "admin":
        await db.execute(delete(UserPermission).where(UserPermission.user_id == user.id))
    elif perms_in_body is not None:
        await _replace_user_permissions(db, user.id, perms_in_body)

    await db.flush()
    reloaded = await _load_user_with_permissions(db, user.id)
    return user_read_from_orm(reloaded)


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

    assignee_count = await db.scalar(
        select(func.count())
        .select_from(service_assignments)
        .where(service_assignments.c.user_id == user_id)
    ) or 0
    owner_count = await db.scalar(
        select(func.count())
        .select_from(service_owners)
        .where(service_owners.c.user_id == user_id)
    ) or 0
    laptop_count = await db.scalar(
        select(func.count())
        .select_from(Laptop)
        .where(Laptop.assigned_to_id == user_id)
    ) or 0
    if assignee_count or owner_count or laptop_count:
        parts: list[str] = []
        if assignee_count:
            parts.append(f"assigned to {assignee_count} service(s)")
        if owner_count:
            parts.append(f"owns {owner_count} service(s)")
        if laptop_count:
            parts.append(f"holds {laptop_count} laptop(s)")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete user: " + ", ".join(parts),
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
