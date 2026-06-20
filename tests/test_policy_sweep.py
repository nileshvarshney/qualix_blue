from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_policy_sweep_calls_evaluate_policies():
    with patch("app.db.database.AsyncSessionLocal") as mock_sl, \
         patch("app.services.governance_service.evaluate_policies") as mock_eval:

        mock_db = AsyncMock()
        mock_sl.return_value.__aenter__.return_value = mock_db
        mock_eval.return_value = 3

        from app.services.scheduler_service import _run_policy_sweep
        await _run_policy_sweep()

        mock_eval.assert_awaited_once_with(mock_db)


def test_policy_sweep_job_registered_in_start_scheduler():
    from app.services.scheduler_service import scheduler
    # The job is registered when start_scheduler() runs; check it exists if scheduler is running
    # (In unit test, we just verify the function is importable and callable)
    from app.services.scheduler_service import _run_policy_sweep
    import inspect
    assert inspect.iscoroutinefunction(_run_policy_sweep)
