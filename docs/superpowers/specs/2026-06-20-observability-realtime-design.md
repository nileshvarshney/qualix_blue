# Observability & Monitoring — Real-Time Enhancement Design

**Date:** 2026-06-20  
**Status:** Approved

## Problem

The existing observability system is entirely schedule-triggered. Nothing fires between cron runs. Freshness and volume are only observed when a user manually creates a `freshness_check` or `volume_check` rule on a specific table. There is no browser-side push or polling. Schema drift detection only runs nightly or on asset-page visit. There is no cross-table correlation and no SLA breach prediction — despite a `forecast_service.py` that already computes moving-average forecasts.

## Goals

1. Automatic freshness + volume baseline monitoring for all active assets — no user setup required.
2. SLA breach prediction using the existing forecast service — pre-computed nightly.
3. Cross-table anomaly correlation — flag when 3+ assets degrade in the same 15-minute window.
4. A dedicated `/observability` frontend hub showing all signals.
5. A correlated-incident banner on the main dashboard.
6. 30-second client-side polling replacing manual load-only fetches.

## Non-Goals

- WebSocket / SSE push (the existing `/observability/events/stream` endpoint remains but is not wired to the frontend in this iteration; polling suffices).
- ML-based correlation (time-window grouping only).
- Sub-minute monitoring granularity.

---

## Architecture

The work follows the existing service-per-domain pattern. All new backend logic lives in a single new service (`monitoring_service.py`) and a single new router (`monitoring.py`). The scheduler calls into the service for two new nightly jobs. No existing files grow beyond their current responsibility boundaries.

```
scheduler_service.py
  └─ _nightly_collect_metrics()   → monitoring_service.collect_asset_metrics(db)
  └─ _nightly_predict_sla()       → monitoring_service.predict_sla_breaches(db)

anomaly.py  (run_detector endpoint)
  └─ after AnomalyDetection commit → monitoring_service.check_correlation(asset_id, detection_id, db)

app/api/monitoring.py  (new router, prefix=/monitoring)
  ├─ GET  /metrics
  ├─ GET  /sla-predictions
  ├─ GET  /correlated-incidents
  └─ POST /correlated-incidents/{id}/resolve
```

---

## Data Model

One new Alembic migration adding three tables.

### `asset_monitoring_metrics`

One row per asset per day. Written by the nightly metric-collection job. Idempotent (skips if a row for today already exists).

| Column | Type | Notes |
|---|---|---|
| `metric_id` | UUID PK | |
| `asset_id` | FK → assets | |
| `metric_date` | DATE | |
| `row_count` | BIGINT nullable | Queried from Snowflake `COUNT(*)` |
| `freshness_hours` | FLOAT nullable | Hours since most recent `DQRuleRun` for this asset |
| `null_rate_avg` | FLOAT nullable | Average null rate from `ColumnMetadata` (best-effort) |
| `created_at` | DATETIME | |

### `sla_breach_predictions`

One row per asset. Upserted nightly. Only written for assets with an active `SLAConfig`.

| Column | Type | Notes |
|---|---|---|
| `prediction_id` | UUID PK | |
| `asset_id` | FK → assets | |
| `predicted_at` | DATETIME | Timestamp of last prediction run |
| `horizon_days` | INT | Always 7 |
| `forecast_scores` | JSON | `[float, ...]` — 7 forecast values |
| `lower_band` | JSON | `[float, ...]` — 1.5-sigma lower band |
| `upper_band` | JSON | `[float, ...]` — 1.5-sigma upper band |
| `breach_day` | INT nullable | Index (0–6) of first day where `lower_band[i] < sla_threshold` |
| `breach_probability` | FLOAT | Fraction of lower-band days below threshold (0–1) |
| `is_at_risk` | BOOL | True if any `lower_band[i] < sla_threshold` |

### `correlated_incidents`

One row per detected cluster. Written by `check_correlation()` inline after anomaly commit.

| Column | Type | Notes |
|---|---|---|
| `incident_id` | UUID PK | |
| `detected_at` | DATETIME | |
| `window_start` | DATETIME | `now - 15min` at detection time |
| `window_end` | DATETIME | `now` at detection time |
| `asset_ids` | JSON | `[str, ...]` — distinct asset IDs in window |
| `anomaly_ids` | JSON | `[str, ...]` — detection IDs that triggered this |
| `asset_count` | INT | |
| `severity` | VARCHAR(20) | `high` if any anomaly is high/critical, else `medium` |
| `status` | VARCHAR(20) | `open` / `resolved` |
| `resolved_at` | DATETIME nullable | |

---

## Backend

### `app/services/monitoring_service.py` (new)

**`collect_asset_metrics(db)`**
- Queries all active assets.
- For each asset: fetches latest `DQRuleRun.created_at` (freshness), calls Snowflake `SELECT COUNT(*) FROM <table>` via the asset's connection, reads avg null rate from `ColumnMetadata`.
- Writes `AssetMonitoringMetric` if no row exists for today. Skips on Snowflake error (best-effort).
- Bounded by `asyncio.Semaphore(settings.snowflake_pool_max_size)`.

**`predict_sla_breaches(db)`**
- Queries all assets with active `SLAConfig`.
- For each: fetches last 30 days of `DQQualityScore` (table-level), calls `forecast_service.compute_forecast(scores, horizon=7)`.
- Upserts `SLABreachPrediction` by `asset_id`: UPDATE all fields if a row exists, INSERT if not.
- Skips assets with fewer than 3 score data points (forecast returns None).

