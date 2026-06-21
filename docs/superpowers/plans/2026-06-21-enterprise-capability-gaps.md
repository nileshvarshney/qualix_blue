# Enterprise Capability Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-impact gaps in the Enterprise Capability Assessment, promoting Metadata & Catalog from PARTIAL → BUILT and reducing gaps in Classification & Sensitivity, Compliance & Audit, and Stewardship & Collaboration.

**Architecture:** Four sequential batches executed in enterprise-impact order. Each batch implements frontend features and Next.js API proxy-layer logic only — no backend service changes. Pure utility functions (masking, audit pattern detection) are framework-agnostic and verified with TypeScript compile checks. The `SensitivityBadge` component is extracted first as shared infrastructure for Tasks 3 and 4.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript 5, no test framework — verification is `npx tsc --noEmit` for type safety + manual browser checks via `npm run dev`.

## Global Constraints

- All files live under `frontend/src/` — every path in this plan is relative to that root
- Backend URL is `process.env.BACKEND_URL || 'http://localhost:8000'`; always alias it as `const B = process.env.BACKEND_URL || 'http://localhost:8000'`
- All proxy routes must include `export const dynamic = 'force-dynamic'` at the top
- All proxy routes forward the `Authorization` header from the incoming request: `headers: { Authorization: req.headers.get('Authorization') ?? '' }`
- Never use `any` — use `unknown` and narrow with type guards
- CSS uses CSS variables (`var(--accent)`, `var(--border)`, etc.) — never hardcode colours that already have a variable
- The `SENS_STYLE` colour map after Task 1 lives only in `SensitivityBadge.tsx` — do not duplicate it
- Commits use imperative subject lines under 72 chars; co-author line: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## Batch 1 — Metadata & Catalog → BUILT

---

### Task 1: SensitivityBadge shared component

**Files:**
- Create: `app/components/asset-registry/SensitivityBadge.tsx`
- Modify: `app/catalog/page.tsx` — remove inline `SENS_STYLE` + badge rendering, import `SensitivityBadge`

**Interfaces:**
- Produces: `export function SensitivityBadge({ classification }: { classification: string | null | undefined }): React.ReactElement | null`

- [ ] **Step 1: Create `SensitivityBadge.tsx`**

```tsx
// src/components/asset-registry/SensitivityBadge.tsx
const SENS_STYLE: Record<string, { bg: string; color: string }> = {
  PHI:          { bg: '#fef2f2', color: '#dc2626' },
  PII:          { bg: '#fff7ed', color: '#c2410c' },
  RESTRICTED:   { bg: '#fff1f2', color: '#be123c' },
  CONFIDENTIAL: { bg: '#fefce8', color: '#a16207' },
  SENSITIVE:    { bg: '#eff6ff', color: '#1d4ed8' },
}

export function SensitivityBadge({ classification }: { classification: string | null | undefined }) {
  if (!classification) return null
  const s = SENS_STYLE[classification]
  if (!s) return null
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '1px 5px', borderRadius: '3px',
      fontSize: '9px', fontWeight: 600,
      whiteSpace: 'nowrap', textTransform: 'capitalize',
      flexShrink: 0,
    }}>
      {classification}
    </span>
  )
}
```

- [ ] **Step 2: Update `catalog/page.tsx` to use the shared component**

At the top of `catalog/page.tsx`, remove the inline `SENS_STYLE` definition (lines that declare the `const SENS_STYLE` object) and the inline badge JSX inside `TableRow`. Add the import:

```tsx
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'
```

In `TableRow`, replace the inline sensitivity badge JSX:
```tsx
// BEFORE (remove this):
{sensStyle ? sensitivity!.classification! : sensitivity?.count === 0 ? '—' : sensitivity == null ? '' : '…'}

// AFTER (replace the entire sensitivity cell with):
<SensitivityBadge classification={sensitivity?.classification} />
```

Also remove `const sensStyle = sensitivity?.classification ? SENS_STYLE[sensitivity.classification] : null` from the top of `TableRow`.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Open `http://localhost:3000/catalog` — sensitivity badges should render identically to before (same colors, same text). No visual regression.

- [ ] **Step 5: Commit**

```bash
git add src/components/asset-registry/SensitivityBadge.tsx src/app/catalog/page.tsx
git commit -m "$(cat <<'EOF'
refactor: extract SensitivityBadge into shared component

Removes inline SENS_STYLE duplication from catalog/page.tsx in
preparation for use in AssetTreePanel and future list views.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Glossary bulk-asset-links proxy route

**Files:**
- Create: `app/api/glossary/bulk-asset-links/route.ts`

**Interfaces:**
- Produces: `GET /api/glossary/bulk-asset-links?asset_ids=id1,id2,...` → `Record<string, { term_id: string; name: string }[]>`

- [ ] **Step 1: Create the proxy route**

```ts
// src/app/api/glossary/bulk-asset-links/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('asset_ids') ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({})

  const auth = req.headers.get('Authorization') ?? ''

  // Try bulk endpoint first; fall back to parallel individual calls
  try {
    const bulk = await fetch(
      `${B}/glossary/assets/bulk?asset_ids=${ids.join(',')}`,
      { headers: { Authorization: auth }, cache: 'no-store' },
    )
    if (bulk.ok) {
      const data = await bulk.json() as Record<string, unknown>
      // Normalise: backend may return { [assetId]: [{term_id, name}] }
      const result: Record<string, { term_id: string; name: string }[]> = {}
      for (const [id, terms] of Object.entries(data)) {
        if (Array.isArray(terms)) {
          result[id] = terms.map((t: Record<string, unknown>) => ({
            term_id: String(t.term_id ?? t.id ?? ''),
            name:    String(t.term_name ?? t.name ?? ''),
          }))
        }
      }
      return NextResponse.json(result)
    }
  } catch { /* fall through to individual calls */ }

  // Fallback: one call per asset_id in parallel
  const settled = await Promise.allSettled(
    ids.map(async id => {
      const r = await fetch(`${B}/glossary?asset_id=${id}`, {
        headers: { Authorization: auth }, cache: 'no-store',
      })
      const data = await r.json().catch(() => []) as Record<string, unknown>[]
      const terms = Array.isArray(data) ? data : []
      return {
        id,
        terms: terms.map((t: Record<string, unknown>) => ({
          term_id: String(t.id ?? t.term_id ?? ''),
          name:    String(t.name ?? t.term_name ?? ''),
        })),
      }
    })
  )

  const result: Record<string, { term_id: string; name: string }[]> = {}
  for (const r of settled) {
    if (r.status === 'fulfilled') result[r.value.id] = r.value.terms
  }
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Smoke-test the route**

```bash
curl "http://localhost:3000/api/glossary/bulk-asset-links?asset_ids=test-id-1,test-id-2"
```

Expected: JSON object (may be `{}` if backend returns nothing, but no 500 error).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/glossary/bulk-asset-links/route.ts
git commit -m "$(cat <<'EOF'
feat: add glossary bulk-asset-links proxy route

