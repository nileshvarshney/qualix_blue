from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone, timedelta
from app.db.database import get_db
from app.db.models import DQQualityScore, DQRuleRun, DQRule, DataAsset
from app.core.security import get_current_user
from typing import Any

router = APIRouter(prefix="/cicd", tags=["CI/CD"])


@router.post("/gate/evaluate")
async def evaluate_gate(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Evaluate a CI/CD quality gate for an asset.
    Returns gate_passed, quality_score, blocking_failures, recommendations.
    """
    asset_id: str = body.get("asset_id", "")
    min_quality_score: float = float(body.get("min_quality_score", 95.0))
    fail_on_critical: bool = bool(body.get("fail_on_critical", True))

    if not asset_id:
        raise HTTPException(400, "asset_id is required")

    # Verify asset exists
    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    # Fetch latest quality score
    qs_result = await db.execute(
        select(DQQualityScore)
        .where(
            DQQualityScore.asset_id == asset_id,
            DQQualityScore.score_level == "table",
        )
        .order_by(desc(DQQualityScore.score_date))
        .limit(1)
    )
    latest_qs = qs_result.scalar_one_or_none()
    current_score: Optional[float] = float(latest_qs.quality_score) if latest_qs else None

    blocking_failures: list[str] = []
    recommendations: list[str] = []

    # Check quality score threshold
    score_ok = True
    if current_score is None:
        blocking_failures.append("No quality score available for this asset.")
        recommendations.append("Run data quality checks before deploying.")
        score_ok = False
    elif current_score < min_quality_score:
        blocking_failures.append(
            f"Quality score {current_score:.1f}% is below required minimum {min_quality_score:.1f}%."
        )
        recommendations.append(
            f"Fix failing rules to raise quality score above {min_quality_score:.1f}%."
        )
        score_ok = False

    # Check for critical failures today
    critical_ok = True
    if fail_on_critical:
        today_cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).replace(tzinfo=None)
        critical_result = await db.execute(
            select(DQRuleRun, DQRule)
            .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
            .where(
                DQRuleRun.asset_id == asset_id,
                DQRuleRun.status == "failed",
                DQRule.severity == "critical",
                DQRuleRun.created_at >= today_cutoff,
            )
            .order_by(desc(DQRuleRun.created_at))
            .limit(10)
        )
        critical_runs = critical_result.all()
        if critical_runs:
            critical_ok = False
            for run, rule in critical_runs:
                blocking_failures.append(
                    f"Critical rule '{rule.rule_name}' failed at {run.created_at.isoformat()}."
                )
            recommendations.append("Investigate and fix critical rule failures before proceeding.")

    gate_passed = score_ok and critical_ok and len(blocking_failures) == 0

    if gate_passed:
        recommendations.append("All quality gates passed. Safe to deploy.")

    return {
        "gate_passed": gate_passed,
        "quality_score": current_score,
        "min_required_score": min_quality_score,
        "blocking_failures": blocking_failures,
        "recommendations": recommendations,
        "asset_id": asset_id,
    }


@router.get("/gate/status/{job_id}")
async def get_gate_job_status(
    job_id: str,
    user=Depends(get_current_user),
):
    """Proxy to job_tracker.get_job for a CI/CD gate job."""
    from app.services.job_tracker import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    return job
