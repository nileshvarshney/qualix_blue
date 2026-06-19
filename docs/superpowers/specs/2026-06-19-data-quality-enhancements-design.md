# Data Quality Enhancements — Design Spec

**Date:** 2026-06-19  
**Status:** Approved  
**Scope:** Five targeted improvements to the Data Quality section of DataGuard

---

## Problem Statement

The Data Quality section has five gaps:

1. Root cause, business impact, and recommendation text in Issues/Anomalies/Alerts is static — not AI-generated.
2. Quality scoring shows only current state — no forecast.
3. No automated remediation — issues must be created and assigned manually.
4. Anomaly detection is schedule-triggered only — nothing fires between scheduled runs.
5. The `llm_semantic_check` rule type exists in the UI but the backend SQL generator returns garbage rows to the LLM validator, making it non-functional.

---

## Architecture Overview

Five targeted changes. No new infrastructure required.

| File | Change |
|---|---|
| `app/services/sql_generator.py` | Fix `_llm_semantic_check()` to return actual sample rows |
| `app/services/execution_service.py` | Fire `post_run_orchestrator.handle()` after every rule run |
| `app/services/post_run_service.py` *(new)* | Orchestrate: anomaly detection, AI explanation, Issue creation, DQAlert |
| `app/services/forecast_service.py` *(new)* | Moving average forecast with confidence bands |
| `app/api/quality_scores.py` | New `GET /quality-scores/assets/{id}/forecast` endpoint |
| `frontend/src/app/api/quality-scores/assets/[assetId]/forecast/route.ts` *(new)* | Next.js proxy for forecast endpoint |
| `frontend/src/components/asset-registry/AssetQualityTab.tsx` | Fetch forecast + pass to TrendChart |
| `frontend/src/components/TrendChart.tsx` | Add dashed forecast line + shaded confidence band |

`execution_service.py` calls the orchestrator via `asyncio.create_task()` (fire-and-forget) so rule execution latency is unaffected.

---

## Feature 1 — LLM Semantic Check Fix

**File:** `app/services/sql_generator.py`, method `_llm_semantic_check()` (~line 404)

**Root cause:** The generated SQL wraps sample rows in `SELECT 0 AS failed_count FROM (...)`, returning a single `{"failed_count": 0}` row instead of actual data. The LLM validator receives meaningless input.

**Fix:** Replace the SQL with a direct sample query:

```python
# Before (broken)
return (
    f"SELECT 0 AS failed_count FROM ("
    f"SELECT * FROM {table_ref} ORDER BY RANDOM() LIMIT {sample_size}"
    f") _sample"
)

# After (fixed)
return f"SELECT * FROM {table_ref} ORDER BY RANDOM() LIMIT {sample_size}"
```

**Impact:** `_llm_semantic_validate()` in `execution_service.py` already handles actual row data correctly at lines 301–304. No other changes needed.

---

## Feature 2 — Real-Time Anomaly Detection (Post-Execution Hook)

**File:** `app/services/execution_service.py`

After every successful `execute_rule()` call (both the happy path and the error path), add:

```python
asyncio.create_task(post_run_orchestrator.handle(run.run_id, run.asset_id))
```

This fires after the `DQRuleRun` is committed to the database, so the orchestrator can read it.

The hook fires for **all** rule statuses (`passed`, `failed`, `error`, `warning`) — anomaly detection needs passed runs too (z-score uses the quality score history, not just failures).

---

## Feature 3 — Post-Run Orchestrator (`post_run_service.py`)

**File:** `app/services/post_run_service.py` *(new)*

Single public function: `async def handle(run_id: str, asset_id: str, db: AsyncSession) -> None`

The orchestrator is called by `execution_service` with a fresh `db` session (opened inside `handle()` using `AsyncSessionLocal`) so it is independent of the rule execution session.

### Step 1 — Anomaly Detection

```
Fetch AnomalyDetector where asset_id = asset_id AND is_active = True
If none exists → auto-create one (detector_type="zscore", default config)
Call anomaly_service.run_zscore_detector(detector_id, db)
```

Auto-created detectors use: `{"z_threshold": 2.5, "min_history": 7}`.

### Step 2 — AI Explanation (failures and errors only, or quality_score < 70)

```
If run.status in ("failed", "error") OR run.quality_score < 70:
    Call ai_service.explain_failure(run_id, rule_id, db)
    Save result to DQRuleRun.ai_explanation
```

Skips runs that passed with a high score to avoid unnecessary LLM calls.

### Step 3 — Auto-Create Issue (failures only)

```
If run.status == "failed":
    Query Issue table: rule_id = run.rule_id AND status NOT IN ("closed", "resolved")
    If open issue already exists → skip (deduplication guard)
    Call ai_service.generate_remediation_plan(asset_id, db) for description
    Create Issue:
        title     = "[Auto] {rule.name} failed on {asset.name}"
        description = AI remediation plan (JSON steps serialized as markdown)
        status    = "open"
        severity  = rule.severity
        issue_type = "data_quality"
        run_id, rule_id, asset_id, domain_id, subdomain_id = from run
        assigned_team_id = rule.assigned_team_id or asset.owner_team_id
        created_by = "system"
```

### Step 4 — Enrich Existing DQAlert with AI Explanation

`create_alert_if_needed()` in `alert_service.py` is already called by `execution_service.py` immediately after the run is committed (lines 331–332). The orchestrator does **not** create a new alert. Instead it updates the existing one:

```
Find open DQAlert where run_id = run.run_id
If found AND ai_explanation is not None:
    alert.alert_message = first 500 chars of ai_explanation
    db.commit()
```

