# app/api/scan_results.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import results_store

router = APIRouter(prefix="/scan-results", tags=["Scan Results"])


# ─── Run-level endpoints ──────────────────────────────────────────────────────

@router.get("/runs/{run_id}")
async def get_run_summary_endpoint(
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summary = await results_store.get_run_summary(db, run_id)
    if not summary:
        raise HTTPException(404, "Scan run summary not found")
    return _summary_dict(summary)


@router.get("/runs/{run_id}/assets")
async def list_run_asset_summaries(
    run_id: str,
    limit: int = Query(200, ge=1, le=1000),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summaries = await results_store.get_run_asset_summaries(db, run_id, limit=limit)
    return [_asset_summary_dict(s) for s in summaries]


@router.get("/runs/{run_id}/assets/{asset_id}")
async def get_run_asset_summary(
    run_id: str,
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summary = await results_store.get_asset_run_summary(db, run_id, asset_id)
    if not summary:
        raise HTTPException(404, "Asset scan summary not found for this run")
    return _asset_summary_dict(summary)


@router.get("/runs/{run_id}/evidence")
async def get_run_evidence_endpoint(
    run_id: str,
    asset_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    logs = await results_store.get_run_evidence(
        db, run_id, asset_id=asset_id, severity=severity, limit=limit
    )
    return [_evidence_dict(e) for e in logs]


@router.get("/compare")
async def compare_runs_endpoint(
    run_id_a: str = Query(...),
    run_id_b: str = Query(...),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    try:
        result = await results_store.compare_runs(db, run_id_a, run_id_b)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {
        "run_a": _summary_dict(result["run_a"]),
        "run_b": _summary_dict(result["run_b"]),
        "delta": result["delta"],
    }


# ─── Asset-level endpoints ────────────────────────────────────────────────────

@router.get("/assets/{asset_id}/latest")
async def get_asset_latest_endpoint(
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summary = await results_store.get_asset_latest(db, asset_id)
    if not summary:
        raise HTTPException(404, "No scan results found for asset")
    return _asset_summary_dict(summary)


@router.get("/assets/{asset_id}/history")
async def get_asset_scan_history_endpoint(
    asset_id: str,
    limit: int = Query(50, ge=1, le=500),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summaries = await results_store.get_asset_history(db, asset_id, limit=limit)
    return [_asset_summary_dict(s) for s in summaries]


@router.get("/assets/{asset_id}/trend")
async def get_asset_trend_endpoint(
    asset_id: str,
    metric_name: str = Query(...),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    limit: int = Query(90, ge=1, le=90),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from datetime import date
    since_date = date.fromisoformat(since) if since else None
    until_date = date.fromisoformat(until) if until else None
    points = await results_store.get_asset_trend(
        db, asset_id, metric_name, since=since_date, until=until_date, limit=limit
    )
    return [_metric_dict(p) for p in points]


# ─── Serializers ──────────────────────────────────────────────────────────────

def _summary_dict(s) -> dict:
    return {
        "summary_id": s.summary_id,
        "run_id": s.run_id,
        "job_id": s.job_id,
        "connection_id": s.connection_id,
        "scan_type": s.scan_type,
        "new_assets_count": s.new_assets_count,
        "updated_assets_count": s.updated_assets_count,
        "removed_assets_count": s.removed_assets_count,
        "failed_assets_count": s.failed_assets_count,
        "schema_changes_count": s.schema_changes_count,
        "quality_score_avg": s.quality_score_avg,
        "scan_parameters": s.scan_parameters,
        "created_at": s.created_at.isoformat() if hasattr(s.created_at, "isoformat") else str(s.created_at),
    }


def _asset_summary_dict(a) -> dict:
    return {
        "asset_summary_id": a.asset_summary_id,
        "run_id": a.run_id,
        "asset_id": a.asset_id,
        "job_id": a.job_id,
        "scan_status": a.scan_status,
        "scan_duration_ms": a.scan_duration_ms,
        "row_count": a.row_count,
        "bytes": a.bytes,
        "column_count": a.column_count,
        "schema_hash": a.schema_hash,
        "columns_added": a.columns_added,
        "columns_removed": a.columns_removed,
        "columns_changed": a.columns_changed,
        "schema_drift_detected": a.schema_drift_detected,
        "error_message": a.error_message,
        "quality_score": a.quality_score,
        "null_ratio_avg": a.null_ratio_avg,
        "distinct_ratio_avg": a.distinct_ratio_avg,
        "volume_change_pct": a.volume_change_pct,
        "freshness_hours": a.freshness_hours,
        "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
    }


def _evidence_dict(e) -> dict:
    return {
        "evidence_id": e.evidence_id,
        "run_id": e.run_id,
        "asset_id": e.asset_id,
        "evidence_type": e.evidence_type,
        "severity": e.severity,
        "message": e.message,
        "payload": e.payload,
        "retention_expires_at": e.retention_expires_at.isoformat() if e.retention_expires_at and hasattr(e.retention_expires_at, "isoformat") else None,
        "created_at": e.created_at.isoformat() if hasattr(e.created_at, "isoformat") else str(e.created_at),
    }


def _metric_dict(m) -> dict:
    return {
        "metric_id": m.metric_id,
        "asset_id": m.asset_id,
        "run_id": m.run_id,
        "metric_date": m.metric_date.isoformat() if m.metric_date and hasattr(m.metric_date, "isoformat") else None,
        "metric_name": m.metric_name,
        "metric_value_num": m.metric_value_num,
        "metric_value_str": m.metric_value_str,
        "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
    }
