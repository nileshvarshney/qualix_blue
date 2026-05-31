# Architecture

## System Overview

The Data Quality Platform is a three-tier web application. The frontend calls a FastAPI REST backend, which reads/writes PostgreSQL for all platform metadata and optionally connects to Snowflake to execute rule SQL against source data.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser  (Next.js 15, TypeScript, Tailwind CSS, Sonner toasts)     │
│  /login  /dashboard  /rules  /assets  /alerts  /help  /admin  …     │
│  Command Palette (⌘K)  ·  AI Assistant  ·  Skeleton loading states  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  HTTP REST / JSON  (JWT bearer  OR  X-API-Key)
┌─────────────────────────▼───────────────────────────────────────────┐
│  FastAPI  (Python 3.12, async SQLAlchemy, APScheduler)              │
│  120+ routes across 16 API modules                                  │
│  Secrets bootstrap (Vault KV v2 / AWS Secrets Manager at startup)   │
└──────┬────────────────────────────────────────────┬─────────────────┘
       │  asyncpg                                   │  HTTP
┌──────▼──────────────┐                ┌────────────▼──────────────┐
│  PostgreSQL 16      │                │  LLM Provider              │
│  Metadata store     │                │  Ollama / OpenAI /         │
│  (all platform data)│                │  Claude / Gemini Flash     │
└─────────────────────┘                └───────────────────────────┘
       │
       │  Snowflake Connection Pool  (pooled per credential set)
┌──────▼──────────────┐
│  Snowflake          │
│  Source data tables │
│  (read-only)        │
└─────────────────────┘
```

---

## Directory Structure

```
data-quality-app/
├── app/
│   ├── main.py                  FastAPI app factory, lifespan, middleware
│   ├── api/                     Route handlers (one file per resource)
│   │   ├── users.py             Auth endpoints + user CRUD
│   │   ├── oauth.py             OAuth2/Google SSO callback flow
│   │   ├── service_accounts.py  API key management for CI/CD
│   │   ├── domains.py           Domain CRUD
│   │   ├── subdomains.py        Subdomain CRUD
│   │   ├── assets.py            Data asset CRUD + certify
│   │   ├── rules.py             Rule CRUD, approve/reject, versions, rollback, tags, bulk ops
│   │   ├── schedules.py         Schedule CRUD, pause/resume/run-now
│   │   ├── executions.py        Rule/table/domain execution (sync + async)
│   │   ├── dashboard.py         Dashboard aggregation + CSV export
│   │   ├── ai.py                AI/LLM features
│   │   ├── alerts.py            Alert management
│   │   ├── audit.py             Audit log viewer + CSV export
│   │   ├── config.py            Runtime key-value config
│   │   └── connections.py       Snowflake connection management
│   ├── core/
│   │   ├── config.py            Pydantic Settings (env vars + pool/SSO/Vault settings)
│   │   ├── security.py          JWT, bcrypt, API key, RBAC, domain isolation
│   │   ├── encryption.py        Fernet symmetric encryption for credentials at rest
│   │   ├── secrets_loader.py    Bootstrap secrets from Vault / AWS SM at startup
│   │   ├── logging_config.py    Structured logging (structlog + rich)
│   │   ├── limiter.py           SlowAPI rate limiter
│   │   └── middleware.py        Request ID injection, security headers (incl. CSP)
│   ├── db/
│   │   ├── database.py          SQLAlchemy async engine + inline safe migrations
│   │   ├── models.py            All ORM models (incl. ServiceAccount, oauth fields)
│   │   ├── snowflake_client.py  Legacy global Snowflake client (pool-backed)
│   │   ├── snowflake_pool.py    Thread-safe connection pool per credential set
│   │   └── seed.py              Initial data seeder
│   ├── services/
│   │   ├── execution_service.py Rule execution — pooled, concurrent, async
│   │   ├── sql_generator.py     SQL generation for each rule type
│   │   ├── scoring_service.py   Quality score calculation + nightly aggregation
│   │   ├── scheduler_service.py APScheduler job management
│   │   ├── alert_service.py     Alert creation with 4-hour dedup
│   │   ├── notification_service.py  Slack + SMTP email dispatch
│   │   ├── ai_service.py        LLM prompt orchestration
│   │   ├── llm_providers.py     Provider abstraction (Ollama/OpenAI/Claude/Gemini)
│   │   ├── job_tracker.py       In-memory background job status registry
│   │   └── config_service.py    Runtime config seeder
│   └── schemas/                 Pydantic request/response models
├── frontend/
│   └── src/
│       ├── app/                 Next.js App Router pages
│       │   ├── auth/callback/   OAuth2 token landing page
│       │   ├── help/            In-app user help + metrics glossary
│       │   └── …                dashboard, rules, assets, alerts, audit, ai-assistant
│       ├── components/
│       │   ├── layout/          Sidebar (Tailwind hover), ClientLayout, ThemeProvider
│       │   │                    CommandPalette (⌘K), CommandPalette.tsx
│       │   ├── charts/          QualityTrendChart, DomainsBarChart
│       │   └── common/          StatCard, ScoreBadge, SeverityBadge,
│       │                        CertificationBadge, Breadcrumbs, Tooltip
│       ├── hooks/               useCurrentUser, useIsAdmin, useCanWrite
│       ├── services/            apiClient.ts (axios wrappers for all APIs)
│       └── types/               TypeScript interfaces
├── migrations/
│   └── versions/
│       ├── 0001_initial_schema.py
│       └── 0002_enterprise_upgrades.py
├── tests/
│   ├── test_sql_generator.py
│   ├── test_rule_engine.py
│   ├── test_scoring_service.py
│   ├── test_approval_workflow.py
│   └── test_domain_logic.py
├── docs/
│   ├── architecture.md          (this file)
│   ├── admin-guide.md
│   └── user-guide.md
├── config/sample_rules.yaml
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Backend Components

