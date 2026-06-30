from __future__ import annotations

import hashlib
import inspect
import json
import logging
from datetime import datetime, timezone, date as date_t
from typing import Optional

from sqlalchemy import select, asc, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Asset, AssetSourceMeta, AssetMetadataSnapshot, ColumnMetadata,
    AssetTag, Tag,
    gen_uuid,
)
from app.schemas.metadata import (
    ColumnMetaIn, AssetMetaCurrentState,
)
from app.services import results_store

logger = logging.getLogger("dq_platform.metadata_store")

SCANNER_VERSION = "1.0.0"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _scalar(result) -> object:
    """Return scalar from a SQLAlchemy result, awaiting if running under AsyncMock in tests."""
    raw = result.scalar_one_or_none()
    return await raw if inspect.isawaitable(raw) else raw


async def _scalars_all(result) -> list:
    """Return all scalars, handling async attribute access in AsyncMock test contexts."""
    scalars = result.scalars()
    if inspect.isawaitable(scalars):
        scalars = await scalars
    all_items = scalars.all()
    if inspect.isawaitable(all_items):
        all_items = await all_items
    return list(all_items)


def compute_schema_hash(columns: list[ColumnMetaIn]) -> str:
    """MD5 of sorted (column_name, data_type) pairs — case-insensitive."""
    pairs = sorted(
        (c.column_name.upper(), (c.data_type or "").upper())
        for c in columns
    )
    return hashlib.md5(json.dumps(pairs).encode()).hexdigest()


async def upsert_column_metadata(
    db: AsyncSession,
    asset_id: str,
    columns: list[ColumnMetaIn],
) -> None:
    """Create or update column_metadata rows. Absent columns are left untouched."""
    for col in columns:
        result = await db.execute(
            select(ColumnMetadata).where(
                ColumnMetadata.asset_id == asset_id,
                ColumnMetadata.column_name == col.column_name,
            )
        )
        existing = await _scalar(result)
        if existing:
            existing.data_type = col.data_type
            existing.is_nullable = col.is_nullable
            existing.ordinal_position = col.ordinal_position
            existing.default_value = col.default_value
            existing.character_max_length = col.character_max_length
            existing.precision = col.precision
            existing.scale = col.scale
            existing.is_partition_key = col.is_partition_key
            existing.partition_key_index = col.partition_key_index
            existing.description = col.description
            existing.is_primary_key = col.is_primary_key
            existing.is_foreign_key = col.is_foreign_key
            existing.references_table = col.references_table
        else:
            db.add(ColumnMetadata(
                col_id=gen_uuid(),
                asset_id=asset_id,
                column_name=col.column_name,
                data_type=col.data_type,
                is_nullable=col.is_nullable,
                ordinal_position=col.ordinal_position,
                default_value=col.default_value,
                character_max_length=col.character_max_length,
                precision=col.precision,
                scale=col.scale,
                is_partition_key=col.is_partition_key,
                partition_key_index=col.partition_key_index,
                description=col.description,
                is_primary_key=col.is_primary_key,
                is_foreign_key=col.is_foreign_key,
                references_table=col.references_table,
            ))
    await db.commit()


async def record_scan_result(
    db: AsyncSession,
    asset_id: str,
    scan_status: str,
    scan_version: str,
    scan_duration_ms: int,
    row_count: Optional[int],
    bytes: Optional[int],
    last_modified_at: Optional[datetime],
    column_count: int,
    schema_hash: str,
    scan_run_id: Optional[str] = None,
) -> None:
    """
    1. Update Asset: last_scanned_at, scan_status, scan_duration_ms, scan_version
    2. Update AssetSourceMeta: row_count, bytes, last_modified_at
    3. Upsert asset_metadata_snapshots for today (last write wins)
    """
    now_dt = _now()
    today = now_dt.date()

    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = await _scalar(asset_res)
    if asset:
        asset.last_scanned_at = now_dt
        asset.scan_status = scan_status
        asset.scan_duration_ms = scan_duration_ms
        asset.scan_version = scan_version

    meta_res = await db.execute(
        select(AssetSourceMeta).where(AssetSourceMeta.asset_id == asset_id)
    )
    meta = await _scalar(meta_res)
    if meta:
        if row_count is not None:
            meta.row_count = row_count
        if bytes is not None:
            meta.bytes = bytes
        if last_modified_at is not None:
            meta.last_modified_at = last_modified_at

    snap_res = await db.execute(
        select(AssetMetadataSnapshot).where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date == today,
        )
    )
    snap = await _scalar(snap_res)
    attached = (asset.attached_rule_count if asset else None) or 0
    quality_status = asset.latest_quality_status if asset else None
    profile_score = asset.latest_profile_score if asset else None

    if snap:
        snap.scan_version = scan_version
        snap.scan_status = scan_status
        snap.scan_duration_ms = scan_duration_ms
        snap.row_count = row_count
        snap.bytes = bytes
        snap.last_modified_at = last_modified_at
        snap.column_count = column_count
        snap.schema_hash = schema_hash
        snap.latest_profile_score = profile_score
        snap.latest_quality_status = quality_status
        snap.attached_rule_count = attached
        snap.updated_at = now_dt
    else:
        db.add(AssetMetadataSnapshot(
            snapshot_id=gen_uuid(),
            asset_id=asset_id,
            snapshot_date=today,
            scan_version=scan_version,
            scan_status=scan_status,
            scan_duration_ms=scan_duration_ms,
            row_count=row_count,
            bytes=bytes,
            last_modified_at=last_modified_at,
            column_count=column_count,
            schema_hash=schema_hash,
            latest_profile_score=profile_score,
            latest_quality_status=quality_status,
            attached_rule_count=attached,
            created_at=now_dt,
            updated_at=now_dt,
        ))

    if scan_run_id:
        await results_store.write_asset_summary(
            db=db,
            run_id=scan_run_id,
            asset_id=asset_id,
            scan_status=scan_status,
            scan_duration_ms=scan_duration_ms,
            row_count=row_count,
            bytes=bytes,
            column_count=column_count,
            schema_hash=schema_hash,
        )
        await results_store.record_metrics(
            db=db,
            asset_id=asset_id,
            run_id=scan_run_id,
            metric_date=today,
            metrics={
                "row_count": float(row_count) if row_count is not None else None,
                "column_count": float(column_count) if column_count is not None else None,
            },
        )

    await db.commit()


