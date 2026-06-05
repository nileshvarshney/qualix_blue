# Compact Redesign — Governance · Alerts · Explore

**Date:** 2026-06-05
**Branch:** nilesh_compact_design
**Sections in scope:** Governance (7 pages), Alerts (3 pages), Explore (4 pages)
**Settings:** excluded from this spec

---

## Goal

Apply the same compact, data-dense layout already present on Data Quality pages (Anomalies, Issues, Schedules, Execution Logs, Rules) to the Governance, Alerts, and Explore sections. Pages must handle 1000+ rows without feeling heavy. Table names and secondary metadata move out of rows and into a click-triggered detail popup.

---

## Shared Compact Spine

Every page (except Lineage, which is chrome-only) gets the same structural treatment:

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
- Left: page title `font-size: var(--text-md), font-weight: 600` + stat badges inline
- Right: action buttons (e.g. `+ Policy`, `+ Rule`)

### Stat badges (inline, not grid cards)
Replace the 4-card KPI grid with compact colored pill badges in the top bar:
```
background: <status-bg>
color: <status-text>
padding: 1px 6px
border-radius: 4px
font-size: 10px
font-weight: 600
```
Each badge shows `{count} {label}` (e.g. `12 unacked`, `3 critical`).

### Tab bar (where applicable)
```
display: flex, gap: 4px, flex-shrink: 0
active tab: background #1a1a1a, color #fff, font-weight 600
inactive: background var(--surface-muted), color var(--text-secondary)
padding: 4px 12px, border-radius: 6px, font-size: 11px
```

### Search / filter bar
```
padding: 5px 8px
border: 1px solid var(--border)
border-radius: 5px
font-size: 11px
flex-shrink: 0
width: 100%, box-sizing: border-box
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

### List rows
```
display: grid  (columns defined per page)
align-items: center
padding: 5px 0
border-bottom: 1px solid var(--surface-muted)  [or var(--border) for severity-left-border rows]
cursor: pointer
font-size: 11px–11.5px
```
Rows show **essential signal only** — no table names, no pipeline names, no secondary metadata. Those go in the popup.

---

## Row Content Per Page

| Page | Row columns |
|------|-------------|
| Alerts – Recent | severity badge · rule name · time · Ack button |
| Alerts – Rules | enabled toggle · severity badge · rule name · triggered count · time |
| Incidents | severity badge · title · status badge · time |
| Audit Logs | actor · action summary · outcome badge · time |
| Governance – Scorecards | domain icon+name · overall score badge |
| Governance – Policies | name · status badge · enforcement badge |
| Glossary | term name · domain badge · status badge |
| Contracts | contract name · status badge · owner |
| SLAs | SLA name · status badge · % met |
| Domains | domain name · owner · asset count |
| Catalog | asset name · type badge · domain |
| Spot Check | check name · pass/fail badge · value |
| Data Products | product name · owner · freshness badge |
| Data Browser | (compact toolbar only — SQL editor fills viewport) |

---

## Detail Popup (shared pattern)

**Trigger:** click anywhere on a row.
**Behaviour:** right-side slide-in panel, backdrop dims the list, close with ✕ or click outside.

**Backdrop** (rendered before the panel):
```
position: fixed, inset: 0
background: rgba(0,0,0,0.18)
z-index: 199
cursor: pointer  ← clicking it closes the popup
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

### Popup header
Severity/status badge + item name + ✕ close button. `padding: 14px 16px, border-bottom: 1px solid var(--border)`.

### Metadata strip
3-column grid of key facts. `border: 1px solid var(--border), border-radius: 6px, overflow: hidden`. Each cell: label (9px uppercase muted) + value (11px semibold).

### Content sections
Coloured section blocks (matching existing root-cause / impact / recommendation style from Alerts). `padding: 12px 16px`.

### Popup fields per section

**Alerts – Recent:** table · pipeline · channel · affected records · root cause · business impact · recommended fix

**Alerts – Rules:** description · when it fires · business context · cooldown · owner · remediation playbook

**Incidents:** affected assets · timeline · root cause · resolution steps

**Audit Logs:** full resource path · IP address · session ID · change diff

**Governance – Scorecards:** all 6 dimension scores (quality · docs · classification · ownership · certification · SLA) · tables list · rules passed/total · last evaluated

**Governance – Policies:** description · domain · rules list with pass/fail · last evaluated

**Glossary:** full definition · owner · steward · related terms · usage examples

**Contracts:** SLA terms · dataset · start/expiry · violations

