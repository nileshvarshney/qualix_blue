from __future__ import annotations
from typing import Optional
import asyncio
import logging
import sqlglot
import sqlglot.expressions as exp
from sqlglot.lineage import lineage as sqlglot_lineage
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.database import get_db
from app.db.models import (
    Asset, AssetSourceMeta, ColumnMetadata, ColumnProfileHistory,
    DataClassification, GlossaryTerm, GlossaryTermAsset,
    SnowflakeConnection,
)
from app.core.security import get_current_user, check_domain_access

logger = logging.getLogger("dq_platform.lineage")

router = APIRouter(prefix="/lineage", tags=["Lineage"])


def extract_table_refs(view_sql: str) -> list[str]:
    """Return upper-cased table names from every FROM/JOIN in the view SQL, excluding CTE aliases."""
    if not view_sql or not view_sql.strip():
        return []
    try:
        tree = sqlglot.parse_one(view_sql, dialect="snowflake")
    except Exception as exc:
        logger.debug("extract_table_refs parse error: %s", exc)
        return []
    # Collect CTE alias names so we can exclude them
    cte_names: set[str] = {
        cte.alias.upper() for cte in tree.find_all(exp.CTE) if cte.alias
    }
    refs: set[str] = set()
    for table in tree.find_all(exp.Table):
        if table.name and table.name.upper() not in cte_names:
            refs.add(table.name.upper())
    return list(refs)


async def _enrich(asset: Asset, db: AsyncSession) -> dict:
    """Build the serialisable node dict for one Asset."""
    col_result = await db.execute(
        select(func.count()).select_from(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset.asset_id
        )
    )
    col_count: int = col_result.scalar() or 0

    row_result = await db.execute(
        select(ColumnProfileHistory.row_count)
        .where(ColumnProfileHistory.asset_id == asset.asset_id)
        .order_by(ColumnProfileHistory.profile_date.desc())
        .limit(1)
    )
    row_count = row_result.scalar()

    cls_result = await db.execute(
        select(DataClassification.classification)
        .where(DataClassification.asset_id == asset.asset_id)
        .distinct()
    )
    classifications = list(cls_result.scalars().all())

    terms_result = await db.execute(
        select(GlossaryTerm.term_name)
        .join(GlossaryTermAsset, GlossaryTerm.term_id == GlossaryTermAsset.term_id)
        .where(GlossaryTermAsset.asset_id == asset.asset_id)
    )
    terms = list(terms_result.scalars().all())

    meta = asset.source_meta
    return {
        "asset_id": asset.asset_id,
        "sf_table_name": meta.sf_table_name if meta else asset.physical_name,
        "sf_schema_name": meta.sf_schema_name if meta else None,
        "sf_database_name": meta.sf_database_name if meta else None,
        "table_type": meta.sf_table_type if meta else asset.table_type,
        "table_description": asset.description or asset.table_description,
        "owner_name": asset.owner_name,
        "technical_owner_name": asset.technical_owner_name,
        "column_count": col_count,
        "row_count": (meta.row_count if meta else None) or row_count,
        "classifications": classifications,
        "terms": terms,
    }


