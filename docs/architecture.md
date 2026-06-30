# Architecture

## System Overview

DataGuard is a full-stack data governance platform. The frontend calls a FastAPI REST backend, which reads/writes PostgreSQL for all platform metadata and optionally connects to Snowflake to execute rule SQL against source data.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser  (Next.js 15, TypeScript, Tailwind CSS, Sonner toasts)     │
│  50+ pages across: catalog, rules, lineage, governance, privacy,    │
│  compliance, glossary, incidents, data-products, anomalies, …       │
│  Command Palette (⌘K)  ·  AI Assistant  ·  Skeleton loading states  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  HTTP REST / JSON  (JWT bearer  OR  X-API-Key)
┌─────────────────────────▼───────────────────────────────────────────┐
│  FastAPI  (Python 3.12, async SQLAlchemy, APScheduler)              │
│  200+ routes across 50+ API modules                                 │
│  Secrets bootstrap (Vault KV v2 / AWS Secrets Manager at startup)   │
└──────┬────────────────────────────────────────────┬─────────────────┘
       │  asyncpg                                   │  HTTP
┌──────▼──────────────┐                ┌────────────▼──────────────┐
│  PostgreSQL 16      │                │  LLM Provider              │
│  26 Alembic migs    │                │  Ollama / OpenAI /         │
│  70+ ORM models     │                │  Claude / Gemini Flash     │
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
DataGuard/
├── app/
│   ├── main.py                  FastAPI app factory, lifespan, middleware
│   ├── api/                     Route handlers (one file per resource)
│   │   ├── users.py             Auth endpoints + user CRUD
│   │   ├── oauth.py             OAuth2/Google SSO callback flow
│   │   ├── service_accounts.py  API key management for CI/CD
│   │   ├── admin.py             Admin utilities
│   │   ├── domains.py           Domain CRUD
│   │   ├── subdomains.py        Subdomain CRUD
│   │   ├── teams.py             Team + membership management
│   │   ├── assets.py            Data asset CRUD + certify
│   │   ├── assets_compat.py     Legacy asset route aliases
│   │   ├── columns.py           Column metadata + profiling history
│   │   ├── classifications.py   Column-level sensitivity tags (PII, etc.)
│   │   ├── rules.py             Rule CRUD, approve/reject, versions, rollback, tags, bulk ops
│   │   ├── schedules.py         Schedule CRUD, pause/resume/run-now
│   │   ├── executions.py        Rule/table/domain execution (sync + async)
│   │   ├── dashboard.py         Dashboard aggregation + CSV export
│   │   ├── quality_scores.py    Quality score series + dimension breakdowns
│   │   ├── ai.py                AI/LLM features
│   │   ├── alerts.py            Alert management
│   │   ├── alert_definitions.py Custom alert rule definitions
│   │   ├── anomaly.py           Anomaly detector CRUD + detection runs
│   │   ├── audit.py             Audit log viewer + CSV export
│   │   ├── config.py            Runtime key-value config
│   │   ├── connections.py       Snowflake connection management
│   │   ├── scan_jobs.py         Scan job orchestration (create, run, results)
│   │   ├── scan_results.py      Scan result storage + retrieval
│   │   ├── profile_results.py   Column profiling result viewer
│   │   ├── catalog.py           Full-text catalog search, saved searches, enrichment
│   │   ├── metadata.py          Metadata store read/write
│   │   ├── lineage.py           SQL-parsed lineage graph (sqlglot), impact analysis
│   │   ├── schema_drift.py      Schema baseline + drift event tracking
│   │   ├── observability.py     Data observability metrics + SLA tracking
│   │   ├── data_products.py     Data product CRUD + asset linkage
│   │   ├── glossary.py          Business glossary terms + approval workflow
│   │   ├── governance.py        Governance policies + violation detection + approvals
│   │   ├── privacy.py           Masking policies, DSR, consent, residency
│   │   ├── compliance.py        Compliance frameworks, requirements, rule mappings
│   │   ├── incidents.py         Quality incident lifecycle + RCA + oncall
│   │   ├── issues.py            Data quality issue intake + triage
│   │   ├── contracts.py         Data contracts + SLA adherence tracking
│   │   ├── notifications.py     Per-user notification feed + mark-read
│   │   ├── tags.py              Tag CRUD + asset/rule tagging
│   │   ├── comments.py          Asset comment threads
│   │   ├── announcements.py     Asset announcement banners
│   │   ├── ownership.py         Asset owner assignment
│   │   ├── access_requests.py   Access request workflow
│   │   ├── cost.py              Quality cost / impact estimates
│   │   ├── usage.py             Asset usage tracking
│   │   ├── marketplace.py       Data marketplace listings
│   │   ├── mesh.py              Data mesh domain topology
│   │   ├── cicd.py              CI/CD pipeline integration hooks
│   │   ├── security_settings.py Platform-wide security settings
│   │   └── …                    (dashboard, reports, slas, etc.)
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
│   │   ├── models.py            All ORM models (70+ classes across all domains)
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
│   │   ├── config_service.py    Runtime config seeder
│   │   ├── anomaly_service.py   Anomaly detector training + detection runs
│   │   ├── catalog_service.py   Full-text search index refresh + enrichment
│   │   ├── governance_service.py Policy evaluation + violation sweep
│   │   ├── masking_service.py   Masking policy application
│   │   ├── profiling_service.py Column profiling (stats, histograms, top values)
│   │   ├── profiling_results_store.py  Profiling result persistence
│   │   ├── scan_orchestrator.py Scan job fan-out + result aggregation
│   │   ├── schema_drift_service.py  Schema baseline + diff computation
│   │   ├── discovery_service.py Automated asset discovery
│   │   ├── enforcement_service.py  Policy enforcement + remediation actions
│   │   ├── forecast_service.py  Quality score forecasting
│   │   ├── auto_rule_service.py AI-assisted automatic rule suggestions
│   │   ├── post_run_service.py  Post-execution hooks (drift check, anomaly re-eval)
│   │   ├── asset_registry.py    Asset registry sync helpers
│   │   ├── metadata_store.py    Key-value metadata persistence
│   │   ├── results_store.py     Scan result storage abstraction
│   │   └── rbac.py              Role-permission matrix helpers
│   └── schemas/                 Pydantic request/response models
├── frontend/
│   └── src/
│       ├── app/                 Next.js App Router pages
│       │   ├── (auth)/          Login, OAuth callback
│       │   ├── dashboard/       Executive KPI dashboard
│       │   ├── rules/           Rule CRUD + approval workflow
│       │   ├── asset-registry/  Registered asset browser
│       │   ├── catalog/         Full-text data catalog search
│       │   ├── lineage/         Lineage graph explorer (interactive DAG)
│       │   ├── glossary/        Business glossary + term approval
│       │   ├── governance/      Governance policies + approvals + history
│       │   ├── privacy/         Masking, DSR, consent, residency tabs
│       │   ├── compliance/      Framework compliance + control mapping
│       │   ├── anomalies/       Anomaly detector management + feed
│       │   ├── incidents/       Quality incident lifecycle
│       │   ├── issues/          Data quality issue tracker
│       │   ├── data-products/   Data product catalog
│       │   ├── contracts/       Data contracts + SLA adherence
│       │   ├── alerts/          Alert feed + acknowledgement
│       │   ├── audit-logs/      Audit trail viewer
│       │   ├── scan-jobs/       Scan job runner + results
│       │   ├── datasets/        Dataset browser
│       │   ├── domains/         Domain hierarchy
│       │   ├── schedules/       Schedule management
│       │   ├── execution-logs/  Rule execution history
│       │   ├── ai-assistant/    Conversational AI agent (agentic tool use)
│       │   ├── notifications/   Notification inbox
│       │   ├── security/        Security settings
│       │   ├── architecture/    Interactive architecture diagram (this page)
│       │   └── …                settings, users, roles, teams, integrations, reports
│       ├── components/
│       │   ├── layout/          Sidebar, ClientLayout, ThemeProvider, CommandPalette (⌘K)
│       │   ├── charts/          QualityTrendChart, DomainsBarChart, ForecastChart
│       │   ├── shared/          StatCard, ScoreBadge, SeverityBadge, Breadcrumbs
│       │   └── ui/              Base UI primitives
│       ├── hooks/               useCurrentUser, useIsAdmin, useCanWrite
│       ├── services/            apiClient.ts (axios wrappers for all APIs)
│       └── types/               TypeScript interfaces
├── migrations/
│   └── versions/
│       ├── 0001_initial_schema.py
│       ├── 0002_enterprise_upgrades.py
│       ├── 0004_column_profiling_stats.py
│       ├── 0005_catalog_search_index.py
│       ├── 0006_asset_registry_evolution.py
│       ├── 0007_asset_source_meta.py
│       ├── 0008_rename_assets_table.py
│       ├── 0009_connection_exclusions.py
│       ├── 0010_connection_filter_mode.py
│       ├── 0011_metadata_store.py
│       ├── 0012_source_connection_meta.py
│       ├── 0013_asset_registry_gaps.py
│       ├── 0014_schema_evolution.py
│       ├── 0015_scan_jobs.py
│       ├── 0016_results_storage.py
│       ├── 0017_user_role_model.py
│       ├── 0018_profiling_engine.py
│       ├── 0019_dimension_scores.py
│       ├── 0020_issues.py
│       ├── 0021_strip_auto_rule_table_suffix.py
│       ├── 0022_tag_tables.py
│       ├── 0023_asset_docs_and_owners.py
│       ├── 0024_anomaly_ai_explanation.py
│       ├── 0025_policy_management.py
│       └── 0026_privacy_compliance_tables.py
├── tests/
│   └── …                        60+ test files across all domains
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
6. Auto-map existing DQ rules to compliance controls on startup
7. On shutdown: `stop_scheduler()` + `close_all_pools()` (drain Snowflake pools)

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
| `require_roles(…)` | Custom role set (used for approver, reviewer gates) |

