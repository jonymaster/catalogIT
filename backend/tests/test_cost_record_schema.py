import unittest

from pydantic import ValidationError

from app.schemas.cost_record import CostRecordCreate, CostRecordUpdate
from app.schemas.laptop_hardware_cost import LaptopHardwareCostPut


class CostRecordSchemaTest(unittest.TestCase):
    def test_purchase_year_valid(self) -> None:
        m = CostRecordCreate(
            fiscal_year=2025,
            amount=100.0,
            record_type="actual",
            purchase_year=2024,
        )
        self.assertEqual(m.purchase_year, 2024)

    def test_purchase_year_rejects_out_of_range(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordCreate(
                fiscal_year=2025,
                amount=1.0,
                record_type="actual",
                purchase_year=1899,
            )

    def test_update_purchase_year_optional(self) -> None:
        u = CostRecordUpdate(fiscal_year=2026)
        self.assertIsNone(u.purchase_year)

    def test_laptop_hardware_cost_put_allows_zero(self) -> None:
        m = LaptopHardwareCostPut(amount=0)
        self.assertEqual(m.amount, 0)

    def test_laptop_hardware_cost_put_year_range(self) -> None:
        with self.assertRaises(ValidationError):
            LaptopHardwareCostPut(amount=100, purchase_year=1800)
