def test_auto_map_rules_to_controls_importable():
    from app.db.seed import auto_map_rules_to_controls
    import inspect
    assert inspect.iscoroutinefunction(auto_map_rules_to_controls)
