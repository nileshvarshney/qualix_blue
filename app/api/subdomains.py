from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import Subdomain, Domain, AuditLog
from app.schemas.subdomain import SubdomainCreate, SubdomainUpdate, SubdomainResponse
from app.core.security import get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/subdomains", tags=["Subdomains"])


@router.post("", response_model=SubdomainResponse)
async def create_subdomain(payload: SubdomainCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    domain_result = await db.execute(select(Domain).where(Domain.domain_id == payload.domain_id))
    if not domain_result.scalar_one_or_none():
        raise HTTPException(404, "Domain not found")
    sub = Subdomain(subdomain_id=str(uuid.uuid4()), **payload.model_dump())
    db.add(sub)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="CREATE",
                    entity_type="subdomain", entity_id=sub.subdomain_id, new_value=payload.model_dump()))
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("", response_model=list[SubdomainResponse])
async def list_subdomains(
    domain_id: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(Subdomain)
    if domain_id:
        q = q.where(Subdomain.domain_id == domain_id)
    result = await db.execute(q.order_by(Subdomain.subdomain_name).limit(limit).offset(offset))
    return result.scalars().all()


@router.get("/{subdomain_id}", response_model=SubdomainResponse)
async def get_subdomain(subdomain_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subdomain not found")
    return sub


@router.put("/{subdomain_id}", response_model=SubdomainResponse)
async def update_subdomain(subdomain_id: str, payload: SubdomainUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subdomain not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(sub, field, value)
    sub.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/{subdomain_id}")
async def delete_subdomain(subdomain_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subdomain not found")
    sub.is_active = False
    sub.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"message": "Subdomain deactivated"}
