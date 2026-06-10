# tests/test_asset_registry_hierarchy.py
from app.db.models import AssetSourceMeta


def test_asset_source_meta_has_generic_fields():
    """AssetSourceMeta must have provider-agnostic fields alongside sf_*."""
    meta = AssetSourceMeta()
    assert hasattr(meta, 'generic_database_name')
    assert hasattr(meta, 'generic_schema_name')
    assert hasattr(meta, 'generic_object_name')
    assert hasattr(meta, 'generic_object_type')


from datetime import datetime
import json


def test_asset_response_exposes_source_id():
    """AssetResponse.source_id is an alias for connection_id."""
    from app.schemas.asset import AssetResponse
    resp = AssetResponse(
        asset_id="test-uuid",
        asset_type="table",
        connection_id="conn-123",
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    data = json.loads(resp.model_dump_json())
    assert data["source_id"] == "conn-123"


def test_asset_response_source_id_none_when_no_connection():
    from app.schemas.asset import AssetResponse
    resp = AssetResponse(
        asset_id="logical-uuid",
        asset_type="logical_dataset",
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    data = json.loads(resp.model_dump_json())
    assert data["source_id"] is None


def test_asset_source_meta_response_has_generic_fields():
    from app.schemas.asset import AssetSourceMetaResponse
    meta = AssetSourceMetaResponse(
        provider="postgresql",
        generic_database_name="sales_db",
        generic_schema_name="public",
        generic_object_name="orders",
        generic_object_type="table",
    )
    assert meta.generic_database_name == "sales_db"
    assert meta.generic_object_type == "table"


import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_ensure_hierarchy_returns_three_stable_ids():
    from app.services.asset_registry import ensure_hierarchy_assets, stable_asset_id

    db = AsyncMock()
    no_row = MagicMock()
    no_row.scalar_one_or_none.return_value = None
    db.execute.return_value = no_row

    source_id, db_id, schema_id = await ensure_hierarchy_assets(
        connection_id="conn-001",
        connection_name="Prod PG",
        database_name="SALES_DB",
        schema_name="PUBLIC",
        provider="postgresql",
        db=db,
    )

    assert source_id == stable_asset_id("source:conn-001")
    assert db_id    == stable_asset_id("database:conn-001:sales_db")
    assert schema_id == stable_asset_id("schema:conn-001:sales_db:public")


@pytest.mark.asyncio
async def test_ensure_hierarchy_updates_existing_node():
    from app.services.asset_registry import ensure_hierarchy_assets

    db = AsyncMock()
    existing = MagicMock()
    existing.status = "missing"
    existing.last_seen_at = None
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = existing
    db.execute.return_value = result_mock

    await ensure_hierarchy_assets(
        connection_id="conn-001",
        connection_name="Prod PG",
        database_name="sales_db",
        schema_name="public",
        provider="postgresql",
        db=db,
    )

    assert existing.status == "active"
    assert existing.last_seen_at is not None


@pytest.mark.asyncio
async def test_register_column_assets_creates_stable_ids():
    from app.services.asset_registry import register_column_assets, stable_asset_id
    from app.schemas.metadata import ColumnMetaIn

    db = AsyncMock()
    # Simulate bulk SELECT returning empty set (no existing columns)
    empty_result = MagicMock()
    empty_result.__iter__ = MagicMock(return_value=iter([]))
    db.execute.return_value = empty_result

    cols = [
        ColumnMetaIn(column_name="order_id", data_type="int", ordinal_position=1),
        ColumnMetaIn(column_name="total",    data_type="float", ordinal_position=2),
    ]
    table_id = "table-uuid-abc"

    ids = await register_column_assets(
        table_asset_id=table_id,
        connection_id="conn-001",
        columns=cols,
        db=db,
    )

    assert ids[0] == stable_asset_id(f"column:{table_id}:order_id")
    assert ids[1] == stable_asset_id(f"column:{table_id}:total")


@pytest.mark.asyncio
async def test_register_file_asset_returns_stable_id():
    from app.services.asset_registry import register_file_asset, stable_asset_id

    db = AsyncMock()
    no_row = MagicMock()
    no_row.scalar_one_or_none.return_value = None
    db.execute.return_value = no_row

    asset_id = await register_file_asset(
        connection_id="s3-conn-1",
        path="s3://my-bucket/data/users.parquet",
        display_name="Users Parquet",
        db=db,
    )

    expected = stable_asset_id("file:s3-conn-1:s3://my-bucket/data/users.parquet")
    assert asset_id == expected


def test_stable_table_id_is_deterministic():
    from app.services.asset_registry import stable_asset_id
    id1 = stable_asset_id("table:conn-001:sales_db:public:orders")
    id2 = stable_asset_id("table:conn-001:sales_db:public:orders")
    assert id1 == id2
    assert len(id1) == 36


def test_column_asset_id_depends_on_table_asset_id():
    from app.services.asset_registry import stable_asset_id
    table_id = stable_asset_id("table:conn-001:sales_db:public:orders")
    col_id = stable_asset_id(f"column:{table_id}:order_id")
    assert len(col_id) == 36
    assert col_id != table_id


@pytest.mark.asyncio
async def test_register_logical_dataset_returns_stable_id():
    from app.services.asset_registry import register_logical_dataset, stable_asset_id

    db = AsyncMock()
    no_row = MagicMock()
    no_row.scalar_one_or_none.return_value = None
    db.execute.return_value = no_row

    asset_id = await register_logical_dataset(
        slug="customer-360",
        display_name="Customer 360",
        db=db,
    )

    expected = stable_asset_id("logical_dataset:customer-360")
    assert asset_id == expected
