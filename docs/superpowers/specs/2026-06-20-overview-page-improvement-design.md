# Overview Page Improvement Design

**Date:** 2026-06-20
**Scope:** `frontend/src/components/dashboard/Dashboard.tsx` + `frontend/src/app/page.tsx`
**Goal:** Polish the existing overview page and surface four recently-built platform modules that are currently invisible from the home screen.

---

## Background

The overview page (`/`) was last substantively updated before several major features shipped: Observability/Monitoring, Stewardship, Compliance, and Privacy. None of these appear on the home screen. Additionally, three known data-quality issues exist in the current layout:

- The "+1.4 vs last week" trend delta is hardcoded.
- The "SLA Adherence" KPI tile always shows "—" because it has no data source.
- The Alert Summary strip sits between Six Dimensions and the Trend chart, breaking visual flow.

---

## Approach

Two-part change: targeted polish fixes to existing content, plus one new "Platform Health" section.

---

## Section 1: Polish Fixes

### 1.1 Trend Delta (currently hardcoded "+1.4")

Compute the delta from the `trend` array already loaded in the component:

- `delta = trend[trend.length - 1].score - trend[0].score`
- Display as `+X.X` (green) or `-X.X` (red), with the appropriate `TrendingUp` / `TrendingDown` icon
- Show "—" when `trend.length < 2`
- Apply to the score section in the hero card

### 1.2 SLA Adherence KPI Tile → SLA Health Tile

The "SLA Adherence" tile is static dead weight (`/api/slas` proxies contracts, not SLA metrics). Replace it with a real **SLA Health** tile sourced from monitoring predictions:

- **API:** `GET /api/monitoring/sla-predictions`
- **Metric displayed:** `X at-risk · Y breached` (count of predictions where `is_at_risk === true` or `breach_day !== null`)
- **Status badge color:**
  - Green if no at-risk or breached predictions
  - Amber if any `is_at_risk === true` but none breached
  - Red if any `breach_day !== null`
- **Links to:** `/observability`
- Loading state: show "—" until data arrives; on error fall back to "—"

Note: The Platform Health row (Section 2) uses `/api/observability/freshness-board` for its Observability tile — a different API showing rule freshness. No duplication between these two tiles.

### 1.3 Alert Summary Strip — Reposition

Currently placed after Six Dimensions, it interrupts the flow from quality metrics into trend analysis. Move it to immediately after the hero card (before Six Dimensions). This keeps severity context adjacent to the KPI numbers where it's most useful.

### 1.4 KPI Grid Min-Width

Remove `minWidth: '460px'` from the KPI tile grid. Let the 3-column grid flex naturally so it doesn't overflow on medium-width viewports.

---

## Section 2: Platform Health Row (new section)

A new `<div>` section inserted **after the Alert Summary strip** and **before the Trend chart**, titled **"Platform Health"**.

### Layout

4-column grid (same card style as rest of page). Each tile is self-contained: fetches its own data on mount, renders independently. A slow or failed endpoint shows a graceful "—" state without blocking other tiles.

### Tile Specs

#### Observability Tile
- **Icon:** `Eye` (lucide)
- **API:** `GET /api/observability/freshness-board`
- **Key metric:** `X on-time · Y at-risk · Z breached`
- **Status pill:** green / amber / red per thresholds above
- **Link:** `/observability`

#### Stewardship Tile
- **Icon:** `Users` (lucide)
- **APIs:**
  - `GET /api/governance/scorecards` → compute average `ownership_score` across domains
  - `GET /api/governance/approvals?status=pending` → count pending items
- **Key metric:** `XX% ownership · N pending approvals`
- **Status pill:**
  - Green if avg score ≥ 90 and pending === 0
  - Amber if avg score 75–89 or pending > 0
  - Red if avg score < 75
- **Link:** `/stewardship`

#### Compliance Tile
- **Icon:** `ShieldCheck` (lucide, already imported)
- **API:** `GET /api/compliance`
- **Key metric:** `X / Y frameworks compliant`
- **Status pill:**
  - Green if all frameworks `status === 'compliant'`
  - Amber if any `status === 'partial'`
  - Red if any `status === 'non-compliant'`
- **Link:** `/compliance`

#### Privacy Tile
- **Icon:** `Lock` (lucide)
- **API:** `GET /api/privacy/pii-exposure`
- **Key metric:** `N unprotected PII tables` (or "All protected" if 0)
- **Status pill:**
  - Green if `unprotected_pii_tables === 0`
  - Red if `unprotected_pii_tables > 0`
- **Link:** `/privacy`

### Tile Structure (each tile)

```
[icon bg]  Title                      [status pill]
           Key metric line
           → View details
```

Consistent with existing `kpiTile` style: `background: var(--surface-muted)`, `borderRadius: 12px`, hover shifts to `var(--accent-bg)` border.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/dashboard/Dashboard.tsx` | All changes — polish fixes + new PlatformHealth section |
| No new files required | Reuses existing API proxy routes |

---

## Out of Scope

- No new backend endpoints needed (all required APIs already exist as proxies)
- No changes to the incident banner in `page.tsx`
- No restructuring of existing sections (trend chart, failing rules, datasets table)
- No mobile/responsive overhaul beyond removing the min-width constraint
