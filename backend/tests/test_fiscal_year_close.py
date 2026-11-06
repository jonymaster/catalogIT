"""Close financial year: business rules via the pure core, plus router auth (no database)."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError

from app.database import get_db
from app.dependencies.auth import get_current_user, require_financial_view
from app.dependencies.db import get_audited_db
from app.routers import fiscal_year_close as close_router
from app.schemas.fiscal_year_close import CloseBatchRead
from app.services.fiscal_year_close import (
    FLAG_ADDED_DURING_YEAR,
    FLAG_ESTIMATE_WITH_ACTUAL,
    FLAG_MIXED_PAYMENT_METHODS,
    HASH_MISMATCH_DETAIL,
    NOTHING_TO_CLOSE_DETAIL,
    REVERT_CONFLICT_DETAIL,
    ConversionOverride,
    FiscalYearCloseError,
    NextYearOverride,
    RecordSnapshot,
    ServiceSnapshot,
    apply_overrides,
    build_execution_plan,
    build_plan,
    compute_plan_hash,
    execute_close,
    is_lock_conflict,
    later_closes_detail,
    revert_close,
    unarchive_detail,
)

X = 2025
CURRENT_YEAR = 2026
D = Decimal


def _service(name: str = "Service", *, active: bool = True, created_at: datetime | None = None) -> ServiceSnapshot:
    return ServiceSnapshot(
        id=uuid.uuid4(),
        name=name,
        is_active=active,
        created_at=created_at or datetime(2020, 1, 1, 9, 0, 0),
    )


def _record(
    service: ServiceSnapshot | None,
    record_type: str,
    amount: str,
    *,
    year: int = X,
    payment_method_id: uuid.UUID | None = None,
    hardware_id: uuid.UUID | None = None,
    recorded_at: datetime | None = None,
    notes: str | None = None,
) -> RecordSnapshot:
    return RecordSnapshot(
        id=uuid.uuid4(),
        service_id=service.id if service else None,
        fiscal_year=year,
        record_type=record_type,
        amount=D(amount),
        hardware_id=hardware_id,
        payment_method_id=payment_method_id,
        notes=notes,
        recorded_at=recorded_at or datetime(X, 3, 1, 12, 0, 0),
    )


def _plan(records, services, *, uplift: str | int = 0, current_year: int = CURRENT_YEAR, year: int = X):
    return build_plan(year, records, services, current_year=current_year, uplift_pct=D(str(uplift)))


def _execution_plan(records, services, *, conversions=(), next_year=(), uplift: str | int = 0, plan_hash=None):
    plan_hash = plan_hash or compute_plan_hash(X, records, services)
    return build_execution_plan(
        X,
        records,
        services,
        current_year=CURRENT_YEAR,
        plan_hash=plan_hash,
        uplift_pct=D(str(uplift)),
        conversions=conversions,
        next_year=next_year,
    )


def _only(plan):
    assert len(plan.services) == 1, plan.services
    return plan.services[0]


class ConversionTest(unittest.TestCase):
    def test_estimates_convert_with_their_amount_and_sum_into_next_year(self) -> None:
        svc = _service("CRM")
        first = _record(svc, "estimated", "1200.00", recorded_at=datetime(X, 1, 1))
        second = _record(svc, "estimated", "300.50", recorded_at=datetime(X, 6, 1))
        plan = _plan([first, second], [svc])

        row = _only(plan)
        self.assertEqual([c.record_id for c in row.conversions], [first.id, second.id])
        self.assertTrue(all(c.include for c in row.conversions))
        self.assertEqual([c.flags for c in row.conversions], [(), ()])
        self.assertEqual(row.existing_actual_total, D("0.00"))
        self.assertEqual(row.next_year.action, "create")
        self.assertEqual(row.next_year.amount, D("1500.50"))
        self.assertIsNone(row.next_year.skip_reason)
        self.assertEqual(plan.converted_total, D("1500.50"))
        self.assertEqual(plan.next_year_total, D("1500.50"))
        self.assertEqual((plan.converted_count, plan.created_count), (2, 1))
        self.assertEqual(plan.next_fiscal_year, X + 1)

    def test_amount_override_and_exclusion_change_conversions_and_next_year(self) -> None:
        svc = _service()
        keep = _record(svc, "estimated", "1200.00")
        drop = _record(svc, "estimated", "100.00")
        records = [keep, drop]
        final = _execution_plan(
            records,
            [svc],
            conversions=[
                ConversionOverride(record_id=keep.id, amount=D("1250")),
                ConversionOverride(record_id=drop.id, include=False),
            ],
        )
        row = _only(final)
        by_id = {c.record_id: c for c in row.conversions}
        self.assertEqual(by_id[keep.id].amount, D("1250.00"))
        self.assertTrue(by_id[keep.id].include)
        self.assertFalse(by_id[drop.id].include)
        self.assertEqual(row.next_year.amount, D("1250.00"))
        self.assertEqual((final.converted_count, final.converted_total), (1, D("1250.00")))
        self.assertEqual((final.created_count, final.next_year_total), (1, D("1250.00")))

    def test_service_with_only_actuals_still_gets_next_year_estimate(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "actual", "400.00"), _record(svc, "actual", "100.00")], [svc])
        row = _only(plan)
        self.assertEqual(row.conversions, ())
        self.assertEqual(row.existing_actual_total, D("500.00"))
        self.assertEqual((row.next_year.action, row.next_year.amount), ("create", D("500.00")))

    def test_conversions_sorted_by_recorded_at_then_id_and_services_by_name(self) -> None:
        beta = _service("beta")
        alpha = _service("Alpha")
        same_time = datetime(X, 5, 5)
        a1 = _record(alpha, "estimated", "1", recorded_at=same_time)
        a2 = _record(alpha, "estimated", "2", recorded_at=same_time)
        a0 = _record(alpha, "estimated", "3", recorded_at=datetime(X, 1, 1))
        plan = _plan([_record(beta, "estimated", "5"), a1, a2, a0], [beta, alpha])
        self.assertEqual([s.service_name for s in plan.services], ["Alpha", "beta"])
        tied = sorted([a1, a2], key=lambda r: r.id.int)
        self.assertEqual([c.record_id for c in plan.services[0].conversions], [a0.id, *[r.id for r in tied]])


class NextYearAmountTest(unittest.TestCase):
    def test_sum_of_actuals_with_uplift(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "actual", "1000.00"), _record(svc, "estimated", "200.00")], [svc], uplift="2.5")
        row = _only(plan)
        # Actual exists, so the estimate is excluded by default and not counted.
        self.assertEqual(row.next_year.amount, D("1025.00"))
        # Decimal equality ignores the exponent: compare the text to check the 2-decimal form.
        self.assertEqual(str(plan.uplift_pct), "2.50")

    def test_uplift_is_rounded_to_two_decimals_before_it_is_applied(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "actual", "1000.00")], [svc], uplift="2.555")
        self.assertEqual(str(plan.uplift_pct), "2.56")
        # 1000.00 * 1.0256 = 1025.60; the unrounded 2.555 would give 1025.55.
        self.assertEqual(str(_only(plan).next_year.amount), "1025.60")

    def test_rounding_is_half_up_on_cents(self) -> None:
        svc = _service()
        # 0.10 * 1.05 = 0.105 -> 0.11 with ROUND_HALF_UP (banker's rounding would give 0.10).
        self.assertEqual(_only(_plan([_record(svc, "estimated", "0.10")], [svc], uplift=5)).next_year.amount, D("0.11"))
        # 1.00 * 1.005 = 1.005 -> 1.01 (binary floats give 1.0).
        self.assertEqual(_only(_plan([_record(svc, "estimated", "1.00")], [svc], uplift="0.5")).next_year.amount, D("1.01"))

    def test_negative_uplift_reduces_amount(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "estimated", "999.99")], [svc], uplift="-10")
        self.assertEqual(_only(plan).next_year.amount, D("899.99"))

    def test_next_year_amount_is_recomputed_from_final_conversions_with_uplift(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "100.00")
        final = _execution_plan(
            [_record(svc, "actual", "50.00"), est],
            [svc],
            conversions=[ConversionOverride(record_id=est.id, include=True, amount=D("150.00"))],
            uplift=10,
        )
        self.assertEqual(_only(final).next_year.amount, D("220.00"))

    def test_next_year_override_amount_wins(self) -> None:
        svc = _service()
        final = _execution_plan(
            [_record(svc, "estimated", "100.00")],
            [svc],
            next_year=[NextYearOverride(service_id=svc.id, amount=D("130.555"))],
            uplift=50,
        )
        row = _only(final)
        self.assertEqual((row.next_year.action, row.next_year.amount), ("create", D("130.56")))
        self.assertEqual(final.next_year_total, D("130.56"))

    def test_next_year_override_exclude_skips_creation(self) -> None:
        svc = _service()
        final = _execution_plan(
            [_record(svc, "estimated", "100.00")],
            [svc],
            next_year=[NextYearOverride(service_id=svc.id, include=False)],
        )
        self.assertEqual(_only(final).next_year.action, "skip")
        self.assertEqual((final.converted_count, final.created_count), (1, 0))

    def test_next_year_above_record_maximum_is_rejected_on_execute(self) -> None:
        svc = _service()
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan([_record(svc, "estimated", "9999999999.99")], [svc], uplift=10)
        self.assertEqual(ctx.exception.status_code, 400)


class SelectionTest(unittest.TestCase):
    def test_archived_service_is_skipped_completely(self) -> None:
        archived = _service("Old tool", active=False)
        archived_actual_only = _service("Legacy", active=False)
        active = _service("Current")
        records = [
            _record(archived, "estimated", "100.00"),
            _record(archived, "actual", "50.00"),
            _record(archived_actual_only, "actual", "75.00"),
            _record(active, "estimated", "10.00"),
        ]
        plan = _plan(records, [archived, archived_actual_only, active])
        self.assertEqual([s.service_id for s in plan.services], [active.id])
        self.assertEqual([(s.service_id, s.service_name, s.reason) for s in plan.skipped], [(archived.id, "Old tool", "archived")])
        self.assertEqual(plan.converted_total, D("10.00"))
        self.assertEqual(plan.next_year_total, D("10.00"))

    def test_override_on_archived_service_record_is_unknown(self) -> None:
        archived = _service(active=False)
        active = _service()
        archived_record = _record(archived, "estimated", "100.00")
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan(
                [archived_record, _record(active, "estimated", "1.00")],
                [archived, active],
                conversions=[ConversionOverride(record_id=archived_record.id, include=True)],
            )
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan(
                [archived_record, _record(active, "estimated", "1.00")],
                [archived, active],
                next_year=[NextYearOverride(service_id=archived.id, amount=D("5"))],
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_budget_records_are_ignored(self) -> None:
        svc = _service()
        budget_only = _service("Budget only")
        budget = _record(svc, "budget", "5000.00")
        plan = _plan(
            [budget, _record(svc, "estimated", "100.00"), _record(budget_only, "budget", "10.00")],
            [svc, budget_only],
        )
        row = _only(plan)
        self.assertNotIn(budget.id, [c.record_id for c in row.conversions])
        self.assertEqual(row.existing_actual_total, D("0.00"))
        self.assertEqual(row.next_year.amount, D("100.00"))
        self.assertEqual(plan.skipped, ())

    def test_hardware_cost_records_are_ignored(self) -> None:
        svc = _service()
        hardware_only = _record(None, "estimated", "900.00", hardware_id=uuid.uuid4())
        both_set = _record(svc, "estimated", "800.00", hardware_id=uuid.uuid4())
        service_record = _record(svc, "estimated", "100.00")
        plan = _plan([hardware_only, both_set, service_record], [svc])
        row = _only(plan)
        self.assertEqual([c.record_id for c in row.conversions], [service_record.id])
        self.assertEqual(plan.converted_total, D("100.00"))
        self.assertEqual(plan.plan_hash, _plan([service_record], [svc]).plan_hash)

    def test_other_years_are_ignored(self) -> None:
        svc = _service()
        plan = _plan(
            [_record(svc, "estimated", "1.00", year=X - 1), _record(svc, "estimated", "2.00", year=X + 2), _record(svc, "estimated", "3.00")],
            [svc],
        )
        row = _only(plan)
        self.assertEqual(len(row.conversions), 1)
        self.assertEqual(row.next_year.action, "create")


class FlagsTest(unittest.TestCase):
    def test_estimate_with_actual_is_excluded_by_default(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "actual", "500.00"), _record(svc, "estimated", "100.00")], [svc])
        row = _only(plan)
        self.assertEqual(len(row.conversions), 1)
        self.assertFalse(row.conversions[0].include)
        self.assertEqual(row.conversions[0].flags, (FLAG_ESTIMATE_WITH_ACTUAL,))
        self.assertEqual(row.existing_actual_total, D("500.00"))
        self.assertEqual(row.next_year.amount, D("500.00"))
        self.assertEqual(plan.converted_total, D("0.00"))

    def test_estimate_with_actual_converts_when_included(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "100.00")
        final = _execution_plan(
            [_record(svc, "actual", "500.00"), est],
            [svc],
            conversions=[ConversionOverride(record_id=est.id, include=True)],
        )
        row = _only(final)
        self.assertTrue(row.conversions[0].include)
        self.assertEqual(row.next_year.amount, D("600.00"))
        self.assertEqual((final.converted_count, final.converted_total), (1, D("100.00")))

    def test_added_during_year(self) -> None:
        new = _service("New", created_at=datetime(X, 7, 1))
        old = _service("Old", created_at=datetime(X - 1, 12, 31, 23, 59))
        # Created after year X (records back-filled into X): not "added during" year X.
        later = _service("Later", created_at=datetime(X + 1, 1, 1, 0, 0))
        plan = _plan(
            [_record(new, "estimated", "10"), _record(old, "estimated", "10"), _record(later, "estimated", "10")],
            [new, old, later],
        )
        flags = {s.service_name: s.next_year.flags for s in plan.services}
        self.assertEqual(flags, {"New": (FLAG_ADDED_DURING_YEAR,), "Old": (), "Later": ()})

    def test_year_not_ended_only_for_current_year(self) -> None:
        svc = _service()
        records = [_record(svc, "estimated", "10", year=CURRENT_YEAR)]
        self.assertTrue(_plan(records, [svc], year=CURRENT_YEAR).year_not_ended)
        self.assertFalse(_plan([_record(svc, "estimated", "10")], [svc]).year_not_ended)


class PaymentMethodTest(unittest.TestCase):
    def test_shared_payment_method_is_copied(self) -> None:
        svc = _service()
        card = uuid.uuid4()
        plan = _plan([_record(svc, "estimated", "10", payment_method_id=card), _record(svc, "estimated", "20", payment_method_id=card)], [svc])
        row = _only(plan)
        self.assertEqual(row.next_year.payment_method_id, card)
        self.assertEqual(row.next_year.flags, ())

    def test_no_payment_method_everywhere_is_none_without_flag(self) -> None:
        svc = _service()
        row = _only(_plan([_record(svc, "estimated", "10"), _record(svc, "actual", "5")], [svc]))
        self.assertIsNone(row.next_year.payment_method_id)
        self.assertEqual(row.next_year.flags, ())

    def test_mixed_payment_methods_give_none_and_flag(self) -> None:
        svc = _service()
        row = _only(
            _plan(
                [_record(svc, "estimated", "10", payment_method_id=uuid.uuid4()), _record(svc, "estimated", "20", payment_method_id=uuid.uuid4())],
                [svc],
            )
        )
        self.assertIsNone(row.next_year.payment_method_id)
        self.assertEqual(row.next_year.flags, (FLAG_MIXED_PAYMENT_METHODS,))

    def test_missing_payment_method_counts_as_a_value(self) -> None:
        svc = _service()
        row = _only(_plan([_record(svc, "estimated", "10", payment_method_id=uuid.uuid4()), _record(svc, "estimated", "20")], [svc]))
        self.assertIsNone(row.next_year.payment_method_id)
        self.assertIn(FLAG_MIXED_PAYMENT_METHODS, row.next_year.flags)

    def test_payment_method_is_recomputed_from_final_includes(self) -> None:
        svc = _service()
        card = uuid.uuid4()
        other = _record(svc, "estimated", "20", payment_method_id=uuid.uuid4())
        final = _execution_plan(
            [_record(svc, "estimated", "10", payment_method_id=card), other],
            [svc],
            conversions=[ConversionOverride(record_id=other.id, include=False)],
        )
        row = _only(final)
        self.assertEqual(row.next_year.payment_method_id, card)
        self.assertEqual(row.next_year.flags, ())

    def test_existing_actual_payment_method_ids_are_distinct_none_last(self) -> None:
        svc = _service()
        low, high = sorted([uuid.uuid4(), uuid.uuid4()], key=str)
        records = [
            _record(svc, "actual", "1", payment_method_id=high),
            _record(svc, "actual", "2"),
            _record(svc, "actual", "3", payment_method_id=low),
            _record(svc, "actual", "4", payment_method_id=high),
            # Estimates do not count, even when included.
            _record(svc, "estimated", "5", payment_method_id=uuid.uuid4()),
        ]
        row = _only(_plan(records, [svc]))
        self.assertEqual(row.existing_actual_payment_method_ids, (low, high, None))
        self.assertEqual(_only(_plan([_record(svc, "estimated", "5")], [svc])).existing_actual_payment_method_ids, ())

    def test_excluded_estimate_does_not_count_for_payment_method(self) -> None:
        svc = _service()
        card = uuid.uuid4()
        row = _only(_plan([_record(svc, "actual", "10", payment_method_id=card), _record(svc, "estimated", "5", payment_method_id=uuid.uuid4())], [svc]))
        self.assertEqual(row.next_year.payment_method_id, card)
        self.assertEqual(row.next_year.flags, ())


class NextYearSkipTest(unittest.TestCase):
    def test_next_year_exists_skips_copy(self) -> None:
        svc = _service()
        plan = _plan([_record(svc, "estimated", "100.00"), _record(svc, "estimated", "80.00", year=X + 1)], [svc])
        row = _only(plan)
        self.assertEqual((row.next_year.action, row.next_year.skip_reason), ("skip", "next_year_exists"))
        self.assertEqual(row.next_year.amount, D("100.00"))
        self.assertTrue(row.conversions[0].include)
        self.assertEqual(plan.next_year_total, D("0.00"))

    def test_next_year_exists_with_budget_only(self) -> None:
        svc = _service()
        row = _only(_plan([_record(svc, "estimated", "100.00"), _record(svc, "budget", "1.00", year=X + 1)], [svc]))
        self.assertEqual(row.next_year.skip_reason, "next_year_exists")

    def test_next_year_exists_override_include_rejected_exclude_accepted(self) -> None:
        svc = _service()
        records = [_record(svc, "estimated", "100.00"), _record(svc, "actual", "5.00", year=X + 1)]
        for override in (NextYearOverride(service_id=svc.id, include=True), NextYearOverride(service_id=svc.id, amount=D("5"))):
            with self.assertRaises(FiscalYearCloseError) as ctx:
                _execution_plan(records, [svc], next_year=[override])
            self.assertEqual(ctx.exception.status_code, 400)
        final = _execution_plan(records, [svc], next_year=[NextYearOverride(service_id=svc.id, include=False)])
        self.assertEqual((final.converted_count, final.created_count), (1, 0))

    def test_zero_amount_skips_copy(self) -> None:
        svc = _service()
        row = _only(_plan([_record(svc, "estimated", "0.00")], [svc]))
        self.assertEqual((row.next_year.action, row.next_year.skip_reason, row.next_year.amount), ("skip", "zero_amount", D("0.00")))

    def test_uplift_minus_100_gives_zero_amount(self) -> None:
        svc = _service()
        row = _only(_plan([_record(svc, "actual", "10.00")], [svc], uplift=-100))
        self.assertEqual((row.next_year.skip_reason, row.next_year.amount), ("zero_amount", D("0.00")))

    def test_override_amount_turns_zero_amount_into_create_and_zero_into_skip(self) -> None:
        svc = _service()
        other = _service("Other")
        records = [_record(svc, "estimated", "0.00"), _record(other, "estimated", "10.00")]
        final = _execution_plan(
            records,
            [svc, other],
            next_year=[
                NextYearOverride(service_id=svc.id, amount=D("12")),
                NextYearOverride(service_id=other.id, amount=D("0")),
            ],
        )
        rows = {s.service_id: s.next_year for s in final.services}
        self.assertEqual((rows[svc.id].action, rows[svc.id].amount), ("create", D("12.00")))
        self.assertEqual((rows[other.id].action, rows[other.id].skip_reason), ("skip", "zero_amount"))


class ValidationTest(unittest.TestCase):
    def assert_400(self, fn) -> FiscalYearCloseError:
        with self.assertRaises(FiscalYearCloseError) as ctx:
            fn()
        self.assertEqual(ctx.exception.status_code, 400)
        return ctx.exception

    def test_future_year_rejected(self) -> None:
        self.assert_400(lambda: _plan([], [], year=CURRENT_YEAR + 1))
        self.assertTrue(_plan([], [], year=CURRENT_YEAR).year_not_ended)

    def test_year_outside_range_rejected(self) -> None:
        self.assert_400(lambda: _plan([], [], year=1899))
        self.assert_400(lambda: _plan([], [], year=2101, current_year=2200))

    def test_uplift_out_of_range_rejected(self) -> None:
        self.assert_400(lambda: _plan([], [], uplift="-100.01"))
        self.assert_400(lambda: _plan([], [], uplift="1000.01"))
        self.assertEqual(_plan([], [], uplift="1000").uplift_pct, D("1000.00"))

    def test_unknown_record_override_rejected(self) -> None:
        svc = _service()
        records = [_record(svc, "estimated", "10")]
        self.assert_400(lambda: _execution_plan(records, [svc], conversions=[ConversionOverride(record_id=uuid.uuid4(), include=True)]))

    def test_unknown_service_override_rejected(self) -> None:
        svc = _service()
        records = [_record(svc, "estimated", "10")]
        self.assert_400(lambda: _execution_plan(records, [svc], next_year=[NextYearOverride(service_id=uuid.uuid4(), include=True)]))

    def test_negative_override_rejected(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "10")
        self.assert_400(lambda: _execution_plan([est], [svc], conversions=[ConversionOverride(record_id=est.id, amount=D("-0.01"))]))
        self.assert_400(lambda: _execution_plan([est], [svc], next_year=[NextYearOverride(service_id=svc.id, amount=D("-1"))]))

    def test_override_above_maximum_rejected(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "10")
        self.assert_400(lambda: _execution_plan([est], [svc], conversions=[ConversionOverride(record_id=est.id, amount=D("10000000000"))]))
        self.assert_400(lambda: _execution_plan([est], [svc], conversions=[ConversionOverride(record_id=est.id, amount=D("9999999999.995"))]))
        self.assert_400(lambda: _execution_plan([est], [svc], next_year=[NextYearOverride(service_id=svc.id, amount=D("1E+40"))]))
        final = _execution_plan([est], [svc], conversions=[ConversionOverride(record_id=est.id, amount=D("9999999999.99"))], next_year=[NextYearOverride(service_id=svc.id, include=False)])
        self.assertEqual(final.converted_total, D("9999999999.99"))

    def test_duplicate_override_rejected(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "10")
        self.assert_400(lambda: _execution_plan([est], [svc], conversions=[ConversionOverride(record_id=est.id), ConversionOverride(record_id=est.id)]))

    def test_override_validation_does_not_mutate_the_default_plan(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "10")
        plan = _plan([est], [svc])
        updated = apply_overrides(plan, [ConversionOverride(record_id=est.id, amount=D("99"))])
        self.assertEqual(_only(plan).conversions[0].amount, D("10.00"))
        self.assertEqual(_only(updated).conversions[0].amount, D("99.00"))


class EmptyPlanTest(unittest.TestCase):
    def test_nothing_to_convert_or_create_is_400(self) -> None:
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan([], [])
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (400, NOTHING_TO_CLOSE_DETAIL))

    def test_rerun_after_close_finds_nothing(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "100.00")
        first = _execution_plan([est], [svc])
        self.assertEqual((first.converted_count, first.created_count), (1, 1))
        # State after the close: the estimate is now actual and X+1 has the rolled-over estimate.
        after = [
            RecordSnapshot(**{**est.__dict__, "record_type": "actual"}),
            _record(svc, "estimated", "100.00", year=X + 1),
        ]
        plan = _plan(after, [svc])
        self.assertEqual(_only(plan).next_year.skip_reason, "next_year_exists")
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan(after, [svc])
        self.assertEqual(ctx.exception.detail, NOTHING_TO_CLOSE_DETAIL)

    def test_everything_excluded_is_empty(self) -> None:
        svc = _service()
        est = _record(svc, "estimated", "10")
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan(
                [est],
                [svc],
                conversions=[ConversionOverride(record_id=est.id, include=False)],
            )
        self.assertEqual(ctx.exception.detail, NOTHING_TO_CLOSE_DETAIL)


class PlanHashTest(unittest.TestCase):
    def setUp(self) -> None:
        self.svc = _service()
        self.est = _record(self.svc, "estimated", "100.00")
        self.act = _record(self.svc, "actual", "50.00")
        self.records = [self.est, self.act]

    def _hash(self, records=None, services=None) -> str:
        return compute_plan_hash(X, self.records if records is None else records, [self.svc] if services is None else services)

    def test_format_and_stability(self) -> None:
        value = self._hash()
        self.assertRegex(value, r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(value, self._hash(list(reversed(self.records))))
        self.assertEqual(value, _plan(self.records, [self.svc], uplift=7).plan_hash)
        self.assertEqual(value, self._hash([RecordSnapshot(**{**self.est.__dict__, "amount": D("100")}), self.act]))

    def test_independent_of_notes_other_years_and_payment_method(self) -> None:
        value = self._hash()
        changed = RecordSnapshot(**{**self.est.__dict__, "notes": "edited", "payment_method_id": uuid.uuid4()})
        self.assertEqual(value, self._hash([changed, self.act]))
        self.assertEqual(value, self._hash([*self.records, _record(self.svc, "estimated", "1", year=X + 2)]))

    def test_sensitive_to_record_changes(self) -> None:
        value = self._hash()
        self.assertNotEqual(value, self._hash([RecordSnapshot(**{**self.est.__dict__, "amount": D("100.01")}), self.act]))
        self.assertNotEqual(value, self._hash([RecordSnapshot(**{**self.est.__dict__, "record_type": "actual"}), self.act]))
        self.assertNotEqual(value, self._hash([RecordSnapshot(**{**self.est.__dict__, "fiscal_year": X + 1}), self.act]))
        self.assertNotEqual(value, self._hash([*self.records, _record(self.svc, "budget", "1", year=X + 1)]))
        self.assertNotEqual(value, self._hash([self.est]))
        self.assertNotEqual(value, compute_plan_hash(X - 1, self.records, [self.svc]))

    def test_sensitive_to_service_active_state(self) -> None:
        archived = ServiceSnapshot(id=self.svc.id, name=self.svc.name, is_active=False, created_at=self.svc.created_at)
        self.assertNotEqual(self._hash(), self._hash(services=[archived]))
        renamed = ServiceSnapshot(id=self.svc.id, name="Renamed", is_active=True, created_at=self.svc.created_at)
        self.assertEqual(self._hash(), self._hash(services=[renamed]))

    def test_hash_mismatch_is_409(self) -> None:
        with self.assertRaises(FiscalYearCloseError) as ctx:
            _execution_plan(self.records, [self.svc], plan_hash="sha256:" + "0" * 64)
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (409, HASH_MISMATCH_DETAIL))


class RevertDetailTest(unittest.TestCase):
    def test_unarchive_detail_lists_sorted_names(self) -> None:
        self.assertEqual(
            unarchive_detail(["zeta", "Alpha", "beta"]),
            "Unarchive these services before reverting: Alpha, beta, zeta",
        )

    def test_later_closes_detail_lists_unique_years_ascending(self) -> None:
        self.assertEqual(later_closes_detail([2027, 2026, 2027]), "Revert these later closes first: FY2026, FY2027")
        self.assertEqual(later_closes_detail([2026]), "Revert these later closes first: FY2026")


def _db_error(sqlstate: str, *, via_cause: bool = False, cls: type[DBAPIError] = DBAPIError) -> DBAPIError:
    """A SQLAlchemy error shaped like the asyncpg adapter's (pgcode/sqlstate, asyncpg error as cause)."""
    if via_cause:
        cause = Exception("asyncpg error")
        cause.sqlstate = sqlstate
        orig = Exception("adapter error")
        orig.__cause__ = cause
    else:
        orig = Exception("adapter error")
        orig.pgcode = orig.sqlstate = sqlstate
    return cls("SELECT 1", None, orig)


