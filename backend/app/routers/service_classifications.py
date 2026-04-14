from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.service import Service
from app.models.service_classification import ServiceClassification
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
from app.schemas.service_classification import (
    ServiceClassificationCreate,
    ServiceClassificationRead,
    ServiceClassificationUpdate,
)

_SLUG_RE = re.compile(r"^[a-z0-9_]{1,64}$")

router = APIRouter(prefix="/api/service-classifications", tags=["service-classifications"])

_admin = require_role("admin")
_delete_dependencies = [
    ReferenceDeleteDependency(
        label="services",
        query_factory=lambda row: count_rows(
            Service, Service.classification_id == row.id
        ),
    ),
]


def _normalize_slug(raw: str) -> str:
    s = raw.strip().lower()
    if not _SLUG_RE.match(s):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug must be 1–64 characters: lowercase letters, digits, and underscores only.",
        )
    return s


def _slugify_from_name(name: str) -> str:
    raw = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", raw)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        s = "classification"
    return s[:64]


async def _allocate_unique_slug(
    db: AsyncSession,
    base: str,
    *,
    current_id: uuid.UUID | None = None,
) -> str:
    """Pick a slug matching ``_SLUG_RE`` based on ``base``, adding numeric suffixes if needed."""
    column = ServiceClassification.slug
    base = base[:64].rstrip("_") or "classification"
    for i in range(1000):
        if i == 0:
            candidate = base[:64]
        else:
            suffix = f"_{i + 1}"
            max_base = max(1, 64 - len(suffix))
            candidate = (base[:max_base].rstrip("_") + suffix)[:64]
        if not _SLUG_RE.match(candidate):
            candidate = ("classification" + (suffix if i else ""))[:64]
        query = select(ServiceClassification).where(column == candidate)
        if current_id is not None:
            query = query.where(ServiceClassification.id != current_id)
        existing = await db.scalar(query)
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate a unique slug.",
    )


@router.get("/", response_model=list[ServiceClassificationRead])
async def list_service_classifications(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(
        select(ServiceClassification).order_by(ServiceClassification.name)
    )
    return result.scalars().all()


@router.post("/", response_model=ServiceClassificationRead, status_code=201)
async def create_service_classification(
    body: ServiceClassificationCreate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name is required",
        )
    raw_slug = body.slug.strip() if body.slug else ""
    if raw_slug:
        slug = _normalize_slug(raw_slug)
        await ensure_unique_name(db, ServiceClassification, slug, attr="slug")
    else:
        slug = await _allocate_unique_slug(db, _slugify_from_name(name))
    await ensure_unique_name(db, ServiceClassification, name)
    row = ServiceClassification(
        slug=slug,
        name=name,
        description=body.description,
        color=body.color or pick_random_badge_color(),
    )
    db.add(row)
    return await refresh_and_return(db, row)


@router.patch("/{classification_id}", response_model=ServiceClassificationRead)
async def update_service_classification(
    classification_id: uuid.UUID,
    body: ServiceClassificationUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        ServiceClassification,
        classification_id,
        detail="Service classification not found",
    )
    update_data = body.model_dump(exclude_unset=True)

    if "slug" in update_data and update_data["slug"] is not None:
        slug = _normalize_slug(update_data["slug"])
        await ensure_unique_name(
            db,
            ServiceClassification,
            slug,
            attr="slug",
            current_id=row.id,
        )
        row.slug = slug

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(
            db,
            ServiceClassification,
            update_data["name"].strip(),
            current_id=row.id,
        )
        row.name = update_data["name"].strip()

    if "description" in update_data:
        row.description = update_data["description"]

    if "color" in update_data and update_data["color"] is not None:
        row.color = update_data["color"]

    return await refresh_and_return(db, row)


@router.delete("/{classification_id}", status_code=204)
async def delete_service_classification(
    classification_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await get_record_or_404(
        db,
        ServiceClassification,
        classification_id,
        detail="Service classification not found",
    )
    await validate_safe_delete(db, row, dependencies=_delete_dependencies)
    await db.delete(row)
