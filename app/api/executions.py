from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import DQRuleRun, DQRuleRunSample, DQRule, DataAsset, Domain, Subdomain
from app.schemas.run import RunResponse, RunSampleResponse
from app.services.execution_service import execute_rule, execute_asset_rules
from app.core.security import get_current_user, check_domain_access, apply_domain_filter
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["Execution"])


class TestRuleRequest(BaseModel):
    asset_id: str
    rule_type: str
    target_column: Optional[str] = None
    rule_config: Optional[dict] = None
    rule_sql: Optional[str] = None


# ── Test rule (no-save dry run) ───────────────────────────────────────────────

@router.post("/execute/test-rule")
async def test_rule(
    req: TestRuleRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Execute a rule definition against Snowflake and return results.
    Nothing is written to the database — no run record, no alerts.
    """
    import asyncio
    from datetime import timezone
    from app.services.execution_service import _resolve_executor, _build_table_ref
    from app.services.sql_generator import sql_generator
    from app.services.scoring_service import calculate_rule_quality_score

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == req.asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    table_ref = _build_table_ref(asset)
    config = req.rule_config or {}

    # Generate SQL if not provided
    try:
        sql = req.rule_sql or sql_generator.generate(req.rule_type, config, table_ref, req.target_column)
    except Exception as e:
        raise HTTPException(400, f"SQL generation failed: {e}")

    # Resolve Snowflake connection
    try:
        executor = await _resolve_executor(asset, db, database=asset.sf_database_name or None)
    except RuntimeError as e:
        raise HTTPException(400, str(e))

    start = datetime.now(timezone.utc)
    try:
        if hasattr(executor, "aexecute_query"):
            rows = await executor.aexecute_query(sql)
        else:
            rows = await asyncio.to_thread(executor.execute_query, sql)
        end = datetime.now(timezone.utc)
        duration_ms = int((end - start).total_seconds() * 1000)

        failed_count = 0
        total_count = 0
        if rows:
            row = rows[0]
            if "failed_count" in row:
                failed_count = int(row["failed_count"] or 0)
            if "total_count" in row:
                total_count = int(row["total_count"] or 0)
            elif "current_row_count" in row:
                total_count = int(row["current_row_count"] or 0)

        if total_count == 0:
            if hasattr(executor, "aget_table_row_count"):
                total_count = await executor.aget_table_row_count(
                    asset.sf_database_name or "", asset.sf_schema_name, asset.sf_table_name
                )
            else:
                total_count = await asyncio.to_thread(
                    executor.get_table_row_count,
                    asset.sf_database_name or "", asset.sf_schema_name, asset.sf_table_name
                )

        passed_count = max(0, total_count - failed_count)
        failure_pct = (failed_count / total_count * 100) if total_count > 0 else 0.0
        quality_score = calculate_rule_quality_score(total_count, failed_count)
        status = "passed" if failed_count == 0 else "failed"

        # Build human-readable issue list
        issues: list[str] = []
        if failed_count > 0:
            pct_str = f"{failure_pct:.1f}%"
            col_part = f" on column '{req.target_column}'" if req.target_column else ""
            issues.append(
                f"{failed_count:,} of {total_count:,} rows ({pct_str}) failed the "
                f"{req.rule_type.replace('_', ' ')}{col_part}."
            )
            if quality_score < 75:
                issues.append("Quality score is critically low — investigate before activating this rule.")
            elif quality_score < 90:
                issues.append("Quality score is below the recommended 90% threshold.")
        else:
            issues.append(f"All {total_count:,} rows passed the check.")

        # Fetch up to 5 sample failing rows (best-effort)
        sample_rows: list[dict] = []
        if failed_count > 0:
            try:
                sample_sql = sql_generator.generate_sample(
                    req.rule_type, config, table_ref, req.target_column
                )
                if sample_sql:
                    if hasattr(executor, "aexecute_query"):
                        raw = await executor.aexecute_query(sample_sql)
                    else:
                        raw = await asyncio.to_thread(executor.execute_query, sample_sql)
                    sample_rows = [dict(r) for r in (raw or [])]
            except Exception:
                pass

        return {
            "status": status,
            "quality_score": quality_score,
            "total_rows_scanned": total_count,
            "failed_rows_count": failed_count,
            "passed_rows_count": passed_count,
            "failure_percentage": round(failure_pct, 4),
            "executed_sql": sql,
            "duration_ms": duration_ms,
            "issues": issues,
            "sample_rows": sample_rows,
        }

    except Exception as e:
        end = datetime.now(timezone.utc)
        duration_ms = int((end - start).total_seconds() * 1000)
        return {
            "status": "error",
            "quality_score": None,
            "total_rows_scanned": None,
            "failed_rows_count": None,
            "passed_rows_count": None,
            "failure_percentage": None,
            "executed_sql": sql,
            "duration_ms": duration_ms,
            "issues": [f"Execution error: {e}"],
        }


# ── Sync execution (returns result immediately) ───────────────────────────────

@router.post("/execute/rule/{rule_id}/sync")
async def run_rule_sync(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Execute a single rule synchronously and return the run result."""
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    check_domain_access(user, rule.domain_id)
    run = await execute_rule(rule_id, db, user_email=user.get("email", "ui"))
    return _enrich_run(run, rule_name=rule.rule_name, rule_description=rule.rule_description,
                       rule_type=rule.rule_type, severity=rule.severity)


@router.post("/execute/table/{asset_id}/sync")
async def run_table_rules_sync(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Execute all active rules for a table and return all run results."""
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    runs = await execute_asset_rules(asset_id, db)
    return {"runs_created": len(runs), "run_ids": [r.run_id for r in runs],
            "statuses": {r.run_id: r.status for r in runs}}


@router.post("/execute/subdomain/{subdomain_id}/sync")
async def run_subdomain_rules_sync(
    subdomain_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    sub = (await db.execute(select(Subdomain).where(Subdomain.subdomain_id == subdomain_id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subdomain not found")
    check_domain_access(user, sub.domain_id)
    result = await db.execute(
        select(DQRule).where(DQRule.subdomain_id == subdomain_id, DQRule.is_active == True)
    )
    rules = result.scalars().all()
    runs = []
    for rule in rules:
        run = await execute_rule(rule.rule_id, db)
        runs.append(run)
    return {"runs_created": len(runs), "run_ids": [r.run_id for r in runs]}


@router.post("/execute/domain/{domain_id}/sync")
async def run_domain_rules_sync(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    check_domain_access(user, domain_id)
    result = await db.execute(
        select(DQRule).where(DQRule.domain_id == domain_id, DQRule.is_active == True)
    )
    rules = result.scalars().all()
    runs = []
    for rule in rules:
        run = await execute_rule(rule.rule_id, db)
        runs.append(run)
    return {"runs_created": len(runs), "run_ids": [r.run_id for r in runs]}


# ── Async / background execution (kept for scheduler) ────────────────────────

@router.post("/execute/rule/{rule_id}")
async def run_rule_async(
    rule_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    check_domain_access(user, rule.domain_id)
    background_tasks.add_task(_bg_execute_rule, rule_id)
    return {"message": "Rule execution queued", "rule_id": rule_id}


@router.post("/execute/table/{asset_id}")
async def run_table_rules_async(
    asset_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    background_tasks.add_task(_bg_execute_asset, asset_id)
    return {"message": "Table rules queued", "asset_id": asset_id}


@router.post("/execute/domain/{domain_id}")
async def run_domain_rules_async(
    domain_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    check_domain_access(user, domain_id)
    result = await db.execute(select(DQRule).where(DQRule.domain_id == domain_id, DQRule.is_active == True))
    rules = result.scalars().all()
    for rule in rules:
        background_tasks.add_task(_bg_execute_rule, rule.rule_id)
    return {"message": f"{len(rules)} rules queued", "domain_id": domain_id}


async def _bg_execute_rule(rule_id: str):
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await execute_rule(rule_id, db)


async def _bg_execute_asset(asset_id: str):
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await execute_asset_rules(asset_id, db)


# ── Enriched runs list ────────────────────────────────────────────────────────

def _enrich_run(run: DQRuleRun, **extra) -> dict:
    duration_ms = None
    if run.execution_start_time and run.execution_end_time:
        duration_ms = int((run.execution_end_time - run.execution_start_time).total_seconds() * 1000)
    return {
        "run_id": run.run_id,
        "rule_id": run.rule_id,
        "asset_id": run.asset_id,
        "domain_id": run.domain_id,
        "subdomain_id": run.subdomain_id,
        "status": run.status,
        "total_rows_scanned": run.total_rows_scanned,
        "failed_rows_count": run.failed_rows_count,
        "passed_rows_count": run.passed_rows_count,
        "failure_percentage": run.failure_percentage,
        "quality_score": run.quality_score,
        "error_message": run.error_message,
        "executed_sql": run.executed_sql,
        "ai_explanation": run.ai_explanation,
        "execution_start_time": run.execution_start_time.isoformat() if run.execution_start_time else None,
        "execution_end_time": run.execution_end_time.isoformat() if run.execution_end_time else None,
        "duration_ms": duration_ms,
        "created_at": run.created_at.isoformat(),
        **extra,
    }


@router.get("/runs/enriched")
async def list_runs_enriched(
    rule_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from datetime import timedelta
    q = (
        select(DQRuleRun, DQRule, DataAsset, Domain, Subdomain)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
        .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
        .join(Subdomain, DQRuleRun.subdomain_id == Subdomain.subdomain_id)
    )
    from app.core.security import get_domain_filter
    effective_domain = get_domain_filter(user) or domain_id
    if effective_domain:
        q = q.where(DQRuleRun.domain_id == effective_domain)
    if rule_id:
        q = q.where(DQRuleRun.rule_id == rule_id)
    if asset_id:
        q = q.where(DQRuleRun.asset_id == asset_id)
    if subdomain_id:
        q = q.where(DQRuleRun.subdomain_id == subdomain_id)
    if status:
        q = q.where(DQRuleRun.status == status)
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            q = q.where(DQRuleRun.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            q = q.where(DQRuleRun.created_at < dt_to)
        except ValueError:
            pass
    q = q.order_by(desc(DQRuleRun.created_at)).limit(limit)
    result = await db.execute(q)
    rows = result.all()
    return [
        _enrich_run(
            run,
            rule_name=rule.rule_name,
            rule_description=rule.rule_description,
            rule_type=rule.rule_type,
            severity=rule.severity,
            sf_database_name=asset.sf_database_name,
            sf_schema_name=asset.sf_schema_name,
            sf_table_name=asset.sf_table_name,
            domain_name=domain.domain_name,
            subdomain_name=subdomain.subdomain_name,
        )
        for run, rule, asset, domain, subdomain in rows
    ]


# ── Individual run endpoints ──────────────────────────────────────────────────

@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    rule_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from app.core.security import get_domain_filter
    q = select(DQRuleRun)
    effective_domain = get_domain_filter(user) or domain_id
    if effective_domain:
        q = q.where(DQRuleRun.domain_id == effective_domain)
    if rule_id:
        q = q.where(DQRuleRun.rule_id == rule_id)
    if asset_id:
        q = q.where(DQRuleRun.asset_id == asset_id)
    if status:
        q = q.where(DQRuleRun.status == status)
    result = await db.execute(q.order_by(desc(DQRuleRun.created_at)).limit(limit))
    return result.scalars().all()


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}/samples", response_model=list[RunSampleResponse])
async def get_run_samples(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DQRuleRunSample).where(DQRuleRunSample.run_id == run_id))
    return result.scalars().all()