This enriches the static statistics-only message ("Rule X failed — 42 rows") with AI context once the explanation is ready.

### Error Isolation

Each step is wrapped in `try/except`. A failure in AI explanation does not block issue creation; a failure in issue creation does not block the alert. All errors are logged at `WARNING` level with the run_id for traceability.

---

## Feature 4 — AI-Generated Text in Issues/Anomalies/Alerts

This is a consequence of Feature 3, not a separate implementation:

- **Issues:** `description` field contains AI-generated remediation plan (set at creation time by orchestrator Step 3).
- **Alerts:** `alert_message` contains summary from `ai_explanation` (set by orchestrator Step 4).
- **Anomalies:** The `AnomalyDetection` model gets a new optional `ai_explanation` column. After `run_zscore_detector()` creates a detection, the orchestrator calls a new `ai_service.explain_anomaly(detection_id, db)` function. This function prompts the LLM with the anomaly's `observed_value`, `expected_range`, `confidence`, and asset context — producing a 2–3 sentence explanation of why the score deviated. The result is saved to `AnomalyDetection.ai_explanation`.

The Issues/Anomalies/Alerts API endpoints return these fields as-is — no endpoint changes required since the text is stored, not computed on request.

---

## Feature 5 — Predictive Quality Scoring

### Backend: `app/services/forecast_service.py` *(new)*

Algorithm: self-updating moving average with confidence bands.

```python
def compute_forecast(scores: list[float], horizon: int = 7, window: int = 7) -> dict:
    """
    scores: historical daily overall scores, oldest first (min 3 required)
    Returns: {"forecast": [...], "upper_band": [...], "lower_band": [...]}
    
    Each forecast point feeds the next iteration's window, so confidence
    bands naturally widen over the horizon.
    """
    effective_window = min(window, len(scores))
    projected = list(scores)

    forecast, upper_band, lower_band = [], [], []
    for _ in range(horizon):
        window_vals = projected[-effective_window:]
        mean = sum(window_vals) / len(window_vals)
        std = statistics.stdev(window_vals) if len(window_vals) > 1 else 0.0
        forecast.append(round(max(0.0, min(100.0, mean)), 2))
        upper_band.append(round(max(0.0, min(100.0, mean + 1.5 * std)), 2))
        lower_band.append(round(max(0.0, min(100.0, mean - 1.5 * std)), 2))
        projected.append(mean)

    return {"forecast": forecast, "upper_band": upper_band, "lower_band": lower_band}
```

Minimum 3 data points required. Returns `{"forecast": [], "upper_band": [], "lower_band": []}` if insufficient history — frontend shows "Not enough history to forecast."

### Backend: New Endpoint in `app/api/quality_scores.py`

```
GET /quality-scores/assets/{asset_id}/forecast?days=30&horizon=7
```

Response:
```json
{
  "asset_id": "...",
  "history": [
    {"date": "2026-05-20", "score": 84.1},
    ...
  ],
  "forecast": [
    {"date": "2026-06-20", "score": 81.3},
    ...
  ],
  "upper_band": [{"date": "2026-06-20", "score": 87.0}, ...],
  "lower_band": [{"date": "2026-06-20", "score": 75.6}, ...],
  "insufficient_history": false
}
```

Fetches `days` of history from `dq_dimension_scores` (dimension="overall"), runs `forecast_service.compute_forecast()`, attaches projected dates starting from tomorrow.

### Frontend: Proxy Route

`frontend/src/app/api/quality-scores/assets/[assetId]/forecast/route.ts` — proxies to `${BACKEND}/quality-scores/assets/{assetId}/forecast?days={days}&horizon={horizon}`.

### Frontend: `AssetQualityTab.tsx`

Adds a second `useEffect` that calls the new forecast proxy. Passes both `historyData` and `forecastData` to `TrendChart`.

### Frontend: `TrendChart` Component

Extended to accept optional `forecastData`, `upperBand`, `lowerBand` props:

- Historical scores: existing solid line (unchanged)
- Forecast scores: dashed line in same color with reduced opacity
- Confidence band: shaded fill between `upperBand` and `lowerBand` lines (10% opacity)
- Vertical "today" divider: thin dashed vertical line at the history/forecast boundary
- No-forecast fallback: if `forecastData` is empty or absent, renders existing chart unchanged

---

## Data Model Changes

One new column on `AnomalyDetection`:

```python
ai_explanation = Column(Text, nullable=True)
```

Requires a database migration (`alembic revision --autogenerate`).

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| LLM provider unavailable | `explain_failure()` returns `None`; orchestrator logs warning, skips saving to `ai_explanation`; issue created with generic description |
| < 3 days of quality score history | `forecast` endpoint returns `insufficient_history: true`, empty arrays; frontend shows fallback message |
| No active Snowflake connection | `_llm_semantic_validate()` is never reached (rule execution fails earlier at `_resolve_executor()`) |
| Duplicate anomaly detector creation race | `auto-create` is guarded by a DB-level unique constraint on `(asset_id, detector_type)` |
| `generate_remediation_plan()` fails | Issue created with description = `f"Rule {rule.rule_name} failed. Manual investigation required."` |

---

## Out of Scope

- Automated execution of SQL-based remediation (too risky without approval gates)
- Push notifications / external webhooks (existing `notification_channel` field handles this)
- Forecasting for subdomain/domain/global rollup scores (asset-level only)
- Changing the APScheduler-based detection schedule (it still runs; post-run hook supplements it)
