# Asset Registry — Design Spec

**Date:** 2026-06-07  
**Status:** Approved  
**Scope:** Full rename of "Data Asset" → "Asset Registry" + schema completion + frontend hierarchy browser

---

## Background

The platform already has a `DataAsset` model (`data_assets` table) with hierarchy fields added in migration 0006. This spec completes the vision: renaming everything to "Asset Registry", moving Snowflake-specific columns into a side-table, adding a `description` field with AI generation and cascade inheritance, and building a proper tree-browser frontend.

---

## Goals

- Stable IDs across rescans; soft-delete / missing-state tracking
- Full hierarchy: Source → Database → Schema → Table → Column (+ logical dataset placeholder)
- All required fields: `asset_id`, `parent_asset_id`, `source_id` (= `connection_id`), `asset_type`, `physical_name`, `display_name`, `qualified_name`, `path`, `description`, `status`, `criticality`, `sensitivity`, `owner_user_id`, `owner_team_id`, `steward_user_id`, `domain`, `created_at`, `updated_at`, `discovered_at`, `last_seen_at`
- Physical assets and logical datasets kept separate
- Search by name and qualified name
- Business context (description) with AI generation and ancestor inheritance

---

## Database

### Migration 0007 — Additive only (no drops)

**Add to `data_assets`:**
```sql
ALTER TABLE data_assets ADD COLUMN description TEXT;
```

**Create `asset_source_meta`:**
```sql
CREATE TABLE asset_source_meta (
    asset_id         VARCHAR(36) PRIMARY KEY REFERENCES data_assets(asset_id) ON DELETE CASCADE,
    provider         VARCHAR(50) NOT NULL DEFAULT 'snowflake',
    sf_account       VARCHAR(200),
    sf_database_name VARCHAR(200),
    sf_schema_name   VARCHAR(200),
    sf_table_name    VARCHAR(200),
    sf_table_type    VARCHAR(50),
    view_definition  TEXT,
    row_count        BIGINT,
    bytes            BIGINT,
    created_at       DATETIME,
    updated_at       DATETIME
);
```

**Backfill:** Copy existing Snowflake columns from `data_assets` into `asset_source_meta` for all rows where `connection_id IS NOT NULL`.

At this point `data_assets` retains its old Snowflake columns. Code rename happens here (between 0007 and 0008).

### Migration 0008 — Rename + FK churn

1. `ALTER TABLE data_assets RENAME TO assets`
2. Drop columns from `assets`: `snowflake_account`, `sf_database_name`, `sf_schema_name`, `sf_table_name`, `table_type`, `table_description`, `view_definition`, `row_count`, `bytes`
3. Re-create all FK constraints across 15+ dependent tables (`dq_rules`, `dq_rule_runs`, `column_metadata`, `asset_comments`, `asset_usage`, `asset_ratings`, `asset_announcements`, `asset_tags`, `data_classifications`, `glossary_asset_links`, `asset_lineage`, `marketplace_items`, `access_requests`, `cicd_checks`, `compliance_items`) to point at `assets.asset_id`
4. Update `asset_source_meta` FK to reference `assets.asset_id`

---

## Backend

### ORM Models

**`Asset`** (renamed from `DataAsset`, `__tablename__ = "assets"`):

