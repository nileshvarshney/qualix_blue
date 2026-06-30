from __future__ import annotations

"""Policy engine — evaluate all governance policies against all assets."""
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

logger = logging.getLogger("dq_platform.governance")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def evaluate_policies(db: AsyncSession) -> int:
    """
    Run all active policies against all assets.
    Creates/updates PolicyViolation records for any failures.
    Returns total violation count.
    """
    from app.db.models import (
        GovernancePolicy, PolicyViolation, Asset, DQRule,
        DataClassification, ColumnMetadata
    )
    import uuid

    policies_res = await db.execute(
        select(GovernancePolicy).where(GovernancePolicy.is_active == True)
    )
    policies = policies_res.scalars().all()

    assets_res = await db.execute(
        select(Asset).where(Asset.is_active == True)
    )
    assets = assets_res.scalars().all()
    asset_ids = [a.asset_id for a in assets]

    # Active rule counts per asset, fetched once instead of once per (policy, asset).
    rule_counts_res = await db.execute(
        select(DQRule.asset_id, func.count()).where(
            DQRule.asset_id.in_(asset_ids), DQRule.is_active == True
        ).group_by(DQRule.asset_id)
    )
    rule_counts = dict(rule_counts_res.all())

    # All open violations for these policies, fetched once instead of once per (policy, asset).
    policy_ids = [p.policy_id for p in policies]
    existing_res = await db.execute(
        select(PolicyViolation).where(
            PolicyViolation.policy_id.in_(policy_ids),
            PolicyViolation.entity_type == "asset",
            PolicyViolation.entity_id.in_(asset_ids),
            PolicyViolation.status == "open",
        )
    )
    existing_by_key = {
        (v.policy_id, v.entity_id): v for v in existing_res.scalars().all()
    }

    violation_count = 0

    for policy in policies:
        for asset in assets:
            violated = False
            detail = ""

            if policy.policy_type == "owner_required":
                if not asset.owner_email:
                    violated = True
                    detail = f"Table '{asset.sf_table_name}' has no owner_email set"

            elif policy.policy_type == "certification_required":
                if asset.certification_status == "uncertified":
                    violated = True
                    detail = f"Table '{asset.sf_table_name}' is uncertified"

            elif policy.policy_type == "no_rules_defined":
                rule_count = rule_counts.get(asset.asset_id, 0)
                if rule_count == 0:
                    violated = True
                    detail = f"Table '{asset.sf_table_name}' has no active rules"

            elif policy.policy_type == "stale_description":
                if not asset.table_description:
                    violated = True
                    detail = f"Table '{asset.sf_table_name}' has no description"

            existing = existing_by_key.get((policy.policy_id, asset.asset_id))
            if violated:
                if not existing:
                    v = PolicyViolation(
                        violation_id=str(uuid.uuid4()),
                        policy_id=policy.policy_id,
                        entity_type="asset",
                        entity_id=asset.asset_id,
                        violation_detail=detail,
                        status="open",
                        detected_at=_utcnow(),
                    )
                    db.add(v)
                    violation_count += 1
                    # Notify asset owner of new violation
                    if asset.owner_email:
                        try:
                            from app.services.notification_service import create_notification
                            await create_notification(
                                user_email=asset.owner_email,
                                type="violation_detected",
                                title=f"Policy Violation: {policy.policy_name}",
                                body=detail,
                                entity_type="asset",
                                entity_id=asset.asset_id,
                                db=db,
                            )
                        except Exception as _ne:
                            logger.warning("Notification failed: %s", _ne)
            else:
                if existing:
                    existing.status = "resolved"
                    existing.resolved_at = _utcnow()

    await db.commit()
    logger.info(f"Policy evaluation complete: {violation_count} new violations")
    return violation_count


async def compute_domain_scorecard(domain_id: str, db: AsyncSession) -> dict:
    """Compute the 6-dimension governance scorecard for a domain (0-100 each)."""
    from app.db.models import Asset, DQRule, DataClassification, DQQualityScore
    from sqlalchemy import func as sqlfunc
    from datetime import date, timedelta

    assets_res = await db.execute(
        select(Asset).where(Asset.domain_id == domain_id, Asset.is_active == True)
    )
    assets = assets_res.scalars().all()
    total = len(assets)
    if total == 0:
        return {
            "domain_id": domain_id, "overall_score": 0,
            "dimensions": {k: 0 for k in ["quality", "documentation", "classification", "ownership", "certification", "sla"]}
        }

    # Documentation: % assets with description
    with_desc = sum(1 for a in assets if a.table_description)
    docs_score = round(with_desc / total * 100, 1)

    # Ownership: % assets with owner_email
    with_owner = sum(1 for a in assets if a.owner_email)
    ownership_score = round(with_owner / total * 100, 1)

    # Certification: % assets that are certified
    certified = sum(1 for a in assets if a.certification_status == "certified")
    cert_score = round(certified / total * 100, 1)

    # Quality: avg quality score from today's scores
    today = date.today()
    scores_res = await db.execute(
        select(DQQualityScore).where(
            DQQualityScore.domain_id == domain_id,
            DQQualityScore.score_level == "domain",
            DQQualityScore.score_date == today,
        )
    )
    score_row = scores_res.scalars().first()
    quality_score = round(float(score_row.quality_score), 1) if score_row and score_row.quality_score else 0.0

    # Classification: % assets with at least one classification
    asset_ids = [a.asset_id for a in assets]
    classified_res = await db.execute(
        select(sqlfunc.count(sqlfunc.distinct(DataClassification.asset_id))).where(
            DataClassification.asset_id.in_(asset_ids)
        )
    )
    classified_count = classified_res.scalar() or 0
    class_score = round(classified_count / total * 100, 1)

    # SLA: use quality score vs 95% threshold as proxy
    sla_score = min(100.0, round(quality_score / 95 * 100, 1)) if quality_score > 0 else 0.0

    overall = round(
        quality_score * 0.40 +
        docs_score    * 0.20 +
        class_score   * 0.15 +
        ownership_score * 0.10 +
        cert_score    * 0.10 +
        sla_score     * 0.05,
        1
    )

    return {
        "domain_id": domain_id,
        "overall_score": overall,
        "dimensions": {
            "quality": quality_score,
            "documentation": docs_score,
            "classification": class_score,
            "ownership": ownership_score,
            "certification": cert_score,
            "sla": sla_score,
        }
    }
