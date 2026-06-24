from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import EscalationPolicy
from app.core.security import get_current_user

router = APIRouter(prefix="/escalation-policies", tags=["Escalation Policies"])

VALID_SEVERITIES = {"critical", "high", "medium", "low", "all"}


def _fmt_policy(p: EscalationPolicy) -> dict:
    return {
        "policy_id": p.policy_id,
        "name": p.name,
        "description": p.description,
        "severity": p.severity,
        "steps": p.steps or [],
        "oncall_rotation": p.oncall_rotation or [],
        "repeat_interval_minutes": p.repeat_interval_minutes,
        "max_escalations": p.max_escalations,
        "is_active": p.is_active,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
async def list_policies(
    severity: str | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(EscalationPolicy)
    if severity is not None:
        if severity not in VALID_SEVERITIES:
            raise HTTPException(422, f"severity must be one of {sorted(VALID_SEVERITIES)}")
        q = q.where(EscalationPolicy.severity == severity)
    if is_active is not None:
        q = q.where(EscalationPolicy.is_active == is_active)
    q = q.order_by(EscalationPolicy.created_at.desc())
    result = await db.execute(q)
    return [_fmt_policy(p) for p in result.scalars().all()]


@router.post("", status_code=201)
async def create_policy(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    severity = body.get("severity", "all")
    if severity not in VALID_SEVERITIES:
        raise HTTPException(422, f"severity must be one of {sorted(VALID_SEVERITIES)}")

    steps = body.get("steps")
    if steps is not None and not isinstance(steps, list):
        raise HTTPException(422, "steps must be a list")

    policy = EscalationPolicy(
        name=name,
        description=body.get("description"),
        severity=severity,
        steps=steps,
        oncall_rotation=body.get("oncall_rotation"),
        repeat_interval_minutes=int(body.get("repeat_interval_minutes", 60)),
        max_escalations=int(body.get("max_escalations", 3)),
        is_active=body.get("is_active", True),
        created_by=user.email if user else None,
    )
    db.add(policy)
    await db.flush()
    await db.refresh(policy)
    return _fmt_policy(policy)


@router.get("/{policy_id}")
async def get_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(EscalationPolicy).where(EscalationPolicy.policy_id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Escalation policy not found")
    return _fmt_policy(policy)


@router.put("/{policy_id}")
async def update_policy(
    policy_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(EscalationPolicy).where(EscalationPolicy.policy_id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Escalation policy not found")

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            raise HTTPException(422, "name cannot be empty")
        policy.name = name
    if "description" in body:
        policy.description = body["description"]
    if "severity" in body:
        if body["severity"] not in VALID_SEVERITIES:
            raise HTTPException(422, f"severity must be one of {sorted(VALID_SEVERITIES)}")
        policy.severity = body["severity"]
    if "steps" in body:
        if body["steps"] is not None and not isinstance(body["steps"], list):
            raise HTTPException(422, "steps must be a list")
        policy.steps = body["steps"]
    if "oncall_rotation" in body:
        policy.oncall_rotation = body["oncall_rotation"]
    if "repeat_interval_minutes" in body:
        policy.repeat_interval_minutes = int(body["repeat_interval_minutes"])
    if "max_escalations" in body:
        policy.max_escalations = int(body["max_escalations"])
    if "is_active" in body:
        policy.is_active = bool(body["is_active"])

    await db.flush()
    await db.refresh(policy)
    return _fmt_policy(policy)


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(EscalationPolicy).where(EscalationPolicy.policy_id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Escalation policy not found")
    await db.delete(policy)
    await db.flush()
