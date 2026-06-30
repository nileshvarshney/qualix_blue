from __future__ import annotations

"""
Auto Data Discovery background service.

Scans selected Snowflake databases/schemas, deduplicates against existing
Asset records, classifies each new table using the LLM, creates the
asset, and triggers column profiling — all in a single background job.
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.db.models import AuditLog, Asset, AssetSourceMeta, Domain, DQRule, Subdomain, SnowflakeConnection
from app.services import job_tracker
from app.services.ai_service import classify_table
from app.services.asset_registry import (
    stable_asset_id,
    ensure_hierarchy_assets,
    register_column_assets,
)

import time

from app.services import metadata_store as _meta_store
from app.schemas.metadata import ColumnMetaIn as _ColumnMetaIn

SCANNER_VERSION = "1.0.0"

logger = logging.getLogger("dq_platform.discovery")

_IDENT_RE = re.compile(r"^[A-Za-z0-9_$]+$")


def _validate_ident(value: str, label: str) -> str:
    if not value or not _IDENT_RE.match(value):
        raise ValueError(
            f"Invalid {label} '{value}': identifiers must contain only "
            "letters, digits, underscores, or dollar signs."
        )
    return value


async def _fetch_connection(connection_id: str, db) -> SnowflakeConnection:
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise ValueError(f"Connection '{connection_id}' not found")
    return conn


def _browse_tables_sync(conn: SnowflakeConnection, db_safe: str, schema_safe: str) -> list[dict]:
    from app.api.connections import _open_connector
    sf = _open_connector(conn)
    cur = sf.cursor()
    try:
        cur.execute(f"""
            SELECT table_name, table_type,
                   COALESCE(row_count, 0)  AS row_count,
                   COALESCE(bytes, 0)      AS bytes,
                   COALESCE(comment, '')   AS comment,
                   last_altered
            FROM "{db_safe}".INFORMATION_SCHEMA.TABLES
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
            ORDER BY table_name
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        return [dict(zip(col_names, r)) for r in rows]
    finally:
        cur.close()
        sf.close()


