from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ReferenceDeleteDependency:
    label: str
    query_factory: Callable[[object], Select]


async def ensure_unique_name(
    db: AsyncSession,
    model: type,
    name: str,
    *,
    current_id: uuid.UUID | None = None,
    attr: str = "name",
) -> None:
    normalized = name.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

    column = getattr(model, attr)
    query = select(model).where(func.lower(column) == normalized.lower())
    if current_id is not None:
        query = query.where(model.id != current_id)

    existing = await db.scalar(query)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'"{normalized}" already exists',
        )


async def get_record_or_404(
    db: AsyncSession,
    model: type,
    record_id: uuid.UUID,
    *,
    detail: str,
):
    record = await db.get(model, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return record


async def refresh_and_return(db: AsyncSession, record: object):
    await db.flush()
    await db.refresh(record)
    return record


async def validate_safe_delete(
    db: AsyncSession,
    record: object,
    *,
    dependencies: list[ReferenceDeleteDependency],
) -> None:
    blocking: list[str] = []
    for dependency in dependencies:
        count = await db.scalar(dependency.query_factory(record))
        if count:
            blocking.append(f"{count} {dependency.label}")

    if blocking:
        record_name = getattr(record, "name", str(getattr(record, "id", "record")))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Cannot delete "{record_name}" because it is still referenced by {", ".join(blocking)}.',
        )


def count_rows(model: type, where_clause) -> Select:
    return select(func.count()).select_from(model).where(where_clause)
