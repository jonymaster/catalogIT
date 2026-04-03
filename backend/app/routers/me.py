from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user
from app.dependencies.db import get_audited_db
from app.models.user import User
from app.schemas.user import UserPreferencesRead, UserPreferencesUpdate

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/preferences", response_model=UserPreferencesRead)
async def get_preferences(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/preferences", response_model=UserPreferencesRead)
async def update_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
):
    user = await db.get(User, current_user.id)
    update_data = body.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(user, field, value.strip() or None if isinstance(value, str) else value)

    await db.flush()
    await db.refresh(user)
    return user
