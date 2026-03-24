from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.laptop import Laptop
from app.schemas.laptop import LaptopCreate, LaptopRead, LaptopUpdate

router = APIRouter(prefix="/api/laptops", tags=["laptops"])


@router.get("/", response_model=list[LaptopRead])
async def list_laptops(db: AsyncSession = Depends(get_audited_db)):
    result = await db.execute(select(Laptop).order_by(Laptop.serial_number))
    return result.scalars().all()


@router.get("/{laptop_id}", response_model=LaptopRead)
async def get_laptop(laptop_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    return laptop


@router.post("/", response_model=LaptopRead, status_code=status.HTTP_201_CREATED)
async def create_laptop(body: LaptopCreate, db: AsyncSession = Depends(get_audited_db)):
    laptop = Laptop(**body.model_dump())
    db.add(laptop)
    await db.flush()
    await db.refresh(laptop)
    return laptop


@router.put("/{laptop_id}", response_model=LaptopRead)
async def update_laptop(
    laptop_id: uuid.UUID,
    body: LaptopUpdate,
    db: AsyncSession = Depends(get_audited_db),
):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(laptop, field, value)

    await db.flush()
    await db.refresh(laptop)
    return laptop


@router.delete("/{laptop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_laptop(laptop_id: uuid.UUID, db: AsyncSession = Depends(get_audited_db)):
    laptop = await db.get(Laptop, laptop_id)
    if not laptop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laptop not found")
    await db.delete(laptop)
