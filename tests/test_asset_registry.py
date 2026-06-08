# tests/test_asset_registry.py
from app.services.asset_registry import stable_asset_id


def test_stable_asset_id_is_deterministic():
    id1 = stable_asset_id("source:conn-abc")
    id2 = stable_asset_id("source:conn-abc")
    assert id1 == id2


def test_stable_asset_id_differs_for_different_paths():
    a = stable_asset_id("source:conn-abc")
    b = stable_asset_id("database:conn-abc:MY_DB")
    assert a != b


def test_stable_asset_id_is_valid_uuid():
    import uuid
    result = stable_asset_id("schema:conn-abc:MY_DB:PUBLIC")
    parsed = uuid.UUID(result)
    assert str(parsed) == result
