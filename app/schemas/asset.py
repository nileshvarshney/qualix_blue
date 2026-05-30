from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

Criticality = Literal["critical", "high", "medium", "low"]
CertificationStatus = Literal["certified", "warning", "failed", "uncertified"]


class DataAssetCreate(BaseModel):
    domain_id: str
    subdomain_id: str
    connection_id: Optional[str] = None
    snowflake_account: Optional[str] = None
    sf_database_name: Optional[str] = None
    sf_schema_name: str
    sf_table_name: str
    table_type: Optional[str] = None
    table_description: Optional[str] = None
    view_definition: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    technical_owner_name: Optional[str] = None
    technical_owner_email: Optional[str] = None
    criticality: Criticality = "medium"
    certification_status: CertificationStatus = "uncertified"
    is_active: bool = True


class DataAssetUpdate(BaseModel):
    sf_schema_name: Optional[str] = None
    sf_table_name: Optional[str] = None
    table_type: Optional[str] = None
    table_description: Optional[str] = None
    view_definition: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    technical_owner_name: Optional[str] = None
    technical_owner_email: Optional[str] = None
    criticality: Optional[Criticality] = None
    certification_status: Optional[CertificationStatus] = None
    is_active: Optional[bool] = None


class DataAssetCertifyRequest(BaseModel):
    certification_status: CertificationStatus
    certified_by: Optional[str] = None


class DataAssetResponse(BaseModel):
    asset_id: str
    domain_id: str
    subdomain_id: str
    snowflake_account: Optional[str]
    sf_database_name: Optional[str]
    sf_schema_name: str
    sf_table_name: str
    table_type: Optional[str]
    table_description: Optional[str]
    owner_name: Optional[str]
    owner_email: Optional[str]
    technical_owner_name: Optional[str]
    technical_owner_email: Optional[str]
    criticality: str
    certification_status: str
    certified_by: Optional[str]
    certified_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DiscoverySelection(BaseModel):
    database: str
    schema: str


class DiscoveryRequest(BaseModel):
    connection_id: str
    selections: list[DiscoverySelection]
    criticality: Criticality = "medium"
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    technical_owner_name: Optional[str] = None
    technical_owner_email: Optional[str] = None
    provider: Optional[str] = None


class DiscoveryTableResult(BaseModel):
    database: str
    schema: str
    table_name: str
    status: Literal["imported", "skipped", "error"]
    reason: Optional[str] = None
    asset_id: Optional[str] = None
    domain_name: Optional[str] = None
    subdomain_name: Optional[str] = None