Fetches linked glossary terms for multiple asset IDs in one call.
Falls back to parallel individual requests if backend lacks bulk endpoint.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Catalog page — glossary term badges + domain/sensitivity bulk edit

**Files:**
- Modify: `app/catalog/page.tsx`

**Interfaces:**
- Consumes: `GET /api/glossary/bulk-asset-links` from Task 2; `SensitivityBadge` from Task 1
- Consumes: existing `GET /api/domains` (already used in governance page)

- [ ] **Step 1: Add `termLinks` state and background fetch**

Inside the `CatalogPage` component, after the existing `sensLoaded` ref, add:

```tsx
const [termLinks, setTermLinks] = useState<Record<string, { term_id: string; name: string }[]>>({})
const termLinksLoaded = useRef(false)
```

Inside the existing `useEffect` that fetches assets (the one calling `/api/catalog`), after the sensitivity fetch block, add a parallel glossary fetch:

```tsx
// After sensitivity fetch inside the assets useEffect:
if (!termLinksLoaded.current && list.length > 0) {
  termLinksLoaded.current = true
  const ids = list.map((a: Asset) => a.asset_id).join(',')
  fetch(`/api/glossary/bulk-asset-links?asset_ids=${ids}`)
    .then(r => r.json())
    .then(data => {
      if (data && typeof data === 'object') {
        setTermLinks(data as Record<string, { term_id: string; name: string }[]>)
      }
    })
    .catch(() => {})
}
```

- [ ] **Step 2: Add domains state and fetch**

```tsx
const [domains, setDomains] = useState<string[]>([])
```

Add a `useEffect` to fetch domain names:

```tsx
useEffect(() => {
  fetch('/api/domains')
    .then(r => r.json())
    .then(data => {
      const list = Array.isArray(data) ? data : []
      setDomains(list.map((d: Record<string, unknown>) => String(d.name ?? d.domain_name ?? '')).filter(Boolean))
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 3: Extend `bulkPatch` type and `applyBulk`**

Change the state type:

```tsx
const [bulkPatch, setBulkPatch] = useState<{
  criticality?: string
  certification_status?: string
  owner_name?: string
  domain_name?: string
  sensitivity?: string
}>({})
```

In `applyBulk`, add after the existing owner_name line:

```tsx
if (bulkPatch.domain_name) patch.domain_name = bulkPatch.domain_name
if (bulkPatch.sensitivity)  patch.sensitivity  = bulkPatch.sensitivity
```

- [ ] **Step 4: Add term-link popover state to `TableRow`**

Update `TableRow`'s props interface to accept `termLinks`:

```tsx
function TableRow({ asset, sensitivity, termLinks, selected, onToggleSelect, onClick }: {
  asset: Asset
  sensitivity?: { classification: string | null; count: number }
  termLinks?: { term_id: string; name: string }[]
  selected: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  onClick: () => void
}) {
```

Inside `TableRow`, add popover state and click-outside ref:

```tsx
const [popoverOpen, setPopoverOpen] = useState(false)
const popoverRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!popoverOpen) return
  function handleClick(e: MouseEvent) {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setPopoverOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClick)
  return () => document.removeEventListener('mousedown', handleClick)
}, [popoverOpen])
```

- [ ] **Step 5: Update grid template and header row**

Change the grid template from 9 to 10 columns in both `TableRow` and the header `<div>`:

```tsx
// In TableRow style:
gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px 65px 60px',