async def _bulk_enrich(assets: list[Asset], db: AsyncSession) -> dict[str, dict]:
    """Same output as calling _enrich() per asset, but in 4 queries total instead of 4xN.

    asyncio.gather(*[_enrich(a, db) for a in assets]) shares one AsyncSession across
    concurrent coroutines, so the driver actually serializes every query — for a
    connection with 50+ assets that's 200+ sequential round trips and dominates page
    load time. Batching with IN-clauses fixes both the serialization and the N+1.
    """
    asset_ids = [a.asset_id for a in assets]
    if not asset_ids:
        return {}

    col_counts: dict[str, int] = {}
    col_result = await db.execute(
        select(ColumnMetadata.asset_id, func.count())
        .where(ColumnMetadata.asset_id.in_(asset_ids))
        .group_by(ColumnMetadata.asset_id)
    )
    for asset_id_, cnt in col_result.all():
        col_counts[asset_id_] = cnt

    row_counts: dict[str, Optional[int]] = {}
    row_result = await db.execute(
        select(ColumnProfileHistory.asset_id, ColumnProfileHistory.row_count)
        .where(ColumnProfileHistory.asset_id.in_(asset_ids))
        .order_by(ColumnProfileHistory.asset_id, ColumnProfileHistory.profile_date.desc())
    )
    for asset_id_, row_count in row_result.all():
        if asset_id_ not in row_counts:  # first row per asset_id is the latest (ordered desc)
            row_counts[asset_id_] = row_count

    classifications: dict[str, list[str]] = {}
    cls_result = await db.execute(
        select(DataClassification.asset_id, DataClassification.classification)
        .where(DataClassification.asset_id.in_(asset_ids))
        .distinct()
    )
    for asset_id_, cls in cls_result.all():
        classifications.setdefault(asset_id_, []).append(cls)

    terms: dict[str, list[str]] = {}
    terms_result = await db.execute(
        select(GlossaryTermAsset.asset_id, GlossaryTerm.term_name)
        .join(GlossaryTerm, GlossaryTerm.term_id == GlossaryTermAsset.term_id)
        .where(GlossaryTermAsset.asset_id.in_(asset_ids))
    )
    for asset_id_, term_name in terms_result.all():
        terms.setdefault(asset_id_, []).append(term_name)

    out: dict[str, dict] = {}
    for a in assets:
        meta = a.source_meta
        out[a.asset_id] = {
            "asset_id": a.asset_id,
            "sf_table_name": meta.sf_table_name if meta else a.physical_name,
            "sf_schema_name": meta.sf_schema_name if meta else None,
            "sf_database_name": meta.sf_database_name if meta else None,
            "table_type": meta.sf_table_type if meta else a.table_type,
            "table_description": a.description or a.table_description,
            "owner_name": a.owner_name,
            "technical_owner_name": a.technical_owner_name,
            "column_count": col_counts.get(a.asset_id, 0),
            "row_count": (meta.row_count if meta else None) or row_counts.get(a.asset_id),
            "classifications": classifications.get(a.asset_id, []),
            "terms": terms.get(a.asset_id, []),
        }
    return out


def _sync_fetch_view_definition(conn: SnowflakeConnection, asset: Asset) -> Optional[str]:
    """Synchronous Snowflake call — run via asyncio.to_thread."""
    meta = asset.source_meta
    if not meta or not meta.sf_table_name:
        return None
    try:
        from app.api.connections import _open_connector
        sf = _open_connector(conn)
        cur = sf.cursor()
        try:
            db_part = f'"{meta.sf_database_name}".' if meta.sf_database_name else ""
            cur.execute(
                f"SELECT GET_DDL('VIEW', '{db_part}\"{meta.sf_schema_name}\".\"{meta.sf_table_name}\"')"
            )
            row = cur.fetchone()
            return row[0] if row else None
        except Exception as exc:
            logger.debug("view_definition fetch failed for %s: %s", meta.sf_table_name, exc)
            return None
        finally:
            cur.close()
            sf.close()
    except Exception as exc:
        logger.debug("view_definition fetch failed: %s", exc)
        return None


def _sync_fetch_view_definitions_bulk(conn: SnowflakeConnection, assets: list[Asset]) -> dict[str, str]:
    """Fetch GET_DDL for many views over a single Snowflake connection — run via asyncio.to_thread."""
    from app.api.connections import _open_connector
    results: dict[str, str] = {}
    try:
        sf = _open_connector(conn)
    except Exception as exc:
        logger.debug("bulk view_definition connect failed: %s", exc)
        return results
    try:
        cur = sf.cursor()
        for asset in assets:
            meta = asset.source_meta
            if not meta or not meta.sf_table_name:
                continue
            try:
                db_part = f'"{meta.sf_database_name}".' if meta.sf_database_name else ""
                cur.execute(
                    f"SELECT GET_DDL('VIEW', '{db_part}\"{meta.sf_schema_name}\".\"{meta.sf_table_name}\"')"
                )
                row = cur.fetchone()
                if row and row[0]:
                    results[asset.asset_id] = row[0]
            except Exception as exc:
                logger.debug("bulk view_definition fetch failed for %s: %s", meta.sf_table_name, exc)
        cur.close()
    finally:
        sf.close()
    return results


