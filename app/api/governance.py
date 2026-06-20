from __future__ import annotations
import logging as _logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone
from app.db.database import get_db
from app.db.models import (
    GovernancePolicy, PolicyViolation, Asset, DQRule,
    DQQualityScore, Domain, DataClassification, Subdomain,
)
from app.core.security import get_current_user, require_admin, require_roles

require_approver = require_roles("admin", "domain_owner")

router = APIRouter(prefix="/governance", tags=["Governance"])

# ── Default policies seeded when none exist ───────────────────────────────────

_DEFAULT_POLICIES = [
    {
        "policy_name": "Tables Must Have an Owner",
        "policy_type": "owner_required",
        "severity": "high",
        "description": "Every registered table must have an owner_email set so incidents can be routed.",
    },
    {
        "policy_name": "Tables Must Have a Description",
        "policy_type": "stale_description",
        "severity": "medium",
        "description": "Tables without a description are undiscoverable in the data catalog.",
    },
    {
        "policy_name": "Tables Must Have Active Rules",
        "policy_type": "no_rules_defined",
        "severity": "high",
        "description": "A table registered for more than 7 days with zero active rules is unmonitored.",
    },
    {
        "policy_name": "Tables Must Be Certified",
        "policy_type": "certification_required",
        "severity": "medium",
        "description": "Tables should be reviewed and certified before being used in production pipelines.",
    },
]


async def _seed_default_policies(db: AsyncSession, user: Optional[dict] = None) -> list[GovernancePolicy]:
    """Insert default governance policies if the table is empty. Idempotent."""
    from app.db.models import gen_uuid
    seeded = []
    for spec in _DEFAULT_POLICIES:
        existing = await db.execute(
            select(GovernancePolicy).where(GovernancePolicy.policy_type == spec["policy_type"])
        )
        if not existing.scalar_one_or_none():
            p = GovernancePolicy(
                policy_id=gen_uuid(),
                policy_name=spec["policy_name"],
                policy_type=spec["policy_type"],
                severity=spec["severity"],
                description=spec["description"],
                is_active=True,
                created_by=user.get("email") if user else "system",
            )
            db.add(p)
            seeded.append(p)
    if seeded:
        await db.commit()
    return seeded


# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_policy(p: GovernancePolicy) -> dict:
    return {
        "policy_id": p.policy_id,
        "policy_name": p.policy_name,
        "policy_type": p.policy_type,
        "description": p.description,
        "severity": p.severity,
        "is_active": p.is_active,
        # Use explicit status field when available; fall back to is_active-derived value
        "status": getattr(p, "status", None) or ("active" if p.is_active else "draft"),
        "enforcement": "enforced" if p.severity == "high" else "advisory",
        "config": p.config,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _fmt_violation(v: PolicyViolation, severity: str = "medium") -> dict:
    return {
        "violation_id": v.violation_id,
        "policy_id": v.policy_id,
        "entity_type": v.entity_type,
        "entity_id": v.entity_id,
        "violation_detail": v.violation_detail,
        "severity": severity,
        "status": v.status,
        "detected_at": v.detected_at.isoformat() if v.detected_at else None,
        "resolved_at": v.resolved_at.isoformat() if v.resolved_at else None,
    }


def _fmt_violation_enriched(
    v: PolicyViolation,
    policy: dict,
    asset: dict,
) -> dict:
    return {
        "violation_id": v.violation_id,
        "policy_id": v.policy_id,
        "policy_name": policy.get("policy_name", ""),
        "entity_type": v.entity_type,
        "entity_id": v.entity_id,
        "violation_detail": v.violation_detail,
        "severity": policy.get("severity", "medium"),
        "status": v.status,
        "detected_at": v.detected_at.isoformat() if v.detected_at else None,
        "resolved_at": v.resolved_at.isoformat() if v.resolved_at else None,
        # Enriched context (populated for entity_type=asset)
        "sf_table_name": asset.get("sf_table_name"),
        "sf_schema_name": asset.get("sf_schema_name"),
        "sf_database_name": asset.get("sf_database_name"),
        "domain_name": asset.get("domain_name"),
        "subdomain_name": asset.get("subdomain_name"),
    }


# ── Policies CRUD ─────────────────────────────────────────────────────────────

@router.get("/policies")
async def list_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GovernancePolicy).where(GovernancePolicy.is_active == True)
    )
    policies = result.scalars().all()
    if not policies:
        await _seed_default_policies(db)
        result = await db.execute(
            select(GovernancePolicy).where(GovernancePolicy.is_active == True)
        )
        policies = result.scalars().all()
    return [_fmt_policy(p) for p in policies]


