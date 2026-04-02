from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.category import Category
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
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda category: count_rows(Service, Service.category_id == category.id),
    ),
]


@router.get("/", response_model=list[CategoryRead])
async def list_categories(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Category).order_by(Category.name))
    return result.scalars().all()


@router.post("/", response_model=CategoryRead, status_code=201)
async def create_category(
    body: CategoryCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    await ensure_unique_name(db, Category, body.name)
    category = Category(name=body.name.strip(), description=body.description)
    db.add(category)
    return await refresh_and_return(db, category)


@router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    category = await get_record_or_404(db, Category, category_id, detail="Category not found")
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(db, Category, update_data["name"], current_id=category.id)
        category.name = update_data["name"].strip()

    if "description" in update_data:
        category.description = update_data["description"]

    return await refresh_and_return(db, category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    category = await get_record_or_404(db, Category, category_id, detail="Category not found")
    await validate_safe_delete(db, category, dependencies=_delete_dependencies)
    await db.delete(category)
