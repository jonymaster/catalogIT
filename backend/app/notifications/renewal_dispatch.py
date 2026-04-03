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

from app.integrations.gmail_send import send_mail
from app.models.integration_config import IntegrationConfig
from app.models.notification_global_settings import NotificationGlobalSettings
from app.models.renewal_notification_sent import RenewalNotificationSent
from app.models.service import Service
from app.schemas.notifications import RenewalDispatchResult

logger = logging.getLogger(__name__)

DEFAULT_RENEWAL_SUBJECT = "Renewal in {{days_before}} days: {{service_name}}"
DEFAULT_RENEWAL_HTML = (
    "<p>Hi {{owner_name}},</p>"
    "<p>The service <strong>{{service_name}}</strong> renews on {{renewal_date}} "
    "(in {{days_before}} days).</p>"
    "<p>{{body}}</p>"
)
DEFAULT_RENEWAL_TEXT = (
    "Hi {{owner_name}},\n\n"
    "The service {{service_name}} renews on {{renewal_date}} (in {{days_before}} days).\n\n"
    "{{body}}"
)


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


def _renewal_template_overrides(ngs: NotificationGlobalSettings) -> dict[str, Any]:
    return {
        "email_subject_template": ngs.renewal_email_subject_template
        or DEFAULT_RENEWAL_SUBJECT,
        "email_html_template": ngs.renewal_email_html_template or DEFAULT_RENEWAL_HTML,
        "email_text_template": ngs.renewal_email_text_template or DEFAULT_RENEWAL_TEXT,
    }


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

    q = (
        select(Service)
        .where(Service.renewal_date.is_not(None))
        .where(Service.renewal_reminders_enabled.is_(True))
        .where(Service.is_active.is_(True))
        .options(selectinload(Service.owners))
    )
    services = (await session.execute(q)).scalars().all()
    result.examined_services = len(services)

    tpl_overrides = _renewal_template_overrides(ngs)

    for service in services:
        assert service.renewal_date is not None
        offsets = (
            _normalize_offsets(list(service.renewal_offsets_days))
            if service.renewal_offsets_days is not None
            else global_offsets
        )
        if not offsets:
            continue

        for days_before in offsets:
            trigger = service.renewal_date - timedelta(days=days_before)
            if trigger != today:
                continue

            for owner in service.owners:
                if not owner.is_active or not owner.receive_renewal_notifications:
                    continue

                existing = await session.scalar(
                    select(RenewalNotificationSent.id).where(
                        RenewalNotificationSent.service_id == service.id,
                        RenewalNotificationSent.renewal_date == service.renewal_date,
                        RenewalNotificationSent.days_before == days_before,
                        RenewalNotificationSent.user_id == owner.id,
                    )
                )
                if existing is not None:
                    continue

                owner_name = f"{owner.first_name} {owner.last_name}".strip() or owner.email
                data: dict[str, Any] = {
                    "title": f"Renewal in {days_before} days: {service.name}",
                    "body": "Please review licensing and budget in CatalogIT.",
                    "service_name": service.name,
                    "renewal_date": service.renewal_date.isoformat(),
                    "days_before": str(days_before),
                    "days_until_renewal": str(days_before),
                    "owner_name": owner_name,
                }

                try:
                    async with session.begin_nested():
                        await send_mail(
                            session,
                            google_row,
                            owner.email,
                            data,
                            template_overrides=tpl_overrides,
                        )
                        session.add(
                            RenewalNotificationSent(
                                id=uuid.uuid4(),
                                service_id=service.id,
                                renewal_date=service.renewal_date,
                                days_before=days_before,
                                user_id=owner.id,
                                channel="email",
                            )
                        )
                        await session.flush()
                    result.emails_sent += 1
                except IntegrityError:
                    logger.info(
                        "Duplicate renewal notification skipped (race) service=%s user=%s",
                        service.id,
                        owner.id,
                    )
                except Exception as exc:
                    err = f"service={service.id} user={owner.id}: {exc}"
                    logger.exception("Renewal email failed: %s", err)
                    result.errors.append(err[:500])

    return result
