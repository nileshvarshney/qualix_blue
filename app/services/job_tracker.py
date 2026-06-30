from __future__ import annotations
"""
Lightweight in-memory job tracker for long-running bulk operations.

Each job has a unique ID, status, and progress counters.  The frontend
can poll GET /jobs/{job_id} until status is 'completed' or 'failed'.

For single-process deployments this is sufficient.  For multi-replica
production deployments, replace the _JOBS dict with a Redis-backed store.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

logger = logging.getLogger("dq_platform.jobs")

JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]

# Module-level registry — survives for the lifetime of the process
_JOBS: dict[str, dict] = {}
# Max age in seconds before completed/failed jobs are pruned (1 hour)
_MAX_AGE_SECONDS = 3600
# Hard cap: never hold more than this many jobs in memory regardless of age
_MAX_JOBS = 500


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def create_job(job_type: str, total: int, meta: Optional[dict] = None) -> str:
    job_id = str(uuid.uuid4())
    _JOBS[job_id] = {
        "job_id": job_id,
        "job_type": job_type,
        "status": "queued",
        "total": total,
        "completed": 0,
        "failed": 0,
        "results": [],
        "error": None,
        "meta": meta or {},
        "created_at": _now(),
        "started_at": None,
        "finished_at": None,
    }
    _prune_old_jobs()
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    return _JOBS.get(job_id)


def update_job(job_id: str, **kwargs) -> None:
    if job_id in _JOBS:
        _JOBS[job_id].update(kwargs)


def mark_running(job_id: str) -> None:
    update_job(job_id, status="running", started_at=_now())


def mark_completed(job_id: str) -> None:
    update_job(job_id, status="completed", finished_at=_now())


def mark_failed(job_id: str, error: str) -> None:
    update_job(job_id, status="failed", error=error, finished_at=_now())


def append_result(job_id: str, result: dict, success: bool) -> None:
    if job_id not in _JOBS:
        return
    _JOBS[job_id]["results"].append(result)
    if success:
        _JOBS[job_id]["completed"] += 1
    else:
        _JOBS[job_id]["failed"] += 1


def _prune_old_jobs() -> None:
    """Remove completed/failed jobs older than _MAX_AGE_SECONDS, then cap at _MAX_JOBS."""
    to_delete = []
    for jid, job in _JOBS.items():
        if job["status"] in ("completed", "failed") and job.get("finished_at"):
            try:
                age = (datetime.now(timezone.utc).replace(tzinfo=None) -
                       datetime.fromisoformat(job["finished_at"])).total_seconds()
                if age > _MAX_AGE_SECONDS:
                    to_delete.append(jid)
            except Exception:
                pass
    for jid in to_delete:
        del _JOBS[jid]

    # Hard cap: evict oldest finished jobs first if over limit
    if len(_JOBS) > _MAX_JOBS:
        finished = sorted(
            ((jid, job) for jid, job in _JOBS.items() if job["status"] in ("completed", "failed")),
            key=lambda x: x[1].get("finished_at") or "",
        )
        for jid, _ in finished[:len(_JOBS) - _MAX_JOBS]:
            del _JOBS[jid]
