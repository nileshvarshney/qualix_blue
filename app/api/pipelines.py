from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Pipeline, PipelineStep, PipelineRun, PipelineStepRun
from app.core.security import get_current_user

router = APIRouter(prefix="/pipelines", tags=["Pipeline Orchestration"])

VALID_TRIGGER_TYPES = {"manual", "schedule", "event"}
VALID_STEP_TYPES = {
    "scan_job", "dbt_run", "fivetran_sync", "airbyte_sync",
    "custom_sql", "webhook", "wait",
}


def _fmt_step(s: PipelineStep) -> dict:
    return {
        "step_id": s.step_id,
        "pipeline_id": s.pipeline_id,
        "name": s.name,
        "step_order": s.step_order,
        "step_type": s.step_type,
        "step_config": s.step_config,
        "depends_on": s.depends_on or [],
        "timeout_seconds": s.timeout_seconds,
        "max_retries": s.max_retries,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _fmt_step_run(sr: PipelineStepRun) -> dict:
    return {
        "step_run_id": sr.step_run_id,
        "run_id": sr.run_id,
        "step_id": sr.step_id,
        "step_name": sr.step_name,
        "status": sr.status,
        "attempt": sr.attempt,
        "started_at": sr.started_at.isoformat() if sr.started_at else None,
        "finished_at": sr.finished_at.isoformat() if sr.finished_at else None,
        "error_message": sr.error_message,
        "output_summary": sr.output_summary,
        "created_at": sr.created_at.isoformat() if sr.created_at else None,
    }


def _fmt_run(r: PipelineRun, include_steps: bool = False) -> dict:
    out: dict[str, Any] = {
        "run_id": r.run_id,
        "pipeline_id": r.pipeline_id,
        "status": r.status,
        "triggered_by": r.triggered_by,
        "trigger_type": r.trigger_type,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    if include_steps:
        out["step_runs"] = [_fmt_step_run(sr) for sr in (r.step_runs or [])]
    return out


def _fmt_pipeline(p: Pipeline, include_steps: bool = False) -> dict:
    out: dict[str, Any] = {
        "pipeline_id": p.pipeline_id,
        "name": p.name,
        "description": p.description,
        "trigger_type": p.trigger_type,
        "cron_expr": p.cron_expr,
        "trigger_config": p.trigger_config,
        "connection_ids": p.connection_ids or [],
        "is_active": p.is_active,
        "timeout_seconds": p.timeout_seconds,
        "max_retries": p.max_retries,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "step_count": len(p.steps) if p.steps is not None else 0,
    }
    if include_steps:
        out["steps"] = [_fmt_step(s) for s in (p.steps or [])]
    return out


@router.get("")
async def list_pipelines(
    is_active: bool | None = None,
    connection_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(Pipeline)
    if is_active is not None:
        q = q.where(Pipeline.is_active == is_active)
    q = q.order_by(Pipeline.created_at.desc())
    result = await db.execute(q)
    pipelines = result.scalars().all()
    if connection_id:
        pipelines = [p for p in pipelines if connection_id in (p.connection_ids or [])]
    return [_fmt_pipeline(p) for p in pipelines]


@router.post("", status_code=201)
async def create_pipeline(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    trigger_type = body.get("trigger_type", "manual")
    if trigger_type not in VALID_TRIGGER_TYPES:
        raise HTTPException(422, f"trigger_type must be one of {sorted(VALID_TRIGGER_TYPES)}")

    pipeline = Pipeline(
        name=name,
        description=body.get("description"),
        trigger_type=trigger_type,
        cron_expr=body.get("cron_expr"),
        trigger_config=body.get("trigger_config"),
        connection_ids=body.get("connection_ids"),
        is_active=body.get("is_active", True),
        timeout_seconds=int(body.get("timeout_seconds", 3600)),
        max_retries=int(body.get("max_retries", 0)),
        created_by=user.email if user else None,
    )
    db.add(pipeline)
    await db.flush()
    await db.refresh(pipeline)
    return _fmt_pipeline(pipeline, include_steps=True)


@router.get("/{pipeline_id}")
async def get_pipeline(
    pipeline_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Pipeline).where(Pipeline.pipeline_id == pipeline_id))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    return _fmt_pipeline(pipeline, include_steps=True)


@router.put("/{pipeline_id}")
async def update_pipeline(
    pipeline_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Pipeline).where(Pipeline.pipeline_id == pipeline_id))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            raise HTTPException(422, "name cannot be empty")
        pipeline.name = name
    if "description" in body:
        pipeline.description = body["description"]
    if "trigger_type" in body:
        if body["trigger_type"] not in VALID_TRIGGER_TYPES:
            raise HTTPException(422, f"trigger_type must be one of {sorted(VALID_TRIGGER_TYPES)}")
        pipeline.trigger_type = body["trigger_type"]
    if "cron_expr" in body:
        pipeline.cron_expr = body["cron_expr"]
    if "trigger_config" in body:
        pipeline.trigger_config = body["trigger_config"]
    if "connection_ids" in body:
        pipeline.connection_ids = body["connection_ids"]
    if "is_active" in body:
        pipeline.is_active = bool(body["is_active"])
    if "timeout_seconds" in body:
        pipeline.timeout_seconds = int(body["timeout_seconds"])
    if "max_retries" in body:
        pipeline.max_retries = int(body["max_retries"])

    await db.flush()
    await db.refresh(pipeline)
    return _fmt_pipeline(pipeline, include_steps=True)


@router.delete("/{pipeline_id}", status_code=204)
async def delete_pipeline(
    pipeline_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Pipeline).where(Pipeline.pipeline_id == pipeline_id))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    await db.delete(pipeline)
    await db.flush()


@router.post("/{pipeline_id}/steps", status_code=201)
async def add_step(
    pipeline_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Pipeline).where(Pipeline.pipeline_id == pipeline_id))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")

    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    step_type = body.get("step_type", "")
    if step_type not in VALID_STEP_TYPES:
        raise HTTPException(422, f"step_type must be one of {sorted(VALID_STEP_TYPES)}")

    count_result = await db.execute(
        select(func.count()).where(PipelineStep.pipeline_id == pipeline_id)
    )
    step_count = count_result.scalar() or 0

    step = PipelineStep(
        pipeline_id=pipeline_id,
        name=name,
        step_order=int(body.get("step_order", step_count)),
        step_type=step_type,
        step_config=body.get("step_config"),
        depends_on=body.get("depends_on"),
        timeout_seconds=int(body.get("timeout_seconds", 1800)),
        max_retries=int(body.get("max_retries", 0)),
    )
    db.add(step)
    await db.flush()
    await db.refresh(step)
    return _fmt_step(step)


