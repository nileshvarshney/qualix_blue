from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.database import get_db
from app.db.models import Issue, ISSUE_TRANSITIONS, Asset, AssetSourceMeta, DQRule, Team, SnowflakeConnection, AuditLog, gen_uuid, now as model_now
from app.core.security import get_current_user, require_write, check_domain_access, apply_domain_filter

router = APIRouter(prefix="/issues", tags=["Issues"])


def _fmt_issue(issue: Issue, extra: Optional[dict] = None) -> dict:
    return {
        "issue_id":          issue.issue_id,
        "title":             issue.title,
        "description":       issue.description,
        "issue_type":        issue.issue_type,
        "status":            issue.status,
        "severity":          issue.severity,
        "domain_id":         issue.domain_id,
        "subdomain_id":      issue.subdomain_id,
        "asset_id":          issue.asset_id,
        "source_id":         issue.source_id,
        "rule_id":           issue.rule_id,
        "run_id":            issue.run_id,
        "alert_id":          issue.alert_id,
        "assigned_team_id":  issue.assigned_team_id,
        "assigned_to":       issue.assigned_to,
        "created_by":        issue.created_by,
        "created_at":        issue.created_at.isoformat() if issue.created_at else None,
        "updated_at":        issue.updated_at.isoformat() if issue.updated_at else None,
        "resolved_at":       issue.resolved_at.isoformat() if issue.resolved_at else None,
        "closed_at":         issue.closed_at.isoformat() if issue.closed_at else None,
        "reopen_count":      issue.reopen_count,
        "resolution_note":   issue.resolution_note,
        **(extra or {}),
    }


def _enrich_query():
    return (
        select(Issue, Asset, AssetSourceMeta, DQRule, Team, SnowflakeConnection)
        .outerjoin(Asset, Issue.asset_id == Asset.asset_id)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .outerjoin(DQRule, Issue.rule_id == DQRule.rule_id)
        .outerjoin(Team, Issue.assigned_team_id == Team.team_id)
        .outerjoin(SnowflakeConnection, Issue.source_id == SnowflakeConnection.connection_id)
    )


def _enrich_extra(asset, source_meta, rule, team, connection=None) -> dict:
    return {
        "asset_name":         (asset.display_name or asset.physical_name) if asset else None,
        "connection_name":    connection.connection_name if connection else None,
        "sf_database_name":   source_meta.sf_database_name if source_meta else None,
        "sf_schema_name":     source_meta.sf_schema_name if source_meta else None,
        "sf_table_name":      source_meta.sf_table_name if source_meta else None,
        "sf_table_type":      source_meta.sf_table_type if source_meta else None,
        "rule_name":          rule.rule_name if rule else None,
        "assigned_team_name": team.team_name if team else None,
    }


def _apply_filters(q, *, status, severity, issue_type, asset_id, connection_id, domain_id, rule_id, alert_id, run_id, assigned_team_id, assigned_to):
    if status:
        q = q.where(Issue.status == status)
    if severity:
        q = q.where(Issue.severity == severity)
    if issue_type:
        q = q.where(Issue.issue_type == issue_type)
    if asset_id:
        q = q.where(Issue.asset_id == asset_id)
    if connection_id:
        q = q.where(Issue.source_id == connection_id)
    if domain_id:
        q = q.where(Issue.domain_id == domain_id)
    if rule_id:
        q = q.where(Issue.rule_id == rule_id)
    if alert_id:
        q = q.where(Issue.alert_id == alert_id)
    if run_id:
        q = q.where(Issue.run_id == run_id)
    if assigned_team_id:
        q = q.where(Issue.assigned_team_id == assigned_team_id)
    if assigned_to:
        q = q.where(Issue.assigned_to == assigned_to)
    return q


