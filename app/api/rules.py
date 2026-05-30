from __future__ import annotations
import uuid
import yaml
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import DQRule, Domain, Subdomain, DataAsset, AuditLog, RuleTag, RuleVersion
from app.schemas.rule import (
    RuleCreate, RuleUpdate, RuleResponse, RuleImportPayload,
    RuleApproveRequest, RuleRejectRequest, RuleVersionResponse,
)
from app.services.sql_generator import sql_generator
from app.core.security import get_current_user, require_write, get_domain_filter
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/rules", tags=["Rules"])


class BulkStatusRequest(BaseModel):
    rule_ids: list[str]
    status: str


class BulkExecuteRequest(BaseModel):
    rule_ids: list[str]


class PreviewSQLRequest(BaseModel):
    rule_type: str
    target_column: Optional[str] = None
    rule_config: Optional[dict] = None
    asset_id: str


@router.post("/preview-sql")
async def preview_sql(payload: PreviewSQLRequest, db: AsyncSession = Depends(get_db)):
    """Generate SQL for a rule without saving it."""
    asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == payload.asset_id))
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    tref = f'"{asset.sf_schema_name}"."{asset.sf_table_name}"'
    try:
        sql = sql_generator.generate(
            payload.rule_type,
            payload.rule_config or {},
            tref,
            payload.target_column,
        )
        return {"sql": sql, "table_ref": tref}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/enriched")
