# app/api/monitoring.py
from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import AssetMonitoringMetric, SLABreachPrediction, CorrelatedIncident

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_metric(m: AssetMonitoringMetric) -> dict:
    return {
        "metric_id": m.metric_id,
        "asset_id": m.asset_id,
        "metric_date": m.metric_date.isoformat() if hasattr(m.metric_date, "isoformat") else str(m.metric_date),
        "row_count": m.row_count,
        "freshness_hours": m.freshness_hours,
        "null_rate_avg": m.null_rate_avg,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _fmt_prediction(p: SLABreachPrediction) -> dict:
    return {
        "prediction_id": p.prediction_id,
        "asset_id": p.asset_id,
        "predicted_at": p.predicted_at.isoformat() if p.predicted_at else None,
        "horizon_days": p.horizon_days,
        "forecast_scores": p.forecast_scores,
        "lower_band": p.lower_band,
        "upper_band": p.upper_band,
        "breach_day": p.breach_day,
        "breach_probability": p.breach_probability,
        "is_at_risk": p.is_at_risk,
    }


def _fmt_incident(i: CorrelatedIncident) -> dict:
    return {
        "incident_id": i.incident_id,
        "detected_at": i.detected_at.isoformat() if i.detected_at else None,
        "window_start": i.window_start.isoformat() if i.window_start else None,
        "window_end": i.window_end.isoformat() if i.window_end else None,
        "asset_ids": i.asset_ids or [],
        "anomaly_ids": i.anomaly_ids or [],
        "asset_count": i.asset_count,
        "severity": i.severity,
        "status": i.status,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }


@router.get("/metrics")
async def get_metrics(
    asset_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    cutoff = date.today() - timedelta(days=days)
    q = select(AssetMonitoringMetric).where(AssetMonitoringMetric.metric_date >= cutoff)
    if asset_id:
        q = q.where(AssetMonitoringMetric.asset_id == asset_id)
    q = q.order_by(desc(AssetMonitoringMetric.metric_date)).limit(500)
    result = await db.execute(q)
    return [_fmt_metric(m) for m in result.scalars().all()]


@router.get("/sla-predictions")
async def get_sla_predictions(
    is_at_risk: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(SLABreachPrediction)
    if is_at_risk is not None:
        q = q.where(SLABreachPrediction.is_at_risk == is_at_risk)
    q = q.order_by(desc(SLABreachPrediction.predicted_at)).limit(200)
    result = await db.execute(q)
    return [_fmt_prediction(p) for p in result.scalars().all()]


@router.get("/correlated-incidents")
async def get_correlated_incidents(
    status: Optional[str] = Query("open"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(CorrelatedIncident)
    if status:
        q = q.where(CorrelatedIncident.status == status)
    q = q.order_by(desc(CorrelatedIncident.detected_at)).limit(100)
    result = await db.execute(q)
    return [_fmt_incident(i) for i in result.scalars().all()]


@router.post("/correlated-incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(
        select(CorrelatedIncident).where(CorrelatedIncident.incident_id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = "resolved"
    incident.resolved_at = _utcnow()
    await db.commit()
    return {"message": "Resolved", "incident_id": incident_id}
