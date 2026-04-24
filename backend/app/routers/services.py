from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.category import Category
from app.models.contract import Contract
from app.models.cost_center import CostCenter
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.service_classification import ServiceClassification
from app.models.service_status import ServiceStatus
from app.models.tag import Tag
from app.models.user import User
from app.models.vendor import Vendor
from app.notifications.renewal_schedule import compute_next_renewal
from app.routers.attachments import delete_entity_attachments
from app.schemas.service import (
    MAX_TAGS_PER_SERVICE,
    RenewalConfig,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
)

router = APIRouter(prefix="/api/services", tags=["services"])

_writer = require_role("admin", "editor")
_admin = require_role("admin")
_ARCHIVED_SERVICE_EDITABLE_FIELDS = {
    "description",
    "point_of_contact",
    "notes",
    "status",
    "service_status_id",
}


def _ensure_seat_capacity(total_seats: int | None, assignee_count: int) -> None:
    if total_seats is not None and assignee_count > total_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Number of assignees ({assignee_count}) exceeds total seats ({total_seats})",
        )


def _validate_archived_service_update_fields(update_data: dict[str, object]) -> None:
    requested_fields = set(update_data.keys())
    disallowed_fields = requested_fields - _ARCHIVED_SERVICE_EDITABLE_FIELDS
    if disallowed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived services only allow updates to description, point of contact, notes, and status",
        )


async def _find_service_status_by_name(
    status_name: str,
    db: AsyncSession,
) -> ServiceStatus | None:
    normalized = status_name.strip()
    if not normalized:
        return None
    return await db.scalar(
        select(ServiceStatus).where(func.lower(ServiceStatus.name) == normalized.lower())
    )


async def _get_classification(
    db: AsyncSession,
    classification_id: uuid.UUID | None,
) -> ServiceClassification | None:
    if classification_id is None:
        return None
    row = await db.get(ServiceClassification, classification_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Service classification not found",
        )
    return row


async def _get_optional_reference(
    db: AsyncSession,
    model: type[object],
    row_id: uuid.UUID | None,
    *,
    detail: str,
) -> object | None:
    if row_id is None:
        return None
    row = await db.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    return row


def _renewal_config_dict(cfg: RenewalConfig | None) -> dict | None:
    if cfg is None:
        return None
    return cfg.model_dump(exclude_none=True)


async def _resolve_notification_recipients(
    db: AsyncSession,
    user_ids: list[uuid.UUID],
) -> list[User]:
    if not user_ids:
        return []
    result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = list(result.scalars().all())
    found = {u.id for u in users}
    missing = [str(uid) for uid in user_ids if uid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User(s) not found: {', '.join(missing)}",
        )
    by_id = {u.id: u for u in users}
    return [by_id[uid] for uid in user_ids]


async def _resolve_tags(
    db: AsyncSession,
    tag_ids: list[uuid.UUID],
) -> list[Tag]:
    if not tag_ids:
        return []
    if len(tag_ids) > MAX_TAGS_PER_SERVICE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A service can have at most {MAX_TAGS_PER_SERVICE} tags",
        )
    result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
    tags = list(result.scalars().all())
    found_ids = {tag.id for tag in tags}
    missing = [str(tid) for tid in tag_ids if tid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tag(s) not found: {', '.join(missing)}",
        )
    # Preserve the order the caller sent.
    by_id = {tag.id: tag for tag in tags}
    return [by_id[tid] for tid in tag_ids]


async def _resolve_service_status(
    db: AsyncSession,
    *,
    service_status_id: uuid.UUID | None,
    status_name: str | None,
) -> ServiceStatus | None:
    if service_status_id is not None:
        service_status = await db.get(ServiceStatus, service_status_id)
        if service_status is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Service status not found",
            )
        return service_status
    if status_name:
        return await _find_service_status_by_name(status_name, db)
    return None


async def _get_related_services(
    db: AsyncSession,
    related_service_ids: list[uuid.UUID],
    *,
    current_service_id: uuid.UUID | None = None,
) -> list[Service]:
    related_services: list[Service] = []
    seen_ids: set[uuid.UUID] = set()

    for related_service_id in related_service_ids:
        if related_service_id in seen_ids:
            continue
        if current_service_id is not None and related_service_id == current_service_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A service cannot reference itself as related",
            )
        related_service = await db.get(Service, related_service_id)
        if related_service is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Related service {related_service_id} not found",
            )
        seen_ids.add(related_service_id)
        related_services.append(related_service)

    return related_services


