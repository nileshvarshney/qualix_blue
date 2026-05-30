from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import Optional
from app.db.database import get_db
from app.db.models import QualityCostConfig, DQRuleRun, DataAsset, Domain, Subdomain, DQRule
from app.core.security import get_current_user

router = APIRouter(prefix="/cost", tags=["Cost Impact"])

def _cutoff(days: int = 30):
    return (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)

_THIRTY_DAYS_AGO = lambda: _cutoff(30)


def _fmt_config(c: QualityCostConfig) -> dict:
    return {
        "config_id": c.config_id,
        "asset_id": c.asset_id,
        "domain_id": c.domain_id,
        "cost_per_failed_row": c.cost_per_failed_row,
        "cost_per_incident": c.cost_per_incident,
        "revenue_impact_pct": c.revenue_impact_pct,
        "currency": c.currency,
        "updated_by": c.updated_by,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


async def _build_asset_cost_table(
    db: AsyncSession,
    days: int = 30,
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
) -> list[dict]:
    """
    Core computation: one row per asset with failed_rows × cost_per_failed_row.
    Supports optional domain/subdomain filtering and configurable look-back period.
    """
    cutoff = _cutoff(days)

    asset_q = select(DataAsset).where(DataAsset.is_active == True)
    if domain_id:
        asset_q = asset_q.where(DataAsset.domain_id == domain_id)
    if subdomain_id:
        asset_q = asset_q.where(DataAsset.subdomain_id == subdomain_id)
    assets_result = await db.execute(asset_q)
    assets = {a.asset_id: a for a in assets_result.scalars().all()}

    domains_result = await db.execute(select(Domain))
    domains = {d.domain_id: d for d in domains_result.scalars().all()}

    subdomains_result = await db.execute(select(Subdomain))
    subdomains = {s.subdomain_id: s for s in subdomains_result.scalars().all()}

    configs_result = await db.execute(
        select(QualityCostConfig).where(QualityCostConfig.asset_id.isnot(None))
    )
    asset_configs = {c.asset_id: c for c in configs_result.scalars().all()}

    runs_q = (
        select(
            DQRuleRun.asset_id,
            func.sum(DQRuleRun.failed_rows_count).label("total_failed_rows"),
            func.count(DQRuleRun.run_id).label("run_count"),
            func.sum(DQRuleRun.total_rows_scanned).label("total_rows_scanned"),
        )
        .where(DQRuleRun.created_at >= cutoff)
        .group_by(DQRuleRun.asset_id)
    )
    if domain_id:
        runs_q = runs_q.where(DQRuleRun.domain_id == domain_id)
    if subdomain_id:
        runs_q = runs_q.where(DQRuleRun.subdomain_id == subdomain_id)
    runs_result = await db.execute(runs_q)
    asset_runs = {row.asset_id: row for row in runs_result.all()}

    rows = []
    for asset_id, asset in assets.items():
        config = asset_configs.get(asset_id)
        run = asset_runs.get(asset_id)
        failed_rows = int(run.total_failed_rows or 0) if run else 0
        run_count = int(run.run_count or 0) if run else 0
        total_rows = int(run.total_rows_scanned or 0) if run else 0
        cost_per_row = config.cost_per_failed_row if config and config.cost_per_failed_row else 0.0
        total_cost = failed_rows * cost_per_row
        has_cost_config = config is not None and config.cost_per_failed_row is not None

        domain = domains.get(asset.domain_id)
        subdomain = subdomains.get(asset.subdomain_id)
        rows.append({
            "asset_id": asset_id,
            "asset_name": f"{asset.sf_schema_name}.{asset.sf_table_name}",
            "sf_schema_name": asset.sf_schema_name,
            "sf_table_name": asset.sf_table_name,
            "domain_id": asset.domain_id,
            "domain_name": domain.domain_name if domain else "",
            "subdomain_id": asset.subdomain_id,
            "subdomain_name": subdomain.subdomain_name if subdomain else "",
            "cost_per_failed_row": cost_per_row if has_cost_config else None,
            "has_cost_config": has_cost_config,
            "failed_rows_30d": failed_rows,
            "total_rows_scanned": total_rows,
            "run_count": run_count,
            "total_cost": round(total_cost, 2),
        })
    return rows


@router.get("/overview")
async def cost_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Combined summary + domain costs + asset costs in one query pass."""
    asset_rows = await _build_asset_cost_table(db, days=days)

    total_cost = sum(r["total_cost"] for r in asset_rows)
    configured_assets = sum(1 for r in asset_rows if r["has_cost_config"])
    total_failed_rows = sum(r["failed_rows_30d"] for r in asset_rows)

    active_rules_result = await db.execute(
        select(func.count(DQRule.rule_id)).where(DQRule.is_active == True)
    )
    active_rules = int(active_rules_result.scalar_one() or 0)

    cutoff = _cutoff(days)
    passed_runs_result = await db.execute(
        select(func.count(DQRuleRun.run_id))
        .where(DQRuleRun.status == "passed", DQRuleRun.created_at >= cutoff)
    )
    passed_count = int(passed_runs_result.scalar_one() or 0)
    cost_averted = round(passed_count * 500.0 * 0.01, 2)

    summary = {
        "total_cost_30d": round(total_cost, 2),
        "total_estimated_cost": round(total_cost, 2),
        "cost_averted": cost_averted,
        "active_rules": active_rules,
        "configured_assets": configured_assets,
        "total_failed_rows": total_failed_rows,
        "period_days": days,
    }

    domain_map: dict[str, dict] = {}
    for r in asset_rows:
        did = r["domain_id"]
        if did not in domain_map:
            domain_map[did] = {
                "domain_id": did,
                "domain_name": r["domain_name"],
                "total_cost": 0.0,
                "failed_rows": 0,
                "run_count": 0,
                "asset_count": 0,
                "configured_assets": 0,
            }
        domain_map[did]["total_cost"] = round(domain_map[did]["total_cost"] + r["total_cost"], 2)
        domain_map[did]["failed_rows"] += r["failed_rows_30d"]
        domain_map[did]["run_count"] += r["run_count"]
        domain_map[did]["asset_count"] += 1
        if r["has_cost_config"]:
            domain_map[did]["configured_assets"] += 1

    return {
        "summary": summary,
        "domain_costs": sorted(domain_map.values(), key=lambda x: x["total_cost"], reverse=True),
        "asset_costs": sorted(asset_rows, key=lambda x: x["total_cost"], reverse=True),
    }


@router.get("/summary")
async def cost_summary(
    days: int = Query(30, ge=1, le=365),
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide cost summary with optional filters."""
    asset_rows = await _build_asset_cost_table(db, days=days, domain_id=domain_id, subdomain_id=subdomain_id)
    total_cost = sum(r["total_cost"] for r in asset_rows)
    configured_assets = sum(1 for r in asset_rows if r["has_cost_config"])

    active_rules_result = await db.execute(
        select(func.count(DQRule.rule_id)).where(DQRule.is_active == True)
    )
    active_rules = int(active_rules_result.scalar_one() or 0)

    cutoff = _cutoff(days)
    passed_runs_result = await db.execute(
        select(func.count(DQRuleRun.run_id))
        .where(DQRuleRun.status == "passed", DQRuleRun.created_at >= cutoff)
    )
    passed_count = int(passed_runs_result.scalar_one() or 0)
    cost_averted = round(passed_count * 500.0 * 0.01, 2)

    total_failed_rows = sum(r["failed_rows_30d"] for r in asset_rows)

    return {
        "total_cost_30d": round(total_cost, 2),
        "total_estimated_cost": round(total_cost, 2),
        "cost_averted": cost_averted,
        "active_rules": active_rules,
        "configured_assets": configured_assets,
        "total_failed_rows": total_failed_rows,
        "period_days": days,
    }


@router.get("/by-domain")
async def cost_by_domain(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Cost breakdown per domain."""
    asset_rows = await _build_asset_cost_table(db, days=days)

    domain_map: dict[str, dict] = {}
    for r in asset_rows:
        did = r["domain_id"]
        if did not in domain_map:
            domain_map[did] = {
                "domain_id": did,
                "domain_name": r["domain_name"],
                "total_cost": 0.0,
                "failed_rows": 0,
                "run_count": 0,
                "asset_count": 0,
                "configured_assets": 0,
            }
        domain_map[did]["total_cost"] = round(domain_map[did]["total_cost"] + r["total_cost"], 2)
        domain_map[did]["failed_rows"] += r["failed_rows_30d"]
        domain_map[did]["run_count"] += r["run_count"]
        domain_map[did]["asset_count"] += 1
        if r["has_cost_config"]:
            domain_map[did]["configured_assets"] += 1

    return sorted(domain_map.values(), key=lambda x: x["total_cost"], reverse=True)


@router.get("/by-subdomain")
async def cost_by_subdomain(
    domain_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Cost breakdown per subdomain, optionally filtered by domain."""
    asset_rows = await _build_asset_cost_table(db, days=days, domain_id=domain_id)

    subdomain_map: dict[str, dict] = {}
    for r in asset_rows:
        sid = r["subdomain_id"]
        if sid not in subdomain_map:
            subdomain_map[sid] = {
                "subdomain_id": sid,
                "subdomain_name": r["subdomain_name"],
                "domain_id": r["domain_id"],
                "domain_name": r["domain_name"],
                "total_cost": 0.0,
                "failed_rows": 0,
                "run_count": 0,
                "asset_count": 0,
                "configured_assets": 0,
            }
        subdomain_map[sid]["total_cost"] = round(subdomain_map[sid]["total_cost"] + r["total_cost"], 2)
        subdomain_map[sid]["failed_rows"] += r["failed_rows_30d"]
        subdomain_map[sid]["run_count"] += r["run_count"]
        subdomain_map[sid]["asset_count"] += 1
        if r["has_cost_config"]:
            subdomain_map[sid]["configured_assets"] += 1

    return sorted(subdomain_map.values(), key=lambda x: x["total_cost"], reverse=True)


@router.get("/by-asset")
async def cost_by_asset(
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Cost breakdown per asset with optional domain/subdomain filters."""
    asset_rows = await _build_asset_cost_table(db, days=days, domain_id=domain_id, subdomain_id=subdomain_id)
    return sorted(asset_rows, key=lambda x: x["total_cost"], reverse=True)


@router.get("/top-tables")
async def cost_top_tables(
    days: int = Query(30, ge=1, le=365),
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Top tables by estimated cost, with optional filters."""
    asset_rows = await _build_asset_cost_table(db, days=days, domain_id=domain_id, subdomain_id=subdomain_id)
    asset_rows.sort(key=lambda x: x["total_cost"], reverse=True)
    return asset_rows[:10]


@router.get("/by-table/{asset_id}")
async def cost_by_table(asset_id: str, db: AsyncSession = Depends(get_db)):
    """Per-table cost analysis over last 30 days."""
    cutoff = _THIRTY_DAYS_AGO()

    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    runs_result = await db.execute(
        select(
            func.sum(DQRuleRun.failed_rows_count).label("total_failed_rows"),
            func.count(DQRuleRun.run_id).label("run_count"),
        )
        .where(DQRuleRun.asset_id == asset_id, DQRuleRun.created_at >= cutoff)
    )
    run_data = runs_result.one_or_none()
    if run_data is None:
        run_data = type('_r', (), {'total_failed_rows': 0, 'run_count': 0})()

    config_result = await db.execute(
        select(QualityCostConfig).where(QualityCostConfig.asset_id == asset_id)
    )
    config = config_result.scalar_one_or_none()

    failed_rows = int(run_data.total_failed_rows or 0)
    run_count = int(run_data.run_count or 0)
    cost_per_row = config.cost_per_failed_row if config and config.cost_per_failed_row else 0.0
    cost_per_inc = config.cost_per_incident if config and config.cost_per_incident else 0.0
    currency = config.currency if config else "USD"

    estimated_cost = failed_rows * cost_per_row + run_count * cost_per_inc
    return {
        "asset_id": asset_id,
        "sf_table_name": asset.sf_table_name,
        "sf_schema_name": asset.sf_schema_name,
        "failed_rows": failed_rows,
        "run_count": run_count,
        "cost_per_failed_row": cost_per_row,
        "cost_per_incident": cost_per_inc,
        "estimated_cost": round(estimated_cost, 2),
        "currency": currency,
        "period_days": 30,
    }


@router.put("/configs/{asset_id}")
async def upsert_cost_config(
    asset_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Upsert cost config for a table."""
    from app.db.models import gen_uuid

    result = await db.execute(
        select(QualityCostConfig).where(QualityCostConfig.asset_id == asset_id)
    )
    config = result.scalar_one_or_none()

    if config:
        if "cost_per_failed_row" in body:
            config.cost_per_failed_row = body["cost_per_failed_row"]
        if "cost_per_incident" in body:
            config.cost_per_incident = body["cost_per_incident"]
        if "revenue_impact_pct" in body:
            config.revenue_impact_pct = body["revenue_impact_pct"]
        if "currency" in body:
            config.currency = body["currency"]
        config.updated_by = user.get("email")
    else:
        config = QualityCostConfig(
            config_id=gen_uuid(),
            asset_id=asset_id,
            cost_per_failed_row=body.get("cost_per_failed_row"),
            cost_per_incident=body.get("cost_per_incident"),
            revenue_impact_pct=body.get("revenue_impact_pct"),
            currency=body.get("currency", "USD"),
            updated_by=user.get("email"),
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)
    return _fmt_config(config)


@router.get("/configs")
async def list_cost_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(QualityCostConfig))
    return [_fmt_config(c) for c in result.scalars().all()]


@router.delete("/configs/{asset_id}", status_code=204)
async def delete_cost_config(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove cost config for a table."""
    result = await db.execute(
        select(QualityCostConfig).where(QualityCostConfig.asset_id == asset_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Cost config not found")
    await db.delete(config)
    await db.commit()
