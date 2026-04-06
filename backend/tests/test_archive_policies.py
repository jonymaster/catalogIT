import unittest

from fastapi import HTTPException

from app.routers.laptops import _validate_archived_laptop_update_fields
from app.routers.services import _validate_archived_service_update_fields


class ArchiveUpdatePolicyTest(unittest.TestCase):
    def test_archived_service_allows_metadata_fields(self) -> None:
        _validate_archived_service_update_fields(
            {"notes": "note", "status": "Contract", "service_status_id": "abc"}
        )

    def test_archived_service_rejects_core_fields(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            _validate_archived_service_update_fields({"name": "new-name"})
        self.assertEqual(exc.exception.status_code, 400)

    def test_archived_laptop_allows_metadata_fields(self) -> None:
        _validate_archived_laptop_update_fields({"notes": "note", "status": "In Stock"})

    def test_archived_laptop_rejects_core_fields(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            _validate_archived_laptop_update_fields({"serial_number": "X"})
        self.assertEqual(exc.exception.status_code, 400)