**SLAs:** dataset · threshold · last breach · recent trend

**Domains:** description · tables · policies · quality score

**Catalog:** schema · row count · column count · owner · last altered · comment

**Spot Check:** table · column · expected vs actual · SQL expression

**Data Products:** full description · datasets · consumers · SLA terms

---

## Lineage Page (chrome-only)

Only the top toolbar gets compact treatment. Canvas keeps `flex: 1` and fills remaining viewport.

**Compact toolbar:** `padding: 8px 12px, border-bottom: 1px solid var(--border), background: var(--surface-muted)`.
Contains: page title · connection badge · table/edge counts · Fit / +Zoom / −Zoom buttons on the right.

No popup pattern on Lineage — node click behaviour is unchanged.

---

## Governance Section — Page-by-Page

### `/governance` (601 lines)
- Top bar with inline badges: `{n} active policies · {n} enforced · {n} domains`
- Tabs: Scorecards | Policies
- Scorecards: compact table grid, domain rows, overall badge right-aligned
- Policies: flat rows `name · status · enforcement`, click → popup

### `/lineage` (1016 lines)
- Compact toolbar only (see above)
- Canvas unchanged

### `/catalog` (107 lines)
- Top bar + asset count badge + search
- Asset rows: `name · type badge · domain`, click → popup

### `/glossary` (214 lines)
- Top bar + count badge + search
- Term rows: `term · domain badge · status`, click → popup

### `/contracts` (408 lines)
- Top bar + count + status badges (active / expiring)
- Contract rows: `name · status · owner`, click → popup

### `/slas` (395 lines)
- Top bar + pass/fail badges + search
- SLA rows: `name · status badge · % met`, click → popup

### `/domains` (271 lines)
- Top bar + domain count badge
- Domain rows: `icon+name · owner · asset count`, click → popup

---

## Alerts Section — Page-by-Page

### `/alerts` (528 lines)
- Top bar with inline badges: `{n} unacked · {n} critical · {n} rules`
- Action buttons: `✓ Ack All` (shown when unacked > 0) · `+ Rule`
- Tabs: Recent ({n}) | Rules ({n})
- Recent tab: severity-left-border rows, click → popup (root cause + impact + recommendation)
- Rules tab: rows with enabled toggle, click → popup (description + business context + remediation)

### `/incidents` (164 lines)
- Top bar + open/resolved badges
- Incident rows: `severity · title · status · time`, click → popup

### `/audit-logs` (282 lines)
- Top bar + event count badge + date range badge
- Search bar
- Log rows: `actor · action summary · outcome badge · time`, click → popup

---

## Explore Section — Page-by-Page

### `/data-browser` (429 lines)
- Compact top bar: title · connection badge · table count · Run / Save buttons
- SQL editor + results table fill remaining viewport (no list/popup pattern here)

### `/spot-check` (471 lines)
- Top bar + pass/fail badges + `▶ Run Check` button
- Check rows: `name · pass/fail badge · value`, click → popup (table · column · expected vs actual · SQL)

### `/data-products` (375 lines)
- Top bar + count + freshness badges
- Product rows: `name · owner · freshness badge`, click → popup

### `/executive` (63 lines)
- Placeholder page — compact header only, no list/popup

---

## What Does NOT Change

- Expandable inline detail rows (used on Alerts currently) are **replaced** by popup — not kept alongside it
- Lineage canvas interaction (node click, pan, zoom) is unchanged
- Data Browser SQL editor and results table are unchanged
- All colour variables (`var(--status-error-bg)`, `var(--accent)`, etc.) remain the same
- Component files for connections, LLM settings (Settings section) are untouched

---

## Files to Change

```
frontend/src/app/governance/page.tsx
frontend/src/app/lineage/page.tsx          (chrome only)
frontend/src/app/catalog/page.tsx
frontend/src/app/glossary/page.tsx
frontend/src/app/contracts/page.tsx
frontend/src/app/slas/page.tsx
frontend/src/app/domains/page.tsx
frontend/src/app/alerts/page.tsx
frontend/src/app/incidents/page.tsx
frontend/src/app/audit-logs/page.tsx
frontend/src/app/data-browser/page.tsx    (chrome only)
frontend/src/app/spot-check/page.tsx
frontend/src/app/data-products/page.tsx
frontend/src/app/executive/page.tsx       (header only)
```

Total: 14 files. No new components needed — popup is implemented inline per page using the same fixed-panel pattern.
