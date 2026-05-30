from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import DataClassification
from app.core.security import get_current_user

router = APIRouter(prefix="/classifications", tags=["Classifications"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(c: DataClassification) -> dict:
    return {
        "classification_id": c.classification_id,
        "asset_id": c.asset_id,
        "column_name": c.column_name,
        "classification": c.classification,
        "justification": c.justification,
        "applied_by": c.applied_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("/assets/{asset_id}/classifications")
async def list_asset_classifications(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all data classifications for a given asset."""
    result = await db.execute(
        select(DataClassification).where(DataClassification.asset_id == asset_id)
    )
    return [_fmt(c) for c in result.scalars().all()]


@router.post("/assets/{asset_id}/classifications")
async def apply_classification(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Apply a data classification to an asset (optionally at column level)."""
    classification_value = payload.get("classification")
    if not classification_value:
        raise HTTPException(422, "classification is required")

    c = DataClassification(
        classification_id=str(uuid.uuid4()),
        asset_id=asset_id,
        column_name=payload.get("column_name"),
        classification=classification_value,
        justification=payload.get("justification"),
        applied_by=user.get("email"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _fmt(c)


@router.delete("/assets/{asset_id}/classifications/{classification_id}")
async def remove_classification(
    asset_id: str,
    classification_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Remove a data classification from an asset."""
    result = await db.execute(
        select(DataClassification).where(
            DataClassification.classification_id == classification_id,
            DataClassification.asset_id == asset_id,
        )
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Classification not found")
    await db.delete(c)
    await db.commit()
    return {"message": "Classification removed"}


@router.get("/summary")
async def classification_summary(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Count of classifications grouped by classification level/type."""
    result = await db.execute(
        select(DataClassification.classification, func.count().label("count"))
        .group_by(DataClassification.classification)
    )
    return {row.classification: row.count for row in result.all()}


@router.get("/pii-assets")
async def list_pii_assets(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all assets that have a PII classification."""
    result = await db.execute(
        select(DataClassification).where(
            DataClassification.classification.ilike("%pii%")
        )
    )
    classifications = result.scalars().all()

    # Deduplicate by asset_id
    seen = set()
    assets = []
    for c in classifications:
        if c.asset_id not in seen:
            seen.add(c.asset_id)
            assets.append({
                "asset_id": c.asset_id,
                "classification": c.classification,
                "column_name": c.column_name,
                "applied_by": c.applied_by,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
    return assets
