from __future__ import annotations
from typing import Optional
"""
Privacy Engineering API — §62
Masking policies and PII data management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import MaskingPolicy, Asset, DataSubjectRequest, ConsentRecord, DataResidencyPolicy
import json as _json
from app.core.security import get_current_user, check_domain_access
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/privacy", tags=["Privacy"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)

MASKING_TYPES = {"full_mask", "partial_mask", "hash", "tokenize", "nullify"}


def _fmt(p: MaskingPolicy) -> dict:
    return {
        "policy_id": p.policy_id, "asset_id": p.asset_id, "column_name": p.column_name,
        "masking_type": p.masking_type, "applies_to_roles": p.applies_to_roles,
        "unmasked_roles": p.unmasked_roles, "created_by": p.created_by,
        "created_at": p.created_at.isoformat(),
    }


@router.get("/masking-policies")
async def list_masking_policies(
    asset_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List masking policies, optionally filtered by asset or connection."""
    q = select(MaskingPolicy)
    if asset_id:
        asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
        if asset:
            check_domain_access(user, asset.domain_id)
        q = q.where(MaskingPolicy.asset_id == asset_id)
    if connection_id:
        q = q.join(Asset, MaskingPolicy.asset_id == Asset.asset_id).where(Asset.connection_id == connection_id)
    result = await db.execute(q)
    return [_fmt(p) for p in result.scalars().all()]


