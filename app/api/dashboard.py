from __future__ import annotations
import asyncio
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_, case, literal_column
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from app.db.database import get_db
from app.db.models import Domain, Subdomain, DataAsset, DQRule, DQRuleRun, DQAlert, DQQualityScore
from app.core.security import get_current_user, get_domain_filter, check_domain_access, apply_domain_filter

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

_CACHE_HEADER = "private, max-age=30, stale-while-revalidate=60"


async def _get_today_runs(db: AsyncSession, filters: dict = {}):
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    q = select(DQRuleRun).where(func.date(DQRuleRun.created_at) == today)
    for k, v in filters.items():
        q = q.where(getattr(DQRuleRun, k) == v)
    result = await db.execute(q)
    return result.scalars().all()


async def _build_trend(
    db: AsyncSession,
    days: int = 30,
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> list[dict]:
    """
    Build quality trend in 1–2 queries instead of one per day.

    Strategy:
    1. Fetch all pre-aggregated DQQualityScore rows for the date range in one query.
    2. For any date missing a pre-aggregated row, fetch raw runs in a single IN-query
       and aggregate in Python.
    """
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=days - 1)
    all_dates = [cutoff + timedelta(days=i) for i in range(days)]

    # ── Query 1: fetch all pre-aggregated scores in the range ──────────────
    sq = select(DQQualityScore).where(
        DQQualityScore.score_date >= cutoff,
        DQQualityScore.score_date <= today,
    )
    if asset_id:
        sq = sq.where(DQQualityScore.asset_id == asset_id, DQQualityScore.score_level == "table")
    elif subdomain_id:
        sq = sq.where(DQQualityScore.subdomain_id == subdomain_id, DQQualityScore.score_level == "subdomain")
    elif domain_id:
        sq = sq.where(DQQualityScore.domain_id == domain_id, DQQualityScore.score_level == "domain")
    else:
        sq = sq.where(DQQualityScore.score_level == "global")

    score_rows = (await db.execute(sq)).scalars().all()
    score_map = {r.score_date: r for r in score_rows}

    # ── Identify dates that need raw-run fallback ───────────────────────────
    missing_dates = [d for d in all_dates if d not in score_map]

    # ── Query 2 (optional): raw runs for all missing dates in one shot ──────
    raw_by_date: dict[date, list] = {}
    if missing_dates:
        rq = select(DQRuleRun).where(func.date(DQRuleRun.created_at).in_(missing_dates))
        if domain_id:
            rq = rq.where(DQRuleRun.domain_id == domain_id)
        if subdomain_id:
            rq = rq.where(DQRuleRun.subdomain_id == subdomain_id)
        if asset_id:
            rq = rq.where(DQRuleRun.asset_id == asset_id)
        raw_runs = (await db.execute(rq)).scalars().all()
        for r in raw_runs:
            raw_by_date.setdefault(r.created_at.date(), []).append(r)

    # ── Assemble trend in chronological order ───────────────────────────────
    trend = []
    for d in all_dates:
        if d in score_map:
            agg = score_map[d]
            trend.append({
                "date": str(d), "score": agg.quality_score,
                "total": agg.total_rules, "passed": agg.passed_rules,
                "failed": agg.failed_rules,
            })
        else:
            runs = raw_by_date.get(d, [])
            total = len(runs)
            passed = sum(1 for r in runs if r.status == "passed")
            failed = sum(1 for r in runs if r.status in ("failed", "error"))
            score = round(passed / total * 100, 1) if total else None
            trend.append({"date": str(d), "score": score, "total": total, "passed": passed, "failed": failed})
    return trend


