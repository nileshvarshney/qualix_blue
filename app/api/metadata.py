from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.schemas.metadata import (
    AssetMetaCurrentState, CDEPatch, ColumnMetaOut, SnapshotResponse,
)
from app.services import metadata_store

router = APIRouter(prefix="/metadata", tags=["Metadata"])


@router.get("/assets/{asset_id}", response_model=AssetMetaCurrentState)
async def get_asset_metadata(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    state = await metadata_store.get_current_state(db, asset_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return state


@router.get("/assets/{asset_id}/history", response_model=list[SnapshotResponse])
async def get_asset_snapshot_history(
    asset_id: str,
    since: Optional[date] = Query(None),
    until: Optional[date] = Query(None),
    limit: int = Query(90, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await metadata_store.get_snapshot_history(db, asset_id, since, until, limit)


@router.get("/assets/{asset_id}/columns", response_model=list[ColumnMetaOut])
async def get_asset_column_metadata(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await metadata_store.get_column_state(db, asset_id)


@router.patch("/assets/{asset_id}/cde")
async def set_cde_flag(
    asset_id: str,
    payload: CDEPatch,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    try:
        await metadata_store.set_critical_data_element(
            db, asset_id, payload.is_critical_data_element
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset_id": asset_id, "is_critical_data_element": payload.is_critical_data_element}
