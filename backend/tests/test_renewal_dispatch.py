import unittest
from datetime import date

from app.notifications.renewal_dispatch import _normalize_offsets, _today_in_timezone


class RenewalDispatchHelpersTest(unittest.TestCase):
    def test_normalize_offsets_dedupes_preserves_order(self) -> None:
        self.assertEqual(_normalize_offsets([30, 14, 30, 7, 1]), [30, 14, 7, 1])

    def test_normalize_offsets_drops_non_positive(self) -> None:
        self.assertEqual(_normalize_offsets([30, 0, -1, 14]), [30, 14])

    def test_normalize_offsets_empty(self) -> None:
        self.assertEqual(_normalize_offsets([]), [])
        self.assertEqual(_normalize_offsets(None), [])

    def test_today_in_timezone_utc(self) -> None:
        d = _today_in_timezone("UTC")
        self.assertIsInstance(d, date)
