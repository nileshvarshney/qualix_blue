# app/services/observability_engine.py
from __future__ import annotations

import re
import logging
from datetime import datetime, timezone
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

    trim_to = min(max(len(prior_readings), 1), MAX_VOLUME_READINGS)
    new_readings = (prior_readings + [current_row_count])[-trim_to:]
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
