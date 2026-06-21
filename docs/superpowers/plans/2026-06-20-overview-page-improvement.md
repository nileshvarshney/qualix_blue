# Overview Page Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing overview page and surface four recently-built platform modules (Observability, Stewardship, Compliance, Privacy) as a new "Platform Health" section.

**Architecture:** All changes are confined to `frontend/src/components/dashboard/Dashboard.tsx`. Four polish fixes target existing content (trend delta, SLA tile, alert strip placement, minWidth). One new section adds four self-contained signal tiles, each fetching its own data independently so a slow endpoint never blocks others.

**Tech Stack:** Next.js (App Router), React, TypeScript (strict), Lucide icons, CSS-in-JS via inline `style` objects using design tokens (`var(--*)`)

## Global Constraints

- No test framework exists — verification uses `cd frontend && npx tsc --noEmit` (type check) + visual browser check
- All styles must use design tokens (`var(--surface)`, `var(--accent)`, etc.) — no hardcoded hex colours except where already established in the file
- Follow existing patterns: inline `style` objects, `kpiTile` / `card` const styles, `SectionHeader` component
- No new files; no new API proxy routes (all required endpoints already exist)
- TypeScript strict mode — all new state and fetch results must be explicitly typed

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/dashboard/Dashboard.tsx` | All changes — polish fixes + Platform Health section |

---

## Task 1: Fix trend delta and remove KPI grid min-width

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `trend: TrendPoint[]` state (already in component); `TrendPoint.score: number | null`
- Produces: `weeklyDelta: number | null` derived value used in JSX

- [ ] **Step 1: Add `TrendingDown` to the lucide-react import**

In `Dashboard.tsx` line 7, change:

```tsx
  Gauge, AlertTriangle, Database, ShieldCheck, Activity, GitCompare, Fingerprint,
  Target, ListChecks, Clock, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp,
```

to:

```tsx
  Gauge, AlertTriangle, Database, ShieldCheck, Activity, GitCompare, Fingerprint,
  Target, ListChecks, Clock, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp,
  TrendingDown,
```

- [ ] **Step 2: Compute `weeklyDelta` before the return statement**

After line `const healthyAssets = Math.max(stats.totalAssets - stats.atRiskTables.length, 0)` add:

```tsx
  const weeklyDelta: number | null = trend.length >= 2
    ? ((trend[trend.length - 1].score ?? 0) - (trend[0].score ?? 0))
    : null
```

- [ ] **Step 3: Replace the hardcoded trend delta JSX**

Find and replace the hardcoded delta block (the one containing `+1.4`):

```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)',
                padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
              }}>
                <TrendingUp size={11} strokeWidth={2.6} /> +1.4
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>vs last week</span>
            </div>
```

Replace with:

```tsx
            {weeklyDelta !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  background: weeklyDelta >= 0 ? 'var(--status-ok-bg)' : 'var(--status-error-bg)',
                  color: weeklyDelta >= 0 ? 'var(--status-ok-text)' : 'var(--status-error-text)',
                  padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                }}>
                  {weeklyDelta >= 0
                    ? <TrendingUp size={11} strokeWidth={2.6} />
                    : <TrendingDown size={11} strokeWidth={2.6} />}
                  {weeklyDelta >= 0 ? '+' : ''}{weeklyDelta.toFixed(1)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>vs period start</span>
              </div>
            )}
```

- [ ] **Step 4: Remove `minWidth` from the KPI grid**

Find:

```tsx
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '16px', minWidth: '460px' }}>
```

Replace with:

```tsx
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '16px' }}>
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "fix(overview): compute trend delta from data, remove KPI grid min-width"
```

---

## Task 2: Replace SLA Adherence tile with SLA Health tile

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/monitoring/sla-predictions` → `{ is_at_risk: boolean; breach_day: number | null }[]`
- Produces: `slaAtRisk: number`, `slaBreached: number`, `slaLoading: boolean` used in JSX

