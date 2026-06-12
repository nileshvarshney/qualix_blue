# Module 1: Issue Intake & Issue Lifecycle — Design

## Goal

Turn data quality failures (failed rule results, alerts, failed runs) and manual reports into trackable **Issues** with a real lifecycle (new → confirmed → in_progress → blocked → resolved → closed, with reopen), assignment to an owner/team, links back to the originating asset/source/rule/run/alert, and a full audit trail of state transitions. Purely additive — no existing routes, screens, or data contracts change.

## Background / Reuse Inventory

- `QualityIncident` (`app/db/models.py:718-733`, table `quality_incidents`) is a separate, existing "incident-ops" concept (TTD/TTR, oncall, runbooks) powering `/incidents` (`app/api/incidents.py`, `frontend/src/app/incidents/page.tsx`). **Not touched** — Issue is a new, parallel entity.
- `frontend/src/app/issues/page.tsx` already exists as a list UI (dataset-grouped, status/severity filters, stat cards, expandable rows, edit modal) but is fully mocked: it fetches `/api/issues` → `frontend/src/app/api/issues/route.ts` → backend `/incidents`, and fields like `rootCause`, `impact`, `recommendation`, `affectedColumns`, `activity` don't exist on the backend so render empty. The "+ Create Issue" button has no handler. This page is rewired, not rebuilt.
- `AuditLog` (`app/db/models.py:544-554`) — generic `entity_type`/`entity_id`/`action`/`old_value`/`new_value`/`user_email`/`created_at`. Reused as the Issue audit trail (no new table).
- `Team` (`app/db/models.py:1383+`, table `teams`) — used for `assigned_team_id`.
- `DQAlert` (`app/db/models.py:414-434`), `DQRule`, `DQRuleRun`, `Asset`, `Domain`/`Subdomain` — link targets for an Issue.
- API conventions: `app/api/alerts.py` and `app/api/incidents.py` — `GET` list with `Query()` filters, `_fmt_*()` formatter helpers, `get_current_user`, `get_domain_filter`/`check_domain_access`/`apply_domain_filter` from `app/core/security.py`, action sub-routes (`POST /{id}/acknowledge`, `POST /{id}/resolve`).
- Frontend conventions: dataset-grouped list with filter pills (`frontend/src/app/issues/page.tsx`), right-side slide-in detail panel (`frontend/src/app/incidents/page.tsx:203-243`, `AssetDetailPanel`), alert detail popup with action buttons (`frontend/src/app/alerts/page.tsx:469-520`), `AssetDetailPanel` tab bar (`frontend/src/components/asset-registry/AssetDetailPanel.tsx:41,74,118`) currently `overview | profiling | rules | quality | alerts | trends`.
- Migrations: Alembic, latest is `migrations/versions/0019_dimension_scores.py` → new migration is `0020_issues.py`.

## Data Model

New table `dq_issues`, model `Issue` in `app/db/models.py` (added near `QualityIncident`):

| Field | Type | Notes |
|---|---|---|
| `issue_id` | String(36) PK | `default=gen_uuid` |
| `title` | String(200) | required |
| `description` | Text | nullable |
| `issue_type` | String(20) | `rule_failure` \| `alert` \| `failed_run` \| `manual` |
| `status` | String(20) | `new` (default) \| `confirmed` \| `in_progress` \| `blocked` \| `resolved` \| `closed` \| `reopened` |
| `severity` | String(20) | `critical` \| `high` \| `medium` \| `low` |
| `domain_id` | String(36), nullable | copied from asset at creation |
| `subdomain_id` | String(36), nullable | copied from asset at creation |
| `asset_id` | String(36), FK `assets.asset_id`, nullable | |
| `source_id` | String(36), nullable | connection id, derived from asset |
| `rule_id` | String(36), nullable | no FK constraint (mirrors `DQAlert.rule_id` style) |
| `run_id` | String(36), nullable | |
| `alert_id` | String(36), nullable | |
| `assigned_team_id` | String(36), FK `teams.team_id`, nullable | |
| `assigned_to` | String(200), nullable | user email |
| `created_by` | String(200), nullable | user email |
| `created_at` | DateTime, `default=now` | |
| `updated_at` | DateTime, `default=now`, updated on every change | |
| `resolved_at` | DateTime, nullable | |
| `closed_at` | DateTime, nullable | |
| `reopen_count` | Integer, `default=0` | |
| `resolution_note` | Text, nullable | set on resolve/close |

