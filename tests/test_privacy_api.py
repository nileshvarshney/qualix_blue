def test_dsr_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("dsr" in p for p in routes)

def test_consent_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("consent" in p for p in routes)

def test_residency_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("residency" in p for p in routes)
