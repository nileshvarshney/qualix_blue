# app/services/results_store.py
from __future__ import annotations

import inspect
import logging
from datetime import datetime, timezone, date as date_t
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AssetScanSummary,
    ScanEvidenceLog,
    ScanJobRun,
    ScanMetricsHistory,
    ScanRunSummary,
    gen_uuid,
)

logger = logging.getLogger("dq_platform.results_store")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _scalar(result):
    """Return a single scalar, handling async attribute access in AsyncMock test contexts."""
    val = result.scalar_one_or_none()
    if inspect.isawaitable(val):
        val = await val
    return val


async def _scalars_all(result) -> list:
    """Return all scalars, handling async attribute access in AsyncMock test contexts."""
    scalars = result.scalars()
    if inspect.isawaitable(scalars):
        scalars = await scalars
    all_items = scalars.all()
    if inspect.isawaitable(all_items):
        all_items = await all_items
    return list(all_items)


# ─── Write: run-level ─────────────────────────────────────────────────────────

async def write_run_summary(db: AsyncSession, run_id: str) -> None:
    """Create ScanRunSummary for a completed run. Idempotent — skips if one exists. Caller must commit."""
    run = await db.get(ScanJobRun, run_id)
    if not run:
        logger.warning("write_run_summary: run %s not found", run_id)
        return

    result = await db.execute(
        select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
    )
    existing = await _scalar(result)
    if existing:
        return

    from app.db.models import ScanJob
    job = await db.get(ScanJob, run.job_id)
    connection_id = job.connection_id if job else None
    scan_type = job.job_type if job else None

    result_summary = run.result_summary or {}
    failed = result_summary.get("tables_failed", run.errors_count)
    new_assets = result_summary.get("new_assets", 0)
    updated_assets = result_summary.get("updated_assets", max(0, run.assets_scanned - failed - new_assets))

    summary = ScanRunSummary(
        run_id=run_id,
        job_id=run.job_id,
        connection_id=connection_id,
        scan_type=scan_type,
        new_assets_count=new_assets,
        updated_assets_count=updated_assets,
        removed_assets_count=result_summary.get("removed_assets", 0),
        failed_assets_count=failed,
        schema_changes_count=result_summary.get("schema_changes", 0),
        scan_parameters=run.parameters,
    )
    db.add(summary)


# ─── Write: asset-level ───────────────────────────────────────────────────────

async def write_asset_summary(
    db: AsyncSession,
    run_id: str,
    asset_id: str,
    job_id: Optional[str] = None,
    scan_status: str = "succeeded",
    scan_duration_ms: Optional[int] = None,
    row_count: Optional[int] = None,
    bytes: Optional[int] = None,
    column_count: Optional[int] = None,
    schema_hash: Optional[str] = None,
    columns_added: int = 0,
    columns_removed: int = 0,
    columns_changed: int = 0,
    schema_drift_detected: bool = False,
    error_message: Optional[str] = None,
) -> None:
    """Insert one AssetScanSummary row. Does not upsert — each run gets its own row. Caller must commit."""
    summary = AssetScanSummary(
        run_id=run_id,
        asset_id=asset_id,
        job_id=job_id,
        scan_status=scan_status,
        scan_duration_ms=scan_duration_ms,
        row_count=row_count,
        bytes=bytes,
        column_count=column_count,
        schema_hash=schema_hash,
        columns_added=columns_added,
        columns_removed=columns_removed,
        columns_changed=columns_changed,
        schema_drift_detected=schema_drift_detected,
        error_message=error_message,
    )
    db.add(summary)


# ─── Write: metrics history ───────────────────────────────────────────────────

async def record_metrics(
    db: AsyncSession,
    asset_id: str,
    metric_date: date_t,
    metrics: dict[str, Optional[float]],
    run_id: Optional[str] = None,
) -> None:
    """Upsert metric points for an asset. Skips None values. Caller must commit.
    Safe for concurrent calls — IntegrityError on concurrent insert is handled via re-fetch."""
    for name, value in metrics.items():
        if value is None:
            continue
        result = await db.execute(
            select(ScanMetricsHistory).where(
                ScanMetricsHistory.asset_id == asset_id,
                ScanMetricsHistory.metric_name == name,
                ScanMetricsHistory.metric_date == metric_date,
            )
        )
        existing = await _scalar(result)
        if existing:
            existing.metric_value_num = float(value)
            existing.run_id = run_id
        else:
            try:
                db.add(ScanMetricsHistory(
                    asset_id=asset_id,
                    run_id=run_id,
                    metric_date=metric_date,
                    metric_name=name,
                    metric_value_num=float(value),
                ))
                await db.flush()
            except IntegrityError:
                await db.rollback()
                retry = await db.execute(
                    select(ScanMetricsHistory).where(
                        ScanMetricsHistory.asset_id == asset_id,
                        ScanMetricsHistory.metric_name == name,
                        ScanMetricsHistory.metric_date == metric_date,
                    )
                )
                row = await _scalar(retry)
                if row:
                    row.metric_value_num = float(value)
                    row.run_id = run_id


# ─── Write: evidence ──────────────────────────────────────────────────────────

