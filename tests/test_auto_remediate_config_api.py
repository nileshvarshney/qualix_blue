from unittest.mock import AsyncMock, patch
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


def _make_client(db_mock):
    """Mount the real rules router (not just the handler function) so route
    registration order is exercised exactly as it is in production. This is the
    only way to catch the bug where GET /auto-remediate-config was shadowed by
    GET /{rule_id} registered earlier in app/api/rules.py."""
    from app.api.rules import router
    from app.core.security import get_current_user, require_write
    from app.db.database import get_db

    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return ADMIN

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[require_write] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def test_auto_remediate_config_route_registered_before_rule_id_route():
    """GET /auto-remediate-config must resolve before the catch-all GET /{rule_id}
    route, otherwise it gets shadowed and any request to it 404s as 'Rule not found'."""
    from app.api.rules import router

    get_paths = [r.path for r in router.routes if "GET" in getattr(r, "methods", set())]
    assert "/rules/auto-remediate-config" in get_paths
    assert "/rules/{rule_id}" in get_paths
    assert get_paths.index("/rules/auto-remediate-config") < get_paths.index("/rules/{rule_id}")


def test_get_auto_remediate_config_via_router_does_not_404_as_rule_not_found():
    """End-to-end through the actual router/app (TestClient), not by calling the
    handler function directly — this is how the shadowing bug slipped past review."""
    db = AsyncMock()
    with patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "false",
            "auto_remediation_threshold": "10",
            "auto_remediation_rule_types": "[]",
        }[key]
        client = _make_client(db)
        resp = client.get("/rules/auto-remediate-config")

    assert resp.status_code == 200
    assert resp.json() == {"enabled": False, "threshold": 10, "rule_types": [], "last_updated": None}


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
