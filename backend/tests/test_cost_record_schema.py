import unittest

from pydantic import ValidationError

from app.schemas.cost_record import CostRecordCreate, CostRecordUpdate
from app.schemas.service import ServiceCreate, ServiceUpdate
from app.schemas.hardware import HardwareAssetCreate, HardwareAssetUpdate
from app.schemas.hardware_cost import HardwareCostPut


class CostRecordSchemaTest(unittest.TestCase):
    def test_amount_rejects_negative_values(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordCreate(
                fiscal_year=2025,
                amount=-1.0,
                record_type="actual",
            )

    def test_fiscal_year_rejects_out_of_range(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordCreate(
                fiscal_year=1800,
                amount=100.0,
                record_type="actual",
            )

    def test_record_type_rejects_unknown_value(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordCreate(
                fiscal_year=2025,
                amount=100.0,
                record_type="forecast",
            )

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

    def test_update_rejects_unknown_record_type(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordUpdate(record_type="forecast")

    def test_update_rejects_null_fiscal_year(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordUpdate(fiscal_year=None)

    def test_update_rejects_null_amount(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordUpdate(amount=None)

    def test_update_rejects_null_record_type(self) -> None:
        with self.assertRaises(ValidationError):
            CostRecordUpdate(record_type=None)

    def test_hardware_hardware_cost_put_allows_zero(self) -> None:
        m = HardwareCostPut(amount=0)
        self.assertEqual(m.amount, 0)

    def test_hardware_hardware_cost_put_year_range(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareCostPut(amount=100, purchase_year=1800)

    def test_hardware_hardware_cost_put_rejects_negative_amount(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareCostPut(amount=-0.01)

    def test_hardware_hardware_cost_put_rejects_invalid_fiscal_year(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareCostPut(amount=100, fiscal_year=2200)


class ServiceSchemaValidationTest(unittest.TestCase):
    def test_service_create_rejects_blank_name(self) -> None:
        with self.assertRaises(ValidationError):
            ServiceCreate(name="   ")

    def test_service_create_rejects_invalid_renewal_offsets(self) -> None:
        with self.assertRaises(ValidationError):
            ServiceCreate(name="Payroll", renewal_offsets_days=[30, 0])

    def test_service_update_rejects_invalid_criticality(self) -> None:
        with self.assertRaises(ValidationError):
            ServiceUpdate(criticality="Urgent")


class HardwareAssetSchemaValidationTest(unittest.TestCase):
    def test_hardware_create_rejects_blank_serial_number(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareAssetCreate(serial_number="   ", model_name="MacBook Pro")

    def test_hardware_create_rejects_blank_model_name(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareAssetCreate(serial_number="SN-100", model_name="   ")

    def test_hardware_update_allows_clearing_optional_serial_number(self) -> None:
        # Requiredness depends on the resulting asset type and is checked by the route.
        self.assertIsNone(HardwareAssetUpdate(serial_number=None).serial_number)

    def test_hardware_update_rejects_null_model_name(self) -> None:
        with self.assertRaises(ValidationError):
            HardwareAssetUpdate(model_name=None)
