from __future__ import annotations
from typing import Optional

import logging
import uuid
from datetime import datetime, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete

logger = logging.getLogger("dq_platform.scoring")

SEVERITY_PENALTIES = {"critical": 25, "high": 15, "medium": 7, "low": 3}


def calculate_rule_quality_score(total_rows: int, failed_rows: int) -> float:
    if total_rows == 0:
        return 100.0
    failure_pct = (failed_rows / total_rows) * 100
    return max(0.0, round(100.0 - failure_pct, 2))


def calculate_aggregate_score(rule_results: list[dict]) -> float:
    """Weighted score starting from 100, subtracting severity penalties for failures."""
    if not rule_results:
        return 100.0
    score = 100.0
    for r in rule_results:
        if r.get("status") in ("failed", "error"):
            penalty = SEVERITY_PENALTIES.get(r.get("severity", "medium"), 7)
            score -= penalty
    return max(0.0, round(score, 2))


def calculate_score_from_counts(
    passed: int, failed: int, warning: int, error: int, severity_map: Optional[dict[str, str]] = None
) -> float:
    total = passed + failed + warning + error
    if total == 0:
        return 100.0
    score = (passed / total) * 100
    return round(score, 2)


async def aggregate_quality_scores(db: AsyncSession, run_date: Optional[date] = None) -> None:
    """
    Compute and persist aggregated quality scores in dq_quality_scores for today.
    Called after each rule execution batch.
    """
    from app.db.models import DQRuleRun, DQRule, DataAsset, Domain, Subdomain, DQQualityScore

    target_date = run_date or datetime.now(timezone.utc).replace(tzinfo=None).date()

    # Load all runs for the target date
    runs_result = await db.execute(
        select(DQRuleRun, DQRule)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(func.date(DQRuleRun.created_at) == target_date)
    )
    rows = runs_result.all()

    if not rows:
        return

    # Group runs by asset, subdomain, domain
    by_asset: dict[str, list[dict]] = {}
    by_subdomain: dict[str, list[dict]] = {}
    by_domain: dict[str, list[dict]] = {}
    global_runs: list[dict] = []

    for run, rule in rows:
        entry = {"status": run.status, "severity": rule.severity, "quality_score": run.quality_score}
        by_asset.setdefault(run.asset_id, []).append(entry)
        by_subdomain.setdefault(run.subdomain_id, []).append(entry)
        by_domain.setdefault(run.domain_id, []).append(entry)
        global_runs.append(entry)

    def _counts(entries: list[dict]) -> dict:
        return {
            "total": len(entries),
            "passed": sum(1 for e in entries if e["status"] == "passed"),
            "failed": sum(1 for e in entries if e["status"] == "failed"),
            "warning": sum(1 for e in entries if e["status"] == "warning"),
            "error": sum(1 for e in entries if e["status"] == "error"),
            "score": calculate_aggregate_score(entries),
        }

    score_records: list[DQQualityScore] = []

    # Delete existing scores for target_date in one bulk statement
    await db.execute(sa_delete(DQQualityScore).where(DQQualityScore.score_date == target_date))

    # Asset-level scores
    for asset_id, entries in by_asset.items():
        c = _counts(entries)
        score_records.append(DQQualityScore(
            score_id=str(uuid.uuid4()), score_date=target_date, score_level="table",
            asset_id=asset_id, total_rules=c["total"], passed_rules=c["passed"],
            failed_rules=c["failed"], warning_rules=c["warning"], error_rules=c["error"],
            quality_score=c["score"], created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    # Subdomain-level scores
    for subdomain_id, entries in by_subdomain.items():
        c = _counts(entries)
        score_records.append(DQQualityScore(
            score_id=str(uuid.uuid4()), score_date=target_date, score_level="subdomain",
            subdomain_id=subdomain_id, total_rules=c["total"], passed_rules=c["passed"],
            failed_rules=c["failed"], warning_rules=c["warning"], error_rules=c["error"],
            quality_score=c["score"], created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    # Domain-level scores
    for domain_id, entries in by_domain.items():
        c = _counts(entries)
        score_records.append(DQQualityScore(
            score_id=str(uuid.uuid4()), score_date=target_date, score_level="domain",
            domain_id=domain_id, total_rules=c["total"], passed_rules=c["passed"],
            failed_rules=c["failed"], warning_rules=c["warning"], error_rules=c["error"],
            quality_score=c["score"], created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    # Global score
    if global_runs:
        c = _counts(global_runs)
        score_records.append(DQQualityScore(
            score_id=str(uuid.uuid4()), score_date=target_date, score_level="global",
            total_rules=c["total"], passed_rules=c["passed"],
            failed_rules=c["failed"], warning_rules=c["warning"], error_rules=c["error"],
            quality_score=c["score"], created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    for record in score_records:
        db.add(record)
    await db.commit()
    logger.info(f"Aggregated {len(score_records)} quality score records for {target_date}")


async def check_sla_breaches(db: AsyncSession, run_date: Optional[date] = None) -> list[dict]:
    """Check dq_quality_scores against SLA configs and return breaches."""
    from app.db.models import DQQualityScore, SLAConfig

    target_date = run_date or datetime.now(timezone.utc).replace(tzinfo=None).date()
    breaches = []

    sla_res = await db.execute(select(SLAConfig).where(SLAConfig.is_active == True))
    sla_configs = sla_res.scalars().all()

    for sla in sla_configs:
        q = select(DQQualityScore).where(DQQualityScore.score_date == target_date)
        if sla.entity_type == "global":
            q = q.where(DQQualityScore.score_level == "global")
        elif sla.entity_type == "domain":
            q = q.where(DQQualityScore.domain_id == sla.entity_id, DQQualityScore.score_level == "domain")
        elif sla.entity_type == "subdomain":
            q = q.where(DQQualityScore.subdomain_id == sla.entity_id, DQQualityScore.score_level == "subdomain")
        elif sla.entity_type == "table":
            q = q.where(DQQualityScore.asset_id == sla.entity_id, DQQualityScore.score_level == "table")
        else:
            continue

        scores_res = await db.execute(q)
        score = scores_res.scalar_one_or_none()
        if score and score.quality_score < sla.min_quality_score:
            breaches.append({
                "sla_id": sla.sla_id,
                "entity_type": sla.entity_type,
                "entity_id": sla.entity_id,
                "min_required": sla.min_quality_score,
                "actual_score": score.quality_score,
                "breach_delta": round(sla.min_quality_score - score.quality_score, 2),
            })

    return breaches
