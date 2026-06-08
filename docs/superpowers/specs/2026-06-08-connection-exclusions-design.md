# Connection Exclusions & Simplified Connection Form

**Date:** 2026-06-08  
**Status:** Approved

## Overview

Two related changes to connections and data discovery:

1. Remove `default_database` and `default_schema` from the connection creation/edit form — these fields add friction without value at connection time.
2. Add a persistent exclusion list per connection — a tree-based UI lets users select databases and schemas to always skip during data discovery.

## Data Model

### New columns on `SnowflakeConnection`

```python
excluded_databases: Optional[JSON]  # ["RAW_DATA", "SANDBOX"]
excluded_schemas:   Optional[JSON]  # [{"database": "PROD", "schema": "STAGING"}]
```

- `excluded_databases` — list of database name strings. Excluding a database implicitly skips all its schemas.
- `excluded_schemas` — list of `{database: str, schema: str}` objects for schema-level exclusions within otherwise-included databases.
- Both default to `null` (no exclusions active).
- One Alembic migration adds both columns to the `snowflake_connections` table.

## Backend Changes

### 1. Model (`app/db/models.py`)
Add `excluded_databases` and `excluded_schemas` JSON columns to `SnowflakeConnection`.

### 2. Schema (`app/schemas/connection.py` or equivalent)
Add `excluded_databases: Optional[list[str]]` and `excluded_schemas: Optional[list[dict]]` to `ConnectionUpdate` (and `ConnectionResponse`). Not required on `ConnectionCreate` — defaults to null.

### 3. Discovery Service (`app/services/discovery_service.py`)
At the start of `run_discovery()`, after loading the connection record:

```python
excluded_db_set = set(connection.excluded_databases or [])
excluded_schema_set = {
    (e["database"], e["schema"])
    for e in (connection.excluded_schemas or [])
}
```

Before processing each `(database, schema)` selection, apply the filter:

```python
if selection.database in excluded_db_set:
    # log status: "excluded", reason: "database excluded by connection config"
    continue
if (selection.database, selection.schema) in excluded_schema_set:
    # log status: "excluded", reason: "schema excluded by connection config"
    continue
```

Excluded selections appear in the job result with `status: "excluded"` so the user can see what was skipped.

## Frontend Changes

### 1. Remove fields from connection form (`ConnectionsClient.tsx`)
Remove `default_database` and `default_schema` input fields from the connection creation and edit form. These fields remain in the DB model as optional but are no longer surfaced in the UI.

### 2. Exclusions tree panel
Add an **"Exclusions"** tab or collapsible section inside the connection edit/detail view.

**Behavior:**
- On open: loads databases via `GET /connections/{id}/databases`
- Each database row is expandable: clicking loads schemas via `GET /connections/{id}/schemas?database=X`
- Three-state checkboxes (matching the pattern in `ImportDatasetsModal`):
  - Checking a **database** → excludes the whole database; child schemas shown as fully excluded
  - Checking a **schema** → excludes only that schema within its database
  - A database with some schemas checked shows a partial/indeterminate state
- **Save Exclusions** button persists the selection via `PUT /connections/{id}` with updated `excluded_databases` and `excluded_schemas`
- On re-open: previously saved exclusions are pre-checked in the tree

**Visual indicator:**
- In the connections list, show a small badge (e.g., "3 excluded") next to connections that have active exclusions.

## Data Flow

```
User opens connection edit → selects Exclusions tab
  → GET /connections/{id}/databases       (load tree root)
  → GET /connections/{id}/schemas?database=X  (on expand)
  → User checks items to exclude
  → PUT /connections/{id}  { excluded_databases: [...], excluded_schemas: [...] }

Discovery run:
  POST /asset-registry/discovery  { connection_id, selections: [...] }
  → discovery_service loads connection.excluded_databases + excluded_schemas
  → filters selections before scanning INFORMATION_SCHEMA
  → excluded items logged in job result with status: "excluded"
```

## Out of Scope

- Excluding individual tables (table-level exclusions remain handled by the import selection in `ImportDatasetsModal`)
- Exclusions on connections other than Snowflake in the first pass (model columns added to shared table but UI only shown for Snowflake)
- Bulk exclude via wildcard patterns (e.g., `SANDBOX_*`)

## Files to Change

| File | Change |
|------|--------|
| `app/db/models.py` | Add `excluded_databases`, `excluded_schemas` JSON columns |
| `alembic/versions/` | New migration for the two columns |
| `app/schemas/connection.py` | Add fields to `ConnectionUpdate`, `ConnectionResponse` |
| `app/services/discovery_service.py` | Filter selections using exclusion sets |
| `frontend/src/components/connections/ConnectionsClient.tsx` | Remove `default_database`/`default_schema` fields; add Exclusions tab with tree UI |
