from __future__ import annotations
from typing import Optional
import csv
import io
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.database import get_db
from app.db.models import AuditLog
from app.core.security import get_current_user, require_admin

router = APIRouter(prefix="/audit", tags=["Audit"])

_GOVERNED_TYPES = [
    "rule", "asset", "domain", "subdomain", "user", "connection",
    "schedule", "alert", "sla", "glossary_term", "governance_policy",
    "data_product", "data_contract", "masking_policy", "incident",
    "issue", "team", "tag", "classification",
]

_COMPLIANCE_ACTIONS = {"approve", "reject", "create", "update", "delete", "certify", "archive"}
_COMPLIANCE_ENTITY_TYPES = {"rule", "governance_policy", "glossary_term", "data_contract", "masking_policy"}


@router.get("")
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(AuditLog)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    if user_email:
        q = q.where(AuditLog.user_email == user_email)
    if action:
        q = q.where(AuditLog.action == action)

    count_res = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_res.scalar_one()

    result = await db.execute(q.order_by(desc(AuditLog.created_at)).limit(limit).offset(offset))
    logs = result.scalars().all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logs": [
            {
                "audit_id": l.audit_id, "user_email": l.user_email, "action": l.action,
                "entity_type": l.entity_type, "entity_id": l.entity_id,
                "old_value": l.old_value, "new_value": l.new_value,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
    }


