# Lineage & Impact Analysis — Design Spec

**Date:** 2026-06-19  
**Scope:** Surface blast-radius impact analysis and business consumers in the lineage page.  
**Out of scope:** Cross-connection lineage, dbt model parsing.

---

## Problem

The lineage graph visualises upstream/downstream chains but does not answer the key operational question: *"What breaks downstream if I change this table?"* Specifically:

- No impact severity framing or blast-radius count
- Downstream views (business consumers) are not distinguished from raw tables
- Owner data is missing from node payloads, so affected-owner attribution is impossible

---

## Solution Overview

Two layers of change:

1. **Backend (minor):** Add `ownerName` and `techOwnerName` to each node in `GET /lineage`.
2. **Frontend (main):** Replace the flat detail panel with a 3-tab layout. The new **Impact Analysis** tab surfaces blast radius, severity, business consumers, and a full affected-objects table — all computed from data already loaded in the lineage graph response.

---

## Backend Changes

**File:** `app/api/lineage.py` — `get_lineage_graph`

Add two fields to each node dict:

```python
"ownerName": enr["owner_name"],
"techOwnerName": enr["technical_owner_name"],
```

`_bulk_enrich` already fetches these from the `assets` table; the fix is purely additive (no new queries, no schema change).

---

## Frontend Changes

**File:** `frontend/src/app/lineage/page.tsx`

### TypeScript interface

```typescript
interface LineageNode {
  // ... existing fields ...
  ownerName?: string | null
  techOwnerName?: string | null
}
```

### State additions

```typescript
const [activeTab, setActiveTab] = useState<'chains' | 'impact' | 'columns'>('chains')
```

Reset to `'chains'` when `selected` changes via the existing `useEffect`.

### `impactStats` useMemo

Computed from already-loaded `downstreamChain`, `upstreamChain`, and `rawNodeMap`:

```typescript
const impactStats = useMemo(() => {
  if (!selected || !data) return null
  const allDownstream = downstreamChain.flatMap(h => h.nodes)
  const byType: Record<string, LineageNode[]> = {}
  for (const n of allDownstream) {
    if (!byType[n.type]) byType[n.type] = []
    byType[n.type].push(n)
  }
  const severity =
    allDownstream.length === 0 ? 'none'
    : allDownstream.length <= 3 ? 'low'
    : allDownstream.length <= 10 ? 'medium'
    : allDownstream.length <= 20 ? 'high'
    : 'critical'
  const businessConsumers = allDownstream.filter(n => n.type === 'output')
  return {
    total: allDownstream.length,
    byType,
    severity,
    businessConsumers,
    hopCount: downstreamChain.length,
    allDownstream,
  }
}, [selected, data, downstreamChain, upstreamChain])
```

### Tab Bar (detail panel)

Rendered between the panel header and content:

```
[ Lineage Chain ]  [ Impact Analysis ]  [ Columns (N) ]
```

- Active tab: bold text, bottom border accent, white background
- Inactive: muted text, no border

### Tab Content

#### Lineage Chain tab (existing content, unchanged)
- Upstream/downstream hop chains (2-column grid)
- Column lineage strip (shown when `selectedColumn` is set)

#### Columns tab (existing content, unchanged)
- Column table with search, data types, nullable, lineage badge, path

#### Impact Analysis tab (new)

Three stacked sub-sections:

**1. Blast Radius Summary card**
- Large `total` count (48px, bold)
- Severity badge with colour:
  - `none` → grey / "No Impact"
  - `low` → green / "Low Impact"
  - `medium` → amber / "Medium Impact"
  - `high` → red / "High Impact"
  - `critical` → purple / "Critical Impact"
- Supporting stats: hop depth to leaf · total upstream count
- Prose: *"Changing `{label}` would affect {total} downstream object(s) across {hopCount} hop(s)."*

**2. Type Breakdown row**
- One chip per downstream type that has ≥1 object
- Chip shows: count + type label, coloured by existing `typeConfig` palette
- Types: source, warehouse, transform, output (views), raw

**3. Business Consumers section**
- Heading: "Business Consumers (N views)"
- Lists all downstream `output`-type nodes (views) as cards:
  - Fields: view name, schema, description/comment, hop distance badge, owner (if present)
- Rationale: views are the canonical BI/report read layer; surfacing them answers "which reports break?" without needing a separate reports system
- Empty state: "No business consumers identified downstream"

**4. Affected Objects table**
- Columns: Hop · Name · Type badge · Schema · Owner · Description
- Default sort: hop ASC, name ASC
- All downstream nodes included

---

## Error Handling / Edge Cases

- `impactStats` is `null` when no node is selected — tab is hidden
- Zero downstream nodes: severity = `none`, consumers section shows empty state, table shows "No downstream objects"
- Node with no `ownerName`: owner column shows "—"
- Tab state resets to `'chains'` on node change so the user always lands on context-relevant content first

---

## Files Changed

| File | Change |
|---|---|
| `app/api/lineage.py` | Add `ownerName`, `techOwnerName` to node dict in `get_lineage_graph` |
| `frontend/src/app/lineage/page.tsx` | Add `ownerName`/`techOwnerName` to interface; add `activeTab` state; add `impactStats` memo; add tab bar; add Impact Analysis tab content; wrap existing content in tab conditionals |

No new files, no DB migrations, no new API routes.

---

## Testing Checklist

- [ ] Selecting a node with downstream objects shows correct total/severity in Impact Analysis tab
- [ ] Selecting a root node (no downstream) shows "No Impact" severity and empty table
- [ ] Business Consumers section lists only `output`-type nodes
- [ ] Switching tabs preserves selected node and column selection
- [ ] Tab resets to Lineage Chain when a different node is selected
- [ ] ownerName appears in Affected Objects table when present in backend data
- [ ] Existing Lineage Chain and Columns tabs are functionally identical to pre-change behaviour
