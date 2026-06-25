# Security Review — 2026-06-25

**Branch:** main (7 commits ahead of origin/main)  
**Scope:** Committed PR changes + unstaged modifications in connectors/lineage  
**Reviewer:** Claude Sonnet 4.6 (automated security review)

---

## Vuln 1: Authentication Bypass — `app/core/security.py` (get_current_user)

* **Severity:** High
* **Confidence:** 9/10
* **Category:** auth_bypass

**Description:** When no `Authorization` or `X-API-Key` header is present, `get_current_user()` checks `settings.auth_required`. If `False` (controlled by the `AUTH_REQUIRED` environment variable), it returns a synthetic identity `{"email": "admin@example.com", "role": "admin", "user_id": "system"}` — with no token, no signature, and no verification. Every downstream RBAC guard (`require_admin`, `require_permission`, `check_domain_access`, `has_permission`) sees a full-admin principal. The committed `.env` and `.env.example` both set `AUTH_REQUIRED=false`, making this bypass the live default for anyone cloning the repository.

**Exploit Scenario:** An attacker with network access to the API sends any request to any authenticated endpoint (e.g. `DELETE /connections/{id}`, `POST /users`, `GET /assets`) with no `Authorization` header. The server synthesizes `role=admin` and processes the request with full privileges. No credential brute-forcing, token theft, or social engineering is required.

**Recommendation:**
1. Remove the hardcoded-admin fallback entirely. If unauthenticated local dev access is needed, return a low-privilege `role='viewer'` synthetic user and gate that path on `app_env == 'local'` *in addition to* the flag — never `role='admin'`.
2. Change the default of `AUTH_REQUIRED` to `True` in both `.env.example` and application defaults.
3. Remove `AUTH_REQUIRED=false` from any committed `.env` files; add `.env` to `.gitignore` if not already present.

---

## Vuln 2: SQL Injection — `app/connectors/postgresql_adapter.py` (sample_rows)

* **Severity:** High
* **Confidence:** 9/10
* **Category:** sql_injection

**Description:** `sample_rows()` constructs its query via f-string interpolation of the `schema` and `table` identifier arguments directly into raw SQL:

```python
cur.execute(f"SELECT * FROM {schema}.{table} LIMIT %s", (limit,))
```

Unlike the parameterized queries used everywhere else in the adapter (`list_schemas`, `list_columns`, etc.), the identifiers here are not quoted or escaped. `discovery_service.py` applies `_validate_ident()` (regex `^[A-Za-z0-9_$]+$`) at scan time, but `sample_rows()` is a public method with no such validation colocated at the sink — any caller that bypasses the discovery service path (e.g. a direct API endpoint, a future code path, or a manually inserted `AssetSourceMeta` record) supplies unvalidated identifiers straight into the query.

**Exploit Scenario:** An authenticated user with write access (`data_engineer`, `data_steward`) creates a connection whose schema or table is named `public; DROP TABLE assets;--`. When column profiling or data sampling runs for that asset, `sample_rows()` is called with the crafted value, and the injected SQL executes against the target PostgreSQL database under the service account's privileges.

**Recommendation:**
Use `psycopg2.sql` to compose identifiers safely:

```python
from psycopg2 import sql
cur.execute(
    sql.SQL("SELECT * FROM {}.{} LIMIT %s").format(
        sql.Identifier(schema),
        sql.Identifier(table),
    ),
    (limit,),
)
```

Apply the same fix to any other location in the PostgreSQL adapter that interpolates schema or table names into SQL strings. Additionally, add the `_validate_ident` guard directly inside `sample_rows()` so the validation travels with the method regardless of the call site.

---

## Findings Summary

| ID | File | Severity | Category | Confidence |
|----|------|----------|----------|------------|
| VULN-001 | app/core/security.py | High | auth_bypass | 9/10 |
| VULN-002 | app/connectors/postgresql_adapter.py | High | sql_injection | 9/10 |

*2 findings filtered out (VULN-003: Snowflake injection confidence 7/10; VULN-004: open redirect confidence 4/10 — below reporting threshold of 8/10)*
