from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.user import User
from app.schemas.cost_record import CostRecordCreate, CostRecordRead, CostRecordUpdate

router = APIRouter(
    prefix="/api/services/{service_id}/cost-records",
    tags=["cost-records"],
)

_writer = require_role("admin", "editor")


async def _get_service(service_id: uuid.UUID, db: AsyncSession, *, for_write: bool = False) -> Service:
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if for_write and service.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived services are read-only for cost records",
        )
    return service


def _to_read(record: CostRecord) -> CostRecordRead:
    pm_name = record.recorded_by.first_name + " " + record.recorded_by.last_name if record.recorded_by else None
    return CostRecordRead(
        id=record.id,
        service_id=record.service_id,
        payment_method_id=record.payment_method_id,
        payment_method_name=None,
        fiscal_year=record.fiscal_year,
        amount=float(record.amount),
        record_type=record.record_type,
        notes=record.notes,
        recorded_at=record.recorded_at,
        recorded_by_id=record.recorded_by_id,
        recorded_by_name=pm_name,
    )


@router.get("/", response_model=list[CostRecordRead])
async def list_cost_records(
    service_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_service(service_id, db)
    result = await db.execute(
        select(CostRecord)
        .where(CostRecord.service_id == service_id)
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
        item = _to_read(r)
        item.payment_method_name = pm_map.get(r.payment_method_id) if r.payment_method_id else None
        out.append(item)
    return out


@router.get("/{record_id}", response_model=CostRecordRead)
async def get_cost_record(
    service_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_service(service_id, db)
    record = await db.get(CostRecord, record_id)
    if not record or record.service_id != service_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")

    item = _to_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.post("/", response_model=CostRecordRead, status_code=status.HTTP_201_CREATED)
async def create_cost_record(
    service_id: uuid.UUID,
    body: CostRecordCreate,
    user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_service(service_id, db, for_write=True)
    record = CostRecord(
        service_id=service_id,
        payment_method_id=body.payment_method_id,
        fiscal_year=body.fiscal_year,
        amount=body.amount,
        record_type=body.record_type,
        notes=body.notes,
        recorded_by_id=user.id,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    item = _to_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.put("/{record_id}", response_model=CostRecordRead)
async def update_cost_record(
    service_id: uuid.UUID,
    record_id: uuid.UUID,
    body: CostRecordUpdate,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_service(service_id, db, for_write=True)
    record = await db.get(CostRecord, record_id)
    if not record or record.service_id != service_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    await db.flush()
    await db.refresh(record)

    item = _to_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cost_record(
    service_id: uuid.UUID,
    record_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _get_service(service_id, db, for_write=True)
    record = await db.get(CostRecord, record_id)
    if not record or record.service_id != service_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost record not found")
    await db.delete(record)