- [ ] **Step 1: Add SLA predictions state after existing state declarations**

After the line `const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null)` add:

```tsx
  const [slaPredictions, setSlaPredictions] = useState<{ is_at_risk: boolean; breach_day: number | null }[]>([])
  const [slaLoading, setSlaLoading] = useState(true)
```

- [ ] **Step 2: Add useEffect to fetch SLA predictions**

After the `useEffect` that fetches alerts (the one calling `/api/alerts`), add:

```tsx
  useEffect(() => {
    fetch('/api/monitoring/sla-predictions')
      .then(r => r.json())
      .then((data: unknown) => setSlaPredictions(Array.isArray(data) ? data as { is_at_risk: boolean; breach_day: number | null }[] : []))
      .catch(() => {})
      .finally(() => setSlaLoading(false))
  }, [])
```

- [ ] **Step 3: Compute SLA health values before the return statement**

After the `const healthyAssets` line, add:

```tsx
  const slaAtRisk    = slaPredictions.filter(p => p.is_at_risk && p.breach_day === null).length
  const slaBreached  = slaPredictions.filter(p => p.breach_day !== null).length
```

- [ ] **Step 4: Replace the SLA Adherence KPI tile JSX**

Find the entire SLA tile block:

```tsx
          {/* SLA Adherence */}
          <Link href="/slas" style={{ textDecoration: 'none' }}>
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>SLA Adherence</span>
                <div style={{ ...kpiIconWrap, background: 'var(--status-neutral-bg)', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>—</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>No SLA data yet</div>
              <div style={{ background: '#e5e7eb', height: '4px', borderRadius: '2px' }} />
            </div>
          </Link>
```

Replace with:

```tsx
          {/* SLA Health */}
          <Link href="/observability" style={{ textDecoration: 'none' }}>
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>SLA Health</span>
                <div style={{
                  ...kpiIconWrap,
                  background: slaLoading ? 'var(--surface-muted)' : slaBreached > 0 ? 'var(--status-error-bg)' : slaAtRisk > 0 ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      slaLoading ? 'var(--text-muted)'    : slaBreached > 0 ? 'var(--status-error-text)' : slaAtRisk > 0 ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  <ShieldCheck size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: slaLoading ? 'var(--text-muted)' : 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>
                {slaLoading ? '—' : slaPredictions.length}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {slaLoading ? 'Loading…' : slaBreached > 0
                  ? <><span style={{ color: '#dc2626', fontWeight: 600 }}>{slaBreached} breached</span>{slaAtRisk > 0 && <> · <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{slaAtRisk} at risk</span></>}</>
                  : slaAtRisk > 0
                  ? <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{slaAtRisk} at risk</span>
                  : <span style={{ color: '#16a34a', fontWeight: 600 }}>All on track</span>
                }
              </div>
              <div style={{ background: slaBreached > 0 ? '#fee2e2' : slaAtRisk > 0 ? '#fef3c7' : '#dcfce7', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: `${!slaLoading && slaPredictions.length > 0 ? ((slaBreached + slaAtRisk) / slaPredictions.length) * 100 : 0}%`,
                  height: '100%',
                  background: slaBreached > 0 ? '#dc2626' : '#ea8b3a',
                }} />
              </div>
            </div>
          </Link>
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "fix(overview): replace static SLA tile with live SLA Health tile from monitoring predictions"
```

---

## Task 3: Reposition Alert Summary strip

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- No interface changes — this is a pure JSX layout move.

The Alert Summary strip currently renders between Six Dimensions (line ~365) and the Trend chart. It belongs after the hero card, so severity context is adjacent to the KPI numbers. This task cuts it from its current position and pastes it before the Six Dimensions section.

- [ ] **Step 1: Cut the Alert Summary strip JSX**

Find the entire Alert Summary block — it starts with `{alertSummary !== null && (` and ends with the closing `)}` after the `View all →` chevron link. The full block is:

