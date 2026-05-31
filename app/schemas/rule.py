from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Any, Literal
from datetime import datetime

RuleType = Literal[
    "null_check", "uniqueness_check", "duplicate_check", "accepted_values_check",
    "range_check", "freshness_check", "volume_check", "schema_drift_check",
    "referential_integrity_check", "regex_check", "business_rule_check", "custom_sql_check"
]
Severity = Literal["critical", "high", "medium", "low"]
RuleStatus = Literal["draft", "pending_review", "approved", "active", "disabled", "archived"]
QualityDimension = Literal[
    "completeness", "accuracy", "uniqueness", "validity", "timeliness", "consistency"
]

# Mapping from rule_type to quality dimension for auto-categorization
RULE_TYPE_TO_DIMENSION: dict[str, str] = {
    "null_check": "completeness",
    "volume_check": "completeness",
    "uniqueness_check": "uniqueness",
    "duplicate_check": "uniqueness",
    "range_check": "validity",
    "accepted_values_check": "validity",
    "regex_check": "validity",
    "freshness_check": "timeliness",
    "referential_integrity_check": "consistency",
    "schema_drift_check": "consistency",
    "business_rule_check": "accuracy",
    "custom_sql_check": "accuracy",
}


class RuleCreate(BaseModel):
    rule_name: str
    rule_description: Optional[str] = None
    domain_id: str
    subdomain_id: str
    asset_id: str
    rule_type: RuleType
    rule_category: Optional[QualityDimension] = None
    target_column: Optional[str] = None
    rule_sql: Optional[str] = None
    rule_config: Optional[dict[str, Any]] = None
    severity: Severity = "medium"
    status: RuleStatus = "draft"
    is_active: bool = False
    created_by: Optional[str] = None
    business_owner_name: Optional[str] = None
    business_owner_email: Optional[str] = None


class RuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    rule_description: Optional[str] = None
    rule_type: Optional[RuleType] = None
    rule_category: Optional[str] = None
    target_column: Optional[str] = None
    rule_sql: Optional[str] = None
    rule_config: Optional[dict[str, Any]] = None
    severity: Optional[Severity] = None
    status: Optional[RuleStatus] = None
    is_active: Optional[bool] = None
    approved_by: Optional[str] = None
    business_owner_name: Optional[str] = None
    business_owner_email: Optional[str] = None


class RuleApproveRequest(BaseModel):
    approved_by: Optional[str] = None


class RuleRejectRequest(BaseModel):
    rejected_by: Optional[str] = None
    rejection_reason: str


class RuleVersionResponse(BaseModel):
    version_id: str
    rule_id: str
    version: int
    rule_name: str
    rule_description: Optional[str]
    rule_type: str
    target_column: Optional[str]
    rule_sql: Optional[str]
    rule_config: Optional[dict]
    severity: str
    status: str
    changed_by: Optional[str]
    change_reason: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RuleResponse(BaseModel):
    rule_id: str
    rule_name: str
    rule_description: Optional[str]
    domain_id: str
    subdomain_id: str
    asset_id: str
    rule_type: str
    rule_category: Optional[str]
    target_column: Optional[str]
    rule_sql: Optional[str]
    rule_config: Optional[dict]
    severity: str
    status: str
    version: int
    is_active: bool
    created_by: Optional[str]
    approved_by: Optional[str]
    rejected_by: Optional[str]
    rejection_reason: Optional[str]
    business_owner_name: Optional[str]
    business_owner_email: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RuleImportItem(BaseModel):
    rule_name: str
    rule_type: RuleType
    target_column: Optional[str] = None
    severity: Severity = "medium"
    rule_description: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class RuleImportPayload(BaseModel):
    domain: str
    subdomain: str
    asset:  dict[str, str]
    schedule: Optional[dict] = None
    rules: list[RuleImportItem]
