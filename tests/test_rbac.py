from app.core.security import ROLES, ROLE_PERMISSIONS, has_permission

def test_all_phase1_roles_present():
    for role in ("admin", "data_steward", "data_engineer", "analyst", "viewer"):
        assert role in ROLES, f"Expected role {role!r} in ROLES"

def test_admin_has_all_permissions():
    for perm in ("manage_sources", "run_scans", "view_results",
                 "manage_assets", "manage_users", "edit_metadata"):
        assert has_permission({"role": "admin"}, perm), f"admin should have {perm}"

def test_viewer_has_only_view_results():
    assert has_permission({"role": "viewer"}, "view_results")
    assert not has_permission({"role": "viewer"}, "manage_users")
    assert not has_permission({"role": "viewer"}, "manage_sources")

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
