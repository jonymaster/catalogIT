"""Close a financial year for service costs: plan, execute, revert, and list batches.

Closing year X converts the year's ``estimated`` service cost records to ``actual`` and
creates one summed ``estimated`` record per service for year X+1.

The plan is computed by pure functions over plain snapshots (no database access), so the
business rules can be tested without PostgreSQL. The async functions load and lock rows,
call the pure core, and write the result in the caller's transaction (``get_audited_db``
commits at the end of the request, so the audit listener attributes every change).

Money is ``Decimal`` throughout and rounded to cents with ``ROUND_HALF_UP``.
"""
from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from sqlalchemy import DateTime, String, cast, func, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, noload

from app.models.cost_record import CostRecord
from app.models.fiscal_year_close_batch import FiscalYearCloseBatch
from app.models.global_audit_event import GlobalAuditEvent
from app.models.service import Service
from app.models.user import User

CENT = Decimal("0.01")
MIN_FISCAL_YEAR = 1900
MAX_FISCAL_YEAR = 2100
MIN_UPLIFT_PCT = Decimal("-100")
MAX_UPLIFT_PCT = Decimal("1000")
# cost_records.amount is NUMERIC(12,2); batch totals are NUMERIC(14,2).
MAX_RECORD_AMOUNT = Decimal("9999999999.99")
MAX_BATCH_TOTAL = Decimal("999999999999.99")

FLAG_ESTIMATE_WITH_ACTUAL = "estimate_with_actual"
FLAG_ADDED_DURING_YEAR = "added_during_year"
FLAG_MIXED_PAYMENT_METHODS = "mixed_payment_methods"

ACTION_CREATE = "create"
ACTION_SKIP = "skip"
SKIP_NEXT_YEAR_EXISTS = "next_year_exists"
SKIP_ZERO_AMOUNT = "zero_amount"
# Internal only: a next-year row excluded by an execute override. Never part of a preview.
SKIP_EXCLUDED = "excluded"
SKIP_ARCHIVED = "archived"

ROLLOVER_CONVERTED = "converted"
ROLLOVER_CREATED = "created"

HASH_MISMATCH_DETAIL = "Cost records changed since preview; reload the preview"
NOTHING_TO_CLOSE_DETAIL = "Nothing to close for this year"
BATCH_NOT_FOUND_DETAIL = "Close batch not found"
ALREADY_REVERTED_DETAIL = "Batch already reverted"
UNARCHIVE_BEFORE_REVERT_PREFIX = "Unarchive these services before reverting: "
REVERT_LATER_CLOSES_PREFIX = "Revert these later closes first: "
# A deadlock or serialization failure while closing: same detail as a hash mismatch, so the UI
# reloads the preview.
EXECUTE_CONFLICT_DETAIL = HASH_MISMATCH_DETAIL
REVERT_CONFLICT_DETAIL = "Cost records changed during revert; try again"
# PostgreSQL SQLSTATEs: deadlock_detected, serialization_failure.
LOCK_CONFLICT_SQLSTATES = frozenset({"40P01", "40001"})

_HASH_VERSION = "fiscal-year-close v1"