class _FailingDb:
    """Raises the given error on the first query, like a deadlock while taking the locks."""

    def __init__(self, exc: BaseException) -> None:
        self.exc = exc
        self.calls = 0

    async def execute(self, *_args, **_kwargs):
        self.calls += 1
        raise self.exc


class LockConflictTest(unittest.TestCase):
    def test_detects_deadlock_and_serialization_failure(self) -> None:
        for sqlstate in ("40P01", "40001"):
            for via_cause in (False, True):
                self.assertTrue(is_lock_conflict(_db_error(sqlstate, via_cause=via_cause)), (sqlstate, via_cause))
        self.assertTrue(is_lock_conflict(_db_error("40P01", cls=OperationalError)))
        self.assertFalse(is_lock_conflict(_db_error("23505", cls=IntegrityError)))
        self.assertFalse(is_lock_conflict(ValueError("40P01")))

    def test_execute_maps_lock_conflicts_to_409_reload_preview(self) -> None:
        for sqlstate in ("40P01", "40001"):
            db = _FailingDb(_db_error(sqlstate, via_cause=sqlstate == "40001"))
            with self.assertRaises(FiscalYearCloseError) as ctx:
                asyncio.run(execute_close(db, user_id=None, fiscal_year=X, plan_hash="sha256:x", current_year=CURRENT_YEAR))
            self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (409, HASH_MISMATCH_DETAIL))
            self.assertEqual(db.calls, 1)

    def test_revert_maps_lock_conflicts_to_409_try_again(self) -> None:
        for sqlstate in ("40P01", "40001"):
            db = _FailingDb(_db_error(sqlstate, via_cause=sqlstate == "40P01"))
            with self.assertRaises(FiscalYearCloseError) as ctx:
                asyncio.run(revert_close(db, user_id=None, batch_id=uuid.uuid4()))
            self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (409, REVERT_CONFLICT_DETAIL))
        self.assertEqual(REVERT_CONFLICT_DETAIL, "Cost records changed during revert; try again")

    def test_other_database_errors_are_not_mapped(self) -> None:
        error = _db_error("23505", cls=IntegrityError)
        with self.assertRaises(IntegrityError):
            asyncio.run(revert_close(_FailingDb(error), user_id=None, batch_id=uuid.uuid4()))
        with self.assertRaises(IntegrityError):
            asyncio.run(execute_close(_FailingDb(error), user_id=None, fiscal_year=X, plan_hash="sha256:x", current_year=CURRENT_YEAR))


