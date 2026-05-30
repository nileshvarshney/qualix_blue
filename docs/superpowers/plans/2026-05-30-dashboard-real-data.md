# Dashboard Real Data Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded constant in the DataGuard dashboard with real data fetched from the backend API, showing honest empty states when no run history exists yet.

**Architecture:** A new Next.js proxy route (`/api/dashboard`) fetches three backend endpoints in parallel (`/dashboard/global`, `/dashboard/dimensions`, `/alerts/enriched`) and returns one merged JSON payload. `page.tsx` fetches that payload and passes it to `Dashboard.tsx`, which reads all values from props—no hardcoded constants remain.

**Tech Stack:** Next.js 15 App Router, TypeScript, FastAPI backend at `http://localhost:8000`

---

## File Map

| Action | File |
|--------|------|
| **Create** | `frontend/src/app/api/dashboard/route.ts` |
| **Modify** | `frontend/src/lib/types.ts` |
| **Modify** | `frontend/src/app/page.tsx` |
| **Modify** | `frontend/src/components/dashboard/Dashboard.tsx` |

---

## Task 1: Create the `/api/dashboard` proxy route

**Files:**
- Create: `frontend/src/app/api/dashboard/route.ts`

This proxy fetches three backend endpoints in parallel and merges them into one response the frontend can consume. It follows the exact same pattern as `frontend/src/app/api/connections/route.ts` (uses `BACKEND_URL` env var, `cache: 'no-store'`).

- [ ] **Step 1: Create the file**

```ts
// frontend/src/app/api/dashboard/route.ts
import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const [globalRes, dimRes, alertsRes] = await Promise.all([
      fetch(`${BACKEND}/dashboard/global`, { cache: 'no-store' }),
      fetch(`${BACKEND}/dashboard/dimensions`, { cache: 'no-store' }),
      fetch(`${BACKEND}/alerts/enriched?status=open&limit=10`, { cache: 'no-store' }),
    ])

    if (!globalRes.ok) throw new Error(`/dashboard/global ${globalRes.status}`)

    const global = await globalRes.json()
    const dimensions = dimRes.ok ? await dimRes.json() : {}
    const alertsRaw: Record<string, unknown>[] = alertsRes.ok ? await alertsRes.json() : []

    // Count alerts by severity from open alerts
    const criticalAlerts = alertsRaw.filter(a => a.severity === 'critical').length
    const mediumAlerts   = alertsRaw.filter(a => a.severity === 'medium' || a.severity === 'high').length

    // Map enriched alerts → failing rules shape
    const failingRules = alertsRaw.slice(0, 5).map(a => ({
      rule_name:  a.rule_name  as string ?? 'Unknown rule',
      asset_name: `${a.sf_schema_name ?? ''}.${a.sf_table_name ?? ''}`.replace(/^\./, ''),
      detail:     a.alert_message as string ?? '',
      severity:   a.severity as string ?? 'medium',
    }))

    // Map quality_trend: convert null scores to null (keep shape consistent)
    const trend = ((global.quality_trend ?? []) as Record<string, unknown>[]).map(t => ({
      date:   t.date as string,
      score:  t.score as number | null,
      failed: t.failed as number,
    }))

    // Map at_risk_tables
    const atRiskTables = ((global.at_risk_tables ?? []) as Record<string, unknown>[]).map(t => ({
      asset_name:  `${t.schema_name ?? ''}.${t.table_name ?? ''}`.replace(/^\./, '') || String(t.table_name ?? ''),
      domain_name: t.domain_name as string ?? '—',
      score:       t.score as number,
      score_delta: t.score_delta as number | null ?? null,
    }))

    return NextResponse.json({
      overallScore:    global.overall_quality_score as number | null,
      totalAssets:     global.total_assets    as number ?? 0,
      totalRules:      global.total_active_rules as number ?? 0,
      openAlerts:      global.open_alerts     as number ?? 0,
      criticalAlerts,
      mediumAlerts,
      passed:          global.rules_passed_today as number ?? 0,
      failed:          global.rules_failed_today as number ?? 0,
      trend,
      dimensions: {
        completeness: dimensions.completeness as number | null ?? null,
        accuracy:     dimensions.accuracy     as number | null ?? null,
        uniqueness:   dimensions.uniqueness   as number | null ?? null,
        validity:     dimensions.validity     as number | null ?? null,
        timeliness:   dimensions.timeliness   as number | null ?? null,
        consistency:  dimensions.consistency  as number | null ?? null,
      },
      failingRules,
      atRiskTables,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Smoke-test the proxy**

With the backend running (`uvicorn app.main:app --port 8000`) and Next.js dev server running (`npm run dev` in `frontend/`):

```bash
curl -s http://localhost:3000/api/dashboard | python3 -m json.tool | head -40
```

Expected: JSON with `overallScore`, `totalAssets`, `openAlerts`, `trend`, `dimensions` (all null), `failingRules: []`, `atRiskTables: []`. No `500` error.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/dashboard/route.ts
git commit -m "feat: add /api/dashboard proxy route merging global, dimensions, and alerts"
```

