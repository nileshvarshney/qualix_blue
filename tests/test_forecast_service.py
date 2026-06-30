from app.services.forecast_service import compute_forecast


def test_returns_correct_horizon_length():
    scores = [80, 82, 79, 83, 85, 81, 84, 80, 82, 78]
    result = compute_forecast(scores, horizon=7, window=7)
    assert result is not None
    assert len(result.forecast) == 7
    assert len(result.upper_band) == 7
    assert len(result.lower_band) == 7


def test_insufficient_history_returns_none():
    assert compute_forecast([80, 85]) is None
    assert compute_forecast([80]) is None
    assert compute_forecast([]) is None


def test_three_points_is_minimum():
    result = compute_forecast([80, 85, 90], horizon=3)
    assert result is not None
    assert len(result.forecast) == 3


def test_all_values_clamped_0_to_100():
    scores = [100.0] * 10
    result = compute_forecast(scores, horizon=3)
    assert all(0.0 <= v <= 100.0 for v in result.forecast)
    assert all(0.0 <= v <= 100.0 for v in result.upper_band)
    assert all(0.0 <= v <= 100.0 for v in result.lower_band)


def test_upper_band_geq_forecast():
    scores = [70, 75, 80, 72, 68, 78, 82, 76, 71, 85]
    result = compute_forecast(scores, horizon=5)
    assert all(u >= f for f, u in zip(result.forecast, result.upper_band))


def test_lower_band_leq_forecast():
    scores = [70, 75, 80, 72, 68, 78, 82, 76, 71, 85]
    result = compute_forecast(scores, horizon=5)
    assert all(l <= f for f, l in zip(result.forecast, result.lower_band))


def test_constant_scores_zero_std_bands_equal_forecast():
    """When all values are identical, std=0, so bands equal the forecast."""
    scores = [75.0] * 10
    result = compute_forecast(scores, horizon=3)
    for f, u, lo in zip(result.forecast, result.upper_band, result.lower_band):
        assert f == u == lo


def test_forecast_values_are_rounded_to_2_decimals():
    scores = [80.333, 82.111, 79.777, 83.5, 85.25, 81.6, 84.1, 80.0, 82.9, 78.4]
    result = compute_forecast(scores, horizon=3)
    for v in result.forecast:
        assert round(v, 2) == v


def test_window_larger_than_history_uses_full_history():
    scores = [80, 82, 79]
    result = compute_forecast(scores, horizon=2, window=10)
    assert result is not None
    assert len(result.forecast) == 2
