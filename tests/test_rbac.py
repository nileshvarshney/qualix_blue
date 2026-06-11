import pytest
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
