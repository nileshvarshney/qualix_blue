from __future__ import annotations

from pydantic import BaseModel
from typing import Optional
from datetime import date


class GlobalDashboard(BaseModel):
    overall_quality_score: float
    total_domains: int
    total_assets: int
    total_active_rules: int
    rules_passed_today: int
    rules_failed_today: int
    critical_failures: int
    open_alerts: int
    quality_trend: list[dict]


class DomainSummary(BaseModel):
    domain_id: str
    domain_name: str
    quality_score: float
    total_rules: int
    passed_rules: int
    failed_rules: int
    critical_failures: int
    total_assets: int


class DomainDashboard(BaseModel):
    domain_id: str
    domain_name: str
    quality_score: float
    total_rules: int
    passed_rules: int
    failed_rules: int
    critical_failures: int
    subdomains: list[dict]
    quality_trend: list[dict]
    top_failing_rules: list[dict]


class SubdomainDashboard(BaseModel):
    subdomain_id: str
    subdomain_name: str
    domain_id: str
    quality_score: float
    total_rules: int
    passed_rules: int
    failed_rules: int
    assets: list[dict]
    quality_trend: list[dict]


class TableDashboard(BaseModel):
    asset_id: str
    sf_schema_name: str
    sf_table_name: str
    domain_id: str
    subdomain_id: str
    quality_score: float
    total_rules: int
    passed_rules: int
    failed_rules: int
    warning_rules: int
    last_run_time: Optional[str]
    recent_runs: list[dict]
    rules: list[dict]
    quality_trend: list[dict]
