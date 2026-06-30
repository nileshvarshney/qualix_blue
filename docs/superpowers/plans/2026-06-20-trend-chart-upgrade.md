# Trend Chart Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the shared `TrendChart` SVG component to enterprise-grade: responsive width, smooth bezier curves, score-zone bands, score-aware colors, upgraded dots, richer tooltip with delta/failed/alert context, formatted dates, threshold reference lines, and min/max annotations.

**Architecture:** All changes are in one file — `frontend/src/components/shared/charts.tsx`. The `TrendChart` function is rewritten incrementally across 5 tasks; `ScorePill` is untouched. All existing props and their semantics are preserved exactly. No new dependencies.

**Tech Stack:** React 18, TypeScript (strict), inline SVG, `ResizeObserver` Web API

## Global Constraints

- No test framework — verification is `cd frontend && npx tsc --noEmit` (must exit 0) after every task
- TypeScript strict mode — all new code must type-check; no `any`
- No new imports beyond adding `useEffect` to the existing React import
- No new npm packages
- All existing props (`data`, `onPointClick`, `forecastData`, `upperBand`, `lowerBand`) must continue to work unchanged
- Forecast dashed line, confidence band, alert/anomaly markers, and legend are preserved as-is
- File: `frontend/src/components/shared/charts.tsx` — no other files change

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/shared/charts.tsx` | All changes across all 5 tasks |

---

## Task 1: Responsive Container + Baseline + Zone Bands

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Produces: `containerW: number` state, `wrapRef: RefObject<HTMLDivElement>` — used by all subsequent tasks in place of hardcoded `w=600`

- [ ] **Step 1: Add `useEffect` to the React import**

Change line 2 from:
```tsx
import { useState, useRef } from 'react'
```
to:
```tsx
import { useState, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Add a module-level instance counter above the `TrendChart` function**

After the `ScorePill` function (before `export function TrendChart`), add:
```tsx
let _chartInstanceCount = 0
```

- [ ] **Step 3: Add `wrapRef`, `containerW` state, and `instanceId` inside `TrendChart`**

After the existing `const [tooltip, setTooltip] = useState(...)` line, add:
```tsx
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(600)
  const [instanceId] = useState(() => ++_chartInstanceCount)
  const gradientId = `tg-${instanceId}`
```

- [ ] **Step 4: Add `ResizeObserver` effect**

After the `const svgRef = useRef<SVGSVGElement>(null)` line, add:
```tsx
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(entries => {
      setContainerW(Math.round(entries[0].contentRect.width) || 600)
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])
```

- [ ] **Step 5: Replace the hardcoded `w` and expand left padding**

Change:
```tsx
  const w = 600, h = 240, pad = { top: 20, right: 20, bottom: 30, left: 35 }
```
to:
```tsx
  const w = containerW
  const h = 240
  const pad = { top: 20, right: 20, bottom: 30, left: 40 }
```

- [ ] **Step 6: Update the gradient ID reference**

Change:
```tsx
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
```
to:
```tsx
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
```

And change:
```tsx
        <path d={areaPath} fill="url(#ag2)" />
```
to:
```tsx
        <path d={areaPath} fill={`url(#${gradientId})`} />
```

- [ ] **Step 7: Update the `<svg>` element — remove `viewBox` and `preserveAspectRatio`, add `ref` to wrapper div**

Change the `return (` block opening from:
```tsx
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
```
to:
```tsx
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h}
```

- [ ] **Step 8: Add baseline and zone bands to the SVG body**

Inside the SVG, immediately before the `{gridLines.map(...)}` block, add:
```tsx
        {/* Zone bands */}
        {[
          { lo: 90, hi: 100, color: '#16a34a' },
          { lo: 75, hi: 90,  color: '#ea8b3a' },
          { lo: 0,  hi: 75,  color: '#dc2626' },
        ].map(z => {
          const visLo = Math.max(z.lo, min)
          const visHi = Math.min(z.hi, max)
          if (visLo >= visHi) return null
          const zy1 = pad.top + chartH - ((visHi - min) / (max - min)) * chartH
          const zy2 = pad.top + chartH - ((visLo - min) / (max - min)) * chartH
          return (
            <rect key={z.lo} x={pad.left} y={zy1}
              width={w - pad.left - pad.right} height={zy2 - zy1}
              fill={z.color} fillOpacity="0.04" />
          )
        })}
        {/* Baseline */}
        <line x1={pad.left} x2={w - pad.right}
          y1={pad.top + chartH} y2={pad.top + chartH}
          stroke="#e5e7eb" strokeWidth="1" />
```

- [ ] **Step 9: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): responsive container, zone bands, baseline for TrendChart"
```

---

## Task 2: Smooth Bezier Curves + Score-Aware Styling + Upgraded Dots

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Consumes: `gradientId` and `containerW`/`w` from Task 1
- Produces: `smoothPath(points)` module-level helper, `lineColor: string` derived value

- [ ] **Step 1: Add the `smoothPath` helper function**

After the `_chartInstanceCount` line (before `export function TrendChart`), add:
```tsx
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  const n = points.length
  const parts: string[] = [`M${points[0].x},${points[0].y}`]
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const pp = points[Math.max(0, i - 2)]
    const nx = points[Math.min(n - 1, i + 1)]
    const cp1x = prev.x + (curr.x - pp.x) / 6
    const cp1y = prev.y + (curr.y - pp.y) / 6
    const cp2x = curr.x - (nx.x - prev.x) / 6
    const cp2y = curr.y - (nx.y - prev.y) / 6
    parts.push(`C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${curr.x},${curr.y}`)
  }
  return parts.join(' ')
}
```

- [ ] **Step 2: Add `lineColor` computation before the return statement**

After the `const pts = validPts.map(...)` block, add:
```tsx
  const lastScore = pts[pts.length - 1]?.score ?? 0
  const lineColor = lastScore >= 90 ? '#16a34a' : lastScore >= 75 ? '#ea8b3a' : '#dc2626'
```

- [ ] **Step 3: Replace `linePath` and `areaPath` with smooth bezier versions**

Change:
```tsx
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`
```
to:
```tsx
  const linePath = smoothPath(pts)
  const bottomY = pad.top + chartH
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${bottomY} L${pts[0].x},${bottomY} Z`
```

- [ ] **Step 4: Update the gradient to use `lineColor` with stronger opacity**

Change:
```tsx
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
```
to:
```tsx
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
```

- [ ] **Step 5: Update the line `<path>` stroke to use `lineColor`**

Change:
```tsx
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
```
to:
```tsx
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" />
```

- [ ] **Step 6: Replace the existing dot `<circle>` with a hit-target + visible dot pair**

Find and replace the existing dot block:
```tsx
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            onClick={() => onPointClick?.(p.date)}
            style={{ transition: 'r 0.1s', cursor: onPointClick ? 'pointer' : 'default' }} />
        ))}
```
with:
```tsx
        {pts.map((p, i) => {
          const isActive = tooltip?.date === p.date
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={12} fill="transparent"
                onClick={() => onPointClick?.(p.date)}
                style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
              <circle cx={p.x} cy={p.y} r={isActive ? 6 : 3.5}
                fill={isActive ? '#fff' : lineColor}
                stroke={lineColor} strokeWidth={isActive ? 2.5 : 1.5}
                style={{
                  transition: 'r 0.12s ease',
                  filter: isActive ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.18))' : 'none',
                  pointerEvents: 'none',
                }} />
            </g>
          )
        })}
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): smooth bezier curves, score-aware line color, upgraded dots"
```

---

## Task 3: Y-Axis Improvements + Threshold Reference Lines

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Consumes: `min`, `max`, `chartH`, `pad`, `w` (all existing)
- Produces: styled gridlines with `%` suffix on topmost label; separate threshold line group at 90 and 75

- [ ] **Step 1: Update gridline rendering — `%` suffix on topmost, round to integers**

Find the existing `{gridLines.map(...)}` block:
```tsx
        {gridLines.map(v => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return <g key={v}><line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" /><text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text></g>
        })}
```
Replace with:
```tsx
        {gridLines.map((v, gi) => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          const label = gi === gridLines.length - 1 ? `${Math.round(v)}%` : String(Math.round(v))
          return (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y}
                stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                {label}
              </text>
            </g>
          )
        })}
```

- [ ] **Step 2: Add threshold reference lines at 90 and 75**

Immediately after the `{gridLines.map(...)}` closing block (and before the failed-run bars), add:
```tsx
        {/* Threshold reference lines at 90 and 75 */}
        {([{ v: 90, color: '#16a34a' }, { v: 75, color: '#ea8b3a' }] as const).map(({ v, color }) => {
          if (v <= min || v >= max) return null
          const ty = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={ty} y2={ty}
                stroke={color} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.45" />
              <circle cx={pad.left - 3} cy={ty} r="3" fill={color} fillOpacity="0.7" />
              <text x={pad.left - 9} y={ty + 4} textAnchor="end" fontSize="10"
                fill={color} fontWeight="600">{v}</text>
            </g>
          )
        })}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): improved Y-axis labels, threshold reference lines at 90 and 75"
```

---

## Task 4: Richer Tooltip + Formatted X-Axis Dates + Today Label

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Consumes: `validPts` (existing), `pts` (existing), `h`, `w`
- Produces: `formatDate(iso): string`, `formatAxisDate(iso): string` module-level helpers; expanded `tooltip` state type

- [ ] **Step 1: Add date formatter helpers**

After the `smoothPath` function, add:
```tsx
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

- [ ] **Step 2: Expand the `tooltip` state type**

Change:
```tsx
  const [tooltip, setTooltip] = useState<{ x: number; y: number; score: number; date: string } | null>(null)
```
to:
```tsx
  const [tooltip, setTooltip] = useState<{
    x: number; y: number
    score: number; date: string
    prevScore: number | null
    failed: number
    alertCount: number
    anomalyCount: number
  } | null>(null)
```

- [ ] **Step 3: Update the `onMouseMove` handler to populate expanded tooltip**

Find the existing `onMouseMove` prop on the `<svg>`:
```tsx
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closest = pts[0], minDist = Infinity
          pts.forEach(p => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closest = p } })
          if (minDist < 30) setTooltip({ x: (closest.x / w) * 100, y: (closest.y / h) * 100, score: closest.score, date: closest.date })
          else setTooltip(null)
        }}>
