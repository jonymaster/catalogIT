from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Table, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

service_owners = Table(
    "service_owners",
    Base.metadata,
    Column("id", type_=String(36), nullable=False),
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String(20), nullable=False, server_default="owner"),
)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))

    # --- Legacy columns (kept for backwards compat, will be dropped later) ---
    status: Mapped[str] = mapped_column(String(50))
    license_type: Mapped[str] = mapped_column(String(100), default="")
    yearly_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    sso_integrated: Mapped[bool] = mapped_column(Boolean, default=False)
    automated_provisioning: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- New normalized columns ---
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True
    )
    service_status_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_statuses.id", ondelete="SET NULL"), nullable=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True
    )
    classification: Mapped[str | None] = mapped_column(String(20), nullable=True)
    service_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    billing_schedule: Mapped[str] = mapped_column(String(100), default="")
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    renewal_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    renewal_offsets_days: Mapped[list[int] | None] = mapped_column(
        ARRAY(Integer), nullable=True
    )
    scim_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    scim_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    criticality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nonprofit_pricing: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deprecated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    owners: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=service_owners,
        lazy="selectin",
    )
    vendor: Mapped["Vendor | None"] = relationship(lazy="selectin")  # noqa: F821
    category_rel: Mapped["Category | None"] = relationship(lazy="selectin")  # noqa: F821
    payment_method: Mapped["PaymentMethod | None"] = relationship(lazy="selectin")  # noqa: F821
    service_status: Mapped["ServiceStatus | None"] = relationship(lazy="selectin")  # noqa: F821
    contract: Mapped["Contract | None"] = relationship(lazy="selectin")  # noqa: F821
    logins: Mapped[list["ServiceLogin"]] = relationship(  # noqa: F821
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    cost_records: Mapped[list["CostRecord"]] = relationship(  # noqa: F821
        lazy="noload",
        cascade="all, delete-orphan",
    )
    history_entries: Mapped[list["ServiceHistoryEntry"]] = relationship(  # noqa: F821
        lazy="noload",
        cascade="all, delete-orphan",
    )
