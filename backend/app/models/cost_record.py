from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CostRecord(Base):
    __tablename__ = "cost_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=True, index=True
    )
    laptop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("laptops.id", ondelete="CASCADE"), nullable=True, index=True
    )
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, index=True)
    purchase_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    record_type: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(server_default=func.now())
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    recorded_by: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821
    laptop: Mapped["Laptop | None"] = relationship(back_populates="cost_records", lazy="selectin")  # noqa: F821
    service: Mapped["Service | None"] = relationship(back_populates="cost_records", lazy="noload")  # noqa: F821
