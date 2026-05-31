from __future__ import annotations
from typing import Optional
"""
Privacy Engineering API — §62
Masking policies and PII data management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import MaskingPolicy, DataAsset
from app.core.security import get_current_user, check_domain_access
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/privacy", tags=["Privacy"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)

MASKING_TYPES = {"full_mask", "partial_mask", "hash", "tokenize", "nullify"}


def _fmt(p: MaskingPolicy) -> dict:
    return {
        "policy_id": p.policy_id, "asset_id": p.asset_id, "column_name": p.column_name,
        "masking_type": p.masking_type, "applies_to_roles": p.applies_to_roles,
        "unmasked_roles": p.unmasked_roles, "created_by": p.created_by,
        "created_at": p.created_at.isoformat(),
    }


@router.get("/masking-policies")
async def list_masking_policies(
    asset_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List masking policies, optionally filtered by asset."""
    q = select(MaskingPolicy)
    if asset_id:
        asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
        if asset:
            check_domain_access(user, asset.domain_id)
        q = q.where(MaskingPolicy.asset_id == asset_id)
    result = await db.execute(q)
    return [_fmt(p) for p in result.scalars().all()]


@router.post("/masking-policies", status_code=201)
async def create_masking_policy(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create or replace a column masking policy."""
    asset_id    = payload.get("asset_id")
    column_name = payload.get("column_name")
    masking_type = payload.get("masking_type")

    if not asset_id or not column_name or not masking_type:
        raise HTTPException(400, "asset_id, column_name, and masking_type are required")
    if masking_type not in MASKING_TYPES:
        raise HTTPException(400, f"masking_type must be one of {sorted(MASKING_TYPES)}")

    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    # Upsert — replace existing policy for the same asset+column
    existing = (await db.execute(
        select(MaskingPolicy).where(
            MaskingPolicy.asset_id == asset_id,
            MaskingPolicy.column_name == column_name,
        )
    )).scalar_one_or_none()

    if existing:
        existing.masking_type    = masking_type
        existing.applies_to_roles = payload.get("applies_to_roles")
        existing.unmasked_roles  = payload.get("unmasked_roles")
        await db.commit()
        return _fmt(existing)

    policy = MaskingPolicy(
        policy_id=str(uuid.uuid4()),
        asset_id=asset_id,
        column_name=column_name,
        masking_type=masking_type,
        applies_to_roles=payload.get("applies_to_roles"),
        unmasked_roles=payload.get("unmasked_roles"),
        created_by=user.get("email"),
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return _fmt(policy)


@router.delete("/masking-policies/{policy_id}", status_code=204)
async def delete_masking_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    policy = (await db.execute(select(MaskingPolicy).where(MaskingPolicy.policy_id == policy_id))).scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == policy.asset_id))).scalar_one_or_none()
    if asset:
        check_domain_access(user, asset.domain_id)
    await db.delete(policy)
    await db.commit()


@router.get("/assets/{asset_id}/masking-summary")
async def masking_summary(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return masking coverage for a table — which columns are masked and how."""
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    result = await db.execute(select(MaskingPolicy).where(MaskingPolicy.asset_id == asset_id))
    policies = result.scalars().all()
    return {
        "asset_id": asset_id,
        "sf_table_name": asset.sf_table_name,
        "masked_column_count": len(policies),
        "policies": [_fmt(p) for p in policies],
    }


@router.get("/pii-exposure-report")
async def pii_exposure_report(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """
    Return tables that have PII classifications but no masking policies —
    i.e., PII data that is potentially unprotected.
    """
    from app.db.models import DataClassification
    from sqlalchemy import func

    # Tables with PII classification
    pii_res = await db.execute(
        select(DataClassification.asset_id).where(
            DataClassification.classification.in_(["PII", "SENSITIVE"])
        ).distinct()
    )
    pii_asset_ids = {r[0] for r in pii_res.all()}

    # Tables with at least one masking policy
    masked_res = await db.execute(
        select(MaskingPolicy.asset_id).distinct()
    )
    masked_asset_ids = {r[0] for r in masked_res.all()}

    unprotected = pii_asset_ids - masked_asset_ids

    results = []
    for asset_id in unprotected:
        asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
        if asset:
            results.append({
                "asset_id": asset_id,
                "sf_table_name": asset.sf_table_name,
                "domain_id": asset.domain_id,
                "risk": "PII data with no masking policy configured",
            })

    return {"unprotected_pii_tables": len(results), "assets": results}
