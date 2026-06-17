from __future__ import annotations

from pydantic import BaseModel, ConfigDict, computed_field
from typing import Optional, Literal
from datetime import datetime

Criticality = Literal["critical", "high", "medium", "low"]
CertificationStatus = Literal["certified", "warning", "failed", "uncertified"]

AssetType = Literal[
    'source', 'database', 'schema', 'table', 'view',
    'column', 'file', 'dataset', 'logical_dataset'
]

AssetStatus = Literal['active', 'missing', 'deprecated', 'scan_failed', 'disabled']


class AssetStatusUpdate(BaseModel):
    status: AssetStatus


class AssetTreeNode(BaseModel):
    asset_id: str
    display_name: Optional[str] = None
    physical_name: Optional[str] = None
    asset_type: str = 'table'
    status: str = 'active'
    qualified_name: Optional[str] = None
    children: list['AssetTreeNode'] = []

    model_config = ConfigDict(from_attributes=True)


AssetTreeNode.model_rebuild()


class AssetSourceMetaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    provider: str = 'snowflake'
    sf_account: Optional[str] = None
    sf_database_name: Optional[str] = None
    sf_schema_name: Optional[str] = None
    sf_table_name: Optional[str] = None
    sf_table_type: Optional[str] = None
    view_definition: Optional[str] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    updated_at: Optional[datetime] = None
    # Provider-agnostic fields (PostgreSQL, MySQL, BigQuery, S3)
    generic_database_name: Optional[str] = None
    generic_schema_name:   Optional[str] = None
    generic_object_name:   Optional[str] = None
    generic_object_type:   Optional[str] = None


class AssetCreate(BaseModel):
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
    asset_type: Optional[str] = 'table'
    parent_asset_id: Optional[str] = None
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    qualified_name: Optional[str] = None
    path: Optional[str] = None
    status: Optional[str] = 'active'
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    domain: Optional[str] = None
    sensitivity: Optional[str] = None


class AssetUpdate(BaseModel):
    sf_schema_name: Optional[str] = None
    sf_table_name: Optional[str] = None
    table_type: Optional[str] = None
    table_description: Optional[str] = None
    description: Optional[str] = None
    view_definition: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    technical_owner_name: Optional[str] = None
    technical_owner_email: Optional[str] = None
    criticality: Optional[Criticality] = None
    certification_status: Optional[CertificationStatus] = None
    is_active: Optional[bool] = None
    asset_type: Optional[str] = None
    parent_asset_id: Optional[str] = None
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    qualified_name: Optional[str] = None
    path: Optional[str] = None
    status: Optional[str] = None
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    domain: Optional[str] = None
    sensitivity: Optional[str] = None
    domain_id: Optional[str] = None
    subdomain_id: Optional[str] = None


class AssetCertifyRequest(BaseModel):
    certification_status: CertificationStatus
    certified_by: Optional[str] = None


class LogicalDatasetCreate(BaseModel):
    slug: str           # URL-safe unique identifier, will be lowercased
    display_name: str
    description: Optional[str] = None
    parent_asset_id: Optional[str] = None
    owner_user_id: Optional[str] = None
    domain_id: Optional[str] = None


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    parent_asset_id: Optional[str] = None
    connection_id: Optional[str] = None
    connection_name: Optional[str] = None
    asset_type: str = 'table'
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    qualified_name: Optional[str] = None
    path: Optional[str] = None
    description: Optional[str] = None
    status: str = 'active'
    criticality: str = 'medium'
    sensitivity: Optional[str] = None
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    domain: Optional[str] = None
    domain_id: Optional[str] = None
    subdomain_id: Optional[str] = None
    certification_status: str = 'uncertified'
    certified_by: Optional[str] = None
    certified_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    discovered_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None

    @computed_field
    @property
    def source_id(self) -> Optional[str]:
        """Alias for connection_id per spec field source_id."""
        return self.connection_id

    source_meta: Optional[AssetSourceMetaResponse] = None


class DiscoverySelection(BaseModel):
    database: str
    schema: str
    tables: Optional[list[str]] = None  # None = import all tables in schema


class AssetRegistryDiscoveryRequest(BaseModel):
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


class AssetDocumentCreate(BaseModel):
    title: str
    url: str


class AssetDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    doc_id: str
    asset_id: str
    title: str
    url: str
    created_at: datetime


class AssetOwnerCreate(BaseModel):
    owner_type: Literal["owner", "technical_owner"]
    name: str
    email: Optional[str] = None


class AssetOwnerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owner_id: str
    asset_id: str
    owner_type: str
    name: str
    email: Optional[str] = None
    created_at: datetime


# Backward-compatibility aliases
DataAssetCreate = AssetCreate
DataAssetUpdate = AssetUpdate
DataAssetCertifyRequest = AssetCertifyRequest
DataAssetResponse = AssetResponse
DiscoveryRequest = AssetRegistryDiscoveryRequest
