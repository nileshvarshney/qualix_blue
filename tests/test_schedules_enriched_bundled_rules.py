from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.schedules import list_schedules_enriched
from app.db.models import Asset, DQRule, DQRuleRun, DQSchedule


def _scalars_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _scalar_one_result(item):
    result = MagicMock()
    result.scalar_one_or_none.return_value = item
    return result


@pytest.mark.asyncio
async def test_table_level_schedule_includes_disabled_rule_with_run_info():
    schedule = MagicMock(spec=DQSchedule)
    schedule.schedule_id = "sch-1"
    schedule.schedule_name = "orders-daily"
    schedule.rule_id = None
    schedule.rule_ids = None
    schedule.asset_id = "asset-1"
    schedule.domain_id = None
    schedule.subdomain_id = None
    schedule.schedule_level = "table"
    schedule.frequency = "daily"
    schedule.cron_expression = "0 2 * * *"
    schedule.timezone = "UTC"
    schedule.run_at_hour = 2
    schedule.run_at_minute = 0
    schedule.is_active = True
    schedule.created_at = datetime(2026, 6, 1, tzinfo=timezone.utc)
    schedule.updated_at = datetime(2026, 6, 1, tzinfo=timezone.utc)

    asset = MagicMock(spec=Asset)
    asset.asset_id = "asset-1"
    asset.sf_database_name = "ANALYTICS"
    asset.sf_schema_name = "PUBLIC"
    asset.sf_table_name = "ORDERS"
    asset.connection_id = None

    rule_active = MagicMock(spec=DQRule)
    rule_active.rule_id = "rule-1"
    rule_active.rule_name = "order_id not null"
    rule_active.rule_description = "Ensures order_id has no missing values"
    rule_active.severity = "critical"
    rule_active.status = "active"

    rule_disabled = MagicMock(spec=DQRule)
    rule_disabled.rule_id = "rule-2"
    rule_disabled.rule_name = "discount check"
    rule_disabled.rule_description = "Discount must not exceed 100%"
    rule_disabled.severity = "medium"
    rule_disabled.status = "disabled"

    run_active = MagicMock(spec=DQRuleRun)
    run_active.rule_id = "rule-1"
    run_active.status = "passed"
    run_active.execution_start_time = datetime(2026, 6, 13, 2, 0, 0, tzinfo=timezone.utc)
    run_active.execution_end_time = datetime(2026, 6, 13, 2, 0, 1, 400000, tzinfo=timezone.utc)
    run_active.created_at = run_active.execution_end_time
    run_active.failed_rows_count = 0
    run_active.total_rows_scanned = 50000
    run_active.failure_percentage = 0.0
    run_active.error_message = None
    run_active.ai_explanation = None

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result([schedule]),       # select(DQSchedule)
        _scalar_one_result(asset),         # select(Asset)
        _scalars_result([rule_active, rule_disabled]),  # select(DQRule) bundled rules
        _scalar_one_result(run_active),    # select(DQRuleRun) for rule-1
        _scalar_one_result(None),          # select(DQRuleRun) for rule-2
    ]

    with patch("app.api.schedules.get_next_run", return_value="2026-06-14T02:00:00"):
        result = await list_schedules_enriched(db=db)

    bundled = result[0]["bundled_rules"]
    assert len(bundled) == 2

    active_entry = next(r for r in bundled if r["rule_id"] == "rule-1")
    assert active_entry["status"] == "active"
    assert active_entry["last_run_status"] == "passed"
    assert active_entry["last_duration_ms"] == 1400
    assert active_entry["next_run"] == "2026-06-14T02:00:00"

    disabled_entry = next(r for r in bundled if r["rule_id"] == "rule-2")
    assert disabled_entry["status"] == "disabled"
    assert disabled_entry["last_run_status"] is None
    assert disabled_entry["next_run"] is None
