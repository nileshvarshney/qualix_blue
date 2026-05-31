# Admin Guide

## Who this guide is for

This guide is for users with the `admin` role — responsible for initial setup, user management, SSO configuration, service accounts, Snowflake connections, secret management, alert routing, and production operations.

---

## First-Time Setup

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

Or connect to any PostgreSQL 14+ instance and set `DATABASE_URL`.

### 2. Install backend dependencies

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
```

Minimum required settings for production:

```env
SECRET_KEY=<openssl rand -hex 32>
ENCRYPTION_KEY=<python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
DATABASE_URL=postgresql+asyncpg://dquser:dqpass@localhost:5432/dqplatform
SYNC_DATABASE_URL=postgresql://dquser:dqpass@localhost:5432/dqplatform
AUTH_REQUIRED=true
```

### 4. Run database migrations

```bash
PYTHONPATH=. alembic upgrade head
```

Migrations applied:
- `0001` — initial schema (all core tables)
- `0002` — rule_versions, certification, ownership fields

The app also runs safe inline migrations on startup (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) for columns added after the last Alembic migration, including:
- `users.oauth_provider`, `users.oauth_id` — Google SSO
- `service_accounts` table — API key auth
- Composite performance indexes on `dq_rule_runs` and `dq_quality_scores`

### 5. Seed initial data

```bash
PYTHONPATH=. python app/db/seed.py
```

Creates 7 domains, 32 subdomains, 1 sample asset, 5 sample rules, and default users for all five roles (see table below). The seed is idempotent.

#### Default login credentials

| Role | Email | Password | Access |
|---|---|---|---|
| `admin` | `admin@example.com` | `admin123` | Full platform access |
| `domain_owner` | `domain.owner@example.com` | `domain123` | Revenue domain only |
| `data_owner` | `data.owner@example.com` | `data123` | Assigned tables |
| `viewer` | `viewer@example.com` | `viewer123` | Read-only |
| `auditor` | `auditor@example.com` | `auditor123` | Viewer + audit logs |

**Change all passwords immediately after first login in production.**

### 6. Start the API

```bash
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check: `GET http://localhost:8000/health`

### 7. Start the frontend

```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_AUTH_REQUIRED=true" >> .env.local
npm install && npm run dev
```

---

## Docker Compose

```bash
# API + PostgreSQL + Frontend
docker compose up -d

# Include Ollama for local AI
docker compose --profile ollama up -d
docker exec -it dq_ollama ollama pull qwen2.5:7b-instruct
```

---

## Authentication & Security

### JWT tokens

| Setting | Default | Description |
|---|---|---|
| `AUTH_REQUIRED` | `true` | Enforce login; set `false` only for local dev |
| `SECRET_KEY` | *(weak default)* | JWT signing key — generate with `openssl rand -hex 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime (30 min); rotate via refresh token |

The API validates `Authorization: Bearer <token>` on every protected endpoint.

### Credential encryption at rest

Set `ENCRYPTION_KEY` (a Fernet key) so Snowflake passwords and LLM API keys are stored encrypted in the database:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```env
ENCRYPTION_KEY=<generated key>
```

Without this, credentials are stored in plaintext. The app logs a warning at startup.

---

## SSO / OAuth2 (Google)

### Setup

1. Create a Google Cloud project at https://console.cloud.google.com
2. Go to **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized redirect URI: `http://your-domain:8000/auth/oauth/google/callback`
5. Copy the Client ID and Client Secret

Set in `.env`:

```env
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
OAUTH_REDIRECT_URI=https://your-domain.com/auth/oauth/google/callback
FRONTEND_URL=https://your-domain.com
```

### How it works

1. User clicks **Sign in with Google** on the login page
2. Browser is redirected to Google's consent screen
3. After consent, Google redirects to `/auth/oauth/google/callback?code=…&state=…`
4. The backend exchanges the code for user info, creates or links the local user account, issues a JWT pair
5. Browser is redirected to `/auth/callback?token=…&refresh=…` where tokens are stored

**First-time SSO users** are created with the `viewer` role. Promote them via `PATCH /users/{id}` or the Admin → User Management UI.

**Existing users** (by email) are automatically linked to their Google identity on first SSO login.

### Checking which providers are enabled

```bash
curl http://localhost:8000/auth/oauth/providers
```

---

## Service Accounts (API Key Auth)

Service accounts allow pipelines, CI/CD systems, and scripts to authenticate without a user session. They use an `X-API-Key` header instead of a Bearer JWT.

### Key format

```
sa_<8-char-prefix>_<32-char-secret>
```

The full key is shown **once** at creation and never stored in plaintext. Only the prefix and a bcrypt hash are stored.

### Creating a service account

```bash
curl -X POST http://localhost:8000/service-accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ci-pipeline",
    "description": "GitHub Actions pipeline",
    "role": "data_owner",
    "domain_id": "<optional-domain-id>"
  }'
```

Response includes `api_key` — store it immediately.

