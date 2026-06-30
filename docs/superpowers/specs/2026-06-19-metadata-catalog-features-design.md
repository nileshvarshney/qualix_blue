# Metadata & Catalog Feature Set — Design Spec
**Date:** 2026-06-19  
**Scope:** Five areas: catalog list enrichment, column descriptions, glossary linking UI, asset history, bulk editing

---

## 1. Catalog List Enrichment (Quality Scores + Tags)

### Problem
The `/api/catalog` (proxy to `/asset-registry/enriched`) response does not include quality scores or tags. The catalog list rows show only table name, domain, owner, certification, criticality, and status.

### Solution
**Backend:** Extend `GET /asset-registry/enriched` to include two additional fields per asset:
- `quality_score` (Float | null): latest score from `DQQualityScore` table. Fetched via a single bulk `SELECT asset_id, score FROM dq_quality_scores WHERE asset_id IN (...)` grouped to get the latest per asset.
- `tag_names` (string[]): names from `AssetTag JOIN Tag WHERE entity_type = 'asset'`. One bulk query.

Both fetches use `IN (all_asset_ids)` — no N+1.

**Frontend (`frontend/src/app/catalog/page.tsx`):**
- Extend the `Asset` type with `quality_score?: number | null` and `tag_names?: string[]`.
- Add a `Quality` column (7th column) to the grid header and `TableRow`.
  - Renders as a colored pill: ≥80 green, ≥60 amber, <60 red, null → `—`.
- Add tag chips (first 2 tags + overflow count) in a new `Tags` mini-column or inline below the table name.
  - Keep the grid from becoming too wide: collapse tags into a count badge if >2.
- Update `gridTemplateColumns` to accommodate the new columns.

### Data contract additions to enriched response
```json
{
  "asset_id": "...",
  "quality_score": 87.4,
  "tag_names": ["PII", "Finance"]
}
```

---

## 2. Column Descriptions in Asset Detail Drawer

### Problem
`AssetColumnsSection` is not mounted inside `AssetDetailDrawer`, so column information is invisible in the catalog detail view. The `column_metadata.description` field exists in the DB and is returned by the columns API but is never displayed or editable.

### Solution — Part A: Mount AssetColumnsSection in AssetDetailDrawer
Add `<AssetColumnsSection assetId={asset.asset_id} editing={editing} />` inside `AssetDetailDrawer`, positioned after the Description field and before documents.

The `AssetColumnsSection` props already accept `editing`. We pass that through.

