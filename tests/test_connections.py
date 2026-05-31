"""Tests for platform/target connection separation."""
import pytest
from app.core.config import settings
from app.db.models import SnowflakeConnection


def test_platform_settings_use_sf_prefix():
    """Platform settings must use sf_platform_ prefix, not snowflake_."""
    assert hasattr(settings, "sf_platform_account")
    assert hasattr(settings, "sf_platform_user")
    assert hasattr(settings, "sf_platform_password")
    assert hasattr(settings, "sf_platform_warehouse")
    assert hasattr(settings, "sf_platform_role")


def test_removed_source_settings():
    """snowflake_database and snowflake_schema must not exist in settings."""
    assert not hasattr(settings, "snowflake_database")
    assert not hasattr(settings, "snowflake_schema")


def test_env_file_not_configured():
    """Settings must not reference a .env file."""
    config_class = settings.__class__
    model_config = getattr(config_class, "model_config", None)
    if model_config:
        assert model_config.get("env_file") is None
    else:
        inner = getattr(config_class, "Config", None)
        if inner:
            assert not hasattr(inner, "env_file") or getattr(inner, "env_file", None) is None


def test_snowflake_connection_has_new_columns():
    """SnowflakeConnection model must have connection_type and is_primary_target."""
    cols = {c.key for c in SnowflakeConnection.__table__.columns}
    assert "connection_type" in cols
    assert "is_primary_target" in cols


from app.services.config_service import CONFIG_DEFAULTS


def test_snowflake_appconfig_keys_removed():
    """AppConfig must not contain the old snowflake source-data keys."""
    removed_keys = {
        "snowflake_account", "snowflake_user", "snowflake_password",
        "snowflake_warehouse", "snowflake_database", "snowflake_schema", "snowflake_role",
    }
    existing_keys = {item["key"] for item in CONFIG_DEFAULTS}
    assert not removed_keys & existing_keys, f"These keys should be removed: {removed_keys & existing_keys}"


from app.api.connections import _mask
from unittest.mock import MagicMock


def _make_conn(**kwargs):
    """Build a mock SnowflakeConnection with defaults."""
    defaults = dict(
        connection_id="abc-123",
        connection_name="Test",
        account="myorg-myaccount",
        sf_user="dq_user",
        password="enc_pass",
        warehouse="DQ_WH",
        role="DQ_ROLE",
        default_database="MY_DB",
        default_schema="PUBLIC",
        description="desc",
        is_active=True,
        connection_type="named",
        is_primary_target=False,
        created_at=__import__("datetime").datetime(2026, 1, 1),
        updated_at=__import__("datetime").datetime(2026, 1, 1),
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


def test_mask_includes_new_fields():
    """_mask() must include connection_type and is_primary_target."""
    conn = _make_conn()
    result = _mask(conn)
    assert result["connection_type"] == "named"
    assert result["is_primary_target"] is False


def test_mask_primary_target():
    """_mask() must reflect is_primary_target=True when set."""
    conn = _make_conn(connection_type="target", is_primary_target=True)
    result = _mask(conn)
    assert result["connection_type"] == "target"
    assert result["is_primary_target"] is True


def test_platform_info_returns_expected_keys():
    """GET /config/platform-info response shape must match the spec."""
    from app.api.config import get_platform_info
    import asyncio
    result = asyncio.run(get_platform_info())
    assert "account" in result
    assert "user" in result
    assert "warehouse" in result
    assert "role" in result
    assert "app_database" in result
    assert "app_schema" in result
    assert "has_password" in result
    assert "password" not in result


import pytest
from unittest.mock import AsyncMock
from app.services.execution_service import _resolve_executor


@pytest.mark.asyncio
async def test_resolve_executor_uses_primary_target_as_fallback():
    """When asset has no connection and no named connections exist,
    _resolve_executor must use the primary target connection."""
    asset = MagicMock()
    asset.connection_id = None
    asset.sf_table_name = "test_table"

    primary_conn = MagicMock()
    primary_conn.connection_id = "primary-123"
    primary_conn.connection_name = "Primary Target"
    primary_conn.password = "enc_pass"

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        if call_count == 1:
            result.scalars.return_value.all.return_value = []
        elif call_count == 2:
            result.scalar_one_or_none.return_value = primary_conn
        return result

    db = AsyncMock()
    db.execute = mock_execute

    executor = await _resolve_executor(asset, db)
    assert executor is not None


@pytest.mark.asyncio
async def test_resolve_executor_raises_when_no_target():
    """When no connections exist and no primary target, raise RuntimeError."""
    asset = MagicMock()
    asset.connection_id = None
    asset.sf_table_name = "test_table"

    async def mock_execute(stmt):
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
        return result

    db = AsyncMock()
    db.execute = mock_execute

    with pytest.raises(RuntimeError, match="Settings.*Target Database"):
        await _resolve_executor(asset, db)
