from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.tag import Tag
from app.models.user import User
from app.reference_data_colors import pick_random_badge_color
from app.routers.reference_data_utils import (
    ensure_unique_name,
    get_record_or_404,
    refresh_and_return,
)
from app.schemas.tag import TagCreate, TagRead, TagUpdate

router = APIRouter(prefix="/api/tags", tags=["tags"])

_admin = require_role("admin")
_writer = require_role("admin", "editor")

# Workspace-wide cap: stops the tag library from growing unbounded.
MAX_TAGS_PER_WORKSPACE = 200


@router.get("/", response_model=list[TagRead])
async def list_tags(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Tag).order_by(Tag.name))
    return result.scalars().all()


@router.post("/", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    body: TagCreate,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    total = await db.scalar(select(func.count()).select_from(Tag))
    if total is not None and total >= MAX_TAGS_PER_WORKSPACE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tag limit reached ({MAX_TAGS_PER_WORKSPACE}). "
                "Ask an admin to delete unused tags before adding new ones."
            ),
        )
    await ensure_unique_name(db, Tag, body.name)
    tag = Tag(
        name=body.name.strip(),
        color=body.color or pick_random_badge_color(),
    )
    db.add(tag)
    return await refresh_and_return(db, tag)


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    tag = await get_record_or_404(db, Tag, tag_id, detail="Tag not found")
    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        await ensure_unique_name(db, Tag, update_data["name"], current_id=tag.id)
        tag.name = update_data["name"].strip()

    if "color" in update_data and update_data["color"] is not None:
        tag.color = update_data["color"]

    return await refresh_and_return(db, tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    # Deletion cascades via service_tags FK (ON DELETE CASCADE), removing the
    # tag from every service that referenced it.
    tag = await get_record_or_404(db, Tag, tag_id, detail="Tag not found")
    await db.delete(tag)
