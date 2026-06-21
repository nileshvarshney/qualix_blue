# Enterprise Capability Assessment — Gap Closure Design

**Date:** 2026-06-21
**Status:** Approved — ready for implementation planning
**Goal:** Close the highest-impact gaps in the Enterprise Capability Assessment, promoting Metadata & Catalog from PARTIAL → BUILT and reducing gaps in three other capability areas.

---

## Approach

Enterprise impact order (C): tackle gaps that produce the most PARTIAL → BUILT promotions first, using only the Next.js frontend + proxy layer. Backend-engine gaps (real enforcement, WebSocket push, tamper-evident storage) are handled at the proxy layer where possible; where not possible, they are noted as "requires backend service" and left for a future backend sprint.

---

## Batch 1 — Metadata & Catalog → BUILT

**Target:** Promote Metadata & Catalog from PARTIAL to BUILT.

### Item 1: Glossary term count badges on Catalog list rows

**File:** `frontend/src/app/catalog/page.tsx`

- New proxy route: `GET /api/glossary/bulk-asset-links?asset_ids=id1,id2,...`
  - File: `frontend/src/app/api/glossary/bulk-asset-links/route.ts`
  - Proxies to backend `GET /glossary/assets/bulk?asset_ids=...`
  - Falls back to parallel individual `/glossary?asset_id={id}` calls if bulk endpoint unavailable
  - Returns: `{ [assetId]: [{ term_id: string, name: string }] }`
- Fetch in background after assets load (same pattern as `/api/catalog/sensitivity` batch fetch)
- State: `const [termLinks, setTermLinks] = useState<Record<string, { term_id: string; name: string }[]>>({})`
- `TableRow` component: add 10th column "Terms"
  - If `termLinks[asset.asset_id]?.length > 0`: render pill `N terms` in accent color
  - If `0` or not yet loaded: render `—`
  - Clicking the pill: open a small inline popover listing term names; each name is a link to `/glossary?term=<term_id>`
- Grid template: extend from `'28px 220px 1fr 110px 80px 70px 55px 60px 65px'` to `'28px 220px 1fr 110px 80px 70px 55px 60px 65px 60px'`
- Column header row: add `'Terms'` to the headers array
- Popover: absolutely positioned div anchored to the badge, closes on outside click (use `useRef` + `useEffect` for click-outside)

### Item 2: Sensitivity badges in Asset Registry tree panel

**Files:**
- `frontend/src/components/asset-registry/AssetTreePanel.tsx` — add batch sensitivity fetch
- New shared component: `frontend/src/components/asset-registry/SensitivityBadge.tsx`

- Extract the `SENS_STYLE` map and badge rendering from `catalog/page.tsx` into `SensitivityBadge.tsx`:
  ```tsx
  export function SensitivityBadge({ classification }: { classification: string | null | undefined }) { ... }
  ```
- In `AssetTreePanel`, after the asset list loads, POST asset IDs to `/api/catalog/sensitivity` (already exists)
- Store result in `const [sensitivities, setSensitivities] = useState<Record<string, { classification: string | null; count: number }>>({})`
- In each leaf-node row rendering, append `<SensitivityBadge classification={sensitivities[asset.asset_id]?.classification} />`
- Also update `catalog/page.tsx` to import and use `SensitivityBadge` instead of its inline badge rendering

### Item 3: Domain + Sensitivity in Catalog bulk edit bar

**File:** `frontend/src/app/catalog/page.tsx`

- Extend `bulkPatch` state type: add `domain_name?: string` and `sensitivity?: string`
- Add to `applyBulk()`: include `domain_name` and `sensitivity` in the patch object if set
- Add two selects to the bulk action bar:
  - `Domain…`: options fetched from `/api/domains` on component mount (already called in governance/other pages), stored in `const [domains, setDomains] = useState<string[]>([])`
  - `Sensitivity…`: static options — PHI, PII, RESTRICTED, CONFIDENTIAL, SENSITIVE, PUBLIC
- Both sent in the existing `PATCH /api/asset-registry/bulk-update` payload — no new proxy route needed

### Assessment update (Batch 1)

- Metadata & Catalog status: `partial` → `built`
- Update `exists` text: add glossary badges on list rows, sensitivity in Asset Registry tree, domain+sensitivity in bulk edit
- Update `gaps` text: "No metadata versioning (schema version history requires backend). No bulk tag management across connections."
- Also fix current incorrect "No bulk editing" claim — bulk editing for criticality/certification/owner already exists

---

## Batch 2 — Classification & Sensitivity (PARTIAL+)

**Target:** Close all frontend-achievable gaps; reduce to backend-only gaps only.

### Item 4: Dashboard Privacy tile drill-down panel

