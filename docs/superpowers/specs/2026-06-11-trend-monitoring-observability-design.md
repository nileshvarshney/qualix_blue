# Module 6: Trend Monitoring & Observability UI — Design

## Goal

Add historical/trend visibility (quality scores, alert volume, anomaly activity) to existing dashboard, asset detail, and domain detail screens, with drilldown from any trend point to the underlying rule runs, alerts, and anomalies for that day. No new top-level pages or apps — everything is additive to existing surfaces.

## Background / Reuse Inventory

- `app/api/dashboard.py::_build_trend()` already builds a day-by-day quality-score trend (score, total/passed/failed rules) for global, domain, subdomain, and asset scopes, with pre-aggregated `DQQualityScore` rows + raw `DQRuleRun` fallback.
- History endpoints already exist and call `_build_trend()`: `/dashboard/history/table/{asset_id}`, `/dashboard/history/subdomain/{subdomain_id}`, `/dashboard/history/domain/{domain_id}`, `/dashboard/trend`.
- `frontend/src/components/shared/charts.tsx` — `TrendChart` (custom SVG line+bar chart with tooltip) and `ScorePill`. Used today on Dashboard and AssetQualityTab.
- `DQAlert` model: `created_at` (DateTime), `domain_id`, `subdomain_id`, `asset_id`, `severity`, `alert_status`, `run_id`, `rule_id`.
- `AnomalyDetection` model: `detected_at` (DateTime), `asset_id`, `severity`, `anomaly_type`, `run_id`, `is_acknowledged`.
- `DQRuleRun`: `run_id`, `rule_id`, `asset_id`, `domain_id`, `subdomain_id`, `status`, `created_at`, `failed_rows_count`, `quality_score`.
- Existing pages: Dashboard (`frontend/src/components/dashboard/Dashboard.tsx`), AssetDetailPanel (`frontend/src/components/asset-registry/AssetDetailPanel.tsx`, tabs: overview/profiling/rules/quality/alerts), Domains page (`frontend/src/app/domains/page.tsx`, slide-in detail panel per domain).
- `/rule-runs/[runId]` page exists for run detail; `/alerts` and `/anomalies` pages exist for alert/anomaly detail.

## Backend Changes

### 1. Extend `_build_trend()` (app/api/dashboard.py)

Add two additional per-day counts to each trend entry: `alert_count` and `anomaly_count`, computed with the same scoping rules (asset_id > subdomain_id > domain_id > global) already used for quality score.

Implementation approach:
- After building `all_dates`, run one additional query against `DQAlert` (group by `func.date(created_at)`, filtered by scope, count), and one against `AnomalyDetection` (group by `func.date(detected_at)`, count). `AnomalyDetection` has no domain/subdomain columns, so when scoping by `domain_id`/`subdomain_id`, join `AnomalyDetection.asset_id` to `Asset` and filter on `Asset.domain_id`/`Asset.subdomain_id`; when scoping by `asset_id`, filter directly on `AnomalyDetection.asset_id`; global scope applies no filter.
- Merge these counts into each day's trend dict: `{"date": ..., "score": ..., "total": ..., "passed": ..., "failed": ..., "alert_count": N, "anomaly_count": M}`.
- This is additive — existing consumers of `_build_trend()` ignore the new keys; no breaking changes to existing response shapes (new keys only add to the dict).

### 2. New endpoint: `GET /dashboard/day-detail`

```
GET /api/dashboard/day-detail?date=YYYY-MM-DD&domain_id=&subdomain_id=&asset_id=
```

Scoping follows the same precedence as `_build_trend` (asset > subdomain > domain > global). Returns:

```json
{
  "date": "2026-06-10",
  "failed_runs": [
    {"run_id": "...", "rule_id": "...", "rule_name": "...", "asset_id": "...", "table_name": "...", "status": "failed", "failed_rows_count": 12}
  ],
  "alerts": [
    {"alert_id": "...", "severity": "high", "alert_type": "rule_failure", "alert_status": "open", "asset_id": "...", "rule_id": "..."}
  ],
  "anomalies": [
    {"detection_id": "...", "asset_id": "...", "anomaly_type": "quality_score_anomaly", "severity": "medium", "confidence": 0.8}
  ]
}
```

