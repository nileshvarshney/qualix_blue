from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ColumnMetadata, DataAsset, SchemaBaseline, SchemaDriftEvent
from app.services.schema_drift_service import (
    approve_baseline as _approve_baseline,
    initialize_baseline as _initialize_baseline,
)

router = APIRouter(prefix="/api/v1/assets", tags=["Schema Drift"])


def _fmt_baseline(b: SchemaBaseline) -> dict:
    return {
        "baseline_id":       b.baseline_id,
        "asset_id":          b.asset_id,
        "status":            b.status,
        "columns_snapshot":  b.columns_snapshot,
        "approved_by":       b.approved_by,
        "approved_at":       b.approved_at.isoformat() if b.approved_at else None,
        "created_at":        b.created_at.isoformat() if b.created_at else None,
    }


def _fmt_event(e: SchemaDriftEvent) -> dict:
    return {
        "event_id":    e.event_id,
        "asset_id":    e.asset_id,
        "baseline_id": e.baseline_id,
        "detected_at": e.detected_at.isoformat() if e.detected_at else None,
        "change_type": e.change_type,
        "column_name": e.column_name,
        "old_value":   e.old_value,
        "new_value":   e.new_value,
        "status":      e.status,
        "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
        "resolved_by": e.resolved_by,
    }


async def _get_asset_or_404(asset_id: str, db: AsyncSession) -> DataAsset:
    result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/{asset_id}/schema-drift")
async def get_schema_drift(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    baseline_result = await db.execute(
        select(SchemaBaseline).where(
            SchemaBaseline.asset_id == asset_id,
            SchemaBaseline.status == "active",
        )
    )
    baseline = baseline_result.scalar_one_or_none()

    # Auto-initialize baseline on first visit if column profiling has already run
    if baseline is None:
        has_columns = await db.execute(
            select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id).limit(1)
        )
        if has_columns.scalar_one_or_none():
            baseline = await _initialize_baseline(asset_id, db)

    events_result = await db.execute(
        select(SchemaDriftEvent)
        .where(SchemaDriftEvent.asset_id == asset_id, SchemaDriftEvent.status == "open")
        .order_by(SchemaDriftEvent.detected_at.desc())
    )
    events = events_result.scalars().all()

    return {
        "baseline":    _fmt_baseline(baseline) if baseline else None,
        "open_events": [_fmt_event(e) for e in events],
    }


@router.post("/{asset_id}/schema-drift/approve")
async def approve_schema_baseline(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    open_result = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        )
    )
    accepted_count = len(open_result.scalars().all())

    user_id = user.get("user_id") or user.get("sub") or "unknown"
    new_baseline = await _approve_baseline(asset_id, user_id, db)

    return {
        "new_baseline":   _fmt_baseline(new_baseline),
        "accepted_count": accepted_count,
    }


@router.get("/{asset_id}/schema-drift/history")
async def get_schema_drift_history(
    asset_id: str,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    events_result = await db.execute(
        select(SchemaDriftEvent)
        .where(SchemaDriftEvent.asset_id == asset_id)
        .order_by(SchemaDriftEvent.detected_at.desc())
        .limit(limit)
    )
    return {"events": [_fmt_event(e) for e in events_result.scalars().all()]}