@router.get("/export")
async def export_audit_csv(
    entity_type: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    days: int = Query(30, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Export audit logs as CSV for the given filters."""
    from datetime import timedelta
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    q = select(AuditLog).where(AuditLog.created_at >= since)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if user_email:
        q = q.where(AuditLog.user_email == user_email)
    if action:
        q = q.where(AuditLog.action == action)
    result = await db.execute(q.order_by(desc(AuditLog.created_at)).limit(10000))
    logs = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["audit_id", "user_email", "action", "entity_type", "entity_id", "created_at"])
    for log in logs:
        writer.writerow([
            log.audit_id, log.user_email or "", log.action,
            log.entity_type, log.entity_id or "",
            log.created_at.isoformat(),
        ])
    buf.seek(0)
    filename = f"dq_audit_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/summary")
async def audit_summary(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Count of audit events grouped by action type."""
    result = await db.execute(
        select(AuditLog.action, func.count().label("count"))
        .group_by(AuditLog.action)
        .order_by(func.count().desc())
    )
    return [{"action": row.action, "count": row.count} for row in result.all()]


@router.get("/verify")
async def verify_audit_integrity(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    """Re-compute SHA-256 hashes for all hashed audit log rows and report mismatches."""
    from app.db.models import _compute_audit_hash

    total_unverified_res = await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.log_hash.is_(None))
    )
    total_unverified = total_unverified_res.scalar_one()

    hashed_res = await db.execute(
        select(AuditLog).where(AuditLog.log_hash.isnot(None)).limit(10000)
    )
    hashed_logs = hashed_res.scalars().all()

    tampered_ids = [
        log.audit_id for log in hashed_logs
        if _compute_audit_hash(log) != log.log_hash
    ]

    return {
        "total_hashed": len(hashed_logs),
        "total_unverified": total_unverified,
        "intact": len(hashed_logs) - len(tampered_ids),
        "tampered": len(tampered_ids),
        "tampered_ids": tampered_ids,
    }


@router.get("/anomalies")
async def list_audit_anomalies(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Scan recent audit logs for suspicious patterns."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    window_end = datetime.now(timezone.utc).replace(tzinfo=None)
    anomalies = []

    # --- Pattern 1: bulk writes (≥50 actions from same user in any 1-hour window) ---
    bulk_res = await db.execute(
        select(AuditLog.user_email, func.count().label("cnt"))
        .where(
            AuditLog.created_at >= since,
            AuditLog.user_email.isnot(None),
        )
        .group_by(AuditLog.user_email)
        .having(func.count() >= 50)
    )
    for row in bulk_res.all():
        anomalies.append({
            "pattern": "bulk_writes",
            "severity": "medium",
            "user_email": row.user_email,
            "event_count": row.cnt,
            "window_start": since.isoformat(),
            "window_end": window_end.isoformat(),
            "description": f"{row.cnt} logged actions from {row.user_email} in last {hours}h",
        })

    # --- Pattern 2: rapid deletions (≥5 destructive actions in last 24h) ---
    destructive_actions = ("delete", "archive", "disable", "reject", "revoke")
    del_res = await db.execute(
        select(AuditLog.user_email, func.count().label("cnt"))
        .where(
            AuditLog.created_at >= since,
            AuditLog.user_email.isnot(None),
            func.lower(AuditLog.action).in_(destructive_actions),
        )
        .group_by(AuditLog.user_email)
        .having(func.count() >= 5)
    )
    for row in del_res.all():
        anomalies.append({
            "pattern": "rapid_deletions",
            "severity": "high",
            "user_email": row.user_email,
            "event_count": row.cnt,
            "window_start": since.isoformat(),
            "window_end": window_end.isoformat(),
            "description": f"{row.cnt} destructive actions from {row.user_email} in last {hours}h",
        })

    # --- Pattern 3: new user with high activity ---
    # Sub-query: first event per user
    first_seen_sq = (
        select(AuditLog.user_email, func.min(AuditLog.created_at).label("first_at"))
        .where(AuditLog.user_email.isnot(None))
        .group_by(AuditLog.user_email)
        .subquery()
    )
    seven_days_ago = window_end - timedelta(days=7)
    new_user_res = await db.execute(
        select(first_seen_sq.c.user_email, func.count(AuditLog.audit_id).label("cnt"))
        .join(AuditLog, AuditLog.user_email == first_seen_sq.c.user_email)
        .where(
            first_seen_sq.c.first_at >= seven_days_ago,
            AuditLog.created_at >= since,
        )
        .group_by(first_seen_sq.c.user_email)
        .having(func.count(AuditLog.audit_id) >= 20)
    )
    for row in new_user_res.all():
        anomalies.append({
            "pattern": "new_user_activity",
            "severity": "low",
            "user_email": row.user_email,
            "event_count": row.cnt,
            "window_start": since.isoformat(),
            "window_end": window_end.isoformat(),
            "description": f"New user {row.user_email} has {row.cnt} events in last {hours}h",
        })

    return anomalies


@router.get("/coverage")
async def audit_coverage(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Return audit coverage metrics — what % of governed entity types are being logged."""
    result = await db.execute(
        select(
            AuditLog.entity_type,
            func.count().label("event_count"),
            func.max(AuditLog.created_at).label("last_logged"),
        )
        .group_by(AuditLog.entity_type)
    )
    rows = result.all()
    logged_types = {r.entity_type: r for r in rows}

    by_type = []
    for gt in _GOVERNED_TYPES:
        row = logged_types.get(gt)
        by_type.append({
            "entity_type": gt,
            "event_count": row.event_count if row else 0,
            "last_logged": row.last_logged.isoformat() if row and row.last_logged else None,
        })

    covered = sum(1 for gt in _GOVERNED_TYPES if gt in logged_types and logged_types[gt].event_count > 0)
    total = len(_GOVERNED_TYPES)
    uncovered = [gt for gt in _GOVERNED_TYPES if gt not in logged_types or logged_types[gt].event_count == 0]

    return {
        "coverage_pct": round((covered / total) * 100) if total else 0,
        "covered_types": covered,
        "total_governed_types": total,
        "uncovered_types": uncovered,
        "by_type": by_type,
    }


@router.get("/evidence-report")
async def evidence_report(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Generate a structured audit evidence report for the given period."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    window_end = datetime.now(timezone.utc).replace(tzinfo=None)

    all_res = await db.execute(
        select(AuditLog).where(AuditLog.created_at >= since).order_by(desc(AuditLog.created_at)).limit(10000)
    )
    logs = all_res.scalars().all()

    # Aggregate by category
    by_category: dict[str, int] = {}
    for log in logs:
        by_category[log.entity_type] = by_category.get(log.entity_type, 0) + 1

    # Top users
    user_counts: dict[str, int] = {}
    for log in logs:
        if log.user_email and log.user_email != "system":
            user_counts[log.user_email] = user_counts.get(log.user_email, 0) + 1
    top_users = [
        {"user_email": u, "event_count": c}
        for u, c in sorted(user_counts.items(), key=lambda x: -x[1])[:10]
    ]

    # Active users (distinct non-system)
    active_users = len(user_counts)
    system_events = sum(1 for log in logs if not log.user_email or log.user_email == "system")

    # Compliance-relevant events
    compliance_events = [
        {
            "audit_id": log.audit_id,
            "user_email": log.user_email,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
        if log.action.lower() in _COMPLIANCE_ACTIONS
        and log.entity_type in _COMPLIANCE_ENTITY_TYPES
    ]

    # Failed events: we treat any action containing 'fail' or 'error' as failed
    failed_events = sum(
        1 for log in logs
        if "fail" in log.action.lower() or "error" in log.action.lower()
    )

    # Quick suspicious count: users with >50 events in this period
    suspicious_count = sum(1 for u, c in user_counts.items() if c >= 50)

    return {
        "generated_at": window_end.isoformat(),
        "period_days": days,
        "period_start": since.date().isoformat(),
        "period_end": window_end.date().isoformat(),
        "total_events": len(logs),
        "failed_events": failed_events,
        "active_users": active_users,
        "system_events": system_events,
        "events_by_category": by_category,
        "top_users": top_users,
        "compliance_relevant_events": compliance_events,
        "suspicious_event_count": suspicious_count,
    }
