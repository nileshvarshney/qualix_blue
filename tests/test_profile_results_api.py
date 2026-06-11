"""Tests for profiling results store and API endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_get_asset_profile_summary_returns_none_when_no_results():
    from app.services.profiling_results_store import get_asset_profile_summary

    db = AsyncMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=scalar_result)

    result = await get_asset_profile_summary(db, "asset-1")
    assert result is None


@pytest.mark.asyncio
async def test_get_column_profiles_returns_empty_list_when_no_results():
    from app.services.profiling_results_store import get_column_profiles

    db = AsyncMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=scalar_result)

    result = await get_column_profiles(db, "asset-1")
    assert result == []


@pytest.mark.asyncio
async def test_get_profile_run_history_returns_empty_when_no_runs():
    from app.services.profiling_results_store import get_profile_run_history

    db = AsyncMock()
    rows_result = MagicMock()
    rows_result.all.return_value = []
    db.execute = AsyncMock(return_value=rows_result)

    result = await get_profile_run_history(db, "asset-1")
    assert result == []


@pytest.mark.asyncio
async def test_get_asset_profile_summary_404_when_not_found():
    from fastapi import HTTPException
    from unittest.mock import AsyncMock, patch

    with patch("app.api.profile_results.profiling_results_store") as mock_store:
        mock_store.get_asset_profile_summary = AsyncMock(return_value=None)

        from app.api.profile_results import get_asset_profile_summary_endpoint
        with pytest.raises(HTTPException) as exc_info:
            await get_asset_profile_summary_endpoint(
                asset_id="asset-1",
                run_id=None,
                db=AsyncMock(),
                user={},
            )

        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_column_profiles_returns_list():
    from unittest.mock import AsyncMock, patch

    with patch("app.api.profile_results.profiling_results_store") as mock_store:
        mock_store.get_column_profiles = AsyncMock(return_value=[
            {"column_name": "email", "null_ratio": 0.0}
        ])

        from app.api.profile_results import get_column_profiles_endpoint
        result = await get_column_profiles_endpoint(
            asset_id="asset-1",
            run_id=None,
            db=AsyncMock(),
            user={},
        )

        assert len(result) == 1
        assert result[0]["column_name"] == "email"