def _browse_columns_sync(conn: SnowflakeConnection, db_safe: str, schema_safe: str, table_safe: str) -> list[dict]:
    from app.api.connections import _open_connector
    sf = _open_connector(conn)
    cur = sf.cursor()
    try:
        cur.execute(f"""
            SELECT column_name, data_type, is_nullable, ordinal_position,
                   COALESCE(comment, '') AS comment
            FROM "{db_safe}".INFORMATION_SCHEMA.COLUMNS
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
              AND UPPER(table_name)   = '{table_safe.upper()}'
            ORDER BY ordinal_position
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        return [dict(zip(col_names, r)) for r in rows]
    finally:
        cur.close()
        sf.close()


# ── PostgreSQL browse helpers (uses PostgreSQLAdapter / psycopg2) ─────────────

def _pg_connector(conn: SnowflakeConnection):
    from app.connectors import get_connector, config_from_orm
    from app.core.encryption import decrypt
    cfg = config_from_orm(conn)
    cfg.password = decrypt(conn.password) if conn.password else ""
    return get_connector(cfg)


async def _browse_tables_pg(conn: SnowflakeConnection, database: str, schema: str) -> list[dict]:
    adapter = _pg_connector(conn)
    tables = await adapter.list_tables(database, schema)
    result = []
    for t in tables:
        entry = {
            "table_name": t.table_name,
            "table_type": t.table_type,
            "row_count": t.row_count or 0,
            "bytes": None,
            "comment": t.comment or "",
            "last_altered": None,
            "view_definition": None,
        }
        if t.table_type and "VIEW" in t.table_type.upper():
            try:
                entry["view_definition"] = await adapter.get_view_definition(
                    database, schema, t.table_name
                )
            except Exception as exc:
                logger.warning(
                    "Failed to fetch view_definition for %s.%s.%s during scan: %s",
                    database, schema, t.table_name, exc,
                )
        result.append(entry)
    return result


async def _browse_columns_pg(conn: SnowflakeConnection, database: str, schema: str, table: str) -> list[dict]:
    adapter = _pg_connector(conn)
    columns = await adapter.list_columns(database, schema, table)
    return [
        {
            "column_name": c.name,
            "data_type": c.data_type,
            "is_nullable": c.is_nullable,
            "ordinal_position": c.ordinal_position,
            "comment": c.comment or "",
        }
        for c in columns
    ]


async def _get_existing_table_names(db, connection_id: str, database: str, schema: str, table_names: list[str]) -> set[str]:
    if not table_names:
        return set()
    result = await db.execute(
        select(AssetSourceMeta.sf_table_name)
        .join(Asset, Asset.asset_id == AssetSourceMeta.asset_id)
        .where(
            Asset.connection_id == connection_id,
            AssetSourceMeta.sf_database_name == database,
            AssetSourceMeta.sf_schema_name == schema,
            AssetSourceMeta.sf_table_name.in_(table_names),
            Asset.is_active == True,
        )
    )
    return {row[0] for row in result}


def _resolve_domain_subdomain(
    classification: dict,
    domain_map: dict,
    sub_map: dict,
    fallback_domain: Domain,
    fallback_sub_id: str,
) -> tuple[str, str, str, str]:
    """Resolve LLM classification strings to DB domain/subdomain IDs."""
    llm_domain = (classification.get("domain") or "").strip().lower()
    llm_subdomain = (classification.get("subdomain") or "").strip().lower()

    domain = domain_map.get(llm_domain, fallback_domain)
    domain_id = domain.domain_id
    domain_name = domain.domain_name

    subdomains = sub_map.get(domain_id, [])
    subdomain_id = fallback_sub_id
    subdomain_name = "Others"
    for sub_lower, sub_id, sub_display in subdomains:
        if sub_lower == llm_subdomain or llm_subdomain in sub_lower or sub_lower in llm_subdomain:
            subdomain_id = sub_id
            subdomain_name = sub_display
            break
    else:
        if subdomains:
            _, subdomain_id, subdomain_name = subdomains[0]

    return domain_id, subdomain_id, domain_name, subdomain_name


async def upsert_source_asset(
    connection_id: str,
    display_name: str,
    db: AsyncSession,
) -> str:
    """Ensure a source-type asset exists for this connection; return its asset_id."""
    from sqlalchemy import select
    from app.db.models import Asset
    src_id = stable_asset_id(f"source:{connection_id}")
    result = await db.execute(
        select(Asset).where(Asset.asset_id == src_id)
    )
    asset = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if asset is None:
        asset = Asset(
            asset_id=src_id,
            asset_type="source",
            physical_name=connection_id,
            display_name=display_name,
            qualified_name=connection_id,
            status="active",
            connection_id=connection_id,
            last_seen_at=now,
            discovered_at=now,
        )
        db.add(asset)
    else:
        asset.status = "active"
        asset.last_seen_at = now
        asset.display_name = display_name
    await db.commit()
    return src_id


async def mark_missing_assets(
    connection_id: str,
    scanned_asset_ids: set[str],
    db: AsyncSession,
    scanned_databases: set[str] | None = None,
) -> None:
    """Mark table assets as missing only within the databases that were actually scanned.

    Assets in databases not included in this run are left untouched — a partial
    scan (e.g. only DEMO_DB selected) must not flip other databases to 'missing'.
    """
    from sqlalchemy import select
    from app.db.models import Asset, AssetSourceMeta

    # Build query scoped to the scanned databases when provided
    if scanned_databases:
        result = await db.execute(
            select(Asset)
            .join(AssetSourceMeta, AssetSourceMeta.asset_id == Asset.asset_id, isouter=True)
            .where(
                Asset.connection_id == connection_id,
                Asset.status == "active",
                Asset.asset_type == "table",
                AssetSourceMeta.sf_database_name.in_(scanned_databases),
            )
        )
    else:
        result = await db.execute(
            select(Asset).where(
                Asset.connection_id == connection_id,
                Asset.status == "active",
                Asset.asset_type == "table",
            )
        )

    assets = result.scalars().all()
    now = datetime.now(timezone.utc)
    for asset in assets:
        if asset.asset_id not in scanned_asset_ids:
            asset.status = "missing"
            asset.last_seen_at = now
    await db.commit()


async def run_discovery(job_id: str, payload: dict) -> None:
    """
    Background orchestrator for auto data discovery.

    For each (database, schema) selection:
      1. Browse Snowflake tables
      2. Dedup against existing Asset records for this connection
      3. For new tables: fetch columns, classify via LLM, resolve domain/subdomain
      4. Create Asset + AuditLog, trigger column profiling
    """
    job_tracker.mark_running(job_id)

    try:
        async with AsyncSessionLocal() as db:
            # Pre-load all active domains and subdomains in ONE query each
            domain_rows = (
                await db.execute(select(Domain).where(Domain.is_active == True))
            ).scalars().all()

            if not domain_rows:
                job_tracker.mark_failed(job_id, "No active domains found in database")
                return

            domain_map = {d.domain_name.lower(): d for d in domain_rows}
            domain_names = [d.domain_name for d in domain_rows]

            subdomain_rows = (
                await db.execute(select(Subdomain).where(Subdomain.is_active == True))
            ).scalars().all()

            sub_map: dict[str, list[tuple[str, str, str]]] = {}
            for s in subdomain_rows:
                sub_map.setdefault(s.domain_id, []).append(
                    (s.subdomain_name.lower(), s.subdomain_id, s.subdomain_name)
                )

            fallback_domain = next(
                (d for d in domain_rows if d.domain_name.lower() == "others"),
                domain_rows[0],
            )
            fallback_subs = sub_map.get(fallback_domain.domain_id, [])
            fallback_sub_id = fallback_subs[0][1] if fallback_subs else None

            if not fallback_sub_id:
                job_tracker.mark_failed(job_id, "Fallback domain has no active subdomains")
                return

            conn = await _fetch_connection(payload["connection_id"], db)
            scan_run_id = payload.get("scan_run_id")
            db_type = (conn.database_type or "snowflake").lower()
            is_pg = db_type == "postgresql"

            filter_mode = conn.filter_mode or "exclude"

            # Exclude mode: skip databases/schemas on the deny list
            excluded_db_set = set(conn.excluded_databases or [])
            excluded_schema_set = {
                (e["database"], e["schema"])
                for e in (conn.excluded_schemas or [])
            }

            # Include mode: only allow databases/schemas on the allow list
            included_db_set = set(conn.included_databases or [])
            included_schema_set = {
                (e["database"], e["schema"])
                for e in (conn.included_schemas or [])
            }

            await upsert_source_asset(payload["connection_id"], conn.connection_name, db)

            scanned_ids: set[str] = set()
            scanned_databases: set[str] = set()
            total_selections = len(payload.get("selections", []))
            all_failed = True

            for sel in payload.get("selections", []):
                database = sel["database"]
                schema = sel["schema"]

                if filter_mode == "include":
                    # Skip if database not in the include list (when a list is configured)
                    if included_db_set and database not in included_db_set:
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": "*",
                                "status": "excluded",
                                "reason": "database not in connection include list",
                            },
                            success=True,
                        )
                        all_failed = False
                        continue
                    # Skip if schema not in the include list (when schema-level filtering is configured)
                    if included_schema_set and (database, schema) not in included_schema_set:
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": "*",
                                "status": "excluded",
                                "reason": "schema not in connection include list",
                            },
                            success=True,
                        )
                        all_failed = False
                        continue
                else:
                    # Exclude mode (default)
                    if database in excluded_db_set:
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": "*",
                                "status": "excluded",
                                "reason": "database excluded by connection config",
                            },
                            success=True,
                        )
                        all_failed = False
                        continue

                    if (database, schema) in excluded_schema_set:
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": "*",
                                "status": "excluded",
                                "reason": "schema excluded by connection config",
                            },
                            success=True,
                        )
                        all_failed = False
                        continue

                try:
                    db_safe = _validate_ident(database, "database")
                    schema_safe = _validate_ident(schema, "schema")
                except ValueError as e:
                    job_tracker.append_result(
                        job_id,
                        {
                            "database": database,
                            "schema": schema,
                            "table_name": "*",
                            "status": "error",
                            "reason": str(e),
                        },
                        success=False,
                    )
                    continue

                try:
                    if is_pg:
                        tables = await _browse_tables_pg(conn, db_safe, schema_safe)
                    else:
                        tables = await asyncio.to_thread(
                            _browse_tables_sync, conn, db_safe, schema_safe
                        )
                    # Filter to specific tables if caller provided a list
                    if sel.get("tables"):
                        selected = set(sel["tables"])
                        tables = [t for t in tables if t["table_name"] in selected]
                    all_failed = False
                    scanned_databases.add(database)
                except Exception as e:
                    logger.warning("Failed to browse tables for %s.%s: %s", database, schema, e)
                    job_tracker.append_result(
                        job_id,
                        {
                            "database": database,
                            "schema": schema,
                            "table_name": "*",
                            "status": "error",
                            "reason": f"Failed to list tables: {e}",
                        },
                        success=False,
                    )
                    continue

                table_names = [t["table_name"] for t in tables]
                existing = await _get_existing_table_names(
                    db, payload["connection_id"], database, schema, table_names
                )

                # Ensure source/database/schema nodes exist as real Asset records
                _source_id, _database_id, _schema_id = await ensure_hierarchy_assets(
                    connection_id=payload["connection_id"],
                    connection_name=conn.connection_name,
                    database_name=database,
                    schema_name=schema,
                    provider=conn.database_type or "snowflake",
                    db=db,
                )
                await db.commit()  # guarantee hierarchy nodes persist regardless of table scan outcomes

                for table in tables:
                    tname = table["table_name"]

                    if tname in existing:
                        # Backfill Phase 1 rules for assets that existed before auto-rules were added
                        try:
                            from app.services.auto_rule_service import create_phase1_rules
                            from sqlalchemy import func as _func

                            existing_asset_res = await db.execute(
                                select(Asset)
                                .join(AssetSourceMeta, AssetSourceMeta.asset_id == Asset.asset_id)
                                .where(
                                    Asset.connection_id == payload["connection_id"],
                                    AssetSourceMeta.sf_database_name == database,
                                    AssetSourceMeta.sf_schema_name == schema,
                                    AssetSourceMeta.sf_table_name == tname,
                                    Asset.is_active == True,
                                )
                            )
                            existing_asset = existing_asset_res.scalar_one_or_none()

                            if existing_asset:
                                _existing_scan_start = time.monotonic()
                                scanned_ids.add(existing_asset.asset_id)
                                # Backfill view_definition for existing PostgreSQL VIEW assets
                                if (
                                    is_pg
                                    and "VIEW" in (table.get("table_type") or "").upper()
                                    and existing_asset.source_meta
                                    and not existing_asset.source_meta.view_definition
                                    and table.get("view_definition")
                                ):
                                    existing_asset.source_meta.view_definition = table["view_definition"]
                                    await db.commit()
                                # Restore previously-missing assets back to active
                                if existing_asset.status == "missing":
                                    existing_asset.status = "active"
                                    existing_asset.last_seen_at = datetime.now(timezone.utc).replace(tzinfo=None)
                                    await db.commit()
                                rule_count_res = await db.execute(
                                    select(_func.count()).select_from(DQRule).where(
                                        DQRule.asset_id == existing_asset.asset_id
                                    )
                                )
                                table_safe = _validate_ident(tname, "table")
                                if is_pg:
                                    columns = await _browse_columns_pg(conn, db_safe, schema_safe, table_safe)
                                else:
                                    columns = await asyncio.to_thread(
                                        _browse_columns_sync, conn, db_safe, schema_safe, table_safe
                                    )
                                if (rule_count_res.scalar() or 0) == 0:
                                    try:
                                        await create_phase1_rules(existing_asset, columns, db)
                                        logger.info(
                                            "Backfilled Phase 1 rules for existing asset %s (%s)",
                                            existing_asset.asset_id, tname,
                                        )
                                    except Exception as backfill_err:
                                        logger.exception(
                                            "Phase 1 backfill failed for %s: %s", tname, backfill_err
                                        )
                                # Refresh column metadata for existing asset
                                _existing_col_models = [
                                    _ColumnMetaIn(
                                        column_name=c["column_name"],
                                        data_type=c.get("data_type"),
                                        is_nullable=(
                                            c.get("is_nullable") != "NO"
                                            if isinstance(c.get("is_nullable"), str)
                                            else c.get("is_nullable")
                                        ),
                                        ordinal_position=c.get("ordinal_position"),
                                        description=c.get("comment") or None,
                                    )
                                    for c in columns
                                ]
                                try:
                                    await _meta_store.upsert_column_metadata(db, existing_asset.asset_id, _existing_col_models)
                                    # Detect schema drift against baseline
                                    try:
                                        from app.services.schema_drift_service import detect_drift as _detect_drift
                                        await _detect_drift(existing_asset.asset_id, db)
                                    except Exception as _drift_err:
                                        logger.warning(
                                            "Schema drift detection failed for existing asset %s: %s",
                                            existing_asset.asset_id, _drift_err,
                                        )
                                    _existing_schema_hash = _meta_store.compute_schema_hash(_existing_col_models)
                                    _elapsed_existing = int((time.monotonic() - _existing_scan_start) * 1000)
                                    await _meta_store.record_scan_result(
                                        db, existing_asset.asset_id,
                                        scan_status="success",
                                        scan_version=SCANNER_VERSION,
                                        scan_duration_ms=_elapsed_existing,
                                        row_count=table.get("row_count"),
                                        bytes=table.get("bytes"),
                                        last_modified_at=table.get("last_altered"),
                                        column_count=len(columns),
                                        schema_hash=_existing_schema_hash,
                                        scan_run_id=scan_run_id,
                                    )
                                except Exception as _meta_err:
                                    logger.warning(
                                        "metadata_store operations failed for existing asset %s: %s",
                                        existing_asset.asset_id, _meta_err,
                                    )
                        except Exception as skip_check_err:
                            logger.exception(
                                "Error during rule check for skipped table %s: %s", tname, skip_check_err
                            )

                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": tname,
                                "status": "skipped",
                                "reason": "already_exists",
                            },
                            success=True,
                        )
                        continue

                    try:
                        _table_scan_start = time.monotonic()
                        table_safe = _validate_ident(tname, "table")

                        # Fetch column metadata for LLM classification
                        if is_pg:
                            columns = await _browse_columns_pg(conn, db_safe, schema_safe, table_safe)
                        else:
                            columns = await asyncio.to_thread(
                                _browse_columns_sync, conn, db_safe, schema_safe, table_safe
                            )

                        # LLM classify — on failure, fall back to Others domain
                        try:
                            classification = await classify_table(
                                tname, columns, payload.get("provider"), db,
                                domain_names=domain_names,
                            )
                        except Exception as llm_err:
                            logger.warning("LLM classification failed for %s: %s", tname, llm_err)
                            classification = {
                                "domain": fallback_domain.domain_name,
                                "subdomain": "",
                                "reason": f"LLM failed: {llm_err}",
                            }

                        domain_id, subdomain_id, dn, sn = _resolve_domain_subdomain(
                            classification, domain_map, sub_map, fallback_domain, fallback_sub_id
                        )

                        asset_id_new = stable_asset_id(
                            f"table:{payload['connection_id']}:{database.lower()}:{schema.lower()}:{tname.lower()}"
                        )
                        qualified_name = f"{database}.{schema}.{tname}"
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
                        asset = Asset(
                            asset_id=asset_id_new,
                            parent_asset_id=_schema_id,
                            connection_id=payload["connection_id"],
                            asset_type="table",
                            physical_name=tname,
                            display_name=tname,
                            qualified_name=qualified_name,
                            status="active",
                            domain_id=domain_id,
                            subdomain_id=subdomain_id,
                            description=table.get("comment") or "",
                            criticality=payload.get("criticality", "medium"),
                            owner_name=payload.get("owner_name"),
                            owner_email=payload.get("owner_email"),
                            technical_owner_name=payload.get("technical_owner_name"),
                            technical_owner_email=payload.get("technical_owner_email"),
                            is_active=True,
                            discovered_at=now,
                            last_seen_at=now,
                        )
                        scanned_ids.add(asset_id_new)
                        db.add(asset)
                        db.add(AssetSourceMeta(
                            asset_id=asset_id_new,
                            provider=db_type,
                            sf_account=conn.account if not is_pg else conn.host,
                            sf_database_name=database,
                            sf_schema_name=schema,
                            sf_table_name=tname,
                            sf_table_type=table.get("table_type"),
                            row_count=table.get("row_count"),
                            bytes=table.get("bytes"),
                            view_definition=table.get("view_definition"),
                        ))
                        db.add(
                            AuditLog(
                                audit_id=str(uuid.uuid4()),
                                user_email=payload.get("triggered_by"),
                                action="CREATE",
                                entity_type="asset",
                                entity_id=asset.asset_id,
                                new_value={
                                    "sf_database_name": database,
                                    "sf_schema_name": schema,
                                    "sf_table_name": tname,
                                    "qualified_name": qualified_name,
                                    "domain_id": domain_id,
                                    "subdomain_id": subdomain_id,
                                    "source": "auto_discovery",
                                },
                            )
                        )
                        await db.commit()

                        # --- Metadata store: record column schema + operational snapshot ---
                        _col_models = [
                            _ColumnMetaIn(
                                column_name=c["column_name"],
                                data_type=c.get("data_type"),
                                is_nullable=(
                                    c.get("is_nullable") != "NO"
                                    if isinstance(c.get("is_nullable"), str)
                                    else c.get("is_nullable")
                                ),
                                ordinal_position=c.get("ordinal_position"),
                                description=c.get("comment") or None,
                            )
                            for c in columns
                        ]
                        await _meta_store.upsert_column_metadata(db, asset_id_new, _col_models)
                        # Detect schema drift against baseline (no-op if no baseline exists yet)
                        try:
                            from app.services.schema_drift_service import detect_drift as _detect_drift
                            await _detect_drift(asset_id_new, db)
                        except Exception as _drift_err:
                            logger.warning("Schema drift detection failed for asset %s: %s", asset_id_new, _drift_err)
                        await register_column_assets(
                            table_asset_id=asset_id_new,
                            connection_id=payload["connection_id"],
                            columns=_col_models,
                            db=db,
                            table_qualified_name=qualified_name,
                        )
                        _schema_hash = _meta_store.compute_schema_hash(_col_models)
                        _elapsed_ms = int((time.monotonic() - _table_scan_start) * 1000)
                        await _meta_store.record_scan_result(
                            db, asset_id_new,
                            scan_status="success",
                            scan_version=SCANNER_VERSION,
                            scan_duration_ms=_elapsed_ms,
                            row_count=table.get("row_count"),
                            bytes=table.get("bytes"),
                            last_modified_at=table.get("last_altered"),
                            column_count=len(columns),
                            schema_hash=_schema_hash,
                            scan_run_id=scan_run_id,
                        )

                        # Auto-create Phase 1 data quality rules
                        try:
                            from app.services.auto_rule_service import create_phase1_rules
                            await db.refresh(asset)
                            await create_phase1_rules(asset, columns, db)
                        except Exception:
                            logger.exception(
                                "Phase 1 auto-rules failed for asset %s (%s)",
                                asset.asset_id, tname,
                            )
                            try:
                                await db.rollback()
                            except Exception:
                                pass

                        # Auto-trigger column profiling (same pattern as create_asset)
                        try:
                            from app.api.columns import _run_column_profile
                            profile_job_id = job_tracker.create_job(
                                job_type="column_profile",
                                total=0,
                                meta={"asset_id": asset.asset_id, "trigger": "auto_discovery"},
                            )
                            asyncio.create_task(_run_column_profile(profile_job_id, asset.asset_id))
                        except Exception as prof_err:
                            logger.warning("Could not trigger profiling for %s: %s", asset.asset_id, prof_err)

                        llm_reason = classification.get("reason", "")
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": tname,
                                "status": "imported",
                                "asset_id": asset.asset_id,
                                "domain_name": dn,
                                "subdomain_name": sn,
                                "reason": llm_reason if llm_reason else None,
                            },
                            success=True,
                        )

                    except Exception as e:
                        logger.warning("Failed to import table %s.%s.%s: %s", database, schema, tname, e)
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                        job_tracker.append_result(
                            job_id,
                            {
                                "database": database,
                                "schema": schema,
                                "table_name": tname,
                                "status": "error",
                                "reason": str(e),
                            },
                            success=False,
                        )

            # Only mark assets missing when at least one database was actually browsed.
            # Empty scanned_databases means every selection was excluded or errored before
            # any table browse happened — we cannot know what is "missing" in that case.
            if scanned_databases:
                await mark_missing_assets(payload["connection_id"], scanned_ids, db, scanned_databases)

        if all_failed and total_selections > 0:
            job_tracker.mark_failed(job_id, "All database/schema selections failed")
        else:
            job_tracker.mark_completed(job_id)

    except Exception as e:
        logger.error("Discovery job %s failed: %s", job_id, e)
        job_tracker.mark_failed(job_id, str(e))