@router.delete("/{pipeline_id}/steps/{step_id}", status_code=204)
async def delete_step(
    pipeline_id: str,
    step_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(PipelineStep).where(
            PipelineStep.step_id == step_id,
            PipelineStep.pipeline_id == pipeline_id,
        )
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(404, "Step not found")
    await db.delete(step)
    await db.flush()


@router.post("/{pipeline_id}/trigger", status_code=201)
async def trigger_pipeline(
    pipeline_id: str,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Pipeline).where(Pipeline.pipeline_id == pipeline_id))
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    if not pipeline.is_active:
        raise HTTPException(422, "Pipeline is inactive")

    steps_result = await db.execute(
        select(PipelineStep)
        .where(PipelineStep.pipeline_id == pipeline_id)
        .order_by(PipelineStep.step_order)
    )
    steps = steps_result.scalars().all()

    run = PipelineRun(
        pipeline_id=pipeline_id,
        status="queued",
        triggered_by=user.email if user else None,
        trigger_type="manual",
    )
    db.add(run)
    await db.flush()

    for s in steps:
        step_run = PipelineStepRun(
            run_id=run.run_id,
            step_id=s.step_id,
            step_name=s.name,
            status="pending",
        )
        db.add(step_run)

    await db.flush()
    await db.refresh(run)
    return _fmt_run(run)


@router.get("/{pipeline_id}/runs")
async def list_runs(
    pipeline_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(PipelineRun)
        .where(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    return [_fmt_run(r) for r in runs]


@router.get("/{pipeline_id}/runs/{run_id}")
async def get_run(
    pipeline_id: str,
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(PipelineRun).where(
            PipelineRun.run_id == run_id,
            PipelineRun.pipeline_id == pipeline_id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    return _fmt_run(run, include_steps=True)