**Files:**
- `frontend/src/app/privacy/page.tsx` — the Privacy dashboard tile (`src/components/dashboard/Dashboard.tsx` line ~551) already links here; enhance this page with per-domain/per-column drill-down
- New proxy route: `frontend/src/app/api/classifications/summary/route.ts`

- The Privacy tile in `Dashboard.tsx` already navigates to `/privacy` on click; no dashboard change needed
- Enhance `privacy/page.tsx`: add a "Sensitivity by Domain" section at the top that fetches `GET /api/classifications/summary`
  - Proxy proxies to backend `GET /classifications/summary`
  - Returns: `{ domains: [{ name: string, counts: { PII: number, PHI: number, RESTRICTED: number, CONFIDENTIAL: number, SENSITIVE: number, PUBLIC: number }, total: number }] }`
- Panel content: table of domains sorted by total sensitive count descending
  - Each row: domain name | sensitivity breakdown as colored mini-pills | total count
  - Each row expandable: shows top 5 affected assets in that domain with their highest sensitivity tag (fetched from existing `/api/catalog/sensitivity`, filtered client-side by domain)
- Close button top-right, click-outside closes

### Item 5: Proxy-layer data masking

**Files:**
- `frontend/src/lib/masking.ts` — pure masking helper
- `frontend/src/app/api/asset-registry/[...path]/route.ts` — intercept profiling/preview responses

- `masking.ts` exports:
  ```ts
  export function maskSensitiveColumns(
    data: unknown,
    userRole: string,
    sensitivityMap: Record<string, string>
  ): unknown
  ```
  - Walks the response JSON looking for arrays of row objects
  - For each column where `sensitivityMap[columnName]` is `'PII'` or `'CONFIDENTIAL'`, replaces the value with `'***'`
  - Returns masked copy — never mutates input

- In `/api/asset-registry/[...path]/route.ts`:
  - Read user role from JWT in `Authorization` header or session cookie
  - Call `GET /api/security` to check if `column_level_access_control` is enabled (cache for 60s to avoid per-request overhead)
  - If masking enabled and role is not `admin`/`data_steward`: apply `maskSensitiveColumns` before returning response
  - Fetch sensitivity map from `/api/catalog/sensitivity` for the asset in the path (cache per asset_id, 5 min TTL)

- Error handling: if masking helper throws, log and return unmasked response (fail open, not closed — enforcement can be tightened once backend takes over)

### Assessment update (Batch 2)

- Classification & Sensitivity status: stays `partial`
- Update `exists` text: add Privacy tile drill-down, proxy-layer masking
- Update `gaps` text: reduce to "No remediation at warehouse query time (requires backend enforcement). No consent management. No data residency configuration."

---

## Batch 3 — Compliance & Audit (PARTIAL+)

**Target:** Eliminate the two frontend-achievable gaps.

### Item 6: Compliance controls auto-load

**File:** `frontend/src/app/compliance/page.tsx`

- After controls fetch for the selected framework: check `controls.length === 0`
- If empty, automatically call `POST /api/compliance/{frameworkId}/auto-map` in the background
- During auto-map: show inline notice `"Mapping rules to controls…"` below the controls table header
- On completion: re-fetch controls and replace the list
- On error: hide notice, show existing manual "Initialize Frameworks" / "Auto-Map Rules" buttons as fallback
- Guard with a `useRef` flag (`autoMapFiredRef`) to prevent repeated auto-map calls on re-renders

### Item 7: Suspicious activity detection in audit log proxy

**File:** `frontend/src/app/api/audit/route.ts`

- After fetching audit entries from the backend, run `detectSuspiciousActivity(entries)` before returning
- New file: `frontend/src/lib/auditPatterns.ts`
  - `detectSuspiciousActivity(entries: AuditEntry[]): AuditEntry[]`
  - Injects `_suspicious: true` and `_suspiciousReason: string` on matching entries
  - Three patterns:
    1. **Repeated failures**: same `user` + 3+ `result: "failure"` entries within any 60-second window → reason: `"repeated_failures"`
    2. **Off-hours access**: `timestamp` hour outside 06:00–22:00 UTC → reason: `"off_hours_access"`
    3. **Bulk data access**: same `user` + 5+ `action` values of `"read"` or `"export"` in the returned batch → reason: `"bulk_data_access"`
  - Pure function — no side effects, fully testable

- In Audit Logs page UI (`frontend/src/app/audit-logs/page.tsx`):
  - Rows where `_suspicious` is truthy: amber left-border (`border-left: 3px solid var(--status-warn-text)`)
  - Add a `⚠` badge in a new column or inline with the action, showing `_suspiciousReason` as tooltip text
  - Add filter button "⚠ Suspicious only" that filters `entries.filter(e => e._suspicious)`

### Assessment update (Batch 3)