```tsx
      {/* Alert Summary Strip */}
      {alertSummary !== null && (
        <Link href="/alerts" style={{ textDecoration: 'none', display: 'block', marginBottom: '12px' }}>
          <div style={{ ...card, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {alertSummary.open === 0
                ? <CheckCircle2 size={14} color="#16a34a" strokeWidth={2.4} />
                : <AlertTriangle size={14} color="#dc2626" strokeWidth={2.4} />}
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Active Alerts</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {alertSummary.critical > 0 && (
                <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  {alertSummary.critical} critical
                </span>
              )}
              {alertSummary.high > 0 && (
                <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  {alertSummary.high} high
                </span>
              )}
              {alertSummary.open === 0 && (
                <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                  All clear
                </span>
              )}
              {alertSummary.open > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{alertSummary.open} open total</span>
              )}
            </div>
            {alertSummary.acknowledged > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                {alertSummary.acknowledged} acknowledged
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginLeft: alertSummary.acknowledged > 0 ? '0' : 'auto' }}>
              View all <ChevronRight size={12} />
            </span>
          </div>
        </Link>
      )}
```

Delete this block from its current position (after `{/* Six Dimensions */}` section).

- [ ] **Step 2: Paste it immediately after the hero card**

The hero card closes with `</div>` before the `{/* Six Dimensions */}` comment. Paste the Alert Summary block between the closing `</div>` of the hero card and the opening of the `{/* Six Dimensions */}` `<div>`. The result should read:

```tsx
      </div>  {/* ← end of hero card */}

      {/* Alert Summary Strip */}
      {alertSummary !== null && (
        ... (same block as above) ...
      )}

      {/* Six Dimensions */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "refactor(overview): move alert summary strip to below hero card for better visual flow"
```

---

## Task 4: Add Platform Health section

**Files:**
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/observability/freshness-board` → `{ status: 'on_time' | 'at_risk' | 'breached' | 'unknown' }[]`
  - `GET /api/governance/scorecards` → `{ ownership_score: number }[]`
  - `GET /api/governance/approvals?status=pending` → `unknown[]` (count only)
  - `GET /api/compliance` → `{ status: 'compliant' | 'partial' | 'non-compliant' }[]`
  - `GET /api/privacy/pii-exposure` → `{ unprotected_pii_tables: number }`
- Produces: new JSX section after the Alert Summary strip

- [ ] **Step 1: Add `Eye`, `Users`, `Lock` to lucide-react import**

Extend the existing import line to include:

```tsx
  Gauge, AlertTriangle, Database, ShieldCheck, Activity, GitCompare, Fingerprint,
  Target, ListChecks, Clock, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp,
  TrendingDown, Eye, Users, Lock,
