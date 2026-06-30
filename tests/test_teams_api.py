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
    no_existing = MagicMock()
    no_existing.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute.return_value = no_existing
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
    existing = MagicMock()
    existing.scalar_one_or_none.return_value = _make_mock_team()
    db = AsyncMock()
    db.execute.return_value = existing
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
    not_found = MagicMock()
    not_found.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute.return_value = not_found
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
    found = MagicMock()
    found.scalar_one_or_none.return_value = mock_membership
    db = AsyncMock()
    db.execute.return_value = found
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    result = await remove_member("team-001", "user-001", db=db, admin={"email": "admin@example.com"})
    assert result["message"] == "Member removed"


def test_user_roles_routes_exist():
    from app.api.users import router
    paths = {r.path for r in router.routes}
    assert "/users/{user_id}/roles" in paths


@pytest.mark.asyncio
async def test_assign_role_to_user_returns_user_role_id():
    from app.api.users import assign_user_role

    mock_user = MagicMock()
    mock_user.user_id = "user-001"

    def make_result(val):
        r = MagicMock()
        r.scalar_one_or_none.return_value = val
        return r

    db = AsyncMock()
    db.execute.side_effect = [
        make_result(mock_user),   # user lookup
        make_result(None),        # existing role check (not already assigned)
    ]
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await assign_user_role(
        "user-001",
        {"role": "data_steward"},
        db=db,
        admin={"email": "admin@example.com"},
    )
    assert "user_role_id" in result
    assert result["role"] == "data_steward"


@pytest.mark.asyncio
async def test_assign_role_to_user_400_on_invalid_role():
    from app.api.users import assign_user_role
    from fastapi import HTTPException
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await assign_user_role(
            "user-001",
            {"role": "bogus_role"},
            db=db,
            admin={"email": "admin@example.com"},
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_list_user_roles_returns_list():
    from app.api.users import list_user_roles
    from app.db.models import UserRole

    r1 = MagicMock(spec=UserRole)
    r1.user_role_id = "ur-001"
    r1.role = "analyst"
    r1.granted_by = "admin@example.com"
    r1.created_at = MagicMock()
    r1.created_at.isoformat.return_value = "2026-06-11T10:00:00"

    # Use MagicMock for the execute result, not AsyncMock
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [r1]

    db = AsyncMock()
    db.execute.return_value = mock_result

    result = await list_user_roles("user-001", db=db, _={"role": "admin"})
    assert result["user_id"] == "user-001"
    assert len(result["roles"]) == 1
    assert result["roles"][0]["role"] == "analyst"


@pytest.mark.asyncio
async def test_revoke_user_role_returns_message():
    from app.api.users import revoke_user_role
    from app.db.models import UserRole

    mock_ur = MagicMock(spec=UserRole)

    def make_result(val):
        r = MagicMock()
        r.scalar_one_or_none.return_value = val
        return r

    db = AsyncMock()
    db.add = MagicMock()  # db.add is synchronous in SQLAlchemy
    db.execute.return_value = make_result(mock_ur)
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    result = await revoke_user_role("user-001", "analyst", db=db, admin={"email": "admin@example.com"})
    assert result["message"] == "Role revoked"


def test_ownership_router_routes_exist():
    from app.api.ownership import router
    paths = {r.path for r in router.routes}
    assert "/assets/{asset_id}/ownership" in paths


@pytest.mark.asyncio
async def test_get_ownership_returns_owner_fields():
    from app.api.ownership import get_asset_ownership

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-001"
    mock_asset.owner_user_id = "user-001"
    mock_asset.owner_team_id = "team-001"
    mock_asset.steward_user_id = "user-002"
    mock_asset.owner_name = "Alice"
    mock_asset.owner_email = "alice@example.com"
    mock_asset.technical_owner_name = None
    mock_asset.technical_owner_email = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_asset
    db = AsyncMock()
    db.execute.return_value = mock_result

    result = await get_asset_ownership("asset-001", db=db, _={"role": "admin"})
    assert result["asset_id"] == "asset-001"
    assert result["owner_user_id"] == "user-001"
    assert result["steward_user_id"] == "user-002"


@pytest.mark.asyncio
async def test_get_ownership_returns_404_when_missing():
    from app.api.ownership import get_asset_ownership
    from fastapi import HTTPException

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await get_asset_ownership("ghost-asset", db=db, _={"role": "admin"})
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_set_ownership_updates_asset_fields():
    from app.api.ownership import set_asset_ownership

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-001"
    mock_asset.owner_user_id = None
    mock_asset.owner_team_id = None
    mock_asset.steward_user_id = None
    mock_asset.owner_name = None
    mock_asset.owner_email = None
    mock_asset.technical_owner_name = None
    mock_asset.technical_owner_email = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_asset
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.return_value = mock_result
    db.commit = AsyncMock()

    result = await set_asset_ownership(
        "asset-001",
        {"owner_user_id": "user-001", "steward_user_id": "user-002"},
        db=db,
        user={"email": "admin@example.com", "role": "admin"},
    )
    assert result["asset_id"] == "asset-001"
    assert mock_asset.owner_user_id == "user-001"
    assert mock_asset.steward_user_id == "user-002"


def test_notification_target_routes_exist():
    from app.api.teams import router
    paths = {r.path for r in router.routes}
    assert "/teams/notification-targets" in paths
    assert "/teams/notification-targets/{target_id}" in paths


@pytest.mark.asyncio
async def test_create_notification_target_returns_target_id():
    from app.api.teams import create_notification_target

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await create_notification_target(
        {
            "entity_type": "user",
            "entity_id": "user-001",
            "channel": "slack",
            "address": "#data-alerts",
            "label": "My Slack",
        },
        db=db,
        admin={"email": "admin@example.com", "role": "admin"},
    )
    assert "target_id" in result
    assert result["channel"] == "slack"


@pytest.mark.asyncio
async def test_create_notification_target_400_bad_channel():
    from app.api.teams import create_notification_target
    from fastapi import HTTPException

    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await create_notification_target(
            {"entity_type": "user", "entity_id": "u1", "channel": "carrier_pigeon", "address": "x"},
            db=db,
            admin={},
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_list_notification_targets_filters_by_entity():
    from app.api.teams import list_notification_targets
    from app.db.models import NotificationTarget

    nt = MagicMock(spec=NotificationTarget)
    nt.target_id = "nt-001"
    nt.entity_type = "user"
    nt.entity_id = "user-001"
    nt.channel = "email"
    nt.address = "alice@example.com"
    nt.label = None
    nt.is_active = True
    nt.created_at = MagicMock()
    nt.created_at.isoformat.return_value = "2026-06-11T10:00:00"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [nt]
    db = AsyncMock()
    db.execute.return_value = mock_result

    result = await list_notification_targets(entity_type="user", entity_id="user-001", db=db, _={"role": "admin"})
    assert len(result) == 1
    assert result[0]["channel"] == "email"


def test_my_permissions_route_exists():
    from app.api.users import router
    paths = {r.path for r in router.routes}
    assert "/auth/my-permissions" in paths


def test_teams_router_registered_in_main():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/teams" in p for p in paths), "teams router not registered in main.py"


def test_ownership_router_registered_in_main():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("ownership" in p or "/assets/" in p and "ownership" in p for p in paths), \
        "ownership router not registered — check /assets/{asset_id}/ownership"