### Solution — Part B: Display & Edit Column Descriptions
**`AssetColumnsSection.tsx`:**
- Add `Description` as a new column after `Class` in the columns table.
- In read mode: render the `description` field (grey `—` if empty).
- In edit mode: render an inline `<input>` for each row's description. Changes are tracked in local state `Record<string, string>` (column_name → draft description).
- On save (triggered by the drawer's Save button): for each changed column description, call `PATCH /api/asset-registry/{assetId}/column-meta/{columnName}` with `{ description }`.

**Backend — new endpoint:**
`PATCH /asset-registry/{asset_id}/column-meta/{column_name}` accepts `{ description: string }`, updates `column_metadata.description` for that asset+column, returns the updated row.

**Next.js proxy route:**
`frontend/src/app/api/asset-registry/[...path]/route.ts` already wildcards all sub-paths — the proxy will naturally forward `PATCH /api/asset-registry/{id}/column-meta/{col}` to the backend without a new route file.

### Column table grid columns (updated)
`#` | `Name` | `Type` | `Nullable` | `Class` | `Description`

Description column is wider (`flex: 1`), others stay fixed.

---

## 3. Glossary Term-to-Asset Linking UI

### Problem
- `linkedAssets` count is display-only — clicking it does nothing.
- No UI exists to attach a term to an asset (or to a specific column within an asset).
- No way to navigate from a term to its linked assets.

### Backend (already exists — no new endpoints needed)
- `GET /glossary/terms/{term_id}` → returns `linked_assets: [{link_id, asset_id, column_name, sf_table_name, ...}]`
- `POST /glossary/terms/{term_id}/link-asset` → `{ asset_id, column_name? }` → creates link
- `DELETE /glossary/terms/{term_id}/link-asset/{link_id}` → removes link

**Frontend proxy routes needed:**
- `GET /api/glossary/{termId}` — needs a new Next.js dynamic route: `frontend/src/app/api/glossary/[termId]/route.ts` — proxies to `GET /glossary/terms/{termId}` and `POST /glossary/terms/{termId}/link-asset`.
- The `[termId]` route file already exists (from git status). Extend it to handle `POST` for link-asset and `DELETE` for unlink.

### Frontend (`frontend/src/app/glossary/page.tsx`)
**Term popup enhancement:**
When a term popup opens, fetch `GET /api/glossary/{term.id}` to get full detail with `linked_assets`. Replace the static "Assets: N" count with a live "Linked Assets" section.

**Linked assets section (in popup):**
```
Linked Assets          [+ Link Asset]
─────────────────────────────────────
ORDERS_FACT            orders.order_id    [Unlink]
CUSTOMERS              —                  [Unlink]
```
- Each row: table name + column_name (if set) + Unlink button
- Clicking the table name closes the glossary popup and opens `AssetDetailDrawer` for that asset (reuse existing `popup` pattern from catalog page)
- "Unlink" calls `DELETE /api/glossary/{termId}/link-asset/{linkId}`

**Link Asset modal (triggered by "+ Link Asset"):**
- An inline slide-in or small modal within the popup
- Asset search: `<input>` that filters a list fetched from `/api/catalog` (reuse already-loaded asset data, or fetch separately)
- Optional column input: `<input placeholder="column name (optional)">`
- Submit → `POST /api/glossary/{termId}/link-asset` → `{ asset_id, column_name }`
- On success: refresh the linked_assets list in state

**Navigation:** Opening an asset from the glossary popup uses the same `AssetDetailDrawer` component already used in the catalog page. Pass the asset as a side panel and wire the close button back.

---

## 4. Asset Metadata History

### Problem
`AuditLog` records are written on CREATE and UPDATE but there is no UI to view them. The drawer has no history tab.

### Backend — new endpoint
`GET /asset-registry/{asset_id}/history`
- Queries `audit_logs` WHERE `entity_type = 'asset'` AND `entity_id = asset_id`
- Orders by `created_at DESC`, limit 50
- Returns:
```json
[
  {
    "audit_id": "...",
    "action": "UPDATE",
    "user_email": "alice@example.com",
    "created_at": "2026-06-18T14:22:00",
    "changed_fields": ["criticality", "domain_id"],
    "old_value": { "criticality": "low" },
    "new_value": { "criticality": "high" }
  }
]
```
- Computes `changed_fields` as intersection of keys in `old_value` and `new_value`.

### Frontend — History section in AssetDetailDrawer
Add a collapsible "History" section at the bottom of the drawer (below Documents), lazy-loaded on first expand (same pattern as AssetColumnsSection).

Each entry shows:
- Action badge (`UPDATE` / `CREATE` in colored pill)
- User email + relative time ("2 days ago")
- List of changed field → old → new (only fields that differ)

No tab redesign needed — the drawer is a scrollable panel, so a collapsible section fits naturally.

**Next.js proxy:**  
The existing `frontend/src/app/api/asset-registry/[...path]/route.ts` wildcard will forward this automatically.

---

## 5. Bulk Editing in Catalog

### Problem
No way to update domain/criticality/certification/owner across multiple assets at once.

### Backend — new endpoint
`POST /asset-registry/bulk-update`
```json
{
  "asset_ids": ["id1", "id2"],
  "patch": {
    "criticality": "high",
    "domain_id": "...",
    "certification_status": "certified",
    "owner_name": "Alice"
  }
}
```
- Validates all `asset_ids` exist
- Applies only the fields present in `patch` (partial update)
- Writes a single AuditLog entry per asset with `action = "BULK_UPDATE"`
- Returns `{ updated: N }`

Only allowed fields in `patch`: `criticality`, `certification_status`, `is_active`, `domain_id`, `subdomain_id`, `owner_name`.

### Frontend — Catalog page changes

**Checkbox column:**
- Add a checkbox as the first column of each `TableRow` (and a "select all visible" checkbox in the header)
- `Set<string>` of selected asset IDs in page state
- Clicking a row still opens the drawer; checkbox click is `stopPropagation()`-isolated

**Sticky bulk action bar:**
- Renders at the bottom of the page when `selectedIds.size > 0`
- Shows: `N assets selected` + action dropdowns + Apply + Clear
- Dropdowns: Domain, Criticality, Certification Status, Owner (free-text for owner)
- Apply → `POST /api/asset-registry/bulk-update` → on success, update local `assets` state for all selected IDs + clear selection
- Error shown inline in the bar

**Next.js proxy:**  
Add handler for `POST /api/asset-registry/bulk-update` inside the existing `[...path]/route.ts` wildcard — no new file needed.

---

## Files Changed (summary)

### Backend (`app/`)
| File | Change |
|---|---|
| `app/api/assets.py` | Add `quality_score`, `tag_names` to enriched endpoint; new `PATCH /{id}/column-meta/{col}`; new `GET /{id}/history`; new `POST /bulk-update` |

### Frontend (`frontend/src/`)
| File | Change |
|---|---|
| `app/catalog/page.tsx` | Add quality/tag columns, checkbox select, bulk action bar |
| `app/glossary/page.tsx` | Fetch full term detail on popup open; linked assets list; link-asset modal |
| `app/api/glossary/[termId]/route.ts` | Add POST (link-asset) and DELETE (unlink) handlers |
| `components/asset-registry/AssetDetailDrawer.tsx` | Mount AssetColumnsSection; mount History section |
| `components/asset-registry/AssetColumnsSection.tsx` | Add description column; inline edit; save via PATCH |

---

## What is explicitly out of scope
- Metadata versioning (snapshot diff across time, not just audit log)
- Bulk editing of column-level metadata
- Glossary bulk import/export
- Any schema migration (all models already exist)