class FiscalYearCloseError(Exception):
    """Business rule violation; the router maps it to an HTTP error with the same status and detail."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# --- Snapshots (plain inputs of the pure core) ---


@dataclass(frozen=True)
class RecordSnapshot:
    id: uuid.UUID
    service_id: uuid.UUID | None
    fiscal_year: int
    record_type: str
    amount: Decimal
    hardware_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    notes: str | None = None
    recorded_at: datetime | None = None


@dataclass(frozen=True)
class ServiceSnapshot:
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime | None = None


@dataclass(frozen=True)
class ConversionOverride:
    record_id: uuid.UUID
    include: bool | None = None
    amount: Decimal | None = None


@dataclass(frozen=True)
class NextYearOverride:
    service_id: uuid.UUID
    include: bool | None = None
    amount: Decimal | None = None


# --- Plan ---


@dataclass(frozen=True)
class ConversionRow:
    record_id: uuid.UUID
    amount: Decimal
    include: bool
    flags: tuple[str, ...]
    notes: str | None
    payment_method_id: uuid.UUID | None
    recorded_at: datetime | None = None


@dataclass(frozen=True)
class NextYearRow:
    action: str
    amount: Decimal
    payment_method_id: uuid.UUID | None
    skip_reason: str | None
    flags: tuple[str, ...]


@dataclass(frozen=True)
class ServicePlan:
    service_id: uuid.UUID
    service_name: str
    conversions: tuple[ConversionRow, ...]
    existing_actual_total: Decimal
    next_year: NextYearRow
    # Inputs kept so the next-year row can be recomputed after overrides.
    existing_actual_payment_methods: frozenset[uuid.UUID | None]
    added_during_year: bool
    next_year_exists: bool

    @property
    def existing_actual_payment_method_ids(self) -> tuple[uuid.UUID | None, ...]:
        """Payment methods of the existing actuals (None for no payment method): None last, then by id text."""
        return tuple(sorted(self.existing_actual_payment_methods, key=lambda v: (v is None, str(v or ""))))


@dataclass(frozen=True)
class SkippedService:
    service_id: uuid.UUID
    service_name: str
    reason: str


@dataclass(frozen=True)
class Plan:
    fiscal_year: int
    uplift_pct: Decimal
    year_not_ended: bool
    plan_hash: str
    services: tuple[ServicePlan, ...]
    skipped: tuple[SkippedService, ...]

    @property
    def next_fiscal_year(self) -> int:
        return self.fiscal_year + 1

    @property
    def converted_count(self) -> int:
        return sum(1 for s in self.services for c in s.conversions if c.include)

    @property
    def created_count(self) -> int:
        return sum(1 for s in self.services if s.next_year.action == ACTION_CREATE)

    @property
    def converted_total(self) -> Decimal:
        return quantize_money(
            sum((c.amount for s in self.services for c in s.conversions if c.include), Decimal("0"))
        )

    @property
    def next_year_total(self) -> Decimal:
        return quantize_money(
            sum(
                (s.next_year.amount for s in self.services if s.next_year.action == ACTION_CREATE),
                Decimal("0"),
            )
        )


@dataclass(frozen=True)
class ExecuteResult:
    batch_id: uuid.UUID
    converted_count: int
    created_count: int
    converted_total: Decimal
    next_year_total: Decimal


@dataclass(frozen=True)
class RevertResult:
    batch_id: uuid.UUID
    restored_count: int
    deleted_count: int


@dataclass(frozen=True)
class BatchSummary:
    id: uuid.UUID
    fiscal_year: int
    uplift_pct: Decimal
    converted_count: int
    created_count: int
    converted_total: Decimal
    next_year_total: Decimal
    created_at: datetime
    created_by_id: uuid.UUID | None
    created_by_name: str | None
    reverted_at: datetime | None
    reverted_by_id: uuid.UUID | None
    reverted_by_name: str | None
    changed_since_close: int


# --- Pure core ---


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def current_utc_year() -> int:
    return datetime.now(timezone.utc).year


def _to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    return Decimal(value)  # type: ignore[arg-type]


def validate_fiscal_year(fiscal_year: int, current_year: int) -> None:
    if fiscal_year < MIN_FISCAL_YEAR or fiscal_year > MAX_FISCAL_YEAR:
        raise FiscalYearCloseError(400, f"fiscal_year must be between {MIN_FISCAL_YEAR} and {MAX_FISCAL_YEAR}")
    if fiscal_year > current_year:
        raise FiscalYearCloseError(400, "Cannot close a future fiscal year")


def normalize_uplift(uplift_pct: Decimal | int | float | None) -> Decimal:
    """Validate the global uplift and round it to the 2 decimals stored on the batch row."""
    if uplift_pct is None:
        return Decimal("0.00")
    try:
        value = _to_decimal(uplift_pct)
    except (InvalidOperation, TypeError, ValueError):
        raise FiscalYearCloseError(400, "uplift_pct must be a number") from None
    if not value.is_finite() or value < MIN_UPLIFT_PCT or value > MAX_UPLIFT_PCT:
        raise FiscalYearCloseError(400, f"uplift_pct must be between {MIN_UPLIFT_PCT} and {MAX_UPLIFT_PCT}")
    return quantize_money(value)


def normalize_override_amount(amount: Decimal | int | float) -> Decimal:
    try:
        value = _to_decimal(amount)
    except (InvalidOperation, TypeError, ValueError):
        raise FiscalYearCloseError(400, "Override amount must be a number") from None
    if not value.is_finite():
        raise FiscalYearCloseError(400, "Override amount must be a number")
    if value < 0:
        raise FiscalYearCloseError(400, "Override amount cannot be negative")
    # Reject huge values before quantizing (quantize fails past the Decimal context precision).
    if value > MAX_RECORD_AMOUNT + 1 or quantize_money(value) > MAX_RECORD_AMOUNT:
        raise FiscalYearCloseError(400, f"Override amount cannot exceed {MAX_RECORD_AMOUNT}")
    return quantize_money(value)


def validate_overrides(
    conversions: Sequence[ConversionOverride] = (),
    next_year: Sequence[NextYearOverride] = (),
) -> None:
    """Checks that need no plan: amounts and duplicate ids."""
    seen_records: set[uuid.UUID] = set()
    for o in conversions:
        if o.record_id in seen_records:
            raise FiscalYearCloseError(400, f"Duplicate conversion override for record {o.record_id}")
        seen_records.add(o.record_id)
        if o.amount is not None:
            normalize_override_amount(o.amount)
    seen_services: set[uuid.UUID] = set()
    for o in next_year:
        if o.service_id in seen_services:
            raise FiscalYearCloseError(400, f"Duplicate next_year override for service {o.service_id}")
        seen_services.add(o.service_id)
        if o.amount is not None:
            normalize_override_amount(o.amount)


def is_service_cost(record: RecordSnapshot) -> bool:
    return record.service_id is not None and record.hardware_id is None


def _plan_records(fiscal_year: int, records: Iterable[RecordSnapshot]) -> list[RecordSnapshot]:
    years = (fiscal_year, fiscal_year + 1)
    return [r for r in records if is_service_cost(r) and r.fiscal_year in years]


def _format_amount(amount: Decimal) -> str:
    return format(quantize_money(_to_decimal(amount)), "f")


def compute_plan_hash(
    fiscal_year: int,
    records: Iterable[RecordSnapshot],
    services: Iterable[ServiceSnapshot],
) -> str:
    """SHA-256 over every service cost record of X and X+1 and the is_active of their services.

    Independent of user edits and uplift, so the client can change both between preview and execute.
    """
    rows = _plan_records(fiscal_year, records)
    is_active = {s.id: s.is_active for s in services}
    record_lines = sorted(
        f"record|{r.id}|{r.service_id}|{r.fiscal_year}|{r.record_type}|{_format_amount(r.amount)}"
        for r in rows
    )
    service_lines = sorted(
        f"service|{sid}|{'unknown' if sid not in is_active else str(bool(is_active[sid])).lower()}"
        for sid in {r.service_id for r in rows}
    )
    text = "\n".join([f"{_HASH_VERSION}|{fiscal_year}", *record_lines, *service_lines]) + "\n"
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _compute_next_year(
    service: ServicePlan,
    uplift_pct: Decimal,
    *,
    override_amount: Decimal | None = None,
    excluded: bool = False,
) -> NextYearRow:
    included = [c for c in service.conversions if c.include]

    # Payment method: the set over every record that is actual after conversion (None counts).
    payment_methods = set(service.existing_actual_payment_methods) | {c.payment_method_id for c in included}
    mixed = len(payment_methods) > 1
    payment_method_id = next(iter(payment_methods)) if len(payment_methods) == 1 else None

    flags: list[str] = []
    if service.added_during_year:
        flags.append(FLAG_ADDED_DURING_YEAR)
    if mixed:
        flags.append(FLAG_MIXED_PAYMENT_METHODS)

    actual_total = service.existing_actual_total + sum((c.amount for c in included), Decimal("0"))
    computed = quantize_money(actual_total * (Decimal("1") + uplift_pct / Decimal("100")))

    if service.next_year_exists:
        return NextYearRow(ACTION_SKIP, computed, payment_method_id, SKIP_NEXT_YEAR_EXISTS, tuple(flags))
    amount = override_amount if override_amount is not None else computed
    if excluded:
        return NextYearRow(ACTION_SKIP, amount, payment_method_id, SKIP_EXCLUDED, tuple(flags))
    if amount <= 0:
        return NextYearRow(ACTION_SKIP, amount, payment_method_id, SKIP_ZERO_AMOUNT, tuple(flags))
    return NextYearRow(ACTION_CREATE, amount, payment_method_id, None, tuple(flags))


def _uuid_sort_key(value: uuid.UUID | None) -> int:
    return value.int if value is not None else -1


def build_plan(
    fiscal_year: int,
    records: Iterable[RecordSnapshot],
    services: Iterable[ServiceSnapshot],
    *,
    current_year: int,
    uplift_pct: Decimal | int | float | None = Decimal("0"),
) -> Plan:
    """Default plan for closing ``fiscal_year`` (what the preview shows)."""
    validate_fiscal_year(fiscal_year, current_year)
    uplift = normalize_uplift(uplift_pct)
    records = list(records)
    services = list(services)
    rows = _plan_records(fiscal_year, records)
    service_by_id = {s.id: s for s in services}

    by_service: dict[uuid.UUID, list[RecordSnapshot]] = defaultdict(list)
    services_with_next_year: set[uuid.UUID] = set()
    for r in rows:
        if r.fiscal_year == fiscal_year:
            by_service[r.service_id].append(r)  # type: ignore[index]
        else:
            # Any type counts, including budget: re-running a close never adds a second estimate.
            services_with_next_year.add(r.service_id)  # type: ignore[arg-type]

    plans: list[ServicePlan] = []
    skipped: list[SkippedService] = []
    for service_id, service_records in by_service.items():
        service = service_by_id.get(service_id)
        if service is None:
            continue
        actuals = [r for r in service_records if r.record_type == "actual"]
        estimates = [r for r in service_records if r.record_type == "estimated"]
        if not service.is_active:
            if estimates:
                skipped.append(SkippedService(service.id, service.name, SKIP_ARCHIVED))
            continue
        if not actuals and not estimates:
            continue  # budget-only services do not take part
        has_actual = bool(actuals)
        conversions = sorted(
            (
                ConversionRow(
                    record_id=r.id,
                    amount=quantize_money(_to_decimal(r.amount)),
                    include=not has_actual,
                    flags=(FLAG_ESTIMATE_WITH_ACTUAL,) if has_actual else (),
                    notes=r.notes,
                    payment_method_id=r.payment_method_id,
                    recorded_at=r.recorded_at,
                )
                for r in estimates
            ),
            key=lambda c: (c.recorded_at is not None, c.recorded_at or datetime.min, c.record_id.int),
        )
        plan = ServicePlan(
            service_id=service.id,
            service_name=service.name,
            conversions=tuple(conversions),
            existing_actual_total=quantize_money(sum((_to_decimal(r.amount) for r in actuals), Decimal("0"))),
            next_year=NextYearRow(ACTION_SKIP, Decimal("0.00"), None, None, ()),
            existing_actual_payment_methods=frozenset(r.payment_method_id for r in actuals),
            added_during_year=service.created_at is not None and service.created_at.year == fiscal_year,
            next_year_exists=service.id in services_with_next_year,
        )
        plans.append(replace(plan, next_year=_compute_next_year(plan, uplift)))

    plans.sort(key=lambda p: (p.service_name.casefold(), p.service_id.int))
    skipped.sort(key=lambda s: (s.service_name.casefold(), s.service_id.int))
    return Plan(
        fiscal_year=fiscal_year,
        uplift_pct=uplift,
        year_not_ended=fiscal_year == current_year,
        plan_hash=compute_plan_hash(fiscal_year, records, services),
        services=tuple(plans),
        skipped=tuple(skipped),
    )


def apply_overrides(
    plan: Plan,
    conversions: Sequence[ConversionOverride] = (),
    next_year: Sequence[NextYearOverride] = (),
) -> Plan:
    """Apply the user's edits on top of a default plan and recompute the next-year rows."""
    validate_overrides(conversions, next_year)
    conversion_by_id = {o.record_id: o for o in conversions}
    next_year_by_id = {o.service_id: o for o in next_year}

    known_records = {c.record_id for s in plan.services for c in s.conversions}
    unknown_records = sorted((rid for rid in conversion_by_id if rid not in known_records), key=str)
    if unknown_records:
        raise FiscalYearCloseError(400, f"Conversion override for a record not in the plan: {unknown_records[0]}")
    known_services = {s.service_id for s in plan.services}
    unknown_services = sorted((sid for sid in next_year_by_id if sid not in known_services), key=str)
    if unknown_services:
        raise FiscalYearCloseError(400, f"Next-year override for a service not in the plan: {unknown_services[0]}")

    services: list[ServicePlan] = []
    for service in plan.services:
        rows: list[ConversionRow] = []
        for row in service.conversions:
            override = conversion_by_id.get(row.record_id)
            if override is not None:
                row = replace(
                    row,
                    include=row.include if override.include is None else override.include,
                    amount=row.amount if override.amount is None else normalize_override_amount(override.amount),
                )
            rows.append(row)
        updated = replace(service, conversions=tuple(rows))

        override_amount: Decimal | None = None
        excluded = False
        ny_override = next_year_by_id.get(service.service_id)
        if ny_override is not None:
            if service.next_year_exists:
                if ny_override.include is True or ny_override.amount is not None:
                    raise FiscalYearCloseError(
                        400,
                        f"{service.service_name} already has a cost record in FY{plan.next_fiscal_year}; "
                        "its next-year estimate cannot be included",
                    )
            else:
                excluded = ny_override.include is False
                if ny_override.amount is not None:
                    override_amount = normalize_override_amount(ny_override.amount)
        services.append(
            replace(
                updated,
                next_year=_compute_next_year(
                    updated, plan.uplift_pct, override_amount=override_amount, excluded=excluded
                ),
            )
        )
    return replace(plan, services=tuple(services))


