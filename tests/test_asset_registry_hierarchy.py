# tests/test_asset_registry_hierarchy.py
from app.db.models import AssetSourceMeta


def test_asset_source_meta_has_generic_fields():
    """AssetSourceMeta must have provider-agnostic fields alongside sf_*."""
    meta = AssetSourceMeta()
    assert hasattr(meta, 'generic_database_name')
    assert hasattr(meta, 'generic_schema_name')
    assert hasattr(meta, 'generic_object_name')
    assert hasattr(meta, 'generic_object_type')