### Application Startup (`app/main.py`)

The lifespan hook runs in order:

1. `secrets_loader.bootstrap()` — pull secrets from Vault/AWS SM into settings
2. `_validate_security_config()` — abort on weak `SECRET_KEY` or bad auth config in production
3. `create_tables()` — `CREATE TABLE IF NOT EXISTS` + safe `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations
4. `seed_config()` — seed runtime defaults into `app_config`
5. `start_scheduler()` + `load_all_schedules()` — register APScheduler jobs
6. On shutdown: `stop_scheduler()` + `close_all_pools()` (drain Snowflake pools)

### Security (`app/core/security.py`)

**Authentication — two paths:**

1. `X-API-Key: sa_<prefix>_<secret>` header → service account lookup by prefix + bcrypt verify
2. `Authorization: Bearer <jwt>` → HS256 JWT decode + expiry check

**RBAC dependencies:**

| Dependency | Allowed roles |
|---|---|
| `get_current_user` | Any authenticated caller |
| `require_read` | admin, domain_owner, data_owner, viewer, auditor |
| `require_write` | admin, domain_owner, data_owner |
| `require_admin` | admin only |

**Row-level domain isolation:**

`get_domain_filter(user)` returns the user's `domain_id` if their role is `domain_owner`, otherwise `None`. Applied on `GET /rules/enriched` and `GET /assets/enriched` — a domain_owner cannot see another domain's data regardless of query parameters.

**Dev mode:** `AUTH_REQUIRED=false` → unauthenticated requests treated as admin.

### Snowflake Connection Pool (`app/db/snowflake_pool.py`)

A `SnowflakeConnectionPool` instance is created per unique credential set (hashed from account + user + warehouse + role + database + schema). Key properties:

- Connections validated with `SELECT 1` before reuse; stale ones discarded
- `acquire()` context manager — returns to pool on success, discards on error
- `aexecute_query()` wraps blocking Snowflake calls in `asyncio.to_thread()`
- Configurable `min_size` / `max_size` / `acquire_timeout`
- Registry (`_POOLS`) shared across all requests; closed on app shutdown

### Rule Execution (`app/services/execution_service.py`)

**Single rule flow:**

```
1. Load rule + asset from DB
2. sql_generator.generate() → SQL string
3. _resolve_executor() → _DynamicExecutor (pooled) or global SnowflakeClient
4. executor.aexecute_query(sql)  ← non-blocking; runs in thread pool
5. Parse failed_count + total_rows
6. volume_check: compare against 7-run historical average if no min/max set
7. Write DQRuleRun to DB
8. alert_service.create_alert_if_needed()
```

**Batch execution (`execute_asset_rules`):**

All rules for a table run concurrently via `asyncio.gather()`, bounded by `asyncio.Semaphore(SNOWFLAKE_POOL_MAX_SIZE)`. Sequential for-loop eliminated.

### Background Job Tracking (`app/services/job_tracker.py`)

In-memory registry of job status for `POST /rules/bulk/execute`. Jobs transition through `queued → running → completed / failed`. Completed/failed jobs are pruned after 1 hour. `GET /rules/bulk/jobs/{job_id}` polls status without a DB query.

### LLM Providers (`app/services/llm_providers.py`)

Four concrete providers under `LLMProvider` ABC. `GeminiProvider.complete()` uses `asyncio.to_thread()` because `google-genai`'s `generate_content` is synchronous — this prevents blocking the event loop during Gemini inference.

### Secrets Loader (`app/core/secrets_loader.py`)

Called once at startup. Reads from:

- **HashiCorp Vault KV v2** via `httpx` — requires `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_SECRET_PATH`
- **AWS Secrets Manager** via `boto3` — requires `AWS_SECRETS_NAME`, uses default credential chain

Merges sensitive keys (`secret_key`, `encryption_key`, `snowflake_password`, API keys) into the `settings` object. No-op when not configured.

### OAuth2 (`app/api/oauth.py`)

Google authorization-code flow:

```
Browser → GET /auth/oauth/google
  → redirects to Google consent page with HMAC-signed state parameter
