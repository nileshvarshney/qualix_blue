# Glossary Term Approval Workflow

**Date:** 2026-06-18  
**Status:** Approved  
**Scope:** Glossary page + Governance page

---

## Overview

Adds a `draft → pending_review → active` approval workflow to glossary terms, mirroring the existing DQ Rules pattern. Any authenticated user can submit a term for review; only `admin` and `domain_owner` roles can approve or reject. Rejection returns the term to `draft` with a required review note visible to the author.

---

## State Machine

```
draft  ──[submit]──▶  pending_review  ──[approve]──▶  active
                              │
                           [reject (with note)]
                              │
                              ▼
                            draft
```

- `draft` → any auth'd user can submit → `pending_review`
- `pending_review` → admin or domain_owner approves → `active`
- `pending_review` → admin or domain_owner rejects (note required) → `draft`
- Domain owners may only act on terms whose `domain_id` matches their assigned domain, or terms with no domain. Admins have no restriction.

---

## Backend Changes

### 1. `GlossaryTerm` model — 3 new fields (`app/db/models.py`)

```python
reviewed_by:  Optional[str]      # email of who approved/rejected
review_note:  Optional[str]      # rejection reason or approval comment
reviewed_at:  Optional[datetime]
```

### 2. Three new endpoints (`app/api/glossary.py`)

#### `POST /glossary/terms/{term_id}/submit`
- Auth: any authenticated user
- Validates: term is in `draft` status
- Transitions: `draft → pending_review`
- Clears: `reviewed_by`, `review_note`, `reviewed_at` (fresh submission)
- Writes: `AuditLog(action="SUBMIT", entity_type="glossary_term")`

#### `POST /glossary/terms/{term_id}/approve`
- Auth: `admin` or `domain_owner` only
- Domain owner check: term's `domain_id` must match user's `domain_id` (or term has no domain)
- Validates: term is in `pending_review` status
- Transitions: `pending_review → active`
- Sets: `reviewed_by = user.email`, `reviewed_at = now()`; clears `review_note`
- Writes: `AuditLog(action="APPROVE", entity_type="glossary_term")`

#### `POST /glossary/terms/{term_id}/reject`
- Auth: `admin` or `domain_owner` only
- Domain owner check: same as approve
- Validates: term is in `pending_review` status; `review_note` is required (non-empty)
- Transitions: `pending_review → draft`
- Sets: `reviewed_by = user.email`, `review_note = payload.review_note`, `reviewed_at = now()`
- Writes: `AuditLog(action="REJECT", entity_type="glossary_term")`

### 3. Updated `_fmt_term` helper
Return the three new fields in every term response: `reviewed_by`, `review_note`, `reviewed_at`.

---

## Frontend — Next.js API Layer

### New file: `src/app/api/me/route.ts`
- `GET` — proxies to `GET /auth/me` on the backend
- Returns: `{ role, domain_id, email, full_name }`

### New file: `src/app/api/glossary/[termId]/route.ts`
- `POST` with `?action=submit|approve|reject` — proxies to the corresponding backend endpoint
- Forwards `review_note` from request body for reject action

---

## Frontend — Glossary Page (`src/app/glossary/page.tsx`)

### State additions
- `currentUser: { role: string; domain_id: string | null } | null` — fetched from `/api/me` on mount
- `rejectTarget: GlossaryTerm | null` — term currently being rejected (drives reject dialog visibility)
- `rejectNote: string` — controlled input for reject dialog
- `actionLoading: string | null` — term ID currently being actioned (disables buttons)

### Data model additions
- `GlossaryTerm` interface gains: `reviewedBy`, `reviewNote`, `reviewedAt`
- Mapping: `reviewed_by → reviewedBy`, `review_note → reviewNote`, `reviewed_at → reviewedAt`

### CSS variable addition (`src/app/globals.css`)
Add `--status-info-*` (blue) for `pending_review` — distinct from `draft` which already uses `--status-warn-*` (amber):
```css
/* light */
--status-info-bg:  #eff6ff;   --status-info-text: #1d4ed8;
/* dark */
--status-info-bg:  rgba(59, 130, 246, 0.15);  --status-info-text: #60a5fa;
```