// In header div:
gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px 65px 60px',
```

Update the headers array in the column header row (add `'Terms'` at the end):

```tsx
{['Table', 'Domain › Subdomain', 'Owner', 'Certification', 'Criticality', 'Quality', 'Status', 'Sensitivity', 'Terms'].map(h => (
  <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
))}
```

- [ ] **Step 6: Add the Terms column cell to `TableRow`**

After the existing Sensitivity cell in `TableRow`, add a 10th cell:

```tsx
{/* Terms column */}
<div style={{ position: 'relative' }} ref={popoverRef}>
  {termLinks && termLinks.length > 0 ? (
    <button
      onClick={e => { e.stopPropagation(); setPopoverOpen(o => !o) }}
      style={{
        background: 'var(--accent-bg)', color: 'var(--accent)',
        border: '1px solid var(--accent)', borderRadius: '10px',
        fontSize: '9px', fontWeight: 700, padding: '1px 6px',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {termLinks.length} term{termLinks.length > 1 ? 's' : ''}
    </button>
  ) : (
    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
  )}
  {popoverOpen && termLinks && termLinks.length > 0 && (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      padding: '8px 0', minWidth: '160px',
    }}>
      {termLinks.map(t => (
        <a
          key={t.term_id}
          href={`/glossary?term=${t.term_id}`}
          onClick={e => e.stopPropagation()}
          style={{
            display: 'block', padding: '5px 12px',
            fontSize: '11px', color: 'var(--foreground)',
            textDecoration: 'none',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {t.name}
        </a>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 7: Pass `termLinks` prop where `TableRow` is rendered**

In the asset rendering section (inside the `schemaOpen && tables.map(...)` block):

```tsx
<TableRow
  key={a.asset_id}
  asset={a}
  sensitivity={sensitivities[a.asset_id]}
  termLinks={termLinks[a.asset_id]}
  selected={selected.has(a.asset_id)}
  onToggleSelect={e => toggleSelect(e, a.asset_id)}
  onClick={() => setPopup(a)}
/>
```

- [ ] **Step 8: Add Domain and Sensitivity selects to the bulk action bar**

Inside the existing `{selected.size > 0 && ...}` floating bar, after the owner input and before the error span, add:

```tsx
<select
  value={bulkPatch.domain_name ?? ''}
  onChange={e => setBulkPatch(p => ({ ...p, domain_name: e.target.value || undefined }))}
  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
>
  <option value="">Domain…</option>
  {domains.map(d => <option key={d} value={d}>{d}</option>)}
</select>
<select
  value={bulkPatch.sensitivity ?? ''}
  onChange={e => setBulkPatch(p => ({ ...p, sensitivity: e.target.value || undefined }))}
  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
>
  <option value="">Sensitivity…</option>
  {['PHI', 'PII', 'RESTRICTED', 'CONFIDENTIAL', 'SENSITIVE', 'PUBLIC'].map(s => (
    <option key={s} value={s}>{s}</option>
  ))}
</select>
```

- [ ] **Step 9: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 10: Verify in browser**

- Open `/catalog` — column headers now show a 10th "Terms" column
- Assets with linked glossary terms show a blue pill (e.g. "2 terms"); click it to see a popover with term names; click a term name to navigate to `/glossary?term=<id>`
- Assets with no linked terms show `—`
- Select 2+ assets — the bulk bar now has Domain and Sensitivity dropdowns alongside the existing ones
- Change Domain on selected assets and click Apply — the assets update in the list

- [ ] **Step 11: Commit**

```bash
git add src/app/catalog/page.tsx
git commit -m "$(cat <<'EOF'
feat(catalog): glossary term badges, domain+sensitivity bulk edit

- 10th "Terms" column shows linked glossary term count per asset
- Click pill → popover with term names linking to /glossary
- Bulk edit bar gains Domain and Sensitivity selects

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: AssetTreePanel — sensitivity badges

**Files:**
- Modify: `app/components/asset-registry/AssetTreePanel.tsx`

**Interfaces:**
- Consumes: `SensitivityBadge` from Task 1; existing `POST /api/catalog/sensitivity`
- Consumes: `NodeRow` function signature — add `sensitivities` prop

- [ ] **Step 1: Import `SensitivityBadge` and add `sensitivities` prop to `NodeRow`**

At the top of `AssetTreePanel.tsx` add:

```tsx
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'
```

Update the `NodeRow` props to include the sensitivities map:

```tsx
function NodeRow({
  node, depth, onSelect, selectedId, onToggle, sensitivities,
}: {
  node: TreeNode; depth: number; onSelect: (id: string) => void
  selectedId: string | null; onToggle: (id: string) => void
  sensitivities: Record<string, { classification: string | null; count: number }>
}) {
```

Inside the `NodeRow` return, add the badge after the status dot span (after `<span style={{ width: '6px', height: '6px'...`):

```tsx
<SensitivityBadge classification={sensitivities[node.asset_id]?.classification} />
```

In the recursive render at the bottom of `NodeRow`, pass `sensitivities` through:

```tsx
{node._expanded && node.children.map(child => (
  <NodeRow key={child.asset_id} node={child} depth={depth + 1}
    onSelect={onSelect} selectedId={selectedId} onToggle={onToggle}
    sensitivities={sensitivities} />
))}
```

- [ ] **Step 2: Add sensitivities state and fetch to `AssetTreePanel`**

Inside the `AssetTreePanel` forwardRef component body, add after existing state declarations:

```tsx
const [sensitivities, setSensitivities] = useState<Record<string, { classification: string | null; count: number }>>({})
const sensLoaded = useRef(false)
```

Add a `useEffect` that fires when the tree nodes change to collect all leaf asset IDs and batch-fetch sensitivity:

```tsx
useEffect(() => {
  if (sensLoaded.current) return
  // Collect all leaf node IDs (tables and views)
  function collectLeafIds(nodes: TreeNode[]): string[] {
    const ids: string[] = []
    for (const n of nodes) {
      if (n.asset_type === 'table' || n.asset_type === 'view') ids.push(n.asset_id)
      if (n.children.length > 0) ids.push(...collectLeafIds(n.children))
    }
    return ids
  }
  const ids = collectLeafIds(nodes)
  if (ids.length === 0) return
  sensLoaded.current = true
  fetch('/api/catalog/sensitivity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_ids: ids }),
  })
    .then(r => r.json())
    .then(data => {
      if (data && typeof data === 'object') {
        setSensitivities(data as Record<string, { classification: string | null; count: number }>)
      }
    })
    .catch(() => {})
}, [nodes])
```

- [ ] **Step 3: Pass `sensitivities` to every `NodeRow` render call**

Find the place(s) in the `AssetTreePanel` return where `NodeRow` is rendered (typically inside a `.map()`) and add `sensitivities={sensitivities}`:

```tsx
<NodeRow
  key={node.asset_id}
  node={node}
  depth={0}
  onSelect={handleSelect}
  selectedId={selectedId}
  onToggle={handleToggle}
  sensitivities={sensitivities}
/>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Verify in browser**

Open `/asset-registry` — expand a source → database → schema → table nodes. Table and view leaf nodes should show a sensitivity badge (e.g. "PII") if the asset has classifications. Nodes without classifications show nothing.

- [ ] **Step 6: Commit**

```bash
git add src/components/asset-registry/AssetTreePanel.tsx
git commit -m "$(cat <<'EOF'
feat(asset-registry): sensitivity badges in tree panel

Batch-fetches sensitivity classifications after tree loads and renders
SensitivityBadge on each table/view leaf node.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Assessment update — Metadata & Catalog → BUILT

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Update the Metadata & Catalog area in the Enterprise Capability Assessment**

Find the `area: 'Metadata & Catalog'` entry in the `areas` array (around line 732) and change:

```tsx
// Change status:
status: 'built',

// Replace exists text:
exists: 'Catalog page has a tree-view hierarchy (connection → database → schema → table) with asset detail drawer showing ownership badges, certification status, domain assignment, and search across table name, schema, domain, and owner. Datasets page (asset-registry) shows live Snowflake table metadata — column names, types, nullability, row counts, bytes, and a live 20-row data preview loaded lazily on expand. Glossary page manages business terms with full CRUD, domain/owner/synonym fields, and a status workflow (draft → pending_review → approved/deprecated) backed by /api/glossary. Glossary term-to-asset linking is fully built — a modal UI with table/column selection, backend link-asset endpoints, and inline unlink buttons. Column sensitivity tags are visible in the asset detail drawer via AssetColumnsSection, in the Catalog list view as a 9th column (batch-fetched via /api/catalog/sensitivity), and in the Asset Registry tree panel on each leaf node. The asset detail drawer includes a collapsible "Linked Glossary Terms" section. Catalog list rows show a "N terms" badge for each asset with linked glossary terms — clicking shows a popover listing term names with links to /glossary. Bulk edit bar handles criticality, certification, owner, domain, and sensitivity in one action.',

// Replace gaps text:
gaps: 'No metadata versioning (schema version history for detecting structural changes over time requires backend tracking). No bulk tag management across multiple connections simultaneously.',
```

- [ ] **Step 2: Update the footer note**

Find the footer `<div>` at the bottom of the `{tab === 'roadmap' && ...}` section and update the `Last updated:` sentence:

```tsx
// Replace the existing footer content string with:
'Internal reference only — not shown to end users. All capability statuses verified against source code, June 2026. Last updated: Metadata & Catalog promoted PARTIAL → BUILT. Changes: sensitivity in Asset Registry tree, glossary term badges on Catalog list rows, domain+sensitivity added to bulk edit bar.'
```

- [ ] **Step 3: Type-check and verify**

```bash
cd frontend && npx tsc --noEmit
```

Open `/settings` → Under Development tab → Enterprise Capability Assessment. Metadata & Catalog row should now show a green "BUILT" badge. The header badge counts should update (now shows 2 BUILT instead of 1).

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(assessment): promote Metadata & Catalog PARTIAL → BUILT

Reflects implemented items: sensitivity in tree panel, glossary term
badges on catalog rows, domain+sensitivity in bulk edit bar.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 2 — Classification & Sensitivity (PARTIAL+)

---

### Task 6: Privacy page — Sensitivity by Domain section

**Files:**
- Create: `app/api/classifications/summary/route.ts`
- Modify: `app/privacy/page.tsx`

**Interfaces:**
- Produces: `GET /api/classifications/summary` → `{ domains: { name: string; counts: Record<string, number>; total: number }[] }`

- [ ] **Step 1: Create the summary proxy route**

```ts
// src/app/api/classifications/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(`${B}/classifications/summary`, {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
      cache: 'no-store',
    })
    if (r.ok) return NextResponse.json(await r.json())
  } catch { /* fall through to mock */ }

  // Fallback: build summary from per-asset sensitivity if backend lacks endpoint
  try {
    const assetsRes = await fetch(`${B}/catalog`, {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
      cache: 'no-store',
    })
    if (!assetsRes.ok) return NextResponse.json({ domains: [] })
    const assets = await assetsRes.json() as Record<string, unknown>[]

    // Group by domain_name
    const domainMap = new Map<string, Record<string, number>>()
    for (const a of Array.isArray(assets) ? assets : []) {
      const domain = String(a.domain_name ?? a.domain ?? 'Unassigned')
      const sens   = String(a.sensitivity ?? '')
      if (!sens) continue
      if (!domainMap.has(domain)) domainMap.set(domain, {})
      const counts = domainMap.get(domain)!
      counts[sens] = (counts[sens] ?? 0) + 1
    }

    const domains = Array.from(domainMap.entries()).map(([name, counts]) => ({
      name,
      counts,
      total: Object.values(counts).reduce((s, n) => s + n, 0),
    })).sort((a, b) => b.total - a.total)

    return NextResponse.json({ domains })
  } catch {
    return NextResponse.json({ domains: [] })
  }
}
```

- [ ] **Step 2: Add `SensitivityByDomain` section to `privacy/page.tsx`**

At the top of `privacy/page.tsx`, add the import and type:

```tsx
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'

type DomainSummary = {
  name: string
  counts: Record<string, number>
  total: number
}
```

Inside the main `PrivacyPage` component (or the default export function), add state:

```tsx
const [domainSummary, setDomainSummary] = useState<DomainSummary[]>([])
const [domainSummaryLoading, setDomainSummaryLoading] = useState(true)
const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
```

Add a `useEffect` to fetch the summary:

```tsx
useEffect(() => {
  fetch('/api/classifications/summary')
    .then(r => r.json())
    .then(data => {
      if (data && Array.isArray(data.domains)) setDomainSummary(data.domains as DomainSummary[])
    })
    .catch(() => {})
    .finally(() => setDomainSummaryLoading(false))
}, [])
```

- [ ] **Step 3: Render the Sensitivity by Domain section**

In the JSX of `privacy/page.tsx`, add a new section **before** the existing tab bar (so it appears at the top of the page regardless of which tab is active):

```tsx
{/* Sensitivity by Domain */}
<div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '20px' }}>
  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Sensitivity by Domain</span>
    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>classified assets per domain</span>
  </div>
  {domainSummaryLoading ? (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
  ) : domainSummary.length === 0 ? (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No classified assets found</div>
  ) : (
    <div>
      {domainSummary.map((d, i) => (
        <div key={d.name} style={{ borderBottom: i < domainSummary.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div
            onClick={() => setExpandedDomains(prev => {
              const next = new Set(prev)
              if (next.has(d.name)) next.delete(d.name) else next.add(d.name)
              return next
            })}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', cursor: 'pointer' }}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px' }}>
              {expandedDomains.has(d.name) ? '▼' : '▶'}
            </span>
            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--foreground)', flex: 1 }}>{d.name}</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {Object.entries(d.counts).map(([cls, count]) => (
                <span key={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <SensitivityBadge classification={cls} />
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{count}</span>
                </span>
              ))}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '30px', textAlign: 'right' }}>
              {d.total}
            </span>
          </div>
          {expandedDomains.has(d.name) && (
            <div style={{ padding: '0 20px 10px 40px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {Object.entries(d.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([cls, count]) => (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                    <SensitivityBadge classification={cls} />
                    <span>{count} asset{count > 1 ? 's' : ''}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Verify in browser**

Open `/privacy` — a "Sensitivity by Domain" section appears above the existing tabs. Each domain row shows sensitivity breakdown badges. Clicking a row expands to show per-classification counts.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/classifications/summary/route.ts src/app/privacy/page.tsx
git commit -m "$(cat <<'EOF'
feat(privacy): Sensitivity by Domain drill-down section

Adds per-domain sensitivity breakdown at top of /privacy page.
Fetches /api/classifications/summary; falls back to building from
/catalog assets if backend lacks the aggregate endpoint.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Proxy-layer data masking

**Files:**
- Create: `lib/masking.ts`
- Modify: `app/api/asset-registry/[...path]/route.ts`

**Interfaces:**
- Produces: `export function maskSensitiveColumns(data: unknown, userRole: string, sensitivityMap: Record<string, string>): unknown`

- [ ] **Step 1: Create `lib/masking.ts`**

```ts
// src/lib/masking.ts
const MASK_PLACEHOLDER = '***'
const SENSITIVE_LEVELS = new Set(['PII', 'PHI', 'CONFIDENTIAL'])
const TRUSTED_ROLES = new Set(['admin', 'data_steward', 'data_owner'])

/**
 * Walks `data` looking for arrays of plain objects (row arrays).
 * For each column whose name appears in sensitivityMap with a sensitive level,
 * replaces the value with MASK_PLACEHOLDER if the user's role is not trusted.
 * Never mutates input — returns a deep copy of affected structures.
 */
export function maskSensitiveColumns(
  data: unknown,
  userRole: string,
  sensitivityMap: Record<string, string>,
): unknown {
  if (TRUSTED_ROLES.has(userRole)) return data
  if (!hasSensitiveColumns(sensitivityMap)) return data
  return walk(data, sensitivityMap)
}

function hasSensitiveColumns(map: Record<string, string>): boolean {
  return Object.values(map).some(v => SENSITIVE_LEVELS.has(v))
}

function walk(node: unknown, map: Record<string, string>): unknown {
  if (Array.isArray(node)) {
    return node.map(item => walk(item, map))
  }
  if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const sens = map[key]
      if (sens && SENSITIVE_LEVELS.has(sens)) {
        result[key] = MASK_PLACEHOLDER
      } else {
        result[key] = walk(value, map)
      }
    }
    return result
  }
  return node
}

export function extractUserRole(authHeader: string): string {
  if (!authHeader.startsWith('Bearer ')) return 'viewer'
  try {
    const payload = authHeader.slice(7).split('.')[1]
    const decoded = JSON.parse(atob(payload)) as Record<string, unknown>
    return String(decoded.role ?? decoded.user_role ?? 'viewer')
  } catch {
    return 'viewer'
  }
}
```

- [ ] **Step 2: Verify `masking.ts` logic manually**

Create a temporary verification script (delete after confirming):

```bash
cat > /tmp/verify-masking.mjs << 'EOF'
// Quick inline verification — not a permanent test file
import { maskSensitiveColumns, extractUserRole } from './src/lib/masking.js'

const sensitivityMap = { email: 'PII', dob: 'PHI', name: 'SENSITIVE', id: 'PUBLIC' }
const rows = [{ id: '1', email: 'user@example.com', dob: '1990-01-01', name: 'Alice' }]

const masked = maskSensitiveColumns(rows, 'viewer', sensitivityMap)
console.assert(masked[0].email === '***', 'PII column should be masked')
console.assert(masked[0].dob === '***', 'PHI column should be masked')
console.assert(masked[0].name === 'Alice', 'SENSITIVE (not in mask list) should pass through')
console.assert(masked[0].id === '1', 'PUBLIC column should pass through')

const unmasked = maskSensitiveColumns(rows, 'admin', sensitivityMap)
console.assert(unmasked[0].email === 'user@example.com', 'admin should see unmasked data')

console.log('All assertions passed')
EOF
```

Note: run after build or via tsx if available. For now, `npx tsc --noEmit` is the gate.

- [ ] **Step 3: Check existing asset-registry proxy route**

```bash
cat frontend/src/app/api/asset-registry/\[...path\]/route.ts
```

Note the current structure so you know where to intercept.

- [ ] **Step 4: Add masking to the asset-registry proxy**

Read the current contents of `src/app/api/asset-registry/[...path]/route.ts`, then add the masking integration. The file proxies requests to the backend — intercept the response for GET requests that include `/profiling` or `/preview` in the path (these contain row-level data):

At the top of the file, add the import:

```ts
import { maskSensitiveColumns, extractUserRole } from '@/lib/masking'
```

Add a sensitivity cache (module-level, not inside the handler):

```ts
const sensCache = new Map<string, { data: Record<string, string>; expires: number }>()
const SENS_TTL = 5 * 60 * 1000 // 5 minutes
```

Add a helper to fetch sensitivity for an asset:

```ts
async function getSensitivityMap(assetId: string, auth: string): Promise<Record<string, string>> {
  const cached = sensCache.get(assetId)
  if (cached && Date.now() < cached.expires) return cached.data
  try {
    const r = await fetch(
      `${process.env.BACKEND_URL || 'http://localhost:8000'}/classifications/assets/${assetId}/classifications`,
      { headers: { Authorization: auth }, cache: 'no-store' },
    )
    const items = await r.json().catch(() => []) as Record<string, unknown>[]
    const map: Record<string, string> = {}
    if (Array.isArray(items)) {
      for (const item of items) {
        const col  = String(item.column_name ?? item.column ?? '')
        const sens = String(item.classification ?? item.suggested_classification ?? '')
        if (col && sens) map[col] = sens
      }
    }
    sensCache.set(assetId, { data: map, expires: Date.now() + SENS_TTL })
    return map
  } catch {
    return {}
  }
}
```

Inside the GET handler, after fetching the backend response and checking `r.ok`, add masking for profiling/preview paths:

```ts
// After: const data = await r.json()
// Add before returning:
const pathStr = params.path?.join('/') ?? ''
if (pathStr.includes('profiling') || pathStr.includes('preview') || pathStr.includes('sample')) {
  const secRes = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8000'}/security`, {
    headers: { Authorization: auth }, cache: 'no-store',
  }).catch(() => null)
  const secSettings = secRes?.ok ? await secRes.json().catch(() => ({})) as Record<string, unknown> : {}
  if (secSettings.column_level_access_control === true) {
    // Extract asset_id from the path: /asset-registry/{assetId}/profiling
    const assetId = params.path?.[0] ?? ''
    const sensitivityMap = await getSensitivityMap(assetId, auth)
    const role = extractUserRole(auth)
    return NextResponse.json(maskSensitiveColumns(data, role, sensitivityMap))
  }
}
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Verify in browser**

- Open `/security` → enable "Column-Level Access Control" toggle → save
- Open `/asset-registry`, select a table with PII/CONFIDENTIAL columns, open the Profiling or Data Preview tab
- Columns classified as PII or PHI should show `***` instead of real values (for non-admin roles)
- As admin user, columns remain unmasked

- [ ] **Step 7: Commit**

```bash
git add src/lib/masking.ts src/app/api/asset-registry/\[...path\]/route.ts
git commit -m "$(cat <<'EOF'
feat(security): proxy-layer PII/PHI column masking

maskSensitiveColumns() replaces PII/PHI/CONFIDENTIAL column values with
*** in profiling and preview responses when column-level access control
is enabled in /security settings. Trusted roles (admin, data_steward,
data_owner) bypass masking. 5-minute sensitivity map cache per asset.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Assessment update — Classification & Sensitivity

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Update Classification & Sensitivity area**

Find `area: 'Classification & Sensitivity'` and update:

```tsx
// exists — append after the existing text:
exists: '... (keep existing text) ... The /privacy page now has a "Sensitivity by Domain" section at the top showing per-domain sensitivity breakdowns with expandable rows. Each domain row shows sensitivity badge counts; expanding reveals per-classification asset counts. Section fetches /api/classifications/summary. Proxy-layer data masking is active: when "Column-Level Access Control" is enabled in /security settings, the asset-registry proxy intercepts profiling and preview responses and replaces PII, PHI, and CONFIDENTIAL column values with *** for non-trusted roles (trusted: admin, data_steward, data_owner). 5-minute sensitivity map cache per asset.',

// gaps — replace with:
gaps: 'No remediation at warehouse query time — masking applies at the Next.js proxy layer only; a user who queries the warehouse directly bypasses it (requires backend enforcement). No consent management or data residency configuration.',
```

- [ ] **Step 2: Update footer note**

Append to the footer note: `Classification & Sensitivity: Privacy page drill-down section + proxy-layer masking added.`

- [ ] **Step 3: Type-check and verify badge counts**

Open `/settings` → Under Development. Classification & Sensitivity still shows PARTIAL but the gaps text is now shorter and more accurate.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(assessment): update Classification & Sensitivity gaps

Reflects: Privacy page domain drill-down, proxy-layer masking.
Remaining gaps: warehouse-level enforcement, consent management.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 3 — Compliance & Audit (PARTIAL+)

---

### Task 9: Compliance controls auto-load

**Files:**
- Modify: `app/compliance/page.tsx`

- [ ] **Step 1: Add `autoMapFiredRef` and `autoMapStatus` state**

Inside the `CompliancePage` component, after existing state declarations:

```tsx
const autoMapFiredRef = useRef<string | null>(null) // tracks which frameworkId auto-map was fired for
const [autoMapStatus, setAutoMapStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
```

- [ ] **Step 2: Add auto-map trigger inside the controls `useEffect`**

The existing controls `useEffect` (keyed on `[selectedFw]`) fetches controls and calls `setControls`. After `setControlsLoading(false)`, add:

```tsx
.then(data => {
  const items = Array.isArray(data) ? data : []
  setControls(items.map((c: Record<string, unknown>) => ({
    // ... existing mapping unchanged ...
  })))
  setControlsLoading(false)

  // AUTO-MAP: if controls came back empty and we haven't fired for this framework yet
  if (items.length === 0 && selectedFw && autoMapFiredRef.current !== selectedFw) {
    autoMapFiredRef.current = selectedFw
    setAutoMapStatus('running')
    fetch(`/api/compliance/${selectedFw}/auto-map`, { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        setAutoMapStatus('done')
        // Re-fetch controls after auto-map completes
        return fetch(`/api/compliance/${selectedFw}/controls`)
          .then(r2 => r2.json())
          .then(d2 => {
            const mapped = Array.isArray(d2) ? d2 : []
            setControls(mapped.map((c: Record<string, unknown>) => ({
              id: String(c.req_id ?? ''),
              code: String(c.req_code ?? ''),
              name: String(c.req_name ?? ''),
              description: String(c.req_description ?? ''),
              framework: String(c.framework_name ?? ''),
              status: (c.status as 'passed' | 'failed' | 'not-assessed') ?? 'not-assessed',
              rulesMapped: Number(c.rules_mapped ?? 0),
              lastAssessed: c.last_assessed ? String(c.last_assessed).slice(0, 10) : null,
              evidence: String(c.evidence ?? ''),
              ruleTypes: String(c.dq_rule_types ?? ''),
            })))
          })
      })
      .catch(() => setAutoMapStatus('error'))
  }
})
```

- [ ] **Step 3: Render the auto-map status notice**

In the JSX, in the controls table section, add a status notice above the table (after the controls header row, before the table rows):

```tsx
{autoMapStatus === 'running' && (
  <div style={{ padding: '8px 16px', background: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent)', marginBottom: '8px' }}>
    Mapping rules to controls… this may take a moment.
  </div>
)}
{autoMapStatus === 'error' && (
  <div style={{ padding: '8px 16px', background: 'var(--status-warn-bg)', border: '1px solid var(--status-warn-text)', borderRadius: '6px', fontSize: '12px', color: 'var(--status-warn-text)', marginBottom: '8px' }}>
    Auto-mapping failed — use the Manual Auto-Map button below.
  </div>
)}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Verify in browser**

Open `/compliance`, select a framework that has no controls. The "Mapping rules to controls…" notice should appear briefly, then the controls table should populate automatically without any button click.

- [ ] **Step 6: Commit**

```bash
git add src/app/compliance/page.tsx
git commit -m "$(cat <<'EOF'
feat(compliance): auto-load controls when framework has none

On framework selection, if controls table is empty, automatically fires
auto-map endpoint and reloads controls. Guards against repeat calls per
framework with autoMapFiredRef.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Suspicious activity detection in audit log

**Files:**
- Create: `lib/auditPatterns.ts`
- Modify: `app/api/audit/route.ts`
- Modify: `app/audit-logs/page.tsx`

**Interfaces:**
- Produces: `export function detectSuspiciousActivity(entries: AuditEntry[]): AuditEntry[]`

- [ ] **Step 1: Create `lib/auditPatterns.ts`**

```ts
// src/lib/auditPatterns.ts
export type AuditEntry = {
  user?: string
  result?: string
  timestamp?: string
  action?: string
  _suspicious?: boolean
  _suspiciousReason?: string
  [key: string]: unknown
}

const FAILURE_THRESHOLD   = 3
const BULK_ACCESS_THRESHOLD = 5
const FAILURE_WINDOW_MS   = 60_000 // 1 minute
const OFF_HOURS_START_UTC = 6   // 06:00
const OFF_HOURS_END_UTC   = 22  // 22:00
const BULK_ACTIONS        = new Set(['read', 'export', 'download', 'query'])

export function detectSuspiciousActivity(entries: AuditEntry[]): AuditEntry[] {
  const flagged = new Map<number, { reason: string }>()

  // Pattern 1: repeated failures
  const failureMap = new Map<string, { idx: number; ts: number }[]>()
  entries.forEach((e, i) => {
    if (e.result !== 'failure' || !e.user) return
    const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0
    if (!failureMap.has(e.user)) failureMap.set(e.user, [])
    failureMap.get(e.user)!.push({ idx: i, ts })
  })
  for (const events of failureMap.values()) {
    // sliding window
    for (let i = 0; i < events.length; i++) {
      const window = events.filter(
        ev => ev.ts >= events[i].ts && ev.ts <= events[i].ts + FAILURE_WINDOW_MS
      )
      if (window.length >= FAILURE_THRESHOLD) {
        window.forEach(ev => flagged.set(ev.idx, { reason: 'repeated_failures' }))
      }
    }
  }

  // Pattern 2: off-hours access
  entries.forEach((e, i) => {
    if (!e.timestamp) return
    const hour = new Date(e.timestamp).getUTCHours()
    if (hour < OFF_HOURS_START_UTC || hour >= OFF_HOURS_END_UTC) {
      flagged.set(i, { reason: flagged.get(i)?.reason ?? 'off_hours_access' })
    }
  })

  // Pattern 3: bulk data access (same user, many reads/exports in batch)
  const bulkMap = new Map<string, number[]>()
  entries.forEach((e, i) => {
    if (!e.user || !e.action) return
    if (!BULK_ACTIONS.has((e.action as string).toLowerCase())) return
    if (!bulkMap.has(e.user)) bulkMap.set(e.user, [])
    bulkMap.get(e.user)!.push(i)
  })
  for (const idxs of bulkMap.values()) {
    if (idxs.length >= BULK_ACCESS_THRESHOLD) {
      idxs.forEach(i => flagged.set(i, { reason: flagged.get(i)?.reason ?? 'bulk_data_access' }))
    }
  }

  return entries.map((e, i) => {
    const flag = flagged.get(i)
    if (!flag) return e
    return { ...e, _suspicious: true, _suspiciousReason: flag.reason }
  })
}
```

- [ ] **Step 2: Update the audit proxy route**

In `src/app/api/audit/route.ts`, add the import and apply detection:

```ts
import { detectSuspiciousActivity } from '@/lib/auditPatterns'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/audit?limit=100`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const raw = await res.json()
    const entries = Array.isArray(raw) ? raw : (raw.logs ?? [])
    return NextResponse.json(detectSuspiciousActivity(entries))
  } catch { return NextResponse.json([]) }
}
```

- [ ] **Step 3: Add suspicious row highlighting to `audit-logs/page.tsx`**

First, check the type used for audit entries in `audit-logs/page.tsx`:

```bash
grep -n "type\|interface\|AuditLog\|entry\|AuditEntry" frontend/src/app/audit-logs/page.tsx | head -10
```

Whatever the entry type is, add `_suspicious?: boolean` and `_suspiciousReason?: string` to it.

Add a "Suspicious only" filter button alongside existing filter buttons. Add state:

```tsx
const [suspiciousOnly, setSuspiciousOnly] = useState(false)
```

In the filter logic, add:

```tsx
.filter(e => !suspiciousOnly || e._suspicious)
```

In the row rendering, add amber left-border and ⚠ badge for suspicious rows:

```tsx
// Wrap existing row div with:
style={{
  ...existingRowStyle,
  borderLeft: entry._suspicious ? '3px solid var(--status-warn-text)' : existingBorderLeft,
}}

// Add ⚠ badge inline with the action column:
{entry._suspicious && (
  <span
    title={entry._suspiciousReason ?? 'suspicious activity'}
    style={{
      background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)',
      fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
      marginLeft: '4px', cursor: 'help',
    }}
  >
    ⚠
  </span>
)}
```

Add the filter button in the filter bar:

```tsx
<button
  onClick={() => setSuspiciousOnly(v => !v)}
  style={{
    fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
    border: `1px solid ${suspiciousOnly ? 'var(--status-warn-text)' : 'var(--border)'}`,
    background: suspiciousOnly ? 'var(--status-warn-bg)' : 'var(--surface)',
    color: suspiciousOnly ? 'var(--status-warn-text)' : 'var(--text-secondary)',
    cursor: 'pointer', fontWeight: suspiciousOnly ? 700 : 400,
  }}
>
  ⚠ Suspicious only
</button>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Verify in browser**

Open `/audit-logs` — any entries that match the 3 patterns (repeated failures, off-hours, bulk reads) appear with an amber left border and ⚠ badge. Hover the badge to see the reason. The "⚠ Suspicious only" button filters to just those entries.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auditPatterns.ts src/app/api/audit/route.ts src/app/audit-logs/page.tsx
git commit -m "$(cat <<'EOF'
feat(audit): suspicious activity detection and highlighting

Pure detectSuspiciousActivity() function flags three patterns:
repeated failures (3+ in 60s), off-hours access (before 06:00 or
after 22:00 UTC), bulk data access (5+ reads/exports per user).
Proxy injects _suspicious/_suspiciousReason fields; UI shows amber
border, ⚠ badge with tooltip, and "Suspicious only" filter.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Assessment update — Compliance & Audit

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Update Compliance & Audit area**

Find `area: 'Compliance & Audit'` and update:

```tsx
// Append to exists:
'... Controls now auto-load on framework selection: if controls table is empty, /api/compliance/{fw}/auto-map fires automatically in the background with an inline status notice. Suspicious activity detection runs in the audit log proxy: entries matching repeated failures (3+ in 60s), off-hours access (before 06:00 or after 22:00 UTC), or bulk data access (5+ reads/exports per user in a batch) are flagged with _suspicious and _suspiciousReason. Audit Logs page shows amber left-border and ⚠ badge on flagged entries; a "Suspicious only" filter isolates them.',

// Replace gaps:
gaps: 'No real-time alerting channel for suspicious events — detection fires on page load only (no Slack/email/PagerDuty push). No tamper-evident log storage (verify endpoint checks hashes but hash generation is backend-dependent and not yet implemented). Compliance controls require the auto-map to find mappable rules — if no active rules exist, controls remain empty.',
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(assessment): update Compliance & Audit gaps

Reflects: controls auto-load on empty framework, suspicious activity
detection in proxy + audit logs UI.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 4 — Stewardship & Collaboration (PARTIAL+)

---

### Task 12: Stewardship tasks PATCH route + stewardship page custom tasks

**Files:**
- Create: `app/api/stewardship/tasks/[id]/route.ts`
- Modify: `app/stewardship/page.tsx`

**Interfaces:**
- Produces: `PATCH /api/stewardship/tasks/[id]` with body `{ status: 'completed' }` → proxies to backend

Note: `GET /api/stewardship/tasks` already exists in `app/api/stewardship/tasks/route.ts` — only PATCH is new.

- [ ] **Step 1: Create the PATCH route**

```ts
// src/app/api/stewardship/tasks/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.text()
    const r = await fetch(`${B}/stewardship/tasks/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.get('Authorization') ?? '',
      },
      body,
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.ok ? r.status : 200 })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add `CustomTask` type and state to stewardship page**

At the top of `stewardship/page.tsx`, add the type:

```tsx
type CustomTask = {
  id: string
  task_type: string
  entity_type?: string
  entity_id?: string
  assignee?: string
  description?: string
  status: string
  created_at?: string
}
```

Inside the component, add state alongside existing `tasks`:

```tsx
const [customTasks, setCustomTasks] = useState<CustomTask[]>([])
const [markingDone, setMarkingDone] = useState<string | null>(null)
```

- [ ] **Step 3: Fetch custom tasks on mount**

Inside the existing `useEffect` that fetches approvals (the one with `Promise.all`), add the custom tasks fetch to the array:

```tsx
// Add to the Promise.all array:
fetch('/api/stewardship/tasks').then(r => r.json()).catch(() => []),
```

In the `.then(([approvals, rules, customTasksRaw]) => { ... })` handler, add:

```tsx
const pending = (Array.isArray(customTasksRaw) ? customTasksRaw : []) as CustomTask[]
setCustomTasks(pending.filter(t => t.status !== 'completed'))
```

- [ ] **Step 4: Add `markTaskDone` handler**

```tsx
async function markTaskDone(taskId: string) {
  setMarkingDone(taskId)
  try {
    await fetch(`/api/stewardship/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    setCustomTasks(prev => prev.filter(t => t.id !== taskId))
  } catch { /* leave in list on error */ }
  finally { setMarkingDone(null) }
}
```

- [ ] **Step 5: Render custom tasks in the queue**

In the task queue section (where `tasks.map(...)` renders), add a separate block for custom tasks before or after the existing task rows:

```tsx
{/* Custom tasks from /api/stewardship/tasks */}
{customTasks.map(t => (
  <div key={t.id} style={{
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
  }}>
    <span style={{
      background: 'var(--surface-muted)', color: 'var(--text-secondary)',
      fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
      textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: '2px',
    }}>
      {t.task_type}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '12px', color: 'var(--foreground)', fontWeight: 500, marginBottom: '2px' }}>
        {t.description ?? `${t.entity_type ?? 'task'} ${t.entity_id ?? ''}`.trim()}
      </div>
      {t.assignee && (
        <span style={{
          fontSize: '10px', color: 'var(--text-muted)',
          background: 'var(--surface-muted)', padding: '1px 6px', borderRadius: '10px',
        }}>
          {t.assignee}
        </span>
      )}
    </div>
    <button
      onClick={() => markTaskDone(t.id)}
      disabled={markingDone === t.id}
      style={{
        fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
        border: '1px solid var(--status-ok-text)', background: 'var(--status-ok-bg)',
        color: 'var(--status-ok-text)', cursor: markingDone === t.id ? 'not-allowed' : 'pointer',
        fontWeight: 600, opacity: markingDone === t.id ? 0.6 : 1, flexShrink: 0,
      }}
    >
      {markingDone === t.id ? '…' : 'Mark Done'}
    </button>
  </div>
))}
```

Update the pending tasks count display to include custom tasks:

```tsx
// Find the "{tasks.length} pending" display and change to:
{tasks.length + customTasks.length} pending
```

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Verify in browser**

Open `/stewardship` — the task queue now shows custom tasks created via the "Create Task" form (if any exist in backend). Each has a type badge, description, assignee chip, and "Mark Done" button. Clicking "Mark Done" removes the item from the list immediately.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/stewardship/tasks/\[id\]/route.ts src/app/stewardship/page.tsx
git commit -m "$(cat <<'EOF'
feat(stewardship): surface custom tasks in queue with Mark Done action

Adds GET fetch of /api/stewardship/tasks to the stewardship page and
renders pending custom tasks inline in the unified task queue. Mark Done
calls PATCH /api/stewardship/tasks/{id} and removes the item inline.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Notification count badge in nav

**Files:**
- Create: `components/nav/NotificationBadge.tsx`
- Modify: `components/ui/SectionTabBar.tsx`

**Interfaces:**
- Produces: `export function NotificationBadge(): React.ReactElement | null`

- [ ] **Step 1: Create `NotificationBadge.tsx`**

```tsx
// src/components/nav/NotificationBadge.tsx
'use client'
import { useState, useEffect, useRef } from 'react'

