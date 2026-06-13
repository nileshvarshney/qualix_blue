# app/services/profiling_service.py
from __future__ import annotations

import json
import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from app.connectors.config import from_orm as config_from_orm
from app.connectors.factory import get_connector
from app.db.database import AsyncSessionLocal
from app.db.models import (
    Asset, AssetSourceMeta, ColumnMetadata, ColumnProfileHistory,
    ProfilingResultPlaceholder, SnowflakeConnection, gen_uuid,
)

import logging

logger = logging.getLogger("dq_platform.profiling_service")


def _profile_column(column_name: str, values: list, total_rows: int) -> dict:
    """Compute column statistics from a list of sampled values."""
    non_null = [v for v in values if v is not None]
    null_count = total_rows - len(non_null)
    null_ratio = null_count / total_rows if total_rows > 0 else 0.0
    distinct_count = len(set(str(v) for v in non_null))
    distinct_ratio = distinct_count / total_rows if total_rows > 0 else 0.0

    min_val = max_val = avg_val = std_val = None
    if non_null:
        str_vals = [str(v) for v in non_null]
        min_val = min(str_vals)
        max_val = max(str_vals)
        try:
            nums = [float(v) for v in non_null]
            avg_val = round(sum(nums) / len(nums), 6)
            if len(nums) > 1:
                std_val = round(statistics.stdev(nums), 6)
        except (ValueError, TypeError):
            pass

    top_values = {
        str(k): v
        for k, v in Counter(str(v) for v in non_null).most_common(10)
    }

    return {
        "null_count": null_count,
        "null_ratio": round(null_ratio, 6),
        "distinct_count": distinct_count,
        "distinct_ratio": round(distinct_ratio, 6),
        "min_value": min_val,
        "max_value": max_val,
        "avg_value": avg_val,
        "std_dev": std_val,
        "top_values": top_values,
        "row_count": total_rows,
    }


def _resolve_coords(asset: Asset, meta: Optional[AssetSourceMeta]) -> Optional[tuple[str, str, str]]:
    """Return (database, schema, table) from AssetSourceMeta, or None if not resolvable."""
    if not meta:
        return None
    database = meta.sf_database_name or meta.generic_database_name
    schema = meta.sf_schema_name or meta.generic_schema_name
    table = meta.sf_table_name or meta.generic_object_name or asset.physical_name
    if not all([database, schema, table]):
        return None
    return database, schema, table


