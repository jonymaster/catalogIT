from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.laptop import Laptop
from app.models.user import User
from app.routers.attachments import delete_entity_attachments
from app.schemas.laptop import LaptopCreate, LaptopRead, LaptopUpdate

router = APIRouter(prefix="/api/laptops", tags=["laptops"])

_writer = require_role("admin", "editor")
_admin = require_role("admin")
_ARCHIVED_LAPTOP_EDITABLE_FIELDS = {"notes", "status"}


def _validate_archived_laptop_update_fields(update_data: dict[str, object]) -> None:
    disallowed_fields = set(update_data.keys()) - _ARCHIVED_LAPTOP_EDITABLE_FIELDS
    if disallowed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived laptops only allow updates to notes and status",
        )


@router.get("/", response_model=list[LaptopRead])
async def list_laptops(
    archived: bool = Query(False),
    db: AsyncSession = Depends(get_audited_db),
):
    stmt = select(Laptop).where(Laptop.is_active.is_(not archived)).order_by(Laptop.serial_number)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{laptop_id}", response_model=LaptopRead)
async def get_laptop(laptop_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    return laptop


@router.post("/", response_model=LaptopRead, status_code=status.HTTP_201_CREATED)
async def create_laptop(body: LaptopCreate, _user: User = Depends(_writer), db: AsyncSession = Depends(get_audited_db)):
    laptop = Laptop(**body.model_dump())
    db.add(laptop)
    await db.flush()
    await db.refresh(laptop)
    return laptop


@router.put("/{laptop_id}", response_model=LaptopRead)
async def update_laptop(
    laptop_id: uuid.UUID,
    body: LaptopUpdate,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")

    update_data = body.model_dump(exclude_unset=True)
    if laptop.is_active is False:
        _validate_archived_laptop_update_fields(update_data)

    for field, value in update_data.items():
        setattr(laptop, field, value)

    await db.flush()
    await db.refresh(laptop)
    return laptop


@router.delete("/{laptop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_laptop(
    laptop_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    if laptop.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Laptop must be archived before it can be deleted",
        )
    await delete_entity_attachments("laptop", laptop_id, db)
    await db.delete(laptop)


@router.post("/{laptop_id}/archive", response_model=LaptopRead)
async def archive_laptop(
    laptop_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    if laptop.is_active:
        laptop.is_active = False
        laptop.archived_at = datetime.utcnow()
    await db.flush()
    await db.refresh(laptop)
    return laptop


@router.post("/{laptop_id}/unarchive", response_model=LaptopRead)
async def unarchive_laptop(
    laptop_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    if laptop.is_active is False:
        laptop.is_active = True
        laptop.archived_at = None
    await db.flush()
    await db.refresh(laptop)
    return laptop
