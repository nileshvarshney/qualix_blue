# app/api/profile_results.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import profiling_results_store

router = APIRouter(prefix="/profile-results", tags=["Profile Results"])


@router.get("/assets/{asset_id}/summary")
async def get_asset_profile_summary_endpoint(
    asset_id: str,
    run_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await profiling_results_store.get_asset_profile_summary(
        db, asset_id, run_id=run_id
    )
    if not result:
        raise HTTPException(404, "No profile results found for this asset")
    return result


@router.get("/assets/{asset_id}/columns")
async def get_column_profiles_endpoint(
    asset_id: str,
    run_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await profiling_results_store.get_column_profiles(
        db, asset_id, run_id=run_id
    )


@router.get("/assets/{asset_id}/history")
async def get_profile_run_history_endpoint(
    asset_id: str,
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await profiling_results_store.get_profile_run_history(
        db, asset_id, limit=limit
    )


@router.get("/runs/{run_id}/assets/{asset_id}/columns")
async def get_run_column_profiles_endpoint(
    run_id: str,
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    results = await profiling_results_store.get_column_profiles(
        db, asset_id, run_id=run_id
    )
    if not results:
        raise HTTPException(
            404, "No column profile results found for this run and asset"
        )
    return results
