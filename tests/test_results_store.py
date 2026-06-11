# tests/test_results_store.py
from __future__ import annotations


def test_scan_run_summary_model():
    from app.db.models import ScanRunSummary
    s = ScanRunSummary(run_id="run-001", job_id="job-001")
    assert s.summary_id is not None
    assert len(s.summary_id) == 36
    assert s.new_assets_count == 0
    assert s.updated_assets_count == 0
    assert s.removed_assets_count == 0
    assert s.failed_assets_count == 0
    assert s.schema_changes_count == 0


def test_asset_scan_summary_model():
    from app.db.models import AssetScanSummary
    a = AssetScanSummary(run_id="run-001", asset_id="asset-001", job_id="job-001")
    assert a.asset_summary_id is not None
    assert a.scan_status == "succeeded"
    assert a.schema_drift_detected is False
    assert a.columns_added == 0
    assert a.columns_removed == 0
    assert a.columns_changed == 0


def test_scan_metrics_history_model():
    from app.db.models import ScanMetricsHistory
    m = ScanMetricsHistory(asset_id="asset-001", metric_name="row_count", metric_value_num=1000.0)
    assert m.metric_id is not None
    assert m.metric_name == "row_count"


def test_scan_evidence_log_model():
    from app.db.models import ScanEvidenceLog
    e = ScanEvidenceLog(run_id="run-001", evidence_type="schema_drift", severity="warning", message="col dropped")
    assert e.evidence_id is not None
    assert e.severity == "warning"
    e_default = ScanEvidenceLog(run_id="run-001", evidence_type="diagnostic", message="test")
    assert e_default.severity == "info"


def test_profiling_result_placeholder_model():
    from app.db.models import ProfilingResultPlaceholder
    p = ProfilingResultPlaceholder(run_id="run-001", asset_id="asset-001", column_name="email")
    assert p.profiling_id is not None
    assert p.is_placeholder is True


def test_rule_result_placeholder_model():
    from app.db.models import RuleResultPlaceholder
    r = RuleResultPlaceholder(run_id="run-001", asset_id="asset-001", rule_name="not_null", rule_type="completeness")
    assert r.result_id is not None
    assert r.status == "pending"


def test_failed_sample_placeholder_model():
    from app.db.models import FailedSampleRecordPlaceholder
    f = FailedSampleRecordPlaceholder(run_id="run-001", asset_id="asset-001")
    assert f.sample_id is not None
    assert f.is_placeholder is True


def test_migration_0016_exists():
    import os
    assert os.path.exists("migrations/versions/0016_results_storage.py")


import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── write_run_summary ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_run_summary_creates_record():
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.status = "succeeded"
    mock_run.assets_scanned = 10
    mock_run.errors_count = 0
    mock_run.result_summary = {"tables_scanned": 10, "tables_failed": 0}

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    await write_run_summary(db, "run-001")

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    from app.db.models import ScanRunSummary
    assert isinstance(added, ScanRunSummary)
    assert added.run_id == "run-001"
    assert added.scan_type == "metadata_discovery"


@pytest.mark.asyncio
async def test_write_run_summary_skips_when_run_missing():
    from app.services.results_store import write_run_summary

    db = AsyncMock()
    db.get.return_value = None

    await write_run_summary(db, "ghost-run")

    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_write_run_summary_skips_duplicate():
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.status = "succeeded"
    mock_run.assets_scanned = 5
    mock_run.errors_count = 0
    mock_run.result_summary = None

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    existing_summary = MagicMock()
    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=existing_summary)

    await write_run_summary(db, "run-001")

    db.add.assert_not_called()


# ─── write_asset_summary ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_asset_summary_creates_record():
    from app.services.results_store import write_asset_summary

    db = AsyncMock()
    await write_asset_summary(
        db=db,
        run_id="run-001",
        asset_id="asset-001",
        job_id="job-001",
        scan_status="succeeded",
        scan_duration_ms=250,
        row_count=5000,
        bytes=102400,
        column_count=12,
        schema_hash="abc123",
    )

    db.add.assert_called_once()
    from app.db.models import AssetScanSummary
    added = db.add.call_args[0][0]
    assert isinstance(added, AssetScanSummary)
    assert added.run_id == "run-001"
    assert added.scan_status == "succeeded"
    assert added.row_count == 5000


# ─── record_metrics ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_metrics_writes_rows():
    from app.services.results_store import record_metrics
    from datetime import date

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)
    await record_metrics(
        db=db,
        asset_id="asset-001",
        run_id="run-001",
        metric_date=date(2026, 6, 10),
        metrics={"row_count": 1000.0, "column_count": 15.0},
    )

    assert db.add.call_count == 2
    from app.db.models import ScanMetricsHistory
    calls = [c[0][0] for c in db.add.call_args_list]
    names = {m.metric_name for m in calls}
    assert names == {"row_count", "column_count"}


