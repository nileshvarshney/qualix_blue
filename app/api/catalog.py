from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, desc

from app.db.database import get_db
from app.db.models import (
    DataAsset, GlossaryTerm, DataProduct, AssetUsage,
    DQQualityScore, DataClassification, GlossaryTermAsset,
    Domain, AssetTag, Tag, SavedSearch,
)
from app.core.security import get_current_user, require_admin
from app.services.catalog_service import refresh_search_index, enrich_asset_results

router = APIRouter(prefix="/catalog", tags=["Catalog"])
logger = logging.getLogger("dq_platform.catalog")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


def _gen_id() -> str:
    return str(uuid.uuid4())


async def _domain_map(db: AsyncSession) -> dict:
    result = await db.execute(select(Domain.domain_id, Domain.domain_name))
    return {r.domain_id: r.domain_name for r in result.all()}


async def _search_via_ilike(
    db: AsyncSession,
    q: str,
    effective_type: Optional[str],
    domain_id: Optional[str],
    certification: Optional[str],
    limit: int,
    offset: int,
    owner: Optional[str] = None,
    restrict_asset_ids: Optional[set[str]] = None,
) -> tuple[list[dict], int]:
    """Snowflake-compatible ILIKE-based catalog search."""
    domain_names = await _domain_map(db)
    results: list[dict] = []
    pattern = f"%{q}%" if q else "%"

    if not effective_type or effective_type == "asset":
        q_stmt = select(DataAsset)
        if q:
            q_stmt = q_stmt.where(
                DataAsset.sf_table_name.ilike(pattern)
                | DataAsset.table_description.ilike(pattern)
                | DataAsset.owner_name.ilike(pattern)
            )
        if domain_id:
            q_stmt = q_stmt.where(DataAsset.domain_id == domain_id)
        if certification:
            q_stmt = q_stmt.where(DataAsset.certification_status == certification)
        if owner:
            q_stmt = q_stmt.where(
                DataAsset.owner_name.ilike(f"%{owner}%")
                | DataAsset.owner_email.ilike(f"%{owner}%")
            )
        if restrict_asset_ids is not None:
            q_stmt = q_stmt.where(DataAsset.asset_id.in_(restrict_asset_ids))
        for a in (await db.execute(q_stmt)).scalars().all():
            results.append({
                "entity_type": "asset", "id": a.asset_id,
                "name": a.sf_table_name, "description": a.table_description,
                "domain": domain_names.get(a.domain_id), "owner": a.owner_name or a.owner_email,
                "certification_status": a.certification_status,
                "quality_score": None, "trust_score": None, "avg_rating": None,
                "classification_tags": [], "tag_names": [],
            })

    if not effective_type or effective_type == "glossary":
        g_stmt = select(GlossaryTerm)
        if q:
            g_stmt = g_stmt.where(
                GlossaryTerm.term_name.ilike(pattern)
                | GlossaryTerm.definition.ilike(pattern)
            )
        if domain_id:
            g_stmt = g_stmt.where(GlossaryTerm.domain_id == domain_id)
        for t in (await db.execute(g_stmt)).scalars().all():
            results.append({
                "entity_type": "glossary", "id": t.term_id,
                "name": t.term_name, "description": t.definition,
                "domain": domain_names.get(t.domain_id), "owner": t.owner_email,
                "certification_status": None, "quality_score": None, "trust_score": None,
                "avg_rating": None, "classification_tags": [], "tag_names": [],
            })

    if not effective_type or effective_type == "data_product":
        p_stmt = select(DataProduct)
        if q:
            p_stmt = p_stmt.where(
                DataProduct.product_name.ilike(pattern)
                | DataProduct.description.ilike(pattern)
            )
        if domain_id:
            p_stmt = p_stmt.where(DataProduct.domain_id == domain_id)
        for p in (await db.execute(p_stmt)).scalars().all():
            results.append({
                "entity_type": "data_product", "id": p.product_id,
                "name": p.product_name, "description": p.description,
                "domain": domain_names.get(p.domain_id), "owner": p.owner_email,
                "certification_status": p.status, "quality_score": None, "trust_score": None,
                "avg_rating": None, "classification_tags": [], "tag_names": [],
            })

    total = len(results)
    return results[offset: offset + limit], total


