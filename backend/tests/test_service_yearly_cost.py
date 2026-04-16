"""Service yearly_cost is a read-only scalar from the latest service cost record."""

from __future__ import annotations

import unittest

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models.service import Service


class ServiceYearlyCostDerivedTest(unittest.TestCase):
    def test_select_lists_yearly_cost_as_scalar_subquery(self) -> None:
        stmt = select(Service.id, Service.yearly_cost)
        compiled = stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": False},
        )
        sql = str(compiled).lower()
        self.assertIn("cost_records", sql)
        self.assertIn("fiscal_year", sql)
        self.assertIn("recorded_at", sql)
        self.assertIn("laptop_id", sql)
