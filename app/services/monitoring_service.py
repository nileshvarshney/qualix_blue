# app/services/monitoring_service.py
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("dq_platform.monitoring")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


# ── collect_asset_metrics ─────────────────────────────────────────────────────

async def collect_asset_metrics(db: AsyncSession) -> int:
    """
    Nightly job: for each active asset, record row_count, freshness_hours,
    null_rate_avg into asset_monitoring_metrics. One row per asset per day.
    Idempotent — skips assets already recorded today.
    Returns count of new rows written.
    """
    from app.core.config import settings
    from app.db.models import Asset, DQRuleRun, ColumnMetadata, AssetMonitoringMetric

    today = date.today()
    sem = asyncio.Semaphore(getattr(settings, "snowflake_pool_max_size", 5))
    written = 0

    assets_res = await db.execute(select(Asset).where(Asset.is_active == True))
    assets = assets_res.scalars().all()

    for asset in assets:
        async with sem:
            try:
                written += await _write_metric_for_asset(asset, today, db)
            except Exception as exc:
                logger.error("Metric collection failed for asset %s: %s", asset.asset_id, exc)

    await db.commit()
    logger.info("Metric collection complete: %d new rows", written)
    return written


async def _write_metric_for_asset(asset, today: date, db: AsyncSession) -> int:
    from app.db.models import DQRuleRun, ColumnMetadata, AssetMonitoringMetric

    # Idempotency check — skip if already recorded today
    existing = await db.execute(
        select(AssetMonitoringMetric).where(
            AssetMonitoringMetric.asset_id == asset.asset_id,
            AssetMonitoringMetric.metric_date == today,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return 0

    now = _utcnow()

    # Freshness: hours since most recent rule run
    latest_run_res = await db.execute(
        select(DQRuleRun.created_at)
        .where(DQRuleRun.asset_id == asset.asset_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(1)
    )
    latest_run_ts = latest_run_res.scalar_one_or_none()
    freshness_hours: Optional[float] = None
    if latest_run_ts is not None:
        freshness_hours = round((now - latest_run_ts).total_seconds() / 3600, 2)

    # Row count: query Snowflake (best-effort — skip on error)
    row_count: Optional[int] = None
    if asset.sf_table_name and asset.sf_schema_name:
        try:
            from app.services.execution_service import _resolve_executor
            executor = await _resolve_executor(asset, db)
            row_count = await executor.aget_table_row_count(
                asset.sf_database_name or "",
                asset.sf_schema_name,
                asset.sf_table_name,
            )
        except Exception as exc:
            logger.debug("Row count unavailable for %s: %s", asset.asset_id, exc)

    # Null rate: average null proportion across profiled columns
    null_rate_avg: Optional[float] = None
    if row_count and row_count > 0:
        cols_res = await db.execute(
            select(ColumnMetadata).where(
                ColumnMetadata.asset_id == asset.asset_id,
                ColumnMetadata.null_count.isnot(None),
            )
        )
        cols = cols_res.scalars().all()
        if cols:
            rates = [c.null_count / row_count for c in cols if c.null_count is not None]
            if rates:
                null_rate_avg = round(sum(rates) / len(rates), 4)

    metric = AssetMonitoringMetric(
        metric_id=str(uuid.uuid4()),
        asset_id=asset.asset_id,
        metric_date=today,
        row_count=row_count,
        freshness_hours=freshness_hours,
        null_rate_avg=null_rate_avg,
        created_at=now,
    )
    db.add(metric)
    return 1


# ── predict_sla_breaches ──────────────────────────────────────────────────────

async def predict_sla_breaches(db: AsyncSession) -> int:
    """
    Nightly job: for each asset with an active SLAConfig, fetch last 30 days
    of quality scores, run forecast, upsert SLABreachPrediction.
    Returns count of predictions upserted.
    """
    from app.db.models import SLAConfig, DQQualityScore, SLABreachPrediction
    from app.services.forecast_service import compute_forecast

    sla_res = await db.execute(
        select(SLAConfig).where(
            SLAConfig.is_active == True,
            SLAConfig.entity_type == "asset",
        )
    )
    sla_configs = sla_res.scalars().all()

    now = _utcnow()
    upserted = 0

    for sla in sla_configs:
        try:
            cutoff = date.today() - timedelta(days=30)
            scores_res = await db.execute(
                select(DQQualityScore).where(
                    DQQualityScore.asset_id == sla.entity_id,
                    DQQualityScore.score_level == "table",
                    DQQualityScore.score_date >= cutoff,
                ).order_by(DQQualityScore.score_date)
            )
            score_rows = scores_res.scalars().all()

            if len(score_rows) < 3:
                continue  # insufficient history — skip

            scores = [float(r.quality_score) for r in score_rows]
            result = compute_forecast(scores, horizon=7)
            if result is None:
                continue

            # Determine breach
            threshold = sla.min_quality_score
            breach_day: Optional[int] = None
            for i, lb in enumerate(result.lower_band):
                if lb < threshold:
                    breach_day = i
                    break
            days_below = sum(1 for lb in result.lower_band if lb < threshold)
            breach_probability = round(days_below / len(result.lower_band), 2)
            is_at_risk = breach_day is not None

            # Upsert by asset_id
            existing_res = await db.execute(
                select(SLABreachPrediction).where(
                    SLABreachPrediction.asset_id == sla.entity_id
                )
            )
            existing = existing_res.scalar_one_or_none()

            if existing:
                existing.predicted_at = now
                existing.horizon_days = 7
                existing.forecast_scores = result.forecast
                existing.lower_band = result.lower_band
                existing.upper_band = result.upper_band
                existing.breach_day = breach_day
                existing.breach_probability = breach_probability
                existing.is_at_risk = is_at_risk
                db.add(existing)
            else:
                pred = SLABreachPrediction(
                    prediction_id=str(uuid.uuid4()),
                    asset_id=sla.entity_id,
                    predicted_at=now,
                    horizon_days=7,
                    forecast_scores=result.forecast,
                    lower_band=result.lower_band,
                    upper_band=result.upper_band,
                    breach_day=breach_day,
                    breach_probability=breach_probability,
                    is_at_risk=is_at_risk,
                )
                db.add(pred)

            upserted += 1

        except Exception as exc:
            logger.error("SLA prediction failed for asset %s: %s", sla.entity_id, exc)

    await db.commit()
    logger.info("SLA prediction complete: %d predictions upserted", upserted)
    return upserted


# ── check_correlation ─────────────────────────────────────────────────────────

async def check_correlation(asset_id: str, detection_id: str, db: AsyncSession) -> Optional[str]:
    """
    Called after each new AnomalyDetection commit.
    If 3+ distinct assets have detections in the last 15 minutes, and no open
    CorrelatedIncident was created in the last 30 minutes, insert one.
    Returns the new incident_id, or None.
    """
    from app.db.models import AnomalyDetection, CorrelatedIncident

    now = _utcnow()
    window_start = now - timedelta(minutes=15)
    guard_start = now - timedelta(minutes=30)

    # Gather recent detections
    dets_res = await db.execute(
        select(AnomalyDetection).where(
            AnomalyDetection.detected_at > window_start
        )
    )
    recent = dets_res.scalars().all()

    distinct_assets = list({d.asset_id for d in recent})
    if len(distinct_assets) < 3:
        return None

    # Guard: no open incident in last 30 min
    existing_res = await db.execute(
        select(CorrelatedIncident).where(
            CorrelatedIncident.status == "open",
            CorrelatedIncident.detected_at > guard_start,
        )
    )
    if existing_res.scalar_one_or_none() is not None:
        return None

    # Determine severity: high if any detection is high/critical
    severities = {d.severity for d in recent if d.severity}
    severity = "high" if severities & {"high", "critical"} else "medium"

    incident = CorrelatedIncident(
        incident_id=str(uuid.uuid4()),
        detected_at=now,
        window_start=window_start,
        window_end=now,
        asset_ids=distinct_assets,
        anomaly_ids=[d.detection_id for d in recent],
        asset_count=len(distinct_assets),
        severity=severity,
        status="open",
    )
    db.add(incident)
    await db.commit()
    logger.info(
        "Correlated incident %s created: %d assets, severity=%s",
        incident.incident_id, len(distinct_assets), severity,
    )
    return incident.incident_id
