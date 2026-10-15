from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TrustedTokenIssuer(Base):
    """External OAuth/JWT issuer whose access tokens CatalogIT accepts (e.g. for MCP clients)."""

    __tablename__ = "trusted_token_issuer"
    __table_args__ = (CheckConstraint("id = 1", name="ck_trusted_token_issuer_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    provider_name: Mapped[str] = mapped_column(String(100), default="")
    issuer_url: Mapped[str] = mapped_column(String(500), default="")
    #: Optional; discovered from the issuer's OpenID configuration when blank.
    jwks_url: Mapped[str] = mapped_column(String(500), default="")
    audience: Mapped[str] = mapped_column(String(500), default="")
    #: Claim whose value is matched against an existing CatalogIT user's email.
    email_claim: Mapped[str] = mapped_column(String(100), default="email")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())
