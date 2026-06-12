# Rule Engine + Rule Builder UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing backend Rule Engine (fully complete) to the existing frontend UI — fixing broken proxy routes, adding a Rules tab to asset detail, and providing a real rule run detail page.

**Architecture:** The backend (FastAPI) already has complete rule CRUD, approval workflow, bulk execution, and run history. The frontend `RulesClient.tsx` already has a full UI but its write operations (POST/PUT/DELETE) go to an in-memory file store instead of the backend. This plan fixes the broken proxy routes, extends the Asset Detail Panel with a Rules tab, wires the fake `testRule()` to a real execution endpoint, and adds a rule run detail page reusing the existing run detail pattern.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, FastAPI backend at `process.env.BACKEND_URL || 'http://localhost:8000'`

---

## Audit Findings

### Backend — Fully Complete, Zero Changes Needed

| Component | Location | Status |
|-----------|----------|--------|
| `DQRule` model | `app/db/models.py:252` | ✅ Complete |
| `DQRuleRun` model | `app/db/models.py:334` | ✅ Complete |
| `DQRuleRunSample` model | `app/db/models.py:360` | ✅ Complete |
| `RuleVersion` model | `app/db/models.py:288` | ✅ Complete |
| CRUD: `GET/POST/PUT/DELETE /rules` | `app/api/rules.py` | ✅ Complete |
| Enriched list: `GET /rules/enriched` | `app/api/rules.py:58` | ✅ Complete |
| Approval: `POST /rules/{id}/approve|reject|submit` | `app/api/rules.py:364–460` | ✅ Complete |
| Status patch: `PATCH /rules/{id}/status` | `app/api/rules.py:319` | ✅ Complete |
| Clone: `POST /rules/{id}/clone` | `app/api/rules.py:665` | ✅ Complete |
| Version history: `GET /rules/{id}/versions` | `app/api/rules.py:465` | ✅ Complete |
| Bulk execute: `POST /rules/bulk/execute` | `app/api/rules.py:553` | ✅ Complete |
| Bulk status: `PATCH /rules/bulk/status` | `app/api/rules.py:523` | ✅ Complete |
| Run history per rule: `GET /rules/{id}/runs` | `app/api/rules.py:706` | ✅ Complete |
| Execute rule (sync): `POST /execute/rule/{id}/sync` | `app/api/executions.py:163` | ✅ Complete |
| Execute asset rules: `POST /execute/table/{id}/sync` | `app/api/executions.py:180` | ✅ Complete |
| Enriched runs: `GET /runs/enriched` | `app/api/executions.py:324` | ✅ Complete |
| Run detail: `GET /runs/{run_id}` | `app/api/executions.py:416` | ✅ Complete |
| Run samples: `GET /runs/{run_id}/samples` | `app/api/executions.py:425` | ✅ Complete |

### Frontend — What's Broken or Missing

| Issue | Impact |
|-------|--------|
| `/api/rules/route.ts` POST/PUT/DELETE writes to `store` (file/memory) | Rules created in UI are lost on refresh; backend never receives them |
| `testRule()` in `RulesClient.tsx` simulates with `setTimeout + Math.random()` | "Run" button shows fake results, never executes real SQL |
| `updateRuleStatus()` in `RulesClient.tsx` calls store, not backend | Status changes don't persist to database |
| Approve/reject use store-only paths | Approval workflow is UI-only illusion |
| `Rule` type missing `assetId`, `domainId`, `subdomainId` | Cannot send these required fields to backend on create |
| No `/api/rules/[ruleId]/runs/route.ts` | Can't fetch per-rule run history |
| No `/api/rules/[ruleId]/run/route.ts` | Can't trigger single-rule execution |
| No `/api/rules/[ruleId]/approve|reject|submit|status/route.ts` | Workflow actions have no backend proxy |
| No `/api/rule-runs/[runId]/route.ts` | Can't fetch DQRuleRun detail or samples |
| `AssetDetailPanel.tsx` has only `overview` + `profiling` tabs | No way to see/manage rules from asset context |
| No `AssetRulesTab.tsx` | Asset-scoped rule list doesn't exist |
| No `/rule-runs/[runId]/page.tsx` | DQRuleRun results (score, failed rows, samples) have no detail view |

---

## Existing Screens/Components to Reuse

| Component | Path | Reuse |
|-----------|------|-------|
| `RulesClient.tsx` | `frontend/src/components/rules/RulesClient.tsx` | Keep as-is; wire API calls |
| Tab bar pattern | `AssetDetailPanel.tsx:99–130` | Copy `type Tab` + button pattern for Rules tab |
| `AssetProfilingTab` | `frontend/src/components/asset-registry/AssetProfilingTab.tsx` | Model `AssetRulesTab` on same structure |
| Run detail page | `frontend/src/app/scan-jobs/[jobId]/runs/[runId]/page.tsx` | Copy and adapt for rule runs |
| Proxy route pattern | `frontend/src/app/api/profile-results/assets/[assetId]/summary/route.ts` | Copy pattern for all new proxy routes |
| STATUS_STYLE, LOG_STYLE | `scan-jobs/[jobId]/runs/[runId]/page.tsx:34–48` | Copy into rule run detail page |

