from __future__ import annotations

"""Catalog service — search enrichment."""
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

logger = logging.getLogger("dq_platform.catalog")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def refresh_search_index(db: AsyncSession) -> int:
    """No-op on Snowflake — materialized views are not supported."""
    logger.info("catalog_search_index refresh skipped (not supported on Snowflake)")
    return 0


async def enrich_asset_results(asset_ids: list[str], db: AsyncSession) -> dict:
    """
    Return enrichment data keyed by asset_id:
      quality_score, trust_score, avg_rating,
      classification_tags (list[str]), tag_names (list[str])

    Returns {} for empty input.
    """
    if not asset_ids:
        return {}

    from app.db.models import DQQualityScore, AssetRating, DataClassification, AssetTag, Tag

    # -- Quality score: average per asset ---------------------------------
    score_result = await db.execute(
        select(
            DQQualityScore.asset_id,
            func.avg(DQQualityScore.quality_score).label("quality_score"),
        )
        .where(
            DQQualityScore.asset_id.in_(asset_ids),
            DQQualityScore.score_level == "table",
        )
        .group_by(DQQualityScore.asset_id)
    )
    quality_map: dict[str, float] = {
        r.asset_id: round(float(r.quality_score), 1)
        for r in score_result.all()
    }

    # -- Average rating per asset ----------------------------------------
    rating_result = await db.execute(
        select(
            AssetRating.asset_id,
            func.avg(AssetRating.rating).label("avg_rating"),
        )
        .where(AssetRating.asset_id.in_(asset_ids))
        .group_by(AssetRating.asset_id)
    )
    rating_map: dict[str, float] = {
        r.asset_id: round(float(r.avg_rating), 1)
        for r in rating_result.all()
    }

    # -- Classification tags per asset -----------------------------------
    class_result = await db.execute(
        select(DataClassification.asset_id, DataClassification.classification)
        .where(DataClassification.asset_id.in_(asset_ids))
    )
    class_map: dict[str, list[str]] = {}
    for r in class_result.all():
        class_map.setdefault(r.asset_id, [])
        if r.classification not in class_map[r.asset_id]:
            class_map[r.asset_id].append(r.classification)

    # -- Tag names per asset ---------------------------------------------
    tag_result = await db.execute(
        select(AssetTag.entity_id, Tag.tag_name)
        .join(Tag, AssetTag.tag_id == Tag.tag_id)
        .where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id.in_(asset_ids),
        )
    )
    tag_map: dict[str, list[str]] = {}
    for r in tag_result.all():
        tag_map.setdefault(r.entity_id, []).append(r.tag_name)

    # -- Compose result --------------------------------------------------
    enriched: dict[str, dict] = {}
    for aid in asset_ids:
        quality = quality_map.get(aid, 0.0)
        avg_rating = rating_map.get(aid, 0.0)
        trust = quality * 0.6 + (avg_rating / 5.0 * 100.0) * 0.2 + 20.0
        enriched[aid] = {
            "quality_score": quality if quality else None,
            "trust_score": round(trust, 1) if quality else None,
            "avg_rating": avg_rating or None,
            "classification_tags": class_map.get(aid, []),
            "tag_names": tag_map.get(aid, []),
        }
    return enriched
