from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class LaptopHardwareCostPut(BaseModel):
    """Single hardware purchase cost; stored as one cost_records row per laptop."""

    amount: float = Field(ge=0, description="Use 0 to remove the cost record")
    purchase_year: int | None = None
    fiscal_year: int | None = Field(
        default=None,
        description="Defaults to purchase year, or current calendar year if neither set",
    )

    @field_validator("purchase_year", "fiscal_year")
    @classmethod
    def validate_years(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1900 or v > 2100:
            raise ValueError("year must be between 1900 and 2100")
        return v