```
Replace with:
```tsx
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closestIdx = 0, minDist = Infinity
          pts.forEach((p, i) => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closestIdx = i } })
          if (minDist < 30) {
            const p = pts[closestIdx]
            const orig = validPts[closestIdx]
            setTooltip({
              x: (p.x / w) * 100,
              y: (p.y / h) * 100,
              score: p.score,
              date: p.date,
              prevScore: closestIdx > 0 ? pts[closestIdx - 1].score : null,
              failed: orig.failed ?? 0,
              alertCount: orig.alert_count ?? 0,
              anomalyCount: orig.anomaly_count ?? 0,
            })
          } else {
            setTooltip(null)
          }
        }}>
```

- [ ] **Step 4: Replace the tooltip JSX with the new structured card**

Find the existing tooltip block:
```tsx
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
```
Replace with:
```tsx
      {tooltip && (() => {
        const delta = tooltip.prevScore !== null ? tooltip.score - tooltip.prevScore : null
        const scoreColor = tooltip.score >= 90 ? '#4ade80' : tooltip.score >= 75 ? '#fbbf24' : '#f87171'
        const clampedX = Math.max(10, Math.min(85, tooltip.x))
        const translateX = clampedX < 15 ? '0%' : clampedX > 85 ? '-100%' : '-50%'
        const arrowLeft = clampedX < 15 ? '20px' : clampedX > 85 ? 'calc(100% - 20px)' : '50%'
        return (
          <div style={{
            position: 'absolute', left: `${clampedX}%`, top: `${tooltip.y}%`,
            transform: `translate(${translateX}, -130%)`,
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', padding: '10px 14px', borderRadius: '10px',
            fontSize: '12px', fontWeight: 500, pointerEvents: 'none',
            whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 10, minWidth: '160px',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>
              {formatDate(tooltip.date)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: (tooltip.failed > 0 || tooltip.alertCount + tooltip.anomalyCount > 0) ? '6px' : 0 }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: scoreColor, letterSpacing: '-0.5px' }}>
                {tooltip.score.toFixed(1)}%
              </span>
              {delta !== null && (
                <span style={{ fontSize: '11px', color: delta >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {delta >= 0 ? '↑ +' : '↓ '}{delta.toFixed(1)} vs prev
                </span>
              )}
            </div>
            {tooltip.failed > 0 && (
              <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '2px' }}>
                {tooltip.failed} failed run{tooltip.failed !== 1 ? 's' : ''}
              </div>
            )}
            {(tooltip.alertCount + tooltip.anomalyCount) > 0 && (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {tooltip.alertCount > 0 && `${tooltip.alertCount} alert${tooltip.alertCount !== 1 ? 's' : ''}`}
                {tooltip.alertCount > 0 && tooltip.anomalyCount > 0 && ' · '}
                {tooltip.anomalyCount > 0 && `${tooltip.anomalyCount} anomal${tooltip.anomalyCount !== 1 ? 'ies' : 'y'}`}
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: '-5px', left: arrowLeft,
              transform: 'translateX(-50%)', width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: '5px solid #0f172a',
            }} />
          </div>
        )
      })()}
