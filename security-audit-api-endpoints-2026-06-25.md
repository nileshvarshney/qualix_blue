# Security Audit: API Endpoint Authentication — 2026-06-25

**Scope:** All FastAPI + Next.js API endpoints — focused on missing authentication and unauthenticated write/data-access paths  
**Trigger:** `POST /api/connections` confirmed to return HTTP 201 without any auth token  
**Reviewer:** Claude Sonnet 4.6 (automated security audit)

---

## Vuln 1: Auth Bypass — `app/api/connections.py:608`

* **Severity:** High
* **Confidence:** 9/10
* **Category:** `auth_bypass` / `credential_exposure`

**Description:** `POST /{connection_id}/test` has no `get_current_user` dependency — its signature is `async def test_connection(connection_id: str, db: AsyncSession = Depends(get_db))`. Every adjacent endpoint on the same router (lines 450, 474, 506, 521, 537, 565, 582) declares `user=Depends(get_current_user)` explicitly; this one was intentionally or accidentally omitted. The endpoint retrieves the stored (encrypted) credential from the DB, decrypts the password, and opens a live outbound socket to the target database, returning a detailed multi-step diagnostic in the response.

**Exploit Scenario:** An unauthenticated attacker sends `POST /connections/<uuid>/test` with no Authorization header. The server decrypts the stored Snowflake or PostgreSQL password and attempts a live connection, returning detailed step-by-step diagnostics including whether the host is reachable, whether the username exists, and whether the password is valid — all without any authentication.

**Recommendation:** Add `user=Depends(get_current_user)` to the function signature, matching every other endpoint in this router:
```python
async def test_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),   # ← add this
):
```

---

## Vuln 2: Auth Bypass — `app/api/connections.py:874,915,963,1020,1095`

* **Severity:** High
* **Confidence:** 9/10
* **Category:** `auth_bypass` / `data_exposure`

**Description:** Five browse/preview endpoints — `GET /{connection_id}/databases`, `/schemas`, `/columns`, `/tables`, and `/preview` — all have only `db: AsyncSession = Depends(get_db)` and no `get_current_user`. The `/preview` endpoint is the most severe: it executes `SELECT * FROM <table> LIMIT N` against the connected warehouse using stored decrypted credentials and returns all rows to the caller. The `limit` parameter accepts up to 1,000 rows per request.

**Exploit Scenario:** An unauthenticated attacker sends:
```
GET /connections/<id>/preview?database=prod&schema=public&table=users&limit=1000
```
The server decrypts the stored database password, connects to the production warehouse, and returns up to 1,000 rows of arbitrary table data — including PII, financial records, and any other sensitive columns — with no auth challenge.

**Recommendation:** Add `user=Depends(get_current_user)` to all five endpoints. For `/preview` specifically, also consider a separate `require_permission("view_results")` check since it returns raw production data:
```python
async def preview_data(
    connection_id: str,
    ...,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),   # ← add this
):
```

---

## Vuln 3: SQL Injection — `app/api/connections.py:1122`

* **Severity:** High
* **Confidence:** 9/10
* **Category:** `sql_injection`

**Description:** The PostgreSQL branch of `preview_data()` builds its query as:
```python
cur.execute(f'SELECT * FROM "{schema}"."{table}" LIMIT {limit}')
```
The `schema` and `table` values come directly from URL query parameters with no validation. The Snowflake branch (lines 1136–1138) correctly calls `_safe_ident()` on all three identifiers before interpolation — the PostgreSQL branch was missed. A double-quote in either parameter terminates the quoted identifier and allows arbitrary SQL to be injected.

**Exploit Scenario:**
```
GET /connections/<pg-id>/preview?database=mydb&schema=public%22%3B+DROP+TABLE+users%3B+--&table=x&limit=1
```
Produces: `SELECT * FROM "public"; DROP TABLE users; --"."x" LIMIT 1` — executing the injected statement under the service account's privileges.

