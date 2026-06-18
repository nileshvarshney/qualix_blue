"""_resume_warehouse runs on every session open (i.e. every request). It must not
issue a Snowflake round trip on every single request — only after the recheck
window has elapsed, or immediately again after a failure."""
import pytest
from unittest.mock import MagicMock
import app.db.database as database_module


@pytest.fixture(autouse=True)
def _reset_throttle_state():
    database_module._last_warehouse_resume_check = 0.0
    yield
    database_module._last_warehouse_resume_check = 0.0


@pytest.mark.asyncio
async def test_resumes_on_first_call():
    session = MagicMock()
    await database_module._resume_warehouse(session)
    assert session.execute.call_count == 1


@pytest.mark.asyncio
async def test_does_not_recheck_within_window():
    session = MagicMock()
    await database_module._resume_warehouse(session)
    await database_module._resume_warehouse(session)
    await database_module._resume_warehouse(session)
    assert session.execute.call_count == 1


@pytest.mark.asyncio
async def test_rechecks_after_window_elapses():
    session = MagicMock()
    await database_module._resume_warehouse(session)
    database_module._last_warehouse_resume_check -= database_module._WAREHOUSE_RECHECK_SECONDS + 1
    await database_module._resume_warehouse(session)
    assert session.execute.call_count == 2


@pytest.mark.asyncio
async def test_retries_immediately_after_failure():
    session = MagicMock()
    session.execute.side_effect = [Exception("warehouse down"), None]
    await database_module._resume_warehouse(session)
    await database_module._resume_warehouse(session)
    assert session.execute.call_count == 2