| Field | Type | Notes |
|---|---|---|
| `asset_id` | VARCHAR(36) PK | UUID v5 via `stable_asset_id()` for discovered assets |
| `parent_asset_id` | VARCHAR(36) FK→self | nullable |
| `connection_id` | VARCHAR(36) | serves as `source_id` |
| `asset_type` | VARCHAR(50) | `source\|database\|schema\|table\|column\|file\|dataset\|logical_dataset` |
| `physical_name` | VARCHAR(500) | |
| `display_name` | VARCHAR(500) | |
| `qualified_name` | VARCHAR(2000) | indexed |
| `path` | VARCHAR(2000) | |
| `description` | TEXT | user-set or AI-generated |
| `status` | VARCHAR(50) | `active\|missing\|deprecated\|scan_failed\|disabled` |
| `criticality` | VARCHAR(20) | `critical\|high\|medium\|low` |
| `sensitivity` | VARCHAR(50) | placeholder |
| `owner_user_id` | VARCHAR(36) | |
| `owner_team_id` | VARCHAR(36) | |
| `steward_user_id` | VARCHAR(36) | placeholder |
| `domain` | VARCHAR(500) | placeholder |
| `domain_id` | VARCHAR(36) FK | nullable (legacy) |
| `subdomain_id` | VARCHAR(36) FK | nullable (legacy) |
| `certification_status` | VARCHAR(20) | |
| `certified_by` | VARCHAR(200) | |
| `certified_at` | DATETIME | |
| `is_active` | BOOLEAN | soft-delete flag |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |
| `discovered_at` | DATETIME | |
| `last_seen_at` | DATETIME | |

**`AssetSourceMeta`** (new, `__tablename__ = "asset_source_meta"`):

| Field | Type |
|---|---|
| `asset_id` | VARCHAR(36) PK FK→assets |
| `provider` | VARCHAR(50) |
| `sf_account` | VARCHAR(200) |
| `sf_database_name` | VARCHAR(200) |
| `sf_schema_name` | VARCHAR(200) |
| `sf_table_name` | VARCHAR(200) |
| `sf_table_type` | VARCHAR(50) |
| `view_definition` | TEXT |
| `row_count` | BIGINT |
| `bytes` | BIGINT |
| `created_at` | DATETIME |
| `updated_at` | DATETIME |

### Schemas (renamed)

- `AssetCreate` — all registry fields; no Snowflake fields (discovery provides those)
- `AssetUpdate` — same, all optional
- `AssetResponse` — full registry fields + `source_meta: Optional[AssetSourceMetaResponse]` nested
- `AssetTreeNode` — unchanged
- `AssetStatusUpdate` — unchanged
- `AssetRegistryDiscoveryRequest` — replaces `DiscoveryRequest`

### API Router

**Prefix:** `/asset-registry`  
**Tag:** `"Asset Registry"`  
**Old `/assets` routes:** return HTTP 308 redirects to `/asset-registry/...` for backward compat

**Endpoints (all under `/asset-registry`):**

| Method | Path | Description |
|---|---|---|
| GET | `` | List assets (paginated, filterable) |
| POST | `` | Create asset |
| GET | `/search` | Search by name/qualified_name/description |
| GET | `/tree` | Full tree from roots (by source) |
| GET | `/enriched` | Assets joined with domain/subdomain/connection names |
| GET | `/{id}` | Get single asset |
| PUT | `/{id}` | Update asset |
| DELETE | `/{id}` | Soft-delete (set `is_active=False`, `status=disabled`) |
| PATCH | `/{id}/status` | Update status only |
| GET | `/{id}/children` | Direct children |
| GET | `/{id}/ancestors` | Ancestor chain root→parent |
| GET | `/{id}/columns` | Column metadata (profiled or live) |
| POST | `/{id}/certify` | Set certification status |
| POST | `/{id}/refresh-stats` | Pull row_count/bytes from Snowflake |
| POST | `/{id}/generate-description` | AI-generate description and save |
| GET | `/{id}/effective-description` | Own description or inherited from ancestor |
| POST | `/discovery` | Kick off auto-discovery job |
| GET | `/discovery/jobs/{job_id}` | Poll discovery job |

### `asset_registry.py` Service (expanded)

```python
def stable_asset_id(qualified_path: str) -> str: ...  # existing

async def generate_description(asset_id: str, db: AsyncSession) -> str:
    # Fetch asset + column profiles
    # Build prompt: asset name, type, qualified_name, top column names+types
    # Call existing LLM service (ai_service)
    # Persist to asset.description
    # Return generated text

async def effective_description(asset_id: str, db: AsyncSession) -> str | None:
    # Walk ancestor chain upward until a non-null description is found
    # Return None if no description anywhere in lineage
```

