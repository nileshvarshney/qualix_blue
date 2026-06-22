from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── check_freshness (pure function) ──────────────────────────────────────────

def test_check_freshness_within_threshold_no_finding():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=5)
    assert check_freshness(asset, last_modified, now_dt) is None


def test_check_freshness_breach_high():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=30)
    finding = check_freshness(asset, last_modified, now_dt)
    assert finding["alert_type"] == "freshness_breach"
    assert finding["severity"] == "high"


def test_check_freshness_breach_critical():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=50)
    finding = check_freshness(asset, last_modified, now_dt)
    assert finding["severity"] == "critical"


def test_check_freshness_no_data_no_finding():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    assert check_freshness(asset, None, _utcnow()) is None


# ─── check_volume ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_volume_cold_start_no_finding():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = None  # no existing baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 1000, mock_db)
    assert finding is None
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.readings == [1000]


@pytest.mark.asyncio
async def test_check_volume_drop_triggers_critical():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    baseline.readings = [1000, 1000, 1000]
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 400, mock_db)  # 60% drop
    assert finding["alert_type"] == "volume_shift"
    assert finding["severity"] == "critical"
    assert baseline.readings == [1000, 1000, 400]


@pytest.mark.asyncio
async def test_check_volume_within_threshold_no_finding():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    baseline.readings = [1000, 1000]
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 950, mock_db)  # 5% drop
    assert finding is None


# ─── check_distribution ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_distribution_establishes_baseline_no_finding():
    from app.services.observability_engine import check_distribution
    asset = MagicMock(asset_id="asset-1")
    col = MagicMock()
    col.column_name = "amount"
    col.data_type = "NUMBER"
    col.avg_value = 100.0
    col.std_dev = 10.0
    col.min_value = "0"
    col.max_value = "500"

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        if call_no[0] == 1:
            r.scalars.return_value.all.return_value = [col]
        else:
            r.scalar_one_or_none.return_value = None  # no baseline yet
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    findings = await check_distribution(asset, mock_db)
    assert findings == []
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_check_distribution_shift_triggers_high():
    from app.services.observability_engine import check_distribution
    asset = MagicMock(asset_id="asset-1")
    col = MagicMock()
    col.column_name = "amount"
    col.data_type = "NUMBER"
    col.avg_value = 200.0
    col.std_dev = 10.0
    col.min_value = "0"
    col.max_value = "500"

    baseline = MagicMock()
    baseline.baseline_avg = 100.0
    baseline.baseline_std_dev = 10.0

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        if call_no[0] == 1:
            r.scalars.return_value.all.return_value = [col]
        else:
            r.scalar_one_or_none.return_value = baseline
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.commit = AsyncMock()

    findings = await check_distribution(asset, mock_db)
    assert len(findings) == 1
    assert findings[0]["alert_type"] == "distribution_shift"
    assert findings[0]["severity"] == "high"
    assert findings[0]["column_name"] == "amount"
