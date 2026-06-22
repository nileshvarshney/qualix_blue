from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_observability_tick_calls_run_due_connections():
    from app.services.scheduler_service import _observability_tick

    with patch("app.db.database.AsyncSessionLocal") as mock_session_local, \
         patch("app.services.observability_engine.run_due_connections", new=AsyncMock(return_value=2)) as mock_run:
        mock_db = AsyncMock()
        mock_session_local.return_value.__aenter__.return_value = mock_db

        await _observability_tick()

        mock_run.assert_called_once_with(mock_db)


def test_nightly_drift_detect_job_removed():
    import app.services.scheduler_service as sched
    assert not hasattr(sched, "_nightly_drift_detect")
    assert not hasattr(sched, "_schedule_drift_detect_job")