def build_execution_plan(
    fiscal_year: int,
    records: Iterable[RecordSnapshot],
    services: Iterable[ServiceSnapshot],
    *,
    current_year: int,
    plan_hash: str,
    uplift_pct: Decimal | int | float | None = Decimal("0"),
    conversions: Sequence[ConversionOverride] = (),
    next_year: Sequence[NextYearOverride] = (),
) -> Plan:
    """Final plan for execute: default plan, hash check, overrides, and the empty-plan check."""
    validate_overrides(conversions, next_year)
    plan = build_plan(fiscal_year, records, services, current_year=current_year, uplift_pct=uplift_pct)
    if plan.plan_hash != plan_hash:
        raise FiscalYearCloseError(409, HASH_MISMATCH_DETAIL)
    final = apply_overrides(plan, conversions, next_year)
    if final.converted_count == 0 and final.created_count == 0:
        raise FiscalYearCloseError(400, NOTHING_TO_CLOSE_DETAIL)
    for service in final.services:
        if service.next_year.action == ACTION_CREATE and service.next_year.amount > MAX_RECORD_AMOUNT:
            raise FiscalYearCloseError(
                400, f"Next-year amount for {service.service_name} exceeds {MAX_RECORD_AMOUNT}"
            )
    if final.converted_total > MAX_BATCH_TOTAL or final.next_year_total > MAX_BATCH_TOTAL:
        raise FiscalYearCloseError(400, f"Close totals cannot exceed {MAX_BATCH_TOTAL}")
    return final


