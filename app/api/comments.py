from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import AssetComment
from app.core.security import get_current_user

router = APIRouter(prefix="/comments", tags=["Collaboration"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(c: AssetComment) -> dict:
    return {
        "comment_id": c.comment_id,
        "entity_type": c.entity_type,
        "entity_id": c.entity_id,
        "body": c.body,
        "comment_type": c.comment_type,
        "parent_id": c.parent_id,
        "author_email": c.author_email,
        "author_name": c.author_name,
        "is_resolved": c.is_resolved,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("")
async def list_comments(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    comment_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List comments filtered by entity_type, entity_id, and/or comment_type."""
    q = select(AssetComment)
    if entity_type:
        q = q.where(AssetComment.entity_type == entity_type)
    if entity_id:
        q = q.where(AssetComment.entity_id == entity_id)
    if comment_type:
        q = q.where(AssetComment.comment_type == comment_type)
    result = await db.execute(
        q.order_by(AssetComment.created_at).limit(limit).offset(offset)
    )
    return [_fmt(c) for c in result.scalars().all()]


@router.post("")
async def create_comment(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new comment."""
    entity_type = payload.get("entity_type")
    entity_id = payload.get("entity_id")
    body = payload.get("body")
    if not entity_type or not entity_id or not body:
        raise HTTPException(422, "entity_type, entity_id, and body are required")

    comment = AssetComment(
        comment_id=str(uuid.uuid4()),
        entity_type=entity_type,
        entity_id=entity_id,
        body=body,
        comment_type=payload.get("comment_type", "general"),
        parent_id=payload.get("parent_id"),
        author_email=user.get("email"),
        author_name=user.get("full_name"),
        is_resolved=False,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _fmt(comment)


@router.put("/{comment_id}")
async def update_comment(
    comment_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Edit a comment. Users can edit their own; admins can edit any."""
    result = await db.execute(
        select(AssetComment).where(AssetComment.comment_id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, "Comment not found")

    is_admin = user.get("role") == "admin"
    is_author = comment.author_email == user.get("email")
    if not is_admin and not is_author:
        raise HTTPException(403, "You can only edit your own comments")

    if "body" in payload:
        comment.body = payload["body"]
    comment.updated_at = _now()
    await db.commit()
    await db.refresh(comment)
    return _fmt(comment)


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a comment. Users can delete their own; admins can delete any."""
    result = await db.execute(
        select(AssetComment).where(AssetComment.comment_id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, "Comment not found")

    is_admin = user.get("role") == "admin"
    is_author = comment.author_email == user.get("email")
    if not is_admin and not is_author:
        raise HTTPException(403, "You can only delete your own comments")

    await db.delete(comment)
    await db.commit()
    return {"message": "Comment deleted"}


@router.post("/{comment_id}/resolve")
async def resolve_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Mark a comment as resolved."""
    result = await db.execute(
        select(AssetComment).where(AssetComment.comment_id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, "Comment not found")
    comment.is_resolved = True
    comment.updated_at = _now()
    await db.commit()
    return {"message": "Comment resolved"}
