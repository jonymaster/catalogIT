import unittest
import uuid
from types import SimpleNamespace

from app.history_display import _friendly_laptop_value_dict, _laptop_assignee_label


class LaptopFriendlyAuditDictTest(unittest.TestCase):
    def test_dedupes_hardware_status_when_status_present(self) -> None:
        d = {
            "hardware_status_id": "In Stock",
            "status": "In Stock",
            "hardware_location_id": "Main office",
            "assigned_to_id": "Alice Example",
        }
        out = _friendly_laptop_value_dict(d)
        self.assertNotIn("hardware_status_id", out)
        self.assertEqual(out["status"], "In Stock")
        self.assertEqual(out["location"], "Main office")
        self.assertEqual(out["assigned_to"], "Alice Example")

    def test_renames_hardware_status_when_status_absent(self) -> None:
        out = _friendly_laptop_value_dict({"hardware_status_id": "Assigned"})
        self.assertEqual(out["status"], "Assigned")
        self.assertNotIn("hardware_status_id", out)


class LaptopAssigneeLabelTest(unittest.TestCase):
    def test_prefers_first_last(self) -> None:
        u = SimpleNamespace(
            first_name="Dwight",
            last_name="Schrute",
            email="a@b.com",
            id=uuid.uuid4(),
        )
        self.assertEqual(_laptop_assignee_label(u), "Dwight Schrute")

    def test_falls_back_to_email(self) -> None:
        u = SimpleNamespace(
            first_name="",
            last_name="",
            email="only@b.com",
            id=uuid.uuid4(),
        )
        self.assertEqual(_laptop_assignee_label(u), "only@b.com")

