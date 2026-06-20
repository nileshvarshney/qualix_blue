# Data Protection & Privacy — Complete Implementation Design
**Date**: 2026-06-20  
**Status**: Approved

---

## Background

The Compliance and Privacy sections of DataGuard have partial backend implementations but several critical gaps: missing Alembic migrations, no auto-mapping of DQ rules to compliance controls, no frontend for masking policies, and no models/APIs/UI for DSR, consent management, or data residency.

---

## Section 1 — Database (Migration 0026)

### Tables to create (IF NOT EXISTS)

Five existing SQLAlchemy models have no Alembic migration:
- `compliance_frameworks`
- `compliance_requirements`
- `compliance_mappings`
- `masking_policies`
- `data_classifications`

Three new models and tables:

**`data_subject_requests`**
| Column | Type | Notes |
|---|---|---|
| dsr_id | String(36) PK | UUID |
| subject_email | String(200) NOT NULL | Data subject's email |
| request_type | String(30) NOT NULL | erasure, access, rectification, portability, opt_out |
| status | String(20) default "pending" | pending, in_review, completed, rejected |
| description | Text | Free-text details |
| affected_tables | Text | JSON list of asset IDs |
| assigned_to | String(200) | Assignee email |
| notes | Text | Internal notes |
| requested_by | String(200) | Who filed the request |
| created_at | DateTime | Auto |
| completed_at | DateTime nullable | Set on completion/rejection |

**`consent_records`**
| Column | Type | Notes |
|---|---|---|
| consent_id | String(36) PK | UUID |
| asset_id | String(36) FK assets | Nullable — can be global |
| purpose | String(300) NOT NULL | e.g. "Marketing analytics" |
| legal_basis | String(50) NOT NULL | consent, legitimate_interest, contract, legal_obligation, vital_interests, public_task |
| data_subject_type | String(100) | e.g. "Customer", "Employee" |
| requires_explicit_consent | Boolean default False | |
| opt_in | Boolean default True | |
| recorded_by | String(200) | |
| created_at | DateTime | Auto |

**`data_residency_policies`**
| Column | Type | Notes |
|---|---|---|
| residency_id | String(36) PK | UUID |
| asset_id | String(36) FK assets nullable | Null = applies globally |
| domain_id | String(36) FK domains nullable | Alternative scope |
| allowed_regions | Text | JSON list e.g. `["US","EU"]` |
| prohibited_regions | Text | JSON list |
| data_sovereignty_country | String(100) | Primary sovereignty |
| notes | Text | |
| created_by | String(200) | |
| created_at | DateTime | Auto |

---

## Section 2 — Compliance Page Fixes

### Problem
- Startup seed (`seed_compliance_frameworks`) can fail silently → no frameworks → KPIs show "—"
- No auto-mapping from existing DQ rules → compliance controls stay "not-assessed"
- No UI to trigger assessment

### Fixes

**Backend — Auto-map DQ rules to controls**  
After seeding frameworks+requirements, run `auto_map_rules_to_controls(db)`:
1. Fetch all `DQRule` records grouped by `rule_type`
2. For each `ComplianceRequirement`, parse its `dq_rule_types` CSV
3. For matching rules, insert a `ComplianceMapping` row per (asset_id, framework_id, req_id, rule_id) with `status="mapped"` — skip if already exists
4. Run on each startup after seeding (idempotent via ON CONFLICT / existence check)

**Backend — Assess endpoint enhancement**  
`POST /compliance/frameworks/{id}/assess/all` — runs assessment against all assets in the workspace (calls existing per-asset logic in a loop). Returns aggregate counts.

**Frontend — Compliance page**  
- Add **"Initialize Frameworks"** button visible only when `frameworks.length === 0` that calls `POST /api/compliance/seed`
- Add **"Assess All Assets"** button per framework card calling the new `assess/all` endpoint
- Fix KPI "Overall Compliance": show `0%` (not `"—"`) when frameworks exist but `passedControls === 0`; only show `"—"` when `frameworks.length === 0`

---

## Section 3 — Data Masking UI

### New page: `/privacy`

Single page with tab navigation: **Masking | DSR | Consent | Residency**

**Masking tab**
- Top: PII Exposure Report card — `unprotected_pii_tables` count from `GET /privacy/pii-exposure-report`
- Table: asset name, column, masking type, roles exempt from masking, created by, actions
- **Add Policy** button → slide-over / modal:
  - Asset picker (fetches `/api/asset-registry`)
  - Column name (text input)
  - Masking type (dropdown: full_mask, partial_mask, hash, tokenize, nullify)
  - Unmasked roles (multi-select: admin, data_steward, data_owner)
- Delete button per row (calls `DELETE /privacy/masking-policies/{id}`)

### Next.js API proxy routes needed
- `GET/POST /api/privacy/masking-policies` → `GET/POST /privacy/masking-policies`
- `DELETE /api/privacy/masking-policies/[id]` → `DELETE /privacy/masking-policies/{id}`
- `GET /api/privacy/pii-exposure` → `GET /privacy/pii-exposure-report`

