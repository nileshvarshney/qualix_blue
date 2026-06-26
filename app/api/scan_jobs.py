from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, select

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog, SnowflakeConnection
from app.schemas.scan_job import ScanJobCreate, ScanJobUpdate, TriggerRequest
from app.services import scan_orchestrator

router = APIRouter(prefix="/scan-jobs", tags=["Scan Orchestration"])


# ─── Job CRUD ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_scan_job(
    req: ScanJobCreate,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = ScanJob(
        connection_id=req.connection_id,
        job_name=req.job_name,
        job_type=req.job_type,
        schedule_frequency=req.schedule_frequency,
        cron_expr=req.cron_expr,
        timezone=req.timezone,
        max_retries=req.max_retries,
        timeout_seconds=req.timeout_seconds,
        parameters=req.parameters,
        created_by=user.get("user_id"),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    if job.schedule_frequency != "on_demand":
        from app.services.scheduler_service import schedule_scan_job
        schedule_scan_job(job)

    conn = await db.get(SnowflakeConnection, job.connection_id) if job.connection_id else None
    return _job_dict(job, connection_name=conn.connection_name if conn else None)


@router.get("")
async def list_scan_jobs(
    job_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    connection_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = select(ScanJob)
    if job_type:
        q = q.where(ScanJob.job_type == job_type)
    if is_active is not None:
        q = q.where(ScanJob.is_active == is_active)
    if connection_id:
        q = q.where(ScanJob.connection_id == connection_id)
    q = q.order_by(desc(ScanJob.created_at))
    jobs = (await db.execute(q)).scalars().all()

    failed_ids = [j.job_id for j in jobs if j.last_run_status in ("failed", "partial_success", "timed_out")]
    error_by_job: dict[str, str] = {}
    if failed_ids:
        runs_q = (
            select(ScanJobRun)
            .where(ScanJobRun.job_id.in_(failed_ids))
            .where(ScanJobRun.error_message.isnot(None))
            .order_by(desc(ScanJobRun.created_at))
        )
        for run in (await db.execute(runs_q)).scalars().all():
            error_by_job.setdefault(run.job_id, run.error_message)

    conn_ids = {j.connection_id for j in jobs if j.connection_id}
    conn_name_by_id: dict[str, str] = {}
    if conn_ids:
        conns_q = select(SnowflakeConnection).where(SnowflakeConnection.connection_id.in_(conn_ids))
        for conn in (await db.execute(conns_q)).scalars().all():
            conn_name_by_id[conn.connection_id] = conn.connection_name

    return [
        _job_dict(
            j,
            last_run_error_message=error_by_job.get(j.job_id),
            connection_name=conn_name_by_id.get(j.connection_id) if j.connection_id else None,
        )
        for j in jobs
    ]


@router.get("/runs")
async def list_all_runs(
    status: Optional[str] = Query(None),
    connection_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = (
        select(ScanJobRun, ScanJob, SnowflakeConnection)
        .join(ScanJob, ScanJobRun.job_id == ScanJob.job_id)
        .outerjoin(SnowflakeConnection, ScanJob.connection_id == SnowflakeConnection.connection_id)
    )
    if connection_id:
        q = q.where(ScanJob.connection_id == connection_id)
    if status:
        q = q.where(ScanJobRun.status == status)
    if start_date:
        q = q.where(ScanJobRun.created_at >= start_date)
    if end_date:
        q = q.where(ScanJobRun.created_at < end_date)
    q = q.order_by(desc(ScanJobRun.created_at)).limit(limit)
    rows = (await db.execute(q)).all()
    return [
        _run_dict(run, job_name=job.job_name, connection_name=conn.connection_name if conn else None)
        for run, job, conn in rows
    ]


@router.get("/{job_id}")
async def get_scan_job(
    job_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    conn = await db.get(SnowflakeConnection, job.connection_id) if job.connection_id else None
    return _job_dict(job, connection_name=conn.connection_name if conn else None)


@router.patch("/{job_id}")
async def update_scan_job(
    job_id: str,
    req: ScanJobUpdate,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from app.services.scheduler_service import schedule_scan_job, unschedule_scan_job
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    await db.commit()
    await db.refresh(job)

    unschedule_scan_job(job_id)
    if job.is_active and job.schedule_frequency != "on_demand":
        schedule_scan_job(job)

    conn = await db.get(SnowflakeConnection, job.connection_id) if job.connection_id else None
    return _job_dict(job, connection_name=conn.connection_name if conn else None)


@router.delete("/{job_id}", status_code=204)
async def delete_scan_job(
    job_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from app.services.scheduler_service import unschedule_scan_job
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    unschedule_scan_job(job_id)
    await db.delete(job)
    await db.commit()


# ─── Trigger + Run management ─────────────────────────────────────────────────

@router.post("/{job_id}/trigger", status_code=202)
async def trigger_scan_job(
    job_id: str,
    req: TriggerRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    if not job.is_active:
        raise HTTPException(409, "Scan job is inactive")

    run_id, is_new = await scan_orchestrator.create_run(
        job_id=job_id,
        trigger_type="manual",
        triggered_by=user.get("email") or user.get("user_id"),
        idempotency_key=req.idempotency_key,
        parameters_override=req.parameters_override,
        db=db,
    )
    if is_new:
        background_tasks.add_task(scan_orchestrator.execute_run_with_retries, run_id)
    return {"job_id": job_id, "run_id": run_id, "status": "queued"}


@router.get("/{job_id}/runs")
async def list_runs(
    job_id: str,
    limit: int = Query(50, ge=1, le=500),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    q = (
        select(ScanJobRun)
        .where(ScanJobRun.job_id == job_id)
        .order_by(desc(ScanJobRun.created_at))
        .limit(limit)
    )
    runs = (await db.execute(q)).scalars().all()
    return [_run_dict(r, job_name=job.job_name) for r in runs]


@router.get("/{job_id}/runs/{run_id}")
async def get_run(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    job = await db.get(ScanJob, job_id)
    return _run_dict(run, job_name=job.job_name if job else None)


@router.get("/{job_id}/runs/{run_id}/logs")
async def get_run_logs(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    q = (
        select(ScanJobRunLog)
        .where(ScanJobRunLog.run_id == run_id)
        .order_by(ScanJobRunLog.logged_at)
    )
    logs = (await db.execute(q)).scalars().all()
    return [_log_dict(lg) for lg in logs]


@router.post("/{job_id}/runs/{run_id}/cancel", status_code=202)
async def cancel_run(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    if run.status not in ("queued", "running"):
        raise HTTPException(409, f"Cannot cancel run with status '{run.status}'")
    run.status = "cancelled"
    run.ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"run_id": run_id, "status": "cancelled"}


@router.post("/{job_id}/cancel-latest", status_code=202)
async def cancel_latest_run(
    job_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Cancel the most recent queued or running run for a job (no run_id required)."""
    result = await db.execute(
        select(ScanJobRun)
        .where(ScanJobRun.job_id == job_id, ScanJobRun.status.in_(["queued", "running"]))
        .order_by(desc(ScanJobRun.created_at))
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "No active run found for this job")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    run.status = "cancelled"
    run.ended_at = now
    job = await db.get(ScanJob, job_id)
    if job and job.last_run_status in ("queued", "running"):
        job.last_run_status = "cancelled"
        job.last_run_at = now
    await db.commit()
    return {"run_id": run.run_id, "status": "cancelled"}


# ─── Serializers ──────────────────────────────────────────────────────────────

def _job_dict(
    job: ScanJob,
    last_run_error_message: Optional[str] = None,
    connection_name: Optional[str] = None,
) -> dict:
    return {
        "job_id": job.job_id,
        "connection_id": job.connection_id,
        "connection_name": connection_name,
        "job_name": job.job_name,
        "job_type": job.job_type,
        "is_active": job.is_active,
        "schedule_frequency": job.schedule_frequency,
        "cron_expr": job.cron_expr,
        "timezone": job.timezone,
        "max_retries": job.max_retries,
        "timeout_seconds": job.timeout_seconds,
        "parameters": job.parameters,
        "last_run_at": job.last_run_at.isoformat() if job.last_run_at else None,
        "last_run_status": job.last_run_status,
        "last_run_error_message": last_run_error_message,
        "created_by": job.created_by,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


def _run_dict(run: ScanJobRun, job_name: Optional[str] = None, connection_name: Optional[str] = None) -> dict:
    return {
        "run_id": run.run_id,
        "job_id": run.job_id,
        "job_name": job_name,
        "connection_name": connection_name,
        "status": run.status,
        "trigger_type": run.trigger_type,
        "triggered_by": run.triggered_by,
        "attempt": run.attempt,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "duration_seconds": run.duration_seconds,
        "assets_scanned": run.assets_scanned,
        "errors_count": run.errors_count,
        "warnings_count": run.warnings_count,
        "error_message": run.error_message,
        "result_summary": run.result_summary,
        "idempotency_key": run.idempotency_key,
        "created_at": run.created_at.isoformat(),
    }


def _log_dict(lg: ScanJobRunLog) -> dict:
    return {
        "log_id": lg.log_id,
        "run_id": lg.run_id,
        "level": lg.level,
        "message": lg.message,
        "context": lg.context,
        "logged_at": lg.logged_at.isoformat(),
    }
