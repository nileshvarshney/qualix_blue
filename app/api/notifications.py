from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.database import get_db
from app.core.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _fmt_notification(n) -> dict:
    return {
        "notification_id": n.notification_id,
        "user_email": n.user_email,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "is_read": n.is_read,
        "email_sent": n.email_sent,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    res = await db.execute(
        select(Notification)
        .where(Notification.user_email == user.get("email"))
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    return [_fmt_notification(n) for n in res.scalars().all()]


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    from fastapi import HTTPException
    res = await db.execute(
        select(Notification).where(
            Notification.notification_id == notification_id,
            Notification.user_email == user.get("email"),
        )
    )
    n = res.scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    await db.commit()
    return _fmt_notification(n)


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    await db.execute(
        update(Notification)
        .where(Notification.user_email == user.get("email"), Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