def unarchive_detail(service_names: Iterable[str]) -> str:
    return UNARCHIVE_BEFORE_REVERT_PREFIX + ", ".join(sorted(service_names, key=lambda n: (n.casefold(), n)))


def later_closes_detail(fiscal_years: Iterable[int]) -> str:
    return REVERT_LATER_CLOSES_PREFIX + ", ".join(f"FY{year}" for year in sorted(set(fiscal_years)))


def is_lock_conflict(exc: BaseException) -> bool:
    """True for a PostgreSQL deadlock or serialization failure wrapped by SQLAlchemy.

    The asyncpg adapter sets ``pgcode`` and ``sqlstate`` on ``exc.orig`` and chains the asyncpg
    exception (which carries ``sqlstate``) as its ``__cause__``; psycopg exposes ``pgcode``.
    """
    if not isinstance(exc, DBAPIError):
        return False
    orig = exc.orig
    for source in (orig, getattr(orig, "__cause__", None)):
        if source is None:
            continue
        for attr in ("pgcode", "sqlstate"):
            if getattr(source, attr, None) in LOCK_CONFLICT_SQLSTATES:
                return True
    return False


@contextmanager
def _map_lock_conflicts(detail: str) -> Iterator[None]:
    """Turn a deadlock or serialization failure into a 409 the client can retry."""
    try:
        yield
    except DBAPIError as exc:
        if is_lock_conflict(exc):
            raise FiscalYearCloseError(409, detail) from exc
        raise


