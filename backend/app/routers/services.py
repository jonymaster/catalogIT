from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.service import Service
from app.models.user import User
from app.routers.attachments import delete_entity_attachments
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate

router = APIRouter(prefix="/api/services", tags=["services"])

_writer = require_role("admin", "editor")


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

    service = Service(
        name=body.name,
        status=body.status,
        license_type=body.license_type,
        category=body.category,
        billing_schedule=body.billing_schedule,
        yearly_cost=body.yearly_cost,
        sso_integrated=body.sso_integrated,
        automated_provisioning=body.automated_provisioning,
        notes=body.notes,
        owners=owners,
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
    if owner_ids is not None:
        owners = []
        for uid in owner_ids:
            user = await db.get(User, uid)
            if not user:
                raise HTTPException(status_code=400, detail=f"User {uid} not found")
            owners.append(user)
        service.owners = owners

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
