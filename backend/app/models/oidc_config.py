from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OidcConfig(Base):
    __tablename__ = "oidc_config"
    __table_args__ = (CheckConstraint("id = 1", name="ck_oidc_config_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider_name: Mapped[str] = mapped_column(String(100), default="")
    issuer_url: Mapped[str] = mapped_column(String(500), default="")
    client_id: Mapped[str] = mapped_column(String(255), default="")
    client_secret: Mapped[str] = mapped_column(Text, default="")
    scopes: Mapped[str] = mapped_column(String(500), default="openid profile email")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
