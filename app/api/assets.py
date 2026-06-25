from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.database import get_db
from app.db.models import (
    Asset, Domain, Subdomain, AuditLog, SnowflakeConnection, AssetSourceMeta,
    AssetDocument, AssetOwner, Tag, AssetTag, DQQualityScore, ColumnMetadata,
)
from app.schemas.asset import (
    AssetCreate, AssetUpdate, AssetResponse, AssetCertifyRequest,
    AssetStatusUpdate, AssetRegistryDiscoveryRequest, AssetTreeNode,
    AssetSourceMetaResponse, LogicalDatasetCreate,
    AssetDocumentCreate, AssetDocumentResponse, AssetOwnerCreate, AssetOwnerResponse,
)
from app.services.asset_registry import register_logical_dataset
from app.core.security import get_current_user, get_domain_filter
import uuid
from datetime import datetime, timezone
import logging

logger = logging.getLogger("dq_platform.assets")
router = APIRouter(prefix="/asset-registry", tags=["Asset Registry"])


class ColumnMetaPatch(BaseModel):
    description: str = Field(..., max_length=2000)


_BULK_ALLOWED_FIELDS = frozenset({
    "criticality", "certification_status", "is_active",
    "domain_id", "subdomain_id", "owner_name",
})


class BulkUpdatePayload(BaseModel):
    asset_ids: list[str] = Field(..., min_length=1)
    patch: dict[str, str] = Field(..., min_length=1)


# Snowflake browse is handled by /connections/:id/databases|schemas|tables


