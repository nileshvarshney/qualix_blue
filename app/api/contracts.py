from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from datetime import datetime, timezone, timedelta, date
from app.db.database import get_db
from app.db.models import DataContract, Asset, DQQualityScore, DQRule, DQRuleRun
from app.core.security import get_current_user

router = APIRouter(prefix="/contracts", tags=["Contracts"])


def _sla_status(adherence: float, min_score: float) -> str:
    if adherence >= min_score:
        return "active"
    if adherence >= min_score * 0.95:
        return "warning"
    return "violated"


def _fmt_contract(c: DataContract, asset: Optional[Asset] = None) -> dict:
    asset_name = None
    if asset:
        asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}"
    return {
        "contract_id": c.contract_id,
        "asset_id": c.asset_id,
        "asset_name": asset_name,
        "contract_name": c.contract_name,
        "version": c.version,
        "producer_team": c.producer_team,
        "consumer_team": c.consumer_team,
        "status": c.status,
        "schema_json": c.schema_json,
        "min_quality_score": c.min_quality_score,
        "max_null_pct": c.max_null_pct,
        "max_staleness_hours": c.max_staleness_hours,
        "sla_description": c.sla_description,
        "breach_action": c.breach_action,
        "effective_from": c.effective_from.isoformat() if c.effective_from else None,
        "effective_until": c.effective_until.isoformat() if c.effective_until else None,
        "created_by": c.created_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


async def _enrich_contract(c: DataContract, asset: Optional[Asset], db: AsyncSession) -> dict:
    """Return contract dict enriched with real quality data from DQRuleRun."""
    base = _fmt_contract(c, asset)
    asset_id = c.asset_id
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff_7d = today - timedelta(days=7)
    cutoff_30d = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)

    # ── Fetch last 7 days of runs for this asset ──────────────────────────────
    runs_result = await db.execute(
        select(DQRuleRun)
        .where(
            DQRuleRun.asset_id == asset_id,
            DQRuleRun.created_at >= cutoff_30d,
        )
        .order_by(DQRuleRun.created_at.asc())
    )
    all_runs = runs_result.scalars().all()

    # Aggregate by day
    by_day: dict = {}
    breach_count = 0
    for r in all_runs:
        run_date = r.created_at.date()
        if run_date not in by_day:
            by_day[run_date] = {"total": 0, "passed": 0, "failed": 0}
        by_day[run_date]["total"] += 1
        if r.status == "passed":
            by_day[run_date]["passed"] += 1
        elif r.status in ("failed", "error"):
            by_day[run_date]["failed"] += 1
            breach_count += 1

    # Build 7-day trend
    trend = []
    for i in range(7):
        d = cutoff_7d + timedelta(days=i)
        if d in by_day:
            day = by_day[d]
            score = round(day["passed"] / day["total"] * 100, 1) if day["total"] else None
            if score is not None:
                trend.append(score)

    # Latest adherence: most recent day with data
    adherence: Optional[float] = None
    for d in sorted(by_day.keys(), reverse=True):
        day = by_day[d]
        if day["total"] > 0:
            adherence = round(day["passed"] / day["total"] * 100, 1)
            break

    # Derive SLA status from adherence vs threshold
    min_score = c.min_quality_score or 95.0
    if adherence is not None:
        computed_status = _sla_status(adherence, min_score)
    else:
        computed_status = c.status

    base.update({
        "adherence": adherence,
        "current": f"{adherence}%" if adherence is not None else None,
        "trend": trend,
        "breaches": breach_count,
        "status": computed_status,
    })
    return base


