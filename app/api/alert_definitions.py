from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone

from app.db.database import get_db
from app.db.models import AlertDefinition, Asset, Domain
from app.core.security import get_current_user

router = APIRouter(prefix="/alert-definitions", tags=["AlertDefinitions"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class NotificationChannelConfig(BaseModel):
    channel: str          # slack | email | teams | pagerduty | webhook
    address: str          # webhook URL, email address, Slack channel, etc.
    label: Optional[str] = None


class AlertDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: str = "rule_failure"  # rule_failure | score_drop | freshness_breach | anomaly
    threshold_value: Optional[float] = None
    asset_id: Optional[str] = None
    domain_id: Optional[str] = None
    severity_override: Optional[str] = None
    cooldown_minutes: int = 240
    notification_channels: Optional[list[dict]] = None


class AlertDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_type: Optional[str] = None
    threshold_value: Optional[float] = None
    asset_id: Optional[str] = None
    domain_id: Optional[str] = None
    severity_override: Optional[str] = None
    cooldown_minutes: Optional[int] = None
    notification_channels: Optional[list[dict]] = None
    is_active: Optional[bool] = None


# ── Serialiser ────────────────────────────────────────────────────────────────

def _fmt(d: AlertDefinition, asset_name: str = "", domain_name: str = "") -> dict:
    return {
        "definition_id":         d.definition_id,
        "name":                  d.name,
        "description":           d.description,
        "trigger_type":          d.trigger_type,
        "threshold_value":       d.threshold_value,
        "asset_id":              d.asset_id,
        "asset_name":            asset_name,
        "domain_id":             d.domain_id,
        "domain_name":           domain_name,
        "severity_override":     d.severity_override,
        "cooldown_minutes":      d.cooldown_minutes,
        "notification_channels": d.notification_channels or [],
        "is_active":             d.is_active,
        "triggered_count":       d.triggered_count,
        "last_fired_at":         d.last_fired_at.isoformat() if d.last_fired_at else None,
        "created_by":            d.created_by,
        "created_at":            d.created_at.isoformat(),
        "updated_at":            d.updated_at.isoformat(),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_alert_definitions(
    trigger_type: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    q = select(AlertDefinition)
    if trigger_type:
        q = q.where(AlertDefinition.trigger_type == trigger_type)
    if asset_id:
        q = q.where(AlertDefinition.asset_id == asset_id)
    if domain_id:
        q = q.where(AlertDefinition.domain_id == domain_id)
    if is_active is not None:
        q = q.where(AlertDefinition.is_active == is_active)
    result = await db.execute(q.order_by(desc(AlertDefinition.created_at)).limit(limit))
    defs = result.scalars().all()

    # Enrich with asset/domain names in one pass
    asset_ids = {d.asset_id for d in defs if d.asset_id}
    domain_ids = {d.domain_id for d in defs if d.domain_id}

    asset_map: dict[str, str] = {}
    if asset_ids:
        ar = await db.execute(select(Asset).where(Asset.asset_id.in_(asset_ids)))
        for a in ar.scalars().all():
            asset_map[a.asset_id] = a.display_name or a.sf_table_name or a.asset_id

    domain_map: dict[str, str] = {}
    if domain_ids:
        dr = await db.execute(select(Domain).where(Domain.domain_id.in_(domain_ids)))
        for d in dr.scalars().all():
            domain_map[d.domain_id] = d.domain_name

    return [
        _fmt(d, asset_map.get(d.asset_id, ""), domain_map.get(d.domain_id, ""))
        for d in defs
    ]


@router.post("", status_code=201)
async def create_alert_definition(
    body: AlertDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    valid_types = {"rule_failure", "score_drop", "freshness_breach", "anomaly"}
    if body.trigger_type not in valid_types:
        raise HTTPException(400, f"trigger_type must be one of {valid_types}")

    defn = AlertDefinition(
        name=body.name,
        description=body.description,
        trigger_type=body.trigger_type,
        threshold_value=body.threshold_value,
        asset_id=body.asset_id or None,
        domain_id=body.domain_id or None,
        severity_override=body.severity_override,
        cooldown_minutes=body.cooldown_minutes,
        notification_channels=body.notification_channels,
        is_active=True,
        created_by=getattr(user, "email", None) or getattr(user, "user_id", None),
    )
    db.add(defn)
    await db.commit()
    await db.refresh(defn)
    return _fmt(defn)


@router.get("/{definition_id}")
async def get_alert_definition(
    definition_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AlertDefinition).where(AlertDefinition.definition_id == definition_id))
    defn = result.scalar_one_or_none()
    if not defn:
        raise HTTPException(404, "Alert definition not found")

    asset_name = ""
    domain_name = ""
    if defn.asset_id:
        ar = await db.execute(select(Asset).where(Asset.asset_id == defn.asset_id))
        a = ar.scalar_one_or_none()
        if a:
            asset_name = a.display_name or a.sf_table_name or ""
    if defn.domain_id:
        dr = await db.execute(select(Domain).where(Domain.domain_id == defn.domain_id))
        d = dr.scalar_one_or_none()
        if d:
            domain_name = d.domain_name

    return _fmt(defn, asset_name, domain_name)


@router.put("/{definition_id}")
async def update_alert_definition(
    definition_id: str,
    body: AlertDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(AlertDefinition).where(AlertDefinition.definition_id == definition_id))
    defn = result.scalar_one_or_none()
    if not defn:
        raise HTTPException(404, "Alert definition not found")

    if body.name is not None:
        defn.name = body.name
    if body.description is not None:
        defn.description = body.description
    if body.trigger_type is not None:
        defn.trigger_type = body.trigger_type
    if body.threshold_value is not None:
        defn.threshold_value = body.threshold_value
    if body.asset_id is not None:
        defn.asset_id = body.asset_id or None
    if body.domain_id is not None:
        defn.domain_id = body.domain_id or None
    if body.severity_override is not None:
        defn.severity_override = body.severity_override
    if body.cooldown_minutes is not None:
        defn.cooldown_minutes = body.cooldown_minutes
    if body.notification_channels is not None:
        defn.notification_channels = body.notification_channels
    if body.is_active is not None:
        defn.is_active = body.is_active

    defn.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(defn)
    return _fmt(defn)


@router.delete("/{definition_id}", status_code=204)
async def delete_alert_definition(
    definition_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(AlertDefinition).where(AlertDefinition.definition_id == definition_id))
    defn = result.scalar_one_or_none()
    if not defn:
        raise HTTPException(404, "Alert definition not found")
    await db.delete(defn)
    await db.commit()
