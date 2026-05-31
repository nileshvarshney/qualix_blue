from __future__ import annotations

"""
Auto Data Discovery background service.

Scans selected Snowflake databases/schemas, deduplicates against existing
DataAsset records, classifies each new table using the LLM, creates the
asset, and triggers column profiling — all in a single background job.
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import AuditLog, DataAsset, Domain, DQRule, Subdomain, SnowflakeConnection
from app.services import job_tracker
from app.services.ai_service import classify_table

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


async def _get_existing_table_names(db, connection_id: str, database: str, schema: str, table_names: list[str]) -> set[str]:
    if not table_names:
        return set()
    result = await db.execute(
        select(DataAsset.sf_table_name).where(
            DataAsset.connection_id == connection_id,
            DataAsset.sf_database_name == database,
            DataAsset.sf_schema_name == schema,
            DataAsset.sf_table_name.in_(table_names),
            DataAsset.is_active == True,
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


async def run_discovery(job_id: str, payload: dict) -> None:
    """
    Background orchestrator for auto data discovery.

    For each (database, schema) selection:
      1. Browse Snowflake tables
      2. Dedup against existing DataAsset records for this connection
      3. For new tables: fetch columns, classify via LLM, resolve domain/subdomain
      4. Create DataAsset + AuditLog, trigger column profiling
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

            total_selections = len(payload.get("selections", []))
            all_failed = True

            for sel in payload.get("selections", []):
                database = sel["database"]
                schema = sel["schema"]

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
                    tables = await asyncio.to_thread(
                        _browse_tables_sync, conn, db_safe, schema_safe
                    )
                    all_failed = False
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

                for table in tables:
                    tname = table["table_name"]

                    if tname in existing:
                        # Backfill Phase 1 rules for assets that existed before auto-rules were added
                        try:
                            from app.services.auto_rule_service import create_phase1_rules
                            from sqlalchemy import func as _func

                            existing_asset_res = await db.execute(
                                select(DataAsset).where(
                                    DataAsset.connection_id == payload["connection_id"],
                                    DataAsset.sf_database_name == database,
                                    DataAsset.sf_schema_name == schema,
                                    DataAsset.sf_table_name == tname,
                                    DataAsset.is_active == True,
                                )
                            )
                            existing_asset = existing_asset_res.scalar_one_or_none()

                            if existing_asset:
                                rule_count_res = await db.execute(
                                    select(_func.count()).select_from(DQRule).where(
                                        DQRule.asset_id == existing_asset.asset_id
                                    )
                                )
                                if (rule_count_res.scalar() or 0) == 0:
                                    try:
                                        table_safe = _validate_ident(tname, "table")
                                        columns = await asyncio.to_thread(
                                            _browse_columns_sync, conn, db_safe, schema_safe, table_safe
                                        )
                                        await create_phase1_rules(existing_asset, columns, db)
                                        logger.info(
                                            "Backfilled Phase 1 rules for existing asset %s (%s)",
                                            existing_asset.asset_id, tname,
                                        )
                                    except Exception as backfill_err:
                                        logger.exception(
                                            "Phase 1 backfill failed for %s: %s", tname, backfill_err
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
                        table_safe = _validate_ident(tname, "table")

                        # Fetch column metadata for LLM classification
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

                        asset = DataAsset(
                            asset_id=str(uuid.uuid4()),
                            connection_id=payload["connection_id"],
                            sf_database_name=database,
                            sf_schema_name=schema,
                            sf_table_name=tname,
                            domain_id=domain_id,
                            subdomain_id=subdomain_id,
                            table_type=table.get("table_type"),
                            table_description=table.get("comment") or "",
                            criticality=payload.get("criticality", "medium"),
                            owner_name=payload.get("owner_name"),
                            owner_email=payload.get("owner_email"),
                            technical_owner_name=payload.get("technical_owner_name"),
                            technical_owner_email=payload.get("technical_owner_email"),
                        )
                        db.add(asset)
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
                                    "domain_id": domain_id,
                                    "subdomain_id": subdomain_id,
                                    "source": "auto_discovery",
                                },
                            )
                        )
                        await db.commit()

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

        if all_failed and total_selections > 0:
            job_tracker.mark_failed(job_id, "All database/schema selections failed")
        else:
            job_tracker.mark_completed(job_id)

    except Exception as e:
        logger.error("Discovery job %s failed: %s", job_id, e)
        job_tracker.mark_failed(job_id, str(e))
