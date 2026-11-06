from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FiscalYearCloseBatch(Base):
    """One run of the close financial year action (see app.services.fiscal_year_close)."""

    __tablename__ = "fiscal_year_close_batches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    fiscal_year: Mapped[int] = mapped_column(Integer, index=True)
    uplift_pct: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    converted_count: Mapped[int] = mapped_column(Integer)
    created_count: Mapped[int] = mapped_column(Integer)
    converted_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    next_year_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reverted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    reverted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
