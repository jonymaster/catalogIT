from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.cost_center import CostCenter
from app.models.service import Service
from app.models.user import User
from app.routers.reference_data_utils import (
    ReferenceDeleteDependency,
    count_rows,
    ensure_unique_name,
    get_record_or_404,
    refresh_and_return,
    validate_safe_delete,
)
from app.schemas.cost_center import CostCenterCreate, CostCenterRead, CostCenterUpdate

router = APIRouter(prefix="/api/cost-centers", tags=["cost-centers"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda row: count_rows(Service, Service.cost_center_id == row.id),
    ),
]


@router.get("/", response_model=list[CostCenterRead])
async def list_cost_centers(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(CostCenter).order_by(CostCenter.name))
    return result.scalars().all()


@router.post("/", response_model=CostCenterRead, status_code=201)
async def create_cost_center(
    body: CostCenterCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, CostCenter, body.name)
    row = CostCenter(name=body.name.strip(), description=body.description)
    db.add(row)
    return await refresh_and_return(db, row)


@router.patch("/{cost_center_id}", response_model=CostCenterRead)
async def update_cost_center(
    cost_center_id: uuid.UUID,
    body: CostCenterUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(db, CostCenter, cost_center_id, detail="Cost center not found")
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(db, CostCenter, update_data["name"], current_id=row.id)
        row.name = update_data["name"].strip()

    if "description" in update_data:
        row.description = update_data["description"]

    return await refresh_and_return(db, row)


@router.delete("/{cost_center_id}", status_code=204)
async def delete_cost_center(
    cost_center_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(db, CostCenter, cost_center_id, detail="Cost center not found")
    await validate_safe_delete(db, row, dependencies=_delete_dependencies)
    await db.delete(row)
