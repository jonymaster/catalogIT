from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BrandingConfig(Base):
    __tablename__ = "branding_config"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_branding_config_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    logo_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