---

## Task 2: Extend `DashboardStats` type

**Files:**
- Modify: `frontend/src/lib/types.ts`

The existing `DashboardStats` interface is out of sync with what `page.tsx` and `Dashboard.tsx` actually use. Replace it entirely.

- [ ] **Step 1: Replace `DashboardStats` in `types.ts`**

Find and replace the existing interface (lines 101–109):

```ts
// REMOVE this:
export interface DashboardStats {
  totalRules: number
  activeConnections: number
  checksToday: number
  overallScore: number
  trend: { date: string; score: number }[]
  recentChecks: CheckResult[]
  rulesByCategory: { category: string; count: number; color: string }[]
}
```

Replace with:

```ts
export interface DimensionScores {
  completeness: number | null
  accuracy:     number | null
  uniqueness:   number | null
  validity:     number | null
  timeliness:   number | null
  consistency:  number | null
}

export interface FailingRule {
  rule_name:  string
  asset_name: string
  detail:     string
  severity:   string
}

export interface AtRiskTable {
  asset_name:  string
  domain_name: string
  score:       number
  score_delta: number | null
}

export interface DashboardStats {
  overallScore:    number | null
  totalAssets:     number
  totalRules:      number
  openAlerts:      number
  criticalAlerts:  number
  mediumAlerts:    number
  passed:          number
  failed:          number
  trend:           { date: string; score: number | null; failed: number }[]
  dimensions:      DimensionScores
  failingRules:    FailingRule[]
  atRiskTables:    AtRiskTable[]
  // kept for ConnectionSelector and live-results panel
  activeConnections: number
  recentChecks:    CheckResult[]
}
```

- [ ] **Step 2: Verify no TypeScript errors introduced (check types compile)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in `page.tsx` and `Dashboard.tsx` (not yet updated) — no new errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: extend DashboardStats type with real API fields"
```

---

## Task 3: Update `page.tsx` to fetch real data

**Files:**
- Modify: `frontend/src/app/page.tsx`

Replace the `loadConnections / loadRules / loadReports` block (from `seedData.ts`) with a single fetch to `/api/dashboard`. Keep `useEffect` + `useState` since `Dashboard.tsx` is `'use client'`.

- [ ] **Step 1: Replace `page.tsx` entirely**

```tsx
// frontend/src/app/page.tsx
'use client'
import { useState, useEffect } from 'react'
import Dashboard from '@/components/dashboard/Dashboard'
import type { DashboardStats } from '@/lib/types'