VIEW_DEFINITION_BACKFILL_LIMIT = 8


async def _ensure_view_definitions(assets: list[Asset], conn_id: str, db: AsyncSession) -> None:
    """Backfill missing view_definition on VIEW assets so DDL/column lineage can be derived.

    view_definition is only ever lazily fetched one asset at a time (in get_lineage,
    below), which the connection-wide graph endpoints never call — so without this,
    most views never get a DDL and contribute zero lineage edges.

    Capped per request: a connection with many uncached views would otherwise make a
    single page load issue dozens of sequential GET_DDL calls and risk timing out.
    Remaining views are picked up on the next 30s auto-refresh, so coverage still
    converges to complete without blocking any one request for long.
    """
    missing = [
        a for a in assets
        if a.source_meta and a.source_meta.sf_table_type
        and "VIEW" in a.source_meta.sf_table_type.upper()
        and not a.source_meta.view_definition
    ]
    if not missing:
        return
    batch = missing[:VIEW_DEFINITION_BACKFILL_LIMIT]
    sf_conn = await db.get(SnowflakeConnection, conn_id)
    if not sf_conn:
        return
    fetched = await asyncio.to_thread(_sync_fetch_view_definitions_bulk, sf_conn, batch)
    if not fetched:
        return
    for asset in batch:
        view_def = fetched.get(asset.asset_id)
        if view_def:
            asset.source_meta.view_definition = view_def
    await db.commit()


async def _resolve_connection_id(connection_id: Optional[str], db: AsyncSession) -> Optional[str]:
    if connection_id:
        return connection_id
    result = await db.execute(
        select(SnowflakeConnection.connection_id)
        .where(SnowflakeConnection.is_active == True)
        .order_by(SnowflakeConnection.is_primary_target.desc(), SnowflakeConnection.created_at.asc())
        .limit(1)
    )
    return result.scalar()


def _classify_node_type(table_type: Optional[str]) -> str:
    if table_type and "VIEW" in table_type.upper():
        return "output"
    return "warehouse"


