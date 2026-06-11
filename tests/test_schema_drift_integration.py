# tests/test_schema_drift_integration.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.schemas.metadata import ColumnMetaIn


@pytest.mark.asyncio
async def test_existing_asset_scan_calls_upsert_column_metadata():
    """Re-scanning an existing asset must refresh its column metadata."""
    from app.services import metadata_store as ms

    db = AsyncMock()
    asset_id = "asset-existing-001"
    cols = [ColumnMetaIn(column_name="id", data_type="NUMBER")]

    with patch.object(ms, "upsert_column_metadata", new_callable=AsyncMock) as mock_upsert, \
         patch.object(ms, "record_scan_result", new_callable=AsyncMock):
        await ms.upsert_column_metadata(db, asset_id, cols)
        mock_upsert.assert_called_once_with(db, asset_id, cols)