const POLL_MS = 60_000

async function fetchPendingCount(): Promise<number> {
  try {
    const [tasks, approvals] = await Promise.allSettled([
      fetch('/api/stewardship/tasks').then(r => r.json()),
      fetch('/api/governance/approvals?status=pending').then(r => r.json()),
    ])

    let count = 0

    if (tasks.status === 'fulfilled') {
      const list = Array.isArray(tasks.value) ? tasks.value : []
      count += list.filter((t: Record<string, unknown>) => t.status !== 'completed').length
    }
    if (approvals.status === 'fulfilled') {
      const list = Array.isArray(approvals.value) ? approvals.value : []
      count += list.length
    }

    return count
  } catch {
    return 0
  }
}

export function NotificationBadge() {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function refresh() {
      const n = await fetchPendingCount()
      if (mountedRef.current) setCount(n)
    }

    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  if (count === 0) return null

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#dc2626', color: '#fff',
      fontSize: '8px', fontWeight: 800, lineHeight: 1,
      width: '14px', height: '14px', borderRadius: '50%',
      marginLeft: '4px', flexShrink: 0, verticalAlign: 'middle',
    }}>
      {count > 9 ? '9+' : count}
    </span>
  )
}
```

- [ ] **Step 2: Add `NotificationBadge` to the Stewardship tab in `SectionTabBar.tsx`**

Import at top:

```tsx
import { NotificationBadge } from '@/components/nav/NotificationBadge'
```

In the tab rendering, change the `{tab.label}` render to show the badge for the Stewardship tab:

```tsx
{section.tabs.map(tab => {
  const isActive = tabMatches(tab.href, pathname)
  return (
    <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: '11px 16px',
        fontSize: 'var(--text-sm)',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: '-1px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s',
        display: 'flex',
        alignItems: 'center',
      }}>
        {tab.label}
        {tab.href === '/stewardship' && <NotificationBadge />}
      </div>
    </Link>
  )
})}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Verify in browser**