```

- [ ] **Step 5: Update X-axis date labels to use formatted dates and Today highlight**

Find the existing X-axis label block:
```tsx
        {validPts.filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1).map((d) => {
          const idx = validPts.indexOf(d)
          return <text key={idx} x={xForN(idx)} y={h - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.date}</text>
        })}
```
Replace with:
```tsx
        {(() => {
          const todayIso = new Date().toISOString().slice(0, 10)
          return validPts
            .filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1)
            .map(d => {
              const idx = validPts.indexOf(d)
              const isToday = d.date === todayIso
              return (
                <text key={idx} x={xForN(idx)} y={h - 8} textAnchor="middle" fontSize="10"
                  fill={isToday ? 'var(--accent, #3b82f6)' : '#9ca3af'}
                  fontWeight={isToday ? '600' : '400'}>
                  {isToday ? 'Today' : formatAxisDate(d.date)}
                </text>
              )
            })
        })()}
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): rich tooltip with delta/failed/alerts, formatted dates, Today label"
```

---

## Task 5: Min/Max Score Annotations

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Consumes: `pts` (array of `{x, y, score, date}`), `validPts`, `pad`, `w`
- Produces: conditional `↑ max` / `↓ min` SVG text labels on the chart

- [ ] **Step 1: Add min/max annotation block inside the SVG**

Inside the SVG, after the dots `<g>` blocks (after the `{pts.map(...)` dot block) and before the alert/anomaly markers, add:
```tsx
        {/* Min/max annotations */}
        {validPts.length >= 5 && (() => {
          const scores = validPts.map(d => d.score)
          const maxScore = Math.max(...scores)
          const minScore = Math.min(...scores)
          if (maxScore - minScore < 5) return null
          const maxIdx = scores.indexOf(maxScore)
          const minIdx = scores.indexOf(minScore)
          if (maxIdx === minIdx) return null
          const clampX = (x: number) => Math.max(pad.left + 20, Math.min(w - pad.right - 20, x))
          return (
            <>
              <text x={clampX(pts[maxIdx].x)} y={pts[maxIdx].y - 10}
                textAnchor="middle" fontSize="9" fill="#16a34a" fontWeight="600">
                ↑ {maxScore.toFixed(1)}
              </text>
              <text x={clampX(pts[minIdx].x)} y={pts[minIdx].y + 14}
                textAnchor="middle" fontSize="9" fill="#dc2626" fontWeight="600">
                ↓ {minScore.toFixed(1)}
              </text>
            </>
          )
        })()}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): min/max score annotations on trend chart"
