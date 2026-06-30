# app/services/profiling_results_store.py
from __future__ import annotations

from typing import Optional

from sqlalchemy import select, desc, func

from app.db.models import Asset, ColumnProfileHistory, ProfilingResultPlaceholder, ScanJobRun


async def get_asset_profile_summary(
    db, asset_id: str, run_id: Optional[str] = None
) -> Optional[dict]:
    """Return asset-level profile summary. Uses latest run when run_id is None."""
    if run_id is None:
        run_res = await db.execute(
            select(ProfilingResultPlaceholder.run_id)
            .where(
                ProfilingResultPlaceholder.asset_id == asset_id,
                ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
            )
            .order_by(desc(ProfilingResultPlaceholder.profiled_at))
            .limit(1)
        )
        run_id = run_res.scalar_one_or_none()
        if not run_id:
            return None

    stats_res = await db.execute(
        select(
            func.count(ProfilingResultPlaceholder.column_name).label("column_count"),
            func.avg(ProfilingResultPlaceholder.null_ratio).label("avg_null_ratio"),
            func.max(ProfilingResultPlaceholder.row_count).label("row_count"),
            func.max(ProfilingResultPlaceholder.profiled_at).label("profiled_at"),
        ).where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.run_id == run_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
    )
    row = stats_res.one()

    if row.column_count == 0:
        return None

    asset_res = await db.execute(
        select(Asset).where(Asset.asset_id == asset_id)
    )
    asset = asset_res.scalar_one_or_none()

    return {
        "asset_id": asset_id,
        "run_id": run_id,
        "column_count": row.column_count,
        "avg_null_ratio": round(float(row.avg_null_ratio or 0), 4),
        "row_count": int(row.row_count) if row.row_count else None,
        "profiled_at": row.profiled_at.isoformat() if row.profiled_at else None,
        "profile_score": (
            round(float(asset.latest_profile_score), 4)
            if asset and asset.latest_profile_score is not None
            else None
        ),
        "quality_status": asset.latest_quality_status if asset else None,
    }


async def get_column_profiles(
    db, asset_id: str, run_id: Optional[str] = None
) -> list[dict]:
    """Return per-column profile results. Uses latest run when run_id is None."""
    if run_id is None:
        run_res = await db.execute(
            select(ProfilingResultPlaceholder.run_id)
            .where(
                ProfilingResultPlaceholder.asset_id == asset_id,
                ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
            )
            .order_by(desc(ProfilingResultPlaceholder.profiled_at))
            .limit(1)
        )
        run_id = run_res.scalar_one_or_none()
        if not run_id:
            return []

    cols_res = await db.execute(
        select(ProfilingResultPlaceholder)
        .where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.run_id == run_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
        .order_by(ProfilingResultPlaceholder.column_name)
    )
    return [_col_dict(c) for c in cols_res.scalars().all()]


async def get_profile_run_history(
    db, asset_id: str, limit: int = 20
) -> list[dict]:
    """Return list of profile runs for an asset, most recent first."""
    runs_res = await db.execute(
        select(
            ProfilingResultPlaceholder.run_id,
            func.max(ProfilingResultPlaceholder.profiled_at).label("profiled_at"),
            func.count(ProfilingResultPlaceholder.column_name).label("column_count"),
        )
        .where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
        .group_by(ProfilingResultPlaceholder.run_id)
        .order_by(desc(func.max(ProfilingResultPlaceholder.profiled_at)))
        .limit(limit)
    )
    rows = runs_res.all()

    result = []
    for row in rows:
        run_res = await db.execute(
            select(ScanJobRun).where(ScanJobRun.run_id == row.run_id)
        )
        run = run_res.scalar_one_or_none()
        result.append({
            "run_id": row.run_id,
            "profiled_at": row.profiled_at.isoformat() if row.profiled_at else None,
            "column_count": row.column_count,
            "status": run.status if run else "unknown",
            "trigger_type": run.trigger_type if run else None,
        })
    return result


def _col_dict(c: ProfilingResultPlaceholder) -> dict:
    return {
        "profiling_id": c.profiling_id,
        "column_name": c.column_name,
        "data_type": c.data_type,
        "null_count": c.null_count,
        "null_ratio": round(float(c.null_ratio or 0), 4),
        "distinct_count": c.distinct_count,
        "distinct_ratio": round(float(c.distinct_ratio or 0), 4),
        "min_value": c.min_value,
        "max_value": c.max_value,
        "avg_value": float(c.avg_value) if c.avg_value is not None else None,
        "std_dev": float(c.std_dev) if c.std_dev is not None else None,
        "top_values": c.top_values or {},
        "row_count": c.row_count,
        "profiled_at": c.profiled_at.isoformat() if c.profiled_at else None,
    }