async def _get_sla_breaches(db: AsyncSession, domain_scope: Optional[str] = None) -> list[dict]:
    """
    Return top-5 tables whose 7-day average quality score is below 95.
    Shape: { table_name, schema_name, domain_name, score, days_below_sla }
    """
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=7)

    # Fetch all runs for the last 7 days joined with asset + domain info
    q = (
        select(
            DQRuleRun.asset_id,
            DataAsset.sf_table_name,
            DataAsset.sf_schema_name,
            Domain.domain_name,
            func.date(DQRuleRun.created_at).label("run_date"),
            func.avg(DQRuleRun.quality_score).label("day_avg"),
        )
        .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
        .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
        .where(
            func.date(DQRuleRun.created_at) >= cutoff,
            func.date(DQRuleRun.created_at) <= today,
            DQRuleRun.quality_score.isnot(None),
        )
        .group_by(
            DQRuleRun.asset_id,
            DataAsset.sf_table_name,
            DataAsset.sf_schema_name,
            Domain.domain_name,
            func.date(DQRuleRun.created_at),
        )
    )
    if domain_scope:
        q = q.where(DQRuleRun.domain_id == domain_scope)

    rows = (await db.execute(q)).all()

    # Aggregate per asset: avg score over 7 days, count days below SLA
    asset_data: dict[str, dict] = {}
    for row in rows:
        key = row.asset_id
        if key not in asset_data:
            asset_data[key] = {
                "table_name": row.sf_table_name,
                "schema_name": row.sf_schema_name,
                "domain_name": row.domain_name,
                "day_scores": [],
            }
        if row.day_avg is not None:
            asset_data[key]["day_scores"].append(float(row.day_avg))

    results = []
    for entry in asset_data.values():
        day_scores = entry["day_scores"]
        if not day_scores:
            continue
        avg_score = sum(day_scores) / len(day_scores)
        if avg_score >= 95.0:
            continue
        days_below_sla = sum(1 for s in day_scores if s < 95.0)
        results.append({
            "table_name": entry["table_name"],
            "schema_name": entry["schema_name"],
            "domain_name": entry["domain_name"],
            "score": round(avg_score, 1),
            "days_below_sla": days_below_sla,
        })

    results.sort(key=lambda x: x["score"])
    return results[:5]


async def _get_at_risk_tables(db: AsyncSession, domain_scope: Optional[str] = None) -> list[dict]:
    """
    Return bottom-5 tables by most-recent run quality score.
    Shape: { table_name, schema_name, domain_name, score, score_delta }
    score_delta = current score minus score from 7 days ago (negative means declining).
    """
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff_7d = today - timedelta(days=7)

    # Subquery: latest run per asset
    latest_sq = (
        select(
            DQRuleRun.asset_id,
            func.max(DQRuleRun.created_at).label("latest_ts"),
        )
        .where(DQRuleRun.quality_score.isnot(None))
        .group_by(DQRuleRun.asset_id)
        .subquery()
    )
    if domain_scope:
        latest_sq = (
            select(
                DQRuleRun.asset_id,
                func.max(DQRuleRun.created_at).label("latest_ts"),
            )
            .where(DQRuleRun.quality_score.isnot(None), DQRuleRun.domain_id == domain_scope)
            .group_by(DQRuleRun.asset_id)
            .subquery()
        )

    current_q = (
        select(
            DQRuleRun.asset_id,
            DQRuleRun.quality_score,
            DataAsset.sf_table_name,
            DataAsset.sf_schema_name,
            Domain.domain_name,
        )
        .join(latest_sq, and_(
            DQRuleRun.asset_id == latest_sq.c.asset_id,
            DQRuleRun.created_at == latest_sq.c.latest_ts,
        ))
        .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
        .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
        .where(DQRuleRun.quality_score.isnot(None))
        .order_by(DQRuleRun.quality_score.asc())
        .limit(5)
    )

    current_rows = (await db.execute(current_q)).all()
    if not current_rows:
        return []

    asset_ids = [r.asset_id for r in current_rows]

    # Fetch avg score per asset for the 7-days-ago window (±1 day around cutoff)
    old_window_start = cutoff_7d - timedelta(days=1)
    old_window_end = cutoff_7d + timedelta(days=1)
    old_q = (
        select(
            DQRuleRun.asset_id,
            func.avg(DQRuleRun.quality_score).label("old_score"),
        )
        .where(
            DQRuleRun.asset_id.in_(asset_ids),
            func.date(DQRuleRun.created_at) >= old_window_start,
            func.date(DQRuleRun.created_at) <= old_window_end,
            DQRuleRun.quality_score.isnot(None),
        )
        .group_by(DQRuleRun.asset_id)
    )
    old_rows = (await db.execute(old_q)).all()
    old_score_map = {r.asset_id: float(r.old_score) for r in old_rows if r.old_score is not None}

    results = []
    for row in current_rows:
        current_score = round(float(row.quality_score), 1)
        old_score = old_score_map.get(row.asset_id)
        score_delta = round(current_score - old_score, 1) if old_score is not None else 0.0
        results.append({
            "table_name": row.sf_table_name,
            "schema_name": row.sf_schema_name,
            "domain_name": row.domain_name,
            "score": current_score,
            "score_delta": score_delta,
        })
    return results