---

## Section 4 — Data Subject Request Workflow

### Backend
**Model**: `DataSubjectRequest` (see Section 1)  
**Router**: Add to `privacy.py`

| Endpoint | Purpose |
|---|---|
| `GET /privacy/dsr` | List all DSRs (filter by status optional) |
| `POST /privacy/dsr` | Create new DSR |
| `PATCH /privacy/dsr/{id}` | Update status, assigned_to, notes |
| `DELETE /privacy/dsr/{id}` | Hard-delete (admin only) |

Status lifecycle: `pending → in_review → completed | rejected`

### Frontend — DSR tab
- KPI cards: Pending count, In Review count, Completed (last 30 days)
- Table: subject email, request type, status pill, assigned to, created date, action buttons
- **New Request** button → modal (subject email, request type, description, affected tables)
- **Accept** (→ in_review), **Complete** (→ completed), **Reject** (→ rejected) action buttons

### Next.js API proxy routes
- `GET/POST /api/privacy/dsr`
- `PATCH/DELETE /api/privacy/dsr/[id]`

---

## Section 5 — Consent Management

### Backend
**Model**: `ConsentRecord` (see Section 1)  
**Router**: Add to `privacy.py`

| Endpoint | Purpose |
|---|---|
| `GET /privacy/consent` | List all consent records |
| `POST /privacy/consent` | Create record |
| `DELETE /privacy/consent/{id}` | Remove record |

### Frontend — Consent tab
- Summary cards: Total Records, Opt-In Rate (%), Assets Missing Consent
- Table: asset name, purpose, legal basis pill, subject type, opt-in badge, created by
- **Add Record** button → modal (asset picker, purpose, legal basis, subject type, explicit consent toggle, opt-in toggle)

### Next.js API proxy routes
- `GET/POST /api/privacy/consent`
- `DELETE /api/privacy/consent/[id]`

---

## Section 6 — Data Residency

### Backend
**Model**: `DataResidencyPolicy` (see Section 1)  
**Router**: Add to `privacy.py`

| Endpoint | Purpose |
|---|---|
| `GET /privacy/residency` | List all residency policies |
| `POST /privacy/residency` | Create policy |
| `DELETE /privacy/residency/{id}` | Remove policy |

### Frontend — Residency tab
- Table: scope (asset or domain name), allowed regions, prohibited regions, sovereignty country, notes
- **Add Policy** button → modal (scope: asset or domain, allowed regions checkboxes, prohibited regions, sovereignty country)

### Next.js API proxy routes
- `GET/POST /api/privacy/residency`
- `DELETE /api/privacy/residency/[id]`

---

## Section 7 — Dynamic Masking in Evidence/Data Browser

The existing `masking_service.apply_masking(value, masking_type, user_role)` function handles redaction. The `GET /compliance/evidence/{mapping_id}` endpoint returns rule run data.

**Hook**: In `compliance.py:get_evidence`, after fetching run results, call `masking_service` to redact any column values where a `MaskingPolicy` exists for that asset+column and the requesting user's role is not in `unmasked_roles`.

**Scope**: Application-layer masking on evidence display. Not full SQL query-time interception (out of scope for this iteration — requires a query proxy service).

---

## Section 8 — Navigation

Add **"Privacy"** sidebar entry between **Compliance** and **Security** in `layout.tsx`, pointing to `/privacy`.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `migrations/versions/0026_privacy_compliance_tables.py` | Create |
| `app/db/models.py` | Add 3 new models (DSR, Consent, Residency) |
| `app/api/privacy.py` | Add DSR, consent, residency endpoints + evidence masking |
| `app/api/compliance.py` | Add `assess/all` endpoint + auto-map logic |
| `app/db/seed.py` | Add `auto_map_rules_to_controls()` |
| `app/main.py` | Call `auto_map_rules_to_controls` after seed |
| `frontend/src/app/privacy/page.tsx` | Create (4-tab page) |
| `frontend/src/app/api/privacy/masking-policies/route.ts` | Create |
| `frontend/src/app/api/privacy/masking-policies/[id]/route.ts` | Create |
| `frontend/src/app/api/privacy/pii-exposure/route.ts` | Create |
| `frontend/src/app/api/privacy/dsr/route.ts` | Create |
| `frontend/src/app/api/privacy/dsr/[id]/route.ts` | Create |
| `frontend/src/app/api/privacy/consent/route.ts` | Create |
| `frontend/src/app/api/privacy/consent/[id]/route.ts` | Create |
| `frontend/src/app/api/privacy/residency/route.ts` | Create |
| `frontend/src/app/api/privacy/residency/[id]/route.ts` | Create |
| `frontend/src/app/api/compliance/seed/route.ts` | Create |
| `frontend/src/app/api/compliance/[frameworkId]/assess-all/route.ts` | Create |
| `frontend/src/app/compliance/page.tsx` | Modify (Seed btn, Assess btn, KPI fix) |
| `frontend/src/app/layout.tsx` | Add Privacy nav link |