@router.post("/policies")
async def create_policy(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid, ApprovalRequest
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    policy = GovernancePolicy(
        policy_id=gen_uuid(),
        policy_name=body["policy_name"],
        policy_type=body.get("policy_type", "custom"),
        description=body.get("description"),
        severity=body.get("severity", "medium"),
        is_active=False,
        status="pending_review",
        config=body.get("config"),
        created_by=user.get("email"),
    )
    db.add(policy)

    snapshot = {k: body.get(k) for k in ("policy_name", "policy_type", "description", "severity", "config") if body.get(k) is not None}
    approval = ApprovalRequest(
        approval_id=gen_uuid(),
        entity_type="policy",
        entity_id=policy.policy_id,
        entity_snapshot=snapshot,
        status="pending",
        requested_by=user.get("email"),
        created_at=_now,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(policy)
    return _fmt_policy(policy)


@router.put("/policies/{policy_id}")
async def update_policy(
    policy_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_approver),
):
    result = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")
    for field in ("policy_name", "policy_type", "description", "severity", "config"):
        if field in body:
            setattr(policy, field, body[field])
    await db.commit()
    return _fmt_policy(policy)


@router.delete("/policies/{policy_id}")
async def delete_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    result = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")
    policy.is_active = False
    await db.commit()
    return {"message": "Policy deactivated"}


# ── Evaluate ──────────────────────────────────────────────────────────────────

@router.post("/policies/evaluate")
async def evaluate_policies_endpoint(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Evaluate all active governance policies against all active assets.
    Auto-seeds default policies if none exist so the button always produces results.
    Uses governance_service.evaluate_policies() which respects real policy FK constraints.
    """
    # Auto-seed default policies when the table is empty
    existing_policies = await db.execute(
        select(func.count(GovernancePolicy.policy_id)).where(GovernancePolicy.is_active == True)
    )
    policy_count = existing_policies.scalar_one() or 0
    if policy_count == 0:
        await _seed_default_policies(db, user)

    # Delegate to the real service (uses actual policy_ids from DB — no FK violation)
    from app.services.governance_service import evaluate_policies as svc_evaluate
    violations_found = await svc_evaluate(db)

    # Count assets evaluated
    assets_result = await db.execute(
        select(func.count(Asset.asset_id)).where(Asset.is_active == True)
    )
    assets_evaluated = int(assets_result.scalar_one() or 0)

    return {
        "violations_found": violations_found,
        "assets_evaluated": assets_evaluated,
    }


# ── Violations ────────────────────────────────────────────────────────────────

@router.get("/violations")
async def list_violations(
    policy_id: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return violations enriched with policy metadata and asset context."""
    q = select(PolicyViolation)
    if policy_id:
        q = q.where(PolicyViolation.policy_id == policy_id)
    if entity_type:
        q = q.where(PolicyViolation.entity_type == entity_type)
    if status:
        q = q.where(PolicyViolation.status == status)
    result = await db.execute(q.order_by(desc(PolicyViolation.detected_at)))
    violations = result.scalars().all()

    # Fetch policy name + severity in one query
    policy_ids = list({v.policy_id for v in violations})
    policy_map: dict[str, dict] = {}
    if policy_ids:
        pol_result = await db.execute(
            select(GovernancePolicy.policy_id, GovernancePolicy.severity, GovernancePolicy.policy_name).where(
                GovernancePolicy.policy_id.in_(policy_ids)
            )
        )
        for row in pol_result.all():
            policy_map[row.policy_id] = {"severity": row.severity, "policy_name": row.policy_name}

    # Fetch asset context (table/schema/domain/subdomain) for asset-type violations
    asset_ids = list({v.entity_id for v in violations if v.entity_type == "asset"})
    asset_map: dict[str, dict] = {}
    if asset_ids:
        asset_result = await db.execute(
            select(Asset, Domain, Subdomain)
            .join(Domain, Asset.domain_id == Domain.domain_id)
            .join(Subdomain, Asset.subdomain_id == Subdomain.subdomain_id)
            .where(Asset.asset_id.in_(asset_ids))
        )
        for row in asset_result.all():
            asset, domain, subdomain = row
            asset_map[asset.asset_id] = {
                "sf_table_name": asset.sf_table_name,
                "sf_schema_name": asset.sf_schema_name,
                "sf_database_name": asset.sf_database_name,
                "domain_name": domain.domain_name,
                "subdomain_name": subdomain.subdomain_name,
            }

    return [
        _fmt_violation_enriched(v, policy_map.get(v.policy_id, {}), asset_map.get(v.entity_id, {}))
        for v in violations
    ]


@router.post("/violations/{violation_id}/resolve")
async def resolve_violation(
    violation_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(PolicyViolation).where(PolicyViolation.violation_id == violation_id)
    )
    violation = result.scalar_one_or_none()
    if not violation:
        raise HTTPException(404, "Violation not found")
    violation.status = "resolved"
    violation.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"message": "Violation resolved"}


# ── Scorecards ────────────────────────────────────────────────────────────────

async def _compute_domain_scorecard(domain_id: str, db: AsyncSession) -> Optional[dict]:
    """Compute a 6-dimension governance scorecard for one domain."""
    domain_result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = domain_result.scalar_one_or_none()
    if not domain:
        return None

    assets_result = await db.execute(
        select(Asset).where(Asset.domain_id == domain_id, Asset.is_active == True)
    )
    assets = assets_result.scalars().all()
    total_assets = len(assets)

    zero_dims = {
        "quality_score": 0, "documentation_score": 0, "classification_score": 0,
        "ownership_score": 0, "certification_score": 0, "sla_score": 0,
    }
    if total_assets == 0:
        return {
            "domain_id": domain_id,
            "domain_name": domain.domain_name,
            "overall_score": 0.0,
            **zero_dims,
        }

    asset_ids = [a.asset_id for a in assets]

    # Quality (40%) — avg latest quality scores for the domain
    qs_result = await db.execute(
        select(func.avg(DQQualityScore.quality_score)).where(
            DQQualityScore.domain_id == domain_id,
            DQQualityScore.score_level == "table",
        )
    )
    quality_score = float(qs_result.scalar() or 0.0)

    # Documentation (20%) — % of assets with description
    docs_score = sum(1 for a in assets if a.table_description) / total_assets * 100

    # Classification (15%) — % of assets with at least one classification
    class_result = await db.execute(
        select(DataClassification.asset_id)
        .where(DataClassification.asset_id.in_(asset_ids))
        .distinct()
    )
    classified_count = len(class_result.all())
    classification_score = classified_count / total_assets * 100

    # Ownership (10%) — % with owner_email
    ownership_score = sum(1 for a in assets if a.owner_email) / total_assets * 100

    # Certification (10%) — % with certification_status != 'uncertified'
    cert_score = sum(1 for a in assets if a.certification_status != "uncertified") / total_assets * 100

    # SLA (5%) — % of assets covered by at least one active rule
    rules_result = await db.execute(
        select(DQRule.asset_id).where(
            DQRule.domain_id == domain_id,
            DQRule.is_active == True,
        ).distinct()
    )
    covered_count = len(rules_result.all())
    sla_score = covered_count / total_assets * 100

    overall = (
        quality_score * 0.40
        + docs_score * 0.20
        + classification_score * 0.15
        + ownership_score * 0.10
        + cert_score * 0.10
        + sla_score * 0.05
    )

    return {
        "domain_id": domain_id,
        "domain_name": domain.domain_name,
        "overall_score": round(overall, 2),
        "quality_score": round(quality_score, 2),
        "documentation_score": round(docs_score, 2),
        "classification_score": round(classification_score, 2),
        "ownership_score": round(ownership_score, 2),
        "certification_score": round(cert_score, 2),
        "sla_score": round(sla_score, 2),
    }


@router.get("/scorecards")
async def list_scorecards(db: AsyncSession = Depends(get_db)):
    domains_result = await db.execute(select(Domain).where(Domain.is_active == True))
    domains = domains_result.scalars().all()
    scorecards = []
    for domain in domains:
        sc = await _compute_domain_scorecard(domain.domain_id, db)
        if sc:
            scorecards.append(sc)
    return scorecards


@router.get("/scorecards/{domain_id}")
async def get_scorecard(domain_id: str, db: AsyncSession = Depends(get_db)):
    sc = await _compute_domain_scorecard(domain_id, db)
    if not sc:
        raise HTTPException(404, "Domain not found")
    return sc


async def _compute_subdomain_scorecard(subdomain_id: str, db: AsyncSession) -> Optional[dict]:
    """Compute a 6-dimension governance scorecard for one subdomain."""
    sd_result = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))
    subdomain = sd_result.scalar_one_or_none()
    if not subdomain:
        return None

    assets_result = await db.execute(
        select(Asset).where(Asset.subdomain_id == subdomain_id, Asset.is_active == True)
    )
    assets = assets_result.scalars().all()
    total_assets = len(assets)

    zero_dims = {
        "quality_score": 0.0, "documentation_score": 0.0, "classification_score": 0.0,
        "ownership_score": 0.0, "certification_score": 0.0, "sla_score": 0.0,
    }
    if total_assets == 0:
        return {
            "subdomain_id": subdomain_id,
            "subdomain_name": subdomain.subdomain_name,
            "total_assets": 0,
            "overall_score": 0.0,
            **zero_dims,
        }

    asset_ids = [a.asset_id for a in assets]

    # Quality (40%)
    qs_result = await db.execute(
        select(func.avg(DQQualityScore.quality_score)).where(
            DQQualityScore.asset_id.in_(asset_ids),
            DQQualityScore.score_level == "table",
        )
    )
    quality_score = float(qs_result.scalar() or 0.0)

    # Documentation (20%)
    docs_score = sum(1 for a in assets if a.table_description) / total_assets * 100

    # Classification (15%)
    class_result = await db.execute(
        select(DataClassification.asset_id)
        .where(DataClassification.asset_id.in_(asset_ids))
        .distinct()
    )
    classification_score = len(class_result.all()) / total_assets * 100

    # Ownership (10%)
    ownership_score = sum(1 for a in assets if a.owner_email) / total_assets * 100

    # Certification (10%)
    cert_score = sum(1 for a in assets if a.certification_status != "uncertified") / total_assets * 100

    # SLA (5%)
    rules_result = await db.execute(
        select(DQRule.asset_id).where(
            DQRule.subdomain_id == subdomain_id,
            DQRule.is_active == True,
        ).distinct()
    )
    sla_score = len(rules_result.all()) / total_assets * 100

    overall = (
        quality_score * 0.40
        + docs_score * 0.20
        + classification_score * 0.15
        + ownership_score * 0.10
        + cert_score * 0.10
        + sla_score * 0.05
    )

    return {
        "subdomain_id": subdomain_id,
        "subdomain_name": subdomain.subdomain_name,
        "total_assets": total_assets,
        "overall_score": round(overall, 2),
        "quality_score": round(quality_score, 2),
        "documentation_score": round(docs_score, 2),
        "classification_score": round(classification_score, 2),
        "ownership_score": round(ownership_score, 2),
        "certification_score": round(cert_score, 2),
        "sla_score": round(sla_score, 2),
    }