const EMPTY: DashboardStats = {
  overallScore:      null,
  totalAssets:       0,
  totalRules:        0,
  openAlerts:        0,
  criticalAlerts:    0,
  mediumAlerts:      0,
  passed:            0,
  failed:            0,
  trend:             [],
  dimensions:        { completeness: null, accuracy: null, uniqueness: null, validity: null, timeliness: null, consistency: null },
  failingRules:      [],
  atRiskTables:      [],
  activeConnections: 0,
  recentChecks:      [],
}

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY)

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: DashboardStats) => setStats(data))
      .catch(err => console.error('Dashboard fetch failed:', err))
  }, [])

  return <Dashboard stats={stats} />
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly for page.tsx**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "page.tsx"
```

Expected: no errors for `page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire page.tsx to fetch real dashboard data from /api/dashboard"
```

---

## Task 4: Update `Dashboard.tsx` — remove all hardcoded constants

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

This is the largest change. Remove five hardcoded data structures, update the `TrendChart` to handle null scores and show an empty state, and update every KPI card to read from props.

### 4a — Remove hardcoded data and update imports

- [ ] **Step 1: Remove hardcoded constants and update the import line**

At the top of `Dashboard.tsx`, the import from `@/lib/types` only imports `CheckResult` and `Connection`. Update it to also import the new types, and **delete** the three hardcoded constant arrays.

Change line 5–7:
```ts
// BEFORE
import { CheckResult, Connection } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { loadConnections } from '@/lib/seedData'
```
```ts
// AFTER
import { CheckResult, Connection, DashboardStats, FailingRule, AtRiskTable } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { loadConnections } from '@/lib/seedData'
```

Then **delete** lines 155–178 (the three hardcoded arrays):

```ts
// DELETE these three blocks entirely:
const dimensions = [
  { name: 'Completeness', score: 98, color: '#16a34a', category: 'completeness' },
  ...
]

const failingRules = [
  { name: 'order_total > 0', source: 'orders.transactions', ... },
  ...
]

const datasetsAttention = [
  { name: 'prod.orders_fact', source: 'Snowflake', ... },
  ...
]
```

### 4b — Update `TrendChart` to handle null scores

- [ ] **Step 2: Update the `TrendChart` component signature and empty state**

Replace the `TrendChart` function (lines 223–298) with:

```tsx
function TrendChart({ data }: { data: { date: string; score: number | null; failed: number }[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; score: number; date: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const validPts = data.filter(d => d.score !== null) as { date: string; score: number; failed: number }[]

  if (validPts.length === 0) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No runs yet — execute rules to see quality trend
      </div>
    )
  }

  const w = 600, h = 180, pad = { top: 20, right: 20, bottom: 30, left: 35 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom
  const scores = validPts.map(d => d.score)
  const min = Math.max(0, Math.floor(Math.min(...scores) / 5) * 5 - 5)
  const max = 100

  const pts = validPts.map((d, i) => ({
    x: pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW,
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closest = pts[0], minDist = Infinity
          pts.forEach(p => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closest = p } })
          if (minDist < 30) setTooltip({ x: (closest.x / w) * 100, y: (closest.y / h) * 100, score: closest.score, date: closest.date })
          else setTooltip(null)
        }}>
        <defs>
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[100, 95, 90, 85].map(v => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return <g key={v}><line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" /><text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text></g>
        })}
        {validPts.map((d, i) => {
          const barH = Math.max(2, d.failed * 2)
          return <rect key={i} x={pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW - 5} y={pad.top + chartH - barH} width="10" height={barH} fill="#ef4444" opacity="0.75" rx="2" />
        })}
        <path d={areaPath} fill="url(#ag2)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            style={{ transition: 'r 0.1s' }} />
        ))}
        {validPts.filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1).map((d) => {
          const idx = validPts.indexOf(d)
          return <text key={idx} x={pad.left + (idx / Math.max(validPts.length - 1, 1)) * chartW} y={h - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.date}</text>
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', left: `${tooltip.x}%`, top: `${tooltip.y}%`,
          transform: 'translate(-50%, -130%)', background: '#1e293b', color: '#fff',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10
        }}>
          <div>{tooltip.date}</div>
          <div style={{ color: '#60a5fa', fontSize: '16px' }}>{tooltip.score}%</div>
          <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1e293b' }} />
        </div>
      )}
    </div>
  )
}
```

### 4c — Update the main `Dashboard` component body

- [ ] **Step 3: Update the `score` and `trendData` variables (lines 314–320)**

Replace:
```ts
// BEFORE
const score = stats.overallScore || 94.2
const trendData = stats.trend.length > 0 ? stats.trend : [
  { date: 'Apr 5', score: 93 }, ...
]
```
With:
```ts
// AFTER
const score = stats.overallScore   // null when no runs yet
const trendData = stats.trend      // empty array shows "No runs yet" in TrendChart
```

- [ ] **Step 4: Update the Overall Quality Score card (around line 350)**

Replace the score display:
```tsx
// BEFORE
<span style={{ fontSize: '40px', fontWeight: 700, ... }}>{score.toFixed(1)}</span>
```
```tsx
// AFTER
<span style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>
  {score !== null ? score.toFixed(1) : '—'}