# --- Database access ---


async def _db_utc_now_naive(db: AsyncSession) -> datetime:
    """Transaction time from the database clock (the clock of ``created_at``), as naive UTC."""
    return await db.scalar(select(func.timezone("UTC", func.now())))


def _record_snapshot(record: CostRecord) -> RecordSnapshot:
    return RecordSnapshot(
        id=record.id,
        service_id=record.service_id,
        fiscal_year=record.fiscal_year,
        record_type=record.record_type,
        amount=_to_decimal(record.amount),
        hardware_id=record.hardware_id,
        payment_method_id=record.payment_method_id,
        notes=record.notes,
        recorded_at=record.recorded_at,
    )


def _service_cost_records_stmt(fiscal_year: int):
    return (
        select(CostRecord)
        .options(noload(CostRecord.recorded_by), noload(CostRecord.hardware))
        .where(
            CostRecord.service_id.is_not(None),
            CostRecord.hardware_id.is_(None),
            CostRecord.fiscal_year.in_([fiscal_year, fiscal_year + 1]),
        )
        .order_by(CostRecord.id)
    )


async def _load_records(db: AsyncSession, fiscal_year: int, *, lock: bool) -> list[CostRecord]:
    stmt = _service_cost_records_stmt(fiscal_year)
    if lock:
        stmt = stmt.with_for_update(of=CostRecord).execution_options(populate_existing=True)
    return list((await db.execute(stmt)).scalars().all())