---

## Frontend

### Route & Navigation

- New page: `/asset-registry`
- `/datasets` renders a redirect to `/asset-registry`
- `SectionTabBar`: "Data Assets" → "Asset Registry", `href` → `/asset-registry`
- Sidebar active-path map updated

### Layout

Two-panel layout, full viewport height:

```
┌─────────────────────┬────────────────────────────────────────┐
│  TREE PANEL (300px) │  DETAIL PANEL                          │
│                     │                                        │
│  ▼ my-connection    │  [TABLE]  ORDERS                       │
│    ▼ MY_DB          │  conn/MY_DB/PUBLIC/ORDERS              │
│      ▼ PUBLIC       │                                        │
│        ▶ ORDERS ←   │  Description              [Generate ✨]│
│        ▶ USERS      │  ┌──────────────────────────────────┐  │
│      ▶ STAGING      │  │ (inherited from PUBLIC if empty) │  │
│  ▶ other-conn       │  └──────────────────────────────────┘  │
│                     │                                        │
│  [Search assets...] │  Status    Criticality    Sensitivity  │
│                     │  active    critical        PII         │
│                     │                                        │
│                     │  Owner         Team          Steward   │
│                     │  John Smith    Analytics     —         │
│                     │                                        │
│                     │  Domain        Discovered              │
│                     │  Finance       2026-05-01              │
│                     │                                        │
│                     │  [Edit]  [View Columns]  [Run Rules]   │
└─────────────────────┴────────────────────────────────────────┘
```

### Tree Panel

- Source nodes loaded on page open from `GET /asset-registry/tree`
- Children lazy-loaded on expand via `GET /asset-registry/{id}/children`
- Each node shows: icon by type, `display_name`, status dot (green/amber/red)
- Search box calls `GET /asset-registry/search?q=...` and highlights matching nodes
- Selected node highlighted; clicking sets detail panel content

### Detail Panel

- Header: asset type badge + `display_name` + `qualified_name`
- Description section: textarea (editable inline); "Generate ✨" button calls `POST /asset-registry/{id}/generate-description`; inherited descriptions shown with "(inherited from [parent name])" label in muted text
- Metadata grid: status, criticality, sensitivity, owner, team, steward, domain, discovered_at, last_seen_at
- Action row: Edit (toggles inline form), View Columns (navigates to column detail), Run Rules (navigates to rules filtered by asset)
- Edit form: saves via `PUT /asset-registry/{id}`; no modal — inline replacement of read view

### Components

- `AssetRegistryPage` — top-level page at `/asset-registry/page.tsx`
- `AssetTreePanel` — tree with lazy-load + search
- `AssetTreeNode` — single expandable node (recursive)
- `AssetDetailPanel` — right-side detail + edit
- `AssetDescriptionField` — textarea with generate button and inherited-label logic

---

## Description Inheritance Logic

```
effective_description(asset_id):
  asset = fetch(asset_id)
  if asset.description: return asset.description
  if asset.parent_asset_id: return effective_description(asset.parent_asset_id)
  return None
```

AI generation prompt template:
```
You are a data catalog assistant. Write a concise 1-3 sentence description
for a {asset_type} named "{physical_name}" in the path "{qualified_name}".
Top columns: {col_names_and_types}.
Focus on what data this asset likely contains and its business purpose.
```

---

## What Is Not Changing

- DB table `column_metadata` — unchanged; still keyed by `asset_id`
- Discovery service logic — updated to write `AssetSourceMeta` instead of inline Snowflake fields
- `stable_asset_id()` function and UUID v5 namespace — unchanged
- `/domains`, `/connections`, `/rules` routes — unchanged
- Certification flow — preserved, just rehoused under `/asset-registry`
