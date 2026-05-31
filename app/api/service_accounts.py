from __future__ import annotations
from typing import Optional
"""
Service account management — machine-to-machine API key authentication.

API keys are formatted as:  sa_<8-char-prefix>_<32-char-secret>
Only the prefix and a bcrypt hash of the full key are stored; the plaintext
key is returned once at creation time and cannot be retrieved afterwards.

Usage in CI/CD / pipelines:
    curl -H "X-API-Key: sa_AbCd1234_..." https://dq-platform/rules
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_api_key, require_admin, get_current_user
from app.db.database import get_db
from app.db.models import ServiceAccount

logger = logging.getLogger("dq_platform.service_accounts")
router = APIRouter(prefix="/service-accounts", tags=["Service Accounts"])

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class SACreate(BaseModel):
    name: str
    description: Optional[str] = None
    role: str = "viewer"
    domain_id: Optional[str] = None


class SAResponse(BaseModel):
    sa_id: str
    name: str
    description: Optional[str]
    role: str
    domain_id: Optional[str]
    is_active: bool
    created_by: Optional[str]
    last_used_at: Optional[str]
    created_at: str


def _fmt(sa: ServiceAccount) -> dict:
    return {
        "sa_id": sa.sa_id,
        "name": sa.name,
        "description": sa.description,
        "role": sa.role,
        "domain_id": sa.domain_id,
        "is_active": sa.is_active,
        "created_by": sa.created_by,
        "last_used_at": sa.last_used_at.isoformat() if sa.last_used_at else None,
        "created_at": sa.created_at.isoformat(),
    }


@router.get("")
async def list_service_accounts(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(ServiceAccount).order_by(ServiceAccount.created_at.desc()))
    return [_fmt(sa) for sa in result.scalars().all()]


@router.post("", status_code=201)
async def create_service_account(
    payload: SACreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """
    Create a service account and return the API key.
    The key is shown **once** — store it securely.
    """
    # Validate role
    valid_roles = ("admin", "domain_owner", "data_owner", "viewer", "auditor")
    if payload.role not in valid_roles:
        raise HTTPException(400, f"Invalid role. Must be one of: {valid_roles}")

    # Check for duplicate name
    existing = await db.execute(select(ServiceAccount).where(ServiceAccount.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"A service account named '{payload.name}' already exists")

    full_key, prefix, key_hash = generate_api_key()

    sa = ServiceAccount(
        name=payload.name,
        description=payload.description,
        key_prefix=prefix,
        key_hash=key_hash,
        role=payload.role,
        domain_id=payload.domain_id,
        is_active=True,
        created_by=user.get("email"),
    )
    db.add(sa)
    await db.commit()
    await db.refresh(sa)

    logger.info(f"Service account '{sa.name}' created by {user.get('email')}")

    return {
        **_fmt(sa),
        "api_key": full_key,  # only returned at creation
        "warning": "Store this key now — it cannot be retrieved again.",
    }


@router.patch("/{sa_id}/rotate")
async def rotate_api_key(
    sa_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Invalidate the old key and issue a new one."""
    result = await db.execute(select(ServiceAccount).where(ServiceAccount.sa_id == sa_id))
    sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(404, "Service account not found")

    full_key, prefix, key_hash = generate_api_key()
    sa.key_prefix = prefix
    sa.key_hash = key_hash
    await db.commit()

    logger.info(f"API key rotated for service account '{sa.name}' by {user.get('email')}")
    return {
        **_fmt(sa),
        "api_key": full_key,
        "warning": "Store this key now — it cannot be retrieved again.",
    }


@router.patch("/{sa_id}")
async def update_service_account(
    sa_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(ServiceAccount).where(ServiceAccount.sa_id == sa_id))
    sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(404, "Service account not found")
    for field in ("description", "role", "domain_id", "is_active"):
        if field in payload:
            setattr(sa, field, payload[field])
    await db.commit()
    return _fmt(sa)


@router.delete("/{sa_id}", status_code=204)
async def delete_service_account(
    sa_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    result = await db.execute(select(ServiceAccount).where(ServiceAccount.sa_id == sa_id))
    sa = result.scalar_one_or_none()
    if not sa:
        raise HTTPException(404, "Service account not found")
    await db.delete(sa)
    await db.commit()
    logger.info(f"Service account '{sa.name}' deleted by {user.get('email')}")
