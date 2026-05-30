from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from app.db.database import get_db
from app.db.models import QualityIncident, OncallSchedule, IncidentRunbook, DataAsset
from app.core.security import get_current_user

router = APIRouter(tags=["Incidents"])


def _fmt_incident(i: QualityIncident) -> dict:
    return {
        "incident_id": i.incident_id,
        "title": i.title,
        "asset_id": i.asset_id,
        "severity": i.severity,
        "status": i.status,
        "trigger_run_id": i.trigger_run_id,
        "alert_id": i.alert_id,
        "rca_report": i.rca_report,
        "timeline": i.timeline,
        "resolved_by": i.resolved_by,
        "ttd_minutes": i.ttd_minutes,
        "ttr_minutes": i.ttr_minutes,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }


def _fmt_oncall(s: OncallSchedule) -> dict:
    return {
        "schedule_id": s.schedule_id,
        "domain_id": s.domain_id,
        "oncall_email": s.oncall_email,
        "oncall_slack": s.oncall_slack,
        "pagerduty_key": s.pagerduty_key,
        "effective_from": s.effective_from.isoformat() if s.effective_from else None,
        "effective_until": s.effective_until.isoformat() if s.effective_until else None,
        "timezone": s.timezone,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _fmt_runbook(r: IncidentRunbook) -> dict:
    return {
        "runbook_id": r.runbook_id,
        "rule_id": r.rule_id,
        "title": r.title,
        "steps": r.steps,
        "escalation_path": r.escalation_path,
        "related_dashboards": r.related_dashboards,
        "created_by": r.created_by,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ── Incidents ─────────────────────────────────────────────────────────────────

@router.get("/incidents")
async def list_incidents(
    status: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(QualityIncident, DataAsset.sf_table_name, DataAsset.sf_schema_name)
        .outerjoin(DataAsset, QualityIncident.asset_id == DataAsset.asset_id)
    )
    if status:
        q = q.where(QualityIncident.status == status)
    if asset_id:
        q = q.where(QualityIncident.asset_id == asset_id)
    if severity:
        q = q.where(QualityIncident.severity == severity)
    result = await db.execute(q.order_by(desc(QualityIncident.created_at)))
    rows = result.all()
    out = []
    for row in rows:
        incident, sf_table_name, sf_schema_name = row
        d = _fmt_incident(incident)
        d["asset_name"] = f"{sf_schema_name}.{sf_table_name}" if sf_table_name else None
        out.append(d)
    return out


@router.post("/incidents")
async def create_incident(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid, now as model_now
    incident = QualityIncident(
        incident_id=gen_uuid(),
        asset_id=body["asset_id"],
        title=body.get("title"),
        severity=body.get("severity", "medium"),
        status="open",
        trigger_run_id=body.get("trigger_run_id"),
        created_at=model_now(),
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return _fmt_incident(incident)


@router.get("/incidents/stats")
async def incident_stats(db: AsyncSession = Depends(get_db)):
    """MTTD avg, MTTR avg, open count, resolved-this-week, incident count by domain."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).replace(tzinfo=None)
    week_cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).replace(tzinfo=None)

    # MTTD and MTTR averages over last 30 days
    stats_result = await db.execute(
        select(
            func.avg(QualityIncident.ttd_minutes).label("avg_ttd"),
            func.avg(QualityIncident.ttr_minutes).label("avg_ttr"),
            func.count(QualityIncident.incident_id).label("total"),
        )
        .where(QualityIncident.created_at >= cutoff)
    )
    stats = stats_result.one()

    # Open incident count
    open_result = await db.execute(
        select(func.count(QualityIncident.incident_id))
        .where(QualityIncident.status == "open")
    )
    open_count = open_result.scalar_one() or 0

    # Resolved this week
    resolved_result = await db.execute(
        select(func.count(QualityIncident.incident_id))
        .where(QualityIncident.status == "resolved", QualityIncident.resolved_at >= week_cutoff)
    )
    resolved_this_week = resolved_result.scalar_one() or 0

    # Count by domain via asset join
    domain_result = await db.execute(
        select(DataAsset.domain_id, func.count(QualityIncident.incident_id).label("count"))
        .join(DataAsset, QualityIncident.asset_id == DataAsset.asset_id)
        .where(QualityIncident.created_at >= cutoff)
        .group_by(DataAsset.domain_id)
    )
    by_domain = [{"domain_id": row.domain_id, "count": row.count} for row in domain_result.all()]

    return {
        "period_days": 30,
        "open_count": int(open_count),
        "resolved_this_week": int(resolved_this_week),
        "total_incidents": int(stats.total),
        "avg_mttd_minutes": round(float(stats.avg_ttd), 1) if stats.avg_ttd else None,
        "avg_mttr_minutes": round(float(stats.avg_ttr), 1) if stats.avg_ttr else None,
        "by_domain": by_domain,
    }


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")
    return _fmt_incident(incident)


@router.put("/incidents/{incident_id}")
async def update_incident(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")
    for field in ("status", "title", "resolved_by", "rca_report", "timeline"):
        if field in body:
            setattr(incident, field, body[field])
    await db.commit()
    return _fmt_incident(incident)


@router.post("/incidents/{incident_id}/investigate")
async def investigate_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")
    incident.status = "investigating"
    await db.commit()
    return _fmt_incident(incident)


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")

    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    incident.status = "resolved"
    incident.resolved_at = now_dt
    incident.resolved_by = user.get("email")
    if incident.created_at:
        delta = now_dt - incident.created_at
        incident.ttr_minutes = int(delta.total_seconds() / 60)
    await db.commit()
    return _fmt_incident(incident)


# ── On-call schedules ─────────────────────────────────────────────────────────

@router.get("/oncall")
async def list_oncall(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OncallSchedule).order_by(OncallSchedule.effective_from))
    return [_fmt_oncall(s) for s in result.scalars().all()]


@router.post("/oncall")
async def create_oncall(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid
    schedule = OncallSchedule(
        schedule_id=gen_uuid(),
        domain_id=body.get("domain_id"),
        oncall_email=body["oncall_email"],
        oncall_slack=body.get("oncall_slack"),
        pagerduty_key=body.get("pagerduty_key"),
        effective_from=datetime.fromisoformat(body["effective_from"]),
        effective_until=datetime.fromisoformat(body["effective_until"]),
        timezone=body.get("timezone", "UTC"),
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return _fmt_oncall(schedule)


@router.delete("/oncall/{schedule_id}")
async def delete_oncall(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(OncallSchedule).where(OncallSchedule.schedule_id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(404, "Oncall schedule not found")
    await db.delete(schedule)
    await db.commit()
    return {"message": "Oncall schedule deleted"}


# ── Runbooks ──────────────────────────────────────────────────────────────────

@router.get("/runbooks")
async def list_runbooks(
    rule_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(IncidentRunbook)
    if rule_id:
        q = q.where(IncidentRunbook.rule_id == rule_id)
    result = await db.execute(q)
    return [_fmt_runbook(r) for r in result.scalars().all()]


@router.post("/runbooks")
async def create_runbook(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid
    runbook = IncidentRunbook(
        runbook_id=gen_uuid(),
        rule_id=body.get("rule_id"),
        title=body.get("title"),
        steps=body["steps"],
        escalation_path=body.get("escalation_path"),
        related_dashboards=body.get("related_dashboards"),
        created_by=user.get("email"),
    )
    db.add(runbook)
    await db.commit()
    await db.refresh(runbook)
    return _fmt_runbook(runbook)


@router.put("/runbooks/{runbook_id}")
async def update_runbook(
    runbook_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(IncidentRunbook).where(IncidentRunbook.runbook_id == runbook_id))
    runbook = result.scalar_one_or_none()
    if not runbook:
        raise HTTPException(404, "Runbook not found")
    for field in ("title", "steps", "escalation_path", "related_dashboards"):
        if field in body:
            setattr(runbook, field, body[field])
    await db.commit()
    return _fmt_runbook(runbook)


@router.delete("/runbooks/{runbook_id}")
async def delete_runbook(
    runbook_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(IncidentRunbook).where(IncidentRunbook.runbook_id == runbook_id))
    runbook = result.scalar_one_or_none()
    if not runbook:
        raise HTTPException(404, "Runbook not found")
    await db.delete(runbook)
    await db.commit()
    return {"message": "Runbook deleted"}