---

## File Structure

### Files to Modify (7)
```
frontend/src/lib/types.ts                                       - Add assetId/domainId/subdomainId to Rule
frontend/src/app/api/rules/route.ts                             - Fix POST/PUT/DELETE to call backend
frontend/src/components/rules/RulesClient.tsx                   - Wire testRule(), approve/reject/status to API
frontend/src/components/asset-registry/AssetDetailPanel.tsx     - Add 'rules' tab
frontend/src/app/api/run-history/route.ts                       - Pass rule_id query param through
```

### Files to Create (11)
```
frontend/src/app/api/rules/[ruleId]/route.ts                    - GET/PUT/DELETE by ID
frontend/src/app/api/rules/[ruleId]/runs/route.ts               - GET rule run history
frontend/src/app/api/rules/[ruleId]/run/route.ts                - POST execute rule
frontend/src/app/api/rules/[ruleId]/approve/route.ts            - POST approve
frontend/src/app/api/rules/[ruleId]/reject/route.ts             - POST reject
frontend/src/app/api/rules/[ruleId]/submit/route.ts             - POST submit for review
frontend/src/app/api/rules/[ruleId]/status/route.ts             - PATCH status
frontend/src/app/api/rule-runs/[runId]/route.ts                 - GET run detail + samples
frontend/src/components/asset-registry/AssetRulesTab.tsx        - Asset-scoped rules component
frontend/src/app/rule-runs/[runId]/page.tsx                     - Rule run detail page
```

### Files Explicitly Not Touched
- All backend Python files — backend is complete
- `frontend/src/app/rules/page.tsx` — page shell, no changes needed
- `frontend/src/components/rules/useRulesGrouping.ts` — no changes
- `frontend/src/app/run-history/page.tsx` — keep working as-is for scan job runs
- `frontend/src/app/scan-jobs/` — no changes
- `frontend/src/lib/store.ts` — left intact (still used by connections/reports)

---

## Tasks

---

### Task 1: Extend `Rule` type with backend ID fields

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/app/api/rules/route.ts` (GET mapping only)

- [ ] **Step 1: Add assetId, domainId, subdomainId to Rule interface**

In `frontend/src/lib/types.ts`, add three optional fields after `scope`:

```typescript
export interface Rule {
  id: string
  name: string
  description: string
  category: RuleCategory
  type: RuleType
  connectionId: string
  tableName: string
  columnName?: string
  parameters: Record<string, unknown>
  enabled: boolean
  status: RuleStatus
  severity: 'critical' | 'high' | 'medium' | 'low'
  scope: 'generic' | 'object-specific'
  assetId?: string
  domainId?: string
  subdomainId?: string
  createdAt: string
  createdBy?: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  lastRunAt?: string
  lastRunStatus?: 'passed' | 'failed' | 'warning' | 'error'
  lastRunScore?: number
}
```

- [ ] **Step 2: Include assetId/domainId/subdomainId in GET mapping**

In `frontend/src/app/api/rules/route.ts`, extend the `items.map(...)` to include these fields:

```typescript
const rules: Rule[] = items.map((r) => ({
  id: r.rule_id as string,
  name: r.rule_name as string,
  description: (r.rule_description as string) ?? '',
  category: (r.rule_category as Rule['category']) ?? 'completeness',
  type: r.rule_type as Rule['type'],
  connectionId: defaultConnId,
  tableName: (r.sf_table_name as string) ?? '',
  columnName: (r.target_column as string) ?? undefined,
  parameters: (r.rule_config as Record<string, unknown>) ?? {},
  enabled: r.is_active as boolean,
  status: r.status as Rule['status'],
  severity: r.severity as Rule['severity'],
  scope: 'generic',
  assetId: (r.asset_id as string) ?? undefined,
  domainId: (r.domain_id as string) ?? undefined,
  subdomainId: (r.subdomain_id as string) ?? undefined,
  createdAt: r.created_at as string,
  createdBy: (r.created_by as string) ?? undefined,
  approvedBy: (r.approved_by as string) ?? undefined,
}))
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | head -30
```
Expected: zero errors related to Rule type.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/app/api/rules/route.ts
git commit -m "feat(rules): add assetId/domainId/subdomainId to Rule type and GET mapping"
```

---

### Task 2: Fix `/api/rules/route.ts` POST and DELETE to call backend

**Files:**
- Modify: `frontend/src/app/api/rules/route.ts`

The current POST writes to `store` (local JSON), DELETE deletes from `store`. We need both to call the backend. The backend `RuleCreate` requires `domain_id`, `subdomain_id`, `asset_id` — we resolve these by looking up the asset from `tableName + connectionId`.

- [ ] **Step 1: Write the failing test (manual)**