@router.get("/search")
async def catalog_search(
    q: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    certification: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort: str = Query("relevance"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Full-text catalog search across assets, glossary terms, and data products."""
    effective_type = type or entity_type
    offset = (page - 1) * page_size

    # Resolve classification filter → entity_ids
    class_ids: Optional[set[str]] = None
    if classification:
        class_result = await db.execute(
            select(DataClassification.asset_id)
            .where(DataClassification.classification == classification)
        )
        class_ids = {r.asset_id for r in class_result.all()}

    # Resolve tag filter → entity_ids
    tag_ids: Optional[set[str]] = None
    if tag:
        tag_result = await db.execute(
            select(AssetTag.entity_id)
            .join(Tag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset", Tag.tag_name == tag)
        )
        tag_ids = {r.entity_id for r in tag_result.all()}

    # Early out for empty filter sets (intersection will be empty)
    if class_ids is not None and not class_ids:
        return {"results": [], "total": 0, "page": page, "page_size": page_size}
    if tag_ids is not None and not tag_ids:
        return {"results": [], "total": 0, "page": page, "page_size": page_size}

    # Combine asset ID restrictions from classification and tag filters
    restrict_asset_ids: Optional[set[str]] = None
    if class_ids is not None and tag_ids is not None:
        restrict_asset_ids = class_ids & tag_ids
        if not restrict_asset_ids:
            return {"results": [], "total": 0, "page": page, "page_size": page_size}
    elif class_ids is not None:
        restrict_asset_ids = class_ids
    elif tag_ids is not None:
        restrict_asset_ids = tag_ids

    # Fetch all matching results then paginate after sort + enrich
    all_results, _ = await _search_via_ilike(
        db, q or "", effective_type, domain_id, certification,
        limit=10000, offset=0,
        owner=owner, restrict_asset_ids=restrict_asset_ids,
    )

    # Enrich asset results
    asset_ids = [r["id"] for r in all_results if r["entity_type"] == "asset"]
    enrichment = await enrich_asset_results(asset_ids, db)
    _empty_enrich = {"quality_score": None, "trust_score": None, "avg_rating": None, "classification_tags": [], "tag_names": []}
    for r in all_results:
        if r["entity_type"] == "asset":
            r.update(enrichment.get(r["id"], _empty_enrich))
        else:
            r.update(_empty_enrich)

    # Sort
    if sort == "quality":
        all_results.sort(key=lambda x: x.get("quality_score") or 0, reverse=True)
    elif sort == "trust":
        all_results.sort(key=lambda x: x.get("trust_score") or 0, reverse=True)
    elif sort == "alphabetical":
        all_results.sort(key=lambda x: (x.get("name") or "").lower())
    elif sort == "alphabetical_desc":
        all_results.sort(key=lambda x: (x.get("name") or "").lower(), reverse=True)

    total = len(all_results)
    return {"results": all_results[offset: offset + page_size], "total": total, "page": page, "page_size": page_size}


@router.get("/facets")
async def catalog_facets(
    domain_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return sidebar facet counts."""

    async def _domain_counts():
        stmt = (
            select(Domain.domain_id, Domain.domain_name, func.count(DataAsset.asset_id).label("cnt"))
            .join(DataAsset, DataAsset.domain_id == Domain.domain_id)
            .where(DataAsset.is_active == True)  # noqa: E712
            .group_by(Domain.domain_id, Domain.domain_name)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"id": r.domain_id, "name": r.domain_name, "count": r.cnt} for r in res.all()]

    async def _classification_counts():
        stmt = (
            select(DataClassification.classification, func.count().label("cnt"))
            .group_by(DataClassification.classification)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"value": r.classification, "count": r.cnt} for r in res.all()]

    async def _certification_counts():
        stmt = (
            select(DataAsset.certification_status, func.count().label("cnt"))
            .where(
                DataAsset.is_active == True,  # noqa: E712
                DataAsset.certification_status.isnot(None),
            )
            .group_by(DataAsset.certification_status)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"value": r.certification_status, "count": r.cnt} for r in res.all()]

    async def _tag_counts():
        stmt = (
            select(Tag.tag_name, func.count(AssetTag.id).label("cnt"))
            .join(AssetTag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset")
            .group_by(Tag.tag_name)
            .order_by(desc("cnt"))
            .limit(20)
        )
        res = await db.execute(stmt)
        return [{"name": r.tag_name, "count": r.cnt} for r in res.all()]

    domains, classifications, certifications, tags = await asyncio.gather(
        _domain_counts(), _classification_counts(), _certification_counts(), _tag_counts()
    )
    return {
        "domains": domains,
        "classifications": classifications,
        "certifications": certifications,
        "tags": tags,
    }


@router.get("/assets/{asset_id}")
async def catalog_asset_detail(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Enriched single-asset detail for catalog view."""
    asset_result = await db.execute(
        select(DataAsset, Domain.domain_name)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(DataAsset.asset_id == asset_id)
    )
    row = asset_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset, domain_name = row

    enrichment = await enrich_asset_results([asset_id], db)
    enrich = enrichment.get(asset_id, {})

    # lineage counts removed - now uses data_object_relationships (object_id-based)
    upstream_count = 0
    downstream_count = 0

    return {
        "asset_id": asset.asset_id,
        "sf_table_name": asset.sf_table_name,
        "sf_schema_name": asset.sf_schema_name,
        "sf_database_name": asset.sf_database_name,
        "table_description": asset.table_description,
        "criticality": asset.criticality,
        "certification_status": asset.certification_status,
        "certified_by": asset.certified_by,
        "owner_name": asset.owner_name,
        "owner_email": asset.owner_email,
        "domain_id": asset.domain_id,
        "domain_name": domain_name,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
        "upstream_count": upstream_count,
        "downstream_count": downstream_count,
        **enrich,
    }


@router.post("/saved-searches")
async def create_saved_search(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    search_id = _gen_id()
    db.add(SavedSearch(
        search_id=search_id,
        user_email=user["email"],
        name=payload.get("name", "Saved search"),
        query=payload.get("query"),
        filters=payload.get("filters"),
    ))
    await db.commit()
    return {"search_id": search_id}


@router.get("/saved-searches")
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            SELECT search_id, name, query, filters, created_at
            FROM saved_searches
            WHERE user_email = :email
            ORDER BY created_at DESC
        """),
        {"email": user["email"]},
    )
    return [dict(r._mapping) for r in result.all()]


