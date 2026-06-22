# app/services/observability_engine.py
from __future__ import annotations

import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Asset, ColumnMetadata, VolumeBaseline, DistributionBaseline

logger = logging.getLogger("dq_platform.observability_engine")

_NUMERIC_TYPE_RE = re.compile(r"NUMBER|INT|FLOAT|DECIMAL|DOUBLE|REAL|NUMERIC", re.IGNORECASE)

MAX_VOLUME_READINGS = 7
DEFAULT_FRESHNESS_MAX_HOURS = 24.0


def _to_float(value) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def check_freshness(
    asset: Asset,
    last_modified_at: Optional[datetime],
    now_dt: datetime,
    max_hours: float = DEFAULT_FRESHNESS_MAX_HOURS,
) -> Optional[dict]:
    """Pure function — no DB access. Returns a finding dict or None."""
    if last_modified_at is None:
        return None
    hours = (now_dt - last_modified_at).total_seconds() / 3600
    if hours <= max_hours:
        return None
    severity = "critical" if hours >= max_hours * 2 else "high"
    return {
        "alert_type": "freshness_breach",
        "severity": severity,
        "message": (
            f"Asset not refreshed for {hours:.1f}h (max allowed: {max_hours:.0f}h)"
        ),
    }


async def check_volume(asset: Asset, current_row_count: Optional[int], db: AsyncSession) -> Optional[dict]:
    """Reads/writes VolumeBaseline.readings (rolling window of last 7 samples)."""
    if current_row_count is None:
        return None

    result = await db.execute(
        select(VolumeBaseline).where(VolumeBaseline.asset_id == asset.asset_id)
    )
    baseline = result.scalar_one_or_none()
    prior_readings = list(baseline.readings) if baseline and baseline.readings else []

    finding = None
    if len(prior_readings) >= 2:
        prior_avg = sum(prior_readings) / len(prior_readings)
        if prior_avg > 0:
            drop_pct = (prior_avg - current_row_count) / prior_avg
            severity = None
            if drop_pct >= 0.50:
                severity = "critical"
            elif drop_pct >= 0.30:
                severity = "high"
            elif drop_pct >= 0.15:
                severity = "medium"
            if severity:
                finding = {
                    "alert_type": "volume_shift",
                    "severity": severity,
                    "message": (
                        f"Row count dropped {drop_pct * 100:.0f}% "
                        f"(was ~{prior_avg:.0f}, now {current_row_count})"
                    ),
                }

    new_readings = (prior_readings + [current_row_count])[-MAX_VOLUME_READINGS:]
    if baseline:
        baseline.readings = new_readings
        baseline.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        baseline = VolumeBaseline(
            asset_id=asset.asset_id,
            readings=new_readings,
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(baseline)
    await db.commit()
    return finding


async def check_distribution(asset: Asset, db: AsyncSession) -> list[dict]:
    """Compares current numeric ColumnMetadata stats to DistributionBaseline."""
    result = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset.asset_id,
            ColumnMetadata.avg_value.isnot(None),
            ColumnMetadata.std_dev.isnot(None),
        )
    )
    columns = result.scalars().all()
    findings: list[dict] = []

    for col in columns:
        if not col.data_type or not _NUMERIC_TYPE_RE.search(col.data_type):
            continue

        baseline_result = await db.execute(
            select(DistributionBaseline).where(
                DistributionBaseline.asset_id == asset.asset_id,
                DistributionBaseline.column_name == col.column_name,
            )
        )
        baseline = baseline_result.scalar_one_or_none()

        if baseline is None:
            db.add(DistributionBaseline(
                asset_id=asset.asset_id,
                column_name=col.column_name,
                baseline_min=_to_float(col.min_value),
                baseline_max=_to_float(col.max_value),
                baseline_avg=col.avg_value,
                baseline_std_dev=col.std_dev,
            ))
            continue

        if not baseline.baseline_std_dev:
            continue

        shift = abs(col.avg_value - baseline.baseline_avg)
        ratio = shift / baseline.baseline_std_dev
        if ratio >= 0.5:
            severity = "high"
        elif ratio >= 0.25:
            severity = "medium"
        else:
            continue

        findings.append({
            "alert_type": "distribution_shift",
            "severity": severity,
            "message": (
                f"Column '{col.column_name}' mean shifted from "
                f"{baseline.baseline_avg:.2f} to {col.avg_value:.2f} "
                f"({ratio:.1f}x baseline std dev)"
            ),
            "column_name": col.column_name,
        })

    await db.commit()
    return findings