### Using the API key

```bash
curl http://localhost:8000/rules \
  -H "X-API-Key: sa_AbCd1234_your32charsecretgoeshere..."
```

### Rotating a key

```bash
curl -X PATCH http://localhost:8000/service-accounts/<sa_id>/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Returns a new key. The old key is immediately invalidated.

### Managing service accounts

```bash
# List all
curl http://localhost:8000/service-accounts -H "Authorization: Bearer $ADMIN_TOKEN"

# Deactivate
curl -X PATCH http://localhost:8000/service-accounts/<sa_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'

# Delete
curl -X DELETE http://localhost:8000/service-accounts/<sa_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Secrets Management

### Local development — .env file

Set sensitive values directly in `.env`. The app reads them via pydantic-settings.

### Production — HashiCorp Vault (KV v2)

If `VAULT_ADDR`, `VAULT_TOKEN`, and `VAULT_SECRET_PATH` are set, the app fetches secrets from Vault at startup and merges them into the config. This happens before any other initialization.

```env
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=hvs.CAESIQ...
VAULT_SECRET_PATH=secret/data/dq-platform/prod
```

The Vault secret should be a KV v2 JSON object with keys matching env var names (case-insensitive):

```json
{
  "secret_key": "generated-jwt-key",
  "encryption_key": "fernet-key",
  "snowflake_password": "...",
  "openai_api_key": "sk-...",
  "google_client_secret": "GOCSPX-..."
}
```

**Recommended:** Use Vault Agent sidecar to inject secrets as environment variables — the app reads them automatically without Vault connectivity at runtime.

### Production — AWS Secrets Manager

If `AWS_SECRETS_NAME` is set, the app fetches the secret JSON at startup using boto3's default credential chain (env vars → `~/.aws` → EC2/ECS IAM role):

```env
AWS_SECRETS_NAME=prod/dq-platform/secrets
AWS_REGION=us-east-1
```

The secret value must be a JSON string with the same keys as the Vault example above.

boto3 is not included in `requirements.txt` by default — install it separately for AWS deployments:

```bash
pip install boto3
```

---

## Snowflake Connection Pooling

The platform maintains a connection pool per unique Snowflake endpoint. Connections are reused across rule executions instead of opened fresh for every query.

**Configuration:**

```env
SNOWFLAKE_POOL_MIN_SIZE=1          # Minimum idle connections per pool
SNOWFLAKE_POOL_MAX_SIZE=5          # Maximum total connections per pool
SNOWFLAKE_POOL_ACQUIRE_TIMEOUT=30  # Seconds to wait before raising pool-exhausted error
```

Rules within a table now execute **concurrently** (bounded by `SNOWFLAKE_POOL_MAX_SIZE`) instead of sequentially. For a table with 20 rules this means ~5× throughput.

All pools are cleanly drained on API shutdown.

---

## Row-Level Domain Isolation

Users with the `domain_owner` role can only see data for their assigned `domain_id`. The `get_domain_filter()` function in `app/core/security.py` enforces this on:

- `GET /rules/enriched`
- `GET /assets/enriched`

A domain_owner cannot bypass this by passing a different `domain_id` query parameter — the server-side filter overrides it.

---

## User Management

### From the UI (Admin → User Management)

Create, edit, deactivate, and manage roles for all users.

### From the API

```bash
# Create a user
curl -X POST http://localhost:8000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@company.com",
    "password": "secure-password",
    "full_name": "Jane Doe",
    "role": "domain_owner",
    "domain_id": "<revenue_domain_id>"
  }'

# List all users
curl http://localhost:8000/users -H "Authorization: Bearer $ADMIN_TOKEN"

# Change role
curl -X PUT http://localhost:8000/users/<user_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "data_owner"}'

# Deactivate
curl -X DELETE http://localhost:8000/users/<user_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Roles

| Role | What they can do |
|---|---|
| `admin` | Everything — users, all domains, all rules, config, approve/reject, Admin UI |
| `domain_owner` | Manage rules/schedules in their `domain_id`; approve/reject rules |
| `data_owner` | Create/edit rules for assigned tables |
| `viewer` | Read-only — dashboards, alerts, runs, AI assistant |
| `auditor` | Viewer + audit logs |

---

## Domain & Subdomain Management

Go to **Admin → Domain Management** (admin only).

- **New Domain** — name, description, owner email.
- **Add Subdomain** — add under any domain.
- **Edit** (pencil icon) — inline edit of name/description.
- **Trash icon** — soft deactivate (data preserved).

```bash
# Create a domain
curl -X POST http://localhost:8000/domains \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain_name":"Product","description":"Product analytics","owner_email":"product@co.com"}'