async def list_rules_enriched(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Returns rules joined with asset, domain, and subdomain details."""
    from sqlalchemy import func as sqlfunc
    # Row-level domain isolation: domain_owner can only see their own domain
    effective_domain = get_domain_filter(user) or domain_id
    q = select(DQRule, DataAsset, Domain, Subdomain).join(
        DataAsset, DQRule.asset_id == DataAsset.asset_id
    ).join(
        Domain, DQRule.domain_id == Domain.domain_id
    ).join(
        Subdomain, DQRule.subdomain_id == Subdomain.subdomain_id
    )
    if effective_domain:
        q = q.where(DQRule.domain_id == effective_domain)
    if subdomain_id:
        q = q.where(DQRule.subdomain_id == subdomain_id)
    if asset_id:
        q = q.where(DQRule.asset_id == asset_id)
    if severity:
        q = q.where(DQRule.severity == severity)
    if status:
        q = q.where(DQRule.status == status)
    if search:
        q = q.where(DQRule.rule_name.ilike(f"%{search}%") | DQRule.rule_description.ilike(f"%{search}%"))
    count_q = select(sqlfunc.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.order_by(DQRule.created_at.desc()).limit(limit).offset(offset))
    rows = result.all()
    items = [
        {
            "rule_id": rule.rule_id,
            "rule_name": rule.rule_name,
            "rule_description": rule.rule_description,
            "rule_type": rule.rule_type,
            "rule_category": rule.rule_category,
            "target_column": rule.target_column,
            "rule_sql": rule.rule_sql,
            "rule_config": rule.rule_config,
            "severity": rule.severity,
            "status": rule.status,
            "is_active": rule.is_active,
            "created_by": rule.created_by,
            "approved_by": rule.approved_by,
            "created_at": rule.created_at.isoformat(),
            "updated_at": rule.updated_at.isoformat(),
            "asset_id": asset.asset_id,
            "sf_database_name": asset.sf_database_name,
            "sf_schema_name": asset.sf_schema_name,
            "sf_table_name": asset.sf_table_name,
            "table_criticality": asset.criticality,
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "subdomain_id": subdomain.subdomain_id,
            "subdomain_name": subdomain.subdomain_name,
        }
        for rule, asset, domain, subdomain in rows
    ]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.post("", response_model=RuleResponse)
async def create_rule(payload: RuleCreate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    rule = DQRule(rule_id=str(uuid.uuid4()), **payload.model_dump())
    # All newly created rules must be reviewed by the data stewards group before they
    # can run. Force them into the review queue and keep them inactive until approved.
    rule.status = "pending_review"
    rule.is_active = False
    rule.created_by = user.get("email")
    if not rule.rule_sql and rule.rule_type != "custom_sql_check":
        asset_result = await db.execute(select(DataAsset).where(DataAsset.asset_id == rule.asset_id))
        asset = asset_result.scalar_one_or_none()
        if asset:
            try:
                tref = f'"{asset.sf_schema_name}"."{asset.sf_table_name}"'
                rule.rule_sql = sql_generator.generate(rule.rule_type, rule.rule_config or {}, tref, rule.target_column)
            except Exception:
                pass
    db.add(rule)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="CREATE",
                    entity_type="rule", entity_id=rule.rule_id, new_value=payload.model_dump()))
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("")
async def list_rules(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    rule_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func as sqlfunc
    q = select(DQRule)
    if domain_id:
        q = q.where(DQRule.domain_id == domain_id)
    if subdomain_id:
        q = q.where(DQRule.subdomain_id == subdomain_id)
    if asset_id:
        q = q.where(DQRule.asset_id == asset_id)
    if rule_type:
        q = q.where(DQRule.rule_type == rule_type)
    if severity:
        q = q.where(DQRule.severity == severity)
    if is_active is not None:
        q = q.where(DQRule.is_active == is_active)
    total_res = await db.execute(select(sqlfunc.count()).select_from(q.subquery()))
    total = total_res.scalar() or 0
    result = await db.execute(q.order_by(DQRule.created_at.desc()).limit(limit).offset(offset))
    return {"total": total, "limit": limit, "offset": offset,
            "items": result.scalars().all()}


@router.get("/export")
async def export_rules(domain_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    q = select(DQRule)
    if domain_id:
        q = q.where(DQRule.domain_id == domain_id)
    result = await db.execute(q)
    rules = result.scalars().all()
    export = [
        {
            "rule_id": r.rule_id, "rule_name": r.rule_name, "rule_type": r.rule_type,
            "severity": r.severity, "target_column": r.target_column,
            "asset_id": r.asset_id, "domain_id": r.domain_id, "subdomain_id": r.subdomain_id,
            "rule_config": r.rule_config,
        }
        for r in rules
    ]
    return {"rules": export, "count": len(export)}


@router.post("/import")
async def import_rules(payload: RuleImportPayload, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    domain_result = await db.execute(select(Domain).where(Domain.domain_name.ilike(payload.domain)))
    domain = domain_result.scalar_one_or_none()
    if not domain:
        raise HTTPException(404, f"Domain '{payload.domain}' not found")

    sub_result = await db.execute(
        select(Subdomain).where(Subdomain.domain_id == domain.domain_id, Subdomain.subdomain_name.ilike(payload.subdomain))
    )
    subdomain = sub_result.scalar_one_or_none()
    if not subdomain:
        raise HTTPException(404, f"Subdomain '{payload.subdomain}' not found")

    asset_result = await db.execute(
        select(DataAsset).where(
            DataAsset.domain_id == domain.domain_id,
            DataAsset.sf_schema_name.ilike(payload.asset.get("sf_schema_name", "")),
            DataAsset.sf_table_name.ilike(payload.asset.get("sf_table_name", ""))
        )
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        asset = DataAsset(
            asset_id=str(uuid.uuid4()),
            domain_id=domain.domain_id,
            subdomain_id=subdomain.subdomain_id,
            sf_schema_name=payload.asset.get("sf_schema_name", ""),
            sf_table_name=payload.asset.get("sf_table_name", ""),
            sf_database_name=payload.asset.get("sf_database_name"),
        )
        db.add(asset)
        await db.flush()

    created = []
    for item in payload.rules:
        tref = f'"{asset.sf_schema_name}"."{asset.sf_table_name}"'
        try:
            generated_sql = sql_generator.generate(item.rule_type, item.config or {}, tref, item.target_column)
        except Exception:
            generated_sql = None
        rule = DQRule(
            rule_id=str(uuid.uuid4()),
            rule_name=item.rule_name,
            rule_description=item.rule_description,
            domain_id=domain.domain_id,
            subdomain_id=subdomain.subdomain_id,
            asset_id=asset.asset_id,
            rule_type=item.rule_type,
            target_column=item.target_column,
            severity=item.severity,
            rule_config=item.config,
            rule_sql=generated_sql,
            status="pending_review",
            created_by=user.get("email"),
        )
        db.add(rule)
        created.append(rule.rule_id)

    await db.commit()
    return {"imported": len(created), "rule_ids": created}


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return rule


async def _snapshot_rule_version(db: AsyncSession, rule: DQRule, changed_by: Optional[str], change_reason: Optional[str] = None) -> None:
    """Save an immutable snapshot of the rule before updating it."""
    snapshot = RuleVersion(
        version_id=str(uuid.uuid4()),
        rule_id=rule.rule_id,
        version=rule.version,
        rule_name=rule.rule_name,
        rule_description=rule.rule_description,
        rule_type=rule.rule_type,
        target_column=rule.target_column,
        rule_sql=rule.rule_sql,
        rule_config=rule.rule_config,
        severity=rule.severity,
        status=rule.status,
        changed_by=changed_by,
        change_reason=change_reason,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(snapshot)


@router.put("/{rule_id}", response_model=RuleResponse)
async def update_rule(rule_id: str, payload: RuleUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    # Snapshot before updating
    await _snapshot_rule_version(db, rule, changed_by=user.get("email"), change_reason="manual update")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    rule.version = (rule.version or 1) + 1
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(audit_id=str(uuid.uuid4()), user_email=user.get("email"), action="UPDATE",
                    entity_type="rule", entity_id=rule_id, new_value=payload.model_dump(exclude_none=True)))
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}/status")
async def set_rule_status(
    rule_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Quick-toggle status: active | draft | disabled | archived"""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    new_status = body.get("status")
    if new_status not in ("active", "draft", "pending_review", "disabled", "archived"):
        raise HTTPException(400, "Invalid status value")
    rule.status = new_status
    rule.is_active = new_status == "active"
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="STATUS_CHANGE", entity_type="rule", entity_id=rule_id,
        new_value={"status": new_status},
    ))
    await db.commit()
    return {"rule_id": rule_id, "status": rule.status, "is_active": rule.is_active}


