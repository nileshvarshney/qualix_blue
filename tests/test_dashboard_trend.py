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
