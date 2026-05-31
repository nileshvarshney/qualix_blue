from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import AccessRequest
from app.core.security import get_current_user

router = APIRouter(prefix="/access-requests", tags=["Access Requests"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(r: AccessRequest) -> dict:
    return {
        "request_id": r.request_id,
        "asset_id": r.asset_id,
        "requester_email": r.requester_email,
        "reason": r.reason,
        "access_level": r.access_level,
        "status": r.status,
        "reviewer_email": r.reviewer_email,
        "review_note": r.review_note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.post("")
async def submit_access_request(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Submit a new access request for a data asset."""
    asset_id = payload.get("asset_id")
    reason = payload.get("reason")
    if not asset_id or not reason:
        raise HTTPException(422, "asset_id and reason are required")

    req = AccessRequest(
        request_id=str(uuid.uuid4()),
        asset_id=asset_id,
        requester_email=user.get("email"),
        reason=reason,
        access_level=payload.get("access_level", "read"),
        status="pending",
        reviewer_email=None,
        review_note=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return _fmt(req)


@router.get("")
async def list_access_requests(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List access requests. Admins see all; regular users see only their own."""
    q = select(AccessRequest)
    role = user.get("role")
    if role != "admin":
        q = q.where(AccessRequest.requester_email == user.get("email"))
    if status:
        q = q.where(AccessRequest.status == status)
    result = await db.execute(q.order_by(AccessRequest.created_at.desc()))
    return [_fmt(r) for r in result.scalars().all()]


@router.post("/{request_id}/approve")
async def approve_access_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Approve an access request. Requires admin, domain_owner, or data_owner role."""
    role = user.get("role")
    if role not in ("admin", "domain_owner", "data_owner"):
        raise HTTPException(403, "Requires admin, domain_owner, or data_owner role")

    result = await db.execute(
        select(AccessRequest).where(AccessRequest.request_id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Access request not found")
    if req.status != "pending":
        raise HTTPException(400, f"Request is already {req.status}")

    req.status = "approved"
    req.reviewer_email = user.get("email")
    req.updated_at = _now()
    await db.commit()
    return _fmt(req)


@router.post("/{request_id}/deny")
async def deny_access_request(
    request_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Deny an access request. Requires admin, domain_owner, or data_owner role."""
    role = user.get("role")
    if role not in ("admin", "domain_owner", "data_owner"):
        raise HTTPException(403, "Requires admin, domain_owner, or data_owner role")

    result = await db.execute(
        select(AccessRequest).where(AccessRequest.request_id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Access request not found")
    if req.status != "pending":
        raise HTTPException(400, f"Request is already {req.status}")

    req.status = "denied"
    req.reviewer_email = user.get("email")
    req.review_note = payload.get("review_note")
    req.updated_at = _now()
    await db.commit()
    return _fmt(req)
