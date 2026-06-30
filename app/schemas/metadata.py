from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class ColumnMetaIn(BaseModel):
    """Input model — carries all fields fetched from INFORMATION_SCHEMA.COLUMNS."""
    column_name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None
    ordinal_position: Optional[int] = None
    default_value: Optional[str] = None
    character_max_length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None
    is_partition_key: bool = False
    partition_key_index: Optional[int] = None
    description: Optional[str] = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references_table: Optional[str] = None


class ColumnMetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    col_id: str
    column_name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None
    ordinal_position: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None
    character_max_length: Optional[int] = None
    default_value: Optional[str] = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references_table: Optional[str] = None
    is_partition_key: bool = False
    partition_key_index: Optional[int] = None
    description: Optional[str] = None
    last_profiled_at: Optional[datetime] = None
    updated_at: datetime


class AssetMetaCurrentState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    asset_type: str
    qualified_name: Optional[str] = None
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    status: str
    # Operational
    scan_status: Optional[str] = None
    last_scanned_at: Optional[datetime] = None
    scan_duration_ms: Optional[int] = None
    scan_version: Optional[str] = None
    # Source meta
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    last_modified_at: Optional[datetime] = None
    table_created_at: Optional[datetime] = None
    partition_info: Optional[dict] = None
    # Quality placeholders
    latest_profile_score: Optional[float] = None
    latest_quality_status: Optional[str] = None
    is_critical_data_element: bool = False
    attached_rule_count: int = 0
    # Ownership
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    # Tags
    tags: list[str] = []


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    snapshot_id: str
    snapshot_date: date
    scan_status: Optional[str] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    column_count: Optional[int] = None
    schema_hash: Optional[str] = None
    scan_duration_ms: Optional[int] = None
    scan_version: Optional[str] = None
    latest_profile_score: Optional[float] = None
    latest_quality_status: Optional[str] = None
    attached_rule_count: Optional[int] = None
    updated_at: datetime


class CDEPatch(BaseModel):
    is_critical_data_element: bool
