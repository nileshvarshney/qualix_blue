from unittest.mock import AsyncMock, patch
import pytest
from fastapi import HTTPException

ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


@pytest.mark.asyncio
async def test_get_auto_remediate_config_returns_defaults():
    from app.api.rules import get_auto_remediate_config

    db = AsyncMock()
    with patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "false",
            "auto_remediation_threshold": "10",
            "auto_remediation_rule_types": "[]",
        }[key]
        out = await get_auto_remediate_config(db=db, user=ADMIN)

    assert out == {"enabled": False, "threshold": 10, "rule_types": [], "last_updated": None}


@pytest.mark.asyncio
async def test_post_auto_remediate_config_writes_three_keys():
    from app.api.rules import update_auto_remediate_config, AutoRemediateConfigRequest

    db = AsyncMock()
    body = AutoRemediateConfigRequest(enabled=True, threshold=15, rule_types=["freshness_check", "volume_check"])

    with patch("app.services.config_service.set_value", new_callable=AsyncMock) as mock_set, \
         patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "true",
            "auto_remediation_threshold": "15",
            "auto_remediation_rule_types": '["freshness_check", "volume_check"]',
        }[key]
        out = await update_auto_remediate_config(body, db=db, user=ADMIN)

    assert mock_set.call_count == 3
    written_keys = {call.args[0] for call in mock_set.call_args_list}
    assert written_keys == {"auto_remediation_enabled", "auto_remediation_threshold", "auto_remediation_rule_types"}
    assert out["enabled"] is True
    assert out["rule_types"] == ["freshness_check", "volume_check"]


@pytest.mark.asyncio
async def test_get_auto_remediate_config_defaults_threshold_on_bad_value():
    from app.api.rules import get_auto_remediate_config

    db = AsyncMock()
    with patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "false",
            "auto_remediation_threshold": "not-a-number",
            "auto_remediation_rule_types": "[]",
        }[key]
        out = await get_auto_remediate_config(db=db, user=ADMIN)

    assert out["threshold"] == 0


@pytest.mark.asyncio
async def test_post_auto_remediate_config_translates_value_error():
    from app.api.rules import update_auto_remediate_config, AutoRemediateConfigRequest

    db = AsyncMock()
    body = AutoRemediateConfigRequest(enabled=True, threshold=15, rule_types=["freshness_check"])

    with patch("app.services.config_service.set_value", new_callable=AsyncMock) as mock_set:
        mock_set.side_effect = ValueError("Unknown config key: auto_remediation_enabled")
        with pytest.raises(HTTPException) as exc_info:
            await update_auto_remediate_config(body, db=db, user=ADMIN)

    assert exc_info.value.status_code == 500
