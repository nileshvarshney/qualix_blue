import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.core.security import ROLES, ROLE_PERMISSIONS, has_permission


def test_all_phase1_roles_present():
    for role in ("admin", "data_steward", "data_engineer", "analyst", "viewer"):
        assert role in ROLES, f"Expected role {role!r} in ROLES"

def test_admin_has_all_permissions():
    from app.core.security import ROLE_PERMISSIONS
    assert ROLE_PERMISSIONS["admin"] == {
        "manage_sources", "run_scans", "view_results",
        "manage_assets", "manage_users", "edit_metadata",
    }

def test_viewer_has_only_view_results():
    from app.core.security import ROLE_PERMISSIONS
    assert ROLE_PERMISSIONS["viewer"] == {"view_results"}

def test_data_steward_permissions():
    for perm in ("run_scans", "view_results", "manage_assets", "edit_metadata"):
        assert has_permission({"role": "data_steward"}, perm)
    assert not has_permission({"role": "data_steward"}, "manage_users")
    assert not has_permission({"role": "data_steward"}, "manage_sources")

def test_data_engineer_permissions():
    for perm in ("manage_sources", "run_scans", "view_results", "manage_assets", "edit_metadata"):
        assert has_permission({"role": "data_engineer"}, perm)
    assert not has_permission({"role": "data_engineer"}, "manage_users")

def test_analyst_permissions():
    assert has_permission({"role": "analyst"}, "view_results")
    assert not has_permission({"role": "analyst"}, "run_scans")
    assert not has_permission({"role": "analyst"}, "edit_metadata")

def test_unknown_role_has_no_permissions():
    assert not has_permission({"role": "ghost_role"}, "view_results")

def test_missing_role_key_has_no_permissions():
    assert not has_permission({}, "view_results")


@pytest.mark.asyncio
async def test_require_permission_grants_access_for_permitted_role():
    from app.core.security import require_permission
    checker = require_permission("view_results")
    result = await checker(user={"role": "admin", "email": "admin@test.com"})
    assert result["role"] == "admin"


@pytest.mark.asyncio
async def test_require_permission_raises_403_for_unpermitted_role():
    from app.core.security import require_permission
    checker = require_permission("manage_users")
    with pytest.raises(HTTPException) as exc_info:
        await checker(user={"role": "viewer"})
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_only_admin_has_manage_users():
    from app.core.security import ROLE_PERMISSIONS
    roles_with_manage_users = [r for r, perms in ROLE_PERMISSIONS.items() if "manage_users" in perms]
    assert roles_with_manage_users == ["admin"]
    for role in ("data_steward", "data_engineer", "analyst", "viewer", "domain_owner", "data_owner", "auditor"):
        assert not has_permission({"role": role}, "manage_users")


def test_team_model_importable():
    from app.db.models import Team, TeamMembership, UserRole, TeamRole, NotificationTarget
    assert Team.__tablename__ == "teams"
    assert TeamMembership.__tablename__ == "team_memberships"
    assert UserRole.__tablename__ == "user_roles"
    assert TeamRole.__tablename__ == "team_roles"
    assert NotificationTarget.__tablename__ == "notification_targets"

def test_team_has_required_columns():
    from app.db.models import Team
    cols = {c.key for c in Team.__table__.columns}
    for col in ("team_id", "team_name", "is_active", "created_by", "created_at", "updated_at"):
        assert col in cols, f"Team missing column: {col}"

def test_user_role_has_required_columns():
    from app.db.models import UserRole
    cols = {c.key for c in UserRole.__table__.columns}
    for col in ("user_role_id", "user_id", "role", "granted_by", "created_at"):
        assert col in cols, f"UserRole missing column: {col}"

def test_notification_target_has_required_columns():
    from app.db.models import NotificationTarget
    cols = {c.key for c in NotificationTarget.__table__.columns}
    for col in ("target_id", "entity_type", "entity_id", "channel", "address", "is_active"):
        assert col in cols, f"NotificationTarget missing column: {col}"


@pytest.mark.asyncio
async def test_get_user_effective_roles_primary_only():
    from app.services.rbac import get_user_effective_roles

    def make_result(rows):
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        return result

    db = AsyncMock()
    # user_roles query returns nothing, team memberships return nothing
    db.execute.side_effect = [make_result([]), make_result([])]
    roles = await get_user_effective_roles("user-123", "data_steward", db)
    assert "data_steward" in roles

@pytest.mark.asyncio
async def test_get_user_effective_roles_merges_extra_roles():
    from app.services.rbac import get_user_effective_roles
    from app.db.models import UserRole

    def make_result(rows):
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        return result

    extra = MagicMock(spec=UserRole)
    extra.role = "analyst"
    db = AsyncMock()
    # first call (user_roles query) returns extra role, second (memberships) returns empty
    db.execute.side_effect = [make_result([extra]), make_result([])]
    roles = await get_user_effective_roles("user-123", "data_steward", db)
    assert "data_steward" in roles
    assert "analyst" in roles

def test_get_effective_permissions_from_roles():
    from app.services.rbac import get_effective_permissions
    perms = get_effective_permissions(["admin"])
    assert "manage_users" in perms
    assert "view_results" in perms

def test_get_effective_permissions_merges_multiple_roles():
    from app.services.rbac import get_effective_permissions
    perms = get_effective_permissions(["analyst", "data_engineer"])
    assert "view_results" in perms
    assert "manage_sources" in perms

def test_get_effective_permissions_empty_roles():
    from app.services.rbac import get_effective_permissions
    assert get_effective_permissions([]) == set()


@pytest.mark.asyncio
async def test_get_user_effective_roles_inherits_team_roles():
    from app.services.rbac import get_user_effective_roles
    from app.db.models import TeamMembership, TeamRole

    mock_membership = MagicMock(spec=TeamMembership)
    mock_membership.team_id = "team-001"

    mock_team_role = MagicMock(spec=TeamRole)
    mock_team_role.role = "data_engineer"

    def make_result(items):
        r = MagicMock()
        r.scalars.return_value.all.return_value = items
        return r

    db = AsyncMock()
    # Call 1: user_roles query → empty
    # Call 2: team memberships → one team
    # Call 3: team_roles for those teams → data_engineer role
    db.execute.side_effect = [
        make_result([]),               # user_roles: no direct extra roles
        make_result([mock_membership]),  # team_memberships: one team
        make_result([mock_team_role]),   # team_roles: data_engineer inherited
    ]

    roles = await get_user_effective_roles("user-123", "viewer", db)
    assert "viewer" in roles
    assert "data_engineer" in roles
    # Should have called execute 3 times (user_roles, memberships, team_roles)
    assert db.execute.call_count == 3


@pytest.mark.asyncio
async def test_no_credentials_always_raises_401():
    """get_current_user must never return a synthetic admin — it must raise 401."""
    from unittest.mock import MagicMock, patch
    from app.core.security import get_current_user

    mock_request = MagicMock()
    mock_request.headers.get.return_value = None  # no X-API-Key

    with patch("app.core.security.settings") as mock_settings:
        mock_settings.auth_required = False  # simulate the insecure legacy env
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request=mock_request, credentials=None)
        assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_no_credentials_raises_401_when_auth_required_true():
    """Regression: 401 also fires when auth_required=True (should already work)."""
    from unittest.mock import MagicMock, patch
    from app.core.security import get_current_user

    mock_request = MagicMock()
    mock_request.headers.get.return_value = None

    with patch("app.core.security.settings") as mock_settings:
        mock_settings.auth_required = True
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request=mock_request, credentials=None)
        assert exc_info.value.status_code == 401