</span>
```

Also update the stacked bar (lines 358–369) to remove hardcoded fallbacks:
```tsx
// BEFORE
<div style={{ background: '#16a34a', flex: stats.passed || 268, ... }} />
<div style={{ background: '#ea8b3a', flex: stats.warnings || 91 }} />
<div style={{ background: '#dc2626', flex: stats.failed || 59 }} />
...
{[['Passing', stats.passed || 268, '#16a34a'], ['Warning', stats.warnings || 91, '#ea8b3a'], ['Failing', stats.failed || 59, '#dc2626']].map(...)}
```
```tsx
// AFTER — show flat grey bar when no data; use real values otherwise
{(stats.passed + stats.failed > 0) ? (
  <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px', gap: '1px' }}>
    <div style={{ background: '#16a34a', flex: stats.passed, transition: 'flex 0.5s' }} />
    <div style={{ background: '#dc2626', flex: stats.failed }} />
  </div>
) : (
  <div style={{ height: '6px', borderRadius: '3px', background: '#e5e7eb', marginBottom: '8px' }} />
)}
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
  {[['Passing', stats.passed, '#16a34a'], ['Failing', stats.failed, '#dc2626']].map(([l, v, c]) => (
    <div key={l as string}>
      <div style={{ color: 'var(--text-secondary)' }}>{l}</div>
      <div style={{ fontWeight: 700, color: c as string }}>{v as number}</div>
    </div>
  ))}
</div>
```

- [ ] **Step 5: Update the Open Issues card (around line 379)**

Replace hardcoded `23`, `8 critical`, `15 medium`:
```tsx
// BEFORE
<div style={{ fontSize: '40px', ... }}>23</div>
<span style={{ color: '#dc2626', fontWeight: 600 }}>8 critical</span> · <span style={{ color: '#ea8b3a', fontWeight: 600 }}>15 medium</span>
<div style={{ width: `${(8/23)*100}%`, ... }} />
```
```tsx
// AFTER
<div style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '12px', lineHeight: 1 }}>
  {stats.openAlerts}
</div>
<div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
  <span style={{ color: '#dc2626', fontWeight: 600 }}>{stats.criticalAlerts} critical</span>
  {' · '}
  <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{stats.mediumAlerts} medium</span>
</div>
<div style={{ background: '#fee2e2', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
  <div style={{ width: `${stats.openAlerts > 0 ? (stats.criticalAlerts / stats.openAlerts) * 100 : 0}%`, height: '100%', background: '#dc2626' }} />
</div>
```

- [ ] **Step 6: Update the Datasets Monitored card (around line 395)**

Replace hardcoded `142` and `↑ 12 new`:
```tsx
// BEFORE
<div style={{ fontSize: '40px', ... }}>142</div>
<div style={{ fontSize: '12px', ... }}>across {stats.activeConnections || 9} sources</div>
<span style={{ ... }}>↑ 12 new</span>
```
```tsx
// AFTER
<div style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '8px', lineHeight: 1 }}>
  {stats.totalAssets}
