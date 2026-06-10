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
