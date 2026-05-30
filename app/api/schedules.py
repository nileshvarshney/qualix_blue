from __future__ import annotations
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import DQSchedule, DQRule, Domain, Subdomain, DataAsset
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate, ScheduleResponse
from app.services.scheduler_service import (
    register_schedule, remove_schedule, get_next_run, list_jobs,
    _schedule_column_profile_job, _nightly_column_profile,
    _schedule_quality_aggregation_job, _nightly_aggregate,
    _schedule_policy_evaluation_job, _bg_evaluate_policies,
    _rule_ids_to_db, _rule_ids_from_db,
)
from app.core.security import get_current_user
from datetime import datetime, timezone

router = APIRouter(prefix="/schedules", tags=["Schedules"])


def _register(sched: DQSchedule):
    """Sync helper: push a DB schedule record into APScheduler."""
    register_schedule(
        schedule_id=sched.schedule_id,
        rule_id=sched.rule_id,
        asset_id=sched.asset_id,
        subdomain_id=sched.subdomain_id,
        domain_id=sched.domain_id,
        rule_ids=_rule_ids_from_db(sched.rule_ids),
        frequency=sched.frequency,
        cron_expr=sched.cron_expression,
        timezone=sched.timezone,
        run_at_hour=sched.run_at_hour if sched.run_at_hour is not None else 6,
        run_at_minute=sched.run_at_minute if sched.run_at_minute is not None else 0,
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", response_model=ScheduleResponse)
async def create_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    data = payload.model_dump()
    rule_ids_list = data.pop("rule_ids", None)
    sched = DQSchedule(
        schedule_id=str(uuid.uuid4()),
        rule_ids=_rule_ids_to_db(rule_ids_list),
        **data,
    )
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    if sched.is_active:
        _register(sched)
    # Return with parsed rule_ids
    resp = ScheduleResponse.model_validate(sched)
    resp.rule_ids = rule_ids_list
    return resp


@router.get("/jobs")
async def scheduler_jobs():
    """List all jobs currently registered in APScheduler with next run times."""
    return list_jobs()


@router.post("/column-profile/run-now")
async def run_column_profile_now(user: dict = Depends(get_current_user)):
    """Manually trigger the nightly column profiling job for all active assets."""
    import asyncio
    asyncio.create_task(_nightly_column_profile())
    return {"message": "Column profiling started for all active assets"}


@router.post("/quality-aggregation/run-now")
async def run_quality_aggregation_now(user: dict = Depends(get_current_user)):
    """Manually trigger the quality score aggregation job."""
    import asyncio
    asyncio.create_task(_nightly_aggregate())
    return {"message": "Quality score aggregation started"}


@router.post("/quality-aggregation/configure")
async def configure_quality_aggregation(
    enabled: bool,
    hour: int = 0,
    minute: int = 5,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update the quality aggregation schedule. Persists to app_config and re-registers immediately."""
    from app.services.config_service import set_value
    await set_value("quality_aggregation_enabled", str(enabled).lower(), user.get("email", "ui"), db)
    await set_value("quality_aggregation_hour",    str(hour),             user.get("email", "ui"), db)
    await set_value("quality_aggregation_minute",  str(minute),           user.get("email", "ui"), db)
    _schedule_quality_aggregation_job(enabled=enabled, hour=hour, minute=minute)
    return {"message": f"Quality aggregation schedule updated — {'enabled' if enabled else 'disabled'}, runs at {hour:02d}:{minute:02d}"}


@router.post("/policy-evaluation/run-now")
async def run_policy_evaluation_now(user: dict = Depends(get_current_user)):
    """Manually trigger the policy evaluation job."""
    import asyncio
    asyncio.create_task(_bg_evaluate_policies())
    return {"message": "Policy evaluation started"}


@router.post("/policy-evaluation/configure")
async def configure_policy_evaluation(
    enabled: bool,
    hour: int = 0,
    minute: int = 15,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update the policy evaluation schedule. Persists to app_config and re-registers immediately."""
    from app.services.config_service import set_value
    await set_value("policy_evaluation_enabled", str(enabled).lower(), user.get("email", "ui"), db)
    await set_value("policy_evaluation_hour",    str(hour),            user.get("email", "ui"), db)
    await set_value("policy_evaluation_minute",  str(minute),          user.get("email", "ui"), db)
    _schedule_policy_evaluation_job(enabled=enabled, hour=hour, minute=minute)
    return {"message": f"Policy evaluation schedule updated — {'enabled' if enabled else 'disabled'}, runs at {hour:02d}:{minute:02d}"}


@router.post("/column-profile/configure")
async def configure_column_profile(
    enabled: bool,
    hour: int = 2,
    minute: int = 0,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update the column profiling schedule. Persists to app_config and re-registers the job."""
    from app.services.config_service import set_value
    await set_value("column_profile_enabled", str(enabled).lower(), user.get("email", "ui"), db)
    await set_value("column_profile_hour",    str(hour),            user.get("email", "ui"), db)
    await set_value("column_profile_minute",  str(minute),          user.get("email", "ui"), db)
    _schedule_column_profile_job(enabled=enabled, hour=hour, minute=minute)
    return {"message": f"Column profiling schedule updated — {'enabled' if enabled else 'disabled'}, runs at {hour:02d}:{minute:02d}"}


@router.get("/rules-status")
async def get_rules_schedule_status(
    asset_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns rules in scope with a flag indicating if each rule already has
    an active rule-level schedule (to prevent duplicate bundles in the UI).
    """
    q = select(DQRule).where(DQRule.is_active == True)
    if asset_id:
        q = q.where(DQRule.asset_id == asset_id)
    elif subdomain_id:
        q = q.where(DQRule.subdomain_id == subdomain_id)
    elif domain_id:
        q = q.where(DQRule.domain_id == domain_id)

    rules_result = await db.execute(q)
    rules = rules_result.scalars().all()

    # Find which rules already have an active rule-level schedule
    rule_level_schedules = await db.execute(
        select(DQSchedule).where(
            DQSchedule.schedule_level == "rule",
            DQSchedule.is_active == True,
        )
    )
    scheduled_rule_ids = {s.rule_id for s in rule_level_schedules.scalars().all() if s.rule_id}

    return [
        {
            "rule_id": r.rule_id,
            "rule_name": r.rule_name,
            "rule_description": r.rule_description,
            "rule_type": r.rule_type,
            "severity": r.severity,
            "asset_id": r.asset_id,
            "domain_id": r.domain_id,
            "subdomain_id": r.subdomain_id,
            "has_rule_level_schedule": r.rule_id in scheduled_rule_ids,
        }
        for r in rules
    ]


@router.get("/enriched")
async def list_schedules_enriched(db: AsyncSession = Depends(get_db)):
    """Returns schedules with linked target names, next scheduled run time, and bundle rule summaries."""
    result = await db.execute(select(DQSchedule).order_by(DQSchedule.created_at.desc()))
    schedules = result.scalars().all()
    out = []
    for s in schedules:
        rule_name = rule_description = None
        domain_name = subdomain_name = asset_name = asset_schema = None

        if s.rule_id:
            r = await db.execute(select(DQRule).where(DQRule.rule_id == s.rule_id))
            rule = r.scalar_one_or_none()
            if rule:
                rule_name = rule.rule_name
                rule_description = rule.rule_description

        if s.domain_id:
            d = await db.execute(select(Domain).where(Domain.domain_id == s.domain_id))
            dom = d.scalar_one_or_none()
            if dom:
                domain_name = dom.domain_name

        if s.subdomain_id:
            sd = await db.execute(select(Subdomain).where(Subdomain.subdomain_id == s.subdomain_id))
            subdom = sd.scalar_one_or_none()
            if subdom:
                subdomain_name = subdom.subdomain_name

        if s.asset_id:
            a = await db.execute(select(DataAsset).where(DataAsset.asset_id == s.asset_id))
            asset = a.scalar_one_or_none()
            if asset:
                asset_name = asset.sf_table_name
                asset_schema = asset.sf_schema_name

        # Resolve bundled rule summaries
        rule_ids_list = _rule_ids_from_db(s.rule_ids)
        bundled_rules = []
        if rule_ids_list:
            for rid in rule_ids_list:
                rr = await db.execute(select(DQRule).where(DQRule.rule_id == rid))
                bundled_rule = rr.scalar_one_or_none()
                if bundled_rule:
                    bundled_rules.append({
                        "rule_id": bundled_rule.rule_id,
                        "rule_name": bundled_rule.rule_name,
                        "rule_description": bundled_rule.rule_description,
                        "severity": bundled_rule.severity,
                    })

        out.append({
            "schedule_id":    s.schedule_id,
            "schedule_level": s.schedule_level,
            "frequency":      s.frequency,
            "cron_expression":s.cron_expression,
            "timezone":       s.timezone,
            "run_at_hour":    s.run_at_hour,
            "run_at_minute":  s.run_at_minute,
            "is_active":      s.is_active,
            "rule_id":        s.rule_id,
            "rule_name":      rule_name,
            "rule_description": rule_description,
            "asset_id":       s.asset_id,
            "asset_name":     asset_name,
            "asset_schema":   asset_schema,
            "domain_id":      s.domain_id,
            "domain_name":    domain_name,
            "subdomain_id":   s.subdomain_id,
            "subdomain_name": subdomain_name,
            "rule_ids":       rule_ids_list,
            "bundled_rules":  bundled_rules,
            "next_run_time":  get_next_run(s.schedule_id),
            "created_at":     s.created_at.isoformat(),
            "updated_at":     s.updated_at.isoformat(),
        })
    return out


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(
    rule_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(DQSchedule)
    if rule_id:
        q = q.where(DQSchedule.rule_id == rule_id)
    if asset_id:
        q = q.where(DQSchedule.asset_id == asset_id)
    if domain_id:
        q = q.where(DQSchedule.domain_id == domain_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(schedule_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    return sched


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: str,
    payload: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")

    data = payload.model_dump(exclude_none=True)
    rule_ids_list = data.pop("rule_ids", None)
    for field, value in data.items():
        setattr(sched, field, value)
    # Only update rule_ids if explicitly provided in the payload
    if "rule_ids" in payload.model_fields_set:
        sched.rule_ids = _rule_ids_to_db(rule_ids_list)

    sched.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(sched)
    # Re-register or remove from APScheduler
    if sched.is_active:
        _register(sched)
    else:
        remove_schedule(schedule_id)
    return sched


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    remove_schedule(schedule_id)
    await db.delete(sched)
    await db.commit()
    return {"message": "Schedule deleted"}


# ── Pause / Resume ────────────────────────────────────────────────────────────

@router.patch("/{schedule_id}/pause")
async def pause_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    sched.is_active = False
    sched.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    remove_schedule(schedule_id)
    await db.commit()
    return {"schedule_id": schedule_id, "is_active": False, "message": "Schedule paused"}


@router.patch("/{schedule_id}/resume")
async def resume_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    sched.is_active = True
    sched.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    _register(sched)
    await db.commit()
    return {
        "schedule_id":   schedule_id,
        "is_active":     True,
        "next_run_time": get_next_run(schedule_id),
        "message":       "Schedule resumed",
    }


# ── Run now ───────────────────────────────────────────────────────────────────

@router.post("/{schedule_id}/run-now")
async def run_now(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Execute a schedule's rules immediately without waiting for the trigger."""
    result = await db.execute(select(DQSchedule).where(DQSchedule.schedule_id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")

    from app.services.execution_service import execute_rule, execute_asset_rules
    from sqlalchemy import select as sa_select

    # Collect the set of rule_ids that already have an active rule-level schedule
    # so we can skip duplicates when running a bundle/scope schedule
    rule_level_result = await db.execute(
        sa_select(DQSchedule).where(
            DQSchedule.schedule_level == "rule",
            DQSchedule.is_active == True,
            DQSchedule.schedule_id != schedule_id,
        )
    )
    already_scheduled_rule_ids = {s.rule_id for s in rule_level_result.scalars().all() if s.rule_id}

    runs = []
    rule_ids_list = _rule_ids_from_db(sched.rule_ids)

    if sched.rule_id:
        # Rule-level schedule — run the single rule directly
        run = await execute_rule(sched.rule_id, db)
        runs.append({"run_id": run.run_id, "status": run.status})

    elif rule_ids_list:
        # Explicit bundle — run only the pinned rules, skip those already running
        for rid in rule_ids_list:
            if rid in already_scheduled_rule_ids:
                continue
            run = await execute_rule(rid, db)
            runs.append({"run_id": run.run_id, "status": run.status})

    elif sched.asset_id:
        # Table-level scope — run all rules not already covered by a rule-level schedule
        asset_runs = await execute_asset_rules(sched.asset_id, db)
        runs = [{"run_id": r.run_id, "status": r.status} for r in asset_runs
                if r.rule_id not in already_scheduled_rule_ids]

    elif sched.subdomain_id or sched.domain_id:
        q = sa_select(DQRule).where(DQRule.is_active == True)
        if sched.subdomain_id:
            q = q.where(DQRule.subdomain_id == sched.subdomain_id)
        elif sched.domain_id:
            q = q.where(DQRule.domain_id == sched.domain_id)
        rule_result = await db.execute(q)
        for rule in rule_result.scalars().all():
            if rule.rule_id in already_scheduled_rule_ids:
                continue
            run = await execute_rule(rule.rule_id, db)
            runs.append({"run_id": run.run_id, "status": run.status})

    else:
        # Global — run all active rules not already covered
        all_rules_result = await db.execute(sa_select(DQRule).where(DQRule.is_active == True))
        for rule in all_rules_result.scalars().all():
            if rule.rule_id in already_scheduled_rule_ids:
                continue
            run = await execute_rule(rule.rule_id, db)
            runs.append({"run_id": run.run_id, "status": run.status})

    return {"runs": runs, "count": len(runs)}
