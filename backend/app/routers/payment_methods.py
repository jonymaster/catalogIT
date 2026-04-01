from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.payment_method import PaymentMethod
from app.schemas.payment_method import PaymentMethodRead

router = APIRouter(prefix="/api/payment-methods", tags=["payment-methods"])


@router.get("/", response_model=list[PaymentMethodRead])
async def list_payment_methods(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(PaymentMethod).order_by(PaymentMethod.name))
    return result.scalars().all()
