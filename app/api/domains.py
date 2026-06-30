from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.database import get_db
from app.db.models import Domain, AuditLog
from app.schemas.domain import DomainCreate, DomainUpdate, DomainResponse
from app.core.security import get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/domains", tags=["Domains"])


@router.post("", response_model=DomainResponse)
async def create_domain(payload: DomainCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    domain = Domain(domain_id=str(uuid.uuid4()), **payload.model_dump())
    db.add(domain)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="CREATE",
                    entity_type="domain", entity_id=domain.domain_id, new_value=payload.model_dump()))
    await db.commit()
    await db.refresh(domain)
    return domain


@router.get("", response_model=list[DomainResponse])
async def list_domains(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Domain).order_by(Domain.domain_name))
    return result.scalars().all()


@router.get("/{domain_id}", response_model=DomainResponse)
async def get_domain(domain_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")
    return domain


@router.put("/{domain_id}", response_model=DomainResponse)
async def update_domain(domain_id: str, payload: DomainUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")
    old = {c: getattr(domain, c) for c in ["domain_name", "description", "owner_name", "owner_email", "is_active"]}
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(domain, field, value)
    domain.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="UPDATE",
                    entity_type="domain", entity_id=domain_id, old_value=old, new_value=payload.model_dump(exclude_none=True)))
    await db.commit()
    await db.refresh(domain)
    return domain


@router.delete("/{domain_id}")
async def delete_domain(domain_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Domain).where(Domain.domain_id == domain_id))
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, "Domain not found")
    domain.is_active = False
    domain.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="DELETE",
                    entity_type="domain", entity_id=domain_id))
    await db.commit()
    return {"message": "Domain deactivated"}