**`check_correlation(asset_id, detection_id, db)`**
- Queries `AnomalyDetection` for rows where `detected_at > now - 15min`.
- Counts distinct `asset_id` values.
- If count >= 3 and no `CorrelatedIncident` with `status='open'` and `detected_at > now - 30min` exists: inserts one. The 30-minute guard (2× the detection window) prevents duplicate incidents from back-to-back anomalies in the same cluster.
- Called synchronously from `anomaly.py` after `db.commit()`. Fast — single aggregation query.

### `app/api/monitoring.py` (new)

```
GET  /monitoring/metrics?asset_id=&days=30   → list of AssetMonitoringMetric rows
GET  /monitoring/sla-predictions              → list of SLABreachPrediction (all, or is_at_risk=true)
GET  /monitoring/correlated-incidents         → open CorrelatedIncident list
POST /monitoring/correlated-incidents/{id}/resolve  → set status=resolved, resolved_at=now
```

All endpoints require `get_current_user`.

### `app/services/scheduler_service.py` — additions only

Two new job functions and two `scheduler.add_job()` calls in `start_scheduler()`:

```python
scheduler.add_job(
    _nightly_collect_metrics,
    CronTrigger(hour=3, minute=0, timezone="UTC"),
    id="nightly_collect_metrics", replace_existing=True,
)
scheduler.add_job(
    _nightly_predict_sla,
    CronTrigger(hour=0, minute=10, timezone="UTC"),
    id="nightly_predict_sla", replace_existing=True,
)
```

Job timing (UTC):
- 00:05 — quality score aggregation (existing)
- 00:10 — SLA breach prediction (new)
- 01:00 — auto-discovery (existing)
- 02:00 — column profiling (existing)
- 03:00 — asset metric collection (new)
- 04:00 — schema drift detection (existing)

### `app/api/anomaly.py` — one addition

After `db.commit()` in `run_detector`, call:
```python
from app.services.monitoring_service import check_correlation
await check_correlation(detector.asset_id, detection.detection_id, db)
```
Only called when `anomaly_found=True`.

---

## Frontend

### New frontend API proxy routes

| Proxy route | Backend route |
|---|---|
| `GET /api/observability/freshness-board` | `GET /observability/freshness-board` |
| `GET /api/observability/quality-heatmap` | `GET /observability/quality-heatmap` |
| `GET /api/monitoring/sla-predictions` | `GET /monitoring/sla-predictions` |
| `GET /api/monitoring/correlated-incidents` | `GET /monitoring/correlated-incidents` |
| `POST /api/monitoring/correlated-incidents/[id]/resolve` | `POST /monitoring/correlated-incidents/{id}/resolve` |

### `useInterval` custom hook

```ts
// frontend/src/hooks/useInterval.ts
export function useInterval(callback: () => void, delay: number | null) {
  // standard useInterval pattern — calls callback on interval, clears on unmount
}
```

### `/observability` page (`frontend/src/app/observability/page.tsx`)

Four independently-polling sections:

1. **Freshness Board** — 30s poll of `/api/observability/freshness-board`. Card grid: one card per asset, color-coded by status (`on_time`=green, `at_risk`=amber, `breached`=red). Shows `hours_since_last_run` / `sla_threshold_hours`.

2. **SLA Breach Forecast** — 30s poll of `/api/monitoring/sla-predictions?is_at_risk=true`. Table: Asset name, Current score, Breach day ("Day 3"), Probability %. Empty state: "All assets on track for the next 7 days".

3. **Quality Heatmap** — 30s poll of `/api/observability/quality-heatmap`. 7-day domain × date matrix. Cells colored red→green by avg quality score. Null cells shown as grey.

4. **Correlated Incidents** — 30s poll of `/api/monitoring/correlated-incidents`. List rows: asset count, severity badge, time window, Resolve button (calls POST resolve, refreshes). Empty state: "No correlated incidents".

### Correlated Incident Banner on main dashboard

Added to `frontend/src/app/page.tsx` (or the dashboard layout). Polls `/api/monitoring/correlated-incidents` every 60s. When open incidents exist, renders a dismissible amber/red banner:

> ⚡ **N tables degraded simultaneously** — possible upstream failure detected. [View Observability →]

Dismissed state stored in component local state (reappears on next poll if still open).

### Sidebar navigation

Add "Observability" entry to the sidebar navigation pointing to `/observability`.

---

## Error Handling

- Metric collection is best-effort: Snowflake errors per asset are logged and skipped; the job never fails globally.
- SLA prediction skips assets with < 3 data points (forecast returns `None`).
- Correlation check errors are caught and logged; they never block anomaly detection from completing.
- Frontend: each polling section handles errors independently — shows last good data with a subtle "Last updated Xs ago" indicator on error.

---

## Testing

- Unit test `monitoring_service.predict_sla_breaches` with mock scores that cross and don't cross SLA threshold.
- Unit test `check_correlation` with < 3 and >= 3 assets in window.
- Unit test `collect_asset_metrics` idempotency (second call same day inserts nothing).
- Integration test `GET /monitoring/sla-predictions` returns correct shape.
- Frontend: test `useInterval` hook cleans up on unmount.
