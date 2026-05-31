from __future__ import annotations

"""
Admin utility endpoints — domain data cleanup and platform reset.
All destructive operations require admin role and log to audit_logs.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.database import get_db
from app.db.models import (
    Domain, Subdomain, DataAsset, DQRule, DQSchedule,
    DQRuleRun, DQRuleRunSample, DQQualityScore, DQAlert,
    AuditLog, RuleVersion, RuleTag,
    DataClassification, ColumnMetadata, GlossaryTermAsset,
    AssetComment, AssetUsage, AssetRating, AssetTag,
    CustomAttribute, AnomalyDetector, AnomalyDetection,
    QualityCostConfig, QualityIncident, ComplianceMapping,
    DataContract, DataSharingAgreement,
    MaskingPolicy, DataProductAsset, AccessRequest,
    AssetAnnouncement, PolicyViolation,
)
from app.core.security import require_admin

logger = logging.getLogger("dq_platform.admin")
router = APIRouter(prefix="/admin", tags=["Admin Utilities"])

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def _delete_domain_data(domain_id: str, db: AsyncSession) -> dict:
    """
    Cascade-delete all data owned by a domain in safe dependency order.
    Returns counts of deleted rows per table.
    """
    counts: dict[str, int] = {}

    # 1. Collect asset_ids so we can delete asset-level child records
    asset_res = await db.execute(
        select(DataAsset.asset_id).where(DataAsset.domain_id == domain_id)
    )
    asset_ids = [r[0] for r in asset_res.all()]

    # 2. Collect rule_ids
    rule_res = await db.execute(
        select(DQRule.rule_id).where(DQRule.domain_id == domain_id)
    )
    rule_ids = [r[0] for r in rule_res.all()]

    # 3. Collect run_ids
    run_ids: list[str] = []
    if rule_ids:
        run_res = await db.execute(
            select(DQRuleRun.run_id).where(DQRuleRun.domain_id == domain_id)
        )
        run_ids = [r[0] for r in run_res.all()]

    async def _del(model, *conditions):
        if not conditions:
            return 0
        stmt = delete(model)
        for cond in conditions:
            stmt = stmt.where(cond)
        result = await db.execute(stmt)
        return result.rowcount

    # ── Asset-level child records ──────────────────────────────────────────
    if asset_ids:
        counts["data_classifications"] = await _del(DataClassification, DataClassification.asset_id.in_(asset_ids))
        counts["column_metadata"]      = await _del(ColumnMetadata,      ColumnMetadata.asset_id.in_(asset_ids))
        counts["glossary_term_assets"] = await _del(GlossaryTermAsset,   GlossaryTermAsset.asset_id.in_(asset_ids))
        counts["asset_comments"]       = await _del(AssetComment,  AssetComment.entity_type == "asset",   AssetComment.entity_id.in_(asset_ids))
        counts["asset_usage"]          = await _del(AssetUsage,    AssetUsage.asset_id.in_(asset_ids))
        counts["asset_ratings"]        = await _del(AssetRating,   AssetRating.asset_id.in_(asset_ids))
        counts["asset_tags"]           = await _del(AssetTag,      AssetTag.entity_type == "asset",       AssetTag.entity_id.in_(asset_ids))
        counts["custom_attributes"]    = await _del(CustomAttribute,  CustomAttribute.entity_type == "asset", CustomAttribute.entity_id.in_(asset_ids))
        counts["anomaly_detectors"]    = await _del(AnomalyDetector,  AnomalyDetector.asset_id.in_(asset_ids))
        counts["anomaly_detections"]   = await _del(AnomalyDetection, AnomalyDetection.asset_id.in_(asset_ids))
        counts["quality_cost_configs"] = await _del(QualityCostConfig, QualityCostConfig.asset_id.in_(asset_ids))
        counts["quality_incidents"]    = await _del(QualityIncident,   QualityIncident.asset_id.in_(asset_ids))
        counts["compliance_mappings"]  = await _del(ComplianceMapping, ComplianceMapping.asset_id.in_(asset_ids))
        counts["data_contracts"]       = await _del(DataContract,  DataContract.asset_id.in_(asset_ids))
        # data_object_relationships cleaned via ON DELETE CASCADE on data_objects
        counts["masking_policies"]     = await _del(MaskingPolicy,  MaskingPolicy.asset_id.in_(asset_ids))
        counts["data_product_assets"]  = await _del(DataProductAsset, DataProductAsset.asset_id.in_(asset_ids))
        counts["access_requests"]      = await _del(AccessRequest,  AccessRequest.asset_id.in_(asset_ids))
        counts["asset_announcements"]  = await _del(AssetAnnouncement, AssetAnnouncement.entity_type == "asset", AssetAnnouncement.entity_id.in_(asset_ids))

    # ── Rule-level child records ───────────────────────────────────────────
    if rule_ids:
        counts["rule_tags"]      = await _del(RuleTag,     RuleTag.rule_id.in_(rule_ids))
        counts["rule_versions"]  = await _del(RuleVersion, RuleVersion.rule_id.in_(rule_ids))
        counts["dq_schedules"]   = await _del(DQSchedule,  DQSchedule.domain_id == domain_id)

    # ── Run-level child records ────────────────────────────────────────────
    if run_ids:
        counts["run_samples"] = await _del(DQRuleRunSample, DQRuleRunSample.run_id.in_(run_ids))

    # ── Top-level domain records ───────────────────────────────────────────
    counts["rule_runs"]        = await _del(DQRuleRun,        DQRuleRun.domain_id == domain_id)
    counts["quality_scores"]   = await _del(DQQualityScore,   DQQualityScore.domain_id == domain_id)
    counts["alerts"]           = await _del(DQAlert,          DQAlert.domain_id == domain_id)
    counts["policy_violations"]= await _del(PolicyViolation,  PolicyViolation.entity_id.in_(asset_ids)) if asset_ids else 0
    counts["rules"]            = await _del(DQRule,            DQRule.domain_id == domain_id)
    counts["sharing_agreements"]= await _del(DataSharingAgreement,
                                             DataSharingAgreement.producer_domain_id == domain_id)
    counts["data_assets"]      = await _del(DataAsset,  DataAsset.domain_id == domain_id)

    return {k: v for k, v in counts.items() if v and v > 0}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/domains")
async def list_domains_with_stats(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Return every domain with counts of assets, rules, and runs for the cleanup UI."""
    from sqlalchemy import func
    domains_res = await db.execute(select(Domain))
    domains = domains_res.scalars().all()

    result = []
    for d in domains:
        asset_count = (await db.execute(
            select(func.count()).select_from(DataAsset).where(DataAsset.domain_id == d.domain_id)
        )).scalar() or 0
        rule_count = (await db.execute(
            select(func.count()).select_from(DQRule).where(DQRule.domain_id == d.domain_id)
        )).scalar() or 0
        run_count = (await db.execute(
            select(func.count()).select_from(DQRuleRun).where(DQRuleRun.domain_id == d.domain_id)
        )).scalar() or 0
        result.append({
            "domain_id":   d.domain_id,
            "domain_name": d.domain_name,
            "is_active":   d.is_active,
            "owner_email": d.owner_email,
            "asset_count": asset_count,
            "rule_count":  rule_count,
            "run_count":   run_count,
        })
    return result