async def _get_recently_fixed(db: AsyncSession, domain_scope: Optional[str] = None) -> list[dict]:
    """
    Rules that had a failing execution in the last 24h that now show a passing execution.
    Shape: { rule_name, table_name, domain_name, fixed_at, new_score }
    Limit 5, ordered by fixed_at DESC.
    """
    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    since_24h = now_dt - timedelta(hours=24)

    # Fetch all runs from last 24h, ordered by rule + time
    q = (
        select(
            DQRuleRun.rule_id,
            DQRuleRun.asset_id,
            DQRuleRun.domain_id,
            DQRuleRun.status,
            DQRuleRun.quality_score,
            DQRuleRun.created_at,
            DQRule.rule_name,
            DataAsset.sf_table_name,
            Domain.domain_name,
        )
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
        .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
        .where(DQRuleRun.created_at >= since_24h)
        .order_by(DQRuleRun.rule_id, DQRuleRun.created_at)
    )
    if domain_scope:
        q = q.where(DQRuleRun.domain_id == domain_scope)

    rows = (await db.execute(q)).all()

    # Group by rule_id, find rules where an earlier run failed and a later run passed
    from collections import defaultdict
    by_rule: dict[str, list] = defaultdict(list)
    for row in rows:
        by_rule[row.rule_id].append(row)

    fixed = []
    for rule_id, runs in by_rule.items():
        # runs are in ascending time order
        had_failure = False
        for run in runs:
            if run.status in ("failed", "error"):
                had_failure = True
            elif run.status == "passed" and had_failure:
                fixed.append({
                    "rule_name": run.rule_name,
                    "table_name": run.sf_table_name,
                    "domain_name": run.domain_name,
                    "fixed_at": run.created_at.isoformat(),
                    "new_score": round(float(run.quality_score), 1) if run.quality_score is not None else 100.0,
                })
                break  # only report first fix per rule

    fixed.sort(key=lambda x: x["fixed_at"], reverse=True)
    return fixed[:5]


