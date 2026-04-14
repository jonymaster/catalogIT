from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.payment_method import PaymentMethod
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
from app.reference_data_colors import pick_random_badge_color
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodRead, PaymentMethodUpdate

router = APIRouter(prefix="/api/payment-methods", tags=["payment-methods"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda payment_method: count_rows(
            Service, Service.payment_method_id == payment_method.id
        ),
    ),
    ReferenceDeleteDependency(
        label="cost records",
        query_factory=lambda payment_method: count_rows(
            CostRecord, CostRecord.payment_method_id == payment_method.id
        ),
    ),
]


@router.get("/", response_model=list[PaymentMethodRead])
async def list_payment_methods(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(PaymentMethod).order_by(PaymentMethod.name))
    return result.scalars().all()


@router.post("/", response_model=PaymentMethodRead, status_code=201)
async def create_payment_method(
    body: PaymentMethodCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, PaymentMethod, body.name)
    payment_method = PaymentMethod(
        name=body.name.strip(),
        method_type=body.method_type.strip(),
        last_four=body.last_four,
        notes=body.notes,
        color=body.color or pick_random_badge_color(),
    )
    db.add(payment_method)
    return await refresh_and_return(db, payment_method)


@router.patch("/{payment_method_id}", response_model=PaymentMethodRead)
async def update_payment_method(
    payment_method_id: uuid.UUID,
    body: PaymentMethodUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    payment_method = await get_record_or_404(
        db,
        PaymentMethod,
        payment_method_id,
        detail="Payment method not found",
    )
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(
            db,
            PaymentMethod,
            update_data["name"],
            current_id=payment_method.id,
        )
        payment_method.name = update_data["name"].strip()

    if "method_type" in update_data and update_data["method_type"] is not None:
        payment_method.method_type = update_data["method_type"].strip()
    if "last_four" in update_data:
        payment_method.last_four = update_data["last_four"]
    if "notes" in update_data:
        payment_method.notes = update_data["notes"]

    if "color" in update_data and update_data["color"] is not None:
        payment_method.color = update_data["color"]

    return await refresh_and_return(db, payment_method)


@router.delete("/{payment_method_id}", status_code=204)
async def delete_payment_method(
    payment_method_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    payment_method = await get_record_or_404(
        db,
        PaymentMethod,
        payment_method_id,
        detail="Payment method not found",
    )
    await validate_safe_delete(db, payment_method, dependencies=_delete_dependencies)
    await db.delete(payment_method)
