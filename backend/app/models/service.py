from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, ForeignKey, Numeric, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

service_owners = Table(
    "service_owners",
    Base.metadata,
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50))
    license_type: Mapped[str] = mapped_column(String(100), default="")
    category: Mapped[str] = mapped_column(String(100), default="")
    billing_schedule: Mapped[str] = mapped_column(String(100), default="")
    yearly_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    sso_integrated: Mapped[bool] = mapped_column(Boolean, default=False)
    automated_provisioning: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    owners: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=service_owners,
        lazy="selectin",
    )
