# Data Observability Engine — Design

## Problem

The Settings → "Under Development" page flags **Data Observability Engine** as not built: quality issues are currently only detected when a scheduled rule runs. There is no automatic, continuous detection of:

- table freshness (when was this table last loaded?)
- volume anomalies (row count dropped sharply vs. recent history)
- schema drift (a column was dropped or its type changed)
- distribution shifts (a numeric column's range/mean changed significantly)

These should run continuously and independently of user-defined rules, firing alerts the moment a structural change or data absence is detected — often the earliest signal an upstream pipeline failed.

The frontend already ships a "Continuous Monitoring Config" panel (`/observability`, section 6b) letting users pick a poll interval per connection (5/15/30/60 min) and toggle freshness/volume checks. It POSTs to `/api/observability/continuous-config`, which proxies to a backend endpoint that **does not exist** — the panel currently saves to nothing (frontend falls back to an empty mock).

Schema drift partially exists already: `SchemaBaseline`/`SchemaDriftEvent` models and a `schema_drift_service` with `detect_drift()`/`initialize_baseline()`, run once a day via the `nightly_drift_detect` APScheduler job (04:00 UTC). It records drift events but never creates an alert, and only runs once per day, not continuously.

Freshness, volume, and distribution shift have no automatic detection at all today — freshness is only computed on-demand for the dashboard's freshness-board, and only matters if a `freshness_check` rule happens to exist and run on schedule.

## Goals

1. Make the existing continuous-config UI functional end-to-end (real persistence, real effect).
2. Continuously and automatically detect, per connection, on a user-configurable interval:
   - freshness breaches (independent of any `freshness_check` rule)
   - volume anomalies (sharp row-count drop vs. recent history)
   - schema drift (column added/dropped/type-changed)
   - distribution shifts (numeric column mean/range shift vs. baseline)
3. Fire alerts (existing `DQAlert` + notification dispatch) and create `Issue` records immediately on detection, for every severity — same as rule-failure handling does today.
4. Let users pause the engine per connection or change its polling frequency at any time, taking effect on the next check (no restart).

## Non-goals

- User-configurable severity thresholds (v1 ships sensible hardcoded defaults).
- Per-asset or per-column override of check enablement (toggles are per-connection only, matching the existing UI).

## Correction after deeper code inspection

The existing continuous-config panel's actual request/response shape (`frontend/src/app/observability/page.tsx`, `ContinuousConfig` interface and `contDraft` state) is `{connection_id, name, interval_minutes, freshness_enabled, volume_enabled, next_check_at}` — not the `poll_interval_minutes`/`is_enabled`/`schema_drift_enabled`/`distribution_enabled` shape assumed earlier in this doc. The UI today has no pause control and no schema-drift/distribution toggles at all.

Since a pause control was explicitly requested, and the engine adds two check types the UI has no way to enable/disable, this plan now includes a **small, scoped frontend addition** to the existing panel (not a new page): an `is_enabled` pause/resume toggle and `schema_drift_enabled`/`distribution_enabled` checkboxes, added alongside the existing two checkboxes. Everywhere below, field names match this corrected contract.

## Architecture

### Scheduling

One new APScheduler job, `observability_tick`, registered with an `IntervalTrigger` of 5 minutes (the finest grain offered in the UI), calling `app.services.observability_engine.run_due_connections()`.

On each tick:

1. Load all `ContinuousMonitoringConfig` rows where `is_enabled = True`.
2. For each, compute `minutes_since_last_run = (now - last_run_at)`; skip if less than `poll_interval_minutes`.
3. For due connections, run the enabled checks (see below) across that connection's active `Asset` rows.
4. Update `last_run_at = now` on success (update it even on partial failure of individual assets, so one bad asset doesn't stall the whole connection's cadence — failures are logged per-asset, not raised).

Pausing (`is_enabled = False`) or changing `poll_interval_minutes` takes effect on the very next tick since config is read fresh every time — no job add/remove bookkeeping required.

The existing `nightly_drift_detect` job (04:00 UTC) is **removed**; schema drift becomes one of the four per-connection continuous checks instead, for consistency with the others and the per-connection toggle in the UI. `schema_drift_service.detect_drift()`/`initialize_baseline()` are reused as-is, just called from the new tick instead of the nightly loop.

### New models (`app/db/models.py`)

```python
class ContinuousMonitoringConfig(Base):
    __tablename__ = "continuous_monitoring_configs"
    config_id: str               # PK
    connection_id: str           # FK -> snowflake_connections.connection_id, unique
    interval_minutes: int        # 5 | 15 | 30 | 60, default 15 — matches frontend field name
    is_enabled: bool             # default True — pause/resume
    freshness_enabled: bool      # default True
    volume_enabled: bool         # default True
    schema_drift_enabled: bool   # default True
    distribution_enabled: bool   # default True
    last_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class VolumeBaseline(Base):
    __tablename__ = "volume_baselines"
    asset_id: str                 # PK, FK -> assets.asset_id, unique
    readings: list                # JSON list of {"value": int, "at": iso str}, capped at last 7
    updated_at: datetime

class DistributionBaseline(Base):
    __tablename__ = "distribution_baselines"
    baseline_id: str             # PK
    asset_id: str                # FK -> assets.asset_id
    column_name: str
    # unique together: (asset_id, column_name)
    baseline_min: Optional[float]
    baseline_max: Optional[float]
    baseline_avg: Optional[float]
    baseline_std_dev: Optional[float]
    established_at: datetime
```

`DistributionBaseline` is set once per (asset, column) on first sighting and never silently overwritten — a detected shift compares against the original baseline, not a rolling one, so repeated small drifts each get flagged rather than the baseline chasing the data. (A future "accept new baseline" action could reset it; out of scope here.)

`VolumeBaseline.readings` keeps the last 7 row-count samples (not 7 calendar days — 7 most recent continuous-engine readings for that asset, which may be sub-daily depending on the connection's poll interval). This is intentionally separate from the existing nightly `AssetMonitoringMetric.row_count` history, which serves the dashboard's daily metrics and has a different cadence/purpose.

### Detection logic (`app/services/observability_engine.py`)

New service, one function per check, all taking `(asset, db)` and returning an optional finding:

- **`check_freshness(asset, db)`** — resolves the asset's executor (reusing `_resolve_executor` from `execution_service`), fetches current `last_modified_at` via the connector (falling back to `AssetSourceMeta.last_modified_at` if the connector call fails), compares to a default 24h staleness threshold. Independent of any `freshness_check` rule.
- **`check_volume(asset, db)`** — fetches current row count (`aget_table_row_count`), appends to `VolumeBaseline.readings` (capped at 7), compares latest to the average of the *prior* readings (excludes the new one from its own baseline). Drop ≥50% of baseline avg → critical, ≥30% → high, ≥15% → medium. No finding if fewer than 2 prior readings exist yet (cold start).
- **`check_schema_drift(asset, db)`** — calls `schema_drift_service.get_active_baseline()`; if none, calls `initialize_baseline()` (no finding, baseline-establishing run). If one exists, calls `detect_drift()`, which returns any new `SchemaDriftEvent` rows it created — those become findings.
- **`check_distribution(asset, db)`** — for each numeric column in `ColumnMetadata` (data_type indicates numeric, `avg_value`/`std_dev` populated), look up or create `DistributionBaseline`. If baseline is new, store current stats, no finding. Otherwise compute `abs(current_avg - baseline_avg)`; if ≥ 50% of `baseline_std_dev` → high, else if ≥ 25% → medium, else no finding. Skip columns where `baseline_std_dev` is 0 or null (can't compute a meaningful ratio).

`run_due_connections()` orchestrates: for each due connection, for each active asset, for each enabled check type, call the check, and on a finding call `create_observability_alert(asset, check_type, finding, db)`.

### Alerting & Issue creation

`create_observability_alert()` (new, in `app/services/observability_engine.py`, calling into existing `alert_service`/`post_run_service` primitives rather than duplicating them):

1. Dedup: skip if an open `DQAlert` already exists for this `(asset_id, alert_type)` within the last 4 hours (mirrors `alert_service.DEDUP_WINDOW_HOURS`).
2. Create `DQAlert` with `alert_type` ∈ `{freshness_breach, volume_shift, drift_detected, distribution_shift}`, `severity`, `alert_message` describing the finding, `domain_id`/`subdomain_id`/`asset_id` from the asset.
3. Dispatch notification via existing `notification_service.dispatch_alert()` (same email/Slack/Teams/PagerDuty path rule failures use), fire-and-forget via `asyncio.create_task`.
4. Create an `Issue` (same shape as `post_run_service._auto_create_issue`, with `issue_type="data_quality"`, `created_by="system"`, `rule_id=None`), for every severity — no high/critical-only gating.

### API (`app/api/observability.py`)

```
GET  /observability/continuous-config
  -> { connections: [ { connection_id, name, interval_minutes, is_enabled,
                         freshness_enabled, volume_enabled, schema_drift_enabled,
                         distribution_enabled, next_check_at }, ... ] }
     one entry per SnowflakeConnection that has a ContinuousMonitoringConfig row.
     next_check_at is computed as last_run_at + interval_minutes (null if never run).

POST /observability/continuous-config
  body: { connection_id, interval_minutes, is_enabled,
          freshness_enabled, volume_enabled, schema_drift_enabled, distribution_enabled }
  -> upserts the ContinuousMonitoringConfig row for that connection_id, returns
     the same { connections: [...] } shape as GET (matches what the frontend's
     saveContConfig already expects back).
```

### Frontend (`frontend/src/app/observability/page.tsx`)

Small, scoped addition to the existing Section 6b panel — no new page/route:

- `ContinuousConfig` interface and `contDraft` state gain `is_enabled`, `schema_drift_enabled`, `distribution_enabled` (defaults: `true, true, true`).
- The connection list row (`contConfigs.map(...)`) gains a paused badge when `!c.is_enabled`, plus `schema_drift`/`distribution` pills alongside the existing `freshness`/`volume` pills.
- The "Add / Update Connection" form gains two more checkboxes (Schema Drift, Distribution) and a toggle switch (reusing the existing toggle-switch markup pattern from the Auto-Remediation panel's enable switch) for pause/resume.
- The frontend proxy route `frontend/src/app/api/observability/continuous-config/route.ts` needs no change — it already forwards body/response verbatim.

## Error handling

- Per-asset check failures (connector timeout, missing metadata) are logged and skipped; they don't fail the whole connection's tick or block `last_run_at` from advancing.
- Cold-start cases (no prior volume reading, no distribution baseline yet) establish the baseline silently — no alert on the first observation.
- If a connection's underlying `SnowflakeConnection`/executor can't be resolved at all, the connection is skipped for that tick and retried on the next one (no config disabled automatically).

## Testing

- Unit tests for each `check_*` function with synthetic asset/baseline data covering: no finding (within thresholds), each severity boundary, and cold-start (no baseline yet).
- Unit test for dedup logic in `create_observability_alert` (second identical finding within 4h produces no second alert).
- Integration-style test for `run_due_connections()`: a config due vs. not-due, verifying `last_run_at` advances only for due connections and a per-asset exception doesn't stop other assets/connections.
- API tests for `GET`/`POST /observability/continuous-config` round-trip.