@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from app.services.scheduler_service import remove_rule_from_table_schedule
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    asset_id = rule.asset_id
    rule.is_active = False
    rule.status = "archived"
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await remove_rule_from_table_schedule(rule_id, asset_id, db)
    return {"message": "Rule archived"}


# ── Approval Workflow ─────────────────────────────────────────────────────────

@router.post("/{rule_id}/approve", response_model=RuleResponse)
async def approve_rule(
    rule_id: str,
    payload: RuleApproveRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    """Approve a pending_review rule, moving it to approved → active."""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if rule.status not in ("pending_review", "draft"):
        raise HTTPException(400, f"Rule cannot be approved from status '{rule.status}'")
    approver = payload.approved_by or user.get("email", "unknown")
    await _snapshot_rule_version(db, rule, changed_by=approver, change_reason="approved")
    rule.status = "active"
    rule.is_active = True
    rule.approved_by = approver
    rule.rejected_by = None
    rule.rejection_reason = None
    rule.version = (rule.version or 1) + 1
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="APPROVE", entity_type="rule", entity_id=rule_id,
        new_value={"approved_by": approver, "status": "active"},
    ))
    await db.commit()
    await db.refresh(rule)
    from app.services.scheduler_service import ensure_table_schedule
    await ensure_table_schedule(rule, db)
    return rule


@router.post("/{rule_id}/reject", response_model=RuleResponse)
async def reject_rule(
    rule_id: str,
    payload: RuleRejectRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    """Reject a pending_review rule, moving it back to draft with a reason."""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if rule.status not in ("pending_review", "approved", "active"):
        raise HTTPException(400, f"Rule cannot be rejected from status '{rule.status}'")
    rejecter = payload.rejected_by or user.get("email", "unknown")
    await _snapshot_rule_version(db, rule, changed_by=rejecter, change_reason=f"rejected: {payload.rejection_reason}")
    rule.status = "draft"
    rule.is_active = False
    rule.rejected_by = rejecter
    rule.rejection_reason = payload.rejection_reason
    rule.version = (rule.version or 1) + 1
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="REJECT", entity_type="rule", entity_id=rule_id,
        new_value={"rejected_by": rejecter, "rejection_reason": payload.rejection_reason, "status": "draft"},
    ))
    await db.commit()
    await db.refresh(rule)
    from app.services.scheduler_service import remove_rule_from_table_schedule
    await remove_rule_from_table_schedule(rule.rule_id, rule.asset_id, db)
    return rule


