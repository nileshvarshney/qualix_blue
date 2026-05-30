from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, delete, and_

from app.db.database import get_db
from app.db.models import ColumnMetadata, ColumnProfileHistory, DataAsset
from app.core.security import get_current_user
from app.services import job_tracker

DRIFT_NULL_PCT_THRESHOLD = 5.0
DRIFT_CARDINALITY_THRESHOLD = 10.0

logger = logging.getLogger("dq_platform.columns")

router = APIRouter(prefix="/assets", tags=["Columns"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_col(col: ColumnMetadata, total_rows: int = 0) -> dict:
    null_pct = (
        round(col.null_count / total_rows * 100, 2)
        if col.null_count is not None and total_rows > 0
        else None
    )
    top = json.loads(col.top_values) if col.top_values else None
    samples = json.loads(col.sample_values) if col.sample_values else None
    return {
        "column_id":        col.col_id,
        "asset_id":         col.asset_id,
        "column_name":      col.column_name,
        "data_type":        col.data_type,
        "ordinal_position": col.ordinal_position,
        "description":      col.description,
        "is_primary_key":   col.is_primary_key,
        "is_nullable":      col.is_nullable,
        "null_pct":         null_pct,
        "distinct_count":   col.unique_count,
        "cardinality_pct":  col.cardinality_pct,
        "min_value":        col.min_value,
        "max_value":        col.max_value,
        "mean":             col.avg_value,
        "std_dev":          col.std_dev,
        "top_values":       top,
        "sample_values":    samples,
        "last_profiled_at": col.last_profiled_at.isoformat() + 'Z' if col.last_profiled_at else None,
        "updated_at":       col.updated_at.isoformat() if col.updated_at else None,
    }



@router.put("/{asset_id}/columns/{column_name}")
async def update_column(
    asset_id: str,
    column_name: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update column metadata such as description, is_primary_key, etc."""
    result = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset_id,
            ColumnMetadata.column_name == column_name,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(404, "Column metadata not found")

    updatable = ("description", "is_primary_key", "is_nullable", "data_type")
    for field in updatable:
        if field in payload:
            setattr(col, field, payload[field])
    col.updated_at = _now()
    await db.commit()
    await db.refresh(col)
    return _fmt_col(col)


async def _run_column_profile(job_id: str, asset_id: str) -> None:
    """Background task: profiles all columns in 3 Snowflake round-trips regardless of column count.

    Optimizations vs. the naive per-column loop:
    1. ONE multi-column stats query — single table scan for all columns' null_count / unique_count /
       min / max / avg / std_dev instead of N sequential queries.
    2. ONE TABLESAMPLE query for sample values — no per-column ORDER BY RANDOM() full scans.
    3. asyncio.gather() for top_values — all GROUP-BY frequency queries run concurrently.
    4. Single PostgreSQL commit at the end — not N per-column commits.
    """
    job_tracker.mark_running(job_id)
    try:
        from app.db.database import AsyncSessionLocal
        from app.core.config import settings
        from app.services.execution_service import _resolve_executor

        async with AsyncSessionLocal() as db:
            asset = (
                await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
            ).scalar_one_or_none()
            if not asset:
                job_tracker.mark_failed(job_id, f"Asset {asset_id} not found")
                return

            db_name   = asset.sf_database_name or settings.snowflake_database
            schema    = asset.sf_schema_name
            table     = asset.sf_table_name
            db_prefix = f'"{db_name}".' if db_name else ""
            table_ref = f'{db_prefix}"{schema}"."{table}"'

            try:
                executor = await _resolve_executor(asset, db, database=db_name or None)
            except RuntimeError as e:
                job_tracker.mark_failed(job_id, str(e))
                return

            async def run_sql(sql: str) -> list[dict]:
                if hasattr(executor, "aexecute_query"):
                    return await executor.aexecute_query(sql)
                return await asyncio.to_thread(executor.execute_query, sql)

            if settings.snowflake_profile_warehouse:
                try:
                    await run_sql(f"USE WAREHOUSE {settings.snowflake_profile_warehouse}")
                except Exception:
                    pass

            # ── Step 1: column list from INFORMATION_SCHEMA ──────────────────
            info_db  = f'"{db_name}"' if db_name else f'"{schema}"'
            col_info = await run_sql(
                f'SELECT column_name, data_type, is_nullable, ordinal_position '
                f'FROM {info_db}.INFORMATION_SCHEMA.COLUMNS '
                f"WHERE UPPER(table_schema) = '{schema.upper()}' "
                f"  AND UPPER(table_name)   = '{table.upper()}' "
                f'ORDER BY ordinal_position'
            )
            if not col_info:
                job_tracker.mark_completed(job_id)
                return

            job_tracker.update_job(job_id, total=len(col_info))

            # Classify columns
            def _classify(dt: str) -> tuple[bool, bool]:
                up = dt.upper()
                numeric = any(t in up for t in ("NUMBER", "INT", "FLOAT", "DECIMAL", "DOUBLE", "REAL", "NUMERIC"))
                complex_ = any(t in up for t in ("ARRAY", "OBJECT", "VARIANT", "GEOGRAPHY", "GEOMETRY"))
                return numeric, complex_

            simple_cols  = [(c["column_name"], c["data_type"], c.get("is_nullable","YES")=="YES", c.get("ordinal_position"))
                            for c in col_info if not _classify(c["data_type"])[1]]
            complex_cols = [(c["column_name"], c["data_type"], c.get("is_nullable","YES")=="YES", c.get("ordinal_position"))
                            for c in col_info if     _classify(c["data_type"])[1]]

            # ── Step 2: SINGLE multi-column stats query (one table scan) ─────
            # Builds: SELECT COUNT(*) AS total_rows,
            #           COUNT_IF("c1" IS NULL) AS "c1__nc", COUNT(DISTINCT "c1") AS "c1__uc", ...
            parts = ["COUNT(*) AS total_rows"]
            for col_name, data_type, _, _ in simple_cols:
                is_numeric, _ = _classify(data_type)
                k = col_name.lower()
                parts += [
                    f'COUNT_IF("{col_name}" IS NULL)     AS "{k}__nc"',
                    f'COUNT(DISTINCT "{col_name}")        AS "{k}__uc"',
                    f'MIN("{col_name}")::VARCHAR           AS "{k}__min"',
                    f'MAX("{col_name}")::VARCHAR           AS "{k}__max"',
                ]
                if is_numeric:
                    parts += [
                        f'AVG("{col_name}")    AS "{k}__avg"',
                        f'STDDEV("{col_name}") AS "{k}__std"',
                    ]
            # For complex columns: only null count
            for col_name, _, _, _ in complex_cols:
                k = col_name.lower()
                parts.append(f'COUNT_IF("{col_name}" IS NULL) AS "{k}__nc"')

            stats_sql = f'SELECT {", ".join(parts)} FROM {table_ref}'
            stats_row = (await run_sql(stats_sql))[0]
            total_rows = int(stats_row.get("total_rows") or 0)

            # ── Step 3: ONE TABLESAMPLE query for sample values (all columns) ─
            # TABLESAMPLE BERNOULLI(1) is far cheaper than ORDER BY RANDOM() per column.
            sample_col_list = ", ".join(f'"{c[0]}"::VARCHAR AS "{c[0].lower()}"' for c in simple_cols)
            samples_by_col: dict[str, list[str]] = {c[0]: [] for c in simple_cols}
            if simple_cols:
                try:
                    sample_sql = (
                        f'SELECT {sample_col_list} '
                        f'FROM {table_ref} TABLESAMPLE BERNOULLI(1) LIMIT 20'
                    )
                    sample_rows = await run_sql(sample_sql)
                    for row in sample_rows:
                        for col_name, _, _, _ in simple_cols:
                            if len(samples_by_col[col_name]) < 5:
                                v = row.get(col_name.lower())
                                if v is not None:
                                    samples_by_col[col_name].append(str(v))
                except Exception:
                    pass  # samples are optional; don't fail the whole profile

            # ── Step 4: top_values — concurrent GROUP BY queries ─────────────
            async def _top_values(col_name: str) -> tuple[str, str]:
                try:
                    rows = await run_sql(
                        f'SELECT "{col_name}"::VARCHAR AS val, COUNT(*) AS cnt '
                        f'FROM {table_ref} WHERE "{col_name}" IS NOT NULL '
                        f'GROUP BY "{col_name}" ORDER BY cnt DESC LIMIT 10'
                    )
                    return col_name, json.dumps([{"value": r["val"], "count": r["cnt"]} for r in rows])
                except Exception:
                    return col_name, json.dumps([])

            top_results = await asyncio.gather(*[_top_values(c[0]) for c in simple_cols])
            top_by_col  = dict(top_results)

            # ── Step 5: upsert all column_metadata rows — single commit ───────
            now = _now()
            all_cols = simple_cols + complex_cols
            profile_date = date.today()

            existing_map: dict[str, ColumnMetadata] = {}
            ex_res = await db.execute(
                select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
            )
            for rec in ex_res.scalars().all():
                existing_map[rec.column_name] = rec

            history_rows: list[dict] = []

            for col_name, data_type, is_nullable, ordinal in all_cols:
                is_numeric, is_complex = _classify(data_type)
                k = col_name.lower()

                null_count   = int(stats_row.get(f"{k}__nc") or 0)
                unique_count = int(stats_row.get(f"{k}__uc") or 0) if not is_complex else 0
                cardinality  = round(unique_count / total_rows * 100, 2) if (total_rows > 0 and not is_complex) else None
                top_val      = top_by_col.get(col_name, json.dumps([])) if not is_complex else None

                col_rec = existing_map.get(col_name) or ColumnMetadata(
                    col_id=str(uuid.uuid4()), asset_id=asset_id, column_name=col_name
                )
                if col_name not in existing_map:
                    db.add(col_rec)

                col_rec.data_type        = data_type
                col_rec.is_nullable      = is_nullable
                col_rec.ordinal_position = ordinal
                col_rec.null_count       = null_count
                col_rec.unique_count     = unique_count
                col_rec.cardinality_pct  = cardinality
                col_rec.min_value        = stats_row.get(f"{k}__min") if not is_complex else None
                col_rec.max_value        = stats_row.get(f"{k}__max") if not is_complex else None
                col_rec.avg_value        = stats_row.get(f"{k}__avg") if is_numeric else None
                col_rec.std_dev          = stats_row.get(f"{k}__std") if is_numeric else None
                col_rec.top_values       = top_val if top_val is not None else json.dumps([])
                col_rec.sample_values    = json.dumps(samples_by_col.get(col_name, []))
                col_rec.last_profiled_at = now
                col_rec.updated_by       = "profiler"

                history_rows.append({
                    "history_id":    str(uuid.uuid4()),
                    "asset_id":      asset_id,
                    "column_name":   col_name,
                    "profile_date":  profile_date,
                    "null_count":    null_count,
                    "unique_count":  unique_count if not is_complex else None,
                    "row_count":     total_rows,
                    "cardinality_pct": cardinality,
                    "top_values":    top_val,
                    "created_at":    now,
                })

                job_tracker.append_result(
                    job_id,
                    {"column_name": col_name, "null_pct": round(null_count / total_rows * 100, 2) if total_rows else None, "status": "profiled"},
                    success=True,
                )

            # Upsert history — one snapshot per column per day
            # Snowflake doesn't support ON CONFLICT; use delete-then-insert instead
            if history_rows:
                for row in history_rows:
                    await db.execute(
                        delete(ColumnProfileHistory).where(
                            and_(
                                ColumnProfileHistory.asset_id == row["asset_id"],
                                ColumnProfileHistory.column_name == row["column_name"],
                                ColumnProfileHistory.profile_date == row["profile_date"],
                            )
                        )
                    )
                await db.execute(insert(ColumnProfileHistory).values(history_rows))

            await db.commit()  # single commit for all columns + history

            # Auto-create Phase 2 data quality rules from profiling stats
            try:
                from app.services.auto_rule_service import create_phase2_rules
                col_profiles_res = await db.execute(
                    select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
                )
                col_profiles = col_profiles_res.scalars().all()
                await db.refresh(asset)
                await create_phase2_rules(asset, list(col_profiles), db)
            except Exception:
                logger.exception("Phase 2 auto-rules failed for asset %s", asset_id)

        job_tracker.mark_completed(job_id)
        logger.info("Column profiling job %s completed for asset %s (%d columns)", job_id, asset_id, len(col_info))
    except Exception as exc:
        logger.exception("Column profiling job %s failed: %s", job_id, exc)
        job_tracker.mark_failed(job_id, str(exc))


@router.post("/{asset_id}/columns/profile")
async def start_column_profile(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Queue a background job to compute column statistics for an asset via Snowflake."""
    asset_result = await db.execute(
        select(DataAsset).where(DataAsset.asset_id == asset_id)
    )
    if not asset_result.scalar_one_or_none():
        raise HTTPException(404, "Asset not found")

    job_id = job_tracker.create_job(
        job_type="column_profile",
        total=0,
        meta={"asset_id": asset_id},
    )
    asyncio.create_task(_run_column_profile(job_id, asset_id))
    return {"job_id": job_id, "status": "queued"}


@router.get("/{asset_id}/columns/profile/status")
async def get_profile_status(
    asset_id: str,
    job_id: str,
    user: dict = Depends(get_current_user),
):
    """Get the status of a column profiling job."""
    job = job_tracker.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("meta", {}).get("asset_id") != asset_id:
        raise HTTPException(403, "Job does not belong to this asset")
    return job


def _serialize_history(rows: list[ColumnProfileHistory]) -> list[dict]:
    out = []
    for r in rows:
        null_pct = round(r.null_count / r.row_count * 100, 2) if (r.null_count is not None and r.row_count) else None
        out.append({
            "column_name":    r.column_name,
            "profile_date":   r.profile_date.isoformat(),
            "null_pct":       null_pct,
            "cardinality_pct": r.cardinality_pct,
            "row_count":      r.row_count,
            "top_values":     json.loads(r.top_values) if r.top_values else [],
        })
    return out


@router.get("/{asset_id}/columns/profile-history")
async def get_profile_history(
    asset_id: str,
    days: int = Query(default=90, ge=1, le=365),
    column: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return per-day profile snapshots for all columns (or one column) in the given window."""
    since = date.today() - timedelta(days=days)
    q = (
        select(ColumnProfileHistory)
        .where(
            ColumnProfileHistory.asset_id == asset_id,
            ColumnProfileHistory.profile_date >= since,
        )
        .order_by(ColumnProfileHistory.column_name, ColumnProfileHistory.profile_date)
    )
    if column:
        q = q.where(ColumnProfileHistory.column_name == column)
    rows = (await db.execute(q)).scalars().all()
    return _serialize_history(rows)


@router.get("/{asset_id}/columns/profile-history/summary")
async def get_profile_history_summary(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return latest vs previous snapshot per column with drift_detected flag."""
    dates_q = (
        select(ColumnProfileHistory.profile_date)
        .where(ColumnProfileHistory.asset_id == asset_id)
        .distinct()
        .order_by(ColumnProfileHistory.profile_date.desc())
        .limit(2)
    )
    dates = (await db.execute(dates_q)).scalars().all()
    if not dates:
        return []

    rows_q = select(ColumnProfileHistory).where(
        ColumnProfileHistory.asset_id == asset_id,
        ColumnProfileHistory.profile_date.in_(dates),
    )
    rows = (await db.execute(rows_q)).scalars().all()

    by_col: dict[str, list[ColumnProfileHistory]] = defaultdict(list)
    for r in rows:
        by_col[r.column_name].append(r)
    for snaps in by_col.values():
        snaps.sort(key=lambda x: x.profile_date, reverse=True)

    summary: list[dict] = []
    for col_name, snaps in by_col.items():
        latest = snaps[0]
        prev   = snaps[1] if len(snaps) > 1 else None

        latest_null_pct = round(latest.null_count / latest.row_count * 100, 2) if (latest.null_count is not None and latest.row_count) else None
        prev_null_pct   = round(prev.null_count / prev.row_count * 100, 2) if (prev and prev.null_count is not None and prev.row_count) else None
        null_delta      = round(latest_null_pct - prev_null_pct, 2) if (latest_null_pct is not None and prev_null_pct is not None) else None
        card_delta      = round((latest.cardinality_pct or 0) - (prev.cardinality_pct or 0), 2) if prev else None

        drift = bool(
            (null_delta is not None and abs(null_delta) > DRIFT_NULL_PCT_THRESHOLD) or
            (card_delta is not None and abs(card_delta) > DRIFT_CARDINALITY_THRESHOLD)
        )

        summary.append({
            "column_name":           col_name,
            "snapshots_count":       len(snaps),
            "latest_null_pct":       latest_null_pct,
            "prev_null_pct":         prev_null_pct,
            "null_pct_delta":        null_delta,
            "latest_cardinality_pct": latest.cardinality_pct,
            "prev_cardinality_pct":  prev.cardinality_pct if prev else None,
            "cardinality_delta":     card_delta,
            "drift_detected":        drift,
        })

    return summary
