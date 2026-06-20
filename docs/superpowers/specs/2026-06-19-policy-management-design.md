# Policy Management — Complete Design Spec
**Date:** 2026-06-19  
**Status:** Approved  
**Approach:** Shared Approval Engine (Approach B)

---

## Problem Statement

The existing policy management system has five gaps:

1. The "enforced" label is a display tag only — no engine blocks non-conforming data or re-evaluates rules automatically
2. No approval queue for policies — rules are created directly as active with no review step
3. No approval workflows for data products, domain ownership assignments, or contract creation
4. No policy versioning or change history
5. No notifications when a policy is violated

---

## Decisions

| Gap | Decision |
|---|---|
| Enforcement | Scheduled sweeps (every 6h) + real-time blocking at write time |
| Approval | Admin OR domain owner can approve (same as glossary terms) |
| Notifications | In-app bell + email to asset owner_email |
| Versioning | Full audit log with field-level diffs on every approved version |
| Other approvals | Data products, domain ownership, contracts — same shared queue |

---

## Section 1 — Data Model

### New Tables

#### `ApprovalRequest`
```
approval_id       UUID PK
entity_type       VARCHAR  -- "policy" | "contract" | "domain_ownership" | "data_product" | "glossary_term"
entity_id         VARCHAR  -- FK to the entity's PK (string to support all entity types)
entity_snapshot   VARIANT  -- full JSON snapshot of entity at request time
status            VARCHAR  -- "pending" | "approved" | "rejected"
requested_by      VARCHAR  -- user email
reviewed_by       VARCHAR  -- nullable, set on approve/reject
feedback          TEXT     -- nullable, reviewer's note on rejection
created_at        TIMESTAMP
reviewed_at       TIMESTAMP  -- nullable
```

#### `GovernancePolicyVersion`
```
version_id        UUID PK
policy_id         UUID FK → GovernancePolicy
version_number    INTEGER  -- monotonically increasing per policy, starting at 1
changed_by        VARCHAR  -- user email of approver
changed_at        TIMESTAMP
change_summary    VARCHAR  -- human-readable summary, e.g. "severity changed"
field_diffs       VARIANT  -- [{ "field": str, "old_value": any, "new_value": any }, ...]
snapshot          VARIANT  -- full policy JSON at this approved version
```

#### `Notification`
```
notification_id   UUID PK
user_email        VARCHAR  -- recipient
type              VARCHAR  -- "violation_detected" | "approval_requested" | "approval_decided"
title             VARCHAR
body              TEXT
entity_type       VARCHAR  -- what triggered it
entity_id         VARCHAR
is_read           BOOLEAN  DEFAULT false
email_sent        BOOLEAN  DEFAULT false
created_at        TIMESTAMP
```

### Existing Model Changes

| Model | Change |
|---|---|
| `GovernancePolicy` | Add `status` field: `"draft"` \| `"pending_review"` \| `"active"` \| `"rejected"` |
| `DataContract` | Expand `status` to include `"pending_review"` |
| `Asset` | No change — ownership tracked via existing `owner_email` |

---

## Section 2 — Enforcement Engine

### Scheduled Sweeps

- `APScheduler` job registered at FastAPI startup
- Calls existing `evaluate_policies()` on a configurable interval
- Interval controlled by `POLICY_EVAL_INTERVAL_HOURS` env var (default: 6)
- After each sweep, newly-opened violations trigger `NotificationService`
- The manual "Evaluate" button in the UI is retained as a secondary trigger

### Real-time Blocking

New `app/services/enforcement_service.py` with one public function:

```python
def check_enforcement(entity_type: str, entity_id: str, db) -> EnforcementResult:
    """
    Returns EnforcementResult with:
      - blocked: bool
      - blocking_violations: list of violated policy names
      - warnings: list of advisory violations (medium/low severity)
    """
```

**Called before write commits on:**
- `PUT /assets/{id}` — checks `owner_required`, `stale_description`, `certification_required`
- `POST /rules` and `DELETE /rules/{id}` — checks `no_rules_defined`
- `POST /contracts` — checks contract-level enforced policies

**Blocking rules:**
- Policies with `severity="high"` or `severity="critical"` AND `status="active"` → HTTP 422 with structured error listing violated policies
- `severity="medium"` or `severity="low"` → warning in response body, write proceeds
- Policies in `"pending_review"` or `"draft"` status → never block

**UI badge updates:**
- Enforced + high/critical severity → red "Blocking" badge
- Enforced + medium/low severity → yellow "Advisory" badge
- Draft or pending → grey badge

---

## Section 3 — Approval Queue

### New Endpoints (`/governance/approvals`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/governance/approvals` | List requests; filterable by `entity_type`, `status`, `requested_by` |
| `POST` | `/governance/approvals` | Create request; captures snapshot; sets entity to `pending_review` |
| `POST` | `/governance/approvals/{id}/approve` | Approve; activate entity; write policy version if policy; fire notification |
| `POST` | `/governance/approvals/{id}/reject` | Reject with feedback; set entity back to `draft`; fire notification |

