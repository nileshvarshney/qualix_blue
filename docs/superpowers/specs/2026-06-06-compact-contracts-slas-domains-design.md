# Compact Redesign — /contracts, /slas, /domains

**Date:** 2026-06-06  
**Goal:** Apply the same compact, dense layout used on `/governance`, `/catalog`, and `/lineage` to the three remaining data-management pages: `/contracts`, `/slas`, and `/domains`.

---

## Architecture

Pure layout/style migration — no API, state logic, or data-fetching changes. Each page is a full `page.tsx` rewrite. No new files or components.

**Tech Stack:** Next.js App Router, React, inline styles, CSS variables (`--background`, `--foreground`, `--surface`, `--surface-muted`, `--border`, `--accent`, `--accent-bg`, `--text-muted`, `--text-secondary`, `--status-ok-*`, `--status-warn-*`, `--status-error-*`)

---

## Compact Pattern (same as Governance/Catalog)

| Element | Old | New |
|---------|-----|-----|
| Container padding | `28px 36px` | `10px 16px` |
| Height | scrollable | `100vh` flex column |
| Stat cards | 4 large cards, `16px 20px` padding | Mini KPI grid: 4 cells, no gap, `5px 10px` padding |
| Row padding | `18px+` | `5px 6px` |
| Column headers | standard | `9px` uppercase, `var(--text-muted)` |
| Expansion | accordion inline or grid cards | slide-in right panel, `min(480px, 55vw)` |
| Color system | hardcoded hex (`#16a34a`, etc.) | CSS variables (`var(--status-ok-text)`, etc.) |
| Badges | `padding: 2px 9px` | `padding: 1px 4px` to `1px 6px` |

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/app/contracts/page.tsx` | Full rewrite — compact layout, dense rows, slide-in panel |
| `frontend/src/app/slas/page.tsx` | Full rewrite — compact layout, inline MiniTrend, slide-in panel |
| `frontend/src/app/domains/page.tsx` | Full rewrite — compact layout, score badge inline, slide-in panel |

---

## Page Designs

### /contracts

**Top bar (single row):**
- Left: `Data Contracts` (medium font, `var(--foreground)`) + inline badges `[N active]` `[N breached]`
- Right: `+ Contract` button

**KPI row (4 cells, no gap, single border-box):**
- Total Contracts · Active · Breached · Avg Compliance%

**Tabs + search (inline):**
- Filter tabs: `All (N)` · `Active` · `Breached`
- Search input right-aligned or after tabs

**Dense table rows — grid columns:**
`Contract Name | Producer → Consumer | Owner | Compliance% | Checks | Fails | Status | Last Checked`
- `borderLeft: 2px solid` colored by status
- Compliance% as colored badge
- Status as small pill

**Slide-in right panel (on row click):**
- Header: contract name + status badge + ✕
- Terms checklist (pass/fail/warn per term)
- Breach reason, impact, recommendation (only when breached)
- Connection, SLA target, created date

**Modals:** Keep existing `+ New Contract` modal unchanged.

---

### /slas

**Top bar (single row):**
- Left: `SLA Management` + inline badges `[N healthy]` `[N at-risk]` `[N breached]`
- Right: `+ SLA` button

**KPI row (4 cells):**
- Overall Adherence · Healthy · At Risk · Breached

**Tabs + search (inline):**
- Filter tabs: `All (N)` · `Healthy` · `At Risk` · `Breached`
- Search input

**Dense table rows — grid columns:**
`SLA Name | Dataset | Type | Target | Adherence% | Trend | Breaches | Status | Owner`
- `MiniTrend` component (80×22px) kept inline — already small enough
- Adherence% as colored badge (green/orange/red)
- Status pill

**Slide-in right panel (on row click):**
- Header: SLA name + status badge + ✕
- Root cause, impact, recommendation
- Affected pipelines list
- Last breach date, next review

**Modals:** Keep existing `+ New SLA` modal unchanged.

---

### /domains

**Top bar (single row):**
- Left: `Domain Management` + `[N domains]` badge
- Right: `+ Domain` button

**KPI row (4 cells):**
- Total Domains · Total Datasets · Total Rules · Avg Quality Score

**Search + filter (inline):**
- Text search input
- Optional filter by score range

**Dense table rows — grid columns:**
`[Icon] Domain Name | Owner | Datasets | Rules | Score | Issues | [edit/delete on hover]`
- Score: small colored badge chip (`87`) colored by range — `var(--status-ok-*)`, `var(--status-warn-*)`, `var(--status-error-*)`
- Edit (✏️) and Delete (🗑️) icon buttons appear on row hover
- `ScoreRing` SVG removed from inline row; shown only in slide-in panel

**Slide-in right panel (on row click):**
- Header: `[icon] Domain Name` + score badge + ✕
- `ScoreRing` SVG (kept here)
- Description, connection, tables list

**Modals:** Keep existing Add/Edit domain modal unchanged.

---

## Color & Helper Functions

All pages switch from hardcoded hex to CSS variables:

```ts
const scoreColor = (n: number) =>
  n >= 90 ? 'var(--status-ok-text)' : n >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const scoreBg = (n: number) =>
  n >= 90 ? 'var(--status-ok-bg)' : n >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'
```

Status maps follow same pattern for contract status, SLA status, and domain score range.

---

## Constraints

- Do NOT change any API endpoints, data-fetching logic, or state management
- Do NOT add new components or files
- MiniTrend SVG component in `/slas/page.tsx` is kept as-is (already compact)
- ScoreRing SVG in `/domains/page.tsx` is kept but moved to slide-in panel only
- Add/Edit modals are preserved unchanged in all three pages