Navigate to any Governance section page (e.g. `/catalog`). The tab bar should render. If there are pending stewardship tasks or approvals, a red count badge appears next to the "Stewardship" tab label. Badge disappears if count is 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/NotificationBadge.tsx src/components/ui/SectionTabBar.tsx
git commit -m "$(cat <<'EOF'
feat(nav): notification count badge on Stewardship tab

Polls /api/stewardship/tasks and /api/governance/approvals every 60s.
Renders a red count badge (1-9, then 9+) next to the Stewardship tab
label. Cleans up interval on unmount.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Assessment update — Stewardship & Collaboration

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Update Stewardship & Collaboration area**

Find `area: 'Stewardship & Collaboration'` and update:

```tsx
// Append to exists:
'... Custom tasks created via the form are now surfaced in the stewardship task queue — the page fetches GET /api/stewardship/tasks on load and merges results alongside approvals and pending-review rules. Each custom task shows type badge, description, assignee chip, and a "Mark Done" button (PATCH /api/stewardship/tasks/{id}); completed tasks are removed inline. A red count badge on the Stewardship nav tab shows total pending items (custom tasks + governance approvals), polling every 60 seconds.',

// Replace gaps:
gaps: 'No real-time push notifications — users still need to visit /stewardship or check the nav badge; no WebSocket or SSE delivery. No SLA or escalation workflow on tasks (no due-date enforcement, no auto-escalation if overdue).',
```

