# Trend Chart Upgrade — Design Spec

**Date:** 2026-06-20
**Scope:** `frontend/src/components/shared/charts.tsx` — `TrendChart` component only
**Goal:** Upgrade the shared `TrendChart` to enterprise-grade: smooth curves, score-zone bands, score-aware styling, richer tooltip, better axis labels, and responsive width. No new dependencies.

---

## Background

`TrendChart` is a hand-rolled SVG chart used in three places:
- `Dashboard.tsx` — the primary 7-day quality trend
- `components/domains/DomainHealthTrends.tsx`
- `components/asset-registry/AssetTrendsTab.tsx` and `AssetQualityTab.tsx`

All consumers share the same component from `components/shared/charts.tsx`. The upgrade lands in one file and benefits all consumers automatically.

### Current problems

| Problem | Impact |
|---|---|
| `preserveAspectRatio="none"` + fixed `w=600` | Chart stretches/distorts at non-600px widths |
| Straight `L` path commands | Jagged, non-professional line |
| Gradient fill 0.15→0 opacity | Area barely visible |
| Tooltip: date + score only | No delta, no failed/alert context |
| Raw ISO date labels ("2026-06-20") | Hard to read at a glance |
| No zone context | User must mentally map score to "good/bad" |

---

## Section 1: Visual Upgrades

### 1.1 Smooth Cubic Bezier Curves

Replace all `L` (line-to) commands in the area and line paths with cubic bezier `C` commands.

**Algorithm:** For each point `i`, compute control points:
```
cp1x = pts[i-1].x + (pts[i].x - pts[i-2].x) / 6
cp1y = pts[i-1].y + (pts[i].y - pts[i-2].y) / 6
cp2x = pts[i].x - (pts[i+1].x - pts[i-1].x) / 6
cp2y = pts[i].y - (pts[i+1].y - pts[i-1].y) / 6
```
Clamp control points at boundaries (first and last point use simplified one-sided tangents). This produces natural-looking curves that pass through every data point without overshooting into negative territory.

Apply to both the line path and the area fill path.

### 1.2 Score-Zone Background Bands

Three `<rect>` elements rendered behind the chart data, inside the chart area only (clipped to `pad.left` → `w - pad.right`, `pad.top` → `pad.top + chartH`):

| Zone | Score range | Fill color | Opacity |
|---|---|---|---|
| Healthy | 90 – 100 | `#16a34a` | 0.04 |
| Warning | 75 – 90 | `#ea8b3a` | 0.04 |
| Critical | 0 – 75 | `#dc2626` | 0.04 |

