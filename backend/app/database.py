from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db(current_user_id: uuid.UUID | None = None) -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional async session.

    When `current_user_id` is provided (injected by route-level dependencies),
    it is stored on `session.info` so the audit listener can attribute changes.
    """
    async with async_session() as session:
        if current_user_id is not None:
            session.info["current_user_id"] = current_user_id
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
