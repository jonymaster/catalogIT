from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.vendor import Vendor
from app.schemas.vendor import VendorRead

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("/", response_model=list[VendorRead])
async def list_vendors(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Vendor).order_by(Vendor.name))
    return result.scalars().all()