@router.delete("/domains/{domain_id}/data")
async def clean_domain_data(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """
    Remove ALL data owned by this domain (assets, rules, runs, alerts, scores, etc.)
    while keeping the domain and subdomain records themselves.
    This cannot be undone.
    """
    domain_res = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = domain_res.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")

    counts = await _delete_domain_data(domain_id, db)

    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=user.get("email"),
        action="CLEAN_DOMAIN_DATA",
        entity_type="domain",
        entity_id=domain_id,
        old_value=None,
        new_value={"domain_name": domain.domain_name, "deleted_counts": counts},
        created_at=_utcnow(),
    ))
    await db.commit()

    total = sum(counts.values())
    logger.info(f"Domain {domain.domain_name} data cleaned by {user.get('email')} — {total} rows deleted")
    return {
        "domain_id":   domain_id,
        "domain_name": domain.domain_name,
        "deleted":     counts,
        "total_rows":  total,
        "message":     f"All data for domain '{domain.domain_name}' has been removed.",
    }


@router.delete("/domains/{domain_id}")
async def delete_domain_completely(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """
    Remove ALL data AND the domain + subdomains themselves.
    Complete removal from the system.
    """
    domain_res = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = domain_res.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")

    domain_name = domain.domain_name

    # Clean all child data first
    counts = await _delete_domain_data(domain_id, db)

    # Delete subdomains (only in full-delete path, not clean-data)
    sub_res = await db.execute(delete(Subdomain).where(Subdomain.domain_id == domain_id))
    subdomain_count = sub_res.rowcount
    if subdomain_count:
        counts["subdomains"] = subdomain_count

    # Then delete the domain itself
    await db.delete(domain)

    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=user.get("email"),
        action="DELETE_DOMAIN",
        entity_type="domain",
        entity_id=domain_id,
        old_value={"domain_name": domain_name},
        new_value={"deleted_counts": counts},
        created_at=_utcnow(),
    ))
    await db.commit()

    total = sum(counts.values())
    logger.info(f"Domain {domain_name} fully deleted by {user.get('email')} — {total} rows deleted")
    return {
        "domain_id":   domain_id,
        "domain_name": domain_name,
        "deleted":     counts,
        "total_rows":  total,
        "message":     f"Domain '{domain_name}' and all its data have been permanently removed.",
    }