async def append_evidence(
    db: AsyncSession,
    run_id: str,
    evidence_type: str,
    severity: str,
    message: str,
    asset_id: Optional[str] = None,
    payload: Optional[dict] = None,
    retention_days: Optional[int] = None,
) -> None:
    """Append one structured evidence/diagnostic entry for a run. Caller must commit."""
    from datetime import timedelta
    expires = None
    if retention_days is not None:
        expires = _now() + timedelta(days=retention_days)

    db.add(ScanEvidenceLog(
        run_id=run_id,
        asset_id=asset_id,
        evidence_type=evidence_type,
        severity=severity,
        message=message[:5000],
        payload=payload,
        retention_expires_at=expires,
    ))


# ─── Read: run-level ──────────────────────────────────────────────────────────

async def get_run_summary(db: AsyncSession, run_id: str) -> Optional[ScanRunSummary]:
    """Return ScanRunSummary for a run, or None if not yet written."""
    result = await db.execute(
        select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
    )
    return await _scalar(result)


# ─── Read: asset-level ────────────────────────────────────────────────────────

async def get_asset_latest(db: AsyncSession, asset_id: str) -> Optional[AssetScanSummary]:
    """Return the most recent AssetScanSummary for an asset."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.asset_id == asset_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(1)
    )
    return await _scalar(result)


async def get_asset_history(
    db: AsyncSession,
    asset_id: str,
    limit: int = 50,
) -> list[AssetScanSummary]:
    """Return all AssetScanSummary rows for an asset, newest-first. Max 500."""
    limit = min(limit, 500)
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.asset_id == asset_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(limit)
    )
    return await _scalars_all(result)


async def get_run_asset_summaries(
    db: AsyncSession, run_id: str, limit: int = 200
) -> list[AssetScanSummary]:
    """All AssetScanSummary rows for a given run."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.run_id == run_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(limit)
    )
    return await _scalars_all(result)


async def get_asset_run_summary(
    db: AsyncSession, run_id: str, asset_id: str
) -> Optional[AssetScanSummary]:
    """AssetScanSummary for a specific (run, asset) pair — most recent if multiple."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(
            AssetScanSummary.run_id == run_id,
            AssetScanSummary.asset_id == asset_id,
        )
        .order_by(desc(AssetScanSummary.created_at))
        .limit(1)
    )
    return await _scalar(result)


# ─── Read: trend ──────────────────────────────────────────────────────────────

async def get_asset_trend(
    db: AsyncSession,
    asset_id: str,
    metric_name: str,
    since: Optional[date_t] = None,
    until: Optional[date_t] = None,
    limit: int = 90,
) -> list[ScanMetricsHistory]:
    """Return metric history for an asset ordered oldest-first."""
    from datetime import timedelta
    if since is None:
        since = (_now() - timedelta(days=90)).date()
    if until is None:
        until = _now().date()
    limit = min(limit, 90)

    result = await db.execute(
        select(ScanMetricsHistory)
        .where(
            ScanMetricsHistory.asset_id == asset_id,
            ScanMetricsHistory.metric_name == metric_name,
            ScanMetricsHistory.metric_date >= since,
            ScanMetricsHistory.metric_date <= until,
        )
        .order_by(ScanMetricsHistory.metric_date)
        .limit(limit)
    )
    return await _scalars_all(result)


# ─── Read: comparison ─────────────────────────────────────────────────────────

async def compare_runs(db: AsyncSession, run_id_a: str, run_id_b: str) -> dict:
    """Compare two scan run summaries. Returns both summaries + a delta dict."""
    async def _fetch(run_id: str) -> Optional[ScanRunSummary]:
        res = await db.execute(
            select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
        )
        return await _scalar(res)

    summary_a = await _fetch(run_id_a)
    if not summary_a:
        raise ValueError(f"ScanRunSummary for run {run_id_a} not found")

    summary_b = await _fetch(run_id_b)
    if not summary_b:
        raise ValueError(f"ScanRunSummary for run {run_id_b} not found")

    delta = {
        "new_assets_delta": summary_b.new_assets_count - summary_a.new_assets_count,
        "updated_assets_delta": summary_b.updated_assets_count - summary_a.updated_assets_count,
        "removed_assets_delta": summary_b.removed_assets_count - summary_a.removed_assets_count,
        "failed_assets_delta": summary_b.failed_assets_count - summary_a.failed_assets_count,
        "schema_changes_delta": summary_b.schema_changes_count - summary_a.schema_changes_count,
    }
    if summary_a.quality_score_avg is not None and summary_b.quality_score_avg is not None:
        delta["quality_score_delta"] = round(
            summary_b.quality_score_avg - summary_a.quality_score_avg, 4
        )

    return {
        "run_a": summary_a,
        "run_b": summary_b,
        "delta": delta,
    }


# ─── Read: evidence ───────────────────────────────────────────────────────────

async def get_run_evidence(
    db: AsyncSession,
    run_id: str,
    asset_id: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 200,
) -> list[ScanEvidenceLog]:
    """Return evidence logs for a run, optionally filtered by asset or severity."""
    q = (
        select(ScanEvidenceLog)
        .where(ScanEvidenceLog.run_id == run_id)
    )
    if asset_id:
        q = q.where(ScanEvidenceLog.asset_id == asset_id)
    if severity:
        q = q.where(ScanEvidenceLog.severity == severity)
    q = q.order_by(desc(ScanEvidenceLog.created_at)).limit(limit)
    result = await db.execute(q)
    return await _scalars_all(result)
