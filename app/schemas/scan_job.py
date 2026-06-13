from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field, model_validator

_JOB_TYPE_RE = (
    "^(connection_test|metadata_discovery|asset_refresh"
    "|profile_scan|profile_scan_placeholder|rule_scan_placeholder|source_health_check)$"
)
_FREQ_RE = "^(on_demand|hourly|daily|weekly|monthly|cron)$"


class ScanJobCreate(BaseModel):
    connection_id: Optional[str] = None
    job_name: str = Field(..., min_length=1, max_length=200)
    job_type: str = Field(..., pattern=_JOB_TYPE_RE)
    schedule_frequency: str = Field("on_demand", pattern=_FREQ_RE)
    cron_expr: Optional[str] = None
    timezone: str = "UTC"
    max_retries: int = Field(2, ge=0, le=5)
    timeout_seconds: int = Field(300, ge=30, le=3600)
    parameters: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def cron_expr_required(self) -> "ScanJobCreate":
        if self.schedule_frequency == "cron" and not self.cron_expr:
            raise ValueError("cron_expr is required when schedule_frequency is 'cron'")
        return self


class ScanJobUpdate(BaseModel):
    connection_id: Optional[str] = None
    job_name: Optional[str] = Field(None, min_length=1, max_length=200)
    job_type: Optional[str] = Field(None, pattern=_JOB_TYPE_RE)
    is_active: Optional[bool] = None
    schedule_frequency: Optional[str] = Field(None, pattern=_FREQ_RE)
    cron_expr: Optional[str] = None
    timezone: Optional[str] = None
    max_retries: Optional[int] = Field(None, ge=0, le=5)
    timeout_seconds: Optional[int] = Field(None, ge=30, le=3600)
    parameters: Optional[dict[str, Any]] = None


class TriggerRequest(BaseModel):
    idempotency_key: Optional[str] = None
    parameters_override: Optional[dict[str, Any]] = None
