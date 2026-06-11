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