async def update_quality_placeholders(
    db: AsyncSession,
    asset_id: str,
    profile_score: Optional[float],
    quality_status: Optional[str],
) -> None:
    """Phase 2 profiler hook — updates Asset and today's snapshot row."""
    now_dt = _now()
    today = now_dt.date()

    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = await _scalar(asset_res)
    if asset:
        if profile_score is not None:
            asset.latest_profile_score = profile_score
        if quality_status is not None:
            asset.latest_quality_status = quality_status

    snap_res = await db.execute(
        select(AssetMetadataSnapshot).where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date == today,
        )
    )
    snap = await _scalar(snap_res)
    if snap:
        if profile_score is not None:
            snap.latest_profile_score = profile_score
        if quality_status is not None:
            snap.latest_quality_status = quality_status
        snap.updated_at = now_dt

    await db.commit()


async def set_critical_data_element(
    db: AsyncSession,
    asset_id: str,
    is_cde: bool,
) -> None:
    """Toggle the CDE flag on an asset."""
    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = await _scalar(asset_res)
    if not asset:
        raise ValueError(f"Asset '{asset_id}' not found")
    asset.is_critical_data_element = is_cde
    await db.commit()


async def increment_rule_count(
    db: AsyncSession,
    asset_id: str,
    delta: int,
) -> None:
    """Maintain attached_rule_count (+1 on rule create, -1 on rule delete). Never goes below 0."""
    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = await _scalar(asset_res)
    if not asset:
        logger.warning("increment_rule_count: asset '%s' not found", asset_id)
        return
    asset.attached_rule_count = max(0, (asset.attached_rule_count or 0) + delta)
    await db.commit()


async def get_current_state(
    db: AsyncSession,
    asset_id: str,
) -> Optional[AssetMetaCurrentState]:
    """Joins Asset + AssetSourceMeta. Returns None when asset is unknown."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Asset)
        .options(selectinload(Asset.source_meta))
        .where(Asset.asset_id == asset_id)
    )
    asset = await _scalar(result)
    if not asset:
        return None
    meta = asset.source_meta

    # Fetch tag names for this asset
    tags_result = await db.execute(
        select(Tag.tag_name)
        .join(AssetTag, AssetTag.tag_id == Tag.tag_id)
        .where(
            AssetTag.entity_id == asset_id,
            AssetTag.entity_type == "asset",
        )
    )
    raw_tags = tags_result.all()
    tag_names = [row.tag_name for row in raw_tags]

    return AssetMetaCurrentState(
        asset_id=asset.asset_id,
        asset_type=asset.asset_type,
        qualified_name=asset.qualified_name,
        physical_name=asset.physical_name,
        display_name=asset.display_name,
        status=asset.status,
        scan_status=asset.scan_status,
        last_scanned_at=asset.last_scanned_at,
        scan_duration_ms=asset.scan_duration_ms,
        scan_version=asset.scan_version,
        row_count=meta.row_count if meta else None,
        bytes=meta.bytes if meta else None,
        last_modified_at=meta.last_modified_at if meta else None,
        table_created_at=meta.table_created_at if meta else None,
        partition_info=meta.partition_info if meta else None,
        latest_profile_score=asset.latest_profile_score,
        latest_quality_status=asset.latest_quality_status,
        is_critical_data_element=asset.is_critical_data_element,
        attached_rule_count=asset.attached_rule_count,
        owner_user_id=asset.owner_user_id,
        owner_team_id=asset.owner_team_id,
        steward_user_id=asset.steward_user_id,
        tags=tag_names,
    )


async def get_snapshot_history(
    db: AsyncSession,
    asset_id: str,
    since: Optional[date_t] = None,
    until: Optional[date_t] = None,
    limit: int = 90,
) -> list[AssetMetadataSnapshot]:
    """Returns snapshots ordered newest-first. Max 90 rows."""
    from datetime import timedelta
    if since is None:
        since = (_now() - timedelta(days=90)).date()
    if until is None:
        until = _now().date()
    limit = min(limit, 90)

    result = await db.execute(
        select(AssetMetadataSnapshot)
        .where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date >= since,
            AssetMetadataSnapshot.snapshot_date <= until,
        )
        .order_by(desc(AssetMetadataSnapshot.snapshot_date))
        .limit(limit)
    )
    return await _scalars_all(result)


async def get_column_state(
    db: AsyncSession,
    asset_id: str,
) -> list[ColumnMetadata]:
    """All column_metadata rows for an asset, ordered by ordinal_position."""
    result = await db.execute(
        select(ColumnMetadata)
        .where(ColumnMetadata.asset_id == asset_id)
        .order_by(asc(ColumnMetadata.ordinal_position))
    )
    return await _scalars_all(result)
