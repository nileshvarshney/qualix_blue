from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import AssetUsage, AssetRating, DataAsset, DQQualityScore
from app.core.security import get_current_user

router = APIRouter(prefix="/assets", tags=["Usage & Ratings"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _thirty_days_ago() -> datetime:
    return _now() - timedelta(days=30)


@router.get("/{asset_id}/usage")
async def get_asset_usage(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Usage stats for the last 30 days, grouped by event_type."""
    cutoff = _thirty_days_ago()
    result = await db.execute(
        select(AssetUsage.event_type, func.count().label("count"))
        .where(
            AssetUsage.asset_id == asset_id,
            AssetUsage.created_at >= cutoff,
        )
        .group_by(AssetUsage.event_type)
    )
    stats = {row.event_type: row.count for row in result.all()}

    # Total count
    total_result = await db.execute(
        select(func.count())
        .select_from(AssetUsage)
        .where(
            AssetUsage.asset_id == asset_id,
            AssetUsage.created_at >= cutoff,
        )
    )
    total = total_result.scalar() or 0
    return {"asset_id": asset_id, "last_30_days_total": total, "by_event_type": stats}


@router.post("/{asset_id}/usage")
async def track_usage_event(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Track a usage event for an asset. user_email is set from JWT."""
    event_type = payload.get("event_type", "view")

    event = AssetUsage(
        usage_id=str(uuid.uuid4()),
        asset_id=asset_id,
        event_type=event_type,
        user_email=user.get("email"),
        created_at=_now(),
    )
    db.add(event)
    await db.commit()
    return {"usage_id": event.usage_id, "asset_id": asset_id, "event_type": event_type}


@router.post("/{asset_id}/rate")
async def rate_asset(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Submit or update a rating (1–5) for an asset."""
    rating_value = payload.get("rating")
    if rating_value is None:
        raise HTTPException(422, "rating is required")
    try:
        rating_int = int(rating_value)
    except (TypeError, ValueError):
        raise HTTPException(422, "rating must be an integer")
    if not (1 <= rating_int <= 5):
        raise HTTPException(422, "rating must be between 1 and 5")

    user_email = user.get("email")

    # Upsert: one rating per user per asset
    result = await db.execute(
        select(AssetRating).where(
            AssetRating.asset_id == asset_id,
            AssetRating.user_email == user_email,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.rating = rating_int
        existing.review = payload.get("review", existing.review)
        existing.updated_at = _now()
        await db.commit()
        row = existing
    else:
        row = AssetRating(
            rating_id=str(uuid.uuid4()),
            asset_id=asset_id,
            user_email=user_email,
            rating=rating_int,
            review=payload.get("review"),
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)

    return {
        "rating_id": row.rating_id,
        "asset_id": row.asset_id,
        "user_email": row.user_email,
        "rating": row.rating,
        "review": row.review,
    }


@router.get("/{asset_id}/rating")
async def get_asset_rating(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get average rating and recent reviews for an asset."""
    avg_result = await db.execute(
        select(func.avg(AssetRating.rating).label("avg_rating"), func.count().label("count"))
        .where(AssetRating.asset_id == asset_id)
    )
    row = avg_result.one()
    avg_rating = round(float(row.avg_rating), 2) if row.avg_rating else None

    reviews_result = await db.execute(
        select(AssetRating)
        .where(AssetRating.asset_id == asset_id)
        .order_by(desc(AssetRating.created_at))
        .limit(10)
    )
    reviews = [
        {
            "rating_id": r.rating_id,
            "user_email": r.user_email,
            "rating": r.rating,
            "review": r.review,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reviews_result.scalars().all()
    ]

    return {
        "asset_id": asset_id,
        "avg_rating": avg_rating,
        "rating_count": row.count,
        "recent_reviews": reviews,
    }


@router.get("/most-used")
async def most_used_assets(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Top 10 assets by usage count in the last 30 days."""
    cutoff = _thirty_days_ago()
    result = await db.execute(
        select(AssetUsage.asset_id, func.count().label("usage_count"))
        .where(AssetUsage.created_at >= cutoff)
        .group_by(AssetUsage.asset_id)
        .order_by(desc("usage_count"))
        .limit(10)
    )
    rows = result.all()

    asset_ids = [r.asset_id for r in rows]
    usage_map = {r.asset_id: r.usage_count for r in rows}

    assets_result = await db.execute(
        select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
    )
    assets_by_id = {a.asset_id: a for a in assets_result.scalars().all()}

    return [
        {
            "asset_id": asset_id,
            "usage_count": usage_map[asset_id],
            "sf_table_name": assets_by_id[asset_id].sf_table_name if asset_id in assets_by_id else None,
            "sf_schema_name": assets_by_id[asset_id].sf_schema_name if asset_id in assets_by_id else None,
        }
        for asset_id in asset_ids
    ]


@router.get("/most-trusted")
async def most_trusted_assets(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Top 10 assets by composite trust score: quality_score*0.6 + avg_rating/5*100*0.2 + 20."""
    # Get latest quality score per asset
    latest_scores_result = await db.execute(
        select(
            DQQualityScore.asset_id,
            func.avg(DQQualityScore.quality_score).label("avg_quality"),
        )
        .where(DQQualityScore.score_level == "table")
        .group_by(DQQualityScore.asset_id)
    )
    quality_map = {r.asset_id: float(r.avg_quality or 0) for r in latest_scores_result.all()}

    # Get average rating per asset
    ratings_result = await db.execute(
        select(AssetRating.asset_id, func.avg(AssetRating.rating).label("avg_rating"))
        .group_by(AssetRating.asset_id)
    )
    rating_map = {r.asset_id: float(r.avg_rating or 0) for r in ratings_result.all()}

    # Compute trust scores for assets that have at least a quality score
    scored = []
    for asset_id, quality in quality_map.items():
        avg_rating = rating_map.get(asset_id, 0.0)
        trust_score = quality * 0.6 + (avg_rating / 5.0 * 100.0) * 0.2 + 20.0
        scored.append({"asset_id": asset_id, "trust_score": round(trust_score, 2), "quality_score": quality, "avg_rating": avg_rating})

    scored.sort(key=lambda x: x["trust_score"], reverse=True)
    top10 = scored[:10]

    if not top10:
        return []

    asset_ids = [s["asset_id"] for s in top10]
    assets_result = await db.execute(
        select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
    )
    assets_by_id = {a.asset_id: a for a in assets_result.scalars().all()}

    return [
        {
            **s,
            "sf_table_name": assets_by_id[s["asset_id"]].sf_table_name if s["asset_id"] in assets_by_id else None,
            "sf_schema_name": assets_by_id[s["asset_id"]].sf_schema_name if s["asset_id"] in assets_by_id else None,
        }
        for s in top10
    ]
