from __future__ import annotations
from typing import Optional
import logging
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import DQAlert, DQRuleRun, DQRule, DataAsset, Domain
import asyncio

logger = logging.getLogger("dq_platform.alerts")

DEDUP_WINDOW_HOURS = 4


async def create_alert_if_needed(run: DQRuleRun, rule: DQRule, db: AsyncSession):
    if run.status not in ("failed", "error"):
        return
    if rule.severity not in ("critical", "high", "medium"):
        return

    # Deduplication: check if an open alert already exists for this rule within the window
    window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=DEDUP_WINDOW_HOURS)
    existing = await db.execute(
        select(DQAlert).where(
            DQAlert.rule_id == rule.rule_id,
            DQAlert.alert_status == "open",
            DQAlert.created_at >= window_start,
        )
    )
    if existing.scalar_one_or_none():
        logger.debug(f"Alert dedup: open alert exists for rule {rule.rule_id} within {DEDUP_WINDOW_HOURS}h window")
        return

    if run.status == "error":
        message = f"Rule '{rule.rule_name}' could not execute: {run.error_message or 'Unknown error'}"
    elif run.failed_rows_count is not None and run.failure_percentage is not None:
        message = (
            f"Rule '{rule.rule_name}' failed — "
            f"{run.failed_rows_count:,} rows failed "
            f"({run.failure_percentage:.2f}% failure rate)"
        )
    else:
        message = f"Rule '{rule.rule_name}' failed."

    alert = DQAlert(
        alert_id=str(uuid.uuid4()),
        run_id=run.run_id,
        rule_id=rule.rule_id,
        domain_id=rule.domain_id,
        subdomain_id=rule.subdomain_id,
        asset_id=rule.asset_id,
        severity=rule.severity,
        alert_status="open",
        alert_message=message,
        notification_channel="multi",
        notification_sent=False,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    logger.info(f"Alert created: severity={rule.severity} rule={rule.rule_name} status={run.status}")

    # Dispatch notifications in the background (don't block rule execution)
    asyncio.create_task(_dispatch_notification(alert, rule, run, db))


async def _dispatch_notification(alert: DQAlert, rule: DQRule, run: DQRuleRun, db: AsyncSession):
    """Fire-and-forget notification dispatch."""
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.notification_service import dispatch_alert

        async with AsyncSessionLocal() as session:
            # Fetch enrichment
            domain_name = ""
            asset_name = ""
            extra_emails: list[str] = []
            slack_webhook: Optional[str] = None

            domain_res = await session.execute(
                select(Domain).where(Domain.domain_id == rule.domain_id)
            )
            domain = domain_res.scalar_one_or_none()
            if domain:
                domain_name = domain.domain_name
                if domain.owner_email:
                    extra_emails.append(domain.owner_email)

            asset_res = await session.execute(
                select(DataAsset).where(DataAsset.asset_id == rule.asset_id)
            )
            asset = asset_res.scalar_one_or_none()
            if asset:
                asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}"
                if asset.owner_email:
                    extra_emails.append(asset.owner_email)

            # Check SLA config for per-asset notification overrides
            from app.db.models import SLAConfig
            slack_webhook: Optional[str] = None
            teams_webhook: Optional[str] = None
            pagerduty_key: Optional[str] = None
            custom_webhook: Optional[str] = None

            sla_res = await session.execute(
                select(SLAConfig).where(
                    SLAConfig.entity_id == rule.asset_id,
                    SLAConfig.is_active == True,
                )
            )
            sla = sla_res.scalar_one_or_none()
            if sla:
                if sla.notification_emails:
                    extra_emails += [e.strip() for e in sla.notification_emails.split(",") if e.strip()]
                if sla.notification_slack_channel:
                    slack_webhook = sla.notification_slack_channel

            # Per-domain routing: read domain-level SLA config as fallback
            if not slack_webhook:
                domain_sla_res = await session.execute(
                    select(SLAConfig).where(
                        SLAConfig.entity_id == rule.domain_id,
                        SLAConfig.entity_type == "domain",
                        SLAConfig.is_active == True,
                    )
                )
                domain_sla = domain_sla_res.scalar_one_or_none()
                if domain_sla:
                    if domain_sla.notification_slack_channel:
                        slack_webhook = domain_sla.notification_slack_channel
                    if domain_sla.notification_emails:
                        extra_emails += [e.strip() for e in domain_sla.notification_emails.split(",") if e.strip()]

            # Global env-var fallbacks for Teams, PagerDuty, webhook
            from app.core.config import settings
            teams_webhook  = getattr(settings, "teams_webhook_url", "") or None
            pagerduty_key  = getattr(settings, "pagerduty_integration_key", "") or None
            custom_webhook = getattr(settings, "alert_webhook_url", "") or None

            results = await dispatch_alert(
                rule_name=rule.rule_name,
                severity=rule.severity,
                alert_message=alert.alert_message or "",
                domain_name=domain_name,
                asset_name=asset_name,
                failure_pct=run.failure_percentage,
                extra_emails=list(set(extra_emails)),
                slack_channel_webhook=slack_webhook,
                teams_webhook=teams_webhook,
                pagerduty_key=pagerduty_key,
                custom_webhook=custom_webhook,
            )

            # Update alert record with notification status
            alert_res = await session.execute(
                select(DQAlert).where(DQAlert.alert_id == alert.alert_id)
            )
            stored_alert = alert_res.scalar_one_or_none()
            if stored_alert:
                stored_alert.notification_sent = any(results.values())
                stored_alert.notification_sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
                stored_alert.notified_to = ", ".join(extra_emails) if extra_emails else None
                await session.commit()

            logger.info(f"Notification dispatch result for alert {alert.alert_id}: {results}")
    except Exception as e:
        logger.error(f"Notification dispatch failed for alert {alert.alert_id}: {e}")
