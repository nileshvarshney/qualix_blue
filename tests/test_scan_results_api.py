from __future__ import annotations


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