@router.delete("/saved-searches/{search_id}")
async def delete_saved_search(
    search_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = await db.execute(
        text("SELECT user_email FROM saved_searches WHERE search_id = :id"),
        {"id": search_id},
    )
    row = existing.first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    if row.user_email != user["email"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Cannot delete another user's saved search")
    await db.execute(
        text("DELETE FROM saved_searches WHERE search_id = :id"), {"id": search_id}
    )
    await db.commit()
    return {"deleted": search_id}


@router.post("/refresh", dependencies=[Depends(require_admin)])
async def refresh_catalog(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Manually trigger catalog_search_index refresh. Admin only."""
    ms = await refresh_search_index(db)
    return {"status": "refreshed", "duration_ms": ms}


@router.get("/popular")
async def catalog_popular(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    cutoff = _utcnow() - timedelta(days=30)
    domain_names = await _domain_map(db)
    usage_result = await db.execute(
        select(AssetUsage.asset_id, func.count().label("usage_count"))
        .where(AssetUsage.created_at >= cutoff)
        .group_by(AssetUsage.asset_id)
        .order_by(desc("usage_count"))
        .limit(10)
    )
    rows = usage_result.all()
    asset_ids = [r.asset_id for r in rows]
    usage_map = {r.asset_id: r.usage_count for r in rows}

    if asset_ids:
        assets = (await db.execute(
            select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
        )).scalars().all()
    else:
        # No usage data yet — show recently updated certified assets first,
        # then fall back to assets with descriptions, capped at 6.
        assets = (await db.execute(
            select(DataAsset)
            .where(DataAsset.is_active == True)  # noqa: E712
            .order_by(
                DataAsset.certification_status.isnot(None).desc(),
                DataAsset.table_description.isnot(None).desc(),
                desc(DataAsset.updated_at),
            )
            .limit(6)
        )).scalars().all()

    return [
        {
            "entity_type": "asset", "id": a.asset_id,
            "name": a.sf_table_name, "description": a.table_description,
            "domain": domain_names.get(a.domain_id),
            "owner": a.owner_name or a.owner_email,
            "usage_count": usage_map.get(a.asset_id, 0),
            "certification_status": a.certification_status,
        }
        for a in assets
    ]


@router.get("/recent")
async def catalog_recent(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataAsset).order_by(desc(DataAsset.updated_at)).limit(10)
    )
    return [
        {
            "asset_id": a.asset_id, "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name, "sf_database_name": a.sf_database_name,
            "domain_id": a.domain_id, "subdomain_id": a.subdomain_id,
            "table_description": a.table_description,
            "certification_status": a.certification_status,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in result.scalars().all()
    ]


@router.get("/domains/{domain_id}/assets")
async def catalog_domain_assets(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    assets = (await db.execute(
        select(DataAsset)
        .where(DataAsset.domain_id == domain_id, DataAsset.is_active == True)  # noqa: E712
        .order_by(DataAsset.sf_table_name)
    )).scalars().all()
    if not assets:
        return []
    asset_ids = [a.asset_id for a in assets]
    enrichment = await enrich_asset_results(asset_ids, db)

    term_result = await db.execute(
        select(GlossaryTermAsset.asset_id, func.count().label("term_count"))
        .where(GlossaryTermAsset.asset_id.in_(asset_ids))
        .group_by(GlossaryTermAsset.asset_id)
    )
    term_map = {r.asset_id: r.term_count for r in term_result.all()}

    return [
        {
            "asset_id": a.asset_id, "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name, "sf_database_name": a.sf_database_name,
            "table_description": a.table_description, "criticality": a.criticality,
            "certification_status": a.certification_status, "certified_by": a.certified_by,
            "owner_name": a.owner_name, "owner_email": a.owner_email,
            "term_count": term_map.get(a.asset_id, 0),
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            **enrichment.get(a.asset_id, {
                "quality_score": None, "trust_score": None, "avg_rating": None,
                "classification_tags": [], "tag_names": [],
            }),
        }
        for a in assets
    ]
