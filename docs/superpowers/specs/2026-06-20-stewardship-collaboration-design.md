# Stewardship & Collaboration — Design Spec
Date: 2026-06-20

## Problem

Six gaps prevent DataGuard from being the single source of truth for data stewardship work:

1. Ownership Coverage KPI shows "—" — `avgOwnership` is computed but never rendered
2. No frontend API proxy for the existing backend `/comments` endpoint
3. No comment threads on any entity — all investigation context leaks to Slack/email
4. No stewardship task queue — stewards have no single view of pending work
5. Approval workflows visible in UI only for glossary terms — `pending_review` rules, pending contracts, data products invisible
6. No hub to coordinate investigation across entities

## Approach

Option A: dedicated `/stewardship` hub page + `EntityComments` embedded in detail panels. Backend APIs (comments, approvals, scorecards, rules) are already complete — this is a pure frontend build.

---

## Architecture

### New files

| Path | Purpose |
|---|---|
| `frontend/src/app/api/comments/route.ts` | GET / POST proxy → `BACKEND/comments` |
| `frontend/src/app/api/comments/[id]/route.ts` | PUT / DELETE proxy |
| `frontend/src/app/api/comments/[id]/resolve/route.ts` | POST resolve proxy |
| `frontend/src/components/EntityComments.tsx` | Reusable collapsible thread component |
| `frontend/src/app/stewardship/page.tsx` | Stewardship hub page |

### Modified files

| Path | Change |
|---|---|
| `frontend/src/components/ui/SectionTabBar.tsx` | Add `{ href: '/stewardship', label: 'Stewardship' }` to `govern` section |
| `frontend/src/app/governance/page.tsx` | Render Ownership Coverage KPI tile; add `rule` filter to Approvals tab |
| `frontend/src/app/issues/page.tsx` | Embed `EntityComments` at bottom of issue detail panel |
| `frontend/src/app/anomalies/page.tsx` | Embed `EntityComments` at bottom of anomaly detail panel |
| `frontend/src/app/glossary/page.tsx` | Embed `EntityComments` at bottom of glossary term detail panel |
| `frontend/src/app/settings/page.tsx` | Update gap descriptions to reflect newly built features |

### Data flow

```
EntityComments
  props: entityType, entityId, currentUser
  on expand → GET /api/comments?entity_type=X&entity_id=Y
  on post   → POST /api/comments { entity_type, entity_id, body, parent_id? }
  on resolve → POST /api/comments/{id}/resolve

/stewardship page fetches (parallel):
  GET /api/governance/scorecards               → ownership coverage panel
  GET /api/governance/approvals?status=pending → task queue (governance entities)
  GET /api/rules                               → all rules; filter client-side for status === 'pending_review'
  GET /api/comments?limit=30                  → recent discussions feed
```

Note: The frontend `/api/rules` proxy calls `/rules/enriched` and does not forward a `status` query param. Filtering for `pending_review` rules must happen client-side after fetching all rules. No change to the rules proxy required.

No backend changes required.

---

## Component: `EntityComments`

### Props

```ts
interface EntityCommentsProps {
  entityType: string
  entityId: string
  currentUser: { email: string; name: string; role: string } | null
}
```

### Visual structure

```
▼ Discussion (3)                          [collapse toggle, lazy-loads on first expand]
  ──────────────────────────────────────────────────────
  [A] alice@co.com  Jun 18, 2:14pm
      Investigated this anomaly — upstream delay from ETL job.
      ↩ Reply   ✓ Resolve

      └─ [B] bob@co.com  Jun 18, 2:31pm
             Confirmed, ticket filed in Jira #4421.

  ──────────────────────────────────────────────────────
  [  Add a comment...                                  ]
  [                                          Post      ]
```

### Behaviour rules

- **Collapsed by default.** Label shows comment count; "Discussion" if count unknown (before first load).
- **Lazy load.** First expand triggers `GET /api/comments?...`. Subsequent expands use cached state (no re-fetch unless page reloads).
- **Replies.** Reply button sets `replyTo` state; the compose box shows "Replying to @author" and submits with `parent_id`. Replies render indented under their parent.
- **Resolve.** `POST /api/comments/{id}/resolve` marks top-level thread resolved. Resolved threads render faded (opacity 0.45) with a green "✓ resolved" badge and collapse their replies by default.
- **Optimistic UI.** New comment appended immediately; rolled back on POST failure with an inline error message.
- **Styling.** Uses existing CSS variables only (`--surface`, `--surface-muted`, `--border`, `--text-muted`, `--text-secondary`, `--foreground`, `--accent`, `--status-ok-*`). No new CSS.
- **No @mentions in v1.** Body is plain text. Parsing can be layered on later.

