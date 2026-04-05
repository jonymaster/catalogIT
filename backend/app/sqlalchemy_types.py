"""SQLAlchemy column types shared across models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class NaiveUTCDateTime(TypeDecorator):
    """PostgreSQL ``TIMESTAMP WITHOUT TIME ZONE`` storing UTC wall times.

    asyncpg rejects mixing naive and aware datetimes when binding parameters.
    This type coerces any timezone-aware value to UTC then drops ``tzinfo`` so
    inserts/updates always match the column type.
    """

    impl = DateTime(timezone=False)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, datetime):
            return value
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
