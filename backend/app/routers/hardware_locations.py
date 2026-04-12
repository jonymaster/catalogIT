from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.hardware_location import HardwareLocation
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
from app.schemas.hardware_location import (
    HardwareLocationCreate,
    HardwareLocationRead,
    HardwareLocationUpdate,
)

router = APIRouter(prefix="/api/hardware-locations", tags=["hardware-locations"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="laptops",
        query_factory=lambda row: count_rows(
            Laptop, Laptop.hardware_location_id == row.id
        ),
    ),
]


@router.get("/", response_model=list[HardwareLocationRead])
async def list_hardware_locations(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(HardwareLocation).order_by(HardwareLocation.name))
    return result.scalars().all()


@router.post("/", response_model=HardwareLocationRead, status_code=201)
async def create_hardware_location(
    body: HardwareLocationCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, HardwareLocation, body.name)
    row = HardwareLocation(
        name=body.name.strip(),
        description=body.description,
    )
    db.add(row)
    return await refresh_and_return(db, row)


@router.patch("/{hardware_location_id}", response_model=HardwareLocationRead)
async def update_hardware_location(
    hardware_location_id: uuid.UUID,
    body: HardwareLocationUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        HardwareLocation,
        hardware_location_id,
        detail="Hardware location not found",
    )
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(
            db,
            HardwareLocation,
            update_data["name"],
            current_id=row.id,
        )
        row.name = update_data["name"].strip()

    if "description" in update_data:
        row.description = update_data["description"]

    return await refresh_and_return(db, row)


@router.delete("/{hardware_location_id}", status_code=204)
async def delete_hardware_location(
    hardware_location_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        HardwareLocation,
        hardware_location_id,
        detail="Hardware location not found",
    )
    await validate_safe_delete(db, row, dependencies=_delete_dependencies)
    await db.delete(row)