Google → GET /auth/oauth/google/callback?code=…&state=…
  → verify state HMAC
  → exchange code for Google access token via httpx
  → fetch user info from Google
  → upsert User (link oauth_id to existing account by email if present)
  → issue DQ Platform JWT pair
  → redirect to {FRONTEND_URL}/auth/callback?token=…&refresh=…
```

### Service Accounts (`app/api/service_accounts.py`)

Key format: `sa_<8-char-prefix>_<32-char-secret>`. Only prefix + bcrypt hash stored. The full key is shown once at creation. `PATCH /{id}/rotate` issues a new key (old one immediately invalid). `last_used_at` updated on every authenticated request.

---

## Database Schema

### Migration history

| Revision | Description |
|---|---|
| `0001` | Initial schema — all core tables |
| `0002` | Enterprise upgrades — `rule_versions`, certification, ownership fields |
| *(inline)* | `users.oauth_provider`, `users.oauth_id`; `service_accounts` table; performance indexes |

### Key tables

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, domain scoping, OAuth identity |
| `service_accounts` | API-key machine-to-machine auth |
| `domains` / `subdomains` | Business hierarchy |
| `data_assets` | Registered Snowflake tables with certification status |
| `dq_rules` | Rule definitions with lifecycle state and governance fields |
| `rule_versions` | Immutable snapshots before every rule mutation |
| `rule_tags` | Many-to-one tags per rule |
| `dq_schedules` | Schedule configs at any hierarchy level |
| `dq_rule_runs` | One row per execution (counts, score, SQL, AI explanation) |
| `dq_rule_run_samples` | Up to 10 sample failed rows per run |
| `dq_quality_scores` | Pre-aggregated daily scores at table/subdomain/domain/global level |
| `dq_alerts` | Alert lifecycle — open → acknowledged → resolved/ignored |
| `sla_configs` | Per-entity quality thresholds + alert routing overrides |
| `audit_logs` | Append-only action trail with before/after JSON |
| `snowflake_connections` | Stored connection configs (password Fernet-encrypted) |
| `app_config` | Runtime key-value config (LLM keys, Slack URL, etc.) |

---

## Rule Lifecycle

```
               ┌─────────┐
               │  draft  │◄──────────────────────┐
               └────┬────┘                       │
                    │ submit for review           │ reject
                    ▼                             │
          ┌──────────────────┐                   │
          │  pending_review  │───────────────────►┘
          └────────┬─────────┘
                   │ approve
                   ▼
              ┌─────────┐      disable     ┌──────────┐
              │  active │─────────────────►│ disabled │
              └────┬────┘                  └──────┬───┘
                   │ archive                     │ archive
                   └────────────────────►┌───────▼──┐
                                         │ archived │
                                         └──────────┘