class BatchReadTest(unittest.TestCase):
    def _batch(self, **extra) -> CloseBatchRead:
        values = {
            "id": uuid.uuid4(),
            "fiscal_year": X,
            "uplift_pct": D("0.00"),
            "converted_count": 0,
            "created_count": 0,
            "converted_total": D("0.00"),
            "next_year_total": D("0.00"),
            "created_at": datetime(2026, 1, 2, 3, 4, 5),
            "created_by_id": None,
            "created_by_name": None,
            "reverted_at": None,
            "reverted_by_id": None,
            "reverted_by_name": None,
            "changed_since_close": 0,
            **extra,
        }
        return CloseBatchRead(**values)

    def test_timestamps_serialize_as_utc_with_offset(self) -> None:
        body = self._batch(reverted_at=datetime(2026, 1, 2, 5, 4, 5, tzinfo=timezone(timedelta(hours=2)))).model_dump(mode="json")
        self.assertEqual(body["created_at"], "2026-01-02T03:04:05+00:00")
        self.assertEqual(body["reverted_at"], "2026-01-02T03:04:05+00:00")
        self.assertIsNone(self._batch().model_dump(mode="json")["reverted_at"])


# --- Router (no database) ---


class _NoDb:
    """Fails the test if a route touches the database."""

    async def execute(self, *_args, **_kwargs):
        raise AssertionError("database must not be used")

    async def get(self, *_args, **_kwargs):
        raise AssertionError("database must not be used")


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _PreviewDb:
    """Returns cost records, then service rows, in the order preview_close queries them."""

    def __init__(self, records, services):
        self._results = [records, services]

    async def execute(self, _stmt):
        return _Result(self._results.pop(0))


