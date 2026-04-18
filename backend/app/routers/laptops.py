from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.hardware_location import HardwareLocation
from app.models.hardware_status import HardwareStatus
from app.models.laptop import Laptop
from app.models.payment_method import PaymentMethod
from app.models.user import User
from app.routers.attachments import delete_entity_attachments
from app.routers.cost_records import to_cost_record_read
from app.schemas.cost_record import CostRecordRead
from app.schemas.laptop import LaptopCreate, LaptopRead, LaptopUpdate
from app.schemas.laptop_hardware_cost import LaptopHardwareCostPut

router = APIRouter(prefix="/api/laptops", tags=["laptops"])

_writer = require_role("admin", "editor")
_admin = require_role("admin")
_ARCHIVED_LAPTOP_EDITABLE_FIELDS = {"notes", "status", "hardware_status_id", "hardware_location_id"}
_DUPLICATE_SERIAL_NUMBER_DETAIL = "A laptop with this serial number already exists"


def _validate_archived_laptop_update_fields(update_data: dict[str, object]) -> None:
    disallowed_fields = set(update_data.keys()) - _ARCHIVED_LAPTOP_EDITABLE_FIELDS
    if disallowed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived laptops only allow updates to notes, status, and location; unarchive to change other fields",
        )


async def _find_hardware_status_by_name(
    status_name: str,
    db: AsyncSession,
) -> HardwareStatus | None:
    normalized = status_name.strip()
    if not normalized:
        return None
    return await db.scalar(
        select(HardwareStatus).where(func.lower(HardwareStatus.name) == normalized.lower())
    )


async def _resolve_hardware_status(
    db: AsyncSession,
    *,
    hardware_status_id: uuid.UUID | None,
    status_name: str | None,
) -> HardwareStatus | None:
    if hardware_status_id is not None:
        row = await db.get(HardwareStatus, hardware_status_id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hardware status not found",
            )
        return row
    if status_name:
        return await _find_hardware_status_by_name(status_name, db)
    return None


async def _get_hardware_location(
    db: AsyncSession,
    location_id: uuid.UUID | None,
) -> HardwareLocation | None:
    if location_id is None:
        return None
    row = await db.get(HardwareLocation, location_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hardware location not found",
        )
    return row


async def _get_assigned_user(
    db: AsyncSession,
    user_id: uuid.UUID | None,
) -> User | None:
    if user_id is None:
        return None
    row = await db.get(User, user_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user not found",
        )
    return row


async def _ensure_unique_serial_number(
    db: AsyncSession,
    serial_number: str,
    *,
    current_id: uuid.UUID | None = None,
) -> None:
    row = await db.scalar(
        select(Laptop).where(
            func.lower(Laptop.serial_number) == serial_number.lower(),
            *(
                []
                if current_id is None
                else [Laptop.id != current_id]
            ),
        )
    )
    if row is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUPLICATE_SERIAL_NUMBER_DETAIL,
        )


def _raise_duplicate_serial_number_http_error(exc: IntegrityError) -> None:
    message = str(exc.orig).lower()
    if (
        "uq_laptops_serial_number_lower" in message
        or "serial_number" in message
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUPLICATE_SERIAL_NUMBER_DETAIL,
        ) from exc
    raise exc


@router.get("/", response_model=list[LaptopRead])
async def list_laptops(
    archived: bool = Query(False),
    db: AsyncSession = Depends(get_audited_db),
):
    stmt = select(Laptop).where(Laptop.is_active.is_(not archived)).order_by(Laptop.serial_number)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{laptop_id}/hardware-cost", response_model=CostRecordRead | None)