**Authorization:** Caller must have `role=admin` or `role=domain_owner` to approve/reject. Returns HTTP 403 otherwise.

### Approval Trigger Points

| Action | Creates approval request? |
|---|---|
| Create or edit a GovernancePolicy | Yes → policy goes to `pending_review` |
| Create or edit a DataContract | Yes → contract goes to `pending_review` |
| Assign domain ownership | Yes → ownership assignment goes to `pending_review` (note: no formal DomainOwnership model exists; the triggering action is `PUT /assets/{id}` with a changed `owner_email` — the approval wraps that update) |
| Create or publish a Data Product | Yes → data product goes to `pending_review` |
| Glossary term submission | Migrated to use same ApprovalRequest table |

### Frontend — "Approvals" Tab

- Existing "Pending" tab renamed to "Approvals"
- Unified queue shows all entity types in one list
- Columns: Entity Type badge | Name | Submitted By | Domain | Submitted Date | Actions
- Filters: All | Policies | Contracts | Domain Ownership | Data Products | Glossary Terms
- Reject modal (already built for glossary) reused for all entity types

---

## Section 4 — Policy Versioning

### When Versions Are Created

- A `GovernancePolicyVersion` row is written on every `approve` action where `entity_type="policy"`
- `version_number` = `MAX(version_number) + 1` for that `policy_id`, starting at 1
- `field_diffs` is computed by diffing the incoming `entity_snapshot` against the previous version's `snapshot`
- Only changed fields appear in the diff array
- `snapshot` stores the full policy JSON at the approved version

### New Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/governance/policies/{id}/versions` | All versions for a policy, newest-first |
| `GET` | `/governance/policies/{id}/versions/{num}` | Full snapshot + field diffs for a specific version |

**No rollback in v1** — view-only history. Rollback is a follow-on feature.

### Frontend

- Policy detail side panel gets a new "History" tab (alongside existing violations)
- History tab shows a timeline: Version # | Changed By | Changed At | Change Summary
- Expanding a version row reveals field-level diff table: Field | Old Value | New Value
- No separate page — all within the existing side panel

---

## Section 5 — Notification Service

### Backend — `app/services/notification_service.py`

**Public API:**

```python
def create_notification(
    user_email: str,
    type: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: str,
    db,
) -> None:
    """Writes Notification row. Fires email in a daemon thread (works in both
    request context and APScheduler jobs — no BackgroundTasks dependency)."""

def send_email(to: str, subject: str, body: str) -> None:
    """Sends via SMTP. Silently skips if env vars are missing."""
```

Email is dispatched via `threading.Thread(target=send_email, daemon=True).start()` so it never blocks the caller and works equally in FastAPI request handlers and scheduled jobs.

**SMTP env vars:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`  
If any are absent, `email_sent` stays `False` — in-app notification still created.

### Notification Trigger Table

| Trigger | Recipient | Type |
|---|---|---|
| New violation detected (sweep or real-time block) | Asset `owner_email` | `violation_detected` |
| Approval request created | Admins + domain owners of the entity's domain | `approval_requested` |
| Policy/contract/product approved | Submitter (`requested_by`) | `approval_decided` |
| Policy/contract/product rejected | Submitter (`requested_by`) | `approval_decided` |

### New Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | Unread notifications for current user (from auth header) |
| `POST` | `/notifications/{id}/read` | Mark single notification as read |
| `POST` | `/notifications/read-all` | Mark all as read for current user |

### Frontend

- Bell icon added to top nav with unread count badge
- Dropdown panel shows last 20 notifications grouped by Today / Earlier
- Row format: Type icon | Title | Body snippet | Timestamp
- Clicking a row navigates to the relevant entity
- "Mark all read" button at top of dropdown
- Polls `/api/notifications` every 60 seconds to refresh unread count

---

## Component Map

```
app/
├── db/
│   └── models.py                    -- +ApprovalRequest, +GovernancePolicyVersion, +Notification
├── api/
│   ├── governance.py                -- +/approvals endpoints, +/policies/{id}/versions endpoints
│   └── notifications.py             -- NEW: GET, POST /read, POST /read-all
└── services/
    ├── governance_service.py        -- +scheduler setup, evaluate_policies triggers notifications
    ├── enforcement_service.py       -- NEW: check_enforcement()
    └── notification_service.py      -- NEW: create_notification(), send_email()

frontend/src/app/
├── api/
│   ├── governance/
│   │   ├── approvals/route.ts       -- NEW proxy
│   │   └── policies/[id]/versions/route.ts  -- NEW proxy
│   └── notifications/route.ts       -- NEW proxy
└── governance/
    └── page.tsx                     -- "Pending" tab → "Approvals" tab (unified queue)
                                     -- Policy side panel +History tab
                                     -- Bell icon + dropdown in nav
                                     -- Enforcement badge updates
```

---

## Out of Scope (v1)

- Policy rollback to a prior version
- Slack notifications (infrastructure for `notification_slack_channel` exists in SLA_CONFIGS but not wired)
- Webhook delivery for violations
- Approval delegation or escalation rules
- Multi-step approval chains (e.g., domain owner then admin)