```

- [ ] **Step 2: Add state for all four Platform Health tiles**

After `const [slaLoading, setSlaLoading] = useState(true)` add:

```tsx
  const [freshness, setFreshness]               = useState<{ status: string }[]>([])
  const [freshnessLoading, setFreshnessLoading] = useState(true)
  const [ownershipScores, setOwnershipScores]   = useState<{ ownership_score: number }[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [stewardshipLoading, setStewardshipLoading] = useState(true)
  const [complianceFrameworks, setComplianceFrameworks] = useState<{ status: string }[]>([])
  const [complianceLoading, setComplianceLoading] = useState(true)
  const [piiExposure, setPiiExposure]           = useState<{ unprotected_pii_tables: number } | null>(null)
  const [privacyLoading, setPrivacyLoading]     = useState(true)
```

- [ ] **Step 3: Add four useEffect hooks to fetch Platform Health data**

After the SLA predictions `useEffect`, add:

```tsx
  useEffect(() => {
    fetch('/api/observability/freshness-board')
      .then(r => r.json())
      .then((d: unknown) => setFreshness(Array.isArray(d) ? (d as { status: string }[]) : []))
      .catch(() => {})
      .finally(() => setFreshnessLoading(false))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/governance/scorecards').then(r => r.json()).catch(() => []),
      fetch('/api/governance/approvals?status=pending').then(r => r.json()).catch(() => []),
    ]).then(([scores, approvals]: [unknown, unknown]) => {
      setOwnershipScores(Array.isArray(scores) ? (scores as { ownership_score: number }[]) : [])
      setPendingApprovals(Array.isArray(approvals) ? approvals.length : 0)
      setStewardshipLoading(false)
    })
  }, [])

  useEffect(() => {
    fetch('/api/compliance')
      .then(r => r.json())
      .then((d: unknown) => setComplianceFrameworks(Array.isArray(d) ? (d as { status: string }[]) : []))
      .catch(() => {})
      .finally(() => setComplianceLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/privacy/pii-exposure')
      .then(r => r.json())
      .then((d: { unprotected_pii_tables?: number }) => setPiiExposure({ unprotected_pii_tables: d?.unprotected_pii_tables ?? 0 }))
      .catch(() => setPiiExposure({ unprotected_pii_tables: 0 }))
      .finally(() => setPrivacyLoading(false))
  }, [])
```

- [ ] **Step 4: Add computed values before the return statement**

After `const slaBreached` line, add:

```tsx
  const freshnessOnTime   = freshness.filter(f => f.status === 'on_time').length
  const freshnessAtRisk   = freshness.filter(f => f.status === 'at_risk').length
  const freshnessBreached = freshness.filter(f => f.status === 'breached').length

  const avgOwnership = ownershipScores.length > 0
    ? Math.round(ownershipScores.reduce((s, d) => s + (d.ownership_score ?? 0), 0) / ownershipScores.length)
    : null

  const complianceCompliantCount   = complianceFrameworks.filter(f => f.status === 'compliant').length
  const complianceHasNonCompliant  = complianceFrameworks.some(f => f.status === 'non-compliant')
  const complianceHasPartial       = complianceFrameworks.some(f => f.status === 'partial')

  const piiCount = piiExposure?.unprotected_pii_tables ?? 0
```

- [ ] **Step 5: Add the Platform Health JSX section**

Insert the following block after the Alert Summary strip and before the `{/* Six Dimensions */}` section:

```tsx
      {/* Platform Health */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
        <SectionHeader
          icon={<Activity size={13} strokeWidth={2.4} />}
          title="Platform Health"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>

          {/* Observability */}
          <Link href="/observability" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Eye size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Observability</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: freshnessLoading ? 'var(--surface-muted)' : freshnessBreached > 0 ? 'var(--status-error-bg)' : freshnessAtRisk > 0 ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      freshnessLoading ? 'var(--text-muted)'    : freshnessBreached > 0 ? 'var(--status-error-text)' : freshnessAtRisk > 0 ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  {freshnessLoading ? '—' : freshnessBreached > 0 ? 'Breached' : freshnessAtRisk > 0 ? 'At risk' : 'Healthy'}
                </span>
              </div>
              <div style={platformMetric}>
                {freshnessLoading ? '—'
                  : freshness.length === 0 ? 'No data'
                  : `${freshnessOnTime} on-time · ${freshnessAtRisk} at-risk · ${freshnessBreached} breached`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Stewardship */}
          <Link href="/stewardship" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Users size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Stewardship</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: stewardshipLoading ? 'var(--surface-muted)' : avgOwnership === null ? 'var(--surface-muted)' : avgOwnership >= 90 && pendingApprovals === 0 ? 'var(--status-ok-bg)' : avgOwnership >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)',
                  color:      stewardshipLoading ? 'var(--text-muted)'    : avgOwnership === null ? 'var(--text-muted)' : avgOwnership >= 90 && pendingApprovals === 0 ? 'var(--status-ok-text)' : avgOwnership >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)',
                }}>
                  {stewardshipLoading ? '—' : avgOwnership === null ? 'No data' : avgOwnership >= 90 && pendingApprovals === 0 ? 'Healthy' : avgOwnership >= 75 ? 'Review' : 'Low'}
                </span>
              </div>
              <div style={platformMetric}>
                {stewardshipLoading ? '—'
                  : avgOwnership === null ? 'No ownership data'
                  : `${avgOwnership}% ownership · ${pendingApprovals} pending approval${pendingApprovals !== 1 ? 's' : ''}`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Compliance */}
          <Link href="/compliance" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><ShieldCheck size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Compliance</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: complianceLoading ? 'var(--surface-muted)' : complianceHasNonCompliant ? 'var(--status-error-bg)' : complianceHasPartial ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      complianceLoading ? 'var(--text-muted)'    : complianceHasNonCompliant ? 'var(--status-error-text)' : complianceHasPartial ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  {complianceLoading ? '—' : complianceHasNonCompliant ? 'Failing' : complianceHasPartial ? 'Partial' : 'Compliant'}
                </span>
              </div>
              <div style={platformMetric}>
                {complianceLoading ? '—'
                  : complianceFrameworks.length === 0 ? 'No frameworks'
                  : `${complianceCompliantCount} / ${complianceFrameworks.length} framework${complianceFrameworks.length !== 1 ? 's' : ''} compliant`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Privacy */}
          <Link href="/privacy" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Lock size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Privacy</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: privacyLoading ? 'var(--surface-muted)' : piiCount > 0 ? 'var(--status-error-bg)' : 'var(--status-ok-bg)',
                  color:      privacyLoading ? 'var(--text-muted)'    : piiCount > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)',
                }}>
                  {privacyLoading ? '—' : piiCount > 0 ? 'Exposed' : 'Protected'}
                </span>
              </div>
              <div style={platformMetric}>
                {privacyLoading ? '—'
                  : piiExposure === null ? 'Loading…'
                  : piiCount === 0 ? 'All PII tables protected'
                  : `${piiCount} unprotected PII table${piiCount !== 1 ? 's' : ''}`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

        </div>
      </div>
```

- [ ] **Step 6: Add `platformTile`, `platformIconWrap`, `platformLabel`, `platformMetric`, `platformLink` style consts**

At the bottom of the file, after the `kpiIconWrap` const, add:

```tsx
const platformTile: React.CSSProperties = {
  background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)',
  padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
}
const platformIconWrap: React.CSSProperties = {
  width: '22px', height: '22px', borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const platformLabel: React.CSSProperties = { fontSize: '12.5px', fontWeight: 700, color: 'var(--foreground)' }
const platformMetric: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '10px', minHeight: '16px' }
const platformLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '2px',
  fontSize: '11px', color: 'var(--accent)', fontWeight: 600,
}
const statusPill: React.CSSProperties = {
  padding: '2px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap',
}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/Dashboard.tsx
git commit -m "feat(overview): add Platform Health section with Observability, Stewardship, Compliance, Privacy tiles"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 4 polish fixes covered (trend delta T1, SLA tile T2, alert strip T3, minWidth T1). Platform Health section covered (T4).
- [x] **No placeholders:** All code is complete — no "TBD", no "add appropriate handling", no "similar to above".
- [x] **Type consistency:** `freshness` typed as `{ status: string }[]` in state and useEffect cast. `ownershipScores` typed as `{ ownership_score: number }[]`. `complianceFrameworks` typed as `{ status: string }[]`. `piiExposure` typed as `{ unprotected_pii_tables: number } | null`. All computed values reference these exact property names.
- [x] **Icon consistency:** `TrendingDown`, `Eye`, `Users`, `Lock` all added to import in Task 1 Step 1 and Task 4 Step 1. The plan adds them in Task 1 and re-uses them — note: if executing tasks out of order, ensure the import line includes all four icons before running Task 4.
- [x] **Style const names:** `platformTile`, `platformIconWrap`, `platformLabel`, `platformMetric`, `platformLink`, `statusPill` — referenced in JSX (T4 Step 5) and defined in consts (T4 Step 6). Consistent throughout.
