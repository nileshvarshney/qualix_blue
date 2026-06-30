from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.database import get_db
from app.db.models import (
    ComplianceFramework, ComplianceRequirement, ComplianceMapping,
    DQRule, DQRuleRun, Asset,
)
from app.core.security import get_current_user, require_admin

router = APIRouter(prefix="/compliance", tags=["Compliance"])


def _framework_status(passed: int, total: int) -> str:
    if total == 0:
        return "partial"
    pct = passed / total
    if pct >= 1.0:
        return "compliant"
    if pct >= 0.5:
        return "partial"
    return "non-compliant"


def _fmt_framework(f: ComplianceFramework) -> dict:
    return {
        "framework_id": f.framework_id,
        "framework_name": f.framework_name,
        "version": f.version,
        "description": f.description,
        "is_active": f.is_active,
    }


def _fmt_requirement(r: ComplianceRequirement) -> dict:
    return {
        "req_id": r.req_id,
        "framework_id": r.framework_id,
        "req_code": r.req_code,
        "req_name": r.req_name,
        "req_description": r.req_description,
        "dq_rule_types": r.dq_rule_types,
    }


def _fmt_mapping(m: ComplianceMapping) -> dict:
    return {
        "mapping_id": m.mapping_id,
        "asset_id": m.asset_id,
        "framework_id": m.framework_id,
        "req_id": m.req_id,
        "rule_id": m.rule_id,
        "status": m.status,
        "evidence_note": m.evidence_note,
        "mapped_by": m.mapped_by,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/frameworks")
async def list_frameworks(db: AsyncSession = Depends(get_db)):
    fw_result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.is_active == True)
    )
    frameworks = fw_result.scalars().all()

    # Compute per-framework stats from requirements + mappings
    out = []
    for f in frameworks:
        # Count requirements
        req_count = (await db.execute(
            select(func.count()).select_from(ComplianceRequirement)
            .where(ComplianceRequirement.framework_id == f.framework_id)
        )).scalar() or 0

        # Count compliant mappings (distinct req_id with status='compliant')
        passed_count = (await db.execute(
            select(func.count(func.distinct(ComplianceMapping.req_id)))
            .where(
                ComplianceMapping.framework_id == f.framework_id,
                ComplianceMapping.status == "compliant",
            )
        )).scalar() or 0

        # Count gap mappings (distinct req_id with status='gap', not already compliant)
        gap_count = (await db.execute(
            select(func.count(func.distinct(ComplianceMapping.req_id)))
            .where(
                ComplianceMapping.framework_id == f.framework_id,
                ComplianceMapping.status == "gap",
                ComplianceMapping.req_id.notin_(
                    select(ComplianceMapping.req_id).where(
                        ComplianceMapping.framework_id == f.framework_id,
                        ComplianceMapping.status == "compliant",
                    )
                ),
            )
        )).scalar() or 0

        # Check if any assessment has been done at all
        any_mapped = (await db.execute(
            select(func.count()).select_from(ComplianceMapping)
            .where(ComplianceMapping.framework_id == f.framework_id)
        )).scalar() or 0

        # Status: "partial" means not yet assessed; only show non-compliant if gaps exist
        if any_mapped == 0:
            computed_status = "partial"
        else:
            computed_status = _framework_status(passed_count, req_count)

        out.append({
            "framework_id": f.framework_id,
            "framework_name": f.framework_name,
            "version": f.version,
            "description": f.description,
            "is_active": f.is_active,
            "controls_total": req_count,
            "controls_passed": passed_count,
            "controls_failed": gap_count,
            "status": computed_status,
        })

    return out


@router.post("/seed")
async def seed_compliance(db: AsyncSession = Depends(get_db)):
    """Reseed compliance frameworks and requirements — safe to call on existing deployments."""
    from app.db.seed import seed_compliance_frameworks
    await seed_compliance_frameworks(db)
    await db.commit()
    result = await db.execute(select(ComplianceFramework).where(ComplianceFramework.is_active == True))
    return {"message": "Compliance frameworks and requirements seeded", "framework_count": len(result.scalars().all())}


