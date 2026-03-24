from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(index=True)
    filename: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(512))
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    uploaded_by: Mapped["User | None"] = relationship(lazy="selectin")  # noqa: F821
