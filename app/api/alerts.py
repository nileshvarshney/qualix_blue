from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from datetime import datetime, timezone
from app.db.database import get_db
from app.db.models import DQAlert, DQRule, Asset, Domain, Subdomain
from app.core.security import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])


def _fmt(alert: DQAlert, extra: dict = {}) -> dict:
    return {
        "alert_id":          alert.alert_id,
        "run_id":            alert.run_id,
        "rule_id":           alert.rule_id,
        "domain_id":         alert.domain_id,
        "subdomain_id":      alert.subdomain_id,
        "asset_id":          alert.asset_id,
        "alert_type":        alert.alert_type,
        "severity":          alert.severity,
        "alert_status":      alert.alert_status,
        "alert_message":     alert.alert_message,
        "notification_channel": alert.notification_channel,
        "created_at":        alert.created_at.isoformat(),
        "resolved_at":       alert.resolved_at.isoformat() if alert.resolved_at else None,
        **extra,
    }


@router.get("")
async def list_alerts(
    status: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    alert_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(DQAlert)
    if connection_id:
        q = q.join(Asset, DQAlert.asset_id == Asset.asset_id).where(Asset.connection_id == connection_id)
    if status:
        q = q.where(DQAlert.alert_status == status)
    if domain_id:
        q = q.where(DQAlert.domain_id == domain_id)
    if asset_id:
        q = q.where(DQAlert.asset_id == asset_id)
    if severity:
        q = q.where(DQAlert.severity == severity)
    if alert_type:
        q = q.where(DQAlert.alert_type == alert_type)
    result = await db.execute(q.order_by(desc(DQAlert.created_at)).limit(limit).offset(offset))
    return [_fmt(a) for a in result.scalars().all()]


@router.get("/enriched")
async def list_alerts_enriched(
    status: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Returns alerts joined with rule, asset, domain, and subdomain details."""
    q = (
        select(DQAlert, DQRule, Asset, Domain, Subdomain)
        .outerjoin(DQRule,    DQAlert.rule_id      == DQRule.rule_id)
        .outerjoin(Asset,     DQAlert.asset_id     == Asset.asset_id)
        .outerjoin(Domain,    DQAlert.domain_id    == Domain.domain_id)
        .outerjoin(Subdomain, DQAlert.subdomain_id == Subdomain.subdomain_id)
    )
    if status:
        q = q.where(DQAlert.alert_status == status)
    if domain_id:
        q = q.where(DQAlert.domain_id == domain_id)
    if connection_id:
        q = q.where(Asset.connection_id == connection_id)
    if severity:
        q = q.where(DQAlert.severity == severity)
    q = q.order_by(desc(DQAlert.created_at)).limit(limit)

    result = await db.execute(q)
    return [
        _fmt(alert, {
            "rule_name":        rule.rule_name if rule else None,
            "rule_description": rule.rule_description if rule else None,
            "rule_type":        rule.rule_type if rule else None,
            "sf_database_name": asset.sf_database_name if asset else None,
            "sf_schema_name":   asset.sf_schema_name if asset else None,
            "sf_table_name":    asset.sf_table_name if asset else None,
            "asset_name":       (asset.display_name or asset.sf_table_name) if asset else None,
            "domain_name":      domain.domain_name if domain else None,
            "subdomain_name":   subdomain.subdomain_name if subdomain else None,
        })
        for alert, rule, asset, domain, subdomain in result.all()
    ]


@router.get("/summary")
async def alerts_summary(db: AsyncSession = Depends(get_db)):
    """Count of alerts grouped by status."""
    result = await db.execute(
        select(DQAlert.alert_status, func.count().label("count"))
        .group_by(DQAlert.alert_status)
    )
    return {row.alert_status: row.count for row in result.all()}


@router.put("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    result = await db.execute(select(DQAlert).where(DQAlert.alert_id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.alert_status = "acknowledged"
    await db.commit()
    return {"message": "Alert acknowledged"}


@router.put("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    result = await db.execute(select(DQAlert).where(DQAlert.alert_id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.alert_status = "resolved"
    alert.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"message": "Alert resolved"}


@router.put("/{alert_id}/ignore")
async def ignore_alert(
    alert_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    result = await db.execute(select(DQAlert).where(DQAlert.alert_id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.alert_status = "ignored"
    await db.commit()
    return {"message": "Alert ignored"}
