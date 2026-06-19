from __future__ import annotations
import statistics
from dataclasses import dataclass
from typing import Optional


@dataclass
class ForecastResult:
    forecast: list[float]
    upper_band: list[float]
    lower_band: list[float]


def compute_forecast(
    scores: list[float],
    horizon: int = 7,
    window: int = 7,
) -> Optional[ForecastResult]:
    """
    Self-updating moving average forecast with 1.5-sigma confidence bands.

    Each projected point is fed back into the window so bands widen naturally
    over the forecast horizon.

    Returns None when fewer than 3 data points are provided.
    """
    if len(scores) < 3:
        return None

    effective_window = min(window, len(scores))
    projected = list(scores)
    forecast: list[float] = []
    upper_band: list[float] = []
    lower_band: list[float] = []

    for _ in range(horizon):
        window_vals = projected[-effective_window:]
        mean = sum(window_vals) / len(window_vals)
        std = statistics.stdev(window_vals) if len(window_vals) > 1 else 0.0

        forecast.append(round(max(0.0, min(100.0, mean)), 2))
        upper_band.append(round(max(0.0, min(100.0, mean + 1.5 * std)), 2))
        lower_band.append(round(max(0.0, min(100.0, mean - 1.5 * std)), 2))
        projected.append(mean)

    return ForecastResult(forecast=forecast, upper_band=upper_band, lower_band=lower_band)
