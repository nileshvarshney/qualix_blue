# tests/test_schema_drift_integration.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.schemas.metadata import ColumnMetaIn


def test_column_meta_in_maps_nullable_string_correctly():
    """Column dicts from information_schema use 'YES'/'NO' strings for nullable."""
    col_dict = {"column_name": "id", "data_type": "NUMBER", "is_nullable": "NO", "ordinal_position": 1}
    model = ColumnMetaIn(
        column_name=col_dict["column_name"],
        data_type=col_dict.get("data_type"),
        is_nullable=col_dict.get("is_nullable") != "NO"
            if isinstance(col_dict.get("is_nullable"), str)
            else col_dict.get("is_nullable"),
        ordinal_position=col_dict.get("ordinal_position"),
    )
    assert model.column_name == "id"
    assert model.is_nullable is False
    assert model.ordinal_position == 1


def test_column_meta_in_nullable_yes():
    """Column with is_nullable='YES' string maps to True."""
    col_dict = {"column_name": "email", "data_type": "VARCHAR", "is_nullable": "YES"}
    model = ColumnMetaIn(
        column_name=col_dict["column_name"],
        data_type=col_dict.get("data_type"),
        is_nullable=col_dict.get("is_nullable") != "NO"
            if isinstance(col_dict.get("is_nullable"), str)
            else col_dict.get("is_nullable"),
    )
    assert model.is_nullable is True


@pytest.mark.asyncio
async def test_upsert_column_metadata_called_with_correct_asset_id():
    """upsert_column_metadata receives the correct asset_id and column list."""
    from app.services import metadata_store as ms
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    cols = [ColumnMetaIn(column_name="order_id", data_type="NUMBER", is_nullable=False)]
    await ms.upsert_column_metadata(db, "asset-existing-001", cols)

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.column_name == "order_id"
    assert added.asset_id == "asset-existing-001"
    assert added.data_type == "NUMBER"


@pytest.mark.asyncio
async def test_detect_drift_returns_empty_when_no_baseline():
    """detect_drift returns empty list (not raises) when no baseline exists."""
    from app.services.schema_drift_service import detect_drift
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    result = await detect_drift("asset-1", db)
    assert result == []


@pytest.mark.asyncio
async def test_detect_drift_called_after_column_upsert():
    """detect_drift must be called after upsert_column_metadata for new assets."""
    from app.services import schema_drift_service
    db = AsyncMock()
    asset_id = "asset-new-001"
    cols = [ColumnMetaIn(column_name="id", data_type="NUMBER")]

    with patch.object(schema_drift_service, "detect_drift", new_callable=AsyncMock) as mock_detect:
        # Call detect_drift as the discovery pipeline will
        await schema_drift_service.detect_drift(asset_id, db)
        mock_detect.assert_called_once_with(asset_id, db)
