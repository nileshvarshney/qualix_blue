from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import DataProduct, DataProductAsset, DataAsset, DQRuleRun
from app.core.security import get_current_user

router = APIRouter(prefix="/data-products", tags=["Data Products"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_product(p: DataProduct) -> dict:
    return {
        "product_id": p.product_id,
        "product_name": p.product_name,
        "description": p.description,
        "domain_id": p.domain_id,
        "status": p.status,
        "owner_email": p.owner_email,
        "version": p.version,
        "tags": p.tags,
        "readme": p.readme,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
async def list_data_products(
    domain_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all data products with optional filters."""
    q = select(DataProduct)
    if domain_id:
        q = q.where(DataProduct.domain_id == domain_id)
    if status:
        q = q.where(DataProduct.status == status)
    result = await db.execute(q.order_by(DataProduct.product_name).limit(limit).offset(offset))
    return [_fmt_product(p) for p in result.scalars().all()]


@router.post("")
async def create_data_product(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new data product."""
    product = DataProduct(
        product_id=str(uuid.uuid4()),
        product_name=payload.get("product_name"),
        description=payload.get("description"),
        domain_id=payload.get("domain_id") or None,
        status=payload.get("status", "draft"),
        owner_email=payload.get("owner_email"),
        version=payload.get("version", "1.0"),
        tags=payload.get("tags"),
        readme=payload.get("readme"),
        created_by=user.get("email"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return _fmt_product(product)


@router.get("/{product_id}")
async def get_data_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get a data product with its linked assets."""
    result = await db.execute(
        select(DataProduct).where(DataProduct.product_id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Data product not found")

    links_result = await db.execute(
        select(DataProductAsset).where(DataProductAsset.product_id == product_id)
    )
    links = links_result.scalars().all()

    asset_list = []
    for link in links:
        asset_result = await db.execute(
            select(DataAsset).where(DataAsset.asset_id == link.asset_id)
        )
        asset = asset_result.scalar_one_or_none()
        asset_list.append({
            "link_id": link.id,
            "asset_id": link.asset_id,
            "role": link.role,
            "sf_table_name": asset.sf_table_name if asset else None,
            "sf_schema_name": asset.sf_schema_name if asset else None,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        })

    return {**_fmt_product(product), "assets": asset_list}


@router.put("/{product_id}")
async def update_data_product(
    product_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a data product."""
    result = await db.execute(
        select(DataProduct).where(DataProduct.product_id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Data product not found")

    updatable = ("product_name", "description", "domain_id", "status", "owner_email", "version", "tags", "readme")
    for field in updatable:
        if field in payload:
            setattr(product, field, payload[field] or None if field == "domain_id" else payload[field])
    product.updated_at = _now()
    await db.commit()
    await db.refresh(product)
    return _fmt_product(product)


@router.post("/{product_id}/assets")
async def add_asset_to_product(
    product_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Add an asset to a data product."""
    result = await db.execute(
        select(DataProduct).where(DataProduct.product_id == product_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Data product not found")

    asset_id = payload.get("asset_id")
    if not asset_id:
        raise HTTPException(422, "asset_id is required")

    asset_result = await db.execute(
        select(DataAsset).where(DataAsset.asset_id == asset_id)
    )
    if not asset_result.scalar_one_or_none():
        raise HTTPException(404, "Data asset not found")

    link = DataProductAsset(
        id=str(uuid.uuid4()),
        product_id=product_id,
        asset_id=asset_id,
        role=payload.get("role"),
        created_at=_now(),
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return {
        "link_id": link.id,
        "product_id": link.product_id,
        "asset_id": link.asset_id,
        "role": link.role,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.delete("/{product_id}/assets/{link_id}")
async def remove_asset_from_product(
    product_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Remove an asset from a data product."""
    result = await db.execute(
        select(DataProductAsset).where(
            DataProductAsset.id == link_id,
            DataProductAsset.product_id == product_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Asset link not found")
    await db.delete(link)
    await db.commit()
    return {"message": "Asset removed from product"}


@router.get("/{product_id}/quality")
async def get_product_quality(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Aggregate quality score across all tables in a data product."""
    links_result = await db.execute(
        select(DataProductAsset).where(DataProductAsset.product_id == product_id)
    )
    links = links_result.scalars().all()
    if not links:
        raise HTTPException(404, "Data product not found or has no assets")

    asset_ids = [link.asset_id for link in links]

    # Compute quality from dq_rule_runs (the live source of truth)
    scores_result = await db.execute(
        select(
            DQRuleRun.asset_id,
            func.avg(DQRuleRun.quality_score).label("avg_score"),
            func.max(DQRuleRun.execution_end_time).label("last_run"),
            func.count(DQRuleRun.run_id).label("run_count"),
        )
        .where(
            DQRuleRun.asset_id.in_(asset_ids),
            DQRuleRun.quality_score.is_not(None),
        )
        .group_by(DQRuleRun.asset_id)
    )
    scores = scores_result.all()

    asset_scores = [
        {
            "asset_id": row.asset_id,
            "avg_score": round(float(row.avg_score), 2) if row.avg_score is not None else None,
            "last_run": row.last_run.isoformat() if row.last_run else None,
            "run_count": row.run_count,
        }
        for row in scores
    ]
    scored_count = len(asset_scores)
    overall_avg = (
        sum(s["avg_score"] for s in asset_scores if s["avg_score"] is not None) / scored_count
        if scored_count else None
    )

    return {
        "product_id": product_id,
        "overall_avg_quality_score": round(overall_avg, 2) if overall_avg is not None else None,
        "asset_count": len(asset_ids),
        "scored_asset_count": scored_count,
        "asset_scores": asset_scores,
    }


@router.delete("/{product_id}")
async def delete_data_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Soft-delete a data product by setting status to 'deprecated'."""
    result = await db.execute(
        select(DataProduct).where(DataProduct.product_id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Data product not found")
    product.status = "deprecated"
    product.updated_at = _now()
    await db.commit()
    return {"message": "Data product deprecated"}