@router.post("/frameworks")
async def create_framework(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    from app.db.models import gen_uuid
    framework = ComplianceFramework(
        framework_id=gen_uuid(),
        framework_name=body["framework_name"],
        version=body.get("version"),
        description=body.get("description"),
        is_active=body.get("is_active", True),
    )
    db.add(framework)
    await db.commit()
    await db.refresh(framework)
    return _fmt_framework(framework)


@router.get("/frameworks/{framework_id}/requirements")
async def list_requirements(framework_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ComplianceRequirement).where(ComplianceRequirement.framework_id == framework_id)
    )
    return [_fmt_requirement(r) for r in result.scalars().all()]


@router.get("/frameworks/{framework_id}/controls")
async def list_controls(framework_id: str, db: AsyncSession = Depends(get_db)):
    """Return requirements for a framework enriched with their best mapping status."""
    fw_result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.framework_id == framework_id)
    )
    framework = fw_result.scalar_one_or_none()
    if not framework:
        raise HTTPException(404, "Framework not found")

    reqs_result = await db.execute(
        select(ComplianceRequirement).where(ComplianceRequirement.framework_id == framework_id)
    )
    requirements = reqs_result.scalars().all()

    controls = []
    for req in requirements:
        # Find the best mapping status for this requirement
        best_mapping_result = await db.execute(
            select(ComplianceMapping)
            .where(
                ComplianceMapping.framework_id == framework_id,
                ComplianceMapping.req_id == req.req_id,
            )
            .order_by(
                # compliant > gap > mapped (best status first)
                ComplianceMapping.status
            )
        )
        mappings = best_mapping_result.scalars().all()
        # Determine best status: compliant wins, then mapped, then gap
        status = "not-assessed"
        rules_mapped = 0
        last_assessed = None
        evidence = ""
        for m in mappings:
            rules_mapped += 1 if m.rule_id else 0
            if m.status == "compliant":
                status = "passed"
            elif m.status == "mapped" and status != "passed":
                status = "not-assessed"
            elif m.status == "gap" and status not in ("passed", "not-assessed"):
                status = "failed"
            if m.created_at and (last_assessed is None or m.created_at > last_assessed):
                last_assessed = m.created_at
            if m.evidence_note:
                evidence = m.evidence_note

        # Determine if gap: any gap mapping with no compliant mapping
        if any(m.status == "gap" for m in mappings) and not any(m.status == "compliant" for m in mappings):
            status = "failed"

        controls.append({
            "req_id": req.req_id,
            "req_code": req.req_code,
            "req_name": req.req_name,
            "req_description": req.req_description,
            "dq_rule_types": req.dq_rule_types,
            "framework_name": framework.framework_name,
            "status": status,
            "rules_mapped": rules_mapped,
            "last_assessed": last_assessed.isoformat() if last_assessed else None,
            "evidence": evidence,
        })

    return controls