@router.get("/scorecards/{domain_id}/subdomains")
async def get_subdomain_scorecards(domain_id: str, db: AsyncSession = Depends(get_db)):
    """Return per-subdomain governance scorecards for a given domain."""
    domain_result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    if not domain_result.scalar_one_or_none():
        raise HTTPException(404, "Domain not found")

    sd_result = await db.execute(
        select(Subdomain).where(Subdomain.domain_id == domain_id, Subdomain.is_active == True)
    )
    subdomains = sd_result.scalars().all()

    scorecards = []
    for sd in subdomains:
        sc = await _compute_subdomain_scorecard(sd.subdomain_id, db)
        if sc:
            scorecards.append(sc)
    return scorecards


# ── Approval helpers ──────────────────────────────────────────────────────────

def _fmt_approval(a) -> dict:
    return {
        "approval_id": a.approval_id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "entity_snapshot": a.entity_snapshot,
        "status": a.status,
        "requested_by": a.requested_by,
        "reviewed_by": a.reviewed_by,
        "feedback": a.feedback,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
    }


# ── Approval endpoints ────────────────────────────────────────────────────────

@router.get("/approvals")
async def list_approvals(
    entity_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import ApprovalRequest
    q = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())
    if entity_type:
        q = q.where(ApprovalRequest.entity_type == entity_type)
    if status:
        q = q.where(ApprovalRequest.status == status)
    res = await db.execute(q)
    return [_fmt_approval(a) for a in res.scalars().all()]


