from __future__ import annotations
from typing import Optional

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ColumnMetadata, DataAsset, DQAlert, SchemaBaseline, SchemaDriftEvent,
)

logger = logging.getLogger("dq_platform.schema_drift")


# ── Pure helpers ──────────────────────────────────────────────────────────────

def _compute_diff(
    baseline_snapshot: list[dict],
    current_cols: list[dict],
) -> list[dict]:
    """Compare baseline snapshot to current columns; return list of change dicts."""
    baseline = {c["column_name"]: c for c in baseline_snapshot}
    current  = {c["column_name"]: c for c in current_cols}

    events: list[dict] = []

    for col_name in set(baseline) - set(current):
        events.append({
            "change_type": "column_deleted",
            "column_name": col_name,
            "old_value":   baseline[col_name].get("data_type"),
            "new_value":   None,
        })

    for col_name in set(current) - set(baseline):
        events.append({
            "change_type": "column_added",
            "column_name": col_name,
            "old_value":   None,
            "new_value":   current[col_name].get("data_type"),
        })

    for col_name in set(baseline) & set(current):
        b, c = baseline[col_name], current[col_name]
        if b.get("data_type") != c.get("data_type"):
            events.append({
                "change_type": "type_changed",
                "column_name": col_name,
                "old_value":   b.get("data_type"),
                "new_value":   c.get("data_type"),
            })
        if b.get("is_nullable") != c.get("is_nullable"):
            events.append({
                "change_type": "nullability_changed",
                "column_name": col_name,
                "old_value":   str(b.get("is_nullable")),
                "new_value":   str(c.get("is_nullable")),
            })

    return events


def _summarize_changes(diff: list[dict]) -> str:
    counts: dict[str, int] = {}
    for d in diff:
        counts[d["change_type"]] = counts.get(d["change_type"], 0) + 1
    parts = []
    if counts.get("column_deleted"):
        parts.append(f"{counts['column_deleted']} column(s) deleted")
    if counts.get("type_changed"):
        parts.append(f"{counts['type_changed']} type(s) changed")
    if counts.get("column_added"):
        parts.append(f"{counts['column_added']} column(s) added")
    if counts.get("nullability_changed"):
        parts.append(f"{counts['nullability_changed']} nullability changed")
    return ", ".join(parts) if parts else "schema changes detected"