@router.post("/frameworks/{framework_id}/assess/{asset_id}")
async def assess_asset(
    framework_id: str,
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Run a compliance assessment for a given framework and asset."""
    from app.db.models import gen_uuid, now as model_now

    # Verify framework exists
    fw_result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.framework_id == framework_id)
    )
    framework = fw_result.scalar_one_or_none()
    if not framework:
        raise HTTPException(404, "Framework not found")

    # Verify asset exists
    asset_result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    # Get requirements
    reqs_result = await db.execute(
        select(ComplianceRequirement).where(ComplianceRequirement.framework_id == framework_id)
    )
    requirements = reqs_result.scalars().all()

    assessment = []
    for req in requirements:
        # Check existing mapping
        mapping_result = await db.execute(
            select(ComplianceMapping).where(
                ComplianceMapping.asset_id == asset_id,
                ComplianceMapping.framework_id == framework_id,
                ComplianceMapping.req_id == req.req_id,
            )
        )
        mapping = mapping_result.scalar_one_or_none()

        new_status = "gap"
        rule_id_to_use = mapping.rule_id if mapping else None

        # Auto-map: if no rule linked yet, find a matching active DQ rule by type
        if not rule_id_to_use and req.dq_rule_types:
            req_types = [t.strip() for t in req.dq_rule_types.split(",") if t.strip()]
            if req_types:
                auto_rule_res = await db.execute(
                    select(DQRule)
                    .where(
                        DQRule.asset_id == asset_id,
                        DQRule.is_active == True,
                        DQRule.rule_type.in_(req_types),
                    )
                    .limit(1)
                )
                matched_rule = auto_rule_res.scalar_one_or_none()
                if matched_rule:
                    rule_id_to_use = matched_rule.rule_id

        if rule_id_to_use:
            run_result = await db.execute(
                select(DQRuleRun)
                .where(
                    DQRuleRun.rule_id == rule_id_to_use,
                    DQRuleRun.status == "passed",
                )
                .order_by(desc(DQRuleRun.created_at))
                .limit(1)
            )
            recent_run = run_result.scalar_one_or_none()
            new_status = "compliant" if recent_run else "gap"

        if mapping:
            mapping.rule_id = mapping.rule_id or rule_id_to_use
            mapping.status = new_status
        else:
            mapping = ComplianceMapping(
                mapping_id=gen_uuid(),
                asset_id=asset_id,
                framework_id=framework_id,
                req_id=req.req_id,
                rule_id=rule_id_to_use,
                status=new_status,
                mapped_by=user.get("email"),
                created_at=model_now(),
            )
            db.add(mapping)

        assessment.append({
            "req_id": req.req_id,
            "req_code": req.req_code,
            "req_name": req.req_name,
            "status": new_status,
            "mapping_id": mapping.mapping_id,
        })

    await db.commit()
    return {
        "framework_id": framework_id,
        "asset_id": asset_id,
        "total_requirements": len(requirements),
        "compliant": sum(1 for a in assessment if a["status"] == "compliant"),
        "gaps": sum(1 for a in assessment if a["status"] == "gap"),
        "requirements": assessment,
    }


@router.post("/frameworks/{framework_id}/assess/all")
async def assess_all_assets(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Run compliance assessment for a framework across every asset that has DQ rules."""
    from app.db.models import gen_uuid, now as model_now

    fw_result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.framework_id == framework_id)
    )
    framework = fw_result.scalar_one_or_none()
    if not framework:
        raise HTTPException(404, "Framework not found")

    # Get all assets that have at least one DQ rule
    assets_result = await db.execute(
        select(Asset).where(
            Asset.asset_id.in_(select(DQRule.asset_id).where(DQRule.is_active == True).distinct())
        )
    )
    assets = assets_result.scalars().all()

    reqs_result = await db.execute(
        select(ComplianceRequirement).where(ComplianceRequirement.framework_id == framework_id)
    )
    requirements = reqs_result.scalars().all()

    total_compliant = 0
    total_gaps = 0
    per_asset = []

    for asset in assets:
        asset_compliant = 0
        asset_gaps = 0
        for req in requirements:
            mapping_result = await db.execute(
                select(ComplianceMapping).where(
                    ComplianceMapping.asset_id == asset.asset_id,
                    ComplianceMapping.framework_id == framework_id,
                    ComplianceMapping.req_id == req.req_id,
                )
            )
            mapping = mapping_result.scalar_one_or_none()
            new_status = "gap"
            rule_id_to_use = mapping.rule_id if mapping else None

            if not rule_id_to_use and req.dq_rule_types:
                req_types = [t.strip() for t in req.dq_rule_types.split(",") if t.strip()]
                if req_types:
                    auto_rule_res = await db.execute(
                        select(DQRule)
                        .where(
                            DQRule.asset_id == asset.asset_id,
                            DQRule.is_active == True,
                            DQRule.rule_type.in_(req_types),
                        )
                        .limit(1)
                    )
                    matched_rule = auto_rule_res.scalar_one_or_none()
                    if matched_rule:
                        rule_id_to_use = matched_rule.rule_id

            if rule_id_to_use:
                run_result = await db.execute(
                    select(DQRuleRun)
                    .where(DQRuleRun.rule_id == rule_id_to_use, DQRuleRun.status == "passed")
                    .order_by(desc(DQRuleRun.created_at))
                    .limit(1)
                )
                new_status = "compliant" if run_result.scalar_one_or_none() else "gap"

            if mapping:
                mapping.rule_id = mapping.rule_id or rule_id_to_use
                mapping.status = new_status
            else:
                mapping = ComplianceMapping(
                    mapping_id=gen_uuid(),
                    asset_id=asset.asset_id,
                    framework_id=framework_id,
                    req_id=req.req_id,
                    rule_id=rule_id_to_use,
                    status=new_status,
                    mapped_by=user.get("email"),
                    created_at=model_now(),
                )
                db.add(mapping)
            if new_status == "compliant":
                asset_compliant += 1
            else:
                asset_gaps += 1
        total_compliant += asset_compliant
        total_gaps += asset_gaps
        per_asset.append({
            "asset_id": asset.asset_id,
            "sf_table_name": asset.sf_table_name,
            "compliant": asset_compliant,
            "gaps": asset_gaps,
        })

    await db.commit()
    return {
        "framework_id": framework_id,
        "total_assets": len(assets),
        "compliant": total_compliant,
        "gaps": total_gaps,
        "per_asset": per_asset,
    }