async def _load_service_snapshots(db: AsyncSession, service_ids: set[uuid.UUID]) -> list[ServiceSnapshot]:
    if not service_ids:
        return []
    result = await db.execute(
        select(Service.id, Service.name, Service.is_active, Service.created_at).where(Service.id.in_(service_ids))
    )
    return [
        ServiceSnapshot(id=row.id, name=row.name, is_active=bool(row.is_active), created_at=row.created_at)
        for row in result.all()
    ]


async def _lock_participating_services(db: AsyncSession, fiscal_year: int) -> None:
    """Lock every service (active or archived) with a service cost record in year X or X+1, in id order.

    A second close running at the same time waits here and then fails the hash check. Archived
    services are locked too, so their ``is_active`` (part of the hash) cannot change and deleting
    one cannot cascade into the locked records until this transaction ends.
    """
    plan_records = select(CostRecord.service_id).where(
        CostRecord.service_id.is_not(None),
        CostRecord.hardware_id.is_(None),
        CostRecord.fiscal_year.in_([fiscal_year, fiscal_year + 1]),
    )
    await db.execute(
        select(Service.id)
        .where(Service.id.in_(plan_records))
        .order_by(Service.id)
        .with_for_update(of=Service)
    )


async def preview_close(
    db: AsyncSession,
    fiscal_year: int,
    uplift_pct: Decimal | int | float | None = Decimal("0"),
    *,
    current_year: int | None = None,
) -> Plan:
    """Read-only: no locks, no writes."""
    year_now = current_year if current_year is not None else current_utc_year()
    validate_fiscal_year(fiscal_year, year_now)
    uplift = normalize_uplift(uplift_pct)
    records = [_record_snapshot(r) for r in await _load_records(db, fiscal_year, lock=False)]
    services = await _load_service_snapshots(db, {r.service_id for r in records if r.service_id is not None})
    return build_plan(fiscal_year, records, services, current_year=year_now, uplift_pct=uplift)


async def execute_close(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    fiscal_year: int,
    plan_hash: str,
    uplift_pct: Decimal | int | float | None = Decimal("0"),
    conversions: Sequence[ConversionOverride] = (),
    next_year: Sequence[NextYearOverride] = (),
    current_year: int | None = None,
) -> ExecuteResult:
    """Lock, re-plan, verify the hash, and apply the close in the caller's transaction."""
    year_now = current_year if current_year is not None else current_utc_year()
    validate_fiscal_year(fiscal_year, year_now)
    uplift = normalize_uplift(uplift_pct)
    validate_overrides(conversions, next_year)
    with _map_lock_conflicts(EXECUTE_CONFLICT_DETAIL):
        return await _execute_close_locked(
            db,
            user_id=user_id,
            fiscal_year=fiscal_year,
            plan_hash=plan_hash,
            uplift=uplift,
            conversions=conversions,
            next_year=next_year,
            current_year=year_now,
        )


