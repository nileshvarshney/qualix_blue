# DataGuard - Enterprise Data Quality & Governance Platform

DataGuard is a comprehensive, AI-powered data quality and governance platform that monitors, scores, alerts on, and governs data quality across your entire data ecosystem. Built with FastAPI (Python) + Next.js (TypeScript), it supports multiple data sources and integrates AI for intelligent rule generation, failure analysis, and automated remediation.

## Key Features

### Data Quality Engine
- **12 Built-in Rule Types**: null_check, uniqueness, range, regex, freshness, volume, referential integrity, schema drift, business rules, custom SQL, and more
- **6 Quality Dimensions**: Completeness, Accuracy, Uniqueness, Validity, Timeliness, Consistency (ISO 8000 / DAMA aligned)
- **Concurrent Execution**: Async rule execution with semaphore-based resource management
- **Quality Scoring**: Severity-weighted scoring with nightly aggregation at domain/subdomain/table/global levels
- **Rule Approval Workflow**: Draft -> Pending Review -> Active/Rejected with full audit trail

### Multi-Database Support
- **Snowflake** (primary, full integration with live data browser)
- **PostgreSQL**
- **MySQL**
- **BigQuery**
- **Redshift**
- **MongoDB**
- **CSV / File sources**
- **REST APIs**

### AI Intelligence (4 LLM Providers)
- **AI Rule Generation**: Suggest 5-8 quality rules from table schema
- **AI Failure Explanation**: Root cause analysis with remediation recommendations
- **Natural Language to SQL**: Convert questions into Snowflake queries
- **AI Agent (Tool-Use)**: Interactive agent that queries platform data in real-time
- **Predictive Quality**: Forecast quality failures before they happen
- **Auto-Classification**: AI-driven PII detection and data classification
- **Providers**: Ollama (local/free), OpenAI (GPT-4o), Anthropic Claude, Google Gemini

### Governance & Compliance
- **Data Catalog**: Full-text searchable metadata with faceted navigation
- **Data Lineage**: Visual parent/child relationship graphs (@xyflow/react)
- **Business Glossary**: Searchable business terms and definitions
- **Data Contracts**: SLA definitions with breach tracking
- **Policy Management**: Governance policy enforcement
- **Compliance Tracking**: Regulatory adherence monitoring
- **Incident Management**: Track, resolve, and perform RCA with AI post-mortems

### Operations
- **Alerting**: Slack + Email with 4-hour deduplication and severity routing
- **Scheduling**: APScheduler with inheritance (rule > table > subdomain > domain > global)
- **Live Data Browser**: Browse and preview data directly from connected sources
- **Schema Drift Detection**: Detect column additions, deletions, type changes
- **Column Profiling**: Null %, uniqueness, distributions, and historical trends
- **Cost Tracking**: Monitor Snowflake compute costs
- **Connection Diagnostics**: Multi-step testing with detailed pass/fail results

### Security & Auth
- **JWT Bearer Tokens** (30-min access + 7-day refresh)
- **Google OAuth2 / SSO**
- **RBAC**: admin, domain_owner, data_owner, viewer, auditor
- **Service Accounts**: API key auth for CI/CD pipelines
- **Domain-Level Isolation**: Scope access by business domain
- **Credential Encryption**: Fernet symmetric encryption at rest
- **Secrets Bootstrap**: HashiCorp Vault / AWS Secrets Manager

### Frontend
- **Next.js 15** with App Router, React 19, TypeScript, Tailwind CSS
- **35+ Pages**: Dashboards, rules, assets, catalog, governance, AI assistant
- **AI Agent Chat Widget**: Floating chatbot with tool-use badges and suggestions
- **Command Palette**: Cmd+K fuzzy search navigation
- **Interactive Lineage Graph**: @xyflow/react visualization
- **Quality Trend Charts**: Recharts-powered analytics
- **Dark Mode**: System-aware theme with manual toggle

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                      │
│  React 19 · TypeScript · Tailwind · Recharts · @xyflow      │
└─────────────────────────┬───────────────────────────────────┘
                          │ JWT + apiClient.ts
┌─────────────────────────▼───────────────────────────────────┐
│                   Backend (FastAPI)                           │
│  120+ API Routes · SQLAlchemy ORM · APScheduler              │
├──────────────┬──────────────────┬───────────────────────────┤
│  Services    │  Security        │  AI/LLM Providers          │
│  (business   │  (JWT, RBAC,     │  (Ollama, OpenAI,         │
│   logic)     │   encryption)    │   Claude, Gemini)          │
└──────┬───────┴──────────────────┴──────────────┬────────────┘
       │                                          │