@pytest.mark.asyncio
async def test_record_metrics_skips_none_values():
    from app.services.results_store import record_metrics
    from datetime import date

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)
    await record_metrics(
        db=db,
        asset_id="asset-001",
        run_id="run-001",
        metric_date=date(2026, 6, 10),
        metrics={"row_count": 500.0, "quality_score": None},
    )

    assert db.add.call_count == 1


# ─── append_evidence ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_append_evidence_creates_log():
    from app.services.results_store import append_evidence

    db = AsyncMock()
    await append_evidence(
        db=db,
        run_id="run-001",
        evidence_type="schema_drift",
        severity="warning",
        message="Column 'email' was dropped",
        asset_id="asset-001",
        payload={"column": "email", "change": "dropped"},
    )

    db.add.assert_called_once()
    from app.db.models import ScanEvidenceLog
    added = db.add.call_args[0][0]
    assert isinstance(added, ScanEvidenceLog)
    assert added.severity == "warning"
    assert added.asset_id == "asset-001"


# ─── get_run_summary ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_run_summary_returns_record():
    from app.services.results_store import get_run_summary

    mock_summary = MagicMock()
    mock_summary.run_id = "run-001"
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=mock_summary)

    result = await get_run_summary(db, "run-001")

    assert result is mock_summary


@pytest.mark.asyncio
async def test_get_run_summary_returns_none_when_missing():
    from app.services.results_store import get_run_summary

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    result = await get_run_summary(db, "ghost-run")

    assert result is None


# ─── get_asset_latest ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_asset_latest_returns_most_recent():
    from app.services.results_store import get_asset_latest

    mock_summary = MagicMock()
    mock_summary.asset_id = "asset-001"
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=mock_summary)

    result = await get_asset_latest(db, "asset-001")

    assert result.asset_id == "asset-001"


# ─── get_asset_trend ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_asset_trend_returns_list():
    from app.services.results_store import get_asset_trend

    mock_points = [MagicMock(), MagicMock()]
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = mock_points

    result = await get_asset_trend(db, "asset-001", "row_count")

    assert len(result) == 2


# ─── compare_runs ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_compare_runs_computes_delta():
    from app.services.results_store import compare_runs

    def _make_summary(run_id, new_assets, updated_assets, failed_assets, schema_changes):
        s = MagicMock()
        s.run_id = run_id
        s.job_id = "job-001"
        s.summary_id = f"sum-{run_id}"
        s.connection_id = None
        s.scan_type = "metadata_discovery"
        s.new_assets_count = new_assets
        s.updated_assets_count = updated_assets
        s.removed_assets_count = 0
        s.failed_assets_count = failed_assets
        s.schema_changes_count = schema_changes
        s.quality_score_avg = None
        s.scan_parameters = None
        s.created_at = "2026-06-10T10:00:00"
        return s

    run_a = _make_summary("run-001", new_assets=5, updated_assets=10, failed_assets=0, schema_changes=1)
    run_b = _make_summary("run-002", new_assets=8, updated_assets=12, failed_assets=2, schema_changes=3)

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(side_effect=[run_a, run_b])

    result = await compare_runs(db, "run-001", "run-002")

    assert result["delta"]["new_assets_delta"] == 3
    assert result["delta"]["failed_assets_delta"] == 2
    assert result["delta"]["schema_changes_delta"] == 2


@pytest.mark.asyncio
async def test_compare_runs_raises_when_run_missing():
    from app.services.results_store import compare_runs

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with pytest.raises(ValueError, match="not found"):
        await compare_runs(db, "ghost-a", "ghost-b")


@pytest.mark.asyncio
async def test_get_run_asset_summaries_returns_list():
    from app.services.results_store import get_run_asset_summaries

    mock_rows = [MagicMock(), MagicMock(), MagicMock()]
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = mock_rows

    result = await get_run_asset_summaries(db, "run-001")

    assert len(result) == 3


@pytest.mark.asyncio
async def test_get_asset_run_summary_returns_single_record():
    from app.services.results_store import get_asset_run_summary

    mock_summary = MagicMock()
    mock_summary.run_id = "run-001"
    mock_summary.asset_id = "asset-001"
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=mock_summary)

    result = await get_asset_run_summary(db, "run-001", "asset-001")

    assert result.run_id == "run-001"
    assert result.asset_id == "asset-001"


@pytest.mark.asyncio
async def test_get_run_evidence_returns_filtered_list():
    from app.services.results_store import get_run_evidence

    mock_logs = [MagicMock(), MagicMock()]
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = mock_logs

    result = await get_run_evidence(db, "run-001", severity="warning")

    assert len(result) == 2