async def _execute_close_locked(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    fiscal_year: int,
    plan_hash: str,
    uplift: Decimal,
    conversions: Sequence[ConversionOverride],
    next_year: Sequence[NextYearOverride],
    current_year: int,
) -> ExecuteResult:
    # Lock order: services by id, then the plan's records by id (revert uses the same order).
    await _lock_participating_services(db, fiscal_year)
    locked_records = await _load_records(db, fiscal_year, lock=True)
    records = [_record_snapshot(r) for r in locked_records]
    services = await _load_service_snapshots(db, {r.service_id for r in records if r.service_id is not None})
    plan = build_execution_plan(
        fiscal_year,
        records,
        services,
        current_year=current_year,
        plan_hash=plan_hash,
        uplift_pct=uplift,
        conversions=conversions,
        next_year=next_year,
    )

    batch = FiscalYearCloseBatch(
        fiscal_year=fiscal_year,
        uplift_pct=plan.uplift_pct,
        converted_count=plan.converted_count,
        created_count=plan.created_count,
        converted_total=plan.converted_total,
        next_year_total=plan.next_year_total,
        created_by_id=user_id,
    )
    db.add(batch)
    await db.flush()

    record_by_id = {r.id: r for r in locked_records}
    for service in plan.services:
        for row in service.conversions:
            if not row.include:
                continue
            record = record_by_id[row.record_id]
            record.record_type = "actual"
            if _to_decimal(record.amount) != row.amount:
                record.amount = row.amount
            # rollover_created_batch_id is kept: revert hands the record back to its creating batch.
            record.rollover_batch_id = batch.id
            record.rollover_action = ROLLOVER_CONVERTED
        if service.next_year.action == ACTION_CREATE:
            db.add(
                CostRecord(
                    service_id=service.service_id,
                    hardware_id=None,
                    payment_method_id=service.next_year.payment_method_id,
                    fiscal_year=plan.next_fiscal_year,
                    purchase_year=None,
                    amount=service.next_year.amount,
                    record_type="estimated",
                    notes=f"Rolled over from FY{fiscal_year}",
                    recorded_by_id=user_id,
                    rollover_batch_id=batch.id,
                    rollover_action=ROLLOVER_CREATED,
                    rollover_created_batch_id=batch.id,
                )
            )
    await db.flush()
    return ExecuteResult(
        batch_id=batch.id,
        converted_count=plan.converted_count,
        created_count=plan.created_count,
        converted_total=plan.converted_total,
        next_year_total=plan.next_year_total,
    )


async def revert_close(db: AsyncSession, *, user_id: uuid.UUID | None, batch_id: uuid.UUID) -> RevertResult:
    """Undo a batch: converted records go back to estimated, created records are deleted.

    A converted record that an earlier close created goes back to that close ("created" again),
    so reverting a chain of closes newest first restores the original records. Reverting a batch
    while a later, active close has converted one of its created records is refused.

    Lock order (batch, services by id, records by id) is compatible with execute.
    """
    with _map_lock_conflicts(REVERT_CONFLICT_DETAIL):
        return await _revert_close_locked(db, user_id=user_id, batch_id=batch_id)


