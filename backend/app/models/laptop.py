from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Laptop(Base):
    __tablename__ = "laptops"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    serial_number: Mapped[str] = mapped_column(String(255), unique=True)
    model_name: Mapped[str] = mapped_column(String(255))
    cpu: Mapped[str] = mapped_column(String(100), default="")
    ram: Mapped[str] = mapped_column(String(50), default="")
    storage_size: Mapped[str] = mapped_column(String(50), default="")
    status: Mapped[str] = mapped_column(String(50))
    hardware_status_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hardware_statuses.id", ondelete="SET NULL"), nullable=True
    )
    hardware_location_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hardware_locations.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    assigned_to: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821
    hardware_status: Mapped["HardwareStatus | None"] = relationship(lazy="selectin")  # noqa: F821
    hardware_location: Mapped["HardwareLocation | None"] = relationship(lazy="selectin")  # noqa: F821
    cost_records: Mapped[list["CostRecord"]] = relationship(  # noqa: F821
        back_populates="laptop",
        lazy="noload",
        cascade="all, delete-orphan",
    )