@router.post("/masking-policies", status_code=201)
async def create_masking_policy(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create or replace a column masking policy."""
    asset_id    = payload.get("asset_id")
    column_name = payload.get("column_name")
    masking_type = payload.get("masking_type")

    if not asset_id or not column_name or not masking_type:
        raise HTTPException(400, "asset_id, column_name, and masking_type are required")
    if masking_type not in MASKING_TYPES:
        raise HTTPException(400, f"masking_type must be one of {sorted(MASKING_TYPES)}")

    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    # Upsert — replace existing policy for the same asset+column
    existing = (await db.execute(
        select(MaskingPolicy).where(
            MaskingPolicy.asset_id == asset_id,
            MaskingPolicy.column_name == column_name,
        )
    )).scalar_one_or_none()

    if existing:
        existing.masking_type    = masking_type
        existing.applies_to_roles = payload.get("applies_to_roles")
        existing.unmasked_roles  = payload.get("unmasked_roles")
        await db.commit()
        return _fmt(existing)

    policy = MaskingPolicy(
        policy_id=str(uuid.uuid4()),
        asset_id=asset_id,
        column_name=column_name,
        masking_type=masking_type,
        applies_to_roles=payload.get("applies_to_roles"),
        unmasked_roles=payload.get("unmasked_roles"),
        created_by=user.get("email"),
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return _fmt(policy)


@router.delete("/masking-policies/{policy_id}", status_code=204)
async def delete_masking_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    policy = (await db.execute(select(MaskingPolicy).where(MaskingPolicy.policy_id == policy_id))).scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")
    asset = (await db.execute(select(Asset).where(Asset.asset_id == policy.asset_id))).scalar_one_or_none()
    if asset:
        check_domain_access(user, asset.domain_id)
    await db.delete(policy)
    await db.commit()


@router.get("/assets/{asset_id}/masking-summary")
async def masking_summary(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return masking coverage for a table — which columns are masked and how."""
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    result = await db.execute(select(MaskingPolicy).where(MaskingPolicy.asset_id == asset_id))
    policies = result.scalars().all()
    return {
        "asset_id": asset_id,
        "sf_table_name": asset.sf_table_name,
        "masked_column_count": len(policies),
        "policies": [_fmt(p) for p in policies],
    }


@router.get("/pii-exposure-report")
async def pii_exposure_report(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """
    Return tables that have PII classifications but no masking policies —
    i.e., PII data that is potentially unprotected.
    """
    from app.db.models import DataClassification
    from sqlalchemy import func

    # Tables with PII classification
    pii_res = await db.execute(
        select(DataClassification.asset_id).where(
            DataClassification.classification.in_(["PII", "SENSITIVE"])
        ).distinct()
    )
    pii_asset_ids = {r[0] for r in pii_res.all()}

    # Tables with at least one masking policy
    masked_res = await db.execute(
        select(MaskingPolicy.asset_id).distinct()
    )
    masked_asset_ids = {r[0] for r in masked_res.all()}

    unprotected = pii_asset_ids - masked_asset_ids

    results = []
    for asset_id in unprotected:
        asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
        if asset:
            results.append({
                "asset_id": asset_id,
                "sf_table_name": asset.sf_table_name,
                "domain_id": asset.domain_id,
                "risk": "PII data with no masking policy configured",
            })

    return {"unprotected_pii_tables": len(results), "assets": results}


# ── DSR ──────────────────────────────────────────────────────────────────────

DSR_TYPES = {"erasure", "access", "rectification", "portability", "opt_out"}
DSR_STATUSES = {"pending", "in_review", "completed", "rejected"}
DSR_TRANSITIONS = {
    "pending": {"in_review"},
    "in_review": {"completed", "rejected"},
}


def _fmt_dsr(d: DataSubjectRequest) -> dict:
    return {
        "dsr_id": d.dsr_id,
        "subject_email": d.subject_email,
        "request_type": d.request_type,
        "status": d.status,
        "description": d.description,
        "affected_tables": _json.loads(d.affected_tables) if d.affected_tables else [],
        "assigned_to": d.assigned_to,
        "notes": d.notes,
        "requested_by": d.requested_by,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    }


@router.get("/dsr")
async def list_dsr(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(DataSubjectRequest).order_by(DataSubjectRequest.created_at.desc())
    if status:
        q = q.where(DataSubjectRequest.status == status)
    result = await db.execute(q)
    return [_fmt_dsr(d) for d in result.scalars().all()]


@router.post("/dsr", status_code=201)
async def create_dsr(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    req_type = payload.get("request_type")
    if req_type not in DSR_TYPES:
        raise HTTPException(400, f"request_type must be one of {sorted(DSR_TYPES)}")
    subject = payload.get("subject_email", "").strip()
    if not subject:
        raise HTTPException(400, "subject_email is required")
    tables = payload.get("affected_tables", [])
    dsr = DataSubjectRequest(
        subject_email=subject,
        request_type=req_type,
        status="pending",
        description=payload.get("description"),
        affected_tables=_json.dumps(tables) if tables else None,
        assigned_to=payload.get("assigned_to"),
        requested_by=user.get("email"),
        created_at=_now(),
    )
    db.add(dsr)
    await db.commit()
    await db.refresh(dsr)
    return _fmt_dsr(dsr)


@router.patch("/dsr/{dsr_id}")
async def update_dsr(
    dsr_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    dsr = (await db.execute(select(DataSubjectRequest).where(DataSubjectRequest.dsr_id == dsr_id))).scalar_one_or_none()
    if not dsr:
        raise HTTPException(404, "DSR not found")
    new_status = payload.get("status")
    if new_status:
        allowed = DSR_TRANSITIONS.get(dsr.status, set())
        if new_status not in DSR_STATUSES:
            raise HTTPException(400, f"Invalid status: {new_status}")
        if new_status not in allowed and new_status != dsr.status:
            raise HTTPException(400, f"Cannot transition from {dsr.status!r} to {new_status!r}")
        dsr.status = new_status
        if new_status in ("completed", "rejected"):
            dsr.completed_at = _now()
    if "assigned_to" in payload:
        dsr.assigned_to = payload["assigned_to"]
    if "notes" in payload:
        dsr.notes = payload["notes"]
    await db.commit()
    return _fmt_dsr(dsr)


@router.delete("/dsr/{dsr_id}", status_code=204)
async def delete_dsr(
    dsr_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    dsr = (await db.execute(select(DataSubjectRequest).where(DataSubjectRequest.dsr_id == dsr_id))).scalar_one_or_none()
    if not dsr:
        raise HTTPException(404, "DSR not found")
    await db.delete(dsr)
    await db.commit()


# ── Consent ───────────────────────────────────────────────────────────────────

LEGAL_BASES = {"consent", "legitimate_interest", "contract", "legal_obligation", "vital_interests", "public_task"}


def _fmt_consent(c: ConsentRecord) -> dict:
    return {
        "consent_id": c.consent_id,
        "asset_id": c.asset_id,
        "purpose": c.purpose,
        "legal_basis": c.legal_basis,
        "data_subject_type": c.data_subject_type,
        "requires_explicit_consent": c.requires_explicit_consent,
        "opt_in": c.opt_in,
        "recorded_by": c.recorded_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/consent")
async def list_consent(
    asset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(ConsentRecord).order_by(ConsentRecord.created_at.desc())
    if asset_id:
        q = q.where(ConsentRecord.asset_id == asset_id)
    result = await db.execute(q)
    return [_fmt_consent(c) for c in result.scalars().all()]


@router.post("/consent", status_code=201)
async def create_consent(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    basis = payload.get("legal_basis")
    if basis not in LEGAL_BASES:
        raise HTTPException(400, f"legal_basis must be one of {sorted(LEGAL_BASES)}")
    purpose = payload.get("purpose", "").strip()
    if not purpose:
        raise HTTPException(400, "purpose is required")
    record = ConsentRecord(
        asset_id=payload.get("asset_id"),
        purpose=purpose,
        legal_basis=basis,
        data_subject_type=payload.get("data_subject_type"),
        requires_explicit_consent=bool(payload.get("requires_explicit_consent", False)),
        opt_in=bool(payload.get("opt_in", True)),
        recorded_by=user.get("email"),
        created_at=_now(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _fmt_consent(record)


@router.delete("/consent/{consent_id}", status_code=204)
async def delete_consent(
    consent_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    rec = (await db.execute(select(ConsentRecord).where(ConsentRecord.consent_id == consent_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Consent record not found")
    await db.delete(rec)
    await db.commit()


# ── Residency ─────────────────────────────────────────────────────────────────

def _fmt_residency(r: DataResidencyPolicy) -> dict:
    return {
        "residency_id": r.residency_id,
        "asset_id": r.asset_id,
        "domain_id": r.domain_id,
        "allowed_regions": _json.loads(r.allowed_regions) if r.allowed_regions else [],
        "prohibited_regions": _json.loads(r.prohibited_regions) if r.prohibited_regions else [],
        "data_sovereignty_country": r.data_sovereignty_country,
        "notes": r.notes,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/residency")
async def list_residency(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DataResidencyPolicy).order_by(DataResidencyPolicy.created_at.desc()))
    return [_fmt_residency(r) for r in result.scalars().all()]


@router.post("/residency", status_code=201)
async def create_residency(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    allowed = payload.get("allowed_regions", [])
    prohibited = payload.get("prohibited_regions", [])
    policy = DataResidencyPolicy(
        asset_id=payload.get("asset_id"),
        domain_id=payload.get("domain_id"),
        allowed_regions=_json.dumps(allowed) if allowed else None,
        prohibited_regions=_json.dumps(prohibited) if prohibited else None,
        data_sovereignty_country=payload.get("data_sovereignty_country"),
        notes=payload.get("notes"),
        created_by=user.get("email"),
        created_at=_now(),
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return _fmt_residency(policy)


@router.delete("/residency/{residency_id}", status_code=204)
async def delete_residency(
    residency_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    rec = (await db.execute(select(DataResidencyPolicy).where(DataResidencyPolicy.residency_id == residency_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Residency policy not found")
    await db.delete(rec)
    await db.commit()
