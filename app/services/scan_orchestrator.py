from __future__ import annotations

"""
Scan Orchestration Service.

Manages scan job run lifecycle: queued → running → succeeded/partial_success/failed/timed_out/cancelled.
Calls existing connector and discovery services; does not embed their logic.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import desc, select

from app.db.database import AsyncSessionLocal
from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog
from app.services import results_store
from app.services import job_tracker as _jt
from app.services.discovery_service import run_discovery
from app.services import profiling_service

logger = logging.getLogger("dq_platform.scan_orchestrator")


# ─── Public: run creation ─────────────────────────────────────────────────────

async def create_run(
    job_id: str,
    trigger_type: str,
    triggered_by: Optional[str],
    idempotency_key: Optional[str],
    parameters_override: Optional[dict],
    db,
) -> tuple[str, bool]:
    """Create a queued ScanJobRun record. Returns (run_id, is_new).

    is_new is False when an idempotency key matched a live run — caller should
    not enqueue a second executor in that case.
    """
    job = await db.get(ScanJob, job_id)
    if not job:
        raise ValueError(f"Scan job {job_id} not found")
    if not job.is_active:
        raise ValueError(f"Scan job {job_id} is inactive")

    if idempotency_key:
        existing = await _find_run_by_idempotency_key(job_id, idempotency_key, db)
        if existing and existing.status not in ("failed", "cancelled", "timed_out"):
            return existing.run_id, False

    merged = {**(job.parameters or {}), **(parameters_override or {})}

    run = ScanJobRun(
        job_id=job_id,
        status="queued",
        trigger_type=trigger_type,
        triggered_by=triggered_by,
        attempt=1,
        idempotency_key=idempotency_key,
        parameters=merged or None,
    )
    db.add(run)
    await db.commit()
    return run.run_id, True


async def create_run_for_scheduler(job_id: str, db) -> str:
    """Create a queued run for scheduled (APScheduler) execution."""
    job = await db.get(ScanJob, job_id)
    if not job:
        raise ValueError(f"Scan job {job_id} not found")
    run = ScanJobRun(
        job_id=job_id,
        status="queued",
        trigger_type="scheduled",
        triggered_by="scheduler",
        attempt=1,
        parameters=job.parameters,
    )
    db.add(run)
    await db.commit()
    return run.run_id


# ─── Public: execution ────────────────────────────────────────────────────────

async def execute_run_with_retries(run_id: str) -> None:
    """Background task: execute a run and retry on failure up to job.max_retries times."""
    success = await _execute_run(run_id)
    if success:
        return

    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if not run:
            return
        if run.status == "cancelled":
            return
        job = await db.get(ScanJob, run.job_id)
        if not job:
            return
        max_retries = job.max_retries
        attempt = run.attempt
        job_id = run.job_id
        trigger_type = run.trigger_type
        triggered_by = run.triggered_by
        idempotency_key = run.idempotency_key
        parameters = run.parameters

    while not success and attempt < max_retries + 1:
        backoff = min(2 ** attempt, 30)
        await asyncio.sleep(backoff)
        attempt += 1

        async with AsyncSessionLocal() as db:
            retry_run = ScanJobRun(
                job_id=job_id,
                status="queued",
                trigger_type=trigger_type,
                triggered_by=triggered_by,
                attempt=attempt,
                idempotency_key=idempotency_key,
                parameters=parameters,
            )
            db.add(retry_run)
            await db.commit()
            run_id = retry_run.run_id

        success = await _execute_run(run_id)


async def cleanup_stale_runs(stale_minutes: int = 30) -> int:
    """Mark runs stuck in queued/running for >stale_minutes as timed_out.

    Runs on startup to recover from server restarts that orphaned in-flight jobs.
    Returns the number of runs cleaned up.
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=stale_minutes)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScanJobRun).where(
                ScanJobRun.status.in_(["queued", "running"]),
                ScanJobRun.created_at < cutoff,
            )
        )
        runs = result.scalars().all()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for run in runs:
            run.status = "timed_out"
            run.ended_at = now
            run.error_message = (
                f"Timed out: exceeded {stale_minutes}-minute safety limit "
                "(server may have restarted while this run was in progress)"
            )
            job = await db.get(ScanJob, run.job_id)
            if job and job.last_run_status in ("queued", "running"):
                job.last_run_status = "timed_out"
                job.last_run_at = now
        await db.commit()
        return len(runs)