</div>
<div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
  across {stats.activeConnections || 1} sources
</div>
```
(Remove the `↑ 12 new` badge — it has no real data source.)

- [ ] **Step 7: Update the SLA Adherence card (around line 410)**

There is no SLA adherence % in the current API payload. Replace it with the open sla_breaches count (which comes through as part of the global response but is not yet in our type). For now, show `"—"`:
```tsx
// BEFORE
<span style={{ fontSize: '40px', ... }}>98.6</span>
<span style={{ ... }}>%</span>
...
<div style={{ fontSize: '12.5px', color: '#16a34a', ... }}>▲ 0.3 pts</div>
<div style={{ width: '98.6%', ... }} />
```
```tsx
// AFTER
<span style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>—</span>
<div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>No SLA data yet</div>
<div style={{ background: '#e5e7eb', height: '4px', borderRadius: '2px', marginTop: '8px' }} />
```

- [ ] **Step 8: Update the Six Dimensions section (around line 425–442)**

Replace the hardcoded `dimensions` array iteration with `stats.dimensions`:
```tsx
// BEFORE
<div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>scored on 1.2M records · refreshed 4m ago · ...</div>
...
{dimensions.map(d => (
  <Link key={d.name} href={`/rules?category=${d.category}`} ...>
    ...
    <div>{d.score}<span>%</span></div>
    <div style={{ width: `${d.score}%`, background: d.color }} />
  </Link>
))}
```
```tsx
// AFTER — replace the entire dimensions section content
<div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
  {stats.totalRules} active rules · <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>view all →</span>