Start the dev server (`npm run dev`), open `/rules`, create a rule, refresh the page.
Expected CURRENT behavior: rule disappears on refresh (stored in local file, not backend).

- [ ] **Step 2: Replace POST handler in route.ts**

Full updated `frontend/src/app/api/rules/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { Rule } from '@/lib/types'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const assetId = searchParams.get('asset_id')
    const domainId = searchParams.get('domain_id')
    let url = `${BACKEND}/rules/enriched?limit=500`
    if (assetId) url += `&asset_id=${assetId}`
    if (domainId) url += `&domain_id=${domainId}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    const items: Record<string, unknown>[] = data.items ?? []

    const connRes = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    const connData = connRes.ok ? await connRes.json() : []
    const connections: Record<string, unknown>[] = Array.isArray(connData) ? connData : (connData.items ?? [])
    const defaultConnId = connections[0]?.connection_id as string ?? ''

    const rules: Rule[] = items.map((r) => ({
      id: r.rule_id as string,
      name: r.rule_name as string,
      description: (r.rule_description as string) ?? '',
      category: (r.rule_category as Rule['category']) ?? 'completeness',
      type: r.rule_type as Rule['type'],
      connectionId: defaultConnId,
      tableName: (r.sf_table_name as string) ?? '',
      columnName: (r.target_column as string) ?? undefined,
      parameters: (r.rule_config as Record<string, unknown>) ?? {},
      enabled: r.is_active as boolean,
      status: r.status as Rule['status'],
      severity: r.severity as Rule['severity'],
      scope: 'generic',
      assetId: (r.asset_id as string) ?? undefined,
      domainId: (r.domain_id as string) ?? undefined,
      subdomainId: (r.subdomain_id as string) ?? undefined,
      createdAt: r.created_at as string,
      createdBy: (r.created_by as string) ?? undefined,
      approvedBy: (r.approved_by as string) ?? undefined,
    }))

    return NextResponse.json(rules)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description, category, type, connectionId, tableName, columnName, severity, parameters } = body

    // Resolve asset_id + domain_id + subdomain_id from connectionId + tableName
    const assetRes = await fetch(
      `${BACKEND}/assets?connection_id=${encodeURIComponent(connectionId)}&sf_table_name=${encodeURIComponent(tableName)}&limit=1`,
      { cache: 'no-store' }
    )
    const assetData = assetRes.ok ? await assetRes.json() : {}
    const assetItems: Record<string, unknown>[] = Array.isArray(assetData) ? assetData : (assetData.items ?? [])
    const asset = assetItems[0]

    if (!asset) {
      return NextResponse.json({ error: `Asset not found for table '${tableName}'` }, { status: 422 })
    }

    const createBody = {
      rule_name: name,
      rule_description: description || null,
      domain_id: asset.domain_id,
      subdomain_id: asset.subdomain_id,
      asset_id: asset.asset_id,
      rule_type: type,
      rule_category: category,
      target_column: columnName || null,
      rule_config: parameters || null,
      severity: severity || 'medium',
      status: 'draft',
    }

    const res = await fetch(`${BACKEND}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    const created = await res.json()
    // Map backend response to frontend Rule shape
    const rule: Rule = {
      id: created.rule_id,
      name: created.rule_name,
      description: created.rule_description ?? '',
      category: (created.rule_category as Rule['category']) ?? category,
      type: created.rule_type as Rule['type'],
      connectionId,
      tableName: (asset.sf_table_name as string) ?? tableName,
      columnName: created.target_column ?? undefined,
      parameters: created.rule_config ?? parameters ?? {},
      enabled: created.is_active,
      status: created.status as Rule['status'],
      severity: created.severity as Rule['severity'],
      scope: 'generic',
      assetId: created.asset_id,
      domainId: created.domain_id,
      subdomainId: created.subdomain_id,
      createdAt: created.created_at,
      createdBy: created.created_by ?? undefined,
    }
    return NextResponse.json(rule, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, description, category, type, severity, status, columnName, parameters } = body

    const updateBody = {
      rule_name: name,
      rule_description: description || null,
      rule_type: type,
      rule_category: category,
      target_column: columnName || null,
      rule_config: parameters || null,
      severity,
      status,
      is_active: status === 'active',
    }

    const res = await fetch(`${BACKEND}/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const res = await fetch(`${BACKEND}/rules/${id}`, { method: 'DELETE' })
    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify create now persists to backend**

With dev server running, create a rule, refresh the page — rule should reappear in list.
Expected: rule persists after refresh.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/rules/route.ts
git commit -m "fix(rules): wire POST/PUT/DELETE proxy routes to backend instead of local store"
```

---

### Task 3: Create per-rule proxy routes (GET/PUT/DELETE by ID, runs, run execution)

**Files:**
- Create: `frontend/src/app/api/rules/[ruleId]/route.ts`
- Create: `frontend/src/app/api/rules/[ruleId]/runs/route.ts`
- Create: `frontend/src/app/api/rules/[ruleId]/run/route.ts`

- [ ] **Step 1: Create `frontend/src/app/api/rules/[ruleId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const res = await fetch(`${BACKEND}/rules/${ruleId}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(null, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const body = await req.text()
    const res = await fetch(`${BACKEND}/rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const res = await fetch(`${BACKEND}/rules/${ruleId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Create `frontend/src/app/api/rules/[ruleId]/runs/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  const limit = req.nextUrl.searchParams.get('limit') ?? '50'
  try {
    const res = await fetch(`${BACKEND}/rules/${ruleId}/runs?limit=${limit}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ runs: [], total: 0 }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e) { return NextResponse.json({ runs: [], total: 0, error: String(e) }) }
}
```

- [ ] **Step 3: Create `frontend/src/app/api/rules/[ruleId]/run/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const res = await fetch(`${BACKEND}/execute/rule/${ruleId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/rules/
git commit -m "feat(rules): add per-rule proxy routes (GET/PUT/DELETE by ID, runs, execute)"
```

---

### Task 4: Create rule workflow proxy routes (approve, reject, submit, status)

**Files:**
- Create: `frontend/src/app/api/rules/[ruleId]/approve/route.ts`
- Create: `frontend/src/app/api/rules/[ruleId]/reject/route.ts`
- Create: `frontend/src/app/api/rules/[ruleId]/submit/route.ts`
- Create: `frontend/src/app/api/rules/[ruleId]/status/route.ts`

- [ ] **Step 1: Create approve route**

`frontend/src/app/api/rules/[ruleId]/approve/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const body = await req.text()
    const res = await fetch(`${BACKEND}/rules/${ruleId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body || '{}',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Create reject route**

`frontend/src/app/api/rules/[ruleId]/reject/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const body = await req.text()
    const res = await fetch(`${BACKEND}/rules/${ruleId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body || '{}',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 3: Create submit route**

`frontend/src/app/api/rules/[ruleId]/submit/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const res = await fetch(`${BACKEND}/rules/${ruleId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 4: Create status patch route**

`frontend/src/app/api/rules/[ruleId]/status/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  try {
    const body = await req.text()
    const res = await fetch(`${BACKEND}/rules/${ruleId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/rules/
git commit -m "feat(rules): add workflow proxy routes (approve, reject, submit, status patch)"
```

---

### Task 5: Create rule run detail proxy route

**Files:**
- Create: `frontend/src/app/api/rule-runs/[runId]/route.ts`

- [ ] **Step 1: Create the run detail + samples proxy**

`frontend/src/app/api/rule-runs/[runId]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const includeSamples = req.nextUrl.searchParams.get('samples') === 'true'

  try {
    const [runRes, samplesRes] = await Promise.all([
      fetch(`${BACKEND}/runs/${runId}`, { cache: 'no-store' }),
      includeSamples
        ? fetch(`${BACKEND}/runs/${runId}/samples?limit=20`, { cache: 'no-store' })
        : Promise.resolve(null),
    ])

    if (!runRes.ok) return NextResponse.json(null, { status: runRes.status })
    const run = await runRes.json()

    let samples: unknown[] = []
    if (samplesRes?.ok) {
      samples = await samplesRes.json()
    }

    return NextResponse.json({ ...run, samples })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/api/rule-runs/
git commit -m "feat(rules): add rule-runs proxy route for run detail and samples"
```

---

### Task 6: Update `RulesClient.tsx` — wire `testRule()` and `updateRuleStatus()` to real API

**Files:**
- Modify: `frontend/src/components/rules/RulesClient.tsx`

The `testRule()` function at line 266 uses `setTimeout + Math.random()`. The `updateRuleStatus()` function at line 229 calls the store-based `/api/rules` PUT. These need to call the real backend.

- [ ] **Step 1: Locate and replace `testRule()` in `RulesClient.tsx`**

Find the function at line 266–275. Replace:

```typescript
async function testRule(id: string) {
  setTesting(id)
  // Simulate a test run against the connection
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 800))
  const passed = Math.random() > 0.3
  const score = passed ? 95 + Math.floor(Math.random() * 5) : 60 + Math.floor(Math.random() * 25)
  setTestResults(prev => ({ ...prev, [id]: { status: passed ? 'passed' : 'failed', score } }))
  setRules(prev => prev.map(r => r.id === id ? { ...r, lastRunAt: new Date().toISOString(), lastRunStatus: passed ? 'passed' : 'failed', lastRunScore: score } : r))
  setTesting(null)
}
```

With:

```typescript
async function testRule(id: string) {
  setTesting(id)
  try {
    const res = await fetch(`/api/rules/${id}/run`, { method: 'POST' })
    if (res.ok) {
      const run = await res.json() as Record<string, unknown>
      const passed = run.status === 'passed'
      const score = typeof run.quality_score === 'number' ? Math.round(run.quality_score) : (passed ? 100 : 0)
      setTestResults(prev => ({ ...prev, [id]: { status: passed ? 'passed' : 'failed', score } }))
      setRules(prev => prev.map(r => r.id === id
        ? { ...r, lastRunAt: new Date().toISOString(), lastRunStatus: passed ? 'passed' : 'failed', lastRunScore: score }
        : r
      ))
    }
  } catch {
    // silently ignore — rule remains unchanged in UI
  }
  setTesting(null)
}
```

- [ ] **Step 2: Replace `updateRuleStatus()` calls to use PATCH /status**

Find `updateRuleStatus` function (around line 229). The current pattern calls PUT on `/api/rules`. Replace with a PATCH to `/api/rules/${id}/status`:

```typescript
async function updateRuleStatus(id: string, newStatus: RuleStatus) {
  await fetch(`/api/rules/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  })
  setRules(prev => prev.map(r => r.id === id
    ? { ...r, status: newStatus, enabled: newStatus === 'active' }
    : r
  ))
}
```

- [ ] **Step 3: Wire approve/reject buttons to new proxy routes**

Find the approve/reject button handlers in RulesClient (search for `approve` or `reject`). Update them to call the backend:

For approve (find the onClick that handles approve, typically inline near the `pending_review` status buttons):
```typescript
async function approveRule(id: string) {
  const res = await fetch(`/api/rules/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (res.ok) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, status: 'active', enabled: true } : r))
  }
}

async function rejectRule(id: string, reason: string) {
  const res = await fetch(`/api/rules/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejection_reason: reason }),
  })
  if (res.ok) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, status: 'draft' } : r))
  }
}
```

Replace any existing inline `fetch('/api/rules', { method: 'PUT', ... status: 'active' ... })` patterns with calls to `approveRule(id)` / `rejectRule(id, reason)`.

- [ ] **Step 4: Verify run button works**

With backend running, navigate to `/rules`, find an active rule, click ▶. Should see a real quality score (not simulated 95–100%).
Expected: button shows loading spinner, then shows actual pass/fail score from backend.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/rules/RulesClient.tsx
git commit -m "fix(rules): wire testRule() and status/approve/reject to real backend APIs"
```

---

### Task 7: Create `AssetRulesTab.tsx` component

**Files:**
- Create: `frontend/src/components/asset-registry/AssetRulesTab.tsx`

This component shows rules scoped to a specific asset. It reuses the RulesClient list pattern but is simpler: no create modal (that lives at `/rules`), just list + inline run.

- [ ] **Step 1: Create `AssetRulesTab.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Rule } from '@/lib/types'

interface RuleRun {
  run_id: string
  status: 'passed' | 'failed' | 'error' | 'skipped'
  quality_score: number | null
  failed_rows_count: number | null
  total_rows_scanned: number | null
  created_at: string
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626' },
  high:     { bg: '#fff7ed', color: '#ea580c' },
  medium:   { bg: '#fef9c3', color: '#ca8a04' },
  low:      { bg: '#f0fdf4', color: '#16a34a' },
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:         { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)' },
  draft:          { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  pending_review: { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  disabled:       { bg: '#fff7ed',                  color: '#ea580c' },
  archived:       { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
}

function scoreColor(s: number): string {
  return s >= 90 ? '#16a34a' : s >= 80 ? '#ea8b3a' : '#dc2626'
}

export default function AssetRulesTab({ assetId }: { assetId: string }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [lastRuns, setLastRuns] = useState<Record<string, RuleRun>>({})

  useEffect(() => {
    fetch(`/api/rules?asset_id=${assetId}`)
      .then(r => r.json())
      .then((data: unknown) => {
        setRules(Array.isArray(data) ? data as Rule[] : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [assetId])

  async function runRule(rule: Rule) {
    if (rule.status !== 'active') return
    setRunning(rule.id)
    try {
      const res = await fetch(`/api/rules/${rule.id}/run`, { method: 'POST' })
      if (res.ok) {
        const run = await res.json() as Record<string, unknown>
        setLastRuns(prev => ({
          ...prev,
          [rule.id]: {
            run_id: String(run.run_id ?? ''),
            status: run.status as RuleRun['status'],
            quality_score: run.quality_score as number | null,
            failed_rows_count: run.failed_rows_count as number | null,
            total_rows_scanned: run.total_rows_scanned as number | null,
            created_at: new Date().toISOString(),
          },
        }))
      }
    } catch { /* silently ignore */ }
    setRunning(null)
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading rules…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {rules.length} rule{rules.length !== 1 ? 's' : ''} assigned to this asset
        </div>
        <Link
          href={`/rules?asset_id=${assetId}`}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none' }}
        >
          Manage rules →
        </Link>
      </div>

      {rules.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>📋</div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>No rules assigned</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Assign rules to this asset from the Rules page.
          </div>
          <Link
            href="/rules"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            Go to Rules →
          </Link>
        </div>
      )}

      {rules.map(rule => {
        const sev = SEVERITY_STYLE[rule.severity] ?? SEVERITY_STYLE.medium
        const stat = STATUS_STYLE[rule.status] ?? STATUS_STYLE.draft
        const lastRun = lastRuns[rule.id]
        const canRun = rule.status === 'active'
        const isRunning = running === rule.id

        return (
          <div key={rule.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)', marginBottom: '3px' }}>
                  {rule.name}
                </div>
                {rule.description && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {rule.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '1px 6px', borderRadius: '4px' }}>
                    {rule.type.replace(/_/g, ' ')}
                  </span>
                  {rule.columnName && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      .{rule.columnName}
                    </span>
                  )}
                  <span style={{ ...sev, fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {rule.severity}
                  </span>
                  <span style={{ ...stat, fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {rule.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {lastRun && (
                  <Link
                    href={`/rule-runs/${lastRun.run_id}`}
                    style={{ textDecoration: 'none' }}
                    title="View run detail"
                  >
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px',
                      background: lastRun.status === 'passed' ? '#dcfce7' : '#fee2e2',
                      color: lastRun.status === 'passed' ? '#16a34a' : '#dc2626',
                    }}>
                      {lastRun.status === 'passed' ? '✓' : '✗'}
                      {lastRun.quality_score != null ? ` ${Math.round(lastRun.quality_score)}%` : ''}
                    </span>
                  </Link>
                )}
                <button
                  onClick={() => runRule(rule)}
                  disabled={!canRun || isRunning}
                  title={canRun ? 'Run rule now' : 'Rule must be Active to run'}
                  style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)',
                    border: '1px solid', cursor: canRun ? 'pointer' : 'not-allowed',
                    borderColor: canRun ? 'var(--accent-bg)' : 'var(--border)',
                    background: canRun ? 'var(--accent-bg)' : 'var(--surface-muted)',
                    color: canRun ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {isRunning ? '⏳' : '▶ Run'}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/asset-registry/AssetRulesTab.tsx
git commit -m "feat(rules): add AssetRulesTab component for asset-scoped rules"
```

---

### Task 8: Add `rules` tab to `AssetDetailPanel.tsx`

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`

- [ ] **Step 1: Add import for AssetRulesTab**

At the top of `AssetDetailPanel.tsx`, after the existing imports:
```typescript
import AssetRulesTab from './AssetRulesTab'
```

- [ ] **Step 2: Extend the Tab type**

Change line 36 from:
```typescript
type Tab = 'overview' | 'profiling'
```
to:
```typescript
type Tab = 'overview' | 'profiling' | 'rules'
```

- [ ] **Step 3: Add 'rules' to the tab button loop**

In the tab bar render (around line 100), change:
```typescript
{(['overview', 'profiling'] as Tab[]).map(tab => (
```
to:
```typescript
{(['overview', 'profiling', 'rules'] as Tab[]).map(tab => (
```

- [ ] **Step 4: Add rules tab content render**

After the profiling tab content block (wherever `activeTab === 'profiling'` is handled), add:

```typescript
{activeTab === 'rules' && (
  <AssetRulesTab assetId={asset.asset_id} />
)}
```

- [ ] **Step 5: Verify tab appears in Asset Registry**

With dev server running, open `/asset-registry`, click a table asset. Should see three tabs: Overview, Profiling, Rules.
Expected: Rules tab renders list of rules for the selected asset (or empty state with "Go to Rules" link).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailPanel.tsx
git commit -m "feat(rules): add Rules tab to AssetDetailPanel"
```

---

### Task 9: Create rule run detail page `/rule-runs/[runId]/page.tsx`

**Files:**
- Create: `frontend/src/app/rule-runs/[runId]/page.tsx`

Reuse the exact same layout as `scan-jobs/[jobId]/runs/[runId]/page.tsx` but adapted for DQRuleRun data: shows quality score, total/failed row counts, and a table of sample failing rows.

- [ ] **Step 1: Create the page**

`frontend/src/app/rule-runs/[runId]/page.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type RunStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'running'

interface RuleRun {
  run_id: string
  rule_id: string
  rule_name?: string
  rule_type?: string
  severity?: string
  status: RunStatus
  quality_score: number | null
  total_rows_scanned: number | null
  failed_rows_count: number | null
  passed_rows_count: number | null
  failure_percentage: number | null
  error_message: string | null
  executed_sql: string | null
  execution_start_time: string | null
  execution_end_time: string | null
  duration_ms: number | null
  samples: Record<string, unknown>[]
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  error:   { background: '#fee2e2', color: '#dc2626' },
  skipped: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
  running: { background: '#eff6ff', color: '#2563eb' },
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function scoreColor(s: number | null): string {
  if (s == null) return 'var(--text-muted)'
  return s >= 90 ? '#16a34a' : s >= 80 ? '#ea8b3a' : '#dc2626'
}

export default function RuleRunDetailPage({ params }: { params: { runId: string } }) {
  const { runId } = params
  const [run, setRun] = useState<RuleRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSql, setShowSql] = useState(false)

  useEffect(() => {
    fetch(`/api/rule-runs/${runId}?samples=true`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data || data.error) { setLoading(false); return }
        setRun({
          run_id:              String(data.run_id ?? runId),
          rule_id:             String(data.rule_id ?? ''),
          rule_name:           data.rule_name as string | undefined,
          rule_type:           data.rule_type as string | undefined,
          severity:            data.severity as string | undefined,
          status:              (data.status as RunStatus) ?? 'error',
          quality_score:       data.quality_score as number | null ?? null,
          total_rows_scanned:  data.total_rows_scanned as number | null ?? null,
          failed_rows_count:   data.failed_rows_count as number | null ?? null,
          passed_rows_count:   data.passed_rows_count as number | null ?? null,
          failure_percentage:  data.failure_percentage as number | null ?? null,
          error_message:       data.error_message as string | null ?? null,
          executed_sql:        data.executed_sql as string | null ?? null,
          execution_start_time: data.execution_start_time as string | null ?? null,
          execution_end_time:  data.execution_end_time as string | null ?? null,
          duration_ms:         data.duration_ms as number | null ?? null,
          samples:             Array.isArray(data.samples) ? data.samples as Record<string, unknown>[] : [],
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [runId])

  if (!loading && !run) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
        <div style={{ fontWeight: 600 }}>Run not found</div>
        <Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', marginTop: '8px', display: 'inline-block' }}>
          ← Back to Rules
        </Link>
      </div>
    )
  }

  const ss = run ? (STATUS_STYLE[run.status] ?? STATUS_STYLE.error) : null

  // Determine columns from samples
  const sampleCols = run?.samples.length ? Object.keys(run.samples[0]) : []

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--background)', minHeight: '100%' }}>

      {/* breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <Link href="/rules" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Rules</Link>
        <span>›</span>
        <span style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>Run {runId.slice(0, 8)}…</span>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading run…</div>
      )}

      {!loading && run && ss && (
        <>
          {/* run summary card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>
                  {run.rule_name ?? 'Rule Run'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                  run {run.run_id}
                </div>
                {run.rule_type && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {run.rule_type.replace(/_/g, ' ')}
                    {run.severity && ` · ${run.severity}`}
                  </div>
                )}
              </div>
              <span style={{ ...ss, padding: '3px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                {run.status}
              </span>
            </div>

            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {[
                {
                  label: 'Quality Score',
                  value: run.quality_score != null ? `${Math.round(run.quality_score)}%` : '—',
                  color: scoreColor(run.quality_score),
                },
                { label: 'Total Rows', value: run.total_rows_scanned?.toLocaleString() ?? '—', color: 'var(--foreground)' },
                { label: 'Failed Rows', value: run.failed_rows_count?.toLocaleString() ?? '—', color: run.failed_rows_count ? '#dc2626' : '#16a34a' },
                { label: 'Failure %', value: run.failure_percentage != null ? `${run.failure_percentage.toFixed(2)}%` : '—', color: run.failure_percentage ? '#dc2626' : '#16a34a' },
                { label: 'Duration', value: fmtDuration(run.duration_ms), color: 'var(--foreground)' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Timestamps */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Started</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{fmtTs(run.execution_start_time)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Ended</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{fmtTs(run.execution_end_time)}</div>
              </div>
            </div>

            {/* Error message */}
            {run.error_message && (
              <div style={{ marginTop: '10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Error</div>
                <pre style={{ margin: 0, fontSize: '10px', color: '#7f1d1d', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{run.error_message}</pre>
              </div>
            )}
          </div>

          {/* Executed SQL (collapsible) */}
          {run.executed_sql && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <button
                onClick={() => setShowSql(p => !p)}
                style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>Executed SQL</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showSql ? '▲' : '▼'}</span>
              </button>
              {showSql && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                  <pre style={{ margin: 0, fontSize: '11px', color: 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--surface-muted)', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>
                    {run.executed_sql}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Failing samples table */}
          {run.samples.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
                  Failing Records Sample ({run.samples.length})
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-muted)' }}>
                      {sampleCols.map(col => (
                        <th key={col} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {run.samples.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                        {sampleCols.map(col => (
                          <td key={col} style={{ padding: '5px 12px', color: 'var(--foreground)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[col] == null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {run.status === 'passed' && run.failed_rows_count === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>✓</div>
              <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 'var(--text-sm)' }}>All rows passed</div>
              <div style={{ fontSize: 'var(--text-xs)', color: '#166534', marginTop: '4px' }}>
                {run.total_rows_scanned?.toLocaleString() ?? 0} rows checked — no failures found
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders**

With backend running, navigate to a rule run URL: `/rule-runs/{a-real-run-id}`.
Expected: page shows quality score card, optional failing samples table.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/rule-runs/
git commit -m "feat(rules): add rule run detail page with quality score and failing samples"
```

---

### Task 10: Update run-history and RulesClient to link to rule run detail

**Files:**
- Modify: `frontend/src/app/api/run-history/route.ts`

The `/api/run-history` route hits `GET /runs/enriched` but uses `run.job_id` and `run.job_name` in the mapping. The enriched DQRuleRun response has `rule_id` and `rule_name` instead. We also want the Detail link in run-history to go to `/rule-runs/{run_id}` instead of `/scan-jobs/...`.

- [ ] **Step 1: Update `/api/run-history/route.ts` to pass rule_id filter and normalize fields**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const ruleId = searchParams.get('rule_id')
    const assetId = searchParams.get('asset_id')
    let url = `${BACKEND}/runs/enriched?limit=200`
    if (ruleId) url += `&rule_id=${ruleId}`
    if (assetId) url += `&asset_id=${assetId}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data.items ?? [])

    // Normalize DQRuleRun fields to the shape run-history page expects
    const normalized = items.map(r => ({
      ...r,
      // Provide job_name from rule_name so the existing list UI can display it
      job_name: r.rule_name ?? r.job_name ?? r.rule_id ?? '—',
      job_id: r.rule_id ?? r.job_id ?? '',
      // run-history page uses assets_scanned; map from rule run counts
      assets_scanned: r.total_rows_scanned ?? r.assets_scanned ?? 0,
      // Signal that Detail link should use /rule-runs/ not /scan-jobs/
      run_type: 'rule_run',
    }))
    return NextResponse.json(normalized)
  } catch { return NextResponse.json([]) }
}
```

- [ ] **Step 2: Update `run-history/page.tsx` Detail link to support rule runs**

In `frontend/src/app/run-history/page.tsx`, find the Detail link (line ~200):
```typescript
<Link href={`/scan-jobs/${run.job_id}/runs/${run.run_id}`}
```

Replace with a conditional:
```typescript
<Link
  href={
    (run as Record<string, unknown>).run_type === 'rule_run'
      ? `/rule-runs/${run.run_id}`
      : `/scan-jobs/${run.job_id}/runs/${run.run_id}`
  }
  onClick={e => e.stopPropagation()}
  style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
  Detail →
</Link>
```

Also update the `Run` interface to include the optional `run_type` field:
```typescript
interface Run {
  run_id: string
  job_id: string
  job_name: string
  connection_name: string | null
  status: RunStatus
  trigger_type: string
  triggered_by: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  assets_scanned: number
  errors_count: number
  warnings_count: number
  error_message: string | null
  run_type?: string
}
```

- [ ] **Step 3: Verify rule runs appear in run history with correct Detail link**

Navigate to `/run-history`. Find a rule run entry. Click `Detail →` — should go to `/rule-runs/{runId}`, not to `/scan-jobs/...`.
Expected: Rule run detail page loads with quality score and failing samples.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/run-history/route.ts frontend/src/app/run-history/page.tsx
git commit -m "fix(run-history): normalize DQRuleRun fields and link Detail to /rule-runs/"
```

---

## Regression Checklist

After all tasks are complete, verify:

- [ ] `/rules` page loads — existing rules from backend appear
- [ ] Create rule modal → submit → rule appears in list after refresh (no store roundtrip)
- [ ] Edit rule drawer → save → changes persist after refresh
- [ ] Delete rule → rule removed from list and backend
- [ ] Approve a pending_review rule → status changes to `active`
- [ ] Reject a rule → status returns to `draft`
- [ ] Click ▶ on an active rule → real quality score appears (not 95–100% random)
- [ ] `/asset-registry` → select a table asset → "Rules" tab appears
- [ ] Rules tab shows rules assigned to that asset
- [ ] Rules tab → ▶ Run → quality score badge appears on the card
- [ ] Rules tab → quality score badge → links to `/rule-runs/{id}`
- [ ] `/rule-runs/{runId}` renders quality score, failed row counts, failing samples table
- [ ] `/run-history` → rule run entries have `Detail →` linking to `/rule-runs/{id}`
- [ ] TypeScript compiles without errors: `cd frontend && npx tsc --noEmit`

---

## Final Visible UI Changes

After this plan is implemented:

1. **Asset Detail Panel** — three tabs: Overview · Profiling · **Rules** (new)
   - Rules tab lists rules assigned to the asset
   - Each rule card shows name, type, severity, status, last run badge, ▶ Run button
   - "Manage rules →" link goes to `/rules?asset_id={id}`

2. **Rules page** — unchanged UI, but now actually persists to backend
   - Create/edit/delete rules land in the database
   - ▶ Run button executes real SQL, shows actual quality score

3. **Rule Run Detail** — new page at `/rule-runs/[runId]`
   - Quality score, total/failed row counts, failure percentage
   - Collapsible executed SQL panel
   - Failing records sample table (if any)

4. **Run History** — existing page, now links rule run Detail → to `/rule-runs/` instead of `/scan-jobs/`
