"""Profiling service and model tests."""
import pytest
from app.db.models import ProfilingResultPlaceholder, ColumnProfileHistory


def test_profiling_result_placeholder_has_data_type():
    p = ProfilingResultPlaceholder(
        run_id="run-1",
        asset_id="asset-1",
        column_name="email",
        data_type="VARCHAR",
        row_count=1000,
    )
    assert p.data_type == "VARCHAR"
    assert p.row_count == 1000
    assert p.is_placeholder is True


def test_column_profile_history_has_run_id():
    import datetime
    h = ColumnProfileHistory(
        asset_id="asset-1",
        column_name="email",
        profile_date=datetime.date.today(),
        run_id="run-1",
    )
    assert h.run_id == "run-1"


def test_scan_job_create_accepts_profile_scan_job_type():
    from app.schemas.scan_job import ScanJobCreate
    job = ScanJobCreate(
        job_name="Profile all tables",
        job_type="profile_scan",
        schedule_frequency="on_demand",
    )
    assert job.job_type == "profile_scan"


from app.services.profiling_service import _profile_column


def test_profile_column_null_ratio():
    stats = _profile_column("col", [1, None, 3, None], 4)
    assert stats["null_count"] == 2
    assert stats["null_ratio"] == 0.5
    assert stats["distinct_count"] == 2
    assert stats["row_count"] == 4


@pytest.mark.asyncio
async def test_dispatch_profile_scan_calls_profile_all_assets():
    from unittest.mock import AsyncMock, patch
    from app.services.scan_orchestrator import _dispatch_handler

    with patch("app.services.scan_orchestrator.profiling_service") as mock_ps, \
         patch("app.services.scan_orchestrator.append_log", new=AsyncMock()):
        mock_ps.profile_all_assets = AsyncMock(
            return_value={"assets_profiled": 3, "assets_failed": 0}
        )
        result = await _dispatch_handler("profile_scan", "job-1", "run-1", "conn-1", {})

    assert result["assets_scanned"] == 3
    assert result["errors_count"] == 0
    mock_ps.profile_all_assets.assert_called_once_with(
        connection_id="conn-1", run_id="run-1"
    )


def test_profile_column_all_nulls():
    stats = _profile_column("col", [None, None], 2)
    assert stats["null_ratio"] == 1.0
    assert stats["distinct_count"] == 0
    assert stats["min_value"] is None
    assert stats["avg_value"] is None


def test_profile_column_numeric_avg():
    stats = _profile_column("amount", [10, 20, 30], 3)
    assert stats["avg_value"] == 20.0
    assert stats["null_ratio"] == 0.0
    assert stats["min_value"] == "10"
    assert stats["max_value"] == "30"


def test_profile_column_top_values():
    stats = _profile_column("status", ["a", "b", "a", "a", "b"], 5)
    assert stats["top_values"]["a"] == 3
    assert stats["top_values"]["b"] == 2


def test_profile_column_distinct_ratio():
    stats = _profile_column("id", [1, 2, 3, 4], 4)
    assert stats["distinct_ratio"] == 1.0