@router.post("/approvals")
async def create_approval_request(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract, gen_uuid
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    entity_type = body["entity_type"]
    entity_id = body["entity_id"]

    # Check for existing pending approval
    existing_res = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.entity_type == entity_type,
            ApprovalRequest.entity_id == entity_id,
            ApprovalRequest.status == "pending",
        )
    )
    if existing_res.scalar_one_or_none():
        raise HTTPException(409, "A pending approval request already exists for this entity")

    # Set entity to pending_review
    if entity_type == "policy":
        res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == entity_id))
        entity = res.scalar_one_or_none()
        if entity:
            entity.status = "pending_review"
            entity.is_active = False
    elif entity_type == "contract":
        res = await db.execute(select(DataContract).where(DataContract.contract_id == entity_id))
        entity = res.scalar_one_or_none()
        if entity:
            entity.status = "pending_review"

    approval = ApprovalRequest(
        approval_id=gen_uuid(),
        entity_type=entity_type,
        entity_id=entity_id,
        entity_snapshot=body.get("entity_snapshot"),
        status="pending",
        requested_by=user.get("email"),
        created_at=_now,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return _fmt_approval(approval)


@router.post("/approvals/{approval_id}/approve")
async def approve_request(
    approval_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_approver),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract, GovernancePolicyVersion, gen_uuid
    from datetime import datetime, timezone
    from sqlalchemy import func as _func
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(select(ApprovalRequest).where(ApprovalRequest.approval_id == approval_id))
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval request not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Request is already {approval.status}")

    approval.status = "approved"
    approval.reviewed_by = user.get("email")
    approval.reviewed_at = _now

    # Activate entity
    if approval.entity_type == "policy":
        p_res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == approval.entity_id))
        policy = p_res.scalar_one_or_none()
        if policy:
            # Apply snapshot fields if provided
            snapshot = approval.entity_snapshot or {}
            for field in ("policy_name", "policy_type", "description", "severity", "config"):
                if field in snapshot:
                    setattr(policy, field, snapshot[field])
            policy.status = "active"
            policy.is_active = True

            # Write version record
            ver_res = await db.execute(
                select(_func.max(GovernancePolicyVersion.version_number)).where(
                    GovernancePolicyVersion.policy_id == policy.policy_id
                )
            )
            max_ver = ver_res.scalar_one() or 0
            version = GovernancePolicyVersion(
                version_id=gen_uuid(),
                policy_id=policy.policy_id,
                version_number=max_ver + 1,
                changed_by=user.get("email"),
                changed_at=_now,
                change_summary="Approved",
                field_diffs=[],
                snapshot=snapshot or {},
            )
            db.add(version)

    elif approval.entity_type == "contract":
        c_res = await db.execute(select(DataContract).where(DataContract.contract_id == approval.entity_id))
        contract = c_res.scalar_one_or_none()
        if contract:
            contract.status = "active"

    await db.commit()

    try:
        from app.services.notification_service import create_notification
        await create_notification(
            user_email=approval.requested_by,
            type="approval_decided",
            title=f"Your {approval.entity_type} was approved",
            body=f"Approved by {user.get('email')}",
            entity_type=approval.entity_type,
            entity_id=approval.entity_id,
            db=db,
        )
    except Exception as _ne:
        _logging.getLogger("dq_platform.governance").warning("Notification failed: %s", _ne)

    return _fmt_approval(approval)


