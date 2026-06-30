from __future__ import annotations
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.db.models import Asset, DQDimensionScore
from app.core.security import get_current_user, check_domain_access
from app.services.scoring_service import DIMENSIONS

router = APIRouter(prefix="/quality-scores", tags=["Quality Scores"])


def _empty_dimensions() -> dict:
    return {
        dim: {"score": None, "source": "none", "total_rules": 0, "passed_rules": 0, "failed_rules": 0}
        for dim in DIMENSIONS
    }


@router.get("/assets/{asset_id}")
async def get_asset_quality_score(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    latest_date = (
        await db.execute(
            select(func.max(DQDimensionScore.score_date)).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
            )
        )
    ).scalar()

    if latest_date is None:
        return {
            "asset_id": asset_id,
            "score_date": None,
            "overall_score": None,
            "dimensions": _empty_dimensions(),
        }

    rows = (
        await db.execute(
            select(DQDimensionScore).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
                DQDimensionScore.score_date == latest_date,
            )
        )
    ).scalars().all()

    dimensions = _empty_dimensions()
    overall_score: Optional[float] = None
    for row in rows:
        if row.dimension == "overall":
            overall_score = row.score
        elif row.dimension in dimensions:
            dimensions[row.dimension] = {
                "score": row.score,
                "source": row.source,
                "total_rules": row.total_rules,
                "passed_rules": row.passed_rules,
                "failed_rules": row.failed_rules,
            }

    return {
        "asset_id": asset_id,
        "score_date": str(latest_date),
        "overall_score": overall_score,
        "dimensions": dimensions,
    }


@router.get("/assets/{asset_id}/history")
async def get_asset_quality_history(
    asset_id: str,
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=days - 1)

    rows = (
        await db.execute(
            select(DQDimensionScore).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
                DQDimensionScore.score_date >= cutoff,
                DQDimensionScore.score_date <= today,
            )
        )
    ).scalars().all()

    by_date: dict[date, dict] = {}
    for row in rows:
        entry = by_date.setdefault(row.score_date, {"overall_score": None, "dimensions": {}})
        if row.dimension == "overall":
            entry["overall_score"] = row.score
        elif row.dimension in DIMENSIONS:
            entry["dimensions"][row.dimension] = row.score

    history = [
        {
            "date": str(d),
            "overall_score": entry["overall_score"],
            "dimensions": {dim: entry["dimensions"].get(dim) for dim in DIMENSIONS},
        }
        for d, entry in sorted(by_date.items())
    ]

    return {"asset_id": asset_id, "history": history}


@router.get("/assets/{asset_id}/forecast")
async def get_asset_quality_forecast(
    asset_id: str,
    days: int = Query(default=30, ge=7, le=90),
    horizon: int = Query(default=7, ge=1, le=14),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=days - 1)

    rows = (
        await db.execute(
            select(DQDimensionScore).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
                DQDimensionScore.dimension == "overall",
                DQDimensionScore.score_date >= cutoff,
                DQDimensionScore.score_date <= today,
            )
        )
    ).scalars().all()

    history = [
        {"date": str(r.score_date), "score": r.score}
        for r in sorted(rows, key=lambda r: r.score_date)
        if r.score is not None
    ]

    from app.services.forecast_service import compute_forecast
    fc = compute_forecast([h["score"] for h in history], horizon=horizon)

    if fc is None:
        return {
            "asset_id": asset_id,
            "history": history,
            "forecast": [],
            "upper_band": [],
            "lower_band": [],
            "insufficient_history": True,
        }

    forecast_dates = [str(today + timedelta(days=i + 1)) for i in range(horizon)]
    return {
        "asset_id": asset_id,
        "history": history,
        "forecast": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.forecast)],
        "upper_band": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.upper_band)],
        "lower_band": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.lower_band)],
        "insufficient_history": False,
    }
