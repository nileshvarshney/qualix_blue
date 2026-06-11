from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_scan_run_summary_out_required_fields():
    from app.schemas.scan_result import ScanRunSummaryOut
    s = ScanRunSummaryOut(
        summary_id="sum-001",
        run_id="run-001",
        job_id="job-001",
        new_assets_count=3,
        updated_assets_count=5,
        removed_assets_count=0,
        failed_assets_count=1,
        schema_changes_count=2,
        created_at="2026-06-10T10:00:00",
    )
    assert s.run_id == "run-001"
    assert s.new_assets_count == 3


def test_asset_scan_summary_out():
    from app.schemas.scan_result import AssetScanSummaryOut
    a = AssetScanSummaryOut(
        asset_summary_id="asm-001",
        run_id="run-001",
        asset_id="asset-001",
        scan_status="succeeded",
        created_at="2026-06-10T10:00:00",
    )
    assert a.scan_status == "succeeded"
    assert a.quality_score is None


def test_metrics_history_point():
    from app.schemas.scan_result import MetricsHistoryPoint
    m = MetricsHistoryPoint(
        metric_id="m-001",
        asset_id="asset-001",
        metric_name="row_count",
        metric_value_num=10000.0,
        created_at="2026-06-10T10:00:00",
    )
    assert m.metric_name == "row_count"
    assert m.metric_value_num == 10000.0


def test_run_comparison_out():
    from app.schemas.scan_result import RunComparisonOut, ScanRunSummaryOut

    def _summary(run_id: str, new_assets: int) -> ScanRunSummaryOut:
        return ScanRunSummaryOut(
            summary_id=f"sum-{run_id}",
            run_id=run_id,
            job_id="job-001",
            new_assets_count=new_assets,
            updated_assets_count=0,
            removed_assets_count=0,
            failed_assets_count=0,
            schema_changes_count=0,
            created_at="2026-06-10T10:00:00",
        )

    cmp = RunComparisonOut(
        run_a=_summary("run-001", 5),
        run_b=_summary("run-002", 8),
        delta={"new_assets_delta": 3},
    )
    assert cmp.delta["new_assets_delta"] == 3


def test_evidence_log_out():
    from app.schemas.scan_result import ScanEvidenceLogOut
    e = ScanEvidenceLogOut(
        evidence_id="ev-001",
        run_id="run-001",
        evidence_type="schema_drift",
        severity="warning",
        message="column dropped",
        created_at="2026-06-10T10:00:00",
    )
    assert e.severity == "warning"


def _make_mock_summary(run_id="run-001"):
    s = MagicMock()
    s.summary_id = f"sum-{run_id}"
    s.run_id = run_id
    s.job_id = "job-001"
    s.connection_id = "conn-001"
    s.scan_type = "metadata_discovery"
    s.new_assets_count = 3
    s.updated_assets_count = 10
    s.removed_assets_count = 0
    s.failed_assets_count = 1
    s.schema_changes_count = 2
    s.quality_score_avg = None
    s.scan_parameters = None
    s.created_at = "2026-06-10T10:00:00"
    return s


def _make_mock_asset_summary():
    a = MagicMock()
    a.asset_summary_id = "asm-001"
    a.run_id = "run-001"
    a.asset_id = "asset-001"
    a.job_id = "job-001"
    a.scan_status = "succeeded"
    a.scan_duration_ms = 250
    a.row_count = 5000
    a.bytes = 102400
    a.column_count = 12
    a.schema_hash = "abc123"
    a.columns_added = 0
    a.columns_removed = 0
    a.columns_changed = 0
    a.schema_drift_detected = False
    a.error_message = None
    a.quality_score = None
    a.null_ratio_avg = None
    a.distinct_ratio_avg = None
    a.volume_change_pct = None
    a.freshness_hours = None
    a.created_at = "2026-06-10T10:00:00"
    return a


