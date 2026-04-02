from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.service import Service
from app.models.service_status import ServiceStatus
from app.models.user import User
from app.routers.reference_data_utils import (
    ReferenceDeleteDependency,
    count_rows,
    ensure_unique_name,
    get_record_or_404,
    refresh_and_return,
    validate_safe_delete,
)
from app.schemas.service_status import (
    ServiceStatusCreate,
    ServiceStatusRead,
    ServiceStatusUpdate,
)

router = APIRouter(prefix="/api/service-statuses", tags=["service-statuses"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda service_status: count_rows(
            Service, Service.service_status_id == service_status.id
        ),
    ),
]


@router.get("/", response_model=list[ServiceStatusRead])
async def list_service_statuses(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(ServiceStatus).order_by(ServiceStatus.name))
    return result.scalars().all()


@router.post("/", response_model=ServiceStatusRead, status_code=201)
async def create_service_status(
    body: ServiceStatusCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, ServiceStatus, body.name)
    service_status = ServiceStatus(
        name=body.name.strip(),
        description=body.description,
    )
    db.add(service_status)
    return await refresh_and_return(db, service_status)


@router.patch("/{service_status_id}", response_model=ServiceStatusRead)
async def update_service_status(
    service_status_id: uuid.UUID,
    body: ServiceStatusUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    service_status = await get_record_or_404(
        db,
        ServiceStatus,
        service_status_id,
        detail="Service status not found",
    )
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(
            db,
            ServiceStatus,
            update_data["name"],
            current_id=service_status.id,
        )
        service_status.name = update_data["name"].strip()

    if "description" in update_data:
        service_status.description = update_data["description"]

    return await refresh_and_return(db, service_status)


@router.delete("/{service_status_id}", status_code=204)
async def delete_service_status(
    service_status_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    service_status = await get_record_or_404(
        db,
        ServiceStatus,
        service_status_id,
        detail="Service status not found",
    )
    await validate_safe_delete(db, service_status, dependencies=_delete_dependencies)
    await db.delete(service_status)
