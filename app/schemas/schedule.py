from __future__ import annotations

from pydantic import BaseModel, field_validator
from typing import Optional, Literal, List
from datetime import datetime
import json

ScheduleLevel = Literal["rule", "table", "subdomain", "domain", "global"]
Frequency = Literal["hourly", "daily", "weekly", "monthly", "cron", "on_demand"]


class ScheduleCreate(BaseModel):
    rule_id: Optional[str] = None
    asset_id: Optional[str] = None
    subdomain_id: Optional[str] = None
    domain_id: Optional[str] = None
    schedule_level: ScheduleLevel
    frequency: Frequency
    cron_expression: Optional[str] = None
    timezone: str = "America/Los_Angeles"
    run_at_hour: Optional[int] = 6
    run_at_minute: Optional[int] = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    # Explicit rule bundle for non-rule-level schedules
    rule_ids: Optional[List[str]] = None
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    frequency: Optional[Frequency] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    run_at_hour: Optional[int] = None
    run_at_minute: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_active: Optional[bool] = None
    rule_id: Optional[str] = None
    asset_id: Optional[str] = None
    subdomain_id: Optional[str] = None
    domain_id: Optional[str] = None
    schedule_level: Optional[ScheduleLevel] = None
    rule_ids: Optional[List[str]] = None


class ScheduleResponse(BaseModel):
    schedule_id: str
    rule_id: Optional[str]
    asset_id: Optional[str]
    subdomain_id: Optional[str]
    domain_id: Optional[str]
    schedule_level: str
    frequency: str
    cron_expression: Optional[str]
    timezone: str
    run_at_hour: Optional[int]
    run_at_minute: Optional[int]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    rule_ids: Optional[List[str]] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("rule_ids", mode="before")
    @classmethod
    def parse_rule_ids(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return v

    class Config:
        from_attributes = True