Relations: `asset` (back-populates not required; simple FK is enough, following `DQAlert`'s pattern of plain FK ints/strings without heavy relationship wiring).

### Audit trail

No new table. Every create + status transition + edit writes one `AuditLog` row:
- `entity_type="issue"`, `entity_id=issue_id`
- `action`: `"create"`, `"status_change"`, `"update"`
- `old_value` / `new_value`: JSON dicts, e.g. `{"status": "new"}` → `{"status": "confirmed"}`
- `user_email` from `get_current_user`

## Lifecycle State Machine

```python
ISSUE_TRANSITIONS = {
    "new":        {"confirmed", "closed"},
    "confirmed":  {"in_progress", "closed"},
    "in_progress":{"blocked", "resolved", "confirmed"},
    "blocked":    {"in_progress"},
    "resolved":   {"closed", "reopened"},
    "closed":     {"reopened"},
    "reopened":   {"confirmed", "in_progress"},
}
```

- `POST /issues/{id}/transition` validates `new_status in ISSUE_TRANSITIONS[current_status]`, else `400`.
- `resolved` status sets `resolved_at`; `closed` sets `closed_at`; transitioning out of `resolved`/`closed` via `reopened` increments `reopen_count` and clears `resolved_at`/`closed_at`.
- `resolution_note` (optional body field) is stored when transitioning to `resolved` or `closed`.
- `POST /issues/{id}/reopen` is sugar for `transition(status="reopened")`, restricted to current status in `{resolved, closed}` — mirrors `incidents.py`'s dedicated `/investigate` and `/resolve` action endpoints.

## Backend API (new `app/api/issues.py`)

All endpoints under `get_current_user`; mutations require `require_write` (admin/data_steward/data_engineer — matches `rules.py`/`incidents.py` convention). Domain-scoped via `get_domain_filter`/`apply_domain_filter` on `Issue.domain_id` and `check_domain_access` on detail/mutation endpoints, same as `incidents.py`.

- `GET /issues` — filters: `status`, `severity`, `issue_type`, `asset_id`, `domain_id`, `rule_id`, `alert_id`, `run_id`, `assigned_team_id`, `assigned_to`; `limit`/`offset` pagination (`{total, limit, offset, items}`), default order `created_at desc`.
- `GET /issues/enriched` — same filters, left-joins `Asset` (+ `AssetSourceMeta` for table name), `DQRule` (rule name), `Team` (team name) so the frontend can render dataset/rule/team names without N+1 calls. Same response shape as `GET /alerts/enriched`.
- `GET /issues/stats` — counts grouped by `status` (for stat cards/badges), plus `open_count` = everything not in `{resolved, closed}`.
- `POST /issues` — body: `title` (required), `description`, `issue_type` (default `manual`), `severity` (default `medium`), `asset_id`, `rule_id`, `run_id`, `alert_id`, `assigned_team_id`, `assigned_to`. When `asset_id` given, `domain_id`/`subdomain_id`/`source_id` are derived server-side from `Asset`. Sets `status="new"`, `created_by=user.email`. Writes `AuditLog(action="create")`.
- `GET /issues/{id}` — full detail (all fields + resolved names for asset/rule/team via the enriched join).
- `PUT /issues/{id}` — editable fields: `title`, `description`, `severity`, `assigned_to`, `assigned_team_id`. Writes `AuditLog(action="update", old_value=..., new_value=...)` for changed fields only.
- `POST /issues/{id}/transition` — body `{status, resolution_note?}`; validates against `ISSUE_TRANSITIONS`; writes `AuditLog(action="status_change")`.
- `POST /issues/{id}/reopen` — body `{resolution_note?}` optional; only from `resolved`/`closed`; sets `status="reopened"`, increments `reopen_count`.
- `GET /issues/{id}/audit` — `AuditLog` rows where `entity_type="issue" and entity_id=issue_id`, ordered `created_at desc`. Thin wrapper, same shape as `app/api/audit.py`'s list response.

Registered in `app/main.py` alongside other §54-68 routers: `app.include_router(issues.router)`.

## Frontend Changes

### 1. `frontend/src/app/api/issues/route.ts` (rewrite)
- `GET` → proxies to backend `GET /issues/enriched` with query params passed through (status/severity/asset_id/etc.), `?limit=200` default.
- `POST` → proxies to backend `POST /issues`.
- `PUT` → proxies to backend `PUT /issues/{id}` (body contains `id` + editable fields).
- New file `frontend/src/app/api/issues/[id]/transition/route.ts` → `POST` proxies to `POST /issues/{id}/transition`.
- New file `frontend/src/app/api/issues/[id]/reopen/route.ts` → `POST` proxies to `POST /issues/{id}/reopen`.
- New file `frontend/src/app/api/issues/[id]/audit/route.ts` → `GET` proxies to `GET /issues/{id}/audit`.

### 2. `frontend/src/app/issues/page.tsx` (rewrite, same layout/skeleton)
- `Issue` type updated to match real fields: `id, title, description, issueType, status (7 states), severity (critical/high/medium/low), assetId, datasetName, ruleId, ruleName, runId, alertId, assignedTo, assignedTeamId, assignedTeamName, createdBy, createdAt, resolvedAt, closedAt, reopenCount`.
- `ST_CFG` extended to cover all 7 statuses with distinct colors; `STATUS_FLOW` replaced by server-driven valid-transition list (returned per-issue or computed client-side from the same `ISSUE_TRANSITIONS` map mirrored in TS).
- Stat cards: `New`, `In Progress` (confirmed+in_progress+blocked+reopened), `Resolved`, `Closed`, `Critical` (open, severity critical) — keep the 4-card grid, relabeled.
- Row click → opens **Issue Detail slide-in** (new component `frontend/src/components/issues/IssueDetailPanel.tsx`) instead of inline expansion:
  - Header: severity + status badges, title, close button.
  - Meta grid: Asset (link → asset registry detail), Rule (link → rules), Run (link → `/rule-runs/{runId}`), Alert (link → alerts), Assigned Team/Owner, Created by/at.
  - Description section.
  - Status transition buttons computed from `ISSUE_TRANSITIONS[status]`; `resolved`/`in_progress→resolved` and `*→closed` prompt for optional `resolution_note`.
  - Reopen button when `status in {resolved, closed}`.
  - Activity/audit trail section fed by `GET /api/issues/{id}/audit`, rendered as a timeline (reuses the activity-list visual pattern from the current mock).
  - Edit action (title/description/severity/assignee/team) — opens the existing edit modal, wired to `PUT`.
- "+ Create Issue" button opens a real **Create Issue modal** (`frontend/src/components/issues/CreateIssueModal.tsx`): title, description, severity, issue_type=`manual`, optional asset picker (reuses asset search if available, else text input + `asset_id`). On submit → `POST /api/issues`, then refresh list.
- Loading / empty / error states added for list fetch and detail fetch (currently list has loading/empty only, no error state).

### 3. `frontend/src/components/issues/CreateIssueModal.tsx` (new, shared)
Reusable modal taking optional prefill props: `{ assetId?, ruleId?, runId?, alertId?, issueType?, severity?, title?, domainId? }`. Used by:
- `/issues` page (manual creation, no prefill).
- Alerts page (prefilled from alert).

### 4. Alerts page (`frontend/src/app/alerts/page.tsx`)
- In the alert detail popup (around line 510, alongside "Acknowledge"/"View Run"), add a **"Create Issue"** button. Opens `CreateIssueModal` prefilled with `issueType="alert"`, `alertId=popupAlert.id`, `assetId`, `ruleId`, `runId`, `severity`, `title=popupAlert.rule` (or message), `domainId`.
- On successful creation, show a small inline confirmation (e.g. "Issue ISS-xxx created") and optionally a link to `/issues?...` — no page redirect, stays additive.

### 5. Asset Detail Panel (`frontend/src/components/asset-registry/AssetDetailPanel.tsx`)
- Extend `Tab` type to `'overview' | 'profiling' | 'rules' | 'quality' | 'alerts' | 'trends' | 'issues'`, add to the tab bar array (line 118).
- New tab content block (mirrors the `alerts`/`trends` tab blocks at lines 206-215): renders `frontend/src/components/asset-registry/AssetIssuesTab.tsx` (new) — fetches `GET /api/issues?asset_id={assetId}`, lists issues with status/severity badges and click → reuses `IssueDetailPanel` slide-in, plus a "Create Issue" button (prefilled `assetId`, `domainId`, `subdomainId`).
- Tab label shows an open-issue count badge when `>0` (e.g. `Issues (3)`), following the existing badge styling conventions used elsewhere (small pill, `--status-error-bg`/`--status-error-text`).

### 6. Sidebar (`frontend/src/components/Sidebar.tsx`)
- No structural change — `/issues` already maps to the `quality` section (line 238). Optionally surface an open-issue count badge next to the "Issues" nav label if a lightweight global count is easy to fetch (reuse `/api/issues?status=new` count or `/issues/stats`); if this adds meaningful complexity, skip for v1 — not required by the design.

## Files to Modify
- `app/db/models.py` — add `Issue` model + `ISSUE_TRANSITIONS` constant (or place constant in `app/api/issues.py`)
- `app/main.py` — register `issues.router`
- `frontend/src/app/issues/page.tsx` — rewrite with real data + slide-in detail
- `frontend/src/app/api/issues/route.ts` — rewrite to proxy real backend
- `frontend/src/app/alerts/page.tsx` — add "Create Issue" button in alert popup
- `frontend/src/components/asset-registry/AssetDetailPanel.tsx` — add `issues` tab

## Files to Create
- `migrations/versions/0020_issues.py` — create `dq_issues` table
- `app/api/issues.py` — backend routes
- `frontend/src/components/issues/IssueDetailPanel.tsx`
- `frontend/src/components/issues/CreateIssueModal.tsx`
- `frontend/src/components/asset-registry/AssetIssuesTab.tsx`
- `frontend/src/app/api/issues/[id]/transition/route.ts`
- `frontend/src/app/api/issues/[id]/reopen/route.ts`
- `frontend/src/app/api/issues/[id]/audit/route.ts`

## Files Explicitly Not Touched
- `app/db/models.py::QualityIncident`, `OncallSchedule`, `IncidentRunbook`
- `app/api/incidents.py`, `frontend/src/app/incidents/page.tsx`
- `app/api/alerts.py` (alert routes/lifecycle unchanged — only frontend popup gets a new button)
- `frontend/src/app/api/alerts/route.ts`
- Any rule-run detail page (`/rule-runs/[runId]`) — fast-follow, not in this pass

## Regression Checklist
- `/incidents` page and stats still work unchanged (separate table, separate router).
- `/alerts` existing acknowledge/resolve/ignore flows unaffected.
- Asset Detail Panel existing tabs (overview/profiling/rules/quality/alerts/trends) render unchanged for both leaf and non-leaf assets.
- `/issues` page degrades to a real empty state ("No issues yet") rather than mock/blank data when `dq_issues` is empty.
- New migration runs cleanly on top of `0019_dimension_scores.py`.
- Domain-scoped users (`domain_owner`) only see issues within their domain via `apply_domain_filter`.

## Final Visible UI Changes
- `/issues` page now backed by real data, all 7 lifecycle states with badges, working "+ Create Issue", working filters/stat cards.
- Clicking an issue opens a right-side detail panel with linked entities, status controls, reopen, and an activity/audit trail.
- Alerts detail popup gains a "Create Issue" button.
- Asset Detail Panel gains an "Issues" tab with count badge and its own "Create Issue" button.

## Final User Flows Now Working
- Create issue from a failed-rule alert (Alerts → alert detail → Create Issue).
- Create issue manually (Issues page → + Create Issue).
- Create issue from an asset's Issues tab.
- List, filter, and open issue detail.
- Change issue status through the full lifecycle (new → confirmed → in_progress → blocked → resolved → closed), including reopen.
- Navigate from an issue to its linked asset / rule / run / alert.