@router.get("")
async def list_contracts(
    asset_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(DataContract, Asset).outerjoin(Asset, DataContract.asset_id == Asset.asset_id)
    if asset_id:
        q = q.where(DataContract.asset_id == asset_id)
    if connection_id:
        q = q.where(Asset.connection_id == connection_id)
    if status:
        q = q.where(DataContract.status == status)
    result = await db.execute(q.order_by(desc(DataContract.created_at)))
    rows = result.all()
    return [await _enrich_contract(c, a, db) for c, a in rows]


@router.post("")
async def create_contract(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid
    if not body.get("contract_name"):
        raise HTTPException(422, "contract_name is required")
    if not body.get("asset_id"):
        raise HTTPException(422, "asset_id is required — link this contract to an asset")
    contract = DataContract(
        contract_id=gen_uuid(),
        asset_id=body["asset_id"],
        contract_name=body["contract_name"],
        version=body.get("version", "1.0"),
        producer_team=body.get("producer_team"),
        consumer_team=body.get("consumer_team"),
        status=body.get("status", "draft"),
        schema_json=body.get("schema_json"),
        min_quality_score=body.get("min_quality_score", 95.0),
        max_null_pct=body.get("max_null_pct"),
        max_staleness_hours=body.get("max_staleness_hours", 24),
        sla_description=body.get("sla_description"),
        breach_action=body.get("breach_action"),
        created_by=user.get("email"),
    )
    db.add(contract)
    await db.commit()
    await db.refresh(contract)
    return _fmt_contract(contract)


@router.get("/{contract_id}")
async def get_contract(contract_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataContract).where(DataContract.contract_id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "Contract not found")
    return _fmt_contract(contract)


@router.put("/{contract_id}")
async def update_contract(
    contract_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DataContract).where(DataContract.contract_id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "Contract not found")
    updatable = (
        "contract_name", "version", "producer_team", "consumer_team", "status",
        "schema_json", "min_quality_score", "max_null_pct", "max_staleness_hours",
        "sla_description", "breach_action",
    )
    for field in updatable:
        if field in body:
            setattr(contract, field, body[field])
    await db.commit()
    return _fmt_contract(contract)


@router.post("/{contract_id}/validate")
async def validate_contract(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Check current compliance against contract SLA thresholds."""
    result = await db.execute(select(DataContract).where(DataContract.contract_id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "Contract not found")

    issues: list[str] = []

    # Check quality score
    qs_result = await db.execute(
        select(DQQualityScore)
        .where(
            DQQualityScore.asset_id == contract.asset_id,
            DQQualityScore.score_level == "table",
        )
        .order_by(desc(DQQualityScore.score_date))
        .limit(1)
    )
    latest_qs = qs_result.scalar_one_or_none()
    current_score = latest_qs.quality_score if latest_qs else None

    if current_score is None:
        issues.append("No quality score found for this asset.")
    elif current_score < contract.min_quality_score:
        issues.append(
            f"Quality score {current_score:.1f}% is below contract minimum {contract.min_quality_score:.1f}%."
        )

    # Check for recent schema drift
    drift_result = await db.execute(
        select(DQRuleRun)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(
            DQRuleRun.asset_id == contract.asset_id,
            DQRule.rule_type == "schema_drift_check",
            DQRuleRun.status == "failed",
        )
        .order_by(desc(DQRuleRun.created_at))
        .limit(1)
    )
    drift_run = drift_result.scalar_one_or_none()
    if drift_run:
        issues.append(f"Schema drift detected on {drift_run.created_at.isoformat()}.")

    compliant = len(issues) == 0

    # Auto-update contract status based on validation result
    if not compliant and contract.status not in ("draft", "deprecated"):
        contract.status = "violated"
        await db.commit()
    elif compliant and contract.status == "violated":
        contract.status = "active"
        await db.commit()

    return {"compliant": compliant, "issues": issues, "current_score": current_score}


@router.get("/assets/{asset_id}/contracts", tags=["Contracts"])
async def get_asset_contracts(asset_id: str, db: AsyncSession = Depends(get_db)):
    asset_result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_result.scalar_one_or_none()
    result = await db.execute(
        select(DataContract).where(DataContract.asset_id == asset_id).order_by(desc(DataContract.created_at))
    )
    return [_fmt_contract(c, asset) for c in result.scalars().all()]


@router.delete("/{contract_id}")
async def delete_contract(
    contract_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DataContract).where(DataContract.contract_id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "Contract not found")
    contract.status = "deprecated"
    await db.commit()
    return {"message": "Contract deprecated"}
