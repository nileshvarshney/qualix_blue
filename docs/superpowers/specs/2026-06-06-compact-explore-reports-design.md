# Compact Redesign — Data Browser · Spot Check · Reports · Executive · Data Products

**Date:** 2026-06-06
**Branch:** nilesh_compact_design
**Pages in scope:** `/data-browser`, `/spot-check`, `/reports`, `/executive`, `/data-products`

---

## Goal

Apply the same compact, data-dense layout already present on Data Quality and Governance pages to the five remaining pages. Replace large KPI grid cards with inline stat badges, convert card grids and two-column layouts into dense scrollable row lists, and surface full detail in a right-side slide-in panel on row click.

---

## Shared Compact Spine

All five pages use the same structural skeleton:

```
padding: 10px 16px
height: 100vh
display: flex
flex-direction: column
box-sizing: border-box
gap: 8px
background: var(--background)
```

### Top bar
Single flex row, `align-items: center`, `flex-shrink: 0`:
- Left: page title `font-size: var(--text-md), font-weight: 600` + inline stat badges
- Right: action buttons

### Stat badges (replace all KPI grid cards)
```
background: <status-bg>
color: <status-text>
padding: 1px 6px
border-radius: 4px
font-size: 10px
font-weight: 600
```

### Search / filter bar
```
padding: 5px 8px
border: 1px solid var(--border)
border-radius: 5px
font-size: 11px
flex-shrink: 0
```

### Column header row
```
display: grid  (columns defined per page)
border-bottom: 1px solid var(--border)
padding: 2px 0 4px
flex-shrink: 0
font-size: 9px, text-transform: uppercase, letter-spacing: 0.05em, color: var(--text-muted)
```

### Scrollable list
```
flex: 1
overflow-y: auto
```

### Dense rows
```
display: grid  (columns defined per page)
align-items: center
padding: 5px 0
border-bottom: 1px solid var(--surface-muted)
cursor: pointer
font-size: 11px–11.5px
```

### Slide-in panel (all pages except Executive)
**Backdrop:**
```
position: fixed, inset: 0
background: rgba(0,0,0,0.18)
z-index: 199
cursor: pointer  ← click closes panel
```

**Panel:**
```
position: fixed
top: 0, right: 0, bottom: 0
width: min(480px, 55vw)
background: var(--surface)
border-left: 1px solid var(--border)
box-shadow: -4px 0 24px rgba(0,0,0,0.10)
display: flex, flex-direction: column
z-index: 200
overflow-y: auto
```

**Panel header:** status/tier badge + item name + ✕ close button. `padding: 14px 16px, border-bottom: 1px solid var(--border)`.

---

## Page-by-Page Design

### `/data-products`

**Top bar badges:** `{n} total · {certified} certified · avg {score}%`
**Action button:** `+ Create Product`

**Row grid:** `1fr 110px 70px 65px 55px`
```
tier icon + name  ·  domain  ·  owner  ·  status badge  ·  quality score badge
```
- Tier icon (🥇🥈🥉) inline with name
- Status badge: Certified / Published / Draft (colored pill)
- Quality score: colored pill (green ≥90, amber ≥80, red <80)
- Hover: edit/delete icons appear on right

**Slide-in panel content:**
- Tier icon + name + domain/owner header
- Status + tier badges
- 4-metric grid: Quality · Consumers · Datasets · SLA
- Quality score bar
- Tags
- Metadata: Last Updated · Freshness · Domain · Owner

**Create modal:** unchanged.

---

### `/executive`

Compact header only — no list, no popup (placeholder page).

**Top bar badges:** `Overall Quality — · Governance — · SLA — · {n} incidents · {n} products`
(All badges show `—` until real data exists.)

Body: compact empty-state placeholders, reduced padding and font sizes to match the spec. No KPI grid cards.

---

### `/data-browser`

**Top bar badges:** `{n} tables · {populated} with data · {empty} empty · {totalRows} rows · {size}`
**Action buttons:** `Expand All · Collapse All · ↺ Refresh`

**Search + filter bar** — single inline row:
- Search input (`flex: 1`, `font-size: 11px`)
- Filter pills inline: `All ({n}) · Has Data ({n}) · Empty ({n})`

**Accordion row grid:** `1fr 80px 60px 140px 20px` — `padding: 5px 8px`, `font-size: 11px`
```
TABLE_NAME + type badge + has-data dot  ·  row count  ·  size  ·  modified date  ·  ▾
```
- Chevron (▾) toggles inline expand → existing DataGrid / ColumnLoader, unchanged
- Click on row (not chevron) → slide-in panel

**Slide-in panel content:**
- Full qualified path (`CATALOG.SCHEMA.TABLE`)
- Type badge (TABLE / VIEW) + has-data status
- 4-metric strip: Row Count · Size · Created · Modified
- Schema columns table (for empty tables)

---

### `/spot-check`

**Top bar badges:** `{common} common · {onlyA} only A · {onlyB} only B · {rowDiff} row diff`
**Action button:** `▶ Run Check`

**Schema selector** — compact inline row (replaces 3-card grid):
```
[Schema A dropdown]  ⇄  [Schema B dropdown]   (flex row, padding: 6px 0)
```
Each dropdown has a small muted label below: `{n} tables · {rows} rows`.

**Table list row grid:** `1fr 60px 60px 80px` — `font-size: 11px`
```
table name  ·  rows A  ·  rows B  ·  status badge
```
- Status badges: Match (green) · Row Diff (amber) · Schema Drift (red)

**Slide-in panel content:**
- Table name header + rows-A/rows-B/row-diff strip
- Tabs: Column Comparison | Summary Statistics
- Column Comparison tab: existing column-by-column table (Type A · Type B · Nullable · Keys · Status)
- Stats tab: existing stats comparison table

---

### `/reports` (via `ReportsClient`)

**Top bar badges:** `{n} runs · avg {score}% · {passed} passed · {failed} failed · {warnings} warnings`
**Action button:** `+ Create Report`

**Report list row grid:** `44px 1fr 70px 80px` — `padding: 5px 0`, `font-size: 11px`
```
score badge  ·  report name  ·  date  ·  check counts (✓{n} ✗{n} ⚠{n})
```
- Score badge: colored pill `{score}%`
- Selected row: left-border accent
- Click → slide-in panel

**Slide-in panel content:**
1. Panel header: report name + score pill + executed date
2. 4-metric inline strip: Total Checks · Passed · Failed · Warnings (no cards)
3. Category breakdown: compact clickable tiles (existing, reduced size)
4. Trend chart: existing SVG, unchanged
5. Filters bar: search + status tabs + scope filter (existing, compact)
6. Results table: existing dense grid (Rule · Type · Table · Category · Severity · Score · Checked · Failed · Status)
7. Expandable row detail: inline expand with SQL preview + AI analysis (existing behavior)

**Create Report modal:** unchanged.

---

## What Does NOT Change

- DataGrid component inside Data Browser (inline expand content)
- ColumnLoader component
- Spot Check column comparison and stats logic
- Reports results table logic, category breakdown, trend chart SVG
- Create Product modal
- Create Report modal
- All colour variables (`var(--status-error-bg)`, `var(--accent)`, etc.)

---

## Files to Change

```
frontend/src/app/data-products/page.tsx
frontend/src/app/executive/page.tsx
frontend/src/app/data-browser/page.tsx
frontend/src/app/spot-check/page.tsx
frontend/src/components/reports/ReportsClient.tsx
```

Total: 5 files. No new components needed — popup implemented inline per page using the fixed-panel pattern.