```

---

## Self-Review Checklist

- [x] **Spec 1.1 Smooth curves:** `smoothPath` function defined (Task 2 Step 1), `linePath`/`areaPath` use it (Task 2 Step 3)
- [x] **Spec 1.2 Zone bands:** three `<rect>` elements with `fillOpacity=0.04` (Task 1 Step 8)
- [x] **Spec 1.3 Score-aware line + gradient:** `lineColor` computed from last score (Task 2 Step 2), applied to gradient stop and line path (Task 2 Steps 4-5), gradient opacity 0.22→0 (Task 2 Step 4)
- [x] **Spec 1.4 Upgraded dots:** hit-target r=12 transparent + visible dot r=3.5/6 (Task 2 Step 6)
- [x] **Spec 1.5 Responsive width:** `ResizeObserver` effect (Task 1 Step 4), `w = containerW` (Task 1 Step 5), viewBox/preserveAspectRatio removed (Task 1 Step 7)
- [x] **Spec 1.6 Y-axis:** `%` on topmost label (Task 3 Step 1), threshold lines at 90/75 with colored dot + dashed line (Task 3 Step 2)
- [x] **Spec 2.1 Richer tooltip:** date, delta, failed, alerts/anomalies, viewport clamping (Task 4 Steps 2-4)
- [x] **Spec 2.2 Formatted dates:** `formatAxisDate` helper (Task 4 Step 1), `Today` label in accent color (Task 4 Step 5)
- [x] **Spec 2.3 Threshold lines:** 90/75 colored dashed lines with circle on Y-axis (Task 3 Step 2)
- [x] **Spec 2.4 Min/max annotations:** conditional on ≥5 pts + range ≥5, clamped X (Task 5 Step 1)
- [x] **Spec 2.5 Baseline:** solid line at `pad.top + chartH` (Task 1 Step 8)
- [x] **Gradient ID uniqueness:** `instanceId` from module counter, `gradientId = tg-${instanceId}` (Task 1 Steps 2-3, 6)
- [x] **Type consistency:** `tooltip.prevScore`, `tooltip.failed`, `tooltip.alertCount`, `tooltip.anomalyCount` defined in state type (Task 4 Step 2) and populated in `onMouseMove` (Task 4 Step 3), referenced in JSX (Task 4 Step 4)
- [x] **No placeholders:** all code blocks are complete and runnable