@router.get("/", response_model=list[ServiceRead])
async def list_services(
    archived: bool = Query(False),
    db: AsyncSession = Depends(get_audited_db),
):
    stmt = (
        select(Service)
        .options(selectinload(Service.related_services))
        .where(Service.is_active.is_(not archived))
        .order_by(Service.name)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{service_id}", response_model=ServiceRead)
async def get_service(service_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(
        select(Service)
        .options(selectinload(Service.related_services))
        .where(Service.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return service


@router.post("/", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(body: ServiceCreate, _user: User = Depends(_writer), db: AsyncSession = Depends(get_audited_db)):
    owners = []
    if body.owner_ids:
        for uid in body.owner_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            owners.append(user)

    assignees = []
    if body.assignee_ids:
        for uid in body.assignee_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            assignees.append(user)

    _ensure_seat_capacity(body.total_seats, len(assignees))

    service_status = await _resolve_service_status(
        db,
        service_status_id=body.service_status_id,
        status_name=body.status,
    )
    if body.status and body.status != "Contract" and service_status is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Service status not found",
        )
    classification = await _get_classification(db, body.classification_id)
    vendor = await _get_optional_reference(db, Vendor, body.vendor_id, detail="Vendor not found")
    category = await _get_optional_reference(db, Category, body.category_id, detail="Category not found")
    cost_center = await _get_optional_reference(
        db,
        CostCenter,
        body.cost_center_id,
        detail="Cost center not found",
    )
    payment_method = await _get_optional_reference(
        db,
        PaymentMethod,
        body.payment_method_id,
        detail="Payment method not found",
    )
    contract = await _get_optional_reference(
        db,
        Contract,
        body.contract_id,
        detail="Contract not found",
    )
    related_services = await _get_related_services(db, body.related_service_ids)
    tags = await _resolve_tags(db, body.tag_ids)
    recipients = await _resolve_notification_recipients(
        db, body.notification_recipient_ids
    )

    cfg_dict = _renewal_config_dict(body.renewal_config)
    next_renewal = (
        compute_next_renewal(cfg_dict, date.today()) if cfg_dict else None
    )

    service = Service(
        name=body.name,
        description=body.description,
        status=service_status.name if service_status else body.status,
        renewal_config=cfg_dict,
        renewal_date=next_renewal if cfg_dict else body.renewal_date,
        subcategory=body.subcategory,
        environment=body.environment,
        sso_integrated=body.sso_integrated,
        point_of_contact=body.point_of_contact,
        notes=body.notes,
        owners=owners,
        assignees=assignees,
        related_services=related_services,
        notification_recipients=recipients,
        total_seats=body.total_seats,
        vendor_id=vendor.id if vendor else None,
        category_id=category.id if category else None,
        cost_center_id=cost_center.id if cost_center else None,
        payment_method_id=payment_method.id if payment_method else None,
        service_status_id=service_status.id if service_status else None,
        contract_id=contract.id if contract else None,
        classification_id=classification.id if classification else None,
        scim_enabled=body.scim_enabled,
        criticality=body.criticality,
        nonprofit_pricing=body.nonprofit_pricing,
        renewal_reminders_enabled=body.renewal_reminders_enabled,
        renewal_offsets_days=body.renewal_offsets_days,
        tags=tags,
    )
    db.add(service)
    await db.flush()
    await db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: uuid.UUID,
    body: ServiceUpdate,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    update_data = body.model_dump(exclude_unset=True)

    if service.is_active is False:
        _validate_archived_service_update_fields(update_data)

    ro = update_data.pop("renewal_offsets_days", ...)
    if ro is not ...:
        if ro is None or (isinstance(ro, list) and len(ro) == 0):
            service.renewal_offsets_days = None
        else:
            service.renewal_offsets_days = ro

    if "renewal_config" in update_data:
        raw_cfg = update_data.pop("renewal_config")
        cfg_dict = (
            RenewalConfig.model_validate(raw_cfg).model_dump(exclude_none=True)
            if raw_cfg is not None
            else None
        )
        service.renewal_config = cfg_dict
        service.renewal_date = (
            compute_next_renewal(cfg_dict, date.today()) if cfg_dict else None
        )

    recipient_ids_provided = "notification_recipient_ids" in update_data
    recipient_ids = update_data.pop("notification_recipient_ids", None)

    owner_ids = update_data.pop("owner_ids", None)
    assignee_ids = update_data.pop("assignee_ids", None)
    related_service_ids = (
        update_data.pop("related_service_ids", None)
        if "related_service_ids" in update_data
        else None
    )
    tag_ids_provided = "tag_ids" in update_data
    tag_ids = update_data.pop("tag_ids", None)
    classification_id = (
        update_data.pop("classification_id", None) if "classification_id" in update_data else ...
    )
    service_status_id = update_data.pop("service_status_id", None) if "service_status_id" in update_data else ...
    status_name = update_data.pop("status", None) if "status" in update_data else ...
    vendor_id = update_data.pop("vendor_id", None) if "vendor_id" in update_data else ...
    category_id = update_data.pop("category_id", None) if "category_id" in update_data else ...
    cost_center_id = update_data.pop("cost_center_id", None) if "cost_center_id" in update_data else ...
    payment_method_id = (
        update_data.pop("payment_method_id", None) if "payment_method_id" in update_data else ...
    )
    contract_id = update_data.pop("contract_id", None) if "contract_id" in update_data else ...
    if owner_ids is not None:
        owners = []
        for uid in owner_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            owners.append(user)
        service.owners = owners

    if assignee_ids is not None:
        assignees = []
        for uid in assignee_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            assignees.append(user)
        service.assignees = assignees

    if related_service_ids is not None:
        service.related_services = await _get_related_services(
            db,
            related_service_ids,
            current_service_id=service.id,
        )

    if classification_id is not ...:
        if classification_id is None:
            service.classification_id = None
        else:
            classification = await _get_classification(db, classification_id)
            service.classification_id = classification.id

    if vendor_id is not ...:
        vendor = await _get_optional_reference(db, Vendor, vendor_id, detail="Vendor not found")
        service.vendor_id = vendor.id if vendor else None

    if category_id is not ...:
        category = await _get_optional_reference(db, Category, category_id, detail="Category not found")
        service.category_id = category.id if category else None

    if cost_center_id is not ...:
        cost_center = await _get_optional_reference(
            db,
            CostCenter,
            cost_center_id,
            detail="Cost center not found",
        )
        service.cost_center_id = cost_center.id if cost_center else None

    if payment_method_id is not ...:
        payment_method = await _get_optional_reference(
            db,
            PaymentMethod,
            payment_method_id,
            detail="Payment method not found",
        )
        service.payment_method_id = payment_method.id if payment_method else None

    if contract_id is not ...:
        contract = await _get_optional_reference(
            db,
            Contract,
            contract_id,
            detail="Contract not found",
        )
        service.contract_id = contract.id if contract else None

    if service_status_id is not ...:
        if service_status_id is None:
            service.service_status_id = None
        else:
            service_status = await _resolve_service_status(
                db,
                service_status_id=service_status_id,
                status_name=None,
            )
            service.service_status_id = service_status.id
            service.status = service_status.name

    if status_name is not ... and not (service_status_id is not ... and service_status_id is not None):
        if status_name is not None:
            matched_status = await _find_service_status_by_name(status_name, db)
            if matched_status is None and status_name != service.status:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Service status not found",
                )
            service.status = status_name
            service.service_status_id = matched_status.id if matched_status else None

    if tag_ids_provided:
        service.tags = await _resolve_tags(db, tag_ids or [])

    if recipient_ids_provided:
        service.notification_recipients = await _resolve_notification_recipients(
            db, recipient_ids or []
        )

    for field, value in update_data.items():
        setattr(service, field, value)

    _ensure_seat_capacity(service.total_seats, len(service.assignees))

    await db.flush()
    await db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    service_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if service.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Service must be archived before it can be deleted",
        )
    await delete_entity_attachments("service", service_id, db)
    await db.delete(service)


@router.post("/{service_id}/archive", response_model=ServiceRead)
async def archive_service(
    service_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if service.is_active:
        service.is_active = False
        service.deprecated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(service)
    return service


@router.post("/{service_id}/unarchive", response_model=ServiceRead)
async def unarchive_service(
    service_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if service.is_active is False:
        service.is_active = True
        service.deprecated_at = None
    await db.flush()
    await db.refresh(service)
    return service
