from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.category import Category
from app.models.cost_record import CostRecord
from app.models.laptop import Laptop
from app.models.service import Service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class CostRecordOut(BaseModel):
    source: Literal["service", "hardware"] = "service"
    service_id: str | None = None
    laptop_id: str | None = None
    service_name: str
    classification: str | None
    category_name: str | None
    fiscal_year: int
    amount: float
    record_type: str
    notes: str | None

    model_config = {"from_attributes": True}


class DashboardData(BaseModel):
    cost_records: list[CostRecordOut]
    fiscal_years: list[int]


@router.get("/", response_model=DashboardData)
async def get_dashboard(db: AsyncSession = Depends(get_audited_db)):
    cr_result = await db.execute(
        select(CostRecord).order_by(CostRecord.fiscal_year)
    )
    records = cr_result.scalars().all()

    svc_result = await db.execute(select(Service))
    services = {str(s.id): s for s in svc_result.scalars().all()}

    lap_result = await db.execute(select(Laptop))
    laptops = {str(l.id): l for l in lap_result.scalars().all()}

    cat_result = await db.execute(select(Category))
    categories = {str(c.id): c.name for c in cat_result.scalars().all()}

    years: set[int] = set()
    out: list[CostRecordOut] = []
    for r in records:
        if r.fiscal_year is not None:
            years.add(r.fiscal_year)

        if r.service_id is not None:
            svc = services.get(str(r.service_id))
            if not svc:
                continue
            cat_name = None
            if svc.category_id:
                cat_name = categories.get(str(svc.category_id))
            out.append(
                CostRecordOut(
                    source="service",
                    service_id=str(r.service_id),
                    laptop_id=None,
                    service_name=svc.name,
                    classification=(
                        svc.service_classification.slug
                        if svc.service_classification
                        else None
                    ),
                    category_name=cat_name,
                    fiscal_year=r.fiscal_year,
                    amount=float(r.amount),
                    record_type=r.record_type,
                    notes=r.notes,
                )
            )
        elif r.laptop_id is not None:
            lap = laptops.get(str(r.laptop_id))
            if not lap:
                continue
            label = f"{lap.model_name} ({lap.serial_number})"
            out.append(
                CostRecordOut(
                    source="hardware",
                    service_id=None,
                    laptop_id=str(r.laptop_id),
                    service_name=label,
                    classification="hardware",
                    category_name="Hardware",
                    fiscal_year=r.fiscal_year,
                    amount=float(r.amount),
                    record_type=r.record_type,
                    notes=r.notes,
                )
            )

    return DashboardData(
        cost_records=out,
        fiscal_years=sorted(years),
    )
