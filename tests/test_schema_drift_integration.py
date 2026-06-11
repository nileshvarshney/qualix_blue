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
