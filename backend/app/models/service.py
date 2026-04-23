from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Table, Text, case, func, select
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base
from app.models.cost_record import CostRecord

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.contract import Contract
    from app.models.cost_center import CostCenter
    from app.models.payment_method import PaymentMethod
    from app.models.service_classification import ServiceClassification
    from app.models.service_history import ServiceHistoryEntry
    from app.models.service_status import ServiceStatus
    from app.models.tag import Tag
    from app.models.user import User
    from app.models.vendor import Vendor

service_owners = Table(
    "service_owners",
    Base.metadata,
    Column("id", type_=String(36), nullable=False),
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String(20), nullable=False, server_default="owner"),
)

service_assignments = Table(
    "service_assignments",
    Base.metadata,
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

service_related_services = Table(
    "service_related_services",
    Base.metadata,
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("related_service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
)

service_tags = Table(
    "service_tags",
    Base.metadata,
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

service_notification_recipients = Table(
    "service_notification_recipients",
    Base.metadata,
    Column("service_id", ForeignKey("services.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(50))
    sso_integrated: Mapped[bool] = mapped_column(Boolean, default=False)

    _latest_service_cost_year = (
        select(func.max(CostRecord.fiscal_year))
        .where(
            CostRecord.service_id == id,
            CostRecord.laptop_id.is_(None),
        )
        .correlate_except(CostRecord)
        .scalar_subquery()
    )
    _latest_actual_amount = (
        select(CostRecord.amount)
        .where(
            CostRecord.service_id == id,
            CostRecord.laptop_id.is_(None),
            CostRecord.fiscal_year == _latest_service_cost_year,
            CostRecord.record_type == "actual",
        )
        .order_by(CostRecord.recorded_at.desc())
        .limit(1)
        .correlate_except(CostRecord)
        .scalar_subquery()
    )
    _latest_estimated_amount = (
        select(CostRecord.amount)
        .where(
            CostRecord.service_id == id,
            CostRecord.laptop_id.is_(None),
            CostRecord.fiscal_year == _latest_service_cost_year,
            CostRecord.record_type == "estimated",
        )
        .order_by(CostRecord.recorded_at.desc())
        .limit(1)
        .correlate_except(CostRecord)
        .scalar_subquery()
    )
    yearly_cost = column_property(
        case(
            (_latest_service_cost_year.is_(None), None),
            else_=func.coalesce(_latest_actual_amount, 0) + func.coalesce(_latest_estimated_amount, 0),
        )
    )

    # --- New normalized columns ---
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    cost_center_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True
    )
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True
    )
    service_status_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_statuses.id", ondelete="SET NULL"), nullable=True
    )
    classification_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_classifications.id", ondelete="SET NULL"), nullable=True
    )
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True
    )
    renewal_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(100), nullable=True)
    environment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    renewal_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    renewal_offsets_days: Mapped[list[int] | None] = mapped_column(
        ARRAY(Integer), nullable=True
    )
    scim_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    criticality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nonprofit_pricing: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deprecated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    point_of_contact: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    owners: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=service_owners,
        lazy="selectin",
    )
    assignees: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=service_assignments,
        lazy="selectin",
    )
    related_services: Mapped[list["Service"]] = relationship(
        "Service",
        secondary=service_related_services,
        primaryjoin=id == service_related_services.c.service_id,
        secondaryjoin=id == service_related_services.c.related_service_id,
        lazy="selectin",
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        secondary=service_tags,
        lazy="selectin",
        order_by="Tag.name",
    )
    notification_recipients: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=service_notification_recipients,
        lazy="selectin",
    )
    vendor: Mapped["Vendor | None"] = relationship(lazy="selectin")  # noqa: F821
    category_rel: Mapped["Category | None"] = relationship(lazy="selectin")  # noqa: F821
    cost_center: Mapped["CostCenter | None"] = relationship(lazy="selectin")  # noqa: F821
    payment_method: Mapped["PaymentMethod | None"] = relationship(lazy="selectin")  # noqa: F821
    service_status: Mapped["ServiceStatus | None"] = relationship(lazy="selectin")  # noqa: F821
    service_classification: Mapped["ServiceClassification | None"] = relationship(  # noqa: F821
        lazy="selectin"
    )
    contract: Mapped["Contract | None"] = relationship(lazy="selectin")  # noqa: F821
    cost_records: Mapped[list["CostRecord"]] = relationship(  # noqa: F821
        lazy="noload",
        cascade="all, delete-orphan",
    )
    history_entries: Mapped[list["ServiceHistoryEntry"]] = relationship(  # noqa: F821
        lazy="noload",
        cascade="all, delete-orphan",
    )
