from __future__ import annotations

import uuid

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.reference_data_colors import pick_random_badge_color


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    method_type: Mapped[str] = mapped_column(String(50), default="")
    last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(32), default=pick_random_badge_color)