@router.get("")
async def list_issues(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    alert_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    assigned_team_id: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    base = _apply_filters(
        select(Issue), status=status, severity=severity, issue_type=issue_type, asset_id=asset_id,
        connection_id=connection_id, domain_id=domain_id, rule_id=rule_id, alert_id=alert_id, run_id=run_id,
        assigned_team_id=assigned_team_id, assigned_to=assigned_to,
    )
    base = apply_domain_filter(base, Issue.domain_id, user)

    total_res = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_res.scalar_one()

    result = await db.execute(base.order_by(desc(Issue.created_at)).limit(limit).offset(offset))
    items = [_fmt_issue(i) for i in result.scalars().all()]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/enriched")
async def list_issues_enriched(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    alert_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    assigned_team_id: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = _apply_filters(
        _enrich_query(), status=status, severity=severity, issue_type=issue_type, asset_id=asset_id,
        connection_id=connection_id, domain_id=domain_id, rule_id=rule_id, alert_id=alert_id, run_id=run_id,
        assigned_team_id=assigned_team_id, assigned_to=assigned_to,
    )
    q = apply_domain_filter(q, Issue.domain_id, user)
    q = q.order_by(desc(Issue.created_at)).limit(limit).offset(offset)

    result = await db.execute(q)
    return [
        _fmt_issue(issue, _enrich_extra(asset, source_meta, rule, team, connection))
        for issue, asset, source_meta, rule, team, connection in result.all()
    ]


@router.get("/stats")
async def issue_stats(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    q = select(Issue.status, func.count().label("count")).group_by(Issue.status)
    q = apply_domain_filter(q, Issue.domain_id, user)
    result = await db.execute(q)
    by_status = {row.status: row.count for row in result.all()}
    open_count = sum(c for s, c in by_status.items() if s not in ("resolved", "closed"))
    return {"by_status": by_status, "open_count": open_count}


@router.post("")
async def create_issue(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    title = body.get("title")
    if not title:
        raise HTTPException(400, "title is required")

    domain_id = body.get("domain_id")
    subdomain_id = body.get("subdomain_id")
    source_id = None
    asset_id = body.get("asset_id")
    if asset_id:
        result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
        asset = result.scalar_one_or_none()
        if not asset:
            raise HTTPException(404, "Asset not found")
        domain_id = asset.domain_id
        subdomain_id = asset.subdomain_id
        source_id = asset.connection_id

    check_domain_access(user, domain_id)

    now_dt = model_now()
    issue = Issue(
        issue_id=gen_uuid(),
        title=title,
        description=body.get("description"),
        issue_type=body.get("issue_type", "manual"),
        status="new",
        severity=body.get("severity", "medium"),
        domain_id=domain_id,
        subdomain_id=subdomain_id,
        asset_id=asset_id,
        source_id=source_id,
        rule_id=body.get("rule_id"),
        run_id=body.get("run_id"),
        alert_id=body.get("alert_id"),
        assigned_team_id=body.get("assigned_team_id"),
        assigned_to=body.get("assigned_to"),
        created_by=user.get("email"),
        created_at=now_dt,
        updated_at=now_dt,
    )
    db.add(issue)

    db.add(AuditLog(
        audit_id=gen_uuid(),
        user_email=user.get("email"),
        action="create",
        entity_type="issue",
        entity_id=issue.issue_id,
        old_value=None,
        new_value={"status": "new", "title": title},
        created_at=now_dt,
    ))

    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.get("/{issue_id}")
async def get_issue(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(_enrich_query().where(Issue.issue_id == issue_id))
    row = result.first()
    if not row:
        raise HTTPException(404, "Issue not found")
    issue, asset, source_meta, rule, team, connection = row
    check_domain_access(user, issue.domain_id)
    return _fmt_issue(issue, _enrich_extra(asset, source_meta, rule, team, connection))


@router.put("/{issue_id}")
async def update_issue(
    issue_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    editable = ("title", "description", "severity", "assigned_to", "assigned_team_id")
    old_value, new_value = {}, {}
    for field in editable:
        if field in body and body[field] != getattr(issue, field):
            old_value[field] = getattr(issue, field)
            new_value[field] = body[field]
            setattr(issue, field, body[field])

    if new_value:
        issue.updated_at = model_now()
        db.add(AuditLog(
            audit_id=gen_uuid(), user_email=user.get("email"), action="update",
            entity_type="issue", entity_id=issue.issue_id,
            old_value=old_value, new_value=new_value, created_at=model_now(),
        ))
        await db.commit()
        await db.refresh(issue)
    return _fmt_issue(issue)


@router.post("/{issue_id}/transition")
async def transition_issue(
    issue_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(400, "status is required")

    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    allowed = ISSUE_TRANSITIONS.get(issue.status, set())
    if new_status not in allowed:
        raise HTTPException(400, f"Cannot transition from '{issue.status}' to '{new_status}'")

    old_status = issue.status
    now_dt = model_now()
    issue.status = new_status
    issue.updated_at = now_dt

    if new_status == "resolved":
        issue.resolved_at = now_dt
    elif new_status == "closed":
        issue.closed_at = now_dt
    elif new_status == "reopened":
        issue.reopen_count = (issue.reopen_count or 0) + 1
        issue.resolved_at = None
        issue.closed_at = None

    if body.get("resolution_note"):
        issue.resolution_note = body["resolution_note"]

    db.add(AuditLog(
        audit_id=gen_uuid(), user_email=user.get("email"), action="status_change",
        entity_type="issue", entity_id=issue.issue_id,
        old_value={"status": old_status}, new_value={"status": new_status}, created_at=now_dt,
    ))
    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.post("/{issue_id}/reopen")
async def reopen_issue(
    issue_id: str,
    body: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    if issue.status not in ("resolved", "closed"):
        raise HTTPException(400, f"Cannot reopen an issue with status '{issue.status}'")

    old_status = issue.status
    now_dt = model_now()
    issue.status = "reopened"
    issue.updated_at = now_dt
    issue.reopen_count = (issue.reopen_count or 0) + 1
    issue.resolved_at = None
    issue.closed_at = None
    if body and body.get("resolution_note"):
        issue.resolution_note = body["resolution_note"]

    db.add(AuditLog(
        audit_id=gen_uuid(), user_email=user.get("email"), action="status_change",
        entity_type="issue", entity_id=issue.issue_id,
        old_value={"status": old_status}, new_value={"status": "reopened"}, created_at=now_dt,
    ))
    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.get("/{issue_id}/audit")
async def get_issue_audit(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "issue", AuditLog.entity_id == issue_id)
        .order_by(desc(AuditLog.created_at))
    )
    logs = result.scalars().all()
    return {
        "items": [
            {
                "audit_id": l.audit_id, "user_email": l.user_email, "action": l.action,
                "old_value": l.old_value, "new_value": l.new_value,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }


def _fmt_proposal(p) -> dict:
    return {
        "proposal_id": p.proposal_id,
        "issue_id": p.issue_id,
        "rule_id": p.rule_id,
        "run_id": p.run_id,
        "asset_id": p.asset_id,
        "rule_type": p.rule_type,
        "classification": p.classification,
        "proposed_action": p.proposed_action,
        "config_field": p.config_field,
        "old_value": p.old_value,
        "new_value": p.new_value,
        "confidence": p.confidence,
        "status": p.status,
        "decided_by": p.decided_by,
        "decided_at": p.decided_at.isoformat() if p.decided_at else None,
        "rerun_run_id": p.rerun_run_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/{issue_id}/remediation-proposal")
async def get_remediation_proposal(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from app.db.models import RemediationProposal

    issue_result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = issue_result.scalar_one_or_none()
    if issue:
        check_domain_access(user, issue.domain_id)

    result = await db.execute(
        select(RemediationProposal)
        .where(RemediationProposal.issue_id == issue_id)
        .order_by(desc(RemediationProposal.created_at))
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        return None
    return _fmt_proposal(proposal)


@router.post("/{issue_id}/remediation-proposal/{proposal_id}/approve")
async def approve_remediation_proposal(
    issue_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import RemediationProposal
    from app.services import remediation_service

    issue_result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = issue_result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    result = await db.execute(
        select(RemediationProposal).where(
            RemediationProposal.proposal_id == proposal_id, RemediationProposal.issue_id == issue_id
        )
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(404, "Remediation proposal not found")
    if proposal.status != "pending":
        raise HTTPException(400, f"Cannot approve a proposal with status '{proposal.status}'")
    if proposal.classification != "auto_fixable":
        raise HTTPException(400, "Escalation-only proposals cannot be applied — acknowledge them instead")

    updated = await remediation_service.apply_proposal(proposal, user.get("email"), db)
    return _fmt_proposal(updated)


@router.post("/{issue_id}/remediation-proposal/{proposal_id}/reject")
async def reject_remediation_proposal(
    issue_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import RemediationProposal

    issue_result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = issue_result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    result = await db.execute(
        select(RemediationProposal).where(
            RemediationProposal.proposal_id == proposal_id, RemediationProposal.issue_id == issue_id
        )
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(404, "Remediation proposal not found")
    if proposal.status != "pending":
        raise HTTPException(400, f"Cannot reject a proposal with status '{proposal.status}'")

    proposal.status = "rejected"
    proposal.decided_by = user.get("email")
    proposal.decided_at = model_now()
    await db.commit()
    await db.refresh(proposal)
    return _fmt_proposal(proposal)
