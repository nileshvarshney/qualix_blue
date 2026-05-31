from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import AssetAnnouncement
from app.core.security import get_current_user

router = APIRouter(prefix="/announcements", tags=["Announcements"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(a: AssetAnnouncement) -> dict:
    return {
        "announcement_id": a.announcement_id,
        "title": a.title,
        "body": a.body,
        "announcement_type": a.announcement_type,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "is_active": a.is_active,
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
        "created_by": a.created_by,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.get("")
async def list_announcements(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List active, non-expired announcements with optional entity filters."""
    now = _now()
    q = select(AssetAnnouncement).where(
        AssetAnnouncement.is_active == True,  # noqa: E712
    )
    # Exclude expired announcements (expires_at IS NULL means never expires)
    q = q.where(
        (AssetAnnouncement.expires_at == None) | (AssetAnnouncement.expires_at > now)  # noqa: E711
    )
    if entity_type:
        q = q.where(AssetAnnouncement.entity_type == entity_type)
    if entity_id:
        q = q.where(AssetAnnouncement.entity_id == entity_id)
    result = await db.execute(q.order_by(AssetAnnouncement.created_at.desc()))
    return [_fmt(a) for a in result.scalars().all()]


@router.post("")
async def create_announcement(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create an announcement. Requires admin or domain_owner role."""
    role = user.get("role")
    if role not in ("admin", "domain_owner"):
        raise HTTPException(403, "Requires admin or domain_owner role")

    title = payload.get("title")
    body = payload.get("body")
    if not title or not body:
        raise HTTPException(422, "title and body are required")

    expires_at_raw = payload.get("expires_at")
    expires_at = None
    if expires_at_raw:
        try:
            expires_at = datetime.fromisoformat(str(expires_at_raw).replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            raise HTTPException(422, "expires_at must be a valid ISO 8601 datetime")

    ann = AssetAnnouncement(
        announcement_id=str(uuid.uuid4()),
        title=title,
        body=body,
        announcement_type=payload.get("announcement_type", "info"),
        entity_type=payload.get("entity_type"),
        entity_id=payload.get("entity_id"),
        is_active=True,
        expires_at=expires_at,
        created_by=user.get("email"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return _fmt(ann)


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update an announcement."""
    result = await db.execute(
        select(AssetAnnouncement).where(AssetAnnouncement.announcement_id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Announcement not found")

    updatable = ("title", "body", "announcement_type", "entity_type", "entity_id", "is_active")
    for field in updatable:
        if field in payload:
            setattr(ann, field, payload[field])

    if "expires_at" in payload:
        expires_at_raw = payload["expires_at"]
        if expires_at_raw is None:
            ann.expires_at = None
        else:
            try:
                ann.expires_at = datetime.fromisoformat(str(expires_at_raw).replace("Z", "+00:00")).replace(tzinfo=None)
            except (ValueError, TypeError):
                raise HTTPException(422, "expires_at must be a valid ISO 8601 datetime")

    ann.updated_at = _now()
    await db.commit()
    await db.refresh(ann)
    return _fmt(ann)


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Soft-delete an announcement by setting is_active to False."""
    result = await db.execute(
        select(AssetAnnouncement).where(AssetAnnouncement.announcement_id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Announcement not found")
    ann.is_active = False
    ann.updated_at = _now()
    await db.commit()
    return {"message": "Announcement deactivated"}
