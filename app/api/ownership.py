from __future__ import annotations

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import Asset, AuditLog
from app.core.security import get_current_user, require_permission

router = APIRouter(tags=["Ownership"])
logger = logging.getLogger("dq_platform.ownership")

_OWNERSHIP_FIELDS = frozenset({
    "owner_user_id", "owner_team_id", "steward_user_id",
    "owner_name", "owner_email",
    "technical_owner_name", "technical_owner_email",
})


def _ownership_dict(asset: Asset) -> dict:
    return {
        "asset_id": asset.asset_id,
        "owner_user_id": asset.owner_user_id,
        "owner_team_id": asset.owner_team_id,
        "steward_user_id": asset.steward_user_id,
        "owner_name": asset.owner_name,
        "owner_email": asset.owner_email,
        "technical_owner_name": asset.technical_owner_name,
        "technical_owner_email": asset.technical_owner_email,
    }


@router.get("/assets/{asset_id}/ownership")
async def get_asset_ownership(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return _ownership_dict(asset)


@router.put("/assets/{asset_id}/ownership")
async def set_asset_ownership(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_permission("manage_assets")),
):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, value in payload.items():
        if field in _OWNERSHIP_FIELDS:
            setattr(asset, field, value)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=user.get("email"),
        action="UPDATE",
        entity_type="ownership",
        entity_id=asset_id,
        new_value={k: v for k, v in payload.items() if k in _OWNERSHIP_FIELDS},
    ))
    await db.commit()
    logger.info(f"Ownership updated for asset {asset_id} by {user.get('email')}")
    return _ownership_dict(asset)