Queries:
- `failed_runs`: `DQRuleRun` where `func.date(created_at) == date`, `status in ('failed','error')`, scoped, joined to `DQRule`/`Asset` for names. Limit 50.
- `alerts`: `DQAlert` where `func.date(created_at) == date`, scoped. Limit 50.
- `anomalies`: `AnomalyDetection` where `func.date(detected_at) == date`. If `asset_id` is provided, filter directly on `AnomalyDetection.asset_id`. If `domain_id`/`subdomain_id` is provided (and no `asset_id`), join `AnomalyDetection.asset_id` to `Asset` and filter on `Asset.domain_id`/`Asset.subdomain_id`. If neither is provided (global scope), no additional filter. Limit 50.

Auth: same `get_current_user` + `check_domain_access` pattern as other endpoints in this router.

## Frontend Changes

### 1. `TrendChart` (frontend/src/components/shared/charts.tsx)

Additive optional props — existing call sites (`Dashboard.tsx`, `AssetQualityTab`) remain unchanged and continue to work without overlays:

```ts
export function TrendChart({
  data,
  onPointClick,        // optional: (date: string) => void
}: {
  data: { date: string; score: number | null; failed: number; alert_count?: number; anomaly_count?: number }[]
  onPointClick?: (date: string) => void
})
```

- If `alert_count`/`anomaly_count` are present and > 0, render small marker glyphs above the existing failed-run bar (e.g. a small triangle for alerts, a diamond for anomalies), each with its own legend entry — only shown when at least one data point has a nonzero value, so charts with no alert/anomaly data look unchanged.
- If `onPointClick` is provided, clicking a point/marker calls `onPointClick(date)`; cursor becomes pointer. Existing usages that don't pass this prop are unaffected (no click handler attached).

### 2. New shared component: `TrendDrilldownPanel`

`frontend/src/components/shared/TrendDrilldownPanel.tsx`

Props: `{ date: string | null, scope: { domainId?: string, subdomainId?: string, assetId?: string }, onClose: () => void }`.

