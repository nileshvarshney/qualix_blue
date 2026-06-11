# tests/test_teams_api.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_mock_team(team_id="team-001", team_name="Analytics"):
    t = MagicMock()
    t.team_id = team_id
    t.team_name = team_name
    t.description = "Analytics team"
    t.is_active = True
    t.created_by = "admin@example.com"
    t.created_at = MagicMock()
    t.created_at.isoformat.return_value = "2026-06-11T10:00:00"
    t.updated_at = MagicMock()
    t.updated_at.isoformat.return_value = "2026-06-11T10:00:00"
    return t


def _make_mock_membership(membership_id="mem-001", user_id="user-001", team_id="team-001"):
    m = MagicMock()
    m.membership_id = membership_id
    m.user_id = user_id
    m.team_id = team_id
    m.role_in_team = "member"
    m.created_by = "admin@example.com"
    m.created_at = MagicMock()
    m.created_at.isoformat.return_value = "2026-06-11T10:00:00"
    return m


def test_teams_router_has_expected_routes():
    from app.api.teams import router
    paths = {r.path for r in router.routes}
    assert "/teams" in paths
    assert "/teams/{team_id}" in paths
    assert "/teams/{team_id}/members" in paths
    assert "/teams/{team_id}/members/{user_id}" in paths


@pytest.mark.asyncio
async def test_create_team_returns_team_id():
    from app.api.teams import create_team, TeamCreate
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None  # no existing team
    db.add = MagicMock()
    db.commit = AsyncMock()
    admin = {"email": "admin@example.com", "role": "admin"}
    result = await create_team(
        TeamCreate(team_name="Analytics", description="Analytics team"),
        db=db,
        admin=admin,
    )
    assert "team_id" in result
    assert result["team_name"] == "Analytics"


@pytest.mark.asyncio
async def test_create_team_409_on_duplicate():
    from app.api.teams import create_team, TeamCreate
    from fastapi import HTTPException
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = _make_mock_team()
    with pytest.raises(HTTPException) as exc_info:
        await create_team(
            TeamCreate(team_name="Analytics"),
            db=db,
            admin={"email": "admin@example.com", "role": "admin"},
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_list_teams_returns_items():
    from app.api.teams import list_teams
    mock_teams = [_make_mock_team("t1", "Alpha"), _make_mock_team("t2", "Beta")]
    count_result = MagicMock()
    count_result.scalar.return_value = 2
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = mock_teams
    db = AsyncMock()
    db.execute.side_effect = [count_result, list_result]
    result = await list_teams(limit=100, offset=0, db=db, _={"role": "admin"})
    assert result["total"] == 2
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_get_team_returns_404_when_missing():
    from app.api.teams import get_team
    from fastapi import HTTPException
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None
    with pytest.raises(HTTPException) as exc_info:
        await get_team("ghost-team", db=db, _={"role": "admin"})
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_add_member_returns_membership_id():
    from app.api.teams import add_member, MemberAdd
    mock_team = _make_mock_team()
    mock_user = MagicMock()
    mock_user.user_id = "user-001"
    def make_result(val):
        r = MagicMock()
        r.scalar_one_or_none.return_value = val
        return r
    db = AsyncMock()
    db.execute.side_effect = [
        make_result(mock_team),   # team lookup
        make_result(mock_user),   # user lookup
        make_result(None),        # existing membership check
    ]
    db.add = MagicMock()
    db.commit = AsyncMock()
    result = await add_member(
        "team-001",
        MemberAdd(user_id="user-001"),
        db=db,
        admin={"email": "admin@example.com"},
    )
    assert "membership_id" in result


@pytest.mark.asyncio
async def test_remove_member_returns_message():
    from app.api.teams import remove_member
    mock_membership = _make_mock_membership()
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = mock_membership
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    result = await remove_member("team-001", "user-001", db=db, admin={"email": "admin@example.com"})
    assert result["message"] == "Member removed"