import asyncio
import uuid
from datetime import timedelta

from app.db.models import DQAlert, Issue

DEDUP_WINDOW_HOURS = 4


async def check_schema_drift(asset: Asset, db: AsyncSession) -> list[dict]:
    """Thin wrapper around schema_drift_service. Establishes the baseline on first
    sighting (no finding); thereafter returns one finding per open drift event.
    Note: detect_drift() already creates its own DQAlert — callers must route
    schema_drift findings through create_observability_issue(), not
    create_observability_alert(), to avoid double-alerting."""
    from app.services import schema_drift_service

    baseline = await schema_drift_service.get_active_baseline(asset.asset_id, db)
    if baseline is None:
        await schema_drift_service.initialize_baseline(asset.asset_id, db)
        return []

    events = await schema_drift_service.detect_drift(asset.asset_id, db)
    high_types = {"column_deleted", "type_changed"}
    return [
        {
            "alert_type": "schema_drift",
            "severity": "high" if ev.change_type in high_types else "medium",
            "message": f"Schema drift: {ev.change_type} on column '{ev.column_name}'",
            "column_name": ev.column_name,
        }
        for ev in events
    ]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def create_observability_issue(asset: Asset, finding: dict, db: AsyncSession) -> None:
    """Creates an Issue for a finding, deduped on an open issue with the same title."""
    label = finding["alert_type"]
    title = f"[Observability] {label} on {asset.sf_table_name or asset.asset_id}"

    existing = await db.execute(
        select(Issue).where(
            Issue.asset_id == asset.asset_id,
            Issue.title == title,
            Issue.status.not_in(["closed", "resolved"]),
        )
    )
    if existing.scalar_one_or_none():
        logger.debug("Observability issue dedup: open issue exists for %s", title)
        return

    issue = Issue(
        issue_id=str(uuid.uuid4()),
        title=title,
        description=finding["message"],
        issue_type="data_quality",
        status="new",
        severity=finding["severity"],
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset.asset_id,
        created_by="system",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(issue)
    await db.commit()
    logger.info("Observability issue created: %s", title)


async def create_observability_alert(asset: Asset, finding: dict, db: AsyncSession) -> None:
    """Creates a DQAlert + dispatches notification + creates an Issue, deduped
    4h per (asset_id, alert_type). Use for freshness/volume/distribution findings
    only — schema_drift findings already get their own alert from
    schema_drift_service.detect_drift() and should use create_observability_issue()."""
    window_start = _utcnow() - timedelta(hours=DEDUP_WINDOW_HOURS)
    existing = await db.execute(
        select(DQAlert).where(
            DQAlert.asset_id == asset.asset_id,
            DQAlert.alert_type == finding["alert_type"],
            DQAlert.alert_status == "open",
            DQAlert.created_at >= window_start,
        )
    )
    if existing.scalar_one_or_none():
        logger.debug(
            "Observability alert dedup: open alert exists for %s/%s",
            asset.asset_id, finding["alert_type"],
        )
        return

    alert = DQAlert(
        alert_id=str(uuid.uuid4()),
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset.asset_id,
        alert_type=finding["alert_type"],
        severity=finding["severity"],
        alert_status="open",
        alert_message=finding["message"],
        notification_channel="multi",
        notification_sent=False,
        created_at=_utcnow(),
    )
    db.add(alert)

    await create_observability_issue(asset, finding, db)
    await db.commit()
    logger.info(
        "Observability alert created: type=%s severity=%s asset=%s",
        finding["alert_type"], finding["severity"], asset.asset_id,
    )

    asyncio.create_task(_dispatch_observability_notification(alert, asset, db))


async def _dispatch_observability_notification(alert: DQAlert, asset: Asset, db: AsyncSession) -> None:
    """Fire-and-forget notification dispatch, mirrors alert_service._dispatch_notification
    but without a DQRule (observability findings aren't rule-driven)."""
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.notification_service import dispatch_alert
        from app.db.models import Domain

        async with AsyncSessionLocal() as session:
            extra_emails: list[str] = []
            domain_name = ""
            domain_res = await session.execute(
                select(Domain).where(Domain.domain_id == asset.domain_id)
            )
            domain = domain_res.scalar_one_or_none()
            if domain:
                domain_name = domain.domain_name
                if domain.owner_email:
                    extra_emails.append(domain.owner_email)
            if getattr(asset, "owner_email", None):
                extra_emails.append(asset.owner_email)

            asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset.sf_table_name else ""

            results = await dispatch_alert(
                rule_name=alert.alert_type,
                severity=alert.severity,
                alert_message=alert.alert_message or "",
                domain_name=domain_name,
                asset_name=asset_name,
                extra_emails=list(set(extra_emails)),
            )

            alert_res = await session.execute(
                select(DQAlert).where(DQAlert.alert_id == alert.alert_id)
            )
            stored = alert_res.scalar_one_or_none()
            if stored:
                stored.notification_sent = any(results.values())
                stored.notification_sent_at = _utcnow()
                stored.notified_to = ", ".join(extra_emails) if extra_emails else None
                await session.commit()
    except Exception as e:
        logger.error("Observability notification dispatch failed for alert %s: %s", alert.alert_id, e)


from app.db.models import ContinuousMonitoringConfig, SnowflakeConnection


async def _get_connector_for_connection(connection_id: str, db: AsyncSession):
    """Returns a connector instance for the connection, or None if unresolvable."""
    from app.connectors.config import from_orm as config_from_orm
    from app.connectors.factory import get_connector
    from app.api.connections import _decrypt_password

    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn_record = result.scalar_one_or_none()
    if conn_record is None or not conn_record.password:
        return None

    try:
        config = config_from_orm(conn_record)
        config.password = _decrypt_password(conn_record)
        return get_connector(config)
    except Exception as exc:
        logger.warning("Could not build connector for connection %s: %s", connection_id, exc)
        return None


async def _fetch_table_meta(asset: Asset, connector):
    """Returns the connector's TableMetadataSchema for this asset, or None."""
    if connector is None or not (asset.sf_database_name and asset.sf_schema_name and asset.sf_table_name):
        return None
    try:
        return await connector.get_table_metadata(
            asset.sf_database_name, asset.sf_schema_name, asset.sf_table_name
        )
    except Exception as exc:
        logger.warning("Could not fetch table metadata for asset %s: %s", asset.asset_id, exc)
        return None


async def _run_connection_checks(config: ContinuousMonitoringConfig, db: AsyncSession) -> None:
    """Runs every enabled check against every active asset on this connection.
    Per-asset failures are logged and skipped — they never abort the connection's run."""
    assets_result = await db.execute(
        select(Asset).where(Asset.connection_id == config.connection_id, Asset.is_active == True)
    )
    assets = assets_result.scalars().all()

    connector = None
    if config.freshness_enabled or config.volume_enabled:
        connector = await _get_connector_for_connection(config.connection_id, db)

    for asset in assets:
        try:
            table_meta = await _fetch_table_meta(asset, connector) if connector else None

            if config.freshness_enabled and table_meta is not None:
                finding = check_freshness(asset, table_meta.last_modified_at, _utcnow())
                if finding:
                    await create_observability_alert(asset, finding, db)

            if config.volume_enabled and table_meta is not None:
                finding = await check_volume(asset, table_meta.row_count, db)
                if finding:
                    await create_observability_alert(asset, finding, db)

            if config.schema_drift_enabled:
                for finding in await check_schema_drift(asset, db):
                    await create_observability_issue(asset, finding, db)

            if config.distribution_enabled:
                for finding in await check_distribution(asset, db):
                    await create_observability_alert(asset, finding, db)
        except Exception as exc:
            logger.error("Observability check failed for asset %s: %s", asset.asset_id, exc)
            try:
                await db.rollback()
            except Exception:
                pass
            continue


async def run_due_connections(db: AsyncSession) -> int:
    """Entry point called by the observability_tick scheduler job. Returns the
    number of connections processed this tick."""
    result = await db.execute(
        select(ContinuousMonitoringConfig).where(ContinuousMonitoringConfig.is_enabled == True)
    )
    configs = result.scalars().all()

    processed = 0
    now_dt = _utcnow()
    for config in configs:
        if config.last_run_at is not None:
            elapsed_minutes = (now_dt - config.last_run_at).total_seconds() / 60
            if elapsed_minutes < config.interval_minutes:
                continue
        try:
            await _run_connection_checks(config, db)
        except Exception as exc:
            logger.error(
                "Observability run failed for connection %s: %s", config.connection_id, exc
            )
            continue
        config.last_run_at = now_dt
        await db.commit()
        processed += 1
    return processed