- [ ] **Step 2: Update footer note**

Append: `Stewardship: custom tasks surfaced in queue (Mark Done), notification badge on nav tab.`

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(assessment): update Stewardship & Collaboration gaps

Reflects: custom tasks in queue with Mark Done, nav notification badge.
Remaining gaps: WebSocket push, SLA/escalation workflow.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- ✓ Glossary term badges on Catalog list rows (Task 3)
- ✓ Sensitivity on Asset Registry tree (Task 4)
- ✓ Domain + Sensitivity in bulk edit (Task 3)
- ✓ Metadata & Catalog → BUILT assessment update (Task 5)
- ✓ Privacy page Sensitivity by Domain section (Task 6)
- ✓ Proxy-layer data masking (Task 7)
- ✓ Classification & Sensitivity assessment update (Task 8)
- ✓ Compliance controls auto-load (Task 9)
- ✓ Suspicious activity detection (Task 10)
- ✓ Compliance & Audit assessment update (Task 11)
- ✓ Custom tasks in stewardship queue + PATCH route (Task 12)
- ✓ Notification badge (Task 13)
- ✓ Stewardship assessment update (Task 14)

**Type consistency:**
- `SensitivityBadge` props: `{ classification: string | null | undefined }` — used consistently in Tasks 1, 4, 6
- `maskSensitiveColumns(data, userRole, sensitivityMap)` — defined in Task 7 step 1, called in Task 7 step 4
- `extractUserRole(authHeader: string): string` — defined in Task 7 step 1, called in Task 7 step 4
- `detectSuspiciousActivity(entries: AuditEntry[]): AuditEntry[]` — defined in Task 10 step 1, called in Task 10 step 2
- `AuditEntry` type defined in `auditPatterns.ts` — extended with `_suspicious` / `_suspiciousReason` added in `audit-logs/page.tsx`
- `CustomTask` type defined in Task 12 — used only within `stewardship/page.tsx`
- `NotificationBadge()` — defined in Task 13 step 1, imported in step 2
