from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import (
    ComplianceFramework, ComplianceRequirement, ComplianceMapping,
    DQRule, DQRuleRun, DataAsset,
)
from app.core.security import get_current_user, require_admin

router = APIRouter(prefix="/compliance", tags=["Compliance"])


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
    result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.is_active == True)
    )
    return [_fmt_framework(f) for f in result.scalars().all()]


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
    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
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
        if mapping and mapping.rule_id:
            # Check for a recent passing run
            run_result = await db.execute(
                select(DQRuleRun)
                .where(
                    DQRuleRun.rule_id == mapping.rule_id,
                    DQRuleRun.status == "passed",
                )
                .order_by(desc(DQRuleRun.created_at))
                .limit(1)
            )
            recent_run = run_result.scalar_one_or_none()
            new_status = "compliant" if recent_run else "gap"

        if mapping:
            mapping.status = new_status
        else:
            mapping = ComplianceMapping(
                mapping_id=gen_uuid(),
                asset_id=asset_id,
                framework_id=framework_id,
                req_id=req.req_id,
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
        select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
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
