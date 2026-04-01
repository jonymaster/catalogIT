from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ServiceLogin(Base):
    __tablename__ = "service_logins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), index=True
    )
    login_method_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("login_methods.id", ondelete="CASCADE"), index=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    login_method: Mapped["LoginMethod"] = relationship(lazy="selectin")  # noqa: F821