@router.get("/report/{framework_id}")
async def compliance_report(framework_id: str, db: AsyncSession = Depends(get_db)):
    """All mappings for a framework grouped by asset."""
    result = await db.execute(
        select(ComplianceMapping).where(ComplianceMapping.framework_id == framework_id)
    )
    mappings = result.scalars().all()

    grouped: dict[str, list] = {}
    for m in mappings:
        grouped.setdefault(m.asset_id, []).append(_fmt_mapping(m))
    return {"framework_id": framework_id, "by_asset": grouped}


@router.get("/gaps")
async def list_gaps(db: AsyncSession = Depends(get_db)):
    """Return all assets that have at least one mapping with status='gap'."""
    result = await db.execute(
        select(ComplianceMapping.asset_id).where(ComplianceMapping.status == "gap").distinct()
    )
    asset_ids = [row[0] for row in result.all()]

    assets_result = await db.execute(
        select(Asset).where(Asset.asset_id.in_(asset_ids))
    )
    assets = assets_result.scalars().all()

    gaps = []
    for asset in assets:
        gap_result = await db.execute(
            select(ComplianceMapping).where(
                ComplianceMapping.asset_id == asset.asset_id,
                ComplianceMapping.status == "gap",
            )
        )
        asset_gaps = gap_result.scalars().all()
        gaps.append({
            "asset_id": asset.asset_id,
            "sf_table_name": asset.sf_table_name,
            "sf_schema_name": asset.sf_schema_name,
            "gap_count": len(asset_gaps),
            "gaps": [_fmt_mapping(g) for g in asset_gaps],
        })
    return gaps


@router.post("/mappings")
async def create_or_update_mapping(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid, now as model_now
    mapping = ComplianceMapping(
        mapping_id=gen_uuid(),
        asset_id=body["asset_id"],
        framework_id=body["framework_id"],
        req_id=body.get("req_id"),
        rule_id=body.get("rule_id"),
        status=body.get("status", "mapped"),
        evidence_note=body.get("evidence_note"),
        mapped_by=user.get("email"),
        created_at=model_now(),
    )
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return _fmt_mapping(mapping)


@router.get("/evidence/{mapping_id}")
async def get_evidence(mapping_id: str, db: AsyncSession = Depends(get_db)):
    """Return mapping detail + linked rule + last 5 runs."""
    result = await db.execute(select(ComplianceMapping).where(ComplianceMapping.mapping_id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(404, "Mapping not found")

    rule = None
    if mapping.rule_id:
        rule_result = await db.execute(select(DQRule).where(DQRule.rule_id == mapping.rule_id))
        r = rule_result.scalar_one_or_none()
        if r:
            rule = {
                "rule_id": r.rule_id,
                "rule_name": r.rule_name,
                "rule_type": r.rule_type,
                "severity": r.severity,
            }

    runs = []
    if mapping.rule_id:
        runs_result = await db.execute(
            select(DQRuleRun)
            .where(DQRuleRun.rule_id == mapping.rule_id)
            .order_by(desc(DQRuleRun.created_at))
            .limit(5)
        )
        for run in runs_result.scalars().all():
            runs.append({
                "run_id": run.run_id,
                "status": run.status,
                "quality_score": run.quality_score,
                "created_at": run.created_at.isoformat() if run.created_at else None,
            })

    return {
        "mapping": _fmt_mapping(mapping),
        "rule": rule,
        "last_5_runs": runs,
    }
