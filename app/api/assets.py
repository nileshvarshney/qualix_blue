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
    AssetSourceMetaResponse, LogicalDatasetCreate,
)
from app.services.asset_registry import register_logical_dataset
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
    return AssetResponse.model_validate(asset)


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
