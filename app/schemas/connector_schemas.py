# app/schemas/connector_schemas.py
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ColumnMetadataSchema(BaseModel):
    name: str
    data_type: str          # normalized: varchar, int, float, boolean, date, datetime, json, bytes
    raw_type: str           # native type string from the source database
    is_nullable: bool
    ordinal_position: int
    default_value: Optional[str] = None
    comment: Optional[str] = None


class TableMetadataSchema(BaseModel):
    database: str
    schema_name: str
    table_name: str
    table_type: str         # TABLE, VIEW, MATERIALIZED_VIEW, EXTERNAL
    row_count: Optional[int] = None
    size_bytes: Optional[int] = None
    columns: list[ColumnMetadataSchema] = []
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    last_modified_at: Optional[datetime] = None


class ScanResult(BaseModel):
    connection_id: str
    database: str
    schema_name: Optional[str] = None
    scan_started_at: datetime
    scan_completed_at: datetime
    duration_ms: int
    tables_discovered: int
    columns_discovered: int
    tables: list[TableMetadataSchema] = []
    errors: list[str] = []
    scan_status: str        # success, partial, failed


class ConnectorHealthDetail(BaseModel):
    latency_ms: Optional[int] = None
    version: Optional[str] = None
    extra: dict = {}


class ConnectorHealth(BaseModel):
    connection_id: str
    connection_name: str
    database_type: str
    environment: Optional[str] = None
    status: str             # healthy, degraded, unreachable
    last_tested_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    last_successful_scan_at: Optional[datetime] = None
    scan_readiness_status: str   # ready, not_tested, degraded, unavailable
    detail: ConnectorHealthDetail = ConnectorHealthDetail()
