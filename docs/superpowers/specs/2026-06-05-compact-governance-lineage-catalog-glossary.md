# Compact Redesign — /governance, /lineage, /catalog, /glossary

**Date:** 2026-06-05  
**Branch:** nilesh_compact_design  
**Reference design:** `/alerts` and `/datasets` pages (already compacted)

---

## Goal

Apply the same compact, dense layout used on `/alerts` and `/datasets` to four remaining pages: `/governance`, `/lineage`, `/catalog`, `/glossary`. No new functionality — purely a layout and style migration.

---

## Compact Design Pattern (from Alerts page)

| Element | Before | After |
|---|---|---|
| Outer padding | `28px 36px` | `10px 16px` |
| Outer height | scroll | `100vh`, `flexDirection: column`, `boxSizing: border-box` |
| Page title | `<h1>` 24px | inline `fontSize: 'var(--text-md)'`, `fontWeight: 600` |
| Stat KPIs | Large cards, `32px` value, hardcoded `#fff` | Inline badge pills or compact 4-col mini-row with `14px` values |
| Tabs | `padding: 8px 20px`, `fontSize: 13px` | `padding: 4px 12px`, `fontSize: 11px` |
| Filter pills | same row as tabs | same row, `fontSize: 10px`, `padding: 3px 8px` |
| Column headers | section titles or none | `9px` uppercase, `color: var(--text-muted)`, `letterSpacing: 0.05em` |
| List rows | Cards `padding: 14px 18px`, border-radius `10px` | Grid rows `padding: 5px 6px`, `borderLeft: 2px solid`, `borderBottom: 1px solid var(--surface-muted)` |
| Colors | Hardcoded `#fff`, `#ebe8df`, `#94a3b8` | CSS variables (`--background`, `--surface`, `--border`, `--text-muted`, etc.) |
| Detail view | Right drawer `width: 560px`, `padding: 20px 24px` | Right slide-in `width: min(480px, 55vw)`, `padding: 12px 14px` |

---

## Per-Page Design

### /governance

**Tabs:** Scorecards | Policies  
**Filters (Scorecards):** All · Healthy · At-Risk  
**Filters (Policies):** All · Active · Draft · Enforced

**Top bar (inline badges):**
- Governance score (badge, red/orange/green by value)
- Active policies count
- Enforced count
- `+ Policy` button (accent)

**Mini KPI row** (4 columns, inline, below top bar — replaces the 4 big cards):
- Governance Score · Policies Active · Assets Classified · Ownership Coverage

**Scorecards tab:**
- Column headers: Domain | Quality | Docs | Classification | Ownership | Cert | SLA | Overall
- Dense rows: `borderLeft` colored by overall score, badge pills for each dimension
- Click row → right slide-in panel (unchanged content, compact padding)

**Policies tab:**
- Column headers: Status | Policy | Domain | Enforcement | Rules | Last Eval
- Dense rows: `borderLeft` colored by status
- Click row → right slide-in panel (unchanged content, compact padding)

**Create Policy modal:** keep as-is (centered modal, already reasonable size)

---

### /catalog

**Tabs:** All · Active · Inactive  
**Top bar (inline badges):** total asset count, `+ Import` button

**Search:** inline in filter bar (not a separate row)

**Column headers:** Asset | Location | Status | Added  
**Row grid:** `1fr 140px 60px 80px`  
**Rows:** `borderLeft: 2px solid` green (active) / muted (inactive)

**Click row → right slide-in panel** showing:
- Asset name, full table path
- Status badge, created date
- Domain (if present)

---

### /glossary

**Top bar (inline badges):** total count, approved count, draft count, `+ Term` button  
**Domain tabs:** All · Finance · Sales · Marketing · Supply Chain · Engineering  
**Status filter pills:** All · Approved · Draft · Deprecated

**Column headers:** Term | Domain | Status | Assets  
**Row grid:** `1fr 80px 70px 50px`  
**Row content:**
- Term name (bold, 11.5px) + truncated definition (10px muted, single line)
- Domain, status badge, linked asset count

**Click row → right slide-in panel** (replaces accordion expand-in-place) showing:
- Term name, full definition
- Synonyms chips, owner, linked assets count

**Add Term modal:** keep as-is

---

### /lineage

**Scope:** compact header/controls only — SVG canvas, column popup, and detail panel are unchanged.

**Top bar (compact, replaces h1 + breadcrumb):**
- "Lineage" title inline
- Live/Demo badge (existing)
- Object/edge count (small text)
- Auto-refresh note
- Refresh button (compact)

**Controls row (replaces large search + separate legend):**
- Search input (flex 1, compact height)
- Type legend pills (Source · Raw · Master · Txn · Views) — same row as search

**Outer wrapper:**
- `padding: '10px 16px'`
- Not full `100vh` (canvas needs to scroll horizontally) — keep `maxWidth: 1500px` and natural height

---

## What Does NOT Change

- API calls and data fetching logic
- All state management
- The SVG canvas and layout engine in `/lineage`
- The column popup and detail panel in `/lineage`
- Modal logic for Create Policy and Add Term
- Popup/drawer content — only padding/sizing is tightened

---

## Implementation Order

1. `/catalog` — simplest, just a list + slide-in panel (currently no detail panel at all)
2. `/glossary` — list + slide-in panel (replaces accordion)
3. `/governance` — most complex (tabs, KPIs, two detail drawers, create modal)
4. `/lineage` — header/controls only, no canvas changes