@router.get("/global")
async def global_dashboard(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    response.headers["Cache-Control"] = _CACHE_HEADER
    domain_scope = get_domain_filter(user)

    dq = select(func.count()).select_from(Domain).where(Domain.is_active == True)
    aq = select(func.count()).select_from(DataAsset).where(DataAsset.is_active == True)
    rq = select(func.count()).select_from(DQRule).where(DQRule.is_active == True)
    alrt_q = select(func.count()).select_from(DQAlert).where(DQAlert.alert_status == "open")
    if domain_scope:
        dq = dq.where(Domain.domain_id == domain_scope)
        aq = aq.where(DataAsset.domain_id == domain_scope)
        rq = rq.where(DQRule.domain_id == domain_scope)
        alrt_q = alrt_q.where(DQAlert.domain_id == domain_scope)

    # AsyncSession is single-connection — execute sequentially
    total_domains = (await db.execute(dq)).scalar() or 0
    total_assets  = (await db.execute(aq)).scalar() or 0
    total_rules   = (await db.execute(rq)).scalar() or 0
    open_alerts   = (await db.execute(alrt_q)).scalar() or 0

    # ── Today's runs — joined with severity so critical_failures needs no extra query ──
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    runs_q = (
        select(DQRuleRun, DQRule.severity)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(func.date(DQRuleRun.created_at) == today)
    )
    if domain_scope:
        runs_q = runs_q.where(DQRuleRun.domain_id == domain_scope)
    all_today_rows = (await db.execute(runs_q)).all()

    # Deduplicate: keep only the LATEST run per rule so counts reflect current state,
    # not the number of executions. A rule run 10× today counts as 1 rule, not 10.
    latest_by_rule: dict[str, tuple] = {}
    for run, severity in all_today_rows:
        existing = latest_by_rule.get(run.rule_id)
        if existing is None or run.created_at > existing[0].created_at:
            latest_by_rule[run.rule_id] = (run, severity)

    latest_runs = list(latest_by_rule.values())
    passed_today      = sum(1 for run, _   in latest_runs if run.status == "passed")
    failed_today      = sum(1 for run, _   in latest_runs if run.status in ("failed", "error"))
    critical_failures = sum(1 for run, sev in latest_runs if run.status in ("failed", "error") and sev == "critical")

    scores = [run.quality_score for run, _ in latest_runs if run.quality_score is not None]
    overall_score = round(sum(scores) / len(scores), 1) if scores else 100.0

    trend = await _build_trend(db, days=14, domain_id=domain_scope)
    sla_breaches = await _get_sla_breaches(db, domain_scope)
    at_risk_tables = await _get_at_risk_tables(db, domain_scope)
    recently_fixed = await _get_recently_fixed(db, domain_scope)

    return {
        "overall_quality_score": overall_score,
        "total_domains": total_domains,
        "total_assets": total_assets,
        "total_active_rules": total_rules,
        "rules_passed_today": passed_today,
        "rules_failed_today": failed_today,
        "critical_failures": critical_failures,
        "open_alerts": open_alerts,
        "quality_trend": trend,
        "sla_breaches": sla_breaches,
        "at_risk_tables": at_risk_tables,
        "recently_fixed": recently_fixed,
    }


@router.get("/domains")
async def domains_dashboard(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    response.headers["Cache-Control"] = _CACHE_HEADER
    domain_scope = get_domain_filter(user)
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()

    dq = select(Domain).where(Domain.is_active == True)
    if domain_scope:
        dq = dq.where(Domain.domain_id == domain_scope)
    domains = (await db.execute(dq)).scalars().all()
    if not domains:
        return []
    domain_ids = [d.domain_id for d in domains]

    # ── 3 batch queries instead of 3×N ──────────────────────────────────────

    # Rule counts per domain
    rule_cnt_res = await db.execute(
        select(DQRule.domain_id, func.count(DQRule.rule_id).label("cnt"))
        .where(DQRule.is_active == True, DQRule.domain_id.in_(domain_ids))
        .group_by(DQRule.domain_id)
    )
    rule_cnt = {r.domain_id: r.cnt for r in rule_cnt_res}

    # Asset counts per domain
    asset_cnt_res = await db.execute(
        select(DataAsset.domain_id, func.count(DataAsset.asset_id).label("cnt"))
        .where(DataAsset.domain_id.in_(domain_ids))
        .group_by(DataAsset.domain_id)
    )
    asset_cnt = {r.domain_id: r.cnt for r in asset_cnt_res}

    # Today's run counts and avg quality score per domain × status
    runs_res = await db.execute(
        select(
            DQRuleRun.domain_id,
            DQRuleRun.status,
            func.count(DQRuleRun.run_id).label("cnt"),
            func.avg(DQRuleRun.quality_score).label("avg_score"),
        )
        .where(
            DQRuleRun.domain_id.in_(domain_ids),
            func.date(DQRuleRun.created_at) == today,
        )
        .group_by(DQRuleRun.domain_id, DQRuleRun.status)
    )
    runs_by_domain: dict[str, dict] = {}
    for r in runs_res:
        dm = runs_by_domain.setdefault(r.domain_id, {})
        dm[r.status] = {"cnt": r.cnt, "avg_score": r.avg_score}

    summaries = []
    for domain in domains:
        dm = runs_by_domain.get(domain.domain_id, {})
        passed = dm.get("passed", {}).get("cnt", 0)
        failed = sum(dm.get(s, {}).get("cnt", 0) for s in ("failed", "error"))
        # Weighted average quality score: prefer passed-run score, else 100
        all_scores = [v["avg_score"] for v in dm.values() if v.get("avg_score") is not None]
        score = round(sum(all_scores) / len(all_scores), 1) if all_scores else 100.0
        summaries.append({
            "domain_id":    domain.domain_id,
            "domain_name":  domain.domain_name,
            "quality_score": score,
            "total_rules":  rule_cnt.get(domain.domain_id, 0),
            "passed_rules": passed,
            "failed_rules": failed,
            "total_assets": asset_cnt.get(domain.domain_id, 0),
        })
    return summaries


@router.get("/domains/{domain_id}")
async def domain_dashboard(
    domain_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_domain_access(user, domain_id)
    response.headers["Cache-Control"] = _CACHE_HEADER
    domain_result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = domain_result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")

    subs_result = await db.execute(select(Subdomain).where(Subdomain.domain_id == domain_id))
    subs = subs_result.scalars().all()

    # Asset counts per subdomain — one batch query instead of N
    asset_cnt_by_sub: dict[str, int] = {}
    if subs:
        sub_ids = [s.subdomain_id for s in subs]
        asset_cnt_res = await db.execute(
            select(DataAsset.subdomain_id, func.count(DataAsset.asset_id).label("cnt"))
            .where(DataAsset.subdomain_id.in_(sub_ids))
            .group_by(DataAsset.subdomain_id)
        )
        asset_cnt_by_sub = {r.subdomain_id: r.cnt for r in asset_cnt_res}

    today_runs_result = await db.execute(
        select(DQRuleRun).where(DQRuleRun.domain_id == domain_id,
                                func.date(DQRuleRun.created_at) == datetime.now(timezone.utc).replace(tzinfo=None).date())
    )
    today_runs = today_runs_result.scalars().all()
    scores = [r.quality_score for r in today_runs if r.quality_score is not None]
    score = round(sum(scores) / len(scores), 1) if scores else 100.0

    rules_result = await db.execute(select(DQRule).where(DQRule.domain_id == domain_id, DQRule.is_active == True))
    all_rules = rules_result.scalars().all()
    rule_severity = {r.rule_id: r.severity for r in all_rules}

    trend = await _build_trend(db, days=14, domain_id=domain_id)
    at_risk_tables = await _get_at_risk_tables(db, domain_scope=domain_id)
    sla_breaches   = await _get_sla_breaches(db, domain_scope=domain_id)

    failed_runs = sorted([r for r in today_runs if r.status in ("failed", "error")],
                         key=lambda r: r.created_at, reverse=True)[:5]
    top_failing = [{"run_id": r.run_id, "rule_id": r.rule_id, "status": r.status,
                    "failed_rows": r.failed_rows_count} for r in failed_runs]

    subdomain_data = []
    for sub in subs:
        sub_runs = [r for r in today_runs if r.subdomain_id == sub.subdomain_id]
        sub_scores = [r.quality_score for r in sub_runs if r.quality_score is not None]
        subdomain_data.append({
            "subdomain_id": sub.subdomain_id,
            "subdomain_name": sub.subdomain_name,
            "quality_score": round(sum(sub_scores) / len(sub_scores), 1) if sub_scores else 100.0,
            "total_rules": sum(1 for r in all_rules if r.subdomain_id == sub.subdomain_id),
            "asset_count": asset_cnt_by_sub.get(sub.subdomain_id, 0),
        })

    return {
        "domain_id": domain.domain_id,
        "domain_name": domain.domain_name,
        "quality_score": score,
        "total_rules": len(all_rules),
        "passed_rules": sum(1 for r in today_runs if r.status == "passed"),
        "failed_rules": sum(1 for r in today_runs if r.status in ("failed", "error")),
        "critical_failures": sum(1 for r in today_runs if r.status in ("failed", "error") and rule_severity.get(r.rule_id) == "critical"),
        "subdomains": subdomain_data,
        "quality_trend": trend,
        "top_failing_rules": top_failing,
        "at_risk_tables": at_risk_tables,
        "sla_breaches": sla_breaches,
    }


@router.get("/subdomains/{subdomain_id}")
async def subdomain_dashboard(
    subdomain_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    sub_result = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))
    sub = sub_result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subdomain not found")
    check_domain_access(user, sub.domain_id)
    response.headers["Cache-Control"] = _CACHE_HEADER

    domain_result = await db.execute(select(Domain).where(Domain.domain_id == sub.domain_id))
    domain = domain_result.scalar_one_or_none()

    assets_result = await db.execute(select(DataAsset).where(DataAsset.subdomain_id == subdomain_id))
    assets = assets_result.scalars().all()

    today_runs_result = await db.execute(
        select(DQRuleRun).where(DQRuleRun.subdomain_id == subdomain_id,
                                func.date(DQRuleRun.created_at) == datetime.now(timezone.utc).replace(tzinfo=None).date())
    )
    today_runs = today_runs_result.scalars().all()
    scores = [r.quality_score for r in today_runs if r.quality_score is not None]
    score = round(sum(scores) / len(scores), 1) if scores else 100.0

    rules_result = await db.execute(select(DQRule).where(DQRule.subdomain_id == subdomain_id, DQRule.is_active == True))
    all_rules = rules_result.scalars().all()

    asset_data = []
    for asset in assets:
        a_runs = [r for r in today_runs if r.asset_id == asset.asset_id]
        a_scores = [r.quality_score for r in a_runs if r.quality_score is not None]
        asset_data.append({
            "asset_id": asset.asset_id,
            "sf_table_name": asset.sf_table_name,
            "sf_schema_name": asset.sf_schema_name,
            "quality_score": round(sum(a_scores) / len(a_scores), 1) if a_scores else 100.0,
            "total_rules": sum(1 for r in all_rules if r.asset_id == asset.asset_id),
        })

    return {
        "subdomain_id": sub.subdomain_id,
        "subdomain_name": sub.subdomain_name,
        "domain_id": sub.domain_id,
        "domain_name": domain.domain_name if domain else "",
        "quality_score": score,
        "total_rules": len(all_rules),
        "passed_rules": sum(1 for r in today_runs if r.status == "passed"),
        "failed_rules": sum(1 for r in today_runs if r.status in ("failed", "error")),
        "assets": asset_data,
        "quality_trend": await _build_trend(db, days=14, subdomain_id=subdomain_id),
    }


@router.get("/tables/{asset_id}")
async def table_dashboard(
    asset_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    response.headers["Cache-Control"] = _CACHE_HEADER

    rules_result = await db.execute(
        select(DQRule).where(
            DQRule.asset_id == asset_id,
            or_(DQRule.is_active == True, DQRule.status == "pending_review"),
        )
    )
    rules = rules_result.scalars().all()

    recent_runs_result = await db.execute(
        select(DQRuleRun).where(DQRuleRun.asset_id == asset_id)
        .order_by(desc(DQRuleRun.created_at)).limit(20)
    )
    recent_runs = recent_runs_result.scalars().all()

    scores = [r.quality_score for r in recent_runs[:10] if r.quality_score is not None]
    score = round(sum(scores) / len(scores), 1) if scores else 100.0
    last_run = recent_runs[0].created_at.isoformat() if recent_runs else None

    # ── O(N+M) dict lookup instead of O(N×M) nested scan ───────────────────
    run_by_rule: dict[str, DQRuleRun] = {}
    for r in recent_runs:
        run_by_rule.setdefault(r.rule_id, r)  # keep first (most recent) per rule

    rule_data = []
    for rule in rules:
        lr = run_by_rule.get(rule.rule_id)
        rule_data.append({
            "rule_id":          rule.rule_id,
            "rule_name":        rule.rule_name,
            "rule_type":        rule.rule_type,
            "severity":         rule.severity,
            "rule_status":      rule.status,
            "is_active":        rule.is_active,
            "status":           lr.status if lr else "never_run",
            "last_run":         lr.created_at.isoformat() if lr else None,
            "last_run_id":      lr.run_id if lr else None,
            "quality_score":    lr.quality_score if lr else None,
            "failed_rows_count":lr.failed_rows_count if lr else None,
        })

    trend = await _build_trend(db, days=30, asset_id=asset_id)

    return {
        "asset_id":           asset.asset_id,
        "sf_database_name":   asset.sf_database_name,
        "sf_schema_name":     asset.sf_schema_name,
        "sf_table_name":      asset.sf_table_name,
        "domain_id":          asset.domain_id,
        "subdomain_id":       asset.subdomain_id,
        "criticality":        asset.criticality,
        "certification_status": asset.certification_status,
        "certified_by":       asset.certified_by,
        "certified_at":       asset.certified_at.isoformat() if asset.certified_at else None,
        "owner_name":         asset.owner_name,
        "owner_email":        asset.owner_email,
        "quality_score":      score,
        "total_rules":        sum(1 for r in rules if r.is_active),
        "pending_rules":      sum(1 for r in rules if r.status == "pending_review"),
        "passed_rules":  sum(1 for rid, lr in run_by_rule.items() if lr.status == "passed"),
        "failed_rules":  sum(1 for rid, lr in run_by_rule.items() if lr.status in ("failed", "error")),
        "warning_rules": sum(1 for rid, lr in run_by_rule.items() if lr.status == "warning"),
        "last_run_time":      last_run,
        "recent_runs": [{"run_id": r.run_id, "rule_id": r.rule_id, "status": r.status,
                         "quality_score": r.quality_score,
                         "created_at": r.created_at.isoformat()} for r in recent_runs[:10]],
        "rules":        rule_data,
        "quality_trend": trend,
    }


@router.get("/history/table/{asset_id}")
async def table_history(
    asset_id: str,
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if asset:
        check_domain_access(user, asset.domain_id)
    trend = await _build_trend(db, days=days, asset_id=asset_id)
    return {"asset_id": asset_id, "days": days, "history": trend}


@router.get("/history/subdomain/{subdomain_id}")
async def subdomain_history(
    subdomain_id: str,
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    sub = (await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))).scalar_one_or_none()
    if sub:
        check_domain_access(user, sub.domain_id)
    trend = await _build_trend(db, days=days, subdomain_id=subdomain_id)
    return {"subdomain_id": subdomain_id, "days": days, "history": trend}


@router.get("/history/domain/{domain_id}")
async def domain_history(
    domain_id: str,
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_domain_access(user, domain_id)
    trend = await _build_trend(db, days=days, domain_id=domain_id)
    return {"domain_id": domain_id, "days": days, "history": trend}


@router.get("/trend")
async def global_trend(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality trend for N days. Used by dashboard trend tab switcher."""
    domain_scope = get_domain_filter(user)
    trend = await _build_trend(db, days=days, domain_id=domain_scope)
    return {"days": days, "trend": trend}


@router.get("/dimensions")
async def quality_dimensions(
    domain_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality scores grouped by data quality dimension for today's runs."""
    if domain_id:
        check_domain_access(user, domain_id)
    domain_scope = domain_id or get_domain_filter(user)
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()

    q = (
        select(DQRule.rule_type, DQRuleRun.status)
        .join(DQRuleRun, DQRule.rule_id == DQRuleRun.rule_id)
        .where(func.date(DQRuleRun.created_at) == today)
        .where(DQRule.is_active == True)
    )
    if domain_scope:
        q = q.where(DQRule.domain_id == domain_scope)

    rows = (await db.execute(q)).all()

    # Standard 6 quality dimensions (ISO 8000 / DAMA aligned)
    dimension_map: dict[str, list[str]] = {
        "completeness":   ["null_check", "volume_check"],
        "accuracy":       ["business_rule_check", "custom_sql_check", "business_metric_check",
                           "llm_semantic_check"],
        "uniqueness":     ["uniqueness_check", "duplicate_check"],
        "validity":       ["range_check", "accepted_values_check", "regex_check"],
        "timeliness":     ["freshness_check"],
        "consistency":    ["referential_integrity_check", "referential_sanity_check",
                           "semantic_consistency_check", "distribution_consistency_check",
                           "schema_drift_check"],
    }

    result: dict[str, Optional[float]] = {}
    for dim, rule_types in dimension_map.items():
        dim_rows = [r for r in rows if r.rule_type in rule_types]
        total = len(dim_rows)
        passed = sum(1 for r in dim_rows if r.status == "passed")
        result[dim] = round(passed / total * 100, 1) if total > 0 else None

    return result


@router.get("/sla-breaches")
async def sla_breaches(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return current SLA breaches based on today's quality scores."""
    from app.services.scoring_service import check_sla_breaches
    breaches = await check_sla_breaches(db)
    return {"breaches": breaches, "total": len(breaches)}


@router.get("/summary")
async def platform_summary(db: AsyncSession = Depends(get_db)):
    """High-level platform summary for executive reporting."""
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    domains_count = (await db.execute(select(func.count()).select_from(Domain).where(Domain.is_active == True))).scalar() or 0
    assets_count = (await db.execute(select(func.count()).select_from(DataAsset).where(DataAsset.is_active == True))).scalar() or 0
    rules_count = (await db.execute(select(func.count()).select_from(DQRule).where(DQRule.is_active == True))).scalar() or 0
    open_alerts = (await db.execute(select(func.count()).select_from(DQAlert).where(DQAlert.alert_status == "open"))).scalar() or 0
    critical_alerts = (await db.execute(select(func.count()).select_from(DQAlert).where(DQAlert.alert_status == "open", DQAlert.severity == "critical"))).scalar() or 0

    today_runs = await db.execute(select(DQRuleRun).where(func.date(DQRuleRun.created_at) == today))
    runs = today_runs.scalars().all()
    passed = sum(1 for r in runs if r.status == "passed")
    failed = sum(1 for r in runs if r.status in ("failed", "error"))
    total_runs = len(runs)
    pass_rate = round(passed / total_runs * 100, 1) if total_runs > 0 else 100.0

    return {
        "total_domains": domains_count,
        "total_assets": assets_count,
        "total_active_rules": rules_count,
        "open_alerts": open_alerts,
        "critical_alerts": critical_alerts,
        "today_runs": total_runs,
        "today_passed": passed,
        "today_failed": failed,
        "pass_rate_today": pass_rate,
    }


@router.get("/export/runs")
async def export_runs_csv(
    domain_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Export rule runs as CSV for the given filters."""
    since = datetime.now(timezone.utc).replace(tzinfo=None).date() - timedelta(days=days)
    q = (
        select(DQRuleRun, DQRule, DataAsset, Domain)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
        .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
        .where(func.date(DQRuleRun.created_at) >= since)
        .order_by(desc(DQRuleRun.created_at))
    )
    if domain_id:
        q = q.where(DQRuleRun.domain_id == domain_id)
    if asset_id:
        q = q.where(DQRuleRun.asset_id == asset_id)

    result = await db.execute(q)
    rows = result.all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "run_id", "rule_name", "rule_type", "severity",
        "domain", "schema", "table",
        "status", "quality_score", "total_rows", "failed_rows", "failure_pct",
        "executed_at",
    ])
    for run, rule, asset, domain in rows:
        writer.writerow([
            run.run_id, rule.rule_name, rule.rule_type, rule.severity,
            domain.domain_name, asset.sf_schema_name, asset.sf_table_name,
            run.status,
            round(run.quality_score, 2) if run.quality_score is not None else "",
            run.total_rows_scanned or "",
            run.failed_rows_count or "",
            round(run.failure_percentage, 4) if run.failure_percentage is not None else "",
            run.created_at.isoformat(),
        ])

    buf.seek(0)
    filename = f"dq_runs_{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
