from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.hardware_status import HardwareStatus
from app.models.laptop import Laptop
from app.models.user import User
from app.routers.reference_data_utils import (
    ReferenceDeleteDependency,
    count_rows,
    ensure_unique_name,
    get_record_or_404,
    refresh_and_return,
    validate_safe_delete,
)
from app.reference_data_colors import pick_random_badge_color
from app.schemas.hardware_status import (
    HardwareStatusCreate,
    HardwareStatusRead,
    HardwareStatusUpdate,
)

router = APIRouter(prefix="/api/hardware-statuses", tags=["hardware-statuses"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="laptops",
        query_factory=lambda row: count_rows(
            Laptop, Laptop.hardware_status_id == row.id
        ),
    ),
]


@router.get("/", response_model=list[HardwareStatusRead])
async def list_hardware_statuses(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(HardwareStatus).order_by(HardwareStatus.name))
    return result.scalars().all()


@router.post("/", response_model=HardwareStatusRead, status_code=201)
async def create_hardware_status(
    body: HardwareStatusCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, HardwareStatus, body.name)
    row = HardwareStatus(
        name=body.name.strip(),
        description=body.description,
        color=body.color or pick_random_badge_color(),
    )
    db.add(row)
    return await refresh_and_return(db, row)


@router.patch("/{hardware_status_id}", response_model=HardwareStatusRead)
async def update_hardware_status(
    hardware_status_id: uuid.UUID,
    body: HardwareStatusUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        HardwareStatus,
        hardware_status_id,
        detail="Hardware status not found",
    )
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(
            db,
            HardwareStatus,
            update_data["name"],
            current_id=row.id,
        )
        row.name = update_data["name"].strip()

    if "description" in update_data:
        row.description = update_data["description"]

    if "color" in update_data and update_data["color"] is not None:
        row.color = update_data["color"]

    return await refresh_and_return(db, row)


@router.delete("/{hardware_status_id}", status_code=204)
async def delete_hardware_status(
    hardware_status_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        HardwareStatus,
        hardware_status_id,
        detail="Hardware status not found",
    )
    await validate_safe_delete(db, row, dependencies=_delete_dependencies)
    await db.delete(row)
