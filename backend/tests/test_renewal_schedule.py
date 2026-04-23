import unittest
from datetime import date

from app.notifications.renewal_schedule import (
    advance_renewal,
    clamp_day,
    compute_next_renewal,
    normalize_config,
)


class ClampDayTest(unittest.TestCase):
    def test_clamps_day_31_in_february_non_leap(self) -> None:
        self.assertEqual(clamp_day(2025, 2, 31), 28)

    def test_clamps_day_31_in_february_leap(self) -> None:
        self.assertEqual(clamp_day(2024, 2, 31), 29)

    def test_clamps_day_31_in_30_day_month(self) -> None:
        self.assertEqual(clamp_day(2026, 4, 31), 30)

    def test_no_clamp_when_day_valid(self) -> None:
        self.assertEqual(clamp_day(2026, 1, 31), 31)
        self.assertEqual(clamp_day(2026, 1, 15), 15)


class NormalizeConfigTest(unittest.TestCase):
    def test_valid_annual(self) -> None:
        self.assertEqual(
            normalize_config({"type": "annual", "month": 3, "day": 15}),
            {"type": "annual", "month": 3, "day": 15},
        )

    def test_valid_monthly(self) -> None:
        self.assertEqual(
            normalize_config({"type": "monthly", "day": 5}),
            {"type": "monthly", "day": 5},
        )

    def test_rejects_unknown_type(self) -> None:
        self.assertIsNone(normalize_config({"type": "weekly", "day": 1}))

    def test_rejects_missing_month_on_annual(self) -> None:
        self.assertIsNone(normalize_config({"type": "annual", "day": 10}))

    def test_rejects_out_of_range(self) -> None:
        self.assertIsNone(normalize_config({"type": "annual", "month": 13, "day": 1}))
        self.assertIsNone(normalize_config({"type": "monthly", "day": 0}))
        self.assertIsNone(normalize_config({"type": "monthly", "day": 32}))

    def test_rejects_non_dict(self) -> None:
        self.assertIsNone(normalize_config(None))
        self.assertIsNone(normalize_config("annual"))


class ComputeNextRenewalAnnualTest(unittest.TestCase):
    def test_future_in_same_year(self) -> None:
        cfg = {"type": "annual", "month": 6, "day": 10}
        self.assertEqual(compute_next_renewal(cfg, date(2026, 3, 1)), date(2026, 6, 10))

    def test_today_returns_today(self) -> None:
        cfg = {"type": "annual", "month": 6, "day": 10}
        self.assertEqual(compute_next_renewal(cfg, date(2026, 6, 10)), date(2026, 6, 10))

    def test_past_in_year_rolls_to_next_year(self) -> None:
        cfg = {"type": "annual", "month": 2, "day": 15}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 3, 1)), date(2027, 2, 15)
        )

    def test_annual_feb_29_clamped_in_non_leap(self) -> None:
        cfg = {"type": "annual", "month": 2, "day": 29}
        self.assertEqual(
            compute_next_renewal(cfg, date(2025, 1, 1)), date(2025, 2, 28)
        )

    def test_annual_feb_29_in_leap_year(self) -> None:
        cfg = {"type": "annual", "month": 2, "day": 29}
        self.assertEqual(
            compute_next_renewal(cfg, date(2024, 1, 1)), date(2024, 2, 29)
        )


class ComputeNextRenewalMonthlyTest(unittest.TestCase):
    def test_future_in_current_month(self) -> None:
        cfg = {"type": "monthly", "day": 20}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 5, 10)), date(2026, 5, 20)
        )

    def test_today_returns_today(self) -> None:
        cfg = {"type": "monthly", "day": 10}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 5, 10)), date(2026, 5, 10)
        )

    def test_past_in_month_rolls_to_next_month(self) -> None:
        cfg = {"type": "monthly", "day": 5}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 5, 10)), date(2026, 6, 5)
        )

    def test_day_31_clamped_to_feb_end_non_leap(self) -> None:
        cfg = {"type": "monthly", "day": 31}
        self.assertEqual(
            compute_next_renewal(cfg, date(2025, 2, 1)), date(2025, 2, 28)
        )

    def test_day_31_clamped_to_april_30(self) -> None:
        cfg = {"type": "monthly", "day": 31}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 4, 1)), date(2026, 4, 30)
        )

    def test_december_rolls_to_january(self) -> None:
        cfg = {"type": "monthly", "day": 15}
        self.assertEqual(
            compute_next_renewal(cfg, date(2026, 12, 20)), date(2027, 1, 15)
        )


class AdvanceRenewalTest(unittest.TestCase):
    def test_annual_advances_one_year(self) -> None:
        cfg = {"type": "annual", "month": 3, "day": 15}
        self.assertEqual(advance_renewal(cfg, date(2026, 3, 15)), date(2027, 3, 15))

    def test_annual_feb_29_leap_to_non_leap(self) -> None:
        cfg = {"type": "annual", "month": 2, "day": 29}
        self.assertEqual(advance_renewal(cfg, date(2024, 2, 29)), date(2025, 2, 28))

    def test_monthly_advances_one_month(self) -> None:
        cfg = {"type": "monthly", "day": 15}
        self.assertEqual(advance_renewal(cfg, date(2026, 5, 15)), date(2026, 6, 15))

    def test_monthly_jan_31_to_feb_28(self) -> None:
        cfg = {"type": "monthly", "day": 31}
        self.assertEqual(advance_renewal(cfg, date(2025, 1, 31)), date(2025, 2, 28))

    def test_monthly_december_wraps_year(self) -> None:
        cfg = {"type": "monthly", "day": 10}
        self.assertEqual(advance_renewal(cfg, date(2026, 12, 10)), date(2027, 1, 10))


class InvalidConfigReturnsNoneTest(unittest.TestCase):
    def test_compute_next_renewal_none_for_invalid(self) -> None:
        self.assertIsNone(compute_next_renewal(None, date(2026, 1, 1)))
        self.assertIsNone(compute_next_renewal({"type": "weekly"}, date(2026, 1, 1)))

    def test_advance_renewal_none_for_invalid(self) -> None:
        self.assertIsNone(advance_renewal(None, date(2026, 1, 1)))


if __name__ == "__main__":
    unittest.main()
