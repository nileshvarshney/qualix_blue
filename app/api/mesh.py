from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.db.database import get_db
from app.db.models import DataSharingAgreement, Domain, DataAsset, DQQualityScore
from app.core.security import get_current_user, require_admin
import uuid
from datetime import datetime, timezone, date

router = APIRouter(prefix="/mesh", tags=["Data Mesh"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


@router.post("/sharing-agreements", status_code=201)
async def create_agreement(payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    row = DataSharingAgreement(
        agreement_id=str(uuid.uuid4()),
        producer_domain_id=payload["producer_domain_id"],
        consumer_domain_id=payload["consumer_domain_id"],
        asset_id=payload["asset_id"],
        quality_sla=float(payload["quality_sla"]),
        freshness_sla=int(payload["freshness_sla"]),
        breach_action=payload.get("breach_action", "notify_consumer"),
        status="active",
        signed_by_producer=user.get("email"),
    )
    db.add(row)
    await db.commit()
    return {"agreement_id": row.agreement_id, "status": row.status}


@router.get("/sharing-agreements")
async def list_agreements(domain_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(DataSharingAgreement).where(DataSharingAgreement.status == "active")
    if domain_id:
        q = q.where(or_(
            DataSharingAgreement.producer_domain_id == domain_id,
            DataSharingAgreement.consumer_domain_id == domain_id,
        ))
    result = await db.execute(q)
    rows = result.scalars().all()
    return [{"agreement_id": r.agreement_id, "producer_domain_id": r.producer_domain_id,
             "consumer_domain_id": r.consumer_domain_id, "asset_id": r.asset_id,
             "quality_sla": r.quality_sla, "freshness_sla": r.freshness_sla,
             "breach_action": r.breach_action, "status": r.status} for r in rows]


@router.get("/sharing-agreements/{agreement_id}/compliance")
async def check_compliance(agreement_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    agreement = (await db.execute(
        select(DataSharingAgreement).where(DataSharingAgreement.agreement_id == agreement_id)
    )).scalar_one_or_none()
    if not agreement:
        raise HTTPException(404, "Agreement not found")

    score_res = await db.execute(
        select(DQQualityScore).where(
            DQQualityScore.asset_id == agreement.asset_id,
            DQQualityScore.score_level == "table",
            DQQualityScore.score_date == date.today(),
        )
    )
    score_row = score_res.scalars().first()
    current_score = float(score_row.quality_score) if score_row and score_row.quality_score else None
    compliant = current_score is not None and current_score >= agreement.quality_sla
    return {"compliant": compliant, "current_score": current_score, "sla": agreement.quality_sla}


@router.delete("/sharing-agreements/{agreement_id}", status_code=204)
async def delete_agreement(agreement_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    row = (await db.execute(
        select(DataSharingAgreement).where(DataSharingAgreement.agreement_id == agreement_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Agreement not found")
    row.status = "inactive"
    await db.commit()


@router.get("/topology")
async def topology(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    agreements_res = await db.execute(
        select(DataSharingAgreement).where(DataSharingAgreement.status == "active")
    )
    agreements = agreements_res.scalars().all()

    domain_ids = set()
    for a in agreements:
        domain_ids.add(a.producer_domain_id)
        domain_ids.add(a.consumer_domain_id)

    domains_res = await db.execute(select(Domain).where(Domain.domain_id.in_(domain_ids)))
    domains_map = {d.domain_id: d.domain_name for d in domains_res.scalars().all()}

    nodes = [{"domain_id": did, "domain_name": domains_map.get(did, did)} for did in domain_ids]

    # Batch-fetch all quality scores in one query instead of N+1 per agreement
    asset_ids = [a.asset_id for a in agreements]
    scores_res = await db.execute(
        select(DQQualityScore).where(
            DQQualityScore.asset_id.in_(asset_ids),
            DQQualityScore.score_level == "table",
            DQQualityScore.score_date == date.today(),
        )
    )
    scores_map = {s.asset_id: float(s.quality_score) for s in scores_res.scalars().all() if s.quality_score}

    edges = [
        {
            "source": a.producer_domain_id,
            "target": a.consumer_domain_id,
            "asset_id": a.asset_id,
            "compliant": scores_map.get(a.asset_id, 0.0) >= a.quality_sla,
            "current_score": scores_map.get(a.asset_id),
        }
        for a in agreements
    ]
    return {"nodes": nodes, "edges": edges}
