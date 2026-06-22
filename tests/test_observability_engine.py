from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
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
    assert baseline.readings == [1000, 1000, 1000, 400]


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


@pytest.mark.asyncio
async def test_check_volume_window_grows_across_calls():
    """Regression test: the rolling window must grow (1, 2, 3, ...) up to
    MAX_VOLUME_READINGS instead of staying stuck at size 1 after the first call."""
    from app.services.observability_engine import check_volume

    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    baseline.readings = None  # cold start: no prior readings

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    await check_volume(asset, 1000, mock_db)
    assert baseline.readings == [1000]

    await check_volume(asset, 1000, mock_db)
    assert baseline.readings == [1000, 1000]

    await check_volume(asset, 1000, mock_db)
    assert baseline.readings == [1000, 1000, 1000]

    await check_volume(asset, 2000, mock_db)
    assert baseline.readings == [1000, 1000, 1000, 2000]


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


# ─── check_schema_drift ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_schema_drift_no_baseline_initializes_no_finding():
    from app.services.observability_engine import check_schema_drift
    asset = MagicMock(asset_id="asset-1")

    with patch("app.services.schema_drift_service.get_active_baseline", new=AsyncMock(return_value=None)), \
         patch("app.services.schema_drift_service.initialize_baseline", new=AsyncMock()) as mock_init:
        mock_db = AsyncMock()
        findings = await check_schema_drift(asset, mock_db)
        assert findings == []
        mock_init.assert_called_once_with("asset-1", mock_db)


@pytest.mark.asyncio
async def test_check_schema_drift_with_events_returns_findings():
    from app.services.observability_engine import check_schema_drift
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    event = MagicMock(change_type="column_deleted", column_name="legacy_col")

    with patch("app.services.schema_drift_service.get_active_baseline", new=AsyncMock(return_value=baseline)), \
         patch("app.services.schema_drift_service.detect_drift", new=AsyncMock(return_value=[event])):
        mock_db = AsyncMock()
        findings = await check_schema_drift(asset, mock_db)
        assert len(findings) == 1
        assert findings[0]["alert_type"] == "schema_drift"
        assert findings[0]["severity"] == "high"
        assert findings[0]["column_name"] == "legacy_col"


# ─── create_observability_alert ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_observability_alert_dedup_skips_when_open_alert_exists():
    from app.services.observability_engine import create_observability_alert
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1")
    finding = {"alert_type": "volume_shift", "severity": "high", "message": "dropped"}

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = MagicMock()  # an open alert already exists
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()

    await create_observability_alert(asset, finding, mock_db)
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_observability_alert_creates_alert_and_issue():
    from app.services.observability_engine import create_observability_alert
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1", sf_table_name="orders")

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        r.scalar_one_or_none.return_value = None  # no existing open alert, no existing open issue
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    finding = {"alert_type": "volume_shift", "severity": "high", "message": "dropped 40%"}

    with patch("asyncio.create_task") as mock_task:
        await create_observability_alert(asset, finding, mock_db)

    assert mock_db.add.call_count == 2  # DQAlert + Issue
    added_types = {type(c.args[0]).__name__ for c in mock_db.add.call_args_list}
    assert added_types == {"DQAlert", "Issue"}
    mock_task.assert_called_once()


# ─── create_observability_issue ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_observability_issue_dedup_skips_when_open_issue_exists():
    from app.services.observability_engine import create_observability_issue
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1", sf_table_name="orders")
    finding = {"alert_type": "schema_drift", "severity": "high", "message": "col dropped"}

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = MagicMock()  # open issue already exists
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()

    await create_observability_issue(asset, finding, mock_db)
    mock_db.add.assert_not_called()


# ─── run_due_connections ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_due_connections_skips_not_due():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = _utcnow()  # just ran — not due yet
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 0
    mock_run.assert_not_called()


@pytest.mark.asyncio
async def test_run_due_connections_processes_due_connection_and_updates_last_run():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = _utcnow() - timedelta(minutes=20)
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 1
    mock_run.assert_called_once_with(config, mock_db)
    assert config.last_run_at is not None


