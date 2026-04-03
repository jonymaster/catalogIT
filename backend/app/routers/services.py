from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.service import Service
from app.models.service_status import ServiceStatus
from app.models.user import User
from app.routers.attachments import delete_entity_attachments
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate

router = APIRouter(prefix="/api/services", tags=["services"])

_writer = require_role("admin", "editor")


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


@router.get("/", response_model=list[ServiceRead])
async def list_services(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Service).order_by(Service.name))
    return result.scalars().all()


@router.get("/{service_id}", response_model=ServiceRead)
async def get_service(service_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    service = await db.get(Service, service_id)
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

    service_status = await _resolve_service_status(
        db,
        service_status_id=body.service_status_id,
        status_name=body.status,
    )

    service = Service(
        name=body.name,
        status=service_status.name if service_status else body.status,
        license_type=body.license_type,
        category=body.category,
        billing_schedule=body.billing_schedule,
        renewal_date=body.renewal_date,
        yearly_cost=body.yearly_cost,
        sso_integrated=body.sso_integrated,
        automated_provisioning=body.automated_provisioning,
        notes=body.notes,
        owners=owners,
        vendor_id=body.vendor_id,
        category_id=body.category_id,
        payment_method_id=body.payment_method_id,
        service_status_id=service_status.id if service_status else None,
        contract_id=body.contract_id,
        classification=body.classification,
        service_type=body.service_type,
        scim_enabled=body.scim_enabled,
        scim_notes=body.scim_notes,
        criticality=body.criticality,
        nonprofit_pricing=body.nonprofit_pricing,
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

    owner_ids = update_data.pop("owner_ids", None)
    service_status_id = update_data.pop("service_status_id", None) if "service_status_id" in update_data else ...
    status_name = update_data.pop("status", None) if "status" in update_data else ...
    if owner_ids is not None:
        owners = []
        for uid in owner_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            owners.append(user)
        service.owners = owners

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
            service.status = status_name
            matched_status = await _find_service_status_by_name(status_name, db)
            service.service_status_id = matched_status.id if matched_status else None

    for field, value in update_data.items():
        setattr(service, field, value)

    await db.flush()
    await db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(service_id: uuid.UUID, _user: User = Depends(_writer), db: AsyncSession = Depends(get_audited_db)):
    service = await db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    await delete_entity_attachments("service", service_id, db)
    await db.delete(service)