@router.post("/approvals/{approval_id}/reject")
async def reject_request(
    approval_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_approver),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(select(ApprovalRequest).where(ApprovalRequest.approval_id == approval_id))
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval request not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Request is already {approval.status}")

    approval.status = "rejected"
    approval.reviewed_by = user.get("email")
    approval.reviewed_at = _now
    approval.feedback = body.get("feedback")

    # Set entity back to draft
    if approval.entity_type == "policy":
        p_res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == approval.entity_id))
        policy = p_res.scalar_one_or_none()
        if policy:
            policy.status = "draft"
    elif approval.entity_type == "contract":
        c_res = await db.execute(select(DataContract).where(DataContract.contract_id == approval.entity_id))
        contract = c_res.scalar_one_or_none()
        if contract:
            contract.status = "draft"

    await db.commit()

    try:
        from app.services.notification_service import create_notification
        await create_notification(
            user_email=approval.requested_by,
            type="approval_decided",
            title=f"Your {approval.entity_type} was rejected",
            body=approval.feedback or "No feedback provided",
            entity_type=approval.entity_type,
            entity_id=approval.entity_id,
            db=db,
        )
    except Exception as _ne:
        _logging.getLogger("dq_platform.governance").warning("Notification failed: %s", _ne)

    return _fmt_approval(approval)


# ── Policy versioning ─────────────────────────────────────────────────────────

def _fmt_version(v) -> dict:
    return {
        "version_id": v.version_id,
        "policy_id": v.policy_id,
        "version_number": v.version_number,
        "changed_by": v.changed_by,
        "changed_at": v.changed_at.isoformat() if v.changed_at else None,
        "change_summary": v.change_summary,
        "field_diffs": v.field_diffs or [],
        "snapshot": v.snapshot or {},
    }


@router.get("/policies/{policy_id}/versions")
async def list_policy_versions(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import GovernancePolicyVersion
    res = await db.execute(
        select(GovernancePolicyVersion)
        .where(GovernancePolicyVersion.policy_id == policy_id)
        .order_by(GovernancePolicyVersion.version_number.desc())
    )
    return [_fmt_version(v) for v in res.scalars().all()]