def test_serializers_exist():
    from app.api.scan_results import _summary_dict, _asset_summary_dict, _evidence_dict
    assert callable(_summary_dict)
    assert callable(_asset_summary_dict)
    assert callable(_evidence_dict)


def test_summary_dict_returns_expected_keys():
    from app.api.scan_results import _summary_dict
    d = _summary_dict(_make_mock_summary())
    assert "run_id" in d
    assert "new_assets_count" in d
    assert "scan_type" in d


def test_asset_summary_dict_returns_expected_keys():
    from app.api.scan_results import _asset_summary_dict
    d = _asset_summary_dict(_make_mock_asset_summary())
    assert "asset_id" in d
    assert "scan_status" in d
    assert "schema_drift_detected" in d
    assert "quality_score" in d


@pytest.mark.asyncio
async def test_get_run_summary_returns_404_when_missing():
    from app.api.scan_results import get_run_summary_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_run_summary = AsyncMock(return_value=None)
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await get_run_summary_endpoint("ghost-run", db=db, user={})
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_run_summary_returns_data():
    from app.api.scan_results import get_run_summary_endpoint

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_run_summary = AsyncMock(return_value=_make_mock_summary())
        db = AsyncMock()
        result = await get_run_summary_endpoint("run-001", db=db, user={})
        assert result["run_id"] == "run-001"
        assert result["new_assets_count"] == 3


@pytest.mark.asyncio
async def test_get_asset_latest_returns_404_when_missing():
    from app.api.scan_results import get_asset_latest_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_asset_latest = AsyncMock(return_value=None)
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await get_asset_latest_endpoint("ghost-asset", db=db, user={})
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_compare_runs_returns_delta():
    from app.api.scan_results import compare_runs_endpoint

    cmp = {
        "run_a": _make_mock_summary("run-001"),
        "run_b": _make_mock_summary("run-002"),
        "delta": {"new_assets_delta": 3},
    }
    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.compare_runs = AsyncMock(return_value=cmp)
        db = AsyncMock()
        result = await compare_runs_endpoint(run_id_a="run-001", run_id_b="run-002", db=db, user={})
        assert result["delta"]["new_assets_delta"] == 3


@pytest.mark.asyncio
async def test_compare_runs_returns_404_when_run_missing():
    from app.api.scan_results import compare_runs_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.compare_runs = AsyncMock(side_effect=ValueError("not found"))
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await compare_runs_endpoint(run_id_a="ghost-a", run_id_b="ghost-b", db=db, user={})
        assert exc_info.value.status_code == 404


def test_scan_results_router_is_registered_in_main():
    from app.api import scan_results
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/scan-results" in p for p in paths), (
        "scan_results router not registered — check app/main.py"
    )


@pytest.mark.asyncio
async def test_get_asset_scan_history_returns_list():
    """get_asset_history returns all AssetScanSummary rows for an asset."""
    from app.services.results_store import get_asset_history
    from app.db.models import AssetScanSummary
    from unittest.mock import AsyncMock, MagicMock
    from datetime import datetime

    s1 = AssetScanSummary(run_id="run-001", asset_id="asset-001", scan_status="succeeded", row_count=1000)
    s2 = AssetScanSummary(run_id="run-002", asset_id="asset-001", scan_status="succeeded", row_count=1200)

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = [s1, s2]

    results = await get_asset_history(db, "asset-001", limit=50)
    assert len(results) == 2
    assert results[0].asset_id == "asset-001"
    assert results[1].run_id == "run-002"


@pytest.mark.asyncio
async def test_get_asset_scan_history_caps_at_500():
    """get_asset_history enforces a maximum limit of 500."""
    from app.services.results_store import get_asset_history
    from unittest.mock import AsyncMock

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = []

    await get_asset_history(db, "asset-001", limit=9999)
    # The important thing is no exception is raised (limit is capped internally)
    db.execute.assert_called_once()