┌──────▼──────────┐                    ┌──────────▼──────────┐
│  Snowflake DB   │                    │  Data Sources        │
│  (metadata +    │                    │  (Snowflake, PG,     │
│   rule exec)    │                    │   MySQL, BQ, etc.)   │
└─────────────────┘                    └─────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 20+
- Snowflake account (for metadata storage and rule execution)
- Docker (optional, for containerized deployment)

### 1. Clone & Setup Backend
```bash
git clone https://github.com/yourschinnu/Data_Quality_Governance.git dataguard
cd dataguard

# Create virtual environment
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Snowflake credentials and settings
```

### 2. Setup Frontend
```bash
cd frontend
npm install
cd ..
```

### 3. Run Locally
```bash
# Terminal 1: Backend API
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
cd frontend && npm run dev
```

Visit http://localhost:3000 to access DataGuard.

### 4. Docker (Recommended)
```bash
# Start all services
docker compose up -d

# With local Ollama LLM
docker compose --profile ollama up -d
```

## Configuration

### Required Environment Variables
```env
# Snowflake Platform Connection (where DataGuard stores its metadata)
SF_PLATFORM_ACCOUNT=myorg-myaccount
SF_PLATFORM_USER=dq_platform_user
SF_PLATFORM_PASSWORD=secure_password
SF_PLATFORM_WAREHOUSE=DQ_EXECUTION_WH
SNOWFLAKE_APP_DATABASE=DQ_PLATFORM_DB
SNOWFLAKE_APP_SCHEMA=DQ_APP

# Security
SECRET_KEY=<openssl rand -hex 32>
AUTH_REQUIRED=true
ENCRYPTION_KEY=<python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

# LLM Provider (choose one)
LLM_PROVIDER=ollama  # ollama | openai | claude | gemini_flash
OLLAMA_BASE_URL=http://localhost:11434
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

### Optional
```env
# OAuth2 / Google SSO
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
SMTP_HOST=smtp.gmail.com
SMTP_USER=alerts@yourcompany.com

# Secrets Management
VAULT_ADDR=https://vault.example.com
AWS_SECRETS_NAME=dataguard/prod
```

## Testing
```bash
# Run all tests
PYTHONPATH=. pytest tests/ -v

# With coverage
PYTHONPATH=. pytest tests/ --cov=app --cov-report=term-missing
```

## API Documentation
When running locally with `AUTH_REQUIRED=false`, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Project Structure
```
dataguard/
├── app/                      # FastAPI Backend
│   ├── api/                  # 42 route modules (120+ endpoints)
│   ├── core/                 # Config, security, middleware
│   ├── db/                   # Models, database, Snowflake pool
│   ├── services/             # Business logic (17 modules)
│   └── schemas/              # Pydantic request/response models
├── frontend/                 # Next.js 15 Frontend
│   └── src/
│       ├── app/              # Pages (35+ routes)
│       ├── components/       # React components (agent, charts, layout)
│       ├── services/         # API client
│       └── hooks/            # Custom hooks
├── tests/                    # 12 test suites
├── config/                   # Golden datasets, SQL scripts
├── migrations/               # Database migrations
├── docker-compose.yml        # Multi-service orchestration
├── Dockerfile                # API container
└── requirements.txt          # Python dependencies
```

## Quality Dimensions

DataGuard categorizes all quality rules into 6 industry-standard dimensions:

| Dimension | Rule Types | Description |
|-----------|-----------|-------------|
| **Completeness** | null_check, volume_check | Data is present and not missing |
| **Accuracy** | business_rule_check, custom_sql_check | Data correctly represents reality |
| **Uniqueness** | uniqueness_check, duplicate_check | No unintended duplicates |
| **Validity** | range_check, regex_check, accepted_values | Data conforms to expected format |
| **Timeliness** | freshness_check | Data is current and up-to-date |
| **Consistency** | referential_integrity, schema_drift | Data agrees across systems |

## Default Credentials
> **Change these in production!**
- Admin: `admin@example.com` / `admin123`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI 0.115, Python 3.12, SQLAlchemy 2.0 |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Database | Snowflake (via snowflake-sqlalchemy) |
| AI/LLM | Ollama, OpenAI, Anthropic, Google Gemini |
| Charts | Recharts, @xyflow/react |
| Auth | JWT (python-jose), OAuth2, bcrypt |
| Scheduling | APScheduler |
| Notifications | Slack webhooks, SMTP email |
| Deployment | Docker, docker-compose |

## License
MIT

## Contributing
Pull requests welcome. For major changes, open an issue first to discuss the approach.