async def get_laptop_hardware_cost(
    laptop_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    result = await db.execute(
        select(CostRecord)
        .where(CostRecord.laptop_id == laptop_id)
        .order_by(CostRecord.recorded_at.desc())
        .limit(1)
    )
    record = result.scalars().first()
    if not record:
        return None
    item = to_cost_record_read(record)
    if record.payment_method_id:
        pm = await db.get(PaymentMethod, record.payment_method_id)
        item.payment_method_name = pm.name if pm else None
    return item


@router.put("/{laptop_id}/hardware-cost", response_model=CostRecordRead | None)
async def put_laptop_hardware_cost(
    laptop_id: uuid.UUID,
    body: LaptopHardwareCostPut,
    user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    if laptop.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived hardware is read-only for cost",
        )

    result = await db.execute(select(CostRecord).where(CostRecord.laptop_id == laptop_id))
    rows = list(result.scalars().all())

    if body.amount == 0:
        for r in rows:
            await db.delete(r)
        await db.flush()
        return None

    fiscal_year = body.fiscal_year
    if fiscal_year is None:
        fiscal_year = (
            body.purchase_year
            if body.purchase_year is not None
            else datetime.now(timezone.utc).year
        )

    if rows:
        record = rows[0]
        for extra in rows[1:]:
            await db.delete(extra)
        record.amount = body.amount
        record.purchase_year = body.purchase_year
        record.fiscal_year = fiscal_year
        record.record_type = "actual"
        record.recorded_by_id = user.id
    else:
        record = CostRecord(
            service_id=None,
            laptop_id=laptop_id,
            payment_method_id=None,
            fiscal_year=fiscal_year,
            purchase_year=body.purchase_year,
            amount=body.amount,
            record_type="actual",
            notes=None,
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


@router.get("/{laptop_id}", response_model=LaptopRead)
async def get_laptop(laptop_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    return laptop


@router.post("/", response_model=LaptopRead, status_code=status.HTTP_201_CREATED)
async def create_laptop(body: LaptopCreate, _user: User = Depends(_writer), db: AsyncSession = Depends(get_audited_db)):
    await _ensure_unique_serial_number(db, body.serial_number)
    hw_status = await _resolve_hardware_status(
        db,
        hardware_status_id=body.hardware_status_id,
        status_name=body.status,
    )
    hw_location = await _get_hardware_location(db, body.hardware_location_id)
    assigned_user = await _get_assigned_user(db, body.assigned_to_id)

    laptop = Laptop(
        serial_number=body.serial_number,
        model_name=body.model_name,
        cpu=body.cpu,
        ram=body.ram,
        storage_size=body.storage_size,
        status=hw_status.name if hw_status else body.status,
        hardware_status_id=hw_status.id if hw_status else None,
        hardware_location_id=hw_location.id if hw_location else None,
        assigned_to_id=assigned_user.id if assigned_user else None,
        notes=body.notes,
    )
    db.add(laptop)
    try:
        await db.flush()
    except IntegrityError as exc:
        _raise_duplicate_serial_number_http_error(exc)
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

    hardware_location_id = (
        update_data.pop("hardware_location_id", None) if "hardware_location_id" in update_data else ...
    )
    hardware_status_id = (
        update_data.pop("hardware_status_id", None) if "hardware_status_id" in update_data else ...
    )
    status_name = update_data.pop("status", None) if "status" in update_data else ...
    assigned_to_id = update_data.pop("assigned_to_id", None) if "assigned_to_id" in update_data else ...
    serial_number = update_data.pop("serial_number", None) if "serial_number" in update_data else ...
    model_name = update_data.pop("model_name", None) if "model_name" in update_data else ...

    if hardware_location_id is not ...:
        if hardware_location_id is None:
            laptop.hardware_location_id = None
        else:
            loc = await _get_hardware_location(db, hardware_location_id)
            laptop.hardware_location_id = loc.id

    if hardware_status_id is not ...:
        if hardware_status_id is None:
            laptop.hardware_status_id = None
        else:
            hw_status = await _resolve_hardware_status(
                db,
                hardware_status_id=hardware_status_id,
                status_name=None,
            )
            laptop.hardware_status_id = hw_status.id
            laptop.status = hw_status.name

    if status_name is not ... and not (hardware_status_id is not ... and hardware_status_id is not None):
        if status_name is not None:
            laptop.status = status_name
            matched = await _find_hardware_status_by_name(status_name, db)
            laptop.hardware_status_id = matched.id if matched else None

    if assigned_to_id is not ...:
        assigned_user = await _get_assigned_user(db, assigned_to_id)
        laptop.assigned_to_id = assigned_user.id if assigned_user else None

    if serial_number is not ...:
        await _ensure_unique_serial_number(db, serial_number, current_id=laptop.id)
        laptop.serial_number = serial_number

    if model_name is not ...:
        laptop.model_name = model_name

    for field, value in update_data.items():
        setattr(laptop, field, value)

    try:
        await db.flush()
    except IntegrityError as exc:
        _raise_duplicate_serial_number_http_error(exc)
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
