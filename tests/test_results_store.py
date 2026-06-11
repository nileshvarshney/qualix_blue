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
