"""Tests that dashboard helpers respect an optional connection_scope filter,
so the global dashboard doesn't silently blend stats from every connection together."""
import pytest
from unittest.mock import AsyncMock, MagicMock


def _empty_rows_result():
    r = MagicMock()
    r.all.return_value = []
    r.scalars.return_value.all.return_value = []
    r.scalar.return_value = 0
    return r


@pytest.mark.asyncio
async def test_get_sla_breaches_filters_by_connection_scope():
    from app.api.dashboard import _get_sla_breaches

    captured = []
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.append(stmt)
        return _empty_rows_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    await _get_sla_breaches(db, connection_scope="conn-pg")

    assert len(captured) == 1
    compiled = str(captured[0].compile(compile_kwargs={"literal_binds": True}))
    assert "conn-pg" in compiled


@pytest.mark.asyncio
async def test_get_at_risk_tables_filters_by_connection_scope():
    from app.api.dashboard import _get_at_risk_tables

    captured = []
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.append(stmt)
        return _empty_rows_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    result = await _get_at_risk_tables(db, connection_scope="conn-pg")

    assert result == []
    assert len(captured) == 1
    compiled = str(captured[0].compile(compile_kwargs={"literal_binds": True}))
    assert "conn-pg" in compiled


@pytest.mark.asyncio
async def test_get_recently_fixed_filters_by_connection_scope():
    from app.api.dashboard import _get_recently_fixed

    captured = []
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.append(stmt)
        return _empty_rows_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    await _get_recently_fixed(db, connection_scope="conn-pg")

    assert len(captured) == 1
    compiled = str(captured[0].compile(compile_kwargs={"literal_binds": True}))
    assert "conn-pg" in compiled


@pytest.mark.asyncio
async def test_global_dashboard_scopes_counts_by_connection_id(monkeypatch):
    """/dashboard/global?connection_id=... must scope asset/rule/alert counts to that connection."""
    from app.api.dashboard import global_dashboard

    captured = []
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.append(stmt)
        r = MagicMock()
        r.scalar.return_value = 0
        r.all.return_value = []
        return r
    db.execute = AsyncMock(side_effect=execute_side_effect)

    async def _empty_trend(*_a, **_k):
        return []
    async def _empty_list(*_a, **_k):
        return []
    monkeypatch.setattr("app.api.dashboard._build_trend", _empty_trend)
    monkeypatch.setattr("app.api.dashboard._get_sla_breaches", _empty_list)
    monkeypatch.setattr("app.api.dashboard._get_at_risk_tables", _empty_list)
    monkeypatch.setattr("app.api.dashboard._get_recently_fixed", _empty_list)

    response = MagicMock()
    response.headers = {}
    user = {"email": "test@example.com", "role": "admin"}

    await global_dashboard(response, connection_id="conn-pg", db=db, user=user)

    compiled_all = " | ".join(
        str(stmt.compile(compile_kwargs={"literal_binds": True})) for stmt in captured
    )
    assert "conn-pg" in compiled_all
