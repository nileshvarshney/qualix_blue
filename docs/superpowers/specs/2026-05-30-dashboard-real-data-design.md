# Dashboard Real Data Wiring — Design Spec

**Date:** 2026-05-30  
**Status:** Approved

## Problem

The DataGuard dashboard displays hardcoded demo values for every KPI: overall quality score (90.0), open issues (23), datasets monitored (142), SLA adherence (98.6%), six dimension scores, top failing rules, and datasets needing attention. The backend has real data in Snowflake and working API endpoints, but the frontend never calls them for these values.

## Goal

Replace every hardcoded constant in the dashboard with real data from the backend API. When the backend has no run history yet, show honest empty states (`"—"`, "No data yet") rather than zeros or fake numbers.

## Approach

Option A: Add a Next.js API proxy route for the dashboard, update the page to fetch from it, and drive all Dashboard.tsx constants from props.

## Files Changed

### New: `frontend/src/app/api/dashboard/route.ts`

Server-side Next.js proxy. Fetches two backend endpoints in parallel:
- `GET :8000/dashboard/global` — overall score, counts, alerts, trend, at-risk tables
- `GET :8000/dashboard/dimensions` — six dimension scores

Merges both responses into a single JSON payload and returns it. Uses `BACKEND_URL` env var (defaulting to `http://localhost:8000`), mirroring the pattern in `/api/connections/route.ts`. Returns HTTP 500 with `{ error }` if the backend is unreachable.

### Updated: `frontend/src/lib/types.ts`

Extend `DashboardStats` interface:

```ts
interface DashboardStats {
  // existing
  totalRules: number
  totalConnections: number
  activeConnections: number
  overallScore: number | null       // null = no runs yet
  passed: number
  failed: number
  totalChecks: number
  trend: { date: string; score: number | null }[]
  lastRunAt: string | null

  // new real-data fields
  totalAssets: number
  openAlerts: number
  criticalAlerts: number
  mediumAlerts: number
  dimensions: {
    completeness: number | null
    accuracy: number | null
    uniqueness: number | null
    validity: number | null
    timeliness: number | null
    consistency: number | null
  }
  atRiskTables: { asset_id: string; asset_name: string; score: number; open_issues: number }[]
  failingRules: { rule_name: string; asset_name: string; fail_count: number; severity: string }[]
}
```

### Updated: `frontend/src/app/page.tsx`

Replace the `loadConnections / loadRules / loadReports` block with a single `fetch('/api/dashboard', { cache: 'no-store' })`. Map the proxy response onto the `DashboardStats` shape. Keep the `useEffect` + `useState` pattern since Dashboard.tsx must stay `'use client'`.

Default values while loading: `overallScore: null`, all counts `0`, `trend: []`, `dimensions` all null, empty arrays for `atRiskTables` and `failingRules`.

### Updated: `frontend/src/components/dashboard/Dashboard.tsx`

Remove hardcoded constants:
- `const dimensions = [...]` → driven from `stats.dimensions`
- `const failingRules = [...]` → driven from `stats.failingRules`
- `const datasetsAttention = [...]` → driven from `stats.atRiskTables`
- Inline literals `23`, `142`, `98.6`, `1.2M` → `stats.openAlerts`, `stats.totalAssets`, etc.

Empty-state rules:
- `overallScore === null` → display `"—"` in the score card
- Trend all-null entries → show empty SVG axes with "No runs yet" label centered
- Dimension score null → bar renders at 0% width with muted grey color, value shows `"—"`
- `failingRules.length === 0` → render a single "No failing rules" row
- `atRiskTables.length === 0` → render a "All datasets healthy" placeholder row

The `score` fallback `stats.overallScore || 94.2` on line 314 is removed; the component reads `stats.overallScore` directly and handles null explicitly.

## Data Flow

```
Browser
  → fetch('/api/dashboard')
  → Next.js proxy (route.ts, server-side)
  → Promise.all([
      fetch(':8000/dashboard/global'),
      fetch(':8000/dashboard/dimensions')
    ])
  → Snowflake (via SQLAlchemy)
```

## What Is Not Changed

- The `ConnectionSelector` component continues to use `/api/connections` (already real)
- The `seedData.ts` file is left in place; it is no longer called by `page.tsx` but may be used by other pages
- No changes to the backend API
- No changes to other frontend pages

## Empty State Behavior (no rule runs yet)

| Field | Display |
|-------|---------|
| Overall score | `—` |
| Open issues | `0` (real count from alerts table) |
| Datasets monitored | `12` (real count from assets table) |
| SLA adherence | `—` |
| Quality trend | Empty chart with "No runs yet" label |
| Dimension scores | `—` with grey bars |
| Top failing rules | "No failing rules" row |
| At-risk datasets | "All datasets healthy" row |
