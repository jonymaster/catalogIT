from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.global_audit import record_global_audit_event
from app.integrations.gmail_send import send_mail
from app.models.integration_config import IntegrationConfig
from app.models.notification_global_settings import NotificationGlobalSettings
from app.models.renewal_notification_sent import RenewalNotificationSent
from app.models.service import Service
from app.models.user import User
from app.schemas.notifications import RenewalDispatchResult

BILLABLE_SCHEDULES = {"annually", "monthly"}

logger = logging.getLogger(__name__)


def _today_in_timezone(tz_name: str) -> date:
    try:
        tz = ZoneInfo(tz_name.strip() or "UTC")
    except ZoneInfoNotFoundError:
        logger.warning("Unknown timezone %r, falling back to UTC", tz_name)
        tz = ZoneInfo("UTC")
    return datetime.now(tz).date()


def _normalize_offsets(raw: list[int] | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    for x in raw:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out.append(n)
    # preserve order, dedupe
    seen: set[int] = set()
    unique: list[int] = []
    for n in out:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    return unique


async def run_renewal_dispatch(session: AsyncSession) -> RenewalDispatchResult:
    """Send due renewal reminder emails to service owners. Idempotent per (service, renewal, offset, user)."""
    ngs = await session.get(NotificationGlobalSettings, 1)
    if ngs is None:
        return RenewalDispatchResult(
            today="",
            timezone="",
            skipped_reason="notification_global_settings row missing (run migrations)",
        )

    tz_name = ngs.calendar_timezone or "UTC"
    today = _today_in_timezone(tz_name)
    result = RenewalDispatchResult(today=today.isoformat(), timezone=tz_name)

    if not ngs.renewal_reminders_enabled:
        result.skipped_reason = "renewal_reminders_disabled"
        return result

    google_row = await session.get(IntegrationConfig, "google_mail")
    if google_row is None or not google_row.enabled:
        result.skipped_reason = "gmail_integration_disabled"
        logger.warning("Renewal dispatch skipped: Gmail integration not enabled")
        return result

    global_offsets = _normalize_offsets(list(ngs.renewal_offsets_days or []))
    if not global_offsets:
        result.skipped_reason = "no_global_offsets"
        return result

    # Collect admin users and extra recipients for global notifications
    admin_users = (
        await session.execute(
            select(User).where(
                User.role == "admin",
                User.is_active.is_(True),
                User.receive_renewal_notifications.is_(True),
            )
        )
    ).scalars().all()

    extra_recipients = [
        u for u in ngs.extra_recipients
        if u.is_active and u.receive_renewal_notifications
    ]

    q = (
        select(Service)
        .where(Service.renewal_date.is_not(None))
        .where(Service.renewal_reminders_enabled.is_(True))
        .where(Service.is_active.is_(True))
        .options(selectinload(Service.owners))
    )
    services = (await session.execute(q)).scalars().all()
    result.examined_services = len(services)

    for service in services:
        assert service.renewal_date is not None
        # If the service has a configured offsets list but it's empty/invalid,
        # treat it as "inherit global offsets" rather than "send nothing".
        service_offsets = (
            _normalize_offsets(list(service.renewal_offsets_days))
            if service.renewal_offsets_days is not None
            else []
        )
        offsets = service_offsets or global_offsets
        if not offsets:
            continue

        # Build deduplicated recipient set: owners + admins + extra recipients
        recipients_by_id: dict[uuid.UUID, Any] = {}
        for owner in service.owners:
            if owner.is_active and owner.receive_renewal_notifications:
                recipients_by_id[owner.id] = owner

        # Admins and extra recipients get notified for services with
        # billing_schedule in (annually, monthly) or renewal_date set
        schedule = (service.billing_schedule or "").strip().lower()
        if schedule in BILLABLE_SCHEDULES or service.renewal_date is not None:
            for user in admin_users:
                recipients_by_id.setdefault(user.id, user)
            for user in extra_recipients:
                recipients_by_id.setdefault(user.id, user)

        for days_before in offsets:
            trigger = service.renewal_date - timedelta(days=days_before)
            if trigger != today:
                continue
            result.eligible_windows += 1

            for recipient in recipients_by_id.values():
                result.eligible_recipients += 1
                existing = await session.scalar(
                    select(RenewalNotificationSent.id).where(
                        RenewalNotificationSent.service_id == service.id,
                        RenewalNotificationSent.renewal_date == service.renewal_date,
                        RenewalNotificationSent.days_before == days_before,
                        RenewalNotificationSent.user_id == recipient.id,
                    )
                )
                if existing is not None:
                    result.skipped_existing += 1
                    continue

                recipient_name = f"{recipient.first_name} {recipient.last_name}".strip() or recipient.email
                data: dict[str, Any] = {
                    "title": f"Renewal in {days_before} days: {service.name}",
                    "service_name": service.name,
                    "renewal_date": service.renewal_date.isoformat(),
                    "days_before": str(days_before),
                    "days_until_renewal": str(days_before),
                    "owner_name": recipient_name,
                    "recipient_name": recipient_name,
                }

                try:
                    async with session.begin_nested():
                        await send_mail(
                            session,
                            google_row,
                            recipient.email,
                            data,
                        )
                        session.add(
                            RenewalNotificationSent(
                                id=uuid.uuid4(),
                                service_id=service.id,
                                renewal_date=service.renewal_date,
                                days_before=days_before,
                                user_id=recipient.id,
                                channel="email",
                            )
                        )
                        await session.flush()
                    result.emails_sent += 1
                    await record_global_audit_event(
                        session,
                        category="notification",
                        event_type="renewal_email_sent",
                        entity_table="services",
                        entity_key=str(service.id),
                        actor_user_id=None,
                        summary=f"Renewal reminder email sent for {service.name}",
                        details={
                            "channel": "email",
                            "service_id": str(service.id),
                            "user_id": str(recipient.id),
                            "recipient_email": recipient.email,
                            "days_before": days_before,
                            "renewal_date": service.renewal_date.isoformat(),
                        },
                        entity_label=service.name,
                    )
                except IntegrityError:
                    logger.info(
                        "Duplicate renewal notification skipped (race) service=%s user=%s",
                        service.id,
                        recipient.id,
                    )
                except Exception as exc:
                    err = f"service={service.id} user={recipient.id}: {exc}"
                    logger.exception("Renewal email failed: %s", err)
                    result.errors.append(err[:500])
                    await record_global_audit_event(
                        session,
                        category="notification",
                        event_type="renewal_email_failed",
                        entity_table="services",
                        entity_key=str(service.id),
                        actor_user_id=None,
                        summary="Renewal reminder email failed",
                        details={
                            "channel": "email",
                            "service_id": str(service.id),
                            "user_id": str(recipient.id),
                            "recipient_email": recipient.email,
                            "days_before": days_before,
                            "error": str(exc)[:500],
                        },
                        entity_label=service.name,
                    )

    return result