**Row-level domain isolation:**

`get_domain_filter(user)` returns the user's `domain_id` if their role is `domain_owner`, otherwise `None`. Applied on enriched list endpoints — a domain_owner cannot see another domain's data regardless of query parameters.

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
8. post_run_service: trigger schema drift check + anomaly re-evaluation
9. alert_service.create_alert_if_needed()
```

**Batch execution (`execute_asset_rules`):**

All rules for a table run concurrently via `asyncio.gather()`, bounded by `asyncio.Semaphore(SNOWFLAKE_POOL_MAX_SIZE)`.

### Anomaly Detection (`app/services/anomaly_service.py`)

Each `AnomalyDetector` is configured per-column with a detector type (`zscore`, `iqr`, `threshold`). Training computes a baseline from the last N `DQRuleRun` rows. Detection runs on every execution and writes an `AnomalyDetection` record with delta and severity. Results surface in the Anomalies page and can trigger alerts.

### Lineage (`app/api/lineage.py`)

Lineage is built by parsing SQL (views, dbt definitions) via **sqlglot** in Snowflake dialect. `extract_table_refs()` walks the AST to find all upstream tables while excluding CTE aliases. Results are returned as a directed graph (`nodes` + `edges`) for the interactive frontend DAG. Column-level lineage uses `sqlglot.lineage()` for finer-grained dependency tracing.

### Schema Drift (`app/services/schema_drift_service.py`)

On each scan, the current column list is diffed against the stored `SchemaBaseline`. Any added, removed, or type-changed columns produce a `SchemaDriftEvent`. Drift is surfaced in the observability dashboard and can trigger alert rules.

### Governance (`app/services/governance_service.py`)

Governance policies evaluate assets on a sweep schedule. Each `GovernancePolicy` has a `policy_type` (e.g., `owner_required`, `no_rules_defined`, `stale_description`) and a `severity`. Policy writes require the `require_approver` role gate (admin or domain_owner). Policy mutations are version-controlled in `GovernancePolicyVersion` with an approval workflow via `ApprovalRequest`.

### Privacy Engineering (`app/api/privacy.py`)

Four privacy sub-systems under `/privacy`:

| Sub-system | Model | Description |
|---|---|---|
| Masking policies | `MaskingPolicy` | Column-level masking (full_mask, partial_mask, hash, tokenize, nullify) with role-based unmasked exceptions |
| Data Subject Requests | `DataSubjectRequest` | DSR lifecycle — submitted → processing → completed/rejected |
| Consent records | `ConsentRecord` | Per-subject, per-purpose consent with expiry |
| Residency policies | `DataResidencyPolicy` | Allowed/blocked regions per asset |

### Compliance (`app/api/compliance.py`)

Frameworks (e.g., GDPR, HIPAA, SOC 2) contain `ComplianceRequirement` rows. `ComplianceMapping` links DQ rules to requirements, enabling automated compliance scoring. `POST /compliance/assess-all` re-evaluates every mapping in a single call. On startup, existing DQ rules are auto-mapped to applicable controls.

### Catalog & Search (`app/services/catalog_service.py`)

`refresh_search_index()` (re)builds a full-text search index over asset names, descriptions, column names, glossary terms, and tags. `enrich_asset_results()` joins quality scores, classification counts, owner info, and domain names onto each result. Saved searches are stored per user in `SavedSearch`.

### Background Job Tracking (`app/services/job_tracker.py`)

In-memory registry for `POST /rules/bulk/execute` and scan jobs. Jobs transition through `queued → running → completed / failed`. Completed/failed jobs are pruned after 1 hour. Status polling requires no DB query.

### LLM Providers (`app/services/llm_providers.py`)

Four concrete providers under `LLMProvider` ABC. `GeminiProvider.complete()` uses `asyncio.to_thread()` because `google-genai`'s `generate_content` is synchronous.

### Secrets Loader (`app/core/secrets_loader.py`)

Called once at startup. Reads from:

- **HashiCorp Vault KV v2** via `httpx` — requires `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_SECRET_PATH`
- **AWS Secrets Manager** via `boto3` — requires `AWS_SECRETS_NAME`, uses default credential chain

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
| `0004` | Column profiling stats — `ordinal_position`, `std_dev`, `top_values` |
| `0005` | Catalog search index |
| `0006` | Asset registry evolution |
| `0007` | Asset source metadata |
| `0008` | Rename assets table |
| `0009–0010` | Connection exclusions + filter mode |
| `0011` | Metadata store — `asset_metadata_snapshots`, extended assets |
| `0012` | Source connection metadata |
| `0013` | Asset registry gap fills |
| `0014` | Schema evolution tracking |
| `0015` | Scan jobs — `scan_jobs`, `scan_job_runs`, `scan_job_run_logs` |
| `0016` | Results storage |
| `0017` | User role model |
| `0018` | Profiling engine |
| `0019` | Dimension scores |
| `0020` | Issue intake — `dq_issues` |
| `0021` | Strip auto-rule table suffix |
| `0022` | Tag tables |
| `0023` | Asset docs + owners |
| `0024` | Anomaly AI explanation |
| `0025` | Policy management — `approval_requests`, `governance_policy_versions`, `notifications` |
| `0026` | Privacy & compliance — `data_subject_requests`, `consent_records`, `data_residency_policies`, compliance tables |

### Key tables by domain

**Core / Auth**

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, domain scoping, OAuth identity |
| `user_roles` | Many-to-many role assignments |
| `service_accounts` | API-key machine-to-machine auth |
| `teams` / `team_memberships` / `team_roles` | Team management |
| `app_config` | Runtime key-value config (LLM keys, Slack URL, etc.) |
| `audit_logs` | Append-only action trail with before/after JSON |

**Data Organization**

| Table | Purpose |
|---|---|
| `domains` / `subdomains` | Business hierarchy |
| `assets` | Registered tables with certification, ownership, scan timestamps |
| `asset_source_meta` | Connection + schema metadata per asset |
| `column_metadata` / `column_profile_history` | Column stats + profiling history |
| `data_classifications` | Column-level sensitivity tags (PII, PHI, etc.) |
| `asset_tags` / `tags` | Flexible tagging |
| `asset_owners` | Owner assignments per asset |
| `asset_comments` / `asset_announcements` | Social layer on assets |
| `asset_documents` / `asset_ratings` | Documentation + ratings |

**Data Quality**

| Table | Purpose |
|---|---|
| `dq_rules` | Rule definitions with lifecycle state and governance fields |
| `rule_versions` | Immutable snapshots before every rule mutation |
| `rule_tags` | Many-to-one tags per rule |
| `dq_schedules` | Schedule configs at any hierarchy level |
| `dq_rule_runs` | One row per execution (counts, score, SQL, AI explanation) |
| `dq_rule_run_samples` | Up to 10 sample failed rows per run |
| `dq_quality_scores` | Pre-aggregated daily scores at table/subdomain/domain/global level |
| `dq_dimension_scores` | Scores broken down by dimension (completeness, validity, etc.) |
| `dq_alerts` | Alert lifecycle — open → acknowledged → resolved/ignored |
| `alert_definitions` | Custom alert rule configurations |
| `sla_configs` | Per-entity quality thresholds + alert routing overrides |
| `dq_issues` | Data quality issue intake with status lifecycle |
| `quality_incidents` | Incident lifecycle with RCA, TTD/TTR, timeline |
| `oncall_schedules` / `incident_runbooks` | Oncall + runbook management |

**Catalog & Lineage**

| Table | Purpose |
|---|---|
| `scan_jobs` / `scan_job_runs` / `scan_job_run_logs` | Scan orchestration |
| `schema_baselines` / `schema_drift_events` | Schema drift tracking |
| `asset_metadata_snapshots` | Point-in-time metadata snapshots |
| `asset_usage` | Usage tracking per asset |
| `saved_searches` | Per-user saved catalog searches |
| `data_products` / `data_product_assets` | Data product catalog + asset linkage |
| `data_contracts` | Producer/consumer SLA contracts |

**Governance**

| Table | Purpose |
|---|---|
| `governance_policies` | Policy definitions with severity and policy_type |
| `governance_policy_versions` | Immutable version history per policy |
| `policy_violations` | Detected violations per asset |
| `approval_requests` | Approval workflow for policy mutations |
| `glossary_terms` / `glossary_term_assets` | Business glossary + asset linkage |
| `notifications` | Per-user notification feed |

**Privacy & Compliance**

| Table | Purpose |
|---|---|
| `masking_policies` | Column-level masking rules with role-based exceptions |
| `data_subject_requests` | DSR lifecycle |
| `consent_records` | Per-subject, per-purpose consent with expiry |
| `data_residency_policies` | Allowed/blocked regions per asset |
| `compliance_frameworks` | Framework definitions (GDPR, HIPAA, SOC 2, …) |
| `compliance_requirements` | Control requirements per framework |
| `compliance_mappings` | DQ rule → requirement mappings |

**Snowflake / Connections**

| Table | Purpose |
|---|---|
| `snowflake_connections` | Stored connection configs (password Fernet-encrypted) |

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

**Dimension scores** (`dq_dimension_scores`): Same formula broken down by DQ dimension (completeness, validity, uniqueness, timeliness, consistency, accuracy).

`aggregate_quality_scores()` recomputes and upserts daily scores at table, subdomain, domain, and global levels after every execution batch. A nightly APScheduler job also runs it at 00:05.

---

## Frontend Architecture

### Auth flow

1. `ClientLayout.tsx` guards all non-public pages — checks `localStorage.access_token`
2. On 401 from API, `apiClient.ts` auto-refreshes once then clears tokens and redirects to `/login`
3. OAuth callback: `/auth/callback` reads `?token=&refresh=` from URL and stores tokens

### Command Palette

`CommandPalette.tsx` registers a global `keydown` listener for ⌘K/Ctrl+K. No state management beyond the component — purely client-side navigation.

### Notification Bell

The sidebar notification bell polls `/notifications` on mount and shows an unread badge. Clicking opens a dropdown panel. Marking all read calls `PATCH /notifications/mark-all-read`.

### Toast notifications

`sonner` `<Toaster>` placed in root `layout.tsx`. Any component can call `toast.success()` / `toast.error()` without providers or context.

### Skeleton loading

List pages render animated placeholder rows matching the actual table/card layout while data loads.

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
| Column sensitivity | `data_classifications` table — PII/PHI/CONFIDENTIAL tags drive masking policy enforcement |
| CSRF protection | HMAC-signed state parameter for OAuth2 flow |
| SQL injection | `business_rule_check` condition validated; INFORMATION_SCHEMA queries use `_safe_ident()` |
| Rate limiting | SlowAPI on auth endpoints (10/min login) |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy` |
| API docs | `/docs` and `/redoc` disabled in production (`APP_ENV=production`) |
| Secret management | Vault KV v2 / AWS SM bootstrap at startup; never hardcoded |
| Audit | `audit_logs` — append-only, every mutation logged with before/after JSON |
| CORS | `ALLOWED_ORIGINS` env var (comma-separated); defaults to localhost:3000 |
| Request tracing | `X-Request-ID` header injected by middleware; propagated to all logs |