**Recommendation:** Apply `_safe_ident()` to `schema` and `table` in the PostgreSQL branch, matching the Snowflake branch:
```python
schema_safe = _safe_ident(schema, "schema")
table_safe  = _safe_ident(table, "table")
# Then in _run_pg():
cur.execute(f'SELECT * FROM "{schema_safe}"."{table_safe}" LIMIT {limit}')
```
Or switch to `psycopg2.sql.Identifier` for defense-in-depth (consistent with the `sample_rows` fix already on this branch).

---

## Vuln 4: Auth Bypass + SSRF — `app/api/connections.py:399`

* **Severity:** Medium
* **Confidence:** 9/10
* **Category:** `auth_bypass` / `ssrf`

**Description:** `POST /test-credentials` accepts a `ConnectionTestCredentials` payload containing attacker-controlled `host`, `port`, `username`, and `password` fields with no `get_current_user` dependency. The endpoint opens a live outbound TCP connection to the caller-specified host and returns a detailed diagnostic. The attacker controls the host (not just the path), enabling probing of internal network hosts unreachable from the public internet.

**Exploit Scenario:** An unauthenticated attacker sends:
```json
POST /connections/test-credentials
{"database_type":"postgresql","host":"10.0.0.5","port":5432,"sf_user":"admin","password":"guess"}
```
DataGuard makes an outbound TCP connection to the internal `10.0.0.5:5432`, returning whether the port is open, whether the username exists, and whether the password is correct — using DataGuard as a pivot into the internal network.

**Recommendation:**
1. Add `user=Depends(get_current_user)` to the function signature.
2. Validate that `payload.host` is not an RFC-1918 private address before opening a connection.

---

## Vuln 5: Token-Stripping Proxy — `frontend/src/app/api/connections/route.ts:46–104`

* **Severity:** High
* **Confidence:** 8/10
* **Category:** `auth_bypass`

**Description:** Every handler in the Next.js `/api/connections` proxy (GET, POST, PUT, DELETE) calls the FastAPI backend via `fetch(BACKEND_URL, { headers: { 'Content-Type': 'application/json' } })` — the incoming `Authorization` header from the browser is never read and never forwarded. The same pattern is present in every other Next.js proxy route (`/api/dashboard`, `/api/scan-jobs`, `/api/alerts`, `/api/dashboard/trend`, etc.). An attacker who contacts the FastAPI backend directly (port 8000) bypasses the proxy entirely. Legitimate authenticated users' requests through the Next.js layer also fail with 401 unless a separate session mechanism is in place.

**Exploit Scenario:** A user's JWT is never forwarded to the backend by any Next.js proxy route. In any deployment where the FastAPI port is reachable directly, the proxy provides no authentication gate whatsoever.

**Recommendation:** Create a shared utility in the Next.js app and apply it to every proxy route:
```ts
// lib/backendFetch.ts
export function backendFetch(req: NextRequest, url: string, init: RequestInit = {}) {
  const auth = req.headers.get('authorization')
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      ...(init.headers ?? {}),
    },
  })
}
```
Replace all bare `fetch(BACKEND_URL, ...)` calls in `frontend/src/app/api/**/*.ts` with `backendFetch(req, BACKEND_URL, ...)`.

---

## Summary

| # | File | Severity | Category | Confidence |
|---|------|----------|----------|------------|
| 1 | `app/api/connections.py:608` | High | auth_bypass + credential_exposure | 9/10 |
| 2 | `app/api/connections.py:874–1095` | High | auth_bypass + data_exposure | 9/10 |
| 3 | `app/api/connections.py:1122` | High | sql_injection | 9/10 |
| 4 | `app/api/connections.py:399` | Medium | auth_bypass + ssrf | 9/10 |
| 5 | `frontend/src/app/api/connections/route.ts:46–104` | High | auth_bypass (token-stripping proxy) | 8/10 |
