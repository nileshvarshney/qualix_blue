# Catalog Page Edit Facility — Design Spec

Date: 2026-06-16

## Overview

Add an edit mode to the existing catalog page right drawer so users can update governance metadata for a table asset without leaving the catalog view.

## Scope

**Editable fields:** status (is_active), criticality, certification, domain, subdomain, owner, technical owner, table description.

**Read-only always:** connection, database, schema — these are structural identifiers, not governance metadata.

## Component Structure

A new `AssetDetailDrawer` component is extracted from the inline drawer JSX in `catalog/page.tsx` and placed at:

```
frontend/src/components/asset-registry/AssetDetailDrawer.tsx
```

**Props:**
```typescript
interface Props {
  asset: Asset
  onClose: () => void
  onUpdated: (updated: Asset) => void
}
```

`catalog/page.tsx` removes the inline drawer JSX and renders `<AssetDetailDrawer asset={popup} onClose={() => setPopup(null)} onUpdated={handleUpdated} />` instead. `handleUpdated` merges the returned asset back into the `assets` array in page state so the table row reflects changes without a full reload.

The `Asset` type in `page.tsx` gains two fields: `domain_id?: string` and `subdomain_id?: string` — already returned by `/api/catalog` (the enriched endpoint), just not previously declared.

## Edit Mode UX

The drawer header contains an **Edit** button on the right (next to ✕). Clicking it:
- Switches to edit mode: all governance fields become inputs
- Edit button is replaced by **Save** (accent/primary) and **Cancel** buttons

Clicking **Cancel** discards all changes and returns to view mode.

Clicking **Save**:
1. Calls `PUT /api/asset-registry/{asset_id}` with only the changed fields
2. On success: merges response into local state, exits edit mode, calls `onUpdated`
3. On error: shows an inline error message below the Save button; stays in edit mode

A `saving` boolean disables both Save and Cancel while the request is in flight.

## Edit Form Fields

| Field | Input | Values / Source |
|---|---|---|
| Status | `<select>` | Active, Inactive |
| Criticality | `<select>` | critical, high, medium, low |
| Certification | `<select>` | certified, warning, failed, uncertified |
| Domain | `<select>` | fetched from `/api/domains-list` on first edit open |
| Subdomain | `<select>` | fetched from `/api/subdomains?domain_id={id}` when domain changes; resets to blank when domain changes |
| Owner | `<input type="text">` | free text |
| Technical Owner | `<input type="text">` | free text |
| Description | `<textarea>` | free text |

Domain list is fetched once and cached in component state. Subdomain list is re-fetched whenever the selected domain changes.

## API Changes

### Backend — `app/schemas/asset.py`

Add to `AssetUpdate`:
```python
domain_id: Optional[str] = None
subdomain_id: Optional[str] = None
```

The existing `PUT /{asset_id}` handler iterates non-None fields with `setattr(asset, field, value)` — no handler change needed.

### Frontend — new proxy route

Create `frontend/src/app/api/subdomains/route.ts`:
- `GET /api/subdomains?domain_id={id}` → proxies to `GET {BACKEND}/subdomains?domain_id={id}`
- Returns `[{subdomain_id, subdomain_name}]`

### Existing routes used (no changes needed)

- `GET /api/domains-list` — domain dropdown source
- `PUT /api/asset-registry/{asset_id}` — save changes (proxy already exists via `[...path]` catch-all)

## Data Flow

```
User clicks Edit
  → editForm initialised from current asset values
  → domains fetched (if not already cached)

User changes Domain
  → subdomain list re-fetched for new domain_id
  → subdomain field reset to ''

User clicks Save
  → diff editForm against original asset
  → PUT /api/asset-registry/{asset_id} with changed fields only
  → on 200: merge response into assets[], exit edit mode, call onUpdated
  → on error: show inline error, stay in edit mode

User clicks Cancel
  → discard editForm, exit edit mode
```

## Response Mapping Note

The `PUT /asset-registry/{asset_id}` response is an `AssetResponse` which uses `description` (not `table_description`) and `is_active` as a boolean. After save, the drawer maps the response back to the `Asset` shape used by the catalog page:
- `response.description` → `asset.table_description`
- `response.is_active` → `asset.is_active`
- `response.domain_id` / `response.subdomain_id` are present but `domain_name` / `subdomain_name` are not in the PUT response — so the drawer constructs those from the selected dropdown labels held in edit form state.

## Files Changed

| File | Change |
|---|---|
| `app/schemas/asset.py` | Add `domain_id`, `subdomain_id` to `AssetUpdate` |
| `frontend/src/app/api/subdomains/route.ts` | New — subdomains proxy |
| `frontend/src/components/asset-registry/AssetDetailDrawer.tsx` | New — drawer with view + edit modes |
| `frontend/src/app/catalog/page.tsx` | Add `domain_id`/`subdomain_id` to `Asset` type; replace inline drawer with `<AssetDetailDrawer>`; add `handleUpdated` to merge updated asset into state |
