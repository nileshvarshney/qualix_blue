from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import AlertRoutingRule, MaintenanceWindow, FlapDetectionConfig
from app.core.security import get_current_user

router = APIRouter(prefix="/alert-routing", tags=["Alert Routing"])


# ─── Formatters ─────────────────────────────────────────────────────────────

def _fmt_rule(r: AlertRoutingRule) -> dict:
    return {
        "rule_id": r.rule_id,
        "name": r.name,
        "description": r.description,
        "priority": r.priority,
        "match_conditions": r.match_conditions or {},
        "notification_channels": r.notification_channels or [],
        "escalation_policy_id": r.escalation_policy_id,
        "is_active": r.is_active,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _fmt_window(w: MaintenanceWindow) -> dict:
    return {
        "window_id": w.window_id,
        "name": w.name,
        "description": w.description,
        "scope": w.scope or {},
        "start_at": w.start_at.isoformat() if w.start_at else None,
        "end_at": w.end_at.isoformat() if w.end_at else None,
        "recurrence": w.recurrence,
        "suppress_alerts": w.suppress_alerts,
        "suppress_scans": w.suppress_scans,
        "created_by": w.created_by,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def _fmt_flap(c: FlapDetectionConfig) -> dict:
    return {
        "config_id": c.config_id,
        "is_enabled": c.is_enabled,
        "flap_threshold": c.flap_threshold,
        "window_minutes": c.window_minutes,
        "suppress_duration_minutes": c.suppress_duration_minutes,
        "updated_by": c.updated_by,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


# ─── Routing Rules ───────────────────────────────────────────────────────────

@router.get("/rules")
async def list_rules(
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(AlertRoutingRule)
    if is_active is not None:
        q = q.where(AlertRoutingRule.is_active == is_active)
    q = q.order_by(AlertRoutingRule.priority.asc())
    result = await db.execute(q)
    return [_fmt_rule(r) for r in result.scalars().all()]


@router.post("/rules", status_code=201)
async def create_rule(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")

    priority = body.get("priority")
    if priority is None:
        count_result = await db.execute(select(func.count()).select_from(AlertRoutingRule))
        priority = (count_result.scalar() or 0) + 1

    rule = AlertRoutingRule(
        name=name,
        description=body.get("description"),
        priority=int(priority),
        match_conditions=body.get("match_conditions"),
        notification_channels=body.get("notification_channels"),
        escalation_policy_id=body.get("escalation_policy_id"),
        is_active=body.get("is_active", True),
        created_by=user.email if user else None,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return _fmt_rule(rule)


@router.get("/rules/{rule_id}")
async def get_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRoutingRule).where(AlertRoutingRule.rule_id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Routing rule not found")
    return _fmt_rule(rule)


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRoutingRule).where(AlertRoutingRule.rule_id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Routing rule not found")

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            raise HTTPException(422, "name cannot be empty")
        rule.name = name
    if "description" in body:
        rule.description = body["description"]
    if "priority" in body:
        rule.priority = int(body["priority"])
    if "match_conditions" in body:
        rule.match_conditions = body["match_conditions"]
    if "notification_channels" in body:
        rule.notification_channels = body["notification_channels"]
    if "escalation_policy_id" in body:
        rule.escalation_policy_id = body["escalation_policy_id"]
    if "is_active" in body:
        rule.is_active = bool(body["is_active"])

    await db.flush()
    await db.refresh(rule)
    return _fmt_rule(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRoutingRule).where(AlertRoutingRule.rule_id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Routing rule not found")
    await db.delete(rule)
    await db.flush()


# ─── Maintenance Windows ─────────────────────────────────────────────────────

VALID_RECURRENCES = {"none", "daily", "weekly", "monthly"}


@router.get("/maintenance-windows")
async def list_windows(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(MaintenanceWindow).order_by(MaintenanceWindow.start_at.asc())
    )
    return [_fmt_window(w) for w in result.scalars().all()]


@router.post("/maintenance-windows", status_code=201)
async def create_window(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    if not body.get("start_at") or not body.get("end_at"):
        raise HTTPException(422, "start_at and end_at are required")
    recurrence = body.get("recurrence", "none")
    if recurrence not in VALID_RECURRENCES:
        raise HTTPException(422, f"recurrence must be one of {sorted(VALID_RECURRENCES)}")

    from datetime import datetime
    try:
        start_at = datetime.fromisoformat(body["start_at"].replace("Z", "+00:00"))
        end_at = datetime.fromisoformat(body["end_at"].replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise HTTPException(422, "start_at and end_at must be ISO 8601 datetime strings")
    if end_at <= start_at:
        raise HTTPException(422, "end_at must be after start_at")

    window = MaintenanceWindow(
        name=name,
        description=body.get("description"),
        scope=body.get("scope"),
        start_at=start_at,
        end_at=end_at,
        recurrence=recurrence,
        suppress_alerts=body.get("suppress_alerts", True),
        suppress_scans=body.get("suppress_scans", False),
        created_by=user.email if user else None,
    )
    db.add(window)
    await db.flush()
    await db.refresh(window)
    return _fmt_window(window)


@router.get("/maintenance-windows/{window_id}")
async def get_window(
    window_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(MaintenanceWindow).where(MaintenanceWindow.window_id == window_id)
    )
    window = result.scalar_one_or_none()
    if not window:
        raise HTTPException(404, "Maintenance window not found")
    return _fmt_window(window)


@router.put("/maintenance-windows/{window_id}")
async def update_window(
    window_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(MaintenanceWindow).where(MaintenanceWindow.window_id == window_id)
    )
    window = result.scalar_one_or_none()
    if not window:
        raise HTTPException(404, "Maintenance window not found")

    from datetime import datetime
    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            raise HTTPException(422, "name cannot be empty")
        window.name = name
    if "description" in body:
        window.description = body["description"]
    if "scope" in body:
        window.scope = body["scope"]
    if "start_at" in body:
        try:
            window.start_at = datetime.fromisoformat(body["start_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(422, "start_at must be ISO 8601")
    if "end_at" in body:
        try:
            window.end_at = datetime.fromisoformat(body["end_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(422, "end_at must be ISO 8601")
    if "recurrence" in body:
        if body["recurrence"] not in VALID_RECURRENCES:
            raise HTTPException(422, f"recurrence must be one of {sorted(VALID_RECURRENCES)}")
        window.recurrence = body["recurrence"]
    if "suppress_alerts" in body:
        window.suppress_alerts = bool(body["suppress_alerts"])
    if "suppress_scans" in body:
        window.suppress_scans = bool(body["suppress_scans"])

    await db.flush()
    await db.refresh(window)
    return _fmt_window(window)


@router.delete("/maintenance-windows/{window_id}", status_code=204)
async def delete_window(
    window_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(MaintenanceWindow).where(MaintenanceWindow.window_id == window_id)
    )
    window = result.scalar_one_or_none()
    if not window:
        raise HTTPException(404, "Maintenance window not found")
    await db.delete(window)
    await db.flush()


# ─── Flap Detection (singleton) ──────────────────────────────────────────────

@router.get("/flap-detection")
async def get_flap_detection(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(FlapDetectionConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        return {
            "config_id": None,
            "is_enabled": True,
            "flap_threshold": 3,
            "window_minutes": 30,
            "suppress_duration_minutes": 60,
            "updated_by": None,
            "updated_at": None,
        }
    return _fmt_flap(config)


@router.put("/flap-detection")
async def update_flap_detection(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(FlapDetectionConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config:
        config = FlapDetectionConfig(
            is_enabled=body.get("is_enabled", True),
            flap_threshold=int(body.get("flap_threshold", 3)),
            window_minutes=int(body.get("window_minutes", 30)),
            suppress_duration_minutes=int(body.get("suppress_duration_minutes", 60)),
            updated_by=user.email if user else None,
        )
        db.add(config)
    else:
        if "is_enabled" in body:
            config.is_enabled = bool(body["is_enabled"])
        if "flap_threshold" in body:
            config.flap_threshold = int(body["flap_threshold"])
        if "window_minutes" in body:
            config.window_minutes = int(body["window_minutes"])
        if "suppress_duration_minutes" in body:
            config.suppress_duration_minutes = int(body["suppress_duration_minutes"])
        config.updated_by = user.email if user else None

    await db.flush()
    await db.refresh(config)
    return _fmt_flap(config)
