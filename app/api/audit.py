from __future__ import annotations
from typing import Optional
import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.database import get_db
from app.db.models import AuditLog
from app.core.security import get_current_user

router = APIRouter(prefix="/audit", tags=["Audit"])


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

    total_res = await db.execute(
        select(func.count()).select_from(AuditLog)
        .where(*[c for c in q.whereclause.clauses] if hasattr(q, 'whereclause') and q.whereclause is not None else [])
    )

    result = await db.execute(q.order_by(desc(AuditLog.created_at)).limit(limit).offset(offset))
    logs = result.scalars().all()
    return {
        "total": len(logs),
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
