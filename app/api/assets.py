from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import Asset, Domain, Subdomain, AuditLog, SnowflakeConnection, AssetSourceMeta
from app.schemas.asset import (
    AssetCreate, AssetUpdate, AssetResponse, AssetCertifyRequest,
    AssetStatusUpdate, AssetRegistryDiscoveryRequest, AssetTreeNode,
    AssetSourceMetaResponse,
)
from app.core.security import get_current_user, get_domain_filter
import uuid
from datetime import datetime, timezone
import logging

logger = logging.getLogger("dq_platform.assets")
router = APIRouter(prefix="/asset-registry", tags=["Asset Registry"])


# Snowflake browse is handled by /connections/:id/databases|schemas|tables


@router.get("/enriched")
async def list_assets_enriched(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Returns assets joined with domain, subdomain, and connection names."""
    effective_domain = get_domain_filter(user) or domain_id
    q = select(Asset, Domain, Subdomain).join(
        Domain, Asset.domain_id == Domain.domain_id
    ).join(
        Subdomain, Asset.subdomain_id == Subdomain.subdomain_id
    )
    if effective_domain:
        q = q.where(Asset.domain_id == effective_domain)
    if subdomain_id:
        q = q.where(Asset.subdomain_id == subdomain_id)
    result = await db.execute(q.order_by(Asset.sf_table_name))
    rows = result.all()

    # Bulk-fetch connection names for assets that have one
    conn_ids = {asset.connection_id for asset, _, _ in rows if asset.connection_id}
    conn_map: dict[str, str] = {}
    if conn_ids:
        conn_result = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.connection_id.in_(conn_ids))
        )
        for c in conn_result.scalars().all():
            conn_map[c.connection_id] = c.connection_name

    return [
        {
            "asset_id": asset.asset_id,
            "connection_id": asset.connection_id,
            "connection_name": conn_map.get(asset.connection_id) if asset.connection_id else None,
            "sf_database_name": asset.sf_database_name,
            "sf_schema_name": asset.sf_schema_name,
            "sf_table_name": asset.sf_table_name,
            "table_description": asset.table_description,
            "table_type": asset.table_type,
            "criticality": asset.criticality,
            "owner_name": asset.owner_name,
            "owner_email": asset.owner_email,
            "technical_owner_name": asset.technical_owner_name,
            "technical_owner_email": asset.technical_owner_email,
            "criticality": asset.criticality,
            "certification_status": asset.certification_status,
            "certified_by": asset.certified_by,
            "is_active": asset.is_active,
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "subdomain_id": subdomain.subdomain_id,
            "subdomain_name": subdomain.subdomain_name,
            "created_at": asset.created_at.isoformat(),
        }
        for asset, domain, subdomain in rows
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
    if is_active is not None:
        q = q.where(Asset.is_active == is_active)
    total = (await db.execute(select(sqlfunc.count()).select_from(q.subquery()))).scalar() or 0
    result = await db.execute(
        q.order_by(Asset.sf_database_name, Asset.sf_schema_name, Asset.sf_table_name)
        .limit(limit).offset(offset)
    )
    assets = result.scalars().all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "asset_id": a.asset_id,
                "connection_id": a.connection_id,
                "sf_database_name": a.sf_database_name,
                "sf_schema_name": a.sf_schema_name,
                "sf_table_name": a.sf_table_name,
                "table_type": a.table_type,
                "table_description": a.table_description,
                "criticality": a.criticality,
                "certification_status": a.certification_status,
                "is_active": a.is_active,
                "row_count": a.row_count,
                "bytes": a.bytes,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            }
            for a in assets
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
    query = select(Asset).where(Asset.parent_asset_id == None)
    if source_id:
        query = query.where(Asset.connection_id == source_id)
    result = await db.execute(query)
    roots = result.scalars().all()

    async def build_tree(asset, remaining_depth):
        children_nodes = []
        if remaining_depth > 0:
            child_result = await db.execute(
                select(Asset).where(Asset.parent_asset_id == asset.asset_id)
            )
            children = child_result.scalars().all()
            children_nodes = [await build_tree(c, remaining_depth - 1) for c in children]
        return AssetTreeNode(
            asset_id=asset.asset_id,
            display_name=asset.display_name or asset.physical_name,
            physical_name=asset.physical_name,
            asset_type=asset.asset_type,
            status=asset.status,
            qualified_name=asset.qualified_name,
            children=children_nodes,
        )

    return [await build_tree(r, depth - 1) for r in roots]


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.get("/{asset_id}/children")
async def get_asset_children(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
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
    result = await db.execute(
        select(Asset).where(Asset.asset_id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.status = body.status
    await db.commit()
    await db.refresh(asset)
    return AssetResponse.model_validate(asset)


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: str, payload: AssetUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
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
async def get_asset_columns(asset_id: str, db: AsyncSession = Depends(get_db)):
    """Return column metadata. Uses profiled stats from column_metadata when available,
    otherwise falls back to live Snowflake INFORMATION_SCHEMA."""
    from app.db.models import ColumnMetadata, DataClassification
    import json as _json

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
                "min_value":        c.min_value,
                "max_value":        c.max_value,
                "mean":             c.avg_value,
                "std_dev":          c.std_dev,
                "top_values":       top,
                "sample_values":    smp,
                "last_profiled_at": c.last_profiled_at.isoformat() + 'Z' if c.last_profiled_at else None,
                "classification":   classifications.get(c.column_name),
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
                if col_rec.null_count is not None:
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
        _ident = re.compile(r'^[A-Za-z0-9_$]+$')
        schema_safe = asset.sf_schema_name if _ident.match(asset.sf_schema_name or "") else ""
        table_safe  = asset.sf_table_name  if _ident.match(asset.sf_table_name  or "") else ""
        if not schema_safe or not table_safe:
            return {**base, "columns": [], "error": "Invalid schema or table name"}

        kwargs: dict = dict(account=conn.account, user=conn.sf_user,
                            password=decrypt(conn.password) or "", warehouse=conn.warehouse)
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
