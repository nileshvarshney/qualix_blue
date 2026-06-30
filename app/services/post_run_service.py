from __future__ import annotations
import logging
import uuid
from typing import Optional

from app.db.database import AsyncSessionLocal

logger = logging.getLogger("dq_platform.post_run")


async def handle(run_id: str, asset_id: str) -> None:
    """
    Post-run orchestrator entry point. Opens its own DB session so it is
    fully independent of the rule execution session that called it.
    Call via asyncio.create_task() — do not await directly from execute_rule().
    """
    async with AsyncSessionLocal() as db:
        await _run(run_id, asset_id, db)


async def _run(run_id: str, asset_id: str, db) -> None:
    from sqlalchemy import select
    from app.db.models import DQRule, DQRuleRun, Asset

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        logger.warning(f"post_run: run {run_id} not found — skipping")
        return

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        logger.warning(f"post_run: rule {run.rule_id} not found — skipping")
        return

    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        logger.warning(f"post_run: asset {asset_id} not found — skipping")
        return

    # ── Step 1: Trigger anomaly detection ─────────────────────────────────────
    detection_info: Optional[dict] = None
    try:
        detection_info = await _trigger_anomaly_detection(asset_id, db)
    except Exception as e:
        logger.warning(f"post_run: anomaly detection failed for asset {asset_id}: {e}")

    # ── Step 2: Generate AI explanation for failures or low-scoring runs ───────
    explanation: Optional[str] = None
    if run.status in ("failed", "error") or (run.quality_score is not None and run.quality_score < 70):
        try:
            from app.services import ai_service
            explanation = await ai_service.explain_failure(run_id, run.rule_id, None, db)
            run.ai_explanation = explanation
            await db.commit()
        except Exception as e:
            logger.warning(f"post_run: explain_failure failed for run {run_id}: {e}")

    # ── Step 3: Generate AI explanation for the anomaly ───────────────────────
    if detection_info is not None:
        try:
            from app.services import ai_service
            from app.db.models import AnomalyDetection
            anomaly_text = await ai_service.explain_anomaly(detection_info, asset, None, db)
            det_res = await db.execute(
                select(AnomalyDetection).where(
                    AnomalyDetection.detection_id == detection_info["detection_id"]
                )
            )
            detection_obj = det_res.scalar_one_or_none()
            if detection_obj:
                detection_obj.ai_explanation = anomaly_text
                await db.commit()
        except Exception as e:
            logger.warning(f"post_run: explain_anomaly failed for detection {detection_info.get('detection_id')}: {e}")

    # ── Step 4: Auto-create Issue for failures, then propose a remediation ───
    if run.status == "failed":
        issue = None
        try:
            issue = await _auto_create_issue(run, rule, asset, db)
        except Exception as e:
            logger.warning(f"post_run: issue creation failed for run {run_id}: {e}")
        if issue is not None:
            try:
                from app.services import remediation_service
                await remediation_service.generate_proposal(issue, run, rule, db)
            except Exception as e:
                logger.warning(f"post_run: remediation proposal generation failed for run {run_id}: {e}")

    # ── Step 5: Enrich existing DQAlert with AI explanation ──────────────────
    if explanation:
        try:
            await _enrich_alert(run_id, explanation, db)
        except Exception as e:
            logger.warning(f"post_run: alert enrichment failed for run {run_id}: {e}")


async def _trigger_anomaly_detection(asset_id: str, db) -> Optional[dict]:
    from sqlalchemy import select
    from app.db.models import AnomalyDetector
    from app.services.anomaly_service import run_zscore_detector

    det_res = await db.execute(
        select(AnomalyDetector).where(
            AnomalyDetector.asset_id == asset_id,
            AnomalyDetector.is_active == True,
        )
    )
    detector = det_res.scalar_one_or_none()

    if detector is None:
        detector = AnomalyDetector(
            detector_id=str(uuid.uuid4()),
            asset_id=asset_id,
            detector_type="zscore",
            config={"z_threshold": 2.5, "min_history": 7},
            is_active=True,
            created_by="system",
        )
        db.add(detector)
        await db.commit()
        await db.refresh(detector)

    return await run_zscore_detector(detector.detector_id, db)


async def _auto_create_issue(run, rule, asset, db) -> Optional["Issue"]:
    from sqlalchemy import select
    from app.db.models import Issue
    from app.services import ai_service

    existing = await db.execute(
        select(Issue).where(
            Issue.rule_id == rule.rule_id,
            Issue.asset_id == run.asset_id,
            Issue.status.not_in(["closed", "resolved"]),
        )
    )
    existing_issue = existing.scalar_one_or_none()
    if existing_issue is not None:
        logger.debug(f"post_run: open issue exists for rule {rule.rule_id} — skipping creation")
        return existing_issue

    description = f"Rule '{rule.rule_name}' failed. Manual investigation required."
    try:
        plan = await ai_service.generate_remediation_plan(run.asset_id, None, db)
        if plan.get("steps"):
            lines = [f"**AI Remediation Plan**\n\n{plan.get('summary', '')}"]
            for step in plan["steps"]:
                priority = step.get("priority", "").upper()
                action = step.get("action", "")
                owner = step.get("owner_role", "")
                effort = step.get("estimated_effort", "")
                lines.append(f"- [{priority}] {action} (owner: {owner}, effort: {effort})")
            description = "\n".join(lines)
    except Exception as e:
        logger.warning(f"post_run: generate_remediation_plan failed: {e}")

    issue = Issue(
        title=f"[Auto] {rule.rule_name} failed on {asset.sf_table_name}",
        description=description,
        issue_type="data_quality",
        status="new",
        severity=rule.severity,
        domain_id=run.domain_id,
        subdomain_id=run.subdomain_id,
        asset_id=run.asset_id,
        rule_id=run.rule_id,
        run_id=run.run_id,
        assigned_team_id=None,
        created_by="system",
    )
    db.add(issue)
    await db.commit()
    await db.refresh(issue)
    logger.info(f"post_run: auto-created issue for rule {rule.rule_id} on asset {asset.asset_id}")
    return issue


async def _enrich_alert(run_id: str, explanation: str, db) -> None:
    from sqlalchemy import select
    from app.db.models import DQAlert

    alert_res = await db.execute(
        select(DQAlert).where(
            DQAlert.run_id == run_id,
            DQAlert.alert_status == "open",
        )
    )
    alert = alert_res.scalar_one_or_none()
    if alert:
        alert.alert_message = explanation[:500]
        await db.commit()
        logger.debug(f"post_run: enriched alert for run {run_id} with AI explanation")