@router.get("/enriched")
async def list_assets_enriched(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Returns assets joined with domain, subdomain, and connection names."""
    effective_domain = get_domain_filter(user) or domain_id
    q = (
        select(Asset, Domain, Subdomain, AssetSourceMeta)
        .join(Domain, Asset.domain_id == Domain.domain_id)
        .join(Subdomain, Asset.subdomain_id == Subdomain.subdomain_id)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .order_by(Asset.display_name, Asset.physical_name)
    )
    if effective_domain:
        q = q.where(Asset.domain_id == effective_domain)
    if subdomain_id:
        q = q.where(Asset.subdomain_id == subdomain_id)
    if connection_id:
        q = q.where(Asset.connection_id == connection_id)
    rows = (await db.execute(q)).all()

    # Bulk-fetch connection names for assets that have one
    conn_ids = {asset.connection_id for asset, _, _, _ in rows if asset.connection_id}
    conn_map: dict[str, str] = {}
    if conn_ids:
        conn_result = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.connection_id.in_(conn_ids))
        )
        for c in conn_result.scalars().all():
            conn_map[c.connection_id] = c.connection_name

    asset_ids = [asset.asset_id for asset, _, _, _ in rows]

    # Bulk-fetch latest quality score per asset
    score_map: dict[str, float] = {}
    if asset_ids:
        subq = (
            select(
                DQQualityScore.asset_id,
                func.max(DQQualityScore.score_date).label("latest_date"),
            )
            .where(
                DQQualityScore.asset_id.in_(asset_ids),
                DQQualityScore.score_level == "asset",
            )
            .group_by(DQQualityScore.asset_id)
            .subquery()
        )
        score_res = await db.execute(
            select(DQQualityScore.asset_id, DQQualityScore.quality_score)
            .join(
                subq,
                (DQQualityScore.asset_id == subq.c.asset_id)
                & (DQQualityScore.score_date == subq.c.latest_date),
            )
            .where(DQQualityScore.score_level == "asset")
        )
        score_map = {r.asset_id: r.quality_score for r in score_res.all()}

    # Bulk-fetch tag names per asset
    tag_map: dict[str, list[str]] = {}
    if asset_ids:
        tag_res = await db.execute(
            select(AssetTag.entity_id, Tag.tag_name)
            .join(Tag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset", AssetTag.entity_id.in_(asset_ids))
        )
        for r in tag_res.all():
            tag_map.setdefault(r.entity_id, []).append(r.tag_name)

    return [
        {
            "asset_id": asset.asset_id,
            "connection_id": asset.connection_id,
            "connection_name": conn_map.get(asset.connection_id) if asset.connection_id else None,
            "sf_database_name": meta.sf_database_name if meta else None,
            "sf_schema_name": meta.sf_schema_name if meta else None,
            "sf_table_name": meta.sf_table_name if meta else asset.physical_name,
            "table_description": asset.description,
            "table_type": meta.sf_table_type if meta else None,
            "criticality": asset.criticality,
            "owner_name": asset.owner_name,
            "owner_email": asset.owner_email,
            "technical_owner_name": asset.technical_owner_name,
            "technical_owner_email": asset.technical_owner_email,
            "certification_status": asset.certification_status,
            "certified_by": asset.certified_by,
            "is_active": asset.is_active,
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "subdomain_id": subdomain.subdomain_id,
            "subdomain_name": subdomain.subdomain_name,
            "created_at": asset.created_at.isoformat(),
            "quality_score": score_map.get(asset.asset_id),
            "tag_names": tag_map.get(asset.asset_id, []),
        }
        for asset, domain, subdomain, meta in rows
    ]


@router.post("", response_model=AssetResponse)
async def create_asset(payload: AssetCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = Asset(asset_id=str(uuid.uuid4()), **payload.model_dump())
    db.add(asset)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="CREATE",
                    entity_type="asset", entity_id=asset.asset_id, new_value=payload.model_dump()))
    await db.commit()
    await db.refresh(asset)
    # Auto-trigger column profiling in the background for the newly registered table
    try:
        import asyncio as _asyncio
        from app.api.columns import _run_column_profile
        from app.services import job_tracker as _jt
        _job_id = _jt.create_job(job_type="column_profile", total=0, meta={"asset_id": asset.asset_id, "trigger": "auto_register"})
        _asyncio.create_task(_run_column_profile(_job_id, asset.asset_id))
        logger.info("Auto-triggered column profiling for new asset %s (%s)", asset.asset_id, asset.sf_table_name)
    except Exception as _e:
        logger.warning("Could not auto-trigger profiling for %s: %s", asset.asset_id, _e)
    return asset


@router.get("")
async def list_assets(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func as sqlfunc
    q = select(Asset)
    if domain_id:
        q = q.where(Asset.domain_id == domain_id)
    if subdomain_id:
        q = q.where(Asset.subdomain_id == subdomain_id)
    if connection_id:
        q = q.where(Asset.connection_id == connection_id)
    if is_active is not None:
        q = q.where(Asset.is_active == is_active)
    total = (await db.execute(select(sqlfunc.count()).select_from(q.subquery()))).scalar() or 0
    joined_q = (
        select(Asset, AssetSourceMeta)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .order_by(AssetSourceMeta.sf_database_name, AssetSourceMeta.sf_schema_name, AssetSourceMeta.sf_table_name)
        .limit(limit).offset(offset)
    )
    if domain_id:
        joined_q = joined_q.where(Asset.domain_id == domain_id)
    if subdomain_id:
        joined_q = joined_q.where(Asset.subdomain_id == subdomain_id)
    if connection_id:
        joined_q = joined_q.where(Asset.connection_id == connection_id)
    if is_active is not None:
        joined_q = joined_q.where(Asset.is_active == is_active)
    rows = (await db.execute(joined_q)).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "asset_id": a.asset_id,
                "connection_id": a.connection_id,
                "sf_database_name": m.sf_database_name if m else None,
                "sf_schema_name": m.sf_schema_name if m else None,
                "sf_table_name": m.sf_table_name if m else a.physical_name,
                "table_type": m.sf_table_type if m else None,
                "table_description": a.description,
                "criticality": a.criticality,
                "certification_status": a.certification_status,
                "is_active": a.is_active,
                "row_count": m.row_count if m else None,
                "bytes": m.bytes if m else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            }
            for a, m in rows
        ],
    }


@router.get("/search")
async def search_assets(
    q: Optional[str] = None,
    asset_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_
    query = select(Asset)
    if q:
        query = query.where(
            or_(
                Asset.physical_name.ilike(f"%{q}%"),
                Asset.display_name.ilike(f"%{q}%"),
                Asset.qualified_name.ilike(f"%{q}%"),
            )
        )
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    if status:
        query = query.where(Asset.status == status)
    query = query.limit(limit)
    result = await db.execute(query)
    assets = result.scalars().all()
    return [AssetResponse.model_validate(a) for a in assets]


@router.get("/tree")
async def get_asset_tree(
    source_id: Optional[str] = None,
    depth: int = 3,
    db: AsyncSession = Depends(get_db),
):
    from app.db.models import AssetSourceMeta as _ASM

    # Fetch source assets for ACTIVE connections only
    src_query = (
        select(Asset)
        .join(SnowflakeConnection, Asset.connection_id == SnowflakeConnection.connection_id)
        .where(
            Asset.asset_type == "source",
            SnowflakeConnection.is_active == True,
        )
    )
    if source_id:
        src_query = src_query.where(Asset.connection_id == source_id)
    src_result = await db.execute(src_query)
    sources = src_result.scalars().all()

    tree = []
    for source in sources:
        conn_id = source.connection_id or source.asset_id

        # Load all active tables for this connection in one query
        tbl_result = await db.execute(
            select(Asset, _ASM)
            .join(_ASM, Asset.asset_id == _ASM.asset_id)
            .where(
                Asset.connection_id == conn_id,
                Asset.asset_type == "table",
                Asset.is_active == True,
            )
            .order_by(_ASM.sf_database_name, _ASM.sf_schema_name, Asset.physical_name)
        )
        rows = tbl_result.all()

        # Group: db_name -> schema_name -> [assets]
        db_map: dict[str, dict[str, list]] = {}
        for asset, meta in rows:
            db_name = meta.sf_database_name or "UNKNOWN"
            schema_name = meta.sf_schema_name or "UNKNOWN"
            db_map.setdefault(db_name, {}).setdefault(schema_name, []).append(asset)

        db_nodes = []
        for db_name, schema_map in sorted(db_map.items()):
            schema_nodes = []
            if depth >= 2:
                for schema_name, table_assets in sorted(schema_map.items()):
                    table_nodes = []
                    if depth >= 3:
                        table_nodes = [
                            AssetTreeNode(
                                asset_id=a.asset_id,
                                display_name=a.display_name or a.physical_name,
                                physical_name=a.physical_name,
                                asset_type=a.asset_type,
                                status=a.status,
                                qualified_name=a.qualified_name,
                            )
                            for a in table_assets
                        ]
                    schema_nodes.append(AssetTreeNode(
                        asset_id=f"sc|{conn_id}|{db_name}|{schema_name}",
                        display_name=schema_name,
                        physical_name=schema_name,
                        asset_type="schema",
                        status="active",
                        qualified_name=f"schema:{conn_id}:{db_name}:{schema_name}",
                        children=table_nodes,
                    ))
            db_nodes.append(AssetTreeNode(
                asset_id=f"db|{conn_id}|{db_name}",
                display_name=db_name,
                physical_name=db_name,
                asset_type="database",
                status="active",
                qualified_name=f"database:{conn_id}:{db_name}",
                children=schema_nodes,
            ))

        tree.append(AssetTreeNode(
            asset_id=source.asset_id,
            display_name=source.display_name or source.physical_name,
            physical_name=source.physical_name,
            asset_type=source.asset_type,
            status=source.status,
            qualified_name=source.qualified_name,
            children=db_nodes,
        ))

    return tree


@router.post("/logical-datasets", response_model=AssetResponse, status_code=201)
async def create_logical_dataset(
    payload: LogicalDatasetCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a user-defined logical dataset placeholder asset."""
    from sqlalchemy import select as _select
    from app.db.models import Asset as _Asset
    asset_id = await register_logical_dataset(
        slug=payload.slug,
        display_name=payload.display_name,
        description=payload.description,
        owner_user_id=payload.owner_user_id,
        domain_id=payload.domain_id,
        parent_asset_id=payload.parent_asset_id,
        db=db,
    )
    result = await db.execute(_select(_Asset).where(_Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=500, detail="Logical dataset creation failed")
    return AssetResponse.model_validate(asset)


@router.post("/bulk-update")
async def bulk_update_assets(
    payload: BulkUpdatePayload,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Apply a partial patch to multiple assets at once."""
    asset_ids = payload.asset_ids
    patch = payload.patch

    invalid = set(patch.keys()) - _BULK_ALLOWED_FIELDS
    if invalid:
        raise HTTPException(422, f"Invalid patch fields: {sorted(invalid)}")

    result = await db.execute(select(Asset).where(Asset.asset_id.in_(asset_ids)))
    assets = result.scalars().all()
    found_ids = {a.asset_id for a in assets}
    missing = set(asset_ids) - found_ids
    if missing:
        raise HTTPException(404, f"Assets not found: {sorted(missing)[:5]}")

    _now = datetime.now(timezone.utc).replace(tzinfo=None)
    for asset in assets:
        old_vals = {k: getattr(asset, k, None) for k in patch}
        for field, value in patch.items():
            setattr(asset, field, value)
        asset.updated_at = _now
        db.add(AuditLog(
            audit_id=str(uuid.uuid4()),
            user_email=user.get("email"),
            action="BULK_UPDATE",
            entity_type="asset",
            entity_id=asset.asset_id,
            old_value=old_vals,
            new_value=patch,
        ))
    await db.commit()
    return {"updated": len(assets)}


@router.get("/{asset_id}/history")
async def get_asset_history(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the last 50 audit log entries for an asset, newest first."""
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Asset not found")

    logs_res = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "asset", AuditLog.entity_id == asset_id)
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    )
    logs = logs_res.scalars().all()

    entries = []
    for log in logs:
        old = log.old_value or {}
        new = log.new_value or {}
        changed_fields = list(set(old.keys()) & set(new.keys()))
        entries.append({
            "audit_id": log.audit_id,
            "action": log.action,
            "user_email": log.user_email,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "changed_fields": changed_fields,
            "old_value": old,
            "new_value": new,
        })
    return entries


@router.patch("/{asset_id}/column-meta/{column_name}")
async def patch_column_meta(
    asset_id: str,
    column_name: str,
    payload: ColumnMetaPatch,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a single column's metadata (currently: description)."""
    result = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset_id,
            ColumnMetadata.column_name == column_name,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(404, "Column metadata not found")
    col.description = payload.description
    col.updated_by = user.get("email")
    col.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(col)
    return {"col_id": col.col_id, "column_name": col.column_name, "description": col.description}


@router.get("/{asset_id}")
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    if asset_id.startswith("db|"):
        parts = asset_id.split("|", 2)
        if len(parts) == 3:
            _, conn_id, db_name = parts
            conn = (await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )).scalar_one_or_none()
            return {
                "asset_id": asset_id, "asset_type": "database",
                "display_name": db_name, "physical_name": db_name,
                "status": "active", "criticality": "medium",
                "connection_id": conn_id,
                "connection_name": conn.connection_name if conn else None,
            }

    if asset_id.startswith("sc|"):
        parts = asset_id.split("|", 3)
        if len(parts) == 4:
            _, conn_id, db_name, schema_name = parts
            conn = (await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )).scalar_one_or_none()
            return {
                "asset_id": asset_id, "asset_type": "schema",
                "display_name": schema_name, "physical_name": schema_name,
                "status": "active", "criticality": "medium",
                "connection_id": conn_id,
                "connection_name": conn.connection_name if conn else None,
                "qualified_name": f"{db_name}.{schema_name}",
            }

    result = await db.execute(
        select(Asset, SnowflakeConnection)
        .outerjoin(SnowflakeConnection, Asset.connection_id == SnowflakeConnection.connection_id)
        .where(Asset.asset_id == asset_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "Asset not found")
    asset, conn = row
    data = AssetResponse.model_validate(asset).model_dump()
    data['connection_name'] = conn.connection_name if conn else None
    return data


@router.get("/{asset_id}/children")
async def get_asset_children(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
    from app.db.models import AssetSourceMeta as _ASM

    # Virtual database node: "db|{conn_id}|{db_name}"
    if asset_id.startswith("db|"):
        parts = asset_id.split("|", 2)
        if len(parts) == 3:
            _, conn_id, db_name = parts
            result = await db.execute(
                select(_ASM.sf_schema_name)
                .join(Asset, Asset.asset_id == _ASM.asset_id)
                .where(
                    Asset.connection_id == conn_id,
                    _ASM.sf_database_name == db_name,
                    Asset.asset_type == "table",
                    Asset.is_active == True,
                )
                .distinct()
                .order_by(_ASM.sf_schema_name)
            )
            return [
                AssetTreeNode(
                    asset_id=f"sc|{conn_id}|{db_name}|{row[0]}",
                    display_name=row[0],
                    physical_name=row[0],
                    asset_type="schema",
                    status="active",
                    qualified_name=f"schema:{conn_id}:{db_name}:{row[0]}",
                )
                for row in result.all()
                if row[0]
            ]

    # Virtual schema node: "sc|{conn_id}|{db_name}|{schema_name}"
    if asset_id.startswith("sc|"):
        parts = asset_id.split("|", 3)
        if len(parts) == 4:
            _, conn_id, db_name, schema_name = parts
            result = await db.execute(
                select(Asset, _ASM)
                .join(_ASM, Asset.asset_id == _ASM.asset_id)
                .where(
                    Asset.connection_id == conn_id,
                    _ASM.sf_database_name == db_name,
                    _ASM.sf_schema_name == schema_name,
                    Asset.asset_type.in_(["table", "view"]),
                    Asset.is_active == True,
                )
                .order_by(Asset.physical_name)
            )
            return [
                AssetTreeNode(
                    asset_id=a.asset_id,
                    display_name=a.display_name or a.physical_name,
                    physical_name=a.physical_name,
                    asset_type="view" if meta and meta.sf_table_type in ("VIEW", "MATERIALIZED_VIEW") else "table",
                    status=a.status,
                    qualified_name=a.qualified_name,
                )
                for a, meta in result.all()
            ]

    # Real asset: check if it's a source asset and build DB hierarchy
    src_result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = src_result.scalar_one_or_none()
    if asset and asset.asset_type == "source":
        conn_id = asset.connection_id or asset.asset_id
        db_result = await db.execute(
            select(_ASM.sf_database_name)
            .join(Asset, Asset.asset_id == _ASM.asset_id)
            .where(
                Asset.connection_id == conn_id,
                Asset.asset_type == "table",
                Asset.is_active == True,
            )
            .distinct()
            .order_by(_ASM.sf_database_name)
        )
        return [
            AssetTreeNode(
                asset_id=f"db|{conn_id}|{row[0]}",
                display_name=row[0],
                physical_name=row[0],
                asset_type="database",
                status="active",
                qualified_name=f"database:{conn_id}:{row[0]}",
            )
            for row in db_result.all()
            if row[0]
        ]

    # Generic fallback: parent_asset_id lookup
    result = await db.execute(
        select(Asset).where(Asset.parent_asset_id == asset_id)
    )
    children = result.scalars().all()
    return [AssetResponse.model_validate(c) for c in children]


@router.get("/{asset_id}/ancestors")
async def get_asset_ancestors(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
    ancestors = []
    current_id = asset_id
    visited = set()
    while current_id and current_id not in visited:
        visited.add(current_id)
        result = await db.execute(
            select(Asset).where(Asset.asset_id == current_id)
        )
        asset = result.scalar_one_or_none()
        if not asset:
            break
        ancestors.append(AssetResponse.model_validate(asset))
        current_id = asset.parent_asset_id
    # Return from root to leaf (reverse, excluding the asset itself)
    ancestors.reverse()
    return ancestors[:-1] if ancestors else []


@router.patch("/{asset_id}/status")
async def update_asset_status(
    asset_id: str,
    body: AssetStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    from app.services.asset_registry import transition_status as _transition_status
    result = await db.execute(
        select(Asset).where(Asset.asset_id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        asset.status = _transition_status(asset.status, body.status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()
    await db.refresh(asset)
    return AssetResponse.model_validate(asset)


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: str, payload: AssetUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Enforcement check — must come after field mutation, before commit
    from app.services.enforcement_service import check_asset_enforcement
    enforcement = await check_asset_enforcement(asset, db)
    if enforcement["blocked"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Update blocked by enforced policy violations",
                "violations": enforcement["blocking_violations"],
                "warnings": enforcement["warnings"],
            },
        )

    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    asset.is_active = False
    asset.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"message": "Asset deactivated"}


@router.get("/{asset_id}/columns")
async def get_asset_columns(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return column metadata. Uses profiled stats from column_metadata when available,
    otherwise falls back to live Snowflake INFORMATION_SCHEMA.

    Column profile values (samples, top_values, min/max) are masked for callers whose
    role falls below the configured minimum for PII or Confidential-tagged columns.
    """
    from app.db.models import ColumnMetadata, DataClassification
    from app.services.config_service import get_value as _get_cfg
    import json as _json

    # ── Role-rank lookup for column-level access control ─────────────────────
    _ROLE_RANK: dict[str, int] = {
        "admin": 100, "data_owner": 60, "data_engineer": 60, "data_steward": 60,
        "domain_owner": 50, "analyst": 30, "auditor": 20, "viewer": 10,
    }
    _user_rank = _ROLE_RANK.get(user.get("role", "viewer"), 10)

    pii_min_role = await _get_cfg("security.column_access_pii_min_role", db) or "data_steward"
    conf_min_role = await _get_cfg("security.column_access_confidential_min_role", db) or "analyst"
    _pii_rank  = _ROLE_RANK.get(pii_min_role, 60)
    _conf_rank = _ROLE_RANK.get(conf_min_role, 30)

    _SENSITIVE_CLASSIFICATIONS = {"PII", "SENSITIVE", "CONFIDENTIAL", "RESTRICTED"}
    _HIGH_CLASSIFICATIONS = {"PII", "SENSITIVE"}

    def _should_mask(classification: str | None) -> tuple[bool, str]:
        """Return (should_mask, reason). Admins are never masked."""
        if not classification or _user_rank >= 100:
            return False, ""
        cls = classification.upper()
        if cls in _HIGH_CLASSIFICATIONS and _user_rank < _pii_rank:
            return True, f"Column classified as {classification} — requires {pii_min_role} role or higher"
        if cls in {"CONFIDENTIAL", "RESTRICTED"} and _user_rank < _conf_rank:
            return True, f"Column classified as {classification} — requires {conf_min_role} role or higher"
        return False, ""

    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    base = {"table": f"{asset.sf_schema_name}.{asset.sf_table_name}"}

    # ── Priority 1: profiled data from column_metadata ───────────────────────
    prof_res = await db.execute(
        select(ColumnMetadata)
        .where(ColumnMetadata.asset_id == asset_id)
        .order_by(ColumnMetadata.ordinal_position)
    )
    profiled = prof_res.scalars().all()

    # Fetch column-level classifications (severity-ordered so PII wins over SENSITIVE etc.)
    cls_res = await db.execute(
        select(DataClassification).where(DataClassification.asset_id == asset_id)
    )
    _SEVERITY = {'PII': 4, 'SENSITIVE': 3, 'CONFIDENTIAL': 2, 'RESTRICTED': 1, 'PUBLIC': 0}
    _cls_rows = sorted(cls_res.scalars().all(), key=lambda r: _SEVERITY.get(r.classification, 0))
    classifications: dict[str, str] = {
        r.column_name: r.classification for r in _cls_rows if r.column_name
    }

    if profiled:
        def _to_dict(c: ColumnMetadata) -> dict:
            top = _json.loads(c.top_values)    if c.top_values    else None
            smp = _json.loads(c.sample_values) if c.sample_values else None
            cls = classifications.get(c.column_name)
            masked, mask_reason = _should_mask(cls)
            return {
                "column_id":        c.col_id,
                "column_name":      c.column_name,
                "data_type":        c.data_type,
                "ordinal_position": c.ordinal_position,
                "is_nullable":      c.is_nullable,
                "is_primary_key":   c.is_primary_key,
                "description":      c.description,
                "null_pct":         None,          # computed below when total known
                "null_count":       c.null_count,
                "distinct_count":   c.unique_count,
                "cardinality_pct":  c.cardinality_pct,
                "min_value":        None if masked else c.min_value,
                "max_value":        None if masked else c.max_value,
                "mean":             None if masked else c.avg_value,
                "std_dev":          None if masked else c.std_dev,
                "top_values":       None if masked else top,
                "sample_values":    None if masked else smp,
                "last_profiled_at": c.last_profiled_at.isoformat() + 'Z' if c.last_profiled_at else None,
                "classification":   cls,
                **({"_masked": True, "_masked_reason": mask_reason} if masked else {}),
            }

        # Derive total_rows: unique_count / (cardinality_pct/100) for any column that has both
        total_rows = 0
        for c in profiled:
            if c.unique_count and c.cardinality_pct and c.cardinality_pct > 0:
                total_rows = round(c.unique_count / (c.cardinality_pct / 100))
                break

        cols = [_to_dict(c) for c in profiled]
        # Back-fill null_pct now that we have total_rows
        if total_rows > 0:
            for col_dict, col_rec in zip(cols, profiled):
                if col_rec.null_count is not None and not col_dict.get("_masked"):
                    col_dict["null_pct"] = round(col_rec.null_count / total_rows * 100, 2)
        return {**base, "columns": cols}

    # ── Priority 2: live Snowflake INFORMATION_SCHEMA fallback ───────────────
    if not asset.connection_id:
        return {**base, "columns": [], "message": "No profiling data yet. Click 'Profile Columns' to gather stats."}

    conn_result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == asset.connection_id)
    )
    conn = conn_result.scalar_one_or_none()
    if not conn:
        return {**base, "columns": [], "message": "Connection not found"}

    try:
        import re, snowflake.connector
        from app.core.encryption import decrypt
        from app.api.connections import _decrypt_password
        _ident = re.compile(r'^[A-Za-z0-9_$]+$')
        schema_safe = asset.sf_schema_name if _ident.match(asset.sf_schema_name or "") else ""
        table_safe  = asset.sf_table_name  if _ident.match(asset.sf_table_name  or "") else ""
        if not schema_safe or not table_safe:
            return {**base, "columns": [], "error": "Invalid schema or table name"}

        kwargs: dict = dict(account=conn.account, user=conn.sf_user,
                            password=_decrypt_password(conn), warehouse=conn.warehouse)
        if conn.role:
            kwargs["role"] = conn.role
        database = asset.sf_database_name or conn.default_database
        db_safe = database if (database and _ident.match(database)) else None
        if db_safe:
            kwargs["database"] = db_safe

        sf = snowflake.connector.connect(**kwargs)
        cur = sf.cursor()
        db_prefix = f'"{db_safe}".' if db_safe else ""
        cur.execute(f"""
            SELECT column_name, data_type, is_nullable, ordinal_position
            FROM {db_prefix}INFORMATION_SCHEMA.COLUMNS
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
              AND UPPER(table_name)   = '{table_safe.upper()}'
            ORDER BY ordinal_position
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return {**base, "columns": [dict(zip(col_names, r)) for r in rows]}
    except Exception as e:
        logger.warning("Failed to fetch columns for asset %s: %s", asset_id, e)
        return {**base, "columns": [], "error": str(e)}


@router.post("/discovery", status_code=202)
async def start_discovery(
    payload: AssetRegistryDiscoveryRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Kick off an auto-discovery job. Returns job_id immediately; client polls GET /assets/discovery/jobs/{job_id}."""
    from app.services import job_tracker
    from app.services.discovery_service import run_discovery

    job_data = payload.model_dump()
    job_data["triggered_by"] = user.get("email")

    job_id = job_tracker.create_job(
        job_type="auto_discovery",
        total=len(payload.selections),
        meta={"connection_id": payload.connection_id, "triggered_by": user.get("email")},
    )
    background_tasks.add_task(run_discovery, job_id, job_data)
    return {"job_id": job_id, "status": "queued", "poll_url": f"/assets/discovery/jobs/{job_id}"}


@router.get("/discovery/jobs/{job_id}")
async def get_discovery_job(job_id: str, user: dict = Depends(get_current_user)):
    """Poll for auto-discovery job status and per-table results."""
    from app.services import job_tracker
    job = job_tracker.get_job(job_id)
    if not job:
        raise HTTPException(404, "Discovery job not found or expired")
    return job


@router.post("/{asset_id}/refresh-stats")
async def refresh_asset_stats(asset_id: str, db: AsyncSession = Depends(get_db)):
    """Pull current row_count and bytes from Snowflake INFORMATION_SCHEMA and persist them."""
    import asyncio as _asyncio
    from sqlalchemy.orm import selectinload
    from app.services.discovery_service import _browse_tables_sync, _validate_ident

    result = await db.execute(
        select(Asset).options(selectinload(Asset.source_meta)).where(Asset.asset_id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if not asset.connection_id:
        raise HTTPException(status_code=400, detail="Asset has no associated connection; cannot fetch live stats")

    conn_result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == asset.connection_id)
    )
    conn = conn_result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    meta = asset.source_meta
    if not meta or not meta.sf_database_name or not meta.sf_schema_name:
        raise HTTPException(status_code=400, detail="Asset has no source metadata; cannot refresh stats")

    try:
        db_safe     = _validate_ident(meta.sf_database_name, "database")
        schema_safe = _validate_ident(meta.sf_schema_name, "schema")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        tables = await _asyncio.to_thread(_browse_tables_sync, conn, db_safe, schema_safe)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Snowflake error: {e}")

    match = next((t for t in tables if t["table_name"].upper() == (meta.sf_table_name or "").upper()), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Table {meta.sf_table_name!r} not found in {db_safe}.{schema_safe}")

    meta.row_count  = match.get("row_count")
    meta.bytes      = match.get("bytes")
    meta.sf_table_type = match.get("table_type")
    meta.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return {
        "asset_id":  asset_id,
        "row_count": meta.row_count,
        "bytes":     meta.bytes,
        "message":   "Stats refreshed from Snowflake",
    }


@router.post("/{asset_id}/certify", response_model=AssetResponse)
async def certify_asset(
    asset_id: str,
    payload: AssetCertifyRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Set the certification status of a table asset."""
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    certifier = payload.certified_by or user.get("email", "unknown")
    asset.certification_status = payload.certification_status
    asset.certified_by = certifier
    asset.certified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    asset.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="CERTIFY", entity_type="asset", entity_id=asset_id,
        new_value={"certification_status": payload.certification_status, "certified_by": certifier},
    ))
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/{asset_id}/generate-description")
async def generate_asset_description_endpoint(
    asset_id: str,
    provider_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """AI-generate a business description for this asset and save it."""
    from app.services.asset_registry import generate_description
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Asset not found")
    description = await generate_description(asset_id, db, provider_name)
    return {"asset_id": asset_id, "description": description}


@router.get("/{asset_id}/effective-description")
async def get_effective_description(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return this asset's description, or the nearest ancestor's if own is empty."""
    from app.services.asset_registry import effective_description
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    desc = await effective_description(asset_id, db)
    source = "own" if asset.description else "inherited"
    return {"asset_id": asset_id, "description": desc, "source": source}


async def _get_asset_or_404(asset_id: str, db: AsyncSession) -> Asset:
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


# ── Documentation links ───────────────────────────────────────────────────────

@router.get("/{asset_id}/documents", response_model=list[AssetDocumentResponse])
async def list_asset_documents(asset_id: str, db: AsyncSession = Depends(get_db)):
    await _get_asset_or_404(asset_id, db)
    result = await db.execute(
        select(AssetDocument).where(AssetDocument.asset_id == asset_id).order_by(AssetDocument.created_at)
    )
    return result.scalars().all()


@router.post("/{asset_id}/documents", response_model=AssetDocumentResponse)
async def create_asset_document(
    asset_id: str,
    payload: AssetDocumentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)
    doc = AssetDocument(
        doc_id=str(uuid.uuid4()),
        asset_id=asset_id,
        title=payload.title,
        url=payload.url,
        created_by=user.get("email"),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{asset_id}/documents/{doc_id}")
async def delete_asset_document(
    asset_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(AssetDocument).where(AssetDocument.doc_id == doc_id, AssetDocument.asset_id == asset_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.delete(doc)
    await db.commit()
    return {"message": "Document removed"}


# ── Additional owners ─────────────────────────────────────────────────────────

@router.get("/{asset_id}/owners", response_model=list[AssetOwnerResponse])
async def list_asset_owners(
    asset_id: str,
    owner_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await _get_asset_or_404(asset_id, db)
    q = select(AssetOwner).where(AssetOwner.asset_id == asset_id)
    if owner_type:
        q = q.where(AssetOwner.owner_type == owner_type)
    result = await db.execute(q.order_by(AssetOwner.created_at))
    return result.scalars().all()


@router.post("/{asset_id}/owners", response_model=AssetOwnerResponse)
async def create_asset_owner(
    asset_id: str,
    payload: AssetOwnerCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)
    owner = AssetOwner(
        owner_id=str(uuid.uuid4()),
        asset_id=asset_id,
        owner_type=payload.owner_type,
        name=payload.name,
        email=payload.email,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(owner)
    await db.commit()
    await db.refresh(owner)
    return owner


@router.delete("/{asset_id}/owners/{owner_id}")
async def delete_asset_owner(
    asset_id: str,
    owner_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(AssetOwner).where(AssetOwner.owner_id == owner_id, AssetOwner.asset_id == asset_id)
    )
    owner = result.scalar_one_or_none()
    if not owner:
        raise HTTPException(404, "Owner not found")
    await db.delete(owner)
    await db.commit()
    return {"message": "Owner removed"}


# ── Tags (asset-scoped, mirrors app/api/tags.py's /assets/{id}/tags logic) ─────

@router.get("/{asset_id}/tags")
async def list_asset_registry_tags(asset_id: str, db: AsyncSession = Depends(get_db)):
    await _get_asset_or_404(asset_id, db)
    result = await db.execute(
        select(AssetTag).where(AssetTag.entity_type == "asset", AssetTag.entity_id == asset_id)
    )
    asset_tags = result.scalars().all()
    tag_ids = [at.tag_id for at in asset_tags]
    if not tag_ids:
        return []

    tags_result = await db.execute(select(Tag).where(Tag.tag_id.in_(tag_ids)))
    tags_by_id = {t.tag_id: t for t in tags_result.scalars().all()}

    return [
        {
            "id": at.id,
            "tag_id": at.tag_id,
            "tag_name": tags_by_id[at.tag_id].tag_name if at.tag_id in tags_by_id else None,
            "color": tags_by_id[at.tag_id].color if at.tag_id in tags_by_id else None,
        }
        for at in asset_tags
    ]


@router.post("/{asset_id}/tags")
async def apply_asset_registry_tags(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)
    tag_ids = payload.get("tag_ids", [])
    if not tag_ids:
        raise HTTPException(422, "tag_ids list is required and must not be empty")

    tags_result = await db.execute(select(Tag).where(Tag.tag_id.in_(tag_ids)))
    found_ids = {t.tag_id for t in tags_result.scalars().all()}
    missing = set(tag_ids) - found_ids
    if missing:
        raise HTTPException(404, f"Tags not found: {list(missing)}")

    existing_result = await db.execute(
        select(AssetTag).where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id == asset_id,
            AssetTag.tag_id.in_(tag_ids),
        )
    )
    existing_tag_ids = {at.tag_id for at in existing_result.scalars().all()}

    applied = []
    for tag_id in tag_ids:
        if tag_id in existing_tag_ids:
            continue
        db.add(AssetTag(
            id=str(uuid.uuid4()),
            tag_id=tag_id,
            entity_type="asset",
            entity_id=asset_id,
            created_by=user.get("email"),
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        applied.append(tag_id)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Lost the race to a concurrent request applying the same tag(s) — not an error.
        return {"applied": [], "already_present": list(existing_tag_ids | set(applied))}

    return {"applied": applied, "already_present": list(existing_tag_ids)}


@router.delete("/{asset_id}/tags/{tag_id}")
async def remove_asset_registry_tag(
    asset_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)
    result = await db.execute(
        select(AssetTag).where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id == asset_id,
            AssetTag.tag_id == tag_id,
        )
    )
    at = result.scalar_one_or_none()
    if not at:
        raise HTTPException(404, "Tag not applied to this asset")
    await db.delete(at)
    await db.commit()
    return {"message": "Tag removed from asset"}


