from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_version(version_number=1):
    v = MagicMock()
    v.version_id = f"ver-{version_number:03d}"
    v.policy_id = "pol-001"
    v.version_number = version_number
    v.changed_by = "admin@example.com"
    v.changed_at = MagicMock()
    v.changed_at.isoformat.return_value = f"2026-06-19T10:0{version_number}:00"
    v.change_summary = "Approved"
    v.field_diffs = [{"field": "severity", "old_value": "medium", "new_value": "high"}]
    v.snapshot = {"policy_name": "Test Policy", "severity": "high"}
    return v


def test_policy_versions_route_registered():
    from app.api.governance import router
    paths = {r.path for r in router.routes}
    assert "/governance/policies/{policy_id}/versions" in paths


@pytest.mark.asyncio
async def test_list_policy_versions_returns_newest_first():
    from app.api.governance import list_policy_versions
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_version(2), _make_version(1)]
    db.execute.return_value = res

    result = await list_policy_versions(policy_id="pol-001", db=db)

    assert len(result) == 2
    assert result[0]["version_number"] == 2
    assert result[1]["version_number"] == 1
    assert result[0]["field_diffs"] == [{"field": "severity", "old_value": "medium", "new_value": "high"}]