# Create a subdomain
curl -X POST http://localhost:8000/subdomains \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain_id":"<id>","subdomain_name":"Engagement"}'
```

---

## Snowflake Connections

Go to **Settings → Snowflake**.

Fill in connection name, account, user, password, warehouse, role, and default database. Click **Test Connection** before saving.

Passwords are encrypted using the `ENCRYPTION_KEY` Fernet key before storage.

```bash
# Required Snowflake privileges
CREATE ROLE IF NOT EXISTS DQ_PLATFORM_ROLE;
CREATE WAREHOUSE IF NOT EXISTS DQ_EXECUTION_WH
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
GRANT USAGE ON WAREHOUSE DQ_EXECUTION_WH TO ROLE DQ_PLATFORM_ROLE;
GRANT USAGE ON DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT USAGE ON ALL SCHEMAS IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT ON ALL TABLES IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT ON FUTURE TABLES IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
```

---

## LLM / AI Configuration

Go to **Settings → LLM / AI** or set via environment variables:

```env
LLM_PROVIDER=ollama        # ollama | openai | claude | gemini_flash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

API keys stored in the database are encrypted with `ENCRYPTION_KEY`.

---

## Alert Routing

### Global recipients

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL_RECIPIENTS=data-team@co.com,oncall@co.com
```

### Per-table routing (SLA configs)

```bash
curl -X POST http://localhost:8000/sla-configs \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "table",
    "entity_id": "<asset_id>",
    "min_quality_score": 98.0,
    "notification_emails": "revenue-team@co.com",
    "notification_slack_channel": "https://hooks.slack.com/services/revenue-webhook"
  }'
```

Alert deduplication: a second alert is not created for the same rule within a 4-hour window.

---

## Background Bulk Execution

`POST /rules/bulk/execute` now runs asynchronously and returns immediately:

```json
{
  "job_id": "uuid",
  "status": "queued",
  "total": 25,
  "poll_url": "/rules/bulk/jobs/uuid"
}
```

Poll for progress:

```bash
curl http://localhost:8000/rules/bulk/jobs/<job_id> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Response fields: `status` (queued/running/completed/failed), `total`, `completed`, `failed`, `results[]`.

Jobs expire from memory after 1 hour. For production, replace the in-memory store with Redis by updating `app/services/job_tracker.py`.

---

## Rule Approval Workflow

AI-generated and YAML-imported rules start as `pending_review`. Only `active` rules execute.

```bash
# Approve
curl -X POST http://localhost:8000/rules/<rule_id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Reject with reason
curl -X POST http://localhost:8000/rules/<rule_id>/reject \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rejection_reason": "SQL too expensive on large tables"}'
```

---

## Dataset Certification

```bash
curl -X POST http://localhost:8000/assets/<asset_id>/certify \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"certification_status": "certified", "certified_by": "governance@co.com"}'
```

---

## CSV Exports

| Endpoint | Description |
|---|---|
| `GET /dashboard/export/runs?days=30` | Rule execution runs (last N days) |
| `GET /audit/export?days=30` | Audit log events (last N days) |

Both accept optional filter parameters and return `Content-Disposition: attachment` CSV responses.

---

## Scheduler Management

```bash
# Create daily table schedule (6 AM Pacific)
curl -X POST http://localhost:8000/schedules \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset_id":"<id>","schedule_level":"table","frequency":"daily","run_at_hour":6,"run_at_minute":0,"timezone":"America/Los_Angeles"}'

# Pause / resume / run now
curl -X PATCH http://localhost:8000/schedules/<id>/pause -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X PATCH http://localhost:8000/schedules/<id>/resume -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X POST http://localhost:8000/schedules/<id>/run-now -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Health Check & Monitoring

```bash
curl http://localhost:8000/health
# {"status":"healthy","checks":{"database":"ok"}}
```

`status` is `degraded` if PostgreSQL is unreachable. The API starts without the database — requests requiring DB access return 500 with a clear error.

---

## Backups

```bash
# Backup
pg_dump -U dquser dqplatform > dqplatform_$(date +%Y%m%d).sql

# Restore
psql -U dquser dqplatform < dqplatform_20260512.sql
```

Critical tables: `dq_rules`, `rule_versions`, `dq_rule_runs`, `audit_logs`, `users`, `service_accounts`.

---

## Troubleshooting

### API won't start

```bash
PYTHONPATH=. python -c "from app.db.database import engine; print('DB OK')"
PYTHONPATH=. alembic current && alembic heads
```

### Rules not executing on schedule

```bash
curl http://localhost:8000/schedules/jobs -H "Authorization: Bearer $ADMIN_TOKEN"
curl "http://localhost:8000/runs?limit=20" -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Snowflake connection errors

```bash
curl -X POST http://localhost:8000/connections/<id>/test -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X POST http://localhost:8000/config/test/snowflake -H "Authorization: Bearer $ADMIN_TOKEN"
```

### LLM not responding

```bash
curl http://localhost:11434/api/tags         # Ollama
curl -X POST http://localhost:8000/config/test/llm -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Snowflake pool exhausted

Increase `SNOWFLAKE_POOL_MAX_SIZE` in `.env` and restart. Default is 5. For large rule batches (50+ rules), consider 10–15.