def _client(role: str, db: object | None = None, *, financial_view: bool = False) -> TestClient:
    app = FastAPI()
    app.include_router(close_router.router)
    user = SimpleNamespace(id=uuid.uuid4(), role=role)
    session = db or _NoDb()

    class _PermissionDb:
        async def execute(self, _stmt):
            result = SimpleNamespace(scalar_one_or_none=lambda: object() if financial_view else None)
            return result

    async def override_db() -> AsyncGenerator[object, None]:
        yield session

    async def override_permission_db() -> AsyncGenerator[object, None]:
        yield _PermissionDb()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_audited_db] = override_db
    app.dependency_overrides[get_db] = override_permission_db
    return TestClient(app, raise_server_exceptions=False)


_ENDPOINTS = [
    ("POST", "/api/cost-records/close-year/preview", {"fiscal_year": X}),
    ("POST", "/api/cost-records/close-year/execute", {"fiscal_year": X, "plan_hash": "sha256:x"}),
    ("POST", "/api/cost-records/close-year/revert", {"batch_id": str(uuid.uuid4())}),
    ("GET", "/api/cost-records/close-year/batches", None),
]


class RouterAuthTest(unittest.TestCase):
    def test_every_route_requires_admin_financial_view_and_audited_db(self) -> None:
        self.assertEqual(len(close_router.router.routes), 4)
        for route in close_router.router.routes:
            calls = [d.call for d in route.dependant.dependencies]
            self.assertIn(close_router._admin, calls, route.path)
            self.assertIn(require_financial_view, calls, route.path)
            self.assertIn(get_audited_db, calls, route.path)

    def test_non_admin_roles_get_403(self) -> None:
        for role, financial_view in (("viewer", False), ("editor", False), ("editor", True), ("viewer", True)):
            client = _client(role, financial_view=financial_view)
            for method, path, body in _ENDPOINTS:
                response = client.request(method, path, json=body)
                self.assertEqual(response.status_code, 403, (role, financial_view, path, response.text))

    def test_future_year_is_400_before_any_query(self) -> None:
        client = _client("admin")
        for path in ("/api/cost-records/close-year/preview", "/api/cost-records/close-year/execute"):
            response = client.post(path, json={"fiscal_year": 9999, "plan_hash": "sha256:x"})
            self.assertEqual(response.status_code, 400, response.text)
            response = client.post(path, json={"fiscal_year": datetime.now(timezone.utc).year + 1, "plan_hash": "sha256:x"})
            self.assertEqual(response.status_code, 400, response.text)

    def test_uplift_out_of_range_is_400(self) -> None:
        client = _client("admin")
        response = client.post("/api/cost-records/close-year/preview", json={"fiscal_year": X, "uplift_pct": 1000.5})
        self.assertEqual(response.status_code, 400, response.text)

    def test_negative_override_is_400_before_any_query(self) -> None:
        client = _client("admin")
        response = client.post(
            "/api/cost-records/close-year/execute",
            json={
                "fiscal_year": X,
                "plan_hash": "sha256:x",
                "conversions": [{"record_id": str(uuid.uuid4()), "amount": -1}],
            },
        )
        self.assertEqual(response.status_code, 400, response.text)

    def test_preview_response_shape_and_json_numbers(self) -> None:
        svc_id = uuid.uuid4()
        card = uuid.uuid4()
        record_id = uuid.uuid4()
        records = [
            SimpleNamespace(
                id=record_id,
                service_id=svc_id,
                hardware_id=None,
                fiscal_year=X,
                record_type="estimated",
                amount=D("1200.50"),
                payment_method_id=card,
                notes="Annual plan",
                recorded_at=datetime(X, 2, 1),
            )
        ]
        services = [SimpleNamespace(id=svc_id, name="CRM", is_active=True, created_at=datetime(2020, 1, 1))]
        client = _client("admin", _PreviewDb(records, services))
        response = client.post("/api/cost-records/close-year/preview", json={"fiscal_year": X, "uplift_pct": 10})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(
            set(body),
            {"fiscal_year", "next_fiscal_year", "uplift_pct", "year_not_ended", "plan_hash", "services", "skipped", "totals"},
        )
        self.assertEqual((body["fiscal_year"], body["next_fiscal_year"], body["uplift_pct"]), (X, X + 1, 10.0))
        self.assertTrue(body["plan_hash"].startswith("sha256:"))
        service = body["services"][0]
        self.assertEqual(
            set(service),
            {"service_id", "service_name", "conversions", "existing_actual_total", "existing_actual_payment_method_ids", "next_year"},
        )
        self.assertEqual(
            service["conversions"],
            [
                {
                    "record_id": str(record_id),
                    "amount": 1200.5,
                    "include": True,
                    "flags": [],
                    "notes": "Annual plan",
                    "payment_method_id": str(card),
                }
            ],
        )
        self.assertEqual(service["existing_actual_total"], 0.0)
        self.assertEqual(service["existing_actual_payment_method_ids"], [])
        self.assertEqual(
            service["next_year"],
            {"action": "create", "amount": 1320.55, "payment_method_id": str(card), "skip_reason": None, "flags": []},
        )
        self.assertEqual(body["skipped"], [])
        self.assertEqual(body["totals"], {"converted": 1200.5, "next_year": 1320.55})
        self.assertIsInstance(body["totals"]["converted"], float)

    def test_preview_lists_existing_actual_payment_method_ids(self) -> None:
        svc_id = uuid.uuid4()
        low, high = sorted([uuid.uuid4(), uuid.uuid4()], key=str)

        def actual(payment_method_id):
            return SimpleNamespace(
                id=uuid.uuid4(), service_id=svc_id, hardware_id=None, fiscal_year=X, record_type="actual",
                amount=D("10.00"), payment_method_id=payment_method_id, notes=None, recorded_at=datetime(X, 2, 1),
            )

        records = [actual(None), actual(high), actual(low), actual(high)]
        services = [SimpleNamespace(id=svc_id, name="CRM", is_active=True, created_at=datetime(2020, 1, 1))]
        response = _client("admin", _PreviewDb(records, services)).post(
            "/api/cost-records/close-year/preview", json={"fiscal_year": X}
        )
        self.assertEqual(response.status_code, 200, response.text)
        service = response.json()["services"][0]
        self.assertEqual(service["existing_actual_payment_method_ids"], [str(low), str(high), None])
        self.assertEqual(service["next_year"]["flags"], [FLAG_MIXED_PAYMENT_METHODS])

    def test_execute_and_revert_return_409_on_deadlock(self) -> None:
        execute = _client("admin", _FailingDb(_db_error("40P01"))).post(
            "/api/cost-records/close-year/execute", json={"fiscal_year": X, "plan_hash": "sha256:x"}
        )
        self.assertEqual((execute.status_code, execute.json()["detail"]), (409, HASH_MISMATCH_DETAIL))
        revert = _client("admin", _FailingDb(_db_error("40001"))).post(
            "/api/cost-records/close-year/revert", json={"batch_id": str(uuid.uuid4())}
        )
        self.assertEqual((revert.status_code, revert.json()["detail"]), (409, REVERT_CONFLICT_DETAIL))

    def test_batches_use_utc_timestamps_and_fall_back_to_email(self) -> None:
        creator_id, reverter_id, gone_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        def batch(created_by_id, reverted_by_id, reverted_at):
            return SimpleNamespace(
                id=uuid.uuid4(), fiscal_year=X, uplift_pct=D("2.50"), converted_count=1, created_count=1,
                converted_total=D("10.00"), next_year_total=D("10.25"), created_at=datetime(X + 1, 1, 5, 9, 30),
                created_by_id=created_by_id, reverted_at=reverted_at, reverted_by_id=reverted_by_id,
            )

        rows = [
            # Creator has no name: email. Reverter has a name.
            (batch(creator_id, reverter_id, datetime(X + 1, 1, 6, 10, 0)), "", None, "ops@example.test", "Ada", "Admin", "ada@example.test", 2),
            # Creator has a last name only; no reverter.
            (batch(creator_id, None, None), None, "Admin", "ops@example.test", None, None, None, 0),
            # Creator deleted (created_by_id set to NULL by the foreign key): no name.
            (batch(None, gone_id, datetime(X + 1, 1, 7)), None, None, None, " ", "", "r@example.test", 0),
        ]
        response = _client("admin", _PreviewDb(rows, [])).get("/api/cost-records/close-year/batches")
        self.assertEqual(response.status_code, 200, response.text)
        first, second, third = response.json()
        self.assertEqual((first["created_by_name"], first["reverted_by_name"]), ("ops@example.test", "Ada Admin"))
        self.assertEqual((second["created_by_name"], second["reverted_by_name"]), ("Admin", None))
        self.assertEqual((third["created_by_name"], third["reverted_by_name"]), (None, "r@example.test"))
        self.assertEqual(first["created_at"], f"{X + 1}-01-05T09:30:00+00:00")
        self.assertEqual(first["reverted_at"], f"{X + 1}-01-06T10:00:00+00:00")
        self.assertIsNone(second["reverted_at"])
        for item in (first, second, third):
            self.assertIsNotNone(datetime.fromisoformat(item["created_at"]).utcoffset())
        self.assertEqual((first["uplift_pct"], first["next_year_total"], first["changed_since_close"]), (2.5, 10.25, 2))


if __name__ == "__main__":
    unittest.main()
