"""Close financial year for service costs (admin plus financial visibility)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_financial_view, require_role
from app.dependencies.db import get_audited_db
from app.models.user import User
from app.schemas.fiscal_year_close import (
    CloseBatchRead,
    CloseExecuteRequest,
    CloseExecuteResponse,
    ClosePreviewRequest,
    ClosePreviewResponse,
    CloseRevertRequest,
    CloseRevertResponse,
    CloseTotalsRead,
    ConversionRowRead,
    NextYearRowRead,
    ServiceClosePlanRead,
    SkippedServiceRead,
)
from app.services.fiscal_year_close import (
    ConversionOverride,
    FiscalYearCloseError,
    NextYearOverride,
    Plan,
    execute_close,
    list_close_batches,
    preview_close,
    revert_close,
)

router = APIRouter(prefix="/api/cost-records/close-year", tags=["cost-records"])

_admin = require_role("admin")


def _http_error(exc: FiscalYearCloseError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def to_preview_response(plan: Plan) -> ClosePreviewResponse:
    return ClosePreviewResponse(
        fiscal_year=plan.fiscal_year,
        next_fiscal_year=plan.next_fiscal_year,
        uplift_pct=plan.uplift_pct,
        year_not_ended=plan.year_not_ended,
        plan_hash=plan.plan_hash,
        services=[
            ServiceClosePlanRead(
                service_id=s.service_id,
                service_name=s.service_name,
                conversions=[
                    ConversionRowRead(
                        record_id=c.record_id,
                        amount=c.amount,
                        include=c.include,
                        flags=list(c.flags),
                        notes=c.notes,
                        payment_method_id=c.payment_method_id,
                    )
                    for c in s.conversions
                ],
                existing_actual_total=s.existing_actual_total,
                existing_actual_payment_method_ids=list(s.existing_actual_payment_method_ids),
                next_year=NextYearRowRead(
                    action=s.next_year.action,
                    amount=s.next_year.amount,
                    payment_method_id=s.next_year.payment_method_id,
                    skip_reason=s.next_year.skip_reason,
                    flags=list(s.next_year.flags),
                ),
            )
            for s in plan.services
        ],
        skipped=[
            SkippedServiceRead(service_id=s.service_id, service_name=s.service_name, reason=s.reason)
            for s in plan.skipped
        ],
        totals=CloseTotalsRead(converted=plan.converted_total, next_year=plan.next_year_total),
    )


@router.post("/preview", response_model=ClosePreviewResponse)
async def preview_close_year(
    body: ClosePreviewRequest,
    _user: User = Depends(_admin),
    _fin: User = Depends(require_financial_view),
    db: AsyncSession = Depends(get_audited_db),
):
    """Read-only plan for closing a year. Takes no locks and writes nothing."""
    try:
        plan = await preview_close(db, body.fiscal_year, body.uplift_pct)
    except FiscalYearCloseError as exc:
        raise _http_error(exc) from exc
    return to_preview_response(plan)


@router.post("/execute", response_model=CloseExecuteResponse)
async def execute_close_year(
    body: CloseExecuteRequest,
    user: User = Depends(_admin),
    _fin: User = Depends(require_financial_view),
    db: AsyncSession = Depends(get_audited_db),
):
    try:
        result = await execute_close(
            db,
            user_id=user.id,
            fiscal_year=body.fiscal_year,
            plan_hash=body.plan_hash,
            uplift_pct=body.uplift_pct,
            conversions=[
                ConversionOverride(record_id=o.record_id, include=o.include, amount=o.amount)
                for o in body.conversions or []
            ],
            next_year=[
                NextYearOverride(service_id=o.service_id, include=o.include, amount=o.amount)
                for o in body.next_year or []
            ],
        )
    except FiscalYearCloseError as exc:
        raise _http_error(exc) from exc
    return CloseExecuteResponse(
        batch_id=result.batch_id,
        converted_count=result.converted_count,
        created_count=result.created_count,
        totals=CloseTotalsRead(converted=result.converted_total, next_year=result.next_year_total),
    )


@router.post("/revert", response_model=CloseRevertResponse)
async def revert_close_year(
    body: CloseRevertRequest,
    user: User = Depends(_admin),
    _fin: User = Depends(require_financial_view),
    db: AsyncSession = Depends(get_audited_db),
):
    try:
        result = await revert_close(db, user_id=user.id, batch_id=body.batch_id)
    except FiscalYearCloseError as exc:
        raise _http_error(exc) from exc
    return CloseRevertResponse(
        batch_id=result.batch_id,
        restored_count=result.restored_count,
        deleted_count=result.deleted_count,
    )


@router.get("/batches", response_model=list[CloseBatchRead])
async def list_close_year_batches(
    _user: User = Depends(_admin),
    _fin: User = Depends(require_financial_view),
    db: AsyncSession = Depends(get_audited_db),
):
    batches = await list_close_batches(db)
    return [
        CloseBatchRead(
            id=b.id,
            fiscal_year=b.fiscal_year,
            uplift_pct=b.uplift_pct,
            converted_count=b.converted_count,
            created_count=b.created_count,
            converted_total=b.converted_total,
            next_year_total=b.next_year_total,
            created_at=b.created_at,
            created_by_id=b.created_by_id,
            created_by_name=b.created_by_name,
            reverted_at=b.reverted_at,
            reverted_by_id=b.reverted_by_id,
            reverted_by_name=b.reverted_by_name,
            changed_since_close=b.changed_since_close,
        )
        for b in batches
    ]
