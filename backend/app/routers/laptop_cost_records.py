from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.laptop import Laptop
from app.models.payment_method import PaymentMethod
from app.models.user import User
from app.routers.cost_records import _ensure_payment_method, to_cost_record_read
from app.schemas.cost_record import CostRecordCreate, CostRecordRead, CostRecordUpdate

router = APIRouter(
    prefix="/api/laptops/{laptop_id}/cost-records",
    tags=["laptop-cost-records"],
)

_writer = require_role("admin", "editor")


async def _get_laptop(laptop_id: uuid.UUID, db: AsyncSession, *, for_write: bool = False) -> Laptop:
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    if for_write and laptop.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived hardware is read-only for cost records",
        )
    return laptop


@router.get("/", response_model=list[CostRecordRead])
async def list_laptop_cost_records(
    laptop_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_laptop(laptop_id, db)
    result = await db.execute(
        select(CostRecord)
        .where(CostRecord.laptop_id == laptop_id)
        .order_by(CostRecord.fiscal_year.desc(), CostRecord.recorded_at.desc())
    )
    records = result.scalars().all()

    pm_ids = {r.payment_method_id for r in records if r.payment_method_id}
    pm_map: dict[uuid.UUID, str] = {}
    if pm_ids:
        pm_result = await db.execute(select(PaymentMethod).where(PaymentMethod.id.in_(pm_ids)))
        pm_map = {pm.id: pm.name for pm in pm_result.scalars().all()}

    out = []
    for r in records:
        item = to_cost_record_read(r)
        item.payment_method_name = pm_map.get(r.payment_method_id) if r.payment_method_id else None
        out.append(item)
    return out


@router.get("/{record_id}", response_model=CostRecordRead)
async def get_laptop_cost_record(
    laptop_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_laptop(laptop_id, db)
    record = await db.get(CostRecord, record_id)
    if not record or record.laptop_id != laptop_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")

    item = to_cost_record_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.post("/", response_model=CostRecordRead, status_code=status.HTTP_201_CREATED)
async def create_laptop_cost_record(
    laptop_id: uuid.UUID,
    body: CostRecordCreate,
    user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_laptop(laptop_id, db, for_write=True)
    payment_method_id = await _ensure_payment_method(db, body.payment_method_id)
    record = CostRecord(
        service_id=None,
        laptop_id=laptop_id,
        payment_method_id=payment_method_id,
        fiscal_year=body.fiscal_year,
        purchase_year=body.purchase_year,
        amount=body.amount,
        record_type=body.record_type,
        notes=body.notes,
        recorded_by_id=user.id,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    item = to_cost_record_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.put("/{record_id}", response_model=CostRecordRead)
async def update_laptop_cost_record(
    laptop_id: uuid.UUID,
    record_id: uuid.UUID,
    body: CostRecordUpdate,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_laptop(laptop_id, db, for_write=True)
    record = await db.get(CostRecord, record_id)
    if not record or record.laptop_id != laptop_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")

    update_data = body.model_dump(exclude_unset=True)
    if "payment_method_id" in update_data:
        update_data["payment_method_id"] = await _ensure_payment_method(
            db,
            update_data["payment_method_id"],
        )

    for field, value in update_data.items():
        setattr(record, field, value)

    await db.flush()
    await db.refresh(record)

    item = to_cost_record_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_laptop_cost_record(
    laptop_id: uuid.UUID,
    record_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_laptop(laptop_id, db, for_write=True)
    record = await db.get(CostRecord, record_id)
    if not record or record.laptop_id != laptop_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")
    await db.delete(record)