@router.post("/{rule_id}/submit", response_model=RuleResponse)
async def submit_rule_for_review(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Move a draft rule to pending_review for governance approval."""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if rule.status != "draft":
        raise HTTPException(400, f"Only draft rules can be submitted for review. Current status: {rule.status}")
    await _snapshot_rule_version(db, rule, changed_by=user.get("email"), change_reason="submitted for review")
    rule.status = "pending_review"
    rule.version = (rule.version or 1) + 1
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=user.get("email"),
        action="SUBMIT_FOR_REVIEW",
        entity_type="rule",
        entity_id=rule_id,
        new_value={"status": "pending_review", "submitted_by": user.get("email")},
    ))
    await db.commit()
    await db.refresh(rule)
    return rule


# ── Version History ───────────────────────────────────────────────────────────

@router.get("/{rule_id}/versions", response_model=list[RuleVersionResponse])
async def get_rule_versions(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the full version history of a rule, newest first."""
    result = await db.execute(
        select(RuleVersion)
        .where(RuleVersion.rule_id == rule_id)
        .order_by(desc(RuleVersion.version))
    )
    return result.scalars().all()


@router.post("/{rule_id}/rollback/{version}", response_model=RuleResponse)
async def rollback_rule(
    rule_id: str,
    version: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    """Rollback a rule to a specific historical version."""
    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")

    ver_res = await db.execute(
        select(RuleVersion).where(RuleVersion.rule_id == rule_id, RuleVersion.version == version)
    )
    snap = ver_res.scalar_one_or_none()
    if not snap:
        raise HTTPException(404, f"Version {version} not found for rule {rule_id}")

    await _snapshot_rule_version(db, rule, changed_by=user.get("email"), change_reason=f"rollback to v{version}")
    rule.rule_name = snap.rule_name
    rule.rule_description = snap.rule_description
    rule.rule_type = snap.rule_type
    rule.target_column = snap.target_column
    rule.rule_sql = snap.rule_sql
    rule.rule_config = snap.rule_config
    rule.severity = snap.severity
    rule.version = (rule.version or 1) + 1
    rule.status = "pending_review"
    rule.is_active = False
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="ROLLBACK", entity_type="rule", entity_id=rule_id,
        new_value={"rolled_back_to_version": version},
    ))
    await db.commit()
    await db.refresh(rule)
    return rule


# ── Bulk Operations ───────────────────────────────────────────────────────────

@router.patch("/bulk/status")
async def bulk_set_status(
    payload: BulkStatusRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    """Bulk update the status of multiple rules."""
    valid_statuses = ("active", "draft", "pending_review", "disabled", "archived")
    if payload.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Valid: {valid_statuses}")

    updated = 0
    for rule_id in payload.rule_ids:
        result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
        rule = result.scalar_one_or_none()
        if rule:
            rule.status = payload.status
            rule.is_active = payload.status == "active"
            rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            updated += 1

    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="BULK_STATUS_CHANGE", entity_type="rule",
        new_value={"rule_ids": payload.rule_ids, "status": payload.status, "updated": updated},
    ))
    await db.commit()
    return {"updated": updated, "status": payload.status, "rule_ids": payload.rule_ids}


@router.post("/bulk/execute")
async def bulk_execute(
    payload: BulkExecuteRequest,
    background_tasks: "BackgroundTasks",
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    """
    Queue multiple rules for execution in the background.
    Returns a job_id immediately; poll GET /jobs/{job_id} for progress.
    """
    from fastapi import BackgroundTasks as BT
    from app.services.job_tracker import create_job

    job_id = create_job(
        job_type="bulk_execute",
        total=len(payload.rule_ids),
        meta={"rule_ids": payload.rule_ids, "triggered_by": user.get("email")},
    )
    background_tasks.add_task(_bg_bulk_execute, job_id, payload.rule_ids)
    return {
        "job_id": job_id,
        "status": "queued",
        "total": len(payload.rule_ids),
        "poll_url": f"/jobs/{job_id}",
    }


@router.get("/bulk/jobs/{job_id}")
async def get_bulk_job_status(job_id: str, _=Depends(get_current_user)):
    """Poll the status of a background bulk-execute job."""
    from app.services.job_tracker import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired")
    return job


async def _bg_bulk_execute(job_id: str, rule_ids: list[str]) -> None:
    from app.db.database import AsyncSessionLocal
    from app.services.execution_service import execute_rule
    from app.services.job_tracker import mark_running, mark_completed, mark_failed, append_result

    mark_running(job_id)
    try:
        async with AsyncSessionLocal() as db:
            for rule_id in rule_ids:
                try:
                    run = await execute_rule(rule_id, db)
                    append_result(job_id, {"rule_id": rule_id, "run_id": run.run_id, "status": run.status}, success=True)
                except Exception as e:
                    append_result(job_id, {"rule_id": rule_id, "status": "error", "error": str(e)}, success=False)
        mark_completed(job_id)
    except Exception as e:
        mark_failed(job_id, str(e))


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/{rule_id}/tags")
async def get_rule_tags(rule_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuleTag).where(RuleTag.rule_id == rule_id))
    tags = result.scalars().all()
    return [{"tag_id": t.tag_id, "tag_name": t.tag_name} for t in tags]


