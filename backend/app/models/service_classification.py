from __future__ import annotations

import uuid

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.reference_data_colors import pick_random_badge_color


class ServiceClassification(Base):
    __tablename__ = "service_classifications"
    __table_args__ = (UniqueConstraint("name", name="uq_service_classifications_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(32), default=pick_random_badge_color)