### Status treatment
| Status | Badge color | Left border |
|---|---|---|
| `active` | green (`--status-ok-*`) | green |
| `pending_review` | blue (`--status-info-*`) | blue |
| `draft` | amber (`--status-warn-*`) | amber |
| `deprecated` | muted (`--status-neutral-*`) | `--border` |

`statusLabel()` maps `pending_review → "pending review"` for display.

### Action buttons per row (alongside Edit / Delete)

| Term status | All users | Admin / domain_owner |
|---|---|---|
| `draft` | Submit for Review | — |
| `pending_review` | — | Approve · Reject |
| `active` / `deprecated` | — | — |

`isReviewer` = `currentUser.role === 'admin' || currentUser.role === 'domain_owner'`

### Reject dialog
- Triggered by clicking Reject on any `pending_review` term
- Small centered modal (same style as Edit modal)
- Required `<textarea>` for review note; Reject button disabled until non-empty
- On confirm: calls `/api/glossary/[termId]?action=reject` with `{ review_note }`
- On success: updates term in local state to `draft` + stores `review_note`

### Slide-in detail panel addition
When `term.status === 'draft'` and `term.reviewNote` is non-empty, render a callout:
> **Returned with feedback**  
> `{term.reviewNote}`  
> — `{term.reviewedBy}` on `{term.reviewedAt}`

Callout uses amber/warn styling, disappears once term is resubmitted.

### Status filter pills update
Add `pending_review` as a new filter option: `All | Approved | Pending Review | Draft | Deprecated`

---

## Frontend — Governance Page (`src/app/governance/page.tsx`)

### New tab: `pending`
Added to `GovernanceTab` type: `'scorecards' | 'policies' | 'violations' | 'pending'`

Tab label displays live count badge: **Pending (N)** where N = count of `pending_review` terms.

### Data fetching
Governance page fetches glossary terms from `/api/glossary` on mount (same endpoint as Glossary page). Filters client-side to `status === 'pending_review'` for the pending tab. Re-fetches after any approve/reject action.

### Pending tab layout
Compact grid: `1fr 140px 90px 100px 140px`

Columns: **Term** (name + definition excerpt + domain badge) | **Submitted by** | **Domain** | **Submitted** (relative time) | **Actions**

### Actions
- **Approve** — one click, no confirmation. Calls `/api/glossary/[termId]?action=approve`.
- **Reject** — opens a reject dialog implemented inline in the governance page (same structure as the glossary page's reject dialog; no shared component needed since the codebase has no shared component pattern).
- Both buttons hidden for `viewer` / `auditor` roles (read-only view still shown).

### Empty state
"No terms pending review" centered in the tab body.

---

## Error Handling

- 403 from backend (role mismatch) → show inline error toast: "You don't have permission to perform this action"
- 400 from backend (wrong status transition) → show: "This term is no longer in the expected state — refresh and try again"
- Network failure → show: "Action failed — please try again"

No retries. All errors are surfaced inline, not silently swallowed.

---

## Audit Trail

Every state transition writes an `AuditLog` row with:
- `action`: `SUBMIT` | `APPROVE` | `REJECT`
- `entity_type`: `glossary_term`
- `entity_id`: `term_id`
- `user_email`: acting user
- `old_value`: `{ status: previous_status }`
- `new_value`: `{ status: new_status, reviewed_by?, review_note? }`

These appear in the existing Audit Logs page automatically.

---

## Files Changed

| File | Change |
|---|---|
| `app/db/models.py` | Add 3 fields to `GlossaryTerm` |
| `app/api/glossary.py` | Add `/submit`, `/approve`, `/reject` endpoints; update `_fmt_term` |
| `frontend/src/app/globals.css` | Add `--status-info-bg` / `--status-info-text` CSS vars (light + dark) |
| `frontend/src/app/api/me/route.ts` | New — proxy to `/auth/me` |
| `frontend/src/app/api/glossary/[termId]/route.ts` | New — proxy submit/approve/reject |
| `frontend/src/app/glossary/page.tsx` | Add workflow UI, status filter update |
| `frontend/src/app/governance/page.tsx` | Add Pending tab with approve/reject actions |
