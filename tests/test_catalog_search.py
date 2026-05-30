"""Tests for catalog search service and API."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_refresh_search_index_returns_duration():
    """refresh_search_index executes REFRESH and returns ms elapsed."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()

    from app.services.catalog_service import refresh_search_index
    ms = await refresh_search_index(mock_db)
    assert isinstance(ms, int)
    assert ms >= 0
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_enrich_asset_results_empty():
    """enrich_asset_results returns empty dict for empty asset_ids list."""
    mock_db = AsyncMock()
    from app.services.catalog_service import enrich_asset_results
    result = await enrich_asset_results([], mock_db)
    assert result == {}


@pytest.mark.asyncio
async def test_catalog_search_returns_paginated_shape():
    """catalog_search returns results/total/page/page_size shape."""
    from app.api.catalog import catalog_search
    from unittest.mock import AsyncMock, patch, MagicMock

    mock_db = AsyncMock()
    # Simulate empty view (no results)
    # Use MagicMock for the execute result so synchronous methods (scalar, mappings, all)
    # are not treated as coroutines by AsyncMock's auto-speccing.
    mock_execute_result = MagicMock()
    mock_execute_result.scalar.return_value = 0
    mappings_result = MagicMock()
    mappings_result.all.return_value = []
    mock_execute_result.mappings.return_value = mappings_result
    mock_db.execute = AsyncMock(return_value=mock_execute_result)

    mock_user = {"email": "test@example.com", "role": "viewer", "domain_id": None}

    with patch("app.api.catalog.enrich_asset_results", return_value={}):
        result = await catalog_search(
            q="invoice", type=None, entity_type=None, domain_id=None,
            classification=None, certification=None, owner=None, tag=None,
            sort="relevance", page=1, page_size=10, db=mock_db, user=mock_user
        )
    assert "results" in result
    assert "total" in result
    assert result["page"] == 1
    assert result["page_size"] == 10


@pytest.mark.asyncio
async def test_catalog_search_fallback_on_view_error():
    """When tsvector search raises, falls back to ILIKE and returns valid shape."""
    from app.api.catalog import catalog_search
    from unittest.mock import AsyncMock, patch, MagicMock
    from sqlalchemy.exc import ProgrammingError

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=Exception("relation does not exist"))

    mock_user = {"email": "test@example.com", "role": "viewer", "domain_id": None}

    # patch _search_via_ilike to return empty
    with patch("app.api.catalog._search_via_ilike", return_value=([], 0)):
        result = await catalog_search(
            q="test", type=None, entity_type=None, domain_id=None,
            classification=None, certification=None, owner=None, tag=None,
            sort="relevance", page=1, page_size=20, db=mock_db, user=mock_user
        )
    assert result["results"] == []
    assert result["total"] == 0


@pytest.mark.asyncio
async def test_catalog_facets_returns_four_keys():
    """catalog_facets returns domains/classifications/certifications/tags."""
    from app.api.catalog import catalog_facets
    from unittest.mock import AsyncMock, MagicMock

    mock_db = AsyncMock()
    # Use MagicMock for the result so .all() is synchronous (not a coroutine)
    mock_execute_result = MagicMock()
    mock_execute_result.all.return_value = []
    mock_db.execute = AsyncMock(return_value=mock_execute_result)

    mock_user = {"email": "test@example.com", "role": "viewer", "domain_id": None}
    result = await catalog_facets(domain_id=None, type=None, db=mock_db, user=mock_user)
    for key in ("domains", "classifications", "certifications", "tags"):
        assert key in result


@pytest.mark.asyncio
async def test_saved_search_delete_wrong_owner_raises():
    """Deleting another user's saved search raises 403."""
    from app.api.catalog import delete_saved_search
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException

    mock_db = AsyncMock()
    # Simulate row found but owned by different user
    # Use MagicMock for result so .first() is synchronous (not a coroutine)
    mock_row = MagicMock()
    mock_row.user_email = "other@example.com"
    mock_result = MagicMock()
    mock_result.first.return_value = mock_row
    mock_db.execute = AsyncMock(return_value=mock_result)

    mock_user = {"email": "me@example.com", "role": "viewer", "domain_id": None}

    with pytest.raises(HTTPException) as exc_info:
        await delete_saved_search(search_id="some-id", db=mock_db, user=mock_user)
    assert exc_info.value.status_code == 403
