from __future__ import annotations
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import GlossaryTerm, GlossaryTermAsset, DataAsset, Domain
from app.core.security import get_current_user

router = APIRouter(prefix="/glossary", tags=["Glossary"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_term(
    term: GlossaryTerm,
    domain_name: Optional[str] = None,
    linked_asset_count: int = 0,
) -> dict:
    return {
        "term_id": term.term_id,
        "term_name": term.term_name,
        "definition": term.definition,
        "examples": term.examples,
        "synonyms": term.synonyms,
        "domain_id": term.domain_id,
        "domain_name": domain_name,
        "status": term.status,
        "owner_email": term.owner_email,
        "created_by": term.created_by,
        "linked_asset_count": linked_asset_count,
        "created_at": term.created_at.isoformat() if term.created_at else None,
        "updated_at": term.updated_at.isoformat() if term.updated_at else None,
    }


@router.get("/terms")
async def list_terms(
    domain_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List glossary terms with domain name and linked asset count."""
    q = select(GlossaryTerm)
    if domain_id:
        q = q.where(GlossaryTerm.domain_id == domain_id)
    if status:
        q = q.where(GlossaryTerm.status == status)
    if search:
        pattern = f"%{search}%"
        q = q.where(
            GlossaryTerm.term_name.ilike(pattern) | GlossaryTerm.definition.ilike(pattern)
        )
    result = await db.execute(q.order_by(GlossaryTerm.term_name).limit(limit).offset(offset))
    terms = result.scalars().all()

    # Batch-load domain names
    domain_ids = {t.domain_id for t in terms if t.domain_id}
    domain_map: dict = {}
    if domain_ids:
        d_result = await db.execute(
            select(Domain.domain_id, Domain.domain_name).where(Domain.domain_id.in_(domain_ids))
        )
        domain_map = {r.domain_id: r.domain_name for r in d_result.all()}

    # Batch-load linked asset counts
    term_ids = [t.term_id for t in terms]
    count_map: dict = {}
    if term_ids:
        c_result = await db.execute(
            select(GlossaryTermAsset.term_id, func.count().label("cnt"))
            .where(GlossaryTermAsset.term_id.in_(term_ids))
            .group_by(GlossaryTermAsset.term_id)
        )
        count_map = {r.term_id: r.cnt for r in c_result.all()}

    return [
        _fmt_term(t, domain_map.get(t.domain_id), count_map.get(t.term_id, 0))
        for t in terms
    ]


@router.post("/terms")
async def create_term(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new glossary term. Requires admin or domain_owner role."""
    role = user.get("role")
    if role not in ("admin", "domain_owner"):
        raise HTTPException(403, "Requires admin or domain_owner role")

    term = GlossaryTerm(
        term_id=str(uuid.uuid4()),
        term_name=payload.get("term_name"),
        definition=payload.get("definition"),
        examples=payload.get("examples") or None,
        synonyms=payload.get("synonyms") or None,
        domain_id=payload.get("domain_id") or None,
        status=payload.get("status", "active"),
        owner_email=payload.get("owner_email") or None,
        created_by=user.get("email"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return _fmt_term(term)


@router.get("/terms/{term_id}")
async def get_term(
    term_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get a glossary term with linked assets."""
    result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(404, "Glossary term not found")

    # Domain name
    domain_name = None
    if term.domain_id:
        d_res = await db.execute(
            select(Domain.domain_name).where(Domain.domain_id == term.domain_id)
        )
        row = d_res.first()
        domain_name = row[0] if row else None

    links_result = await db.execute(
        select(GlossaryTermAsset).where(GlossaryTermAsset.term_id == term_id)
    )
    links = links_result.scalars().all()

    linked_assets = []
    for link in links:
        asset_result = await db.execute(
            select(DataAsset).where(DataAsset.asset_id == link.asset_id)
        )
        asset = asset_result.scalar_one_or_none()
        linked_assets.append({
            "link_id": link.id,
            "asset_id": link.asset_id,
            "column_name": link.column_name,
            "sf_table_name": asset.sf_table_name if asset else None,
            "sf_schema_name": asset.sf_schema_name if asset else None,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        })

    return {
        **_fmt_term(term, domain_name, len(linked_assets)),
        "linked_assets": linked_assets,
    }


@router.put("/terms/{term_id}")
async def update_term(
    term_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a glossary term."""
    result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(404, "Glossary term not found")

    updatable = ("term_name", "definition", "examples", "synonyms", "domain_id", "status", "owner_email")
    for field in updatable:
        if field in payload:
            setattr(term, field, payload[field] or None if field in ("examples", "synonyms", "domain_id", "owner_email") else payload[field])
    term.updated_at = _now()
    await db.commit()
    await db.refresh(term)
    return _fmt_term(term)


@router.delete("/terms/{term_id}")
async def delete_term(
    term_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Soft-delete a glossary term by setting status to 'deprecated'."""
    result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(404, "Glossary term not found")
    term.status = "deprecated"
    term.updated_at = _now()
    await db.commit()
    return {"message": "Term deprecated"}


@router.post("/terms/{term_id}/link-asset")
async def link_asset(
    term_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Link a glossary term to a data asset (optionally at column level)."""
    result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(404, "Glossary term not found")

    asset_id = payload.get("asset_id")
    if not asset_id:
        raise HTTPException(422, "asset_id is required")

    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    if not asset_result.scalar_one_or_none():
        raise HTTPException(404, "Data asset not found")

    link = GlossaryTermAsset(
        id=str(uuid.uuid4()),
        term_id=term_id,
        asset_id=asset_id,
        column_name=payload.get("column_name") or None,
        created_by=user.get("email"),
        created_at=_now(),
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return {
        "link_id": link.id,
        "term_id": link.term_id,
        "asset_id": link.asset_id,
        "column_name": link.column_name,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.delete("/terms/{term_id}/link-asset/{link_id}")
async def unlink_asset(
    term_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Remove a glossary term to asset link."""
    result = await db.execute(
        select(GlossaryTermAsset).where(
            GlossaryTermAsset.id == link_id,
            GlossaryTermAsset.term_id == term_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link not found")
    await db.delete(link)
    await db.commit()
    return {"message": "Link removed"}


# ── Asset-scoped glossary route ────────────────────────────────────────────────
# Separate router (no prefix) so the path matches GET /assets/{asset_id}/glossary

asset_glossary_router = APIRouter(tags=["Glossary"])


@asset_glossary_router.get("/assets/{asset_id}/glossary")
async def list_asset_terms(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all glossary terms linked to a specific asset."""
    links_result = await db.execute(
        select(GlossaryTermAsset).where(GlossaryTermAsset.asset_id == asset_id)
    )
    links = links_result.scalars().all()

    terms = []
    for link in links:
        term_result = await db.execute(
            select(GlossaryTerm).where(GlossaryTerm.term_id == link.term_id)
        )
        term = term_result.scalar_one_or_none()
        if term:
            terms.append({
                "link_id": link.id,
                "column_name": link.column_name,
                **_fmt_term(term),
            })
    return terms