def _col_to_snapshot_row(c: ColumnMetadata) -> dict:
    return {
        "column_name":      c.column_name,
        "data_type":        c.data_type,
        "is_nullable":      c.is_nullable,
        "ordinal_position": c.ordinal_position,
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

async def get_active_baseline(asset_id: str, db: AsyncSession) -> Optional[SchemaBaseline]:
    result = await db.execute(
        select(SchemaBaseline).where(
            SchemaBaseline.asset_id == asset_id,
            SchemaBaseline.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def _current_columns(asset_id: str, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
    )
    return [_col_to_snapshot_row(c) for c in result.scalars().all()]


# ── Public service functions ──────────────────────────────────────────────────

async def initialize_baseline(asset_id: str, db: AsyncSession) -> SchemaBaseline:
    """Create the first baseline from current ColumnMetadata. No alert raised."""
    snapshot = await _current_columns(asset_id, db)
    baseline = SchemaBaseline(
        baseline_id=str(uuid.uuid4()),
        asset_id=asset_id,
        status="active",
        columns_snapshot=snapshot,
        approved_by=None,
        approved_at=None,
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)
    logger.info("Initialized schema baseline for asset %s (%d columns)", asset_id, len(snapshot))
    return baseline


async def detect_drift(asset_id: str, db: AsyncSession) -> list[SchemaDriftEvent]:
    """Compare current ColumnMetadata to active baseline; persist events + alert if changed."""
    baseline = await get_active_baseline(asset_id, db)
    if not baseline:
        return []

    # Dedup: skip if open events already exist for this asset
    existing = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        logger.debug("Drift dedup: open events exist for asset %s — skipping", asset_id)
        return []

    current = await _current_columns(asset_id, db)
    diff = _compute_diff(baseline.columns_snapshot or [], current)
    if not diff:
        return []

    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    events = [
        SchemaDriftEvent(
            event_id=str(uuid.uuid4()),
            asset_id=asset_id,
            baseline_id=baseline.baseline_id,
            detected_at=now_dt,
            change_type=d["change_type"],
            column_name=d["column_name"],
            old_value=d["old_value"],
            new_value=d["new_value"],
            status="open",
        )
        for d in diff
    ]
    for ev in events:
        db.add(ev)
    await db.flush()

    # Create alert only if no open drift alert already exists for this asset
    alert_exists = await db.execute(
        select(DQAlert).where(
            DQAlert.drift_asset_id == asset_id,
            DQAlert.alert_type == "schema_drift",
            DQAlert.alert_status == "open",
        ).limit(1)
    )
    if not alert_exists.scalar_one_or_none():
        asset_res = await db.execute(
            select(DataAsset).where(DataAsset.asset_id == asset_id)
        )
        asset = asset_res.scalar_one_or_none()

        high_types = {"column_deleted", "type_changed"}
        severity = "high" if any(d["change_type"] in high_types for d in diff) else "medium"
        change_summary = _summarize_changes(diff)
        asset_label = (
            f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else asset_id
        )

        alert = DQAlert(
            alert_id=str(uuid.uuid4()),
            run_id=None,
            rule_id=None,
            domain_id=asset.domain_id if asset else "",
            subdomain_id=asset.subdomain_id if asset else "",
            asset_id=asset_id,
            alert_type="schema_drift",
            drift_asset_id=asset_id,
            severity=severity,
            alert_status="open",
            alert_message=f"Schema drift on {asset_label}: {change_summary}",
            notification_channel="multi",
            notification_sent=False,
        )
        db.add(alert)
        await db.commit()
        asyncio.create_task(_dispatch_drift_notification(alert, asset, diff))
    else:
        await db.commit()

    logger.info("Detected %d schema drift event(s) for asset %s", len(events), asset_id)
    return events


async def approve_baseline(
    asset_id: str, user_id: str, db: AsyncSession
) -> SchemaBaseline:
    """Accept all open drift events and advance the baseline to current schema."""
    baseline = await get_active_baseline(asset_id, db)
    if baseline:
        baseline.status = "superseded"

    snapshot = await _current_columns(asset_id, db)
    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    new_baseline = SchemaBaseline(
        baseline_id=str(uuid.uuid4()),
        asset_id=asset_id,
        status="active",
        columns_snapshot=snapshot,
        approved_by=user_id,
        approved_at=now_dt,
    )
    db.add(new_baseline)

    open_events_result = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        )
    )
    for ev in open_events_result.scalars().all():
        ev.status = "accepted"
        ev.resolved_at = now_dt
        ev.resolved_by = user_id

    await db.commit()
    await db.refresh(new_baseline)
    logger.info("Baseline approved for asset %s by user %s", asset_id, user_id)
    return new_baseline


# ── Background notification ───────────────────────────────────────────────────

async def _dispatch_drift_notification(
    alert: DQAlert,
    asset: Optional[DataAsset],
    diff: list[dict],
) -> None:
    """Fire-and-forget: send drift alert notifications via existing channels."""
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.notification_service import dispatch_alert
        from app.core.config import settings
        from sqlalchemy import select as _select

        async with AsyncSessionLocal() as session:
            extra_emails: list[str] = []
            if asset and asset.owner_email:
                extra_emails.append(asset.owner_email)

            asset_name = (
                f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else (alert.asset_id or "")
            )
            teams_webhook  = getattr(settings, "teams_webhook_url", "") or None
            pagerduty_key  = getattr(settings, "pagerduty_integration_key", "") or None
            custom_webhook = getattr(settings, "alert_webhook_url", "") or None

            results = await dispatch_alert(
                rule_name="Schema Drift Detection",
                severity=alert.severity,
                alert_message=alert.alert_message or "",
                domain_name="",
                asset_name=asset_name,
                failure_pct=None,
                extra_emails=extra_emails,
                slack_channel_webhook=None,
                teams_webhook=teams_webhook,
                pagerduty_key=pagerduty_key,
                custom_webhook=custom_webhook,
            )

            stored_res = await session.execute(
                _select(DQAlert).where(DQAlert.alert_id == alert.alert_id)
            )
            stored = stored_res.scalar_one_or_none()
            if stored:
                stored.notification_sent = any(results.values())
                stored.notification_sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
                stored.notified_to = ", ".join(extra_emails) if extra_emails else None
                await session.commit()

            logger.info("Drift notification dispatch result for alert %s: %s", alert.alert_id, results)
    except Exception as e:
        logger.error("Drift notification failed for alert %s: %s", alert.alert_id, e)