</div>
...
{([
  { name: 'Completeness', key: 'completeness' as const, category: 'completeness' },
  { name: 'Accuracy',     key: 'accuracy'     as const, category: 'accuracy' },
  { name: 'Validity',     key: 'validity'     as const, category: 'validity' },
  { name: 'Consistency',  key: 'consistency'  as const, category: 'consistency' },
  { name: 'Timeliness',   key: 'timeliness'   as const, category: 'timeliness' },
  { name: 'Uniqueness',   key: 'uniqueness'   as const, category: 'uniqueness' },
] as { name: string; key: keyof typeof stats.dimensions; category: string }[]).map(d => {
  const val = stats.dimensions[d.key]
  const color = val === null ? '#9ca3af' : val >= 90 ? '#16a34a' : val >= 75 ? '#ea8b3a' : '#dc2626'
  return (
    <Link key={d.name} href={`/rules?category=${d.category}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: 'var(--surface-muted)', borderRadius: '10px', padding: '14px 12px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-neutral-bg)'; e.currentTarget.style.borderColor = '#93c5fd' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>{d.name}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color, letterSpacing: '-0.5px', marginBottom: '8px' }}>
          {val !== null ? <>{val}<span style={{ fontSize: '14px' }}>%</span></> : '—'}
        </div>
        <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${val ?? 0}%`, background: color, transition: 'width 0.5s' }} />
        </div>
      </div>
    </Link>
  )
})}
```

- [ ] **Step 9: Update the Top Failing Rules list (around line 463–476)**

Replace `failingRules.map(...)` with `stats.failingRules.map(...)` and add empty state:
```tsx
// BEFORE
{failingRules.map((rule, i) => (
  <Link key={i} href="/rules" style={{ textDecoration: 'none' }}>
    <div ...>
      <div style={{ width: '3px', ..., background: rule.severity === 'critical' ? '#dc2626' : '#ea8b3a', ... }} />
      <div>
        <div ...>{rule.name}</div>
        <div ...>{rule.source} · {rule.detail}</div>
      </div>
    </div>
  </Link>
))}
```
```tsx
// AFTER
{stats.failingRules.length === 0 ? (
  <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px 8px', textAlign: 'center' }}>
    No failing rules
  </div>
) : stats.failingRules.map((rule, i) => (
  <Link key={i} href="/rules" style={{ textDecoration: 'none' }}>
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ width: '3px', alignSelf: 'stretch', background: rule.severity === 'critical' ? '#dc2626' : '#ea8b3a', borderRadius: '2px', marginTop: '3px', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>{rule.rule_name}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{rule.asset_name} · {rule.detail}</div>
      </div>
    </div>
  </Link>
))}
```

- [ ] **Step 10: Update the Datasets Requiring Attention table (around line 484–522)**

Replace `datasetsAttention.map(...)` with `stats.atRiskTables.map(...)` and add empty state. Also update the "View all 142" link:
```tsx
// BEFORE — header
<Link href="/datasets" ...>View all 142 →</Link>
// BEFORE — table body
{datasetsAttention.map((ds, i) => (
  <tr key={i} ...>
    <td>... {ds.name} ...</td>
    <td>... {ds.source} ...</td>
    <td><ScorePill score={ds.score} /></td>
    <td style={{ color: ds.lateFreshness ? '#ea8b3a' : ... }}>{ds.freshness}</td>
    <td>... {ds.issues} ...</td>
    <td>... {ds.owner} ...</td>
    <td>→</td>
  </tr>
))}
```
```tsx
// AFTER — header
<Link href="/datasets" style={{ fontSize: '12.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
  View all {stats.totalAssets} →
</Link>
// AFTER — table headers: change 'Freshness' to 'Δ Score', 'Issues' to 'Domain', remove 'Owner'
{['Dataset', 'Score', 'Δ Score', 'Domain', ''].map(h => (
  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
))}
// AFTER — table body
{stats.atRiskTables.length === 0 ? (
  <tr>
    <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
      All datasets healthy
    </td>
  </tr>
) : stats.atRiskTables.map((ds, i) => {
  const parts = ds.asset_name.split('.')
  const deltaColor = ds.score_delta === null ? 'var(--text-muted)' : ds.score_delta < 0 ? '#dc2626' : '#16a34a'
  const deltaLabel = ds.score_delta === null ? '—' : `${ds.score_delta > 0 ? '+' : ''}${ds.score_delta.toFixed(1)}`
  return (
    <tr key={i} style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={() => router.push('/datasets')}>
      <td style={{ padding: '12px' }}>
        {parts.length > 1
          ? <><span style={{ color: 'var(--text-muted)' }}>{parts[0]}.</span><span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{parts.slice(1).join('.')}</span></>
          : <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{ds.asset_name}</span>
        }
      </td>
      <td style={{ padding: '12px' }}><ScorePill score={ds.score} /></td>
      <td style={{ padding: '12px', color: deltaColor, fontWeight: 600 }}>{deltaLabel}</td>
      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{ds.domain_name}</td>
      <td style={{ padding: '12px' }}><span style={{ color: 'var(--accent)', fontSize: '12px' }}>→</span></td>
    </tr>
  )
})}
```

- [ ] **Step 11: Verify TypeScript compiles with no errors**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "feat: remove all hardcoded dashboard constants, drive from real API props"
```

---

## Task 5: End-to-end verification

**Files:** none changed

- [ ] **Step 1: Open the dashboard and confirm real data appears**

Navigate to `http://localhost:3000`. Verify:
- Overall score shows `100.0` (real Snowflake value, not `90.0`)
- Open issues shows `0` (real count from alerts table)
- Datasets monitored shows `12` (real count from assets table)
- SLA adherence shows `—`
- Six dimensions all show `—` with grey bars
- Quality trend shows "No runs yet"
- Top failing rules shows "No failing rules"
- Datasets requiring attention shows "All datasets healthy"

- [ ] **Step 2: Confirm no console errors**

Open browser DevTools → Console. Confirm no errors about undefined properties or failed fetches.

- [ ] **Step 3: Final commit**

```bash
git add -p  # confirm nothing unintended staged
git commit -m "chore: dashboard real data wiring complete — all hardcoded values removed"
```
