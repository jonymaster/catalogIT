from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.login_method import LoginMethod
from app.schemas.login_method import LoginMethodRead

router = APIRouter(prefix="/api/login-methods", tags=["login-methods"])


@router.get("/", response_model=list[LoginMethodRead])
async def list_login_methods(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(LoginMethod).order_by(LoginMethod.name))
    return result.scalars().all()
