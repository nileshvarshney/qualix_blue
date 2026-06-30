# tests/test_monitoring_service.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, date, timezone, timedelta


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── predict_sla_breaches tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_predict_sla_at_risk():
    """lower_band dips below SLA threshold → is_at_risk=True, breach_day set."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()

    # SLAConfig: min_quality_score=90.0
    sla = MagicMock()
    sla.entity_id = "asset-1"
    sla.min_quality_score = 90.0

    # Quality scores: last 10 days all at 91, trending down
    scores = [MagicMock() for _ in range(10)]
    for i, s in enumerate(scores):
        s.quality_score = 91.0 - i * 0.5   # 91, 90.5, 90, 89.5, ...
        s.score_date = date.today() - timedelta(days=i)

    existing_pred = None  # No existing prediction

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str or hasattr(q, '_where_criteria') and "entity_type" in str(q):
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = scores
        elif "sla_breach_predictions" in stmt_str:
            result.scalar_one_or_none.return_value = existing_pred
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 1
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.is_at_risk is True
    assert added.breach_day is not None
    assert 0 <= added.breach_probability <= 1.0


@pytest.mark.asyncio
async def test_predict_sla_safe():
    """All forecast lower_band stays above threshold → is_at_risk=False."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()

    sla = MagicMock()
    sla.entity_id = "asset-2"
    sla.min_quality_score = 70.0

    scores = [MagicMock() for _ in range(10)]
    for i, s in enumerate(scores):
        s.quality_score = 95.0
        s.score_date = date.today() - timedelta(days=i)

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str:
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = scores
        elif "sla_breach_predictions" in stmt_str:
            result.scalar_one_or_none.return_value = None
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 1
    added = mock_db.add.call_args[0][0]
    assert added.is_at_risk is False
    assert added.breach_day is None
    assert added.breach_probability == 0.0


@pytest.mark.asyncio
async def test_predict_sla_insufficient_data():
    """Fewer than 3 quality scores → asset is skipped, count=0."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()
    sla = MagicMock()
    sla.entity_id = "asset-3"
    sla.min_quality_score = 90.0

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str:
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = [MagicMock(quality_score=88.0, score_date=date.today())]
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 0
    mock_db.add.assert_not_called()


# ─── check_correlation tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_correlation_creates_incident():
    """3 distinct assets with anomalies in 15-min window → incident created."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(3)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "medium"

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        elif "correlated_incidents" in stmt_str:
            result.scalar_one_or_none.return_value = None  # no existing incident
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is not None
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.asset_count == 3
    assert added.status == "open"


@pytest.mark.asyncio
async def test_check_correlation_too_few_assets():
    """Only 2 distinct assets in window → no incident, returns None."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(2)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "medium"

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        else:
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is None
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_check_correlation_existing_open_incident():
    """Open incident already created within 30-min guard window → no new incident."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(3)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "high"

    existing = MagicMock()  # existing open incident

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        elif "correlated_incidents" in stmt_str:
            result.scalar_one_or_none.return_value = existing
        else:
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is None
    mock_db.add.assert_not_called()


# ─── collect_asset_metrics tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_collect_metrics_idempotent():
    """Second call on same day for an asset skips if metric already exists."""
    from app.services.monitoring_service import collect_asset_metrics

    mock_db = AsyncMock()

    asset = MagicMock()
    asset.asset_id = "asset-1"
    asset.connection_id = None
    asset.sf_table_name = None  # no Snowflake table → row_count stays None

    existing_metric = MagicMock()  # already recorded today

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "assets" in stmt_str and "is_active" in stmt_str:
            result.scalars.return_value.all.return_value = [asset]
        elif "dq_rule_runs" in stmt_str:
            result.scalar_one_or_none.return_value = None
        elif "asset_monitoring_metrics" in stmt_str:
            result.scalar_one_or_none.return_value = existing_metric
        elif "column_metadata" in stmt_str:
            result.scalars.return_value.all.return_value = []
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await collect_asset_metrics(mock_db)
    assert count == 0  # skipped — already recorded today
    mock_db.add.assert_not_called()
