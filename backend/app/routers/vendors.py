from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.contract import Contract
from app.models.service import Service
from app.models.user import User
from app.models.vendor import Vendor
from app.routers.reference_data_utils import (
    ReferenceDeleteDependency,
    count_rows,
    ensure_unique_name,
    get_record_or_404,
    refresh_and_return,
    validate_safe_delete,
)
from app.schemas.vendor import VendorCreate, VendorRead, VendorUpdate

router = APIRouter(prefix="/api/vendors", tags=["vendors"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda vendor: count_rows(Service, Service.vendor_id == vendor.id),
    ),
    ReferenceDeleteDependency(
        label="contracts",
        query_factory=lambda vendor: count_rows(Contract, Contract.vendor_id == vendor.id),
    ),
]


@router.get("/", response_model=list[VendorRead])
async def list_vendors(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Vendor).order_by(Vendor.name))
    return result.scalars().all()


@router.post("/", response_model=VendorRead, status_code=201)
async def create_vendor(
    body: VendorCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, Vendor, body.name)
    vendor = Vendor(
        name=body.name.strip(),
        website=body.website,
        notes=body.notes,
    )
    db.add(vendor)
    return await refresh_and_return(db, vendor)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: uuid.UUID,
    body: VendorUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    vendor = await get_record_or_404(db, Vendor, vendor_id, detail="Vendor not found")
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(db, Vendor, update_data["name"], current_id=vendor.id)
        vendor.name = update_data["name"].strip()

    if "website" in update_data:
        vendor.website = update_data["website"]
    if "notes" in update_data:
        vendor.notes = update_data["notes"]

    return await refresh_and_return(db, vendor)


@router.delete("/{vendor_id}", status_code=204)
async def delete_vendor(
    vendor_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    vendor = await get_record_or_404(db, Vendor, vendor_id, detail="Vendor not found")
    await validate_safe_delete(db, vendor, dependencies=_delete_dependencies)
    await db.delete(vendor)