async def append_log(
    run_id: str, level: str, message: str, context: Optional[dict] = None
) -> None:
    """Append a structured log entry for a run. Opens its own DB session."""
    async with AsyncSessionLocal() as db:
        entry = ScanJobRunLog(
            run_id=run_id,
            level=level,
            message=message[:5000],
            context=context,
        )
        db.add(entry)
        await db.commit()


# ─── Internal: run execution ──────────────────────────────────────────────────

async def _execute_run(run_id: str) -> bool:
    """Execute one run attempt. Returns True if the outcome is succeeded or partial_success."""
    job_id: str = ""
    job_type: str = ""
    connection_id: Optional[str] = None
    timeout_seconds: int = 300
    params: dict = {}

    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if not run or run.status != "queued":
            return False
        job = await db.get(ScanJob, run.job_id)
        if not job:
            return False

        job_id = job.job_id
        job_type = job.job_type
        connection_id = job.connection_id
        timeout_seconds = job.timeout_seconds
        params = run.parameters or {}

        run.status = "running"
        run.started_at = _now()
        await db.commit()

    start = time.monotonic()
    metrics: dict = {}
    error_msg: Optional[str] = None
    final_status = "failed"

    try:
        metrics = await asyncio.wait_for(
            _dispatch_handler(job_type, job_id, run_id, connection_id, params),
            timeout=float(timeout_seconds),
        )
        errors = metrics.get("errors_count", 0)
        assets = metrics.get("assets_scanned", 0)
        if errors == 0:
            final_status = "succeeded"
        elif assets > 0 and errors < assets:
            final_status = "partial_success"
        else:
            final_status = "failed"

    except asyncio.TimeoutError:
        final_status = "timed_out"
        error_msg = f"Timed out after {timeout_seconds}s"
    except Exception as exc:
        final_status = "failed"
        error_msg = str(exc)[:2000]
        logger.exception("Scan run %s failed: %s", run_id, exc)

    duration = time.monotonic() - start
    ended = _now()

    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if run and run.status == "running":
            run.status = final_status
            run.ended_at = ended
            run.duration_seconds = round(duration, 3)
            run.assets_scanned = metrics.get("assets_scanned", 0)
            run.errors_count = metrics.get("errors_count", 0)
            run.warnings_count = metrics.get("warnings_count", 0)
            run.error_message = error_msg or metrics.get("error_message")
            run.result_summary = metrics.get("result_summary") or None

            job = await db.get(ScanJob, job_id)
            if job:
                job.last_run_at = ended
                job.last_run_status = final_status

        await db.commit()
        await results_store.write_run_summary(db, run_id)

    return final_status in ("succeeded", "partial_success")


# ─── Internal: dispatch + handlers ───────────────────────────────────────────

async def _dispatch_handler(
    job_type: str,
    job_id: str,
    run_id: str,
    connection_id: Optional[str],
    params: dict,
) -> dict:
    if job_type == "connection_test":
        return await _run_connection_test(connection_id, run_id)
    if job_type == "metadata_discovery":
        return await _run_metadata_discovery(connection_id, run_id, params)
    if job_type == "asset_refresh":
        return await _run_asset_refresh(connection_id, run_id, params)
    if job_type == "source_health_check":
        return await _run_source_health_check(connection_id, run_id)
    if job_type in ("profile_scan", "profile_scan_placeholder"):
        return await _run_profile_scan(connection_id, run_id, params)
    if job_type == "rule_scan_placeholder":
        return await _run_placeholder(job_type, run_id)
    raise ValueError(f"Unknown job_type: {job_type}")


async def _run_connection_test(connection_id: Optional[str], run_id: str) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for connection_test")

    from app.db.models import SnowflakeConnection

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn = result.scalar_one_or_none()
    if not conn:
        raise ValueError(f"Connection {connection_id} not found")

    await append_log(run_id, "INFO", f"Testing connection: {conn.connection_name}")
    ok, error = await asyncio.to_thread(_test_connection_sync, conn)
    await append_log(run_id, "INFO" if ok else "ERROR", f"Connection test: {'ok' if ok else error}")
    return {
        "assets_scanned": 0,
        "errors_count": 0 if ok else 1,
        "warnings_count": 0,
        "result_summary": {"connection_ok": ok, "error": error, "connection_name": conn.connection_name},
    }


def _test_connection_sync(conn) -> tuple[bool, Optional[str]]:
    from app.api.connections import _open_connector
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SELECT 1")
        cur.close()
        sf.close()
        return True, None
    except Exception as exc:
        return False, str(exc)[:500]


