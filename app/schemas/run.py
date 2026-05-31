from __future__ import annotations

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RunResponse(BaseModel):
    run_id: str
    rule_id: str
    asset_id: str
    domain_id: str
    subdomain_id: str
    execution_start_time: Optional[datetime]
    execution_end_time: Optional[datetime]
    status: str
    total_rows_scanned: Optional[int]
    failed_rows_count: Optional[int]
    passed_rows_count: Optional[int]
    failure_percentage: Optional[float]
    quality_score: Optional[float]
    error_message: Optional[str]
    executed_sql: Optional[str]
    ai_explanation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RunSampleResponse(BaseModel):
    sample_id: str
    run_id: str
    rule_id: str
    failed_record: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True
