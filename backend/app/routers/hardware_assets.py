from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError

from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_financial_view, require_hardware_view, require_role
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.hardware_location import HardwareLocation
from app.models.hardware_status import HardwareStatus
from app.models.hardware import HardwareAsset
from app.models.payment_method import PaymentMethod
from app.models.user import User
from app.routers.attachments import delete_entity_attachments
from app.routers.cost_records import to_cost_record_read
from app.schemas.cost_record import CostRecordRead
from app.schemas.hardware import HardwareAssetCreate, HardwareAssetRead, HardwareAssetUpdate, HardwareType
from app.schemas.hardware_cost import HardwareCostPut

router = APIRouter(prefix="/api/hardware", tags=["hardware_assets"])

# Finish the transaction before sending a response; the UI immediately follows writes
# with cost requests and detail reloads.
_writer = require_role("admin", "editor")
_admin = require_role("admin")
_ARCHIVED_HARDWARE_EDITABLE_FIELDS = {
    "notes",
    "status",
    "hardware_status_id",
    "hardware_location_id",
    "mdm_connected",
}
_DUPLICATE_SERIAL_NUMBER_DETAIL = "A hardware asset with this serial number already exists"


def _validate_archived_hardware_update_fields(update_data: dict[str, object]) -> None:
    disallowed_fields = set(update_data.keys()) - _ARCHIVED_HARDWARE_EDITABLE_FIELDS
    if disallowed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived hardware assets only allow updates to notes, status, location, and MDM connected; unarchive to change other fields",
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
    serial_number: str | None,
    *,
    current_id: uuid.UUID | None = None,
) -> None:
    if not serial_number:
        return
    row = await db.scalar(
        select(HardwareAsset).where(
            func.lower(HardwareAsset.serial_number) == serial_number.lower(),
            *(
                []
                if current_id is None
                else [HardwareAsset.id != current_id]
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
        "uq_hardware_assets_serial_number_lower" in message
        or "serial_number" in message
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_DUPLICATE_SERIAL_NUMBER_DETAIL,
        ) from exc
    raise exc


@router.get("/", response_model=list[HardwareAssetRead])
async def list_hardware_assets(
    archived: bool = Query(False),
    hardware_type: HardwareType | None = None,
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    stmt = select(HardwareAsset).where(HardwareAsset.is_active.is_(not archived)).order_by(HardwareAsset.serial_number)
    if hardware_type is not None:
        stmt = stmt.where(HardwareAsset.hardware_type == hardware_type)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{hardware_id}/hardware-cost", response_model=CostRecordRead | None)
async def get_hardware_hardware_cost(
    hardware_id: uuid.UUID,
    _fin: User = Depends(require_financial_view),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    result = await db.execute(
        select(CostRecord)
        .where(CostRecord.hardware_id == hardware_id)
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


@router.put("/{hardware_id}/hardware-cost", response_model=CostRecordRead | None)
async def put_hardware_hardware_cost(
    hardware_id: uuid.UUID,
    body: HardwareCostPut,
    user: User = Depends(_writer),
    _fin: User = Depends(require_financial_view),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    if hardware.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived hardware is read-only for cost",
        )

    result = await db.execute(select(CostRecord).where(CostRecord.hardware_id == hardware_id))
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
            hardware_id=hardware_id,
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


def _searchable_text(column):
    return func.lower(func.coalesce(column, ""))


@router.get("/search", response_model=list[HardwareAssetRead])
async def search_hardware_assets(
    q: str = Query("", max_length=255),
    archived: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    term = q.strip()
    if not term:
        return []

    needle = term.lower()
    contains_pattern = f"%{needle}%"
    prefix_pattern = f"{needle}%"

    stmt = (
        select(HardwareAsset)
        .outerjoin(HardwareAsset.assigned_to)
        .outerjoin(HardwareAsset.hardware_status)
        .outerjoin(HardwareAsset.hardware_location)
        .where(
            HardwareAsset.is_active.is_(not archived),
            or_(
                _searchable_text(HardwareAsset.serial_number).like(contains_pattern),
                _searchable_text(HardwareAsset.model_name).like(contains_pattern),
                _searchable_text(HardwareAsset.hardware_type).like(contains_pattern),
                _searchable_text(HardwareAsset.operating_system).like(contains_pattern),
                _searchable_text(HardwareAsset.imei).like(contains_pattern),
                _searchable_text(HardwareAsset.imei2).like(contains_pattern),
                _searchable_text(HardwareAsset.phone_number).like(contains_pattern),
                _searchable_text(HardwareAsset.cpu).like(contains_pattern),
                _searchable_text(HardwareAsset.ram).like(contains_pattern),
                _searchable_text(HardwareAsset.storage_size).like(contains_pattern),
                _searchable_text(HardwareAsset.status).like(contains_pattern),
                _searchable_text(HardwareStatus.name).like(contains_pattern),
                _searchable_text(HardwareLocation.name).like(contains_pattern),
                _searchable_text(User.display_name).like(contains_pattern),
                _searchable_text(User.first_name).like(contains_pattern),
                _searchable_text(User.last_name).like(contains_pattern),
                _searchable_text(User.email).like(contains_pattern),
            ),
        )
        .order_by(
            case(
                (_searchable_text(HardwareAsset.serial_number) == needle, 0),
                (_searchable_text(HardwareAsset.serial_number).like(prefix_pattern), 1),
                (_searchable_text(HardwareAsset.model_name).like(prefix_pattern), 2),
                else_=3,
            ),
            HardwareAsset.serial_number,
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{hardware_id}", response_model=HardwareAssetRead)
async def get_hardware(
    hardware_id: uuid.UUID,
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    return hardware


@router.post("/", response_model=HardwareAssetRead, status_code=status.HTTP_201_CREATED)
async def create_hardware(
    body: HardwareAssetCreate,
    _user: User = Depends(_writer),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    await _ensure_unique_serial_number(db, body.serial_number)
    hw_status = await _resolve_hardware_status(
        db,
        hardware_status_id=body.hardware_status_id,
        status_name=body.status,
    )
    if body.status and body.status != "In Stock" and hw_status is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hardware status not found",
        )
    hw_location = await _get_hardware_location(db, body.hardware_location_id)
    assigned_user = await _get_assigned_user(db, body.assigned_to_id)

    hardware = HardwareAsset(
        hardware_type=body.hardware_type,
        quantity=body.quantity,
        os_version=body.os_version,
        imei=body.imei,
        imei2=body.imei2,
        phone_number=body.phone_number,
        serial_number=body.serial_number,
        model_name=body.model_name,
        cpu=body.cpu,
        ram=body.ram,
        storage_size=body.storage_size,
        operating_system=body.operating_system,
        status=hw_status.name if hw_status else body.status,
        hardware_status_id=hw_status.id if hw_status else None,
        hardware_location_id=hw_location.id if hw_location else None,
        assigned_to_id=assigned_user.id if assigned_user else None,
        notes=body.notes,
        mdm_connected=body.mdm_connected,
    )
    db.add(hardware)
    try:
        await db.flush()
    except IntegrityError as exc:
        _raise_duplicate_serial_number_http_error(exc)
    await db.refresh(hardware)
    return hardware


@router.put("/{hardware_id}", response_model=HardwareAssetRead)
async def update_hardware(
    hardware_id: uuid.UUID,
    body: HardwareAssetUpdate,
    _user: User = Depends(_writer),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")

    update_data = body.model_dump(exclude_unset=True)
    if hardware.is_active is False:
        _validate_archived_hardware_update_fields(update_data)

    # Validate the complete resulting asset, including partial updates and type changes.
    merged = {field: getattr(hardware, field, field_info.default)
              for field, field_info in HardwareAssetCreate.model_fields.items()}
    merged.update(update_data)
    try:
        HardwareAssetCreate.model_validate(merged)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False, include_input=False)) from exc

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
            hardware.hardware_location_id = None
        else:
            loc = await _get_hardware_location(db, hardware_location_id)
            hardware.hardware_location_id = loc.id

    if hardware_status_id is not ...:
        if hardware_status_id is None:
            hardware.hardware_status_id = None
        else:
            hw_status = await _resolve_hardware_status(
                db,
                hardware_status_id=hardware_status_id,
                status_name=None,
            )
            hardware.hardware_status_id = hw_status.id
            hardware.status = hw_status.name

    if status_name is not ... and not (hardware_status_id is not ... and hardware_status_id is not None):
        if status_name is not None:
            matched = await _find_hardware_status_by_name(status_name, db)
            if matched is None and status_name != hardware.status:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Hardware status not found",
                )
            hardware.status = status_name
            hardware.hardware_status_id = matched.id if matched else None

    if assigned_to_id is not ...:
        assigned_user = await _get_assigned_user(db, assigned_to_id)
        hardware.assigned_to_id = assigned_user.id if assigned_user else None

    if serial_number is not ...:
        await _ensure_unique_serial_number(db, serial_number, current_id=hardware.id)
        hardware.serial_number = serial_number

    if model_name is not ...:
        hardware.model_name = model_name

    for field, value in update_data.items():
        setattr(hardware, field, value)

    try:
        await db.flush()
    except IntegrityError as exc:
        _raise_duplicate_serial_number_http_error(exc)
    await db.refresh(hardware)
    return hardware


@router.delete("/{hardware_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hardware(
    hardware_id: uuid.UUID,
    _user: User = Depends(_admin),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    if hardware.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hardware asset must be archived before it can be deleted",
        )
    await delete_entity_attachments("hardware", hardware_id, db)
    await db.delete(hardware)


@router.post("/{hardware_id}/archive", response_model=HardwareAssetRead)
async def archive_hardware(
    hardware_id: uuid.UUID,
    _user: User = Depends(_writer),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    if hardware.is_active:
        hardware.is_active = False
        hardware.archived_at = datetime.utcnow()
    await db.flush()
    await db.refresh(hardware)
    return hardware


@router.post("/{hardware_id}/unarchive", response_model=HardwareAssetRead)
async def unarchive_hardware(
    hardware_id: uuid.UUID,
    _user: User = Depends(_writer),
    _hw: User = Depends(require_hardware_view),
    db: AsyncSession = Depends(get_audited_db, scope="function"),
):
    hardware = await db.get(HardwareAsset, hardware_id)
    if not hardware:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hardware asset not found")
    if hardware.is_active is False:
        hardware.is_active = True
        hardware.archived_at = None
    await db.flush()
    await db.refresh(hardware)
    return hardware