async def _revert_close_locked(
    db: AsyncSession, *, user_id: uuid.UUID | None, batch_id: uuid.UUID
) -> RevertResult:
    # FOR NO KEY UPDATE: revert only changes non-key columns, and a concurrent revert of a later
    # batch must still pass the foreign key check when it links a record back to this batch.
    batch = (
        await db.execute(
            select(FiscalYearCloseBatch)
            .where(FiscalYearCloseBatch.id == batch_id)
            .with_for_update(key_share=True)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if batch is None:
        raise FiscalYearCloseError(404, BATCH_NOT_FOUND_DETAIL)
    if batch.reverted_at is not None:
        raise FiscalYearCloseError(409, ALREADY_REVERTED_DETAIL)

    # Records linked to this batch, plus the ones it created that a later close took over.
    linked = or_(CostRecord.rollover_batch_id == batch_id, CostRecord.rollover_created_batch_id == batch_id)
    service_ids = set(
        (
            await db.execute(
                select(CostRecord.service_id).where(linked, CostRecord.service_id.is_not(None)).distinct()
            )
        ).scalars().all()
    )
    services_by_id = {}
    if service_ids:
        services_by_id = {
            row.id: row
            for row in (
                await db.execute(
                    select(Service.id, Service.name, Service.is_active)
                    .where(Service.id.in_(service_ids))
                    .order_by(Service.id)
                    .with_for_update(of=Service)
                )
            ).all()
        }

    records = (
        await db.execute(
            select(CostRecord)
            .options(noload(CostRecord.recorded_by), noload(CostRecord.hardware))
            .where(linked)
            .order_by(CostRecord.id)
            .with_for_update(of=CostRecord)
            .execution_options(populate_existing=True)
        )
    ).scalars().all()

    # Every decision below uses the locked rows.
    own = [r for r in records if r.rollover_batch_id == batch_id]
    later_batch_ids = {
        r.rollover_batch_id
        for r in records
        if r.rollover_created_batch_id == batch_id and r.rollover_batch_id not in (None, batch_id)
    }
    creator_batch_ids = {
        r.rollover_created_batch_id
        for r in own
        if r.rollover_action == ROLLOVER_CONVERTED and r.rollover_created_batch_id not in (None, batch_id)
    }
    other_batches = {}
    if later_batch_ids or creator_batch_ids:
        other_batches = {
            row.id: row
            for row in (
                await db.execute(
                    select(FiscalYearCloseBatch.id, FiscalYearCloseBatch.fiscal_year, FiscalYearCloseBatch.reverted_at)
                    .where(FiscalYearCloseBatch.id.in_(later_batch_ids | creator_batch_ids))
                )
            ).all()
        }
    later_years = [
        other_batches[bid].fiscal_year
        for bid in later_batch_ids
        if bid in other_batches and other_batches[bid].reverted_at is None
    ]
    if later_years:
        raise FiscalYearCloseError(409, later_closes_detail(later_years))

    archived = {
        services_by_id[r.service_id].name
        for r in own
        if r.service_id in services_by_id and not services_by_id[r.service_id].is_active
    }
    if archived:
        raise FiscalYearCloseError(409, unarchive_detail(archived))

    restored = 0
    deleted = 0
    for record in own:
        if record.rollover_action == ROLLOVER_CONVERTED:
            # Keeps the current amount: wizard edits are not restored (the audit history has them).
            record.record_type = "estimated"
            creator = other_batches.get(record.rollover_created_batch_id)
            if creator is not None and creator.reverted_at is None:
                record.rollover_batch_id = creator.id
                record.rollover_action = ROLLOVER_CREATED
            else:
                record.rollover_batch_id = None
                record.rollover_action = None
            restored += 1
        elif record.rollover_action == ROLLOVER_CREATED:
            await db.delete(record)
            deleted += 1

    batch.reverted_at = await _db_utc_now_naive(db)
    batch.reverted_by_id = user_id
    await db.flush()
    return RevertResult(batch_id=batch.id, restored_count=restored, deleted_count=deleted)


def _display_name(first_name: str | None, last_name: str | None, email: str | None) -> str | None:
    """First and last name, or the email when both are empty."""
    name = f"{first_name or ''} {last_name or ''}".strip()
    return name or email or None


async def list_close_batches(db: AsyncSession) -> list[BatchSummary]:
    """Past closes, newest first, with the count of linked records edited after the close."""
    creator = aliased(User)
    reverter = aliased(User)
    linked = aliased(CostRecord)
    # created_at is TIMESTAMP from now() in the session time zone; casting it back with the same
    # time zone gives the exact transaction instant. The close's own audit rows share that instant
    # (strictly-later excludes them); later edits run in later transactions.
    edited_after_close = (
        select(GlobalAuditEvent.id)
        .where(
            GlobalAuditEvent.entity_table == "cost_records",
            GlobalAuditEvent.entity_key == cast(linked.id, String),
            GlobalAuditEvent.occurred_at > cast(FiscalYearCloseBatch.created_at, DateTime(timezone=True)),
        )
        .correlate(linked, FiscalYearCloseBatch)
        .exists()
    )
    # Linked: records the batch touched, including the ones it created that a later close converted.
    changed_since_close = (
        select(func.count(linked.id))
        .where(
            or_(
                linked.rollover_batch_id == FiscalYearCloseBatch.id,
                linked.rollover_created_batch_id == FiscalYearCloseBatch.id,
            ),
            edited_after_close,
        )
        .correlate(FiscalYearCloseBatch)
        .scalar_subquery()
    )
    result = await db.execute(
        select(
            FiscalYearCloseBatch,
            creator.first_name,
            creator.last_name,
            creator.email,
            reverter.first_name,
            reverter.last_name,
            reverter.email,
            changed_since_close,
        )
        .outerjoin(creator, creator.id == FiscalYearCloseBatch.created_by_id)
        .outerjoin(reverter, reverter.id == FiscalYearCloseBatch.reverted_by_id)
        .order_by(FiscalYearCloseBatch.created_at.desc(), FiscalYearCloseBatch.id.desc())
    )
    out: list[BatchSummary] = []
    for batch, c_first, c_last, c_email, r_first, r_last, r_email, changed in result.all():
        out.append(
            BatchSummary(
                id=batch.id,
                fiscal_year=batch.fiscal_year,
                uplift_pct=_to_decimal(batch.uplift_pct),
                converted_count=batch.converted_count,
                created_count=batch.created_count,
                converted_total=_to_decimal(batch.converted_total),
                next_year_total=_to_decimal(batch.next_year_total),
                created_at=batch.created_at,
                created_by_id=batch.created_by_id,
                created_by_name=_display_name(c_first, c_last, c_email) if batch.created_by_id else None,
                reverted_at=batch.reverted_at,
                reverted_by_id=batch.reverted_by_id,
                reverted_by_name=_display_name(r_first, r_last, r_email) if batch.reverted_by_id else None,
                changed_since_close=int(changed or 0),
            )
        )
    return out
