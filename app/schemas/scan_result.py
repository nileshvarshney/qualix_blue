# app/schemas/scan_result.py
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class ScanRunSummaryOut(BaseModel):
    summary_id: str
    run_id: str
    job_id: Optional[str] = None
    connection_id: Optional[str] = None
    scan_type: Optional[str] = None
    new_assets_count: int = 0
    updated_assets_count: int = 0
    removed_assets_count: int = 0
    failed_assets_count: int = 0
    schema_changes_count: int = 0
    quality_score_avg: Optional[float] = None
    scan_parameters: Optional[dict] = None
    created_at: Any

    model_config = {"from_attributes": True}


class AssetScanSummaryOut(BaseModel):
    asset_summary_id: str
    run_id: str
    asset_id: str
    job_id: Optional[str] = None
    scan_status: str = "succeeded"
    scan_duration_ms: Optional[int] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    column_count: Optional[int] = None
    schema_hash: Optional[str] = None
    columns_added: int = 0
    columns_removed: int = 0
    columns_changed: int = 0
    schema_drift_detected: bool = False
    error_message: Optional[str] = None
    quality_score: Optional[float] = None
    null_ratio_avg: Optional[float] = None
    distinct_ratio_avg: Optional[float] = None
    volume_change_pct: Optional[float] = None
    freshness_hours: Optional[float] = None
    created_at: Any

    model_config = {"from_attributes": True}


class MetricsHistoryPoint(BaseModel):
    metric_id: str
    asset_id: str
    run_id: Optional[str] = None
    metric_date: Optional[Any] = None
    metric_name: str
    metric_value_num: Optional[float] = None
    metric_value_str: Optional[str] = None
    created_at: Any

    model_config = {"from_attributes": True}


class ScanEvidenceLogOut(BaseModel):
    evidence_id: str
    run_id: str
    asset_id: Optional[str] = None
    evidence_type: str
    severity: str = "info"
    message: str
    payload: Optional[dict] = None
    retention_expires_at: Optional[Any] = None
    created_at: Any

    model_config = {"from_attributes": True}


class RunComparisonOut(BaseModel):
    run_a: ScanRunSummaryOut
    run_b: ScanRunSummaryOut
    delta: dict[str, Any]

    model_config = {"from_attributes": True}