@pytest.mark.asyncio
async def test_run_due_connections_first_run_when_last_run_at_is_none():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = None
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 1
    mock_run.assert_called_once()


# ─── _run_connection_checks ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_connection_checks_dispatches_enabled_checks_only():
    from app.services.observability_engine import _run_connection_checks
    config = MagicMock()
    config.connection_id = "conn-1"
    config.freshness_enabled = False
    config.volume_enabled = False
    config.schema_drift_enabled = True
    config.distribution_enabled = False

    asset = MagicMock(asset_id="asset-1", sf_database_name="DB", sf_schema_name="SCH", sf_table_name="TBL")

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [asset]
    mock_db.execute = AsyncMock(return_value=r)

    with patch("app.services.observability_engine._get_connector_for_connection", new=AsyncMock(return_value=None)), \
         patch("app.services.observability_engine.check_schema_drift", new=AsyncMock(return_value=[{"alert_type": "schema_drift", "severity": "high", "message": "x", "column_name": "c"}])) as mock_drift, \
         patch("app.services.observability_engine.create_observability_issue", new=AsyncMock()) as mock_issue, \
         patch("app.services.observability_engine.create_observability_alert", new=AsyncMock()) as mock_alert:
        await _run_connection_checks(config, mock_db)

    mock_drift.assert_called_once()
    mock_issue.assert_called_once()
    mock_alert.assert_not_called()


@pytest.mark.asyncio
async def test_run_connection_checks_continues_after_one_asset_fails():
    from app.services.observability_engine import _run_connection_checks
    config = MagicMock()
    config.connection_id = "conn-1"
    config.freshness_enabled = False
    config.volume_enabled = False
    config.schema_drift_enabled = True
    config.distribution_enabled = False

    bad_asset = MagicMock(asset_id="asset-bad")
    good_asset = MagicMock(asset_id="asset-good")

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [bad_asset, good_asset]
    mock_db.execute = AsyncMock(return_value=r)

    calls = []

    async def flaky_check(asset, db):
        calls.append(asset.asset_id)
        if asset.asset_id == "asset-bad":
            raise RuntimeError("boom")
        return []

    with patch("app.services.observability_engine._get_connector_for_connection", new=AsyncMock(return_value=None)), \
         patch("app.services.observability_engine.check_schema_drift", new=flaky_check):
        await _run_connection_checks(config, mock_db)  # must not raise

    assert calls == ["asset-bad", "asset-good"]  # both assets were actually checked


# ─── run_due_connections: connection-level failure isolation ──────────────────

@pytest.mark.asyncio
async def test_run_due_connections_continues_after_one_connection_fails():
    from app.services.observability_engine import run_due_connections

    original_last_run_at = _utcnow() - timedelta(minutes=20)

    failing_config = MagicMock()
    failing_config.is_enabled = True
    failing_config.interval_minutes = 15
    failing_config.last_run_at = original_last_run_at
    failing_config.connection_id = "conn-fail"

    ok_config = MagicMock()
    ok_config.is_enabled = True
    ok_config.interval_minutes = 15
    ok_config.last_run_at = original_last_run_at
    ok_config.connection_id = "conn-ok"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [failing_config, ok_config]
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    calls = []

    async def flaky_run(config, db):
        calls.append(config.connection_id)
        if config.connection_id == "conn-fail":
            raise RuntimeError("boom")
        return None

    with patch("app.services.observability_engine._run_connection_checks", new=flaky_run):
        processed = await run_due_connections(mock_db)

    # Both connections were attempted — the failure didn't stop the loop.
    assert calls == ["conn-fail", "conn-ok"]
    # Only the successful connection counts as processed this tick.
    assert processed == 1
    # The failing connection's last_run_at must NOT be advanced (it should
    # remain unchanged so it is retried next tick).
    assert failing_config.last_run_at == original_last_run_at
    # The succeeding connection's last_run_at WAS advanced.
    assert ok_config.last_run_at is not None
    assert ok_config.last_run_at != original_last_run_at
