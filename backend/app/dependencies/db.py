"""Database session dependencies with audit-user context."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.dependencies.auth import get_current_user
from app.models.user import User


async def get_audited_db(
    user: User = Depends(get_current_user),
) -> AsyncGenerator[AsyncSession, None]:
    """Yield a session that tags every flush with the authenticated user's ID."""
    async with async_session() as session:
        session.info["current_user_id"] = user.id
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