- Renders as a slide-over panel from the right (same visual pattern as the domain detail slide-in in `frontend/src/app/domains/page.tsx`: fixed overlay + `position: fixed; right: 0` panel, ~480px wide).
- On mount (when `date` is non-null), fetches `/api/dashboard/day-detail` with the given date + scope params.
- Renders three sections: "Failed Runs" (link each to `/rule-runs/{run_id}`), "Alerts" (link to `/alerts`, since there's no per-alert detail route — list with severity badges), "Anomalies" (link to `/anomalies`).
- Empty-state per section: "No failed runs / alerts / anomalies on this date."
- `onClose` closes the panel (click outside or ✕ button), matching existing slide-over UX.

### 3. Dashboard — Trends & Monitoring tab

`frontend/src/components/dashboard/Dashboard.tsx`:
- Add a small tab bar below the top bar: `['Overview', 'Trends & Monitoring']`, local `activeView` state. `'Overview'` renders the existing JSX unchanged (KPIs, current trend chart, failing rules, at-risk tables, etc.).
- `'Trends & Monitoring'` renders a new component `DashboardTrendsTab` (new file: `frontend/src/components/dashboard/DashboardTrendsTab.tsx`).

`DashboardTrendsTab`:
- Reuses the existing time-range (`TIME_OPTIONS`) and domain (`DOMAIN_OPTIONS`) dropdowns — lift `Dropdown` to a shared location or duplicate the small component (it's already self-contained and ~35 lines; duplicating into the new file avoids restructuring Dashboard.tsx — acceptable given its size).
- Fetches `/api/dashboard/trend?days=N` (mapping the time-range selection to a `days` value, same mapping convention as existing dashboard usage) and, when a domain filter is active, `/api/dashboard/history/domain/{domain_id}?days=N` instead.
- Renders one larger `TrendChart` with the quality-score line + failed-run bars + alert/anomaly markers, with `onPointClick` opening `TrendDrilldownPanel` scoped to the selected domain (or global if "All domains").
- Below the chart, a compact legend/explanation row (score line, failed-run bars, alert markers, anomaly markers).

### 4. AssetDetailPanel — Trends tab

`frontend/src/components/asset-registry/AssetDetailPanel.tsx`:
- Extend `Tab` union: `'overview' | 'profiling' | 'rules' | 'quality' | 'alerts' | 'trends'`.
- Add `'trends'` button to the existing tab bar (only for leaf table/view assets, same as other tabs).
- New component `frontend/src/components/asset-registry/AssetTrendsTab.tsx`:
  - Fetches `/api/dashboard/history/table/{asset_id}?days=30` (existing endpoint, now includes `alert_count`/`anomaly_count` per day after backend change).
  - Renders `TrendChart` with overlays, `onPointClick` opening `TrendDrilldownPanel` scoped to `{ assetId: asset.asset_id }`.
  - Optional days selector (30/60/90) reusing the existing dropdown pattern, since `history/table/{asset_id}` already supports `days` up to 90.

### 5. Domains page — Health Trends panel

`frontend/src/app/domains/page.tsx`:
- In the existing slide-in detail panel (rendered when `selected` is set), add a new "Health Trends" section after the "Quick links" row.
- New small component `frontend/src/components/domains/DomainHealthTrends.tsx` (or inline in the page given its current size/pattern):
  - Fetches `/api/dashboard/history/domain/{selected.id}?days=30` on panel open.
  - Renders a compact `TrendChart` with overlays, `onPointClick` opening `TrendDrilldownPanel` scoped to `{ domainId: selected.id }`.

## Drilldown Flow Summary

Any trend chart point (Dashboard Trends tab, Asset Trends tab, Domain Health Trends panel) → click → `TrendDrilldownPanel` opens → `/dashboard/day-detail?date=...&{scope}` → lists failed runs / alerts / anomalies for that date and scope, each linking to existing detail pages (`/rule-runs/[runId]`, `/alerts`, `/anomalies`).

## Anomaly Placeholder Scope

No new anomaly detection logic. Module 6 only surfaces existing `AnomalyDetection` rows (created by the existing `/anomaly/detectors/{id}/run` z-score detector) as:
- Per-day counts in trend data (`anomaly_count`).
- Markers on trend charts.
- A list in the drilldown panel linking to `/anomalies`.

## Files to Modify

- `app/api/dashboard.py` — extend `_build_trend()`, add `/day-detail` endpoint.
- `frontend/src/components/shared/charts.tsx` — extend `TrendChart` with optional overlay/click props.
- `frontend/src/components/dashboard/Dashboard.tsx` — add tab bar, route to `DashboardTrendsTab`.
- `frontend/src/components/asset-registry/AssetDetailPanel.tsx` — add `trends` tab.
- `frontend/src/app/domains/page.tsx` — add Health Trends section to slide-in panel.

## Files to Create

- `frontend/src/components/shared/TrendDrilldownPanel.tsx`
- `frontend/src/components/dashboard/DashboardTrendsTab.tsx`
- `frontend/src/components/asset-registry/AssetTrendsTab.tsx`
- `frontend/src/components/domains/DomainHealthTrends.tsx`

## Files Explicitly Not Touched

- No new sidebar/navigation entries, no new top-level routes/pages.
- `/anomalies` and `/alerts` pages — only linked to, not modified.
- `app/api/anomaly.py` — no new detection logic.
- `frontend/src/app/rule-runs/[runId]` — only linked to.

## Regression Checklist

- Existing Dashboard "Overview" tab renders identically to before (no visual diff when `activeView === 'Overview'`).
- Existing `TrendChart` usages (AssetQualityTab) render identically when new props are omitted.
- `_build_trend()` callers that don't read `alert_count`/`anomaly_count` are unaffected by the added keys.
- New `/dashboard/day-detail` endpoint respects `check_domain_access` the same as sibling endpoints.
- AssetDetailPanel tab bar still only shows for leaf (table/view) assets; new tab doesn't break non-leaf asset rendering.
- Domains slide-in panel still opens/closes correctly with the new section added.

## Final Visible UI Changes

- Dashboard gains a two-tab switcher: "Overview" (existing) and "Trends & Monitoring" (new multi-metric trend + drilldown).
- Asset Detail gets a 6th tab "Trends" with a per-asset trend chart + drilldown.
- Domains page's existing slide-in detail panel gains a "Health Trends" chart + drilldown.
- Clicking any chart point/marker opens a right-side drilldown panel listing that day's failed runs, alerts, and anomalies, linking to existing detail pages.