@pytest.mark.asyncio
async def test_record_scan_result_calls_write_asset_summary_when_run_id_given():
    from app.services.metadata_store import record_scan_result

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with patch("app.services.metadata_store.results_store") as mock_rs:
        mock_rs.write_asset_summary = AsyncMock()
        mock_rs.record_metrics = AsyncMock()

        await record_scan_result(
            db=db,
            asset_id="asset-001",
            scan_status="success",
            scan_version="1.0.0",
            scan_duration_ms=300,
            row_count=1000,
            bytes=204800,
            last_modified_at=None,
            column_count=10,
            schema_hash="abc123",
            scan_run_id="run-001",
        )

    mock_rs.write_asset_summary.assert_called_once()
    call_kwargs = mock_rs.write_asset_summary.call_args.kwargs
    assert call_kwargs["run_id"] == "run-001"
    assert call_kwargs["asset_id"] == "asset-001"
    assert call_kwargs["scan_duration_ms"] == 300


@pytest.mark.asyncio
async def test_record_scan_result_no_run_id_skips_write_asset_summary():
    from app.services.metadata_store import record_scan_result

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with patch("app.services.metadata_store.results_store") as mock_rs:
        mock_rs.write_asset_summary = AsyncMock()

        await record_scan_result(
            db=db,
            asset_id="asset-001",
            scan_status="success",
            scan_version="1.0.0",
            scan_duration_ms=200,
            row_count=500,
            bytes=102400,
            last_modified_at=None,
            column_count=8,
            schema_hash="def456",
        )

    mock_rs.write_asset_summary.assert_not_called()


@pytest.mark.asyncio
async def test_execute_run_calls_write_run_summary_on_success():
    from app.services import scan_orchestrator

    with patch("app.services.scan_orchestrator._dispatch_handler", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = {
            "assets_scanned": 5,
            "errors_count": 0,
            "warnings_count": 0,
            "result_summary": None,
        }
        with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
            mock_db = AsyncMock()
            mock_run_first = MagicMock()
            mock_run_first.status = "queued"
            mock_run_first.job_id = "job-001"
            mock_run_second = MagicMock()
            mock_run_second.status = "running"
            mock_job = MagicMock()
            mock_job.job_type = "metadata_discovery"
            mock_job.connection_id = "conn-001"
            mock_job.timeout_seconds = 300
            mock_job.max_retries = 2
            mock_db.get.side_effect = [
                mock_run_first,  # first context — run fetch
                mock_job,        # first context — job fetch
                mock_run_second, # second context — run update fetch
                mock_job,        # second context — job update fetch
            ]
            mock_ctx.return_value.__aenter__.return_value = mock_db

            with patch("app.services.scan_orchestrator.results_store") as mock_rs:
                mock_rs.write_run_summary = AsyncMock()
                result = await scan_orchestrator._execute_run("run-001")

        mock_rs.write_run_summary.assert_called_once_with(mock_db, "run-001")


@pytest.mark.asyncio
async def test_record_metrics_upserts_on_duplicate_date():
    """Calling record_metrics twice on the same (asset, metric, date) must update, not raise."""
    from app.services.results_store import record_metrics
    from datetime import date

    today = date(2026, 6, 11)

    existing_metric = MagicMock()
    existing_metric.metric_value_num = 100.0
    existing_metric.run_id = "run-001"

    db = AsyncMock()

    # First call: no existing row → insert
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)
    await record_metrics(db, "asset-001", today, {"row_count": 100.0}, run_id="run-001")
    assert db.add.call_count == 1

    # Second call (same day): existing row → update, no second add
    db.add.reset_mock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=existing_metric)
    await record_metrics(db, "asset-001", today, {"row_count": 200.0}, run_id="run-002")
    db.add.assert_not_called()
    assert existing_metric.metric_value_num == 200.0
    assert existing_metric.run_id == "run-002"


@pytest.mark.asyncio
async def test_write_run_summary_maps_new_assets_count():
    """write_run_summary must read new_assets from result_summary, not default to 0."""
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.assets_scanned = 5
    mock_run.errors_count = 1
    mock_run.warnings_count = 0
    mock_run.error_message = None
    mock_run.result_summary = {
        "tables_scanned": 4,
        "tables_failed": 1,
        "tables_total": 5,
        "new_assets": 3,
        "updated_assets": 1,
        "removed_assets": 0,
    }
    mock_run.parameters = None

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    await write_run_summary(db, "run-001")

    added = db.add.call_args[0][0]
    assert added.new_assets_count == 3
    assert added.updated_assets_count == 1
    assert added.failed_assets_count == 1