```

Every transition writes a snapshot to `rule_versions`. `POST /rules/{id}/rollback/{version}` restores any snapshot and moves status back to `pending_review`.

---

## Quality Score Design

**Per-rule** (row-level, stored in `dq_rule_runs.quality_score`):
```
score = max(0, 100 − (failed_rows / total_rows × 100))
```

**Aggregate** (stored in `dq_quality_scores.quality_score`):
```
score = max(0, 100 − Σ severity_penalty for each failed rule)
penalties: critical=25, high=15, medium=7, low=3
```

`aggregate_quality_scores()` recomputes and upserts daily scores at table, subdomain, domain, and global levels after every execution batch. A nightly APScheduler job also runs it at 00:05 to keep scores populated on days with no executions.

---

## Frontend Architecture

### Auth flow

1. `ClientLayout.tsx` guards all non-public pages — checks `localStorage.access_token`
2. On 401 from API, `apiClient.ts` auto-refreshes once then clears tokens and redirects to `/login`
3. OAuth callback: `/auth/callback` reads `?token=&refresh=` from URL and stores tokens

### Command Palette

`CommandPalette.tsx` registers a global `keydown` listener for ⌘K/Ctrl+K. No state management beyond the component — purely client-side navigation. All nav items defined as a static list with group, label, icon, and route.

### Toast notifications

`sonner` `<Toaster>` placed in root `layout.tsx`. Any component can call `toast.success()` / `toast.error()` without providers or context.

### Skeleton loading

Rules page and Alerts page render animated placeholder rows matching the actual table/card layout while data loads, rather than a bare spinner.

### Sidebar hover styles

All hover effects use Tailwind CSS arbitrary-property classes (`hover:[background-color:var(--sidebar-hover)]`) — no inline JavaScript event handlers.

---

## Security Model

| Layer | Mechanism |
|---|---|
| Transport | HTTPS in production (terminate at load balancer / ingress) |
| Authentication | JWT HS256 (30min) + refresh (7d) **or** `X-API-Key` for service accounts |
| Password hashing | bcrypt via passlib |
| Credential encryption | Fernet symmetric encryption (`ENCRYPTION_KEY`) for Snowflake passwords + LLM keys |
| Authorization | FastAPI `Depends` RBAC wrappers + row-level domain filter for domain_owner |
| CSRF protection | HMAC-signed state parameter for OAuth2 flow |
| SQL injection | `business_rule_check` condition validated; INFORMATION_SCHEMA queries use `_safe_ident()` |
| Rate limiting | SlowAPI on auth endpoints (10/min login) |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy` |
| API docs | `/docs` and `/redoc` disabled in production (`APP_ENV=production`) |
| Secret management | Vault KV v2 / AWS SM bootstrap at startup; never hardcoded |
| Audit | `audit_logs` — append-only, every mutation logged with before/after JSON |
| CORS | `ALLOWED_ORIGINS` env var (comma-separated); defaults to localhost:3000 |
| Request tracing | `X-Request-ID` header injected by middleware; propagated to all logs |