async def profile_table(
    connection_id: str,
    run_id: str,
    asset_id: str,
    database: str,
    schema: str,
    table: str,
) -> dict:
    """Profile a single table. Writes per-column results to DB. Returns summary dict."""
    async with AsyncSessionLocal() as db:
        conn_res = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn_record = conn_res.scalar_one_or_none()
        if not conn_record:
            raise ValueError(f"Connection {connection_id} not found")

        from app.api.connections import _decrypt_password
        config = config_from_orm(conn_record)
        config.password = _decrypt_password(conn_record)

    connector = get_connector(config)

    rows = await connector.sample_rows(database, schema, table, limit=10000)

    if not rows:
        return {"columns_profiled": 0, "row_count": 0, "profile_score": None}

    total_rows = len(rows)
    col_names = list(rows[0].keys())
    col_values = {col: [row.get(col) for row in rows] for col in col_names}

    profile_time = datetime.now(timezone.utc).replace(tzinfo=None)
    today = profile_time.date()

    async with AsyncSessionLocal() as db:
        col_types_res = await db.execute(
            select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
        )
        col_type_map = {
            cm.column_name.upper(): cm.data_type
            for cm in col_types_res.scalars().all()
        }

        total_null_ratio = 0.0
        col_results: list[tuple[str, str, dict]] = []

        for col in col_names:
            stats = _profile_column(col, col_values[col], total_rows)
            data_type = col_type_map.get(col.upper(), "UNKNOWN")
            total_null_ratio += stats["null_ratio"]
            col_results.append((col, data_type, stats))

        profile_score = (
            round(1.0 - (total_null_ratio / len(col_names)), 4)
            if col_names else 0.0
        )

        for col, data_type, stats in col_results:
            existing_res = await db.execute(
                select(ProfilingResultPlaceholder).where(
                    ProfilingResultPlaceholder.run_id == run_id,
                    ProfilingResultPlaceholder.asset_id == asset_id,
                    ProfilingResultPlaceholder.column_name == col,
                )
            )
            existing = existing_res.scalar_one_or_none()
            if existing:
                for k, v in stats.items():
                    setattr(existing, k, v)
                existing.data_type = data_type
                existing.is_placeholder = False
                existing.profiled_at = profile_time
            else:
                db.add(ProfilingResultPlaceholder(
                    run_id=run_id,
                    asset_id=asset_id,
                    column_name=col,
                    data_type=data_type,
                    is_placeholder=False,
                    profiled_at=profile_time,
                    **stats,
                ))

        for col, data_type, stats in col_results:
            cm_res = await db.execute(
                select(ColumnMetadata).where(
                    ColumnMetadata.asset_id == asset_id,
                    ColumnMetadata.column_name == col,
                )
            )
            cm = cm_res.scalar_one_or_none()
            if cm:
                cm.null_count = stats["null_count"]
                cm.unique_count = stats["distinct_count"]
                cm.cardinality_pct = stats["distinct_ratio"]
                if stats["avg_value"] is not None:
                    cm.avg_value = stats["avg_value"]
                if stats["std_dev"] is not None:
                    cm.std_dev = stats["std_dev"]
                cm.last_profiled_at = profile_time

        for col, data_type, stats in col_results:
            hist_res = await db.execute(
                select(ColumnProfileHistory).where(
                    ColumnProfileHistory.asset_id == asset_id,
                    ColumnProfileHistory.column_name == col,
                    ColumnProfileHistory.profile_date == today,
                )
            )
            hist = hist_res.scalar_one_or_none()
            top_str = json.dumps(stats["top_values"])
            if hist:
                hist.null_count = stats["null_count"]
                hist.unique_count = stats["distinct_count"]
                hist.row_count = total_rows
                hist.cardinality_pct = stats["distinct_ratio"]
                hist.top_values = top_str
                hist.run_id = run_id
            else:
                db.add(ColumnProfileHistory(
                    asset_id=asset_id,
                    column_name=col,
                    profile_date=today,
                    null_count=stats["null_count"],
                    unique_count=stats["distinct_count"],
                    row_count=total_rows,
                    cardinality_pct=stats["distinct_ratio"],
                    top_values=top_str,
                    run_id=run_id,
                ))

        asset_res = await db.execute(
            select(Asset).where(Asset.asset_id == asset_id)
        )
        asset = asset_res.scalar_one_or_none()
        if asset:
            asset.latest_profile_score = profile_score
            quality_status = (
                "good" if profile_score >= 0.9
                else "warning" if profile_score >= 0.7
                else "poor"
            )
            asset.latest_quality_status = quality_status

        await db.commit()

        try:
            from app.services.scoring_service import aggregate_dimension_scores
            await aggregate_dimension_scores(db)
        except Exception as e:
            logger.error(f"Dimension score aggregation failed: {e}")

    return {
        "columns_profiled": len(col_names),
        "row_count": total_rows,
        "profile_score": profile_score,
    }


async def profile_all_assets(
    connection_id: str,
    run_id: str,
) -> dict:
    """Profile all active table/view assets for a connection. Returns run metrics."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Asset, AssetSourceMeta)
            .join(
                AssetSourceMeta,
                AssetSourceMeta.asset_id == Asset.asset_id,
                isouter=True,
            )
            .where(
                Asset.connection_id == connection_id,
                Asset.asset_type.in_(["table", "view"]),
                Asset.status == "active",
            )
        )
        rows = result.all()

    profiled = 0
    failed = 0
    errors: list[str] = []

    for asset, meta in rows:
        coords = _resolve_coords(asset, meta)
        if coords is None:
            logger.warning("Skipping asset %s: cannot resolve db/schema/table", asset.asset_id)
            continue

        database, schema, table = coords
        try:
            await profile_table(
                connection_id=connection_id,
                run_id=run_id,
                asset_id=asset.asset_id,
                database=database,
                schema=schema,
                table=table,
            )
            profiled += 1
        except Exception as exc:
            failed += 1
            logger.error("Failed to profile %s.%s.%s: %s", database, schema, table, exc)
            errors.append(f"{database}.{schema}.{table}: {exc}")

    return {"assets_profiled": profiled, "assets_failed": failed, "errors": errors}