- Compliance & Audit status: stays `partial`
- Update `exists` text: add auto-load controls, suspicious activity detection
- Update `gaps` text: reduce to "No real-time alerting channel for suspicious events (no email/Slack/PagerDuty trigger). No tamper-evident log storage (requires backend hash generation)."

---

## Batch 4 — Stewardship & Collaboration (PARTIAL+)

**Target:** Eliminate the custom tasks visibility gap and add lightweight notification awareness.

### Item 8: Custom tasks surfaced in stewardship queue

**Files:**
- `frontend/src/app/api/stewardship/tasks/route.ts` — add GET handler
- `frontend/src/app/api/stewardship/tasks/[id]/route.ts` — new PATCH handler
- `frontend/src/app/stewardship/page.tsx` — merge custom tasks into queue

- `GET /api/stewardship/tasks`: proxies to backend `GET /stewardship/tasks?status=pending`
- `PATCH /api/stewardship/tasks/[id]`: proxies to backend `PATCH /stewardship/tasks/{id}` with body `{ status: "completed" }`
- In stewardship page, fetch custom tasks alongside existing approvals and pending-review rules:
  ```ts
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([])
  // fetch on mount, merge into unified task list
  ```
- Custom task row renders: type badge | entity label | assignee chip | description (truncated) | "Mark Done" button
- "Mark Done" calls `PATCH /api/stewardship/tasks/{id}`, removes item from list inline on success
- Sort merged list by `created_at` descending

### Item 9: Notification count badge in nav

**Files:**
- New component: `frontend/src/components/nav/NotificationBadge.tsx`
- `frontend/src/components/Sidebar.tsx` — mount `NotificationBadge` on the Stewardship nav item

- `NotificationBadge` polls two endpoints every 60 seconds:
  - `GET /api/stewardship/tasks` — count items with `status: "pending"`
  - `GET /api/governance/approvals` — count items with `status: "pending"`
  - Also count pending-review rules via existing `/api/rules?status=pending_review` if available
- Total count drives the badge: hidden at 0, shows number 1–9, shows `9+` above 9
- Badge: red circle, white text, absolute-positioned top-right of the nav icon
- `useEffect` with `setInterval(60_000)` + cleanup on unmount
- Uses `useRef` to avoid state updates after unmount

### Assessment update (Batch 4)

- Stewardship & Collaboration status: stays `partial`
- Update `exists` text: add custom tasks visible in queue, notification count badge
- Update `gaps` text: reduce to "No real-time push notifications (WebSocket/SSE). No SLA or escalation workflow on tasks."

---

## Cross-cutting Decisions

| Decision | Choice | Reason |
|---|---|---|
| Backend enforcement gaps | Implement at proxy layer | Provides real value now; backend can take over enforcement later without frontend changes |
| Shared `SensitivityBadge` component | Extract from catalog into `/components/asset-registry/` | Prevents duplication across Catalog, AssetTreePanel, and any future list view |
| Error handling for proxy masking | Fail open (return unmasked) | Enforcement correctness belongs to the backend; proxy layer is a best-effort defence |
| Polling interval for nav badge | 60s | Matches existing app polling patterns; governance workflows don't require sub-minute freshness |
| Auto-map guard | `useRef` flag | Prevents repeated calls on re-render without adding the auto-map call to the dependency array |

---

## Files Created / Modified

| File | Change |
|---|---|
| `src/app/api/glossary/bulk-asset-links/route.ts` | **New** — batch glossary term links |
| `src/app/api/classifications/summary/route.ts` | **New** — per-domain sensitivity summary |
| `src/app/api/stewardship/tasks/[id]/route.ts` | **New** — PATCH task to completed |
| `src/app/api/stewardship/tasks/route.ts` | **Modify** — add GET handler |
| `src/components/asset-registry/SensitivityBadge.tsx` | **New** — shared sensitivity badge |
| `src/components/nav/NotificationBadge.tsx` | **New** — nav polling badge |
| `src/lib/masking.ts` | **New** — pure proxy masking helper |
| `src/lib/auditPatterns.ts` | **New** — suspicious activity detection |
| `src/app/catalog/page.tsx` | **Modify** — glossary badges, domain+sensitivity bulk edit, use SensitivityBadge |
| `src/components/asset-registry/AssetTreePanel.tsx` | **Modify** — sensitivity batch fetch + badge |
| `src/app/privacy/page.tsx` | **Modify** — Sensitivity by Domain drill-down section |
| `src/app/compliance/page.tsx` | **Modify** — controls auto-load |
| `src/app/audit-logs/page.tsx` | **Modify** — suspicious row highlights + filter |
| `src/app/stewardship/page.tsx` | **Modify** — custom tasks in queue |
| `src/components/Sidebar.tsx` | **Modify** — mount NotificationBadge on Stewardship nav item |
| `src/app/settings/page.tsx` | **Modify** — update assessment text after each batch |
