import unittest
import uuid
from datetime import datetime, timezone

from app.audit_pagination import decode_cursor, encode_cursor


class AuditPaginationTest(unittest.TestCase):
    def test_cursor_roundtrip(self) -> None:
        t = datetime(2026, 4, 5, 12, 0, 0, tzinfo=timezone.utc)
        rid = uuid.uuid4()
        cur = encode_cursor(t, rid)
        t2, r2 = decode_cursor(cur)
        self.assertEqual(t2, t)
        self.assertEqual(r2, rid)

    def test_invalid_cursor_raises(self) -> None:
        with self.assertRaises(ValueError):
            decode_cursor("not-a-cursor")