@router.get("")
async def get_lineage_graph(
    connection_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Connection-wide lineage graph: nodes + table-level edges."""
    empty_meta = {"edgeMethods": {"fk": 0, "ddl": 0, "heuristic": 0}, "totalTables": 0, "totalEdges": 0}
    empty_conn = {"name": "", "database": "", "schema": "", "warehouse": "", "status": "empty"}

    conn_id = await _resolve_connection_id(connection_id, db)
    if not conn_id:
        return {"nodes": [], "edges": [], "connection": empty_conn, "meta": empty_meta}

    conn = await db.get(SnowflakeConnection, conn_id)
    conn_info = {
        "name": conn.connection_name if conn else "",
        "database": conn.default_database if conn else "",
        "schema": conn.default_schema if conn else "",
        "warehouse": conn.warehouse if conn else "",
        "status": "active" if (conn and conn.is_active) else "inactive",
    } if conn else empty_conn

    result = await db.execute(
        select(Asset)
        .join(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .where(
            Asset.connection_id == conn_id,
            Asset.asset_type.in_(["table", "view"]),
            Asset.is_active == True,
        )
    )
    assets = list(result.scalars().all())
    if not assets:
        return {"nodes": [], "edges": [], "connection": conn_info, "meta": empty_meta}

    await _ensure_view_definitions(assets, conn_id, db)

    enriched_map = await _bulk_enrich(assets, db)
    enriched_list = [enriched_map[a.asset_id] for a in assets]

    table_name_to_asset_id: dict[str, str] = {}
    for a in assets:
        meta = a.source_meta
        name = (meta.sf_table_name if meta else a.physical_name) or ""
        if name:
            table_name_to_asset_id[name.upper()] = a.asset_id

    nodes = []
    for a, enr in zip(assets, enriched_list):
        meta = a.source_meta
        table_type = enr["table_type"]
        schema_name = enr["sf_schema_name"] or ""
        database_name = enr["sf_database_name"] or ""
        nodes.append({
            "id": a.asset_id,
            "label": enr["sf_table_name"] or a.physical_name,
            "sub": ".".join(p for p in (schema_name, database_name) if p),
            "type": _classify_node_type(table_type),
            "icon": "📄",
            "schema": schema_name,
            "database": database_name,
            "tableType": table_type,
            "rowCount": enr["row_count"],
            "columnCount": enr["column_count"],
            "lastAltered": meta.last_modified_at.isoformat() if meta and meta.last_modified_at else None,
            "comment": enr["table_description"],
        })

    edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()
    ddl_count = 0
    for a in assets:
        meta = a.source_meta
        if not meta or not meta.view_definition:
            continue
        for ref in extract_table_refs(meta.view_definition):
            src_id = table_name_to_asset_id.get(ref)
            if src_id and src_id != a.asset_id and (src_id, a.asset_id) not in edge_set:
                edge_set.add((src_id, a.asset_id))
                edges.append({"from": src_id, "to": a.asset_id, "relationship": "derives"})
                ddl_count += 1

    fk_result = await db.execute(
        select(ColumnMetadata.asset_id, ColumnMetadata.references_table).where(
            and_(
                ColumnMetadata.asset_id.in_([a.asset_id for a in assets]),
                ColumnMetadata.is_foreign_key == True,
                ColumnMetadata.references_table.isnot(None),
            )
        )
    )
    fk_count = 0
    for asset_id_, ref_table in fk_result.all():
        ref_id = table_name_to_asset_id.get((ref_table or "").upper())
        if ref_id and ref_id != asset_id_ and (ref_id, asset_id_) not in edge_set:
            edge_set.add((ref_id, asset_id_))
            edges.append({"from": ref_id, "to": asset_id_, "relationship": "fk"})
            fk_count += 1

    has_incoming = {e["to"] for e in edges}
    for n in nodes:
        if n["type"] == "warehouse" and n["id"] not in has_incoming:
            n["type"] = "source"

    meta = {
        "edgeMethods": {"fk": fk_count, "ddl": ddl_count, "heuristic": 0},
        "totalTables": len(nodes),
        "totalEdges": len(edges),
    }
    return {"nodes": nodes, "edges": edges, "connection": conn_info, "meta": meta}


@router.get("/columns")
async def get_column_lineage(
    connection_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Connection-wide column-to-column lineage edges, derived from view SQL via sqlglot."""
    conn_id = await _resolve_connection_id(connection_id, db)
    if not conn_id:
        return {"edges": []}

    try:
        result = await db.execute(
            select(Asset)
            .join(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
            .where(
                Asset.connection_id == conn_id,
                Asset.asset_type.in_(["table", "view"]),
                Asset.is_active == True,
            )
        )
        assets = list(result.scalars().all())
        if not assets:
            return {"edges": []}

        await _ensure_view_definitions(assets, conn_id, db)

        asset_ids = [a.asset_id for a in assets]
        table_name_to_asset_id: dict[str, str] = {}
        for a in assets:
            meta = a.source_meta
            name = (meta.sf_table_name if meta else a.physical_name) or ""
            if name:
                table_name_to_asset_id[name.upper()] = a.asset_id

        col_result = await db.execute(
            select(ColumnMetadata.asset_id, ColumnMetadata.column_name, ColumnMetadata.data_type)
            .where(ColumnMetadata.asset_id.in_(asset_ids))
        )
        columns_by_asset: dict[str, list[tuple[str, str]]] = {}
        for asset_id_, col_name, data_type in col_result.all():
            columns_by_asset.setdefault(asset_id_, []).append((col_name, data_type or "VARCHAR"))

        schema: dict[str, dict[str, str]] = {}
        for a in assets:
            meta = a.source_meta
            table_name = (meta.sf_table_name if meta else a.physical_name) or ""
            cols = columns_by_asset.get(a.asset_id) or []
            if table_name and cols:
                schema[table_name.upper()] = {c: dt for c, dt in cols}

        edges: list[dict] = []
        edge_set: set[tuple[str, str, str, str]] = set()
        for a in assets:
            meta = a.source_meta
            if not meta or not meta.sf_table_type or "VIEW" not in meta.sf_table_type.upper():
                continue
            if not meta.view_definition:
                continue

            output_cols = [c for c, _ in (columns_by_asset.get(a.asset_id) or [])]
            if not output_cols:
                try:
                    tree = sqlglot.parse_one(meta.view_definition, dialect="snowflake")
                    output_cols = [s.alias_or_name.upper() for s in tree.selects if s.alias_or_name]
                except Exception as exc:
                    logger.debug("column projection parse failed for %s: %s", a.asset_id, exc)
                    continue

            for col in output_cols:
                try:
                    root = sqlglot_lineage(col, meta.view_definition, schema=schema, dialect="snowflake")
                except Exception as exc:
                    logger.debug("column lineage failed for %s.%s: %s", a.asset_id, col, exc)
                    continue
                for leaf in root.walk():
                    if not isinstance(leaf.expression, exp.Table):
                        continue
                    src_table = leaf.expression.name
                    src_asset_id = table_name_to_asset_id.get((src_table or "").upper())
                    if not src_asset_id or src_asset_id == a.asset_id:
                        continue
                    src_col = leaf.name.split(".")[-1]
                    key = (src_asset_id, src_col, a.asset_id, col)
                    if key not in edge_set:
                        edge_set.add(key)
                        edges.append({
                            "fromAssetId": src_asset_id,
                            "fromColumn": src_col,
                            "toAssetId": a.asset_id,
                            "toColumn": col,
                        })

        return {"edges": edges}
    except Exception as exc:
        logger.warning("column lineage computation failed for connection %s: %s", conn_id, exc)
        return {"edges": []}


@router.get("/{asset_id}")
async def get_lineage(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    check_domain_access(user, asset.domain_id)

    # ── Lazy-fetch view_definition for VIEW assets that don't have it stored ──
    meta = asset.source_meta
    is_view = meta and meta.sf_table_type and "VIEW" in meta.sf_table_type.upper()
    if meta and is_view and not meta.view_definition and asset.connection_id:
        sf_conn = await db.get(SnowflakeConnection, asset.connection_id)
        if sf_conn:
            view_def = await asyncio.to_thread(_sync_fetch_view_definition, sf_conn, asset)
            if view_def:
                meta.view_definition = view_def
                await db.commit()

    # ── Upstream ──────────────────────────────────────────────────────────────
    upstream_assets: list[Asset] = []
    if meta and meta.view_definition and asset.connection_id:
        refs = extract_table_refs(meta.view_definition)
        if refs:
            result = await db.execute(
                select(Asset).join(
                    AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id
                ).where(
                    and_(
                        func.upper(AssetSourceMeta.sf_table_name).in_(refs),
                        Asset.connection_id == asset.connection_id,
                        Asset.asset_id != asset_id,
                    )
                )
            )
            upstream_assets = list(result.scalars().all())

    # ── Downstream ────────────────────────────────────────────────────────────
    downstream_assets: list[Asset] = []
    table_name = (meta.sf_table_name if meta else None) or asset.physical_name or ""
    if asset.connection_id and table_name:
        candidate_result = await db.execute(
            select(Asset).join(
                AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id
            ).where(
                and_(
                    AssetSourceMeta.view_definition.ilike(f"%{table_name}%"),
                    Asset.connection_id == asset.connection_id,
                    Asset.asset_id != asset_id,
                )
            )
        )
        for candidate in candidate_result.scalars().all():
            refs_cand = extract_table_refs(
                candidate.source_meta.view_definition if candidate.source_meta else ""
            )
            if table_name.upper() in refs_cand:
                downstream_assets.append(candidate)

    asset_node = await _enrich(asset, db)
    upstream_nodes = await asyncio.gather(*[_enrich(a, db) for a in upstream_assets]) if upstream_assets else []
    downstream_nodes = await asyncio.gather(*[_enrich(a, db) for a in downstream_assets]) if downstream_assets else []
    return {
        "asset": asset_node,
        "upstream": list(upstream_nodes),
        "downstream": list(downstream_nodes),
    }