---

## Page: `/stewardship`

Tab placement: `govern` section, after `{ href: '/governance', label: 'Governance' }`.

### Panel 1 — Ownership Coverage

- Header: "Ownership Coverage" + aggregate badge "Avg: 68%" (or "—" if no data)
- Fetches `/api/governance/scorecards`
- One tile per domain, sorted ascending by ownership score (worst first)
- Each tile: domain icon + name, ownership % with coloured progress bar (red <75, amber 75–89, green ≥90)
- "Fix →" link per tile: navigates to `/governance` (scorecards tab)
- Empty state: "No domain scorecards yet — add domains in Asset Registry first"

### Panel 2 — Stewardship Task Queue

- Header: "Pending Tasks" + count badge
- Two fetches in parallel: `/api/governance/approvals?status=pending` and `/api/rules` (filtered client-side for `status === 'pending_review'`)
- Each row: entity type badge | entity name | requestor | age ("3 days ago") | "→ Review" link
- Governance entities link to `/governance` (approvals tab)
- Rules link to `/rules`
- Sorted oldest-first
- Empty state: "No pending tasks — all caught up"

### Panel 3 — Recent Discussions

- Header: "Recent Discussions"
- Fetches `/api/comments?limit=30`
- Groups by entity (`entity_type` + `entity_id`)
- Each group row: entity type badge | entity label (e.g. "Issue #42") | last comment excerpt (truncated 80 chars) | author | timestamp | unresolved count badge
- Clicking a row navigates to the entity's page:
  - `issue` → `/issues`
  - `anomaly` → `/anomalies`
  - `glossary_term` → `/glossary`
  - `dataset` → `/datasets`
  - fallback: no navigation
- Empty state: "No discussions yet — comments on issues, anomalies, and glossary terms appear here"

---

## Governance Page Fixes

### Fix 1 — Ownership Coverage KPI tile

`avgOwnership` is already computed on line 334 but not rendered. Expand the existing 4-tile KPI row to 5 tiles by inserting "Ownership Coverage" as tile index 1 (after Governance Score):

```
| Governance Score | Ownership Coverage | Policies Active | Open Violations | High Severity |
```

Value: `avgOwnership !== null ? avgOwnership + '%' : '—'`
Grid changes: `repeat(4,1fr)` → `repeat(5,1fr)`.

### Fix 2 — Approvals tab: `rule` filter

Add `rule` to the filter button list in the Approvals tab. When selected:
- Fetch `/api/rules` and filter client-side for `status === 'pending_review'`
- Render each rule using the same row layout
- Entity type badge = "rule"
- No inline approve/reject buttons — show a "→ Rules" link that navigates to `/rules`

---

## Issues & Anomalies & Glossary Integration

In each page's detail panel, append `EntityComments` after the last existing field, separated by a `1px solid var(--border)` divider:

| Page | `entityType` | `entityId` |
|---|---|---|
| Issues | `"issue"` | issue `id` |
| Anomalies | `"anomaly"` | anomaly `id` |
| Glossary | `"glossary_term"` | term `term_id` |

`currentUser` is sourced from the existing `/api/me` fetch each page already performs.

Existing detail panel content is untouched — `EntityComments` is purely additive.

---

## Settings Page Update

The gaps description for "Stewardship & Collaboration" (line ~483) is updated to reflect:
- Ownership Coverage KPI now calculated from real scorecard data
- Comments and discussion threads now available on issues, anomalies, and glossary terms
- Stewardship task queue now available at `/stewardship`
- Approval workflows now visible for rules, policies, contracts, data products, domain ownership

Remaining honest gaps (not built in this sprint):
- No @mentions or push notifications
- No stewardship tasks beyond the approval/pending-review queue (no custom task creation)
- Comments not yet on datasets, lineage nodes, or contracts

---

## Out of scope

- Backend changes (all APIs already exist)
- @mentions / push notifications
- Custom task creation (task queue is read-only derived from approvals + pending rules)
- Comments on datasets, lineage nodes, contracts (can be added with zero model changes — just pass different `entityType`)