Bands are clipped to the Y range visible in the chart (i.e. if `min > 75`, the red and amber bands don't render). Each band's pixel height is computed from the chart's Y scale.

### 1.3 Score-Aware Line and Gradient Fill

Derive `lineColor` from the last valid data point's score:
- `score >= 90` → `#16a34a`
- `score >= 75` → `#ea8b3a`
- `score < 75` → `#dc2626`

Apply `lineColor` to:
- The SVG `<path>` stroke for the line
- The `<linearGradient>` stop color (top stop: `lineColor` at 0.22 opacity, bottom stop: 0)
- The active dot stroke and fill ring

Use a unique gradient ID per render to avoid SVG `<defs>` collisions when multiple `TrendChart` instances appear on the same page (e.g. `trendgradient-${instanceId}` using a `useId()` hook or a module-level counter).

### 1.4 Upgraded Dots

Per data point, render two overlapping circles:
1. **Hit target:** `r=12`, `fill="transparent"`, `stroke="none"` — captures mouse events without visual noise
2. **Visible dot:** `r=3.5` normally; `r=6` when hovered (this point is `tooltip?.date === p.date`)
   - Hovered state: `fill="#fff"`, `stroke=lineColor`, `strokeWidth=2.5`, `filter="drop-shadow(0 1px 4px rgba(0,0,0,0.18))"`
   - Normal state: `fill=lineColor`, `stroke="#fff"`, `strokeWidth=1.5`

Transition: `style={{ transition: 'r 0.12s ease' }}` on the visible dot.

### 1.5 Responsive Width via ResizeObserver

Add a `useEffect` that attaches a `ResizeObserver` to the wrapper `<div>`. On resize, update a `containerW` state variable. Use `containerW` in place of the hardcoded `w=600`.

```tsx
const wrapRef = useRef<HTMLDivElement>(null)
const [containerW, setContainerW] = useState(600)
useEffect(() => {
  if (!wrapRef.current) return
  const ro = new ResizeObserver(entries => {
    setContainerW(entries[0].contentRect.width || 600)
  })
  ro.observe(wrapRef.current)
  return () => ro.disconnect()
}, [])
```

Replace `const w = 600` with `const w = containerW`. Remove both the `viewBox` attribute and `preserveAspectRatio` from the `<svg>` element entirely. Keep `width="100%"` and `height={h}` (fixed pixel height). Without a `viewBox`, the SVG coordinate system maps 1:1 to the element's pixel dimensions — since `containerW` is the measured pixel width of the wrapper, all computed `x` values sit in the correct coordinate space with zero distortion.

### 1.6 Cleaner Y-Axis

- 5 grid lines (unchanged count)
- Append `%` suffix to the topmost Y-axis label only
- Two special threshold reference lines at y=90 and y=75:
  - `strokeDasharray="4 2"`, `strokeOpacity=0.5`
  - Slightly thicker: `strokeWidth=1.5` vs regular `strokeWidth=1`
  - Label color: green for 90, amber for 75
- Regular gridlines: `stroke="#e5e7eb"` `strokeWidth=1` `strokeDasharray="3 3"` (unchanged)
- Add a solid `strokeWidth=1` baseline at `y = pad.top + chartH` (`stroke="#e5e7eb"`)

---

## Section 2: Information Density

### 2.1 Richer Tooltip

Replace the current tooltip (date + score) with a structured card:

```
┌──────────────────────────┐
│ Jun 20, 2026             │
│ ─────────────────────    │
│  87.4%    ↓ −1.8 vs prev │
│  3 failed runs           │  ← hidden if failed === 0
│  2 alerts · 1 anomaly    │  ← hidden if both === 0
└──────────────────────────┘
```

**Layout:**
- Header: formatted date (`toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`)
- Score row: large score number (colored by health), delta in smaller text to the right
  - Delta = `score - prevScore`; show `↑ +X.X` (green) or `↓ −X.X` (red); "—" if no prev point
- Failed runs row: only rendered if `d.failed > 0`
- Alerts + anomalies row: only rendered if `(alert_count ?? 0) + (anomaly_count ?? 0) > 0`

**Tooltip positioning:** keep current `transform: 'translate(-50%, -130%)'` but add viewport-edge clamping: if `tooltip.x < 15%`, shift right; if `tooltip.x > 85%`, shift left. Prevents tooltip from going off-screen at chart edges.

**Tooltip style:**
- Background: `#0f172a` (darker than current `#1e293b`)
- Border: `1px solid rgba(255,255,255,0.08)`
- Padding: `10px 14px`
- Border radius: `10px`
- Min-width: `160px`

### 2.2 Formatted X-Axis Date Labels

Replace raw ISO strings with `new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`.

The last visible label: if `d.date === today` (compare to `new Date().toISOString().slice(0,10)`), render "Today" instead of the formatted date, in `var(--accent)` color (blue) to make it stand out.

Label spacing: unchanged (every `Math.ceil(n/7)` points + last point always shown).

### 2.3 Threshold Reference Lines at 90 and 75

Two additional `<line>` elements at the 90 and 75 score positions (only if those values fall within the visible Y range, i.e. `min < 90` and `min < 75` respectively):

- `stroke="#16a34a"` at y=90, `stroke="#ea8b3a"` at y=75
- `strokeWidth=1`, `strokeDasharray="4 3"`, `strokeOpacity=0.45`
- Small colored `<circle>` r=3 at `x=pad.left - 3` on each line (dot on the Y axis)
- Y-axis text at these positions: colored ("90" in green, "75" in amber) — replaces the nearest regular gridline label if within 3 score units

### 2.4 Min/Max Annotations

Conditions for display: `validPts.length >= 5` AND `(maxScore - minScore) >= 5`.

Find `maxPt` and `minPt` (the points with highest and lowest scores). Render:
- `↑ {maxScore.toFixed(1)}` label at `(maxPt.x, maxPt.y - 10)`, `textAnchor="middle"`, `fontSize=9`, `fill="#16a34a"`
- `↓ {minScore.toFixed(1)}` label at `(minPt.x, minPt.y + 14)`, `textAnchor="middle"`, `fontSize=9`, `fill="#dc2626"`

If max and min are the same point (single-point edge case): don't render either annotation.

If the annotation would overlap the Y-axis label area (`x < pad.left + 20`), shift it right by 16px.

### 2.5 Baseline

A solid `<line>` at `y = pad.top + chartH`:
- `x1=pad.left`, `x2=w - pad.right`
- `stroke="#e5e7eb"`, `strokeWidth=1`
- This grounds the area fill and replaces the implicit bottom edge.

---

## Preserved Behaviour

All existing props and their behaviour are unchanged:
- `data: TrendPoint[]` — historical data points
- `onPointClick?: (date: string) => void` — drilldown callback
- `forecastData?: ForecastPoint[]` — forecast dashed line
- `upperBand? / lowerBand?` — confidence band shading
- Alert/anomaly markers (purple triangles and orange diamonds at top of chart)
- The alert/anomaly/forecast legend below the chart
- The `ScorePill` export (untouched)

The forecast dashed line, confidence band, and "Today" divider line for forecast view are preserved as-is.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/shared/charts.tsx` | All changes — `TrendChart` rewrite, `ScorePill` untouched |

---

## Out of Scope

- No changes to `Dashboard.tsx`, `DomainHealthTrends.tsx`, `AssetTrendsTab.tsx`, or `AssetQualityTab.tsx`
- No new charting library
- No backend changes
- No changes to the `ScorePill` component
- No animation beyond the dot hover transition
