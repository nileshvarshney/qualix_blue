"""Tests for _build_trend() alert/anomaly count enrichment and /dashboard/day-detail."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_build_trend_includes_zero_alert_and_anomaly_counts_when_none_exist():
    from app.api.dashboard import _build_trend

    db = AsyncMock()

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []
    empty_rows = MagicMock()
    empty_rows.all.return_value = []

    # Order of db.execute calls inside _build_trend: score query, raw-run
    # fallback query (missing_dates is non-empty since score_rows is empty),
    # alert count query, anomaly count query.
    db.execute = AsyncMock(side_effect=[empty_scalars, empty_scalars, empty_rows, empty_rows])

    trend = await _build_trend(db, days=2)

    assert len(trend) == 2
    for entry in trend:
        assert entry["alert_count"] == 0
        assert entry["anomaly_count"] == 0


@pytest.mark.asyncio
async def test_build_trend_counts_alerts_and_anomalies_for_their_date():
    from app.api.dashboard import _build_trend

    db = AsyncMock()
    today_dt = datetime.now(timezone.utc).replace(tzinfo=None)

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    alert_rows = MagicMock()
    alert_rows.all.return_value = [MagicMock(created_at=today_dt)]

    anomaly_rows = MagicMock()
    anomaly_rows.all.return_value = [MagicMock(detected_at=today_dt)]

    db.execute = AsyncMock(side_effect=[empty_scalars, empty_scalars, alert_rows, anomaly_rows])

    trend = await _build_trend(db, days=1)

    assert trend[0]["date"] == str(today_dt.date())
    assert trend[0]["alert_count"] == 1
    assert trend[0]["anomaly_count"] == 1


@pytest.mark.asyncio
async def test_day_detail_rejects_invalid_date_format():
    from fastapi import HTTPException
    from app.api.dashboard import day_detail

    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await day_detail(date_str="not-a-date", db=db, user={})

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_day_detail_returns_empty_lists_when_no_data():
    from app.api.dashboard import day_detail

    db = AsyncMock()
    empty_all = MagicMock()
    empty_all.all.return_value = []
    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[empty_all, empty_scalars, empty_scalars])

    result = await day_detail(date_str="2026-06-10", db=db, user={})

    assert result["date"] == "2026-06-10"
    assert result["failed_runs"] == []
    assert result["alerts"] == []
    assert result["anomalies"] == []


@pytest.mark.asyncio
async def test_day_detail_includes_failed_run_details():
    from app.api.dashboard import day_detail

    db = AsyncMock()
    run_mock = MagicMock(run_id="run-1", rule_id="rule-1", asset_id="asset-1", status="failed", failed_rows_count=5)
    runs_result = MagicMock()
    runs_result.all.return_value = [(run_mock, "not_null_check", "customers")]

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[runs_result, empty_scalars, empty_scalars])

    result = await day_detail(date_str="2026-06-10", db=db, user={})

    assert result["failed_runs"] == [{
        "run_id": "run-1", "rule_id": "rule-1", "rule_name": "not_null_check",
        "asset_id": "asset-1", "table_name": "customers",
        "status": "failed", "failed_rows_count": 5,
    }]