@router.post("/{rule_id}/tags")
async def add_rule_tag(
    rule_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    tag_name = body.get("tag_name", "").strip()
    if not tag_name:
        raise HTTPException(400, "tag_name is required")
    # Check rule exists
    res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    if not res.scalar_one_or_none():
        raise HTTPException(404, "Rule not found")
    # Prevent duplicates
    existing = await db.execute(
        select(RuleTag).where(RuleTag.rule_id == rule_id, RuleTag.tag_name == tag_name)
    )
    if existing.scalar_one_or_none():
        return {"message": "Tag already exists"}
    tag = RuleTag(tag_id=str(uuid.uuid4()), rule_id=rule_id, tag_name=tag_name)
    db.add(tag)
    await db.commit()
    return {"tag_id": tag.tag_id, "tag_name": tag.tag_name}


@router.delete("/{rule_id}/tags/{tag_name}")
async def remove_rule_tag(
    rule_id: str,
    tag_name: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(RuleTag).where(RuleTag.rule_id == rule_id, RuleTag.tag_name == tag_name)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"message": "Tag removed"}


# ── Clone ────────────────────────────────────────────────────────────────────

@router.post("/{rule_id}/clone", response_model=RuleResponse)
async def clone_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Duplicate a rule as a new draft with a copy suffix."""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    clone = DQRule(
        rule_id=str(uuid.uuid4()),
        rule_name=f"{rule.rule_name} (copy)",
        rule_description=rule.rule_description,
        domain_id=rule.domain_id,
        subdomain_id=rule.subdomain_id,
        asset_id=rule.asset_id,
        rule_type=rule.rule_type,
        rule_category=rule.rule_category,
        target_column=rule.target_column,
        rule_sql=rule.rule_sql,
        rule_config=rule.rule_config,
        severity=rule.severity,
        status="draft",
        is_active=False,
        created_by=user.get("email"),
    )
    db.add(clone)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=user.get("email"),
        action="CLONE", entity_type="rule", entity_id=clone.rule_id,
        new_value={"cloned_from": rule_id},
    ))
    await db.commit()
    await db.refresh(clone)
    return clone


# ── Execution history for a single rule ──────────────────────────────────────

@router.get("/{rule_id}/runs")
async def get_rule_runs(
    rule_id: str,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models import DQRuleRun
    from sqlalchemy import desc, func as sqlfunc
    total_res = await db.execute(
        select(sqlfunc.count()).select_from(DQRuleRun).where(DQRuleRun.rule_id == rule_id)
    )
    total = total_res.scalar() or 0
    result = await db.execute(
        select(DQRuleRun).where(DQRuleRun.rule_id == rule_id)
        .order_by(desc(DQRuleRun.created_at)).limit(limit).offset(offset)
    )
    runs = result.scalars().all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "runs": [
            {
                "run_id": r.run_id, "status": r.status, "quality_score": r.quality_score,
                "failed_rows_count": r.failed_rows_count, "total_rows_scanned": r.total_rows_scanned,
                "failure_percentage": r.failure_percentage, "error_message": r.error_message,
                "execution_start_time": r.execution_start_time.isoformat() if r.execution_start_time else None,
                "execution_end_time": r.execution_end_time.isoformat() if r.execution_end_time else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in runs
        ],
    }