async def _run_source_health_check(connection_id: Optional[str], run_id: str) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for source_health_check")

    from app.db.models import SnowflakeConnection

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn = result.scalar_one_or_none()
    if not conn:
        raise ValueError(f"Connection {connection_id} not found")

    await append_log(run_id, "INFO", f"Health check for: {conn.connection_name}")
    health = await asyncio.to_thread(_health_check_sync, conn)
    is_ok = health.get("status") == "ok"
    await append_log(run_id, "INFO" if is_ok else "WARNING", f"Health status: {health.get('status')}")
    return {
        "assets_scanned": 0,
        "errors_count": 0 if is_ok else 1,
        "warnings_count": 0,
        "result_summary": health,
    }


def _health_check_sync(conn) -> dict:
    from app.api.connections import _open_connector
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SELECT CURRENT_TIMESTAMP()")
        ts = cur.fetchone()
        cur.close()
        sf.close()
        return {"status": "ok", "checked_at": str(ts[0]) if ts else None}
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:500]}


async def _run_metadata_discovery(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for metadata_discovery")

    await append_log(run_id, "INFO", "Starting metadata discovery")
    tmp_job_id = _jt.create_job("metadata_discovery", total=0, meta={"scan_run_id": run_id})

    payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", "scan_run_id": run_id, **params}
    await run_discovery(tmp_job_id, payload)

    jt_job = _jt.get_job(tmp_job_id)
    completed = jt_job.get("completed", 0) if jt_job else 0
    failed = jt_job.get("failed", 0) if jt_job else 0

    results = jt_job.get("results", []) if jt_job else []
    new_assets = sum(1 for r in results if r.get("status") == "imported")
    # "skipped" means already-in-catalog — discovery still refreshed its metadata
    updated_assets = sum(1 for r in results if r.get("status") == "skipped")
    errors = [
        f"{r.get('database')}.{r.get('schema')}.{r.get('table_name')}: {r.get('reason')}"
        for r in results if r.get("status") == "error"
    ]

    await append_log(
        run_id, "INFO",
        f"Discovery done: {completed} succeeded, {failed} failed, "
        f"{new_assets} new, {updated_assets} updated",
    )
    return {
        "assets_scanned": completed,
        "errors_count": failed,
        "warnings_count": 0,
        "error_message": "; ".join(errors)[:2000] if errors else None,
        "result_summary": {
            "tables_scanned": completed,
            "tables_failed": failed,
            "tables_total": jt_job.get("total", 0) if jt_job else 0,
            "new_assets": new_assets,
            "updated_assets": updated_assets,
            "removed_assets": 0,
        },
    }


async def _run_asset_refresh(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    await append_log(run_id, "INFO", "Starting asset refresh (delegates to metadata discovery)")
    return await _run_metadata_discovery(connection_id, run_id, params)


async def _run_placeholder(job_type: str, run_id: str) -> dict:
    msg = f"{job_type} is a placeholder — implementation pending"
    await append_log(run_id, "WARNING", msg)
    return {
        "assets_scanned": 0,
        "errors_count": 0,
        "warnings_count": 1,
        "result_summary": {"note": msg},
    }


async def _run_profile_scan(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for profile_scan")

    await append_log(run_id, "INFO", "Starting profile scan")
    try:
        metrics = await profiling_service.profile_all_assets(
            connection_id=connection_id,
            run_id=run_id,
        )
    except Exception as exc:
        await append_log(run_id, "ERROR", f"Profile scan failed: {str(exc)[:500]}")
        raise

    profiled = metrics.get("assets_profiled", 0)
    failed = metrics.get("assets_failed", 0)
    errors = metrics.get("errors", [])
    await append_log(
        run_id, "INFO",
        f"Profile scan complete: {profiled} profiled, {failed} failed",
    )
    return {
        "assets_scanned": profiled,
        "errors_count": failed,
        "warnings_count": 0,
        "error_message": "; ".join(errors)[:2000] if errors else None,
        "result_summary": {
            "tables_profiled": profiled,
            "tables_failed": failed,
        },
    }


async def _find_run_by_idempotency_key(job_id: str, key: str, db) -> Optional[ScanJobRun]:
    result = await db.execute(
        select(ScanJobRun)
        .where(ScanJobRun.job_id == job_id, ScanJobRun.idempotency_key == key)
        .order_by(desc(ScanJobRun.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
