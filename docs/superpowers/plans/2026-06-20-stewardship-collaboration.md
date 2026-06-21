# Stewardship & Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stewardship hub page, threaded discussion threads on Issues/Anomalies/Glossary entities, real Ownership Coverage KPI, and a unified pending-task queue to DataGuard.

**Architecture:** Pure frontend build — all backend APIs already exist. Three new API proxy routes expose the backend `/comments` endpoint. One new reusable `EntityComments` component is embedded in existing detail panels. A new `/stewardship` page aggregates ownership scores, pending approvals, and recent comments.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, inline CSS with CSS variables (no Tailwind, no CSS modules). All styles use existing `var(--*)` tokens.

## Global Constraints

- No backend changes — all APIs are already implemented
- No new CSS files or Tailwind classes — inline styles only, using existing `var(--*)` CSS variables
- No external libraries — React + Next.js built-ins only
- All new pages are `'use client'` components
- All API proxy routes must include `export const dynamic = 'force-dynamic'`
- Backend URL from `process.env.BACKEND_URL || 'http://localhost:8000'`
- `author_name` does not exist on the `AssetComment` DB model — display `author_email` (prefix before `@`) as the author label in all comment UI
- Existing file content must not be deleted — all changes are additive

---

### Task 1: Comments API Proxy Routes

**Files:**
- Create: `frontend/src/app/api/comments/route.ts`
- Create: `frontend/src/app/api/comments/[id]/route.ts`
- Create: `frontend/src/app/api/comments/[id]/resolve/route.ts`

**Interfaces:**
- Produces: `GET /api/comments?entity_type=X&entity_id=Y` → `Comment[]`, `POST /api/comments` → `Comment`, `PUT /api/comments/{id}` → `Comment`, `DELETE /api/comments/{id}` → `{}`, `POST /api/comments/{id}/resolve` → `{}`

---

- [ ] **Step 1: Create the GET/POST comments proxy**

Create `frontend/src/app/api/comments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const params = new URLSearchParams()
    if (searchParams.get('entity_type')) params.set('entity_type', searchParams.get('entity_type')!)
    if (searchParams.get('entity_id')) params.set('entity_id', searchParams.get('entity_id')!)
    if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!)
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/comments?${params}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Create the PUT/DELETE comments proxy**

Create `frontend/src/app/api/comments/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/comments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/comments/${id}`, {
      method: 'DELETE',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
    return NextResponse.json({ message: 'Comment deleted' })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 3: Create the resolve proxy**

Create `frontend/src/app/api/comments/[id]/resolve/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/comments/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: '{}',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 4: Verify routes exist**

```bash
ls frontend/src/app/api/comments/
# expected: route.ts  [id]/
ls frontend/src/app/api/comments/[id]/
# expected: route.ts  resolve/
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/comments/
git commit -m "feat(stewardship): add comments API proxy routes"
```

---

### Task 2: `EntityComments` Component

**Files:**
- Create: `frontend/src/components/EntityComments.tsx`

**Interfaces:**
- Consumes: `GET /api/comments?entity_type&entity_id`, `POST /api/comments`, `POST /api/comments/{id}/resolve`
- Produces: `<EntityComments entityType="issue" entityId="abc-123" />` — drop-in collapsible thread block

---

- [ ] **Step 1: Create the component**

Create `frontend/src/components/EntityComments.tsx`:

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'

interface Comment {
  comment_id: string
  entity_type: string
  entity_id: string
  body: string
  parent_id: string | null
  author_email: string | null
  is_resolved: boolean
  created_at: string | null
}

function authorLabel(email: string | null): string {
  if (!email) return 'anonymous'
  return email.includes('@') ? email.split('@')[0] : email
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

interface ThreadProps {
  root: Comment
  replies: Comment[]
  currentEmail: string | null
  onResolve: (id: string) => void
  onReply: (parentId: string, authorEmail: string | null) => void
}

function CommentThread({ root, replies, currentEmail, onResolve, onReply }: ThreadProps) {
  const [repliesOpen, setRepliesOpen] = useState(true)
  const resolved = root.is_resolved
  return (
    <div style={{ opacity: resolved ? 0.45 : 1 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-bg)',
          color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
        }}>
          {authorLabel(root.author_email).slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{authorLabel(root.author_email)}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(root.created_at)}</span>
            {resolved && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-ok-text)', background: 'var(--status-ok-bg)', padding: '1px 5px', borderRadius: 3 }}>✓ resolved</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{root.body}</div>
          {!resolved && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => onReply(root.comment_id, root.author_email)}
                style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↩ Reply</button>
              {(currentEmail === root.author_email || currentEmail) && (
                <button onClick={() => onResolve(root.comment_id)}
                  style={{ fontSize: 10, color: 'var(--status-ok-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✓ Resolve</button>
              )}
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div style={{ marginLeft: 34, borderLeft: '2px solid var(--border)', paddingLeft: 10, marginTop: 8 }}>
          {repliesOpen && replies.map(r => (
            <div key={r.comment_id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: 'var(--surface-muted)',
                  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
                }}>
                  {authorLabel(r.author_email).slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{authorLabel(r.author_email)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(r.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.body}</div>
                </div>
              </div>
            </div>
          ))}
          {replies.length > 1 && (
            <button onClick={() => setRepliesOpen(o => !o)}
              style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
              {repliesOpen ? '▲ collapse' : `▼ ${replies.length} replies`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function EntityComments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; authorEmail: string | null } | null>(null)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => setCurrentEmail(d.email ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    if (open && !loaded) {
      fetch(`/api/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
        .then(r => r.json())
        .then(d => { setComments(Array.isArray(d) ? d : []); setLoaded(true) })
        .catch(() => setLoaded(true))
    }
  }, [open, loaded, entityType, entityId])

  const roots = comments.filter(c => !c.parent_id)
  const repliesFor = (id: string) => comments.filter(c => c.parent_id === id)
  const count = comments.length

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    setPostError(null)
    const payload: Record<string, unknown> = {
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
    }
    if (replyTo) payload.parent_id = replyTo.id
    const optimistic: Comment = {
      comment_id: `tmp-${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
      parent_id: replyTo?.id ?? null,
      author_email: currentEmail,
      is_resolved: false,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])
    setBody('')
    setReplyTo(null)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Post failed')
      const saved: Comment = await res.json()
      setComments(prev => prev.map(c => c.comment_id === optimistic.comment_id ? saved : c))
    } catch {
      setComments(prev => prev.filter(c => c.comment_id !== optimistic.comment_id))
      setPostError('Failed to post — try again')
    } finally {
      setPosting(false)
    }
  }

  async function resolve(id: string) {
    const res = await fetch(`/api/comments/${id}/resolve`, { method: 'POST' })
    if (res.ok) setComments(prev => prev.map(c => c.comment_id === id ? { ...c, is_resolved: true } : c))
  }

  function startReply(parentId: string, authorEmail: string | null) {
    setReplyTo({ id: parentId, authorEmail })
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 0', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
        Discussion {loaded ? `(${count})` : ''}
      </button>

      {open && (
        <div style={{ paddingBottom: 12 }}>
          {!loaded && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Loading…</div>}

          {loaded && roots.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>No comments yet — be the first.</div>
          )}

          {loaded && roots.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {roots.map(root => (
                <CommentThread
                  key={root.comment_id}
                  root={root}
                  replies={repliesFor(root.comment_id)}
                  currentEmail={currentEmail}
                  onResolve={resolve}
                  onReply={startReply}
                />
              ))}
            </div>
          )}

          {replyTo && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              Replying to <strong>{authorLabel(replyTo.authorEmail)}</strong>
              <button onClick={() => setReplyTo(null)} style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ cancel</button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            style={{
              width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: 12, background: 'var(--surface)', color: 'var(--foreground)',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
          />
          {postError && <div style={{ fontSize: 11, color: 'var(--status-error-text)', marginTop: 3 }}>{postError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={post}
              disabled={posting || !body.trim()}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                background: body.trim() ? 'var(--accent)' : 'var(--border)',
                color: body.trim() ? '#fff' : 'var(--text-muted)',
                cursor: posting || !body.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component file exists**

```bash
ls frontend/src/components/EntityComments.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EntityComments.tsx
git commit -m "feat(stewardship): add EntityComments reusable threaded comment component"
```

---

### Task 3: `/stewardship` Page

**Files:**
- Create: `frontend/src/app/stewardship/page.tsx`

**Interfaces:**
- Consumes: `GET /api/governance/scorecards`, `GET /api/governance/approvals?status=pending`, `GET /api/rules`, `GET /api/comments?limit=30`
- Produces: `/stewardship` route rendering 3 panels

---

- [ ] **Step 1: Create the stewardship page**

Create `frontend/src/app/stewardship/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DomainScore {
  domain_id: string
  domain_name: string
  ownership_score: number
  ownership: number
}

interface ApprovalItem {
  approval_id: string
  entity_type: string
  entity_id: string
  entity_snapshot: Record<string, unknown> | null
  status: string
  requested_by: string
  created_at: string
}

interface RuleItem {
  id: string
  name: string
  status: string
  createdBy?: string
  createdAt: string
}

interface CommentItem {
  comment_id: string
  entity_type: string
  entity_id: string
  body: string
  author_email: string | null
  is_resolved: boolean
  created_at: string | null
}

interface TaskRow {
  key: string
  entityType: string
  name: string
  requestor: string
  age: string
  href: string
}

function scoreColor(s: number) {
  return s >= 90 ? 'var(--status-ok-text)' : s >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
}

function scoreBg(s: number) {
  return s >= 90 ? 'var(--status-ok-bg)' : s >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'
}

function ageLabel(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function entityHref(type: string): string {
  const map: Record<string, string> = {
    issue: '/issues',
    anomaly: '/anomalies',
    glossary_term: '/glossary',
    dataset: '/datasets',
    policy: '/governance',
    contract: '/contracts',
    data_product: '/data-products',
    domain_ownership: '/domains',
    rule: '/rules',
  }
  return map[type] ?? '/'
}

function entityLabel(type: string, id: string): string {
  const labels: Record<string, string> = {
    issue: `Issue`,
    anomaly: `Anomaly`,
    glossary_term: `Glossary Term`,
    dataset: `Dataset`,
    policy: `Policy`,
    contract: `Contract`,
    data_product: `Data Product`,
    domain_ownership: `Domain`,
    rule: `Rule`,
  }
  return `${labels[type] ?? type} ${id.slice(0, 6)}`
}

const DOMAIN_ICONS = ['📊', '🛡️', '👥', '💰', '🏥', '📈', '🔧', '📦', '🌐', '🔬']
function domainIcon(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % DOMAIN_ICONS.length
  return DOMAIN_ICONS[Math.abs(h)]
}

export default function StewardshipPage() {
  const [domains, setDomains] = useState<DomainScore[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      fetch('/api/governance/scorecards').then(r => r.json()).catch(() => []),
      fetch('/api/governance/approvals?status=pending').then(r => r.json()).catch(() => []),
      fetch('/api/rules').then(r => r.json()).catch(() => []),
      fetch('/api/comments?limit=30').then(r => r.json()).catch(() => []),
    ]).then(([scoreRes, approvalRes, rulesRes, commentRes]) => {
      // Ownership scores
      const rawScores = scoreRes.status === 'fulfilled' ? (Array.isArray(scoreRes.value) ? scoreRes.value : []) : []
      const mapped: DomainScore[] = rawScores.map((d: Record<string, unknown>) => ({
        domain_id: String(d.domain_id ?? d.id ?? ''),
        domain_name: String(d.domain_name ?? d.name ?? ''),
        ownership_score: Math.round(Number(d.ownership_score ?? d.ownership ?? 0)),
        ownership: Math.round(Number(d.ownership_score ?? d.ownership ?? 0)),
      }))
      setDomains(mapped.sort((a, b) => a.ownership_score - b.ownership_score))

      // Task queue: pending approvals
      const rawApprovals: ApprovalItem[] = approvalRes.status === 'fulfilled'
        ? (Array.isArray(approvalRes.value) ? approvalRes.value : [])
        : []
      const approvalTasks: TaskRow[] = rawApprovals.map(a => ({
        key: `approval-${a.approval_id}`,
        entityType: a.entity_type,
        name: String(a.entity_snapshot?.policy_name ?? a.entity_snapshot?.contract_name ?? a.entity_snapshot?.name ?? a.entity_id),
        requestor: a.requested_by,
        age: ageLabel(a.created_at),
        href: '/governance',
      }))

      // Task queue: pending_review rules (client-side filter)
      const rawRules: RuleItem[] = rulesRes.status === 'fulfilled'
        ? (Array.isArray(rulesRes.value) ? rulesRes.value : [])
        : []
      const ruleTasks: TaskRow[] = rawRules
        .filter(r => r.status === 'pending_review')
        .map(r => ({
          key: `rule-${r.id}`,
          entityType: 'rule',
          name: r.name,
          requestor: r.createdBy ?? '—',
          age: ageLabel(r.createdAt),
          href: '/rules',
        }))

      setTasks([...approvalTasks, ...ruleTasks].sort((a, b) => {
        // oldest first: parse age string back loosely
        const dayA = parseInt(a.age) || 0
        const dayB = parseInt(b.age) || 0
        return dayB - dayA
      }))

      // Recent discussions
      const rawComments: CommentItem[] = commentRes.status === 'fulfilled'
        ? (Array.isArray(commentRes.value) ? commentRes.value : [])
        : []
      setComments(rawComments)
      setLoading(false)
    })
  }, [])

  // Group comments by entity for the discussions panel
  const entityGroups = comments.reduce<Record<string, CommentItem[]>>((acc, c) => {
    const key = `${c.entity_type}::${c.entity_id}`
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  const avgOwnership = domains.length > 0
    ? Math.round(domains.reduce((s, d) => s + d.ownership_score, 0) / domains.length)
    : null

  const entityTypeBadge = (type: string) => (
    <span style={{
      padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
      background: 'var(--surface-muted)', color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
    }}>
      {type.replace('_', ' ')}
    </span>
  )

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960, boxSizing: 'border-box' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>Stewardship</span>
        {avgOwnership !== null && (
          <span style={{ background: scoreBg(avgOwnership), color: scoreColor(avgOwnership), padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            Avg Ownership: {avgOwnership}%
          </span>
        )}
        {tasks.length > 0 && (
          <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            {tasks.length} pending
          </span>
        )}
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
      )}

      {!loading && (
        <>
          {/* Panel 1: Ownership Coverage */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Ownership Coverage</span>
              {avgOwnership !== null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg {avgOwnership}% · sorted worst first</span>
              )}
            </div>
            {domains.length === 0 ? (
              <div style={{ padding: '24px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                No domain scorecards yet — add domains in Asset Registry first
              </div>
            ) : (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {domains.map(d => (
                  <div key={d.domain_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {domainIcon(d.domain_name)} {d.domain_name}
                    </span>
                    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${d.ownership_score}%`, height: '100%', background: scoreColor(d.ownership_score), borderRadius: 3 }} />
                    </div>
                    <span style={{ background: scoreBg(d.ownership_score), color: scoreColor(d.ownership_score), padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, minWidth: 34, textAlign: 'center' }}>
                      {d.ownership_score}%
                    </span>
                    <Link href="/governance" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}>Fix →</Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 2: Task Queue */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Pending Tasks</span>
              {tasks.length > 0 && (
                <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{tasks.length}</span>
              )}
            </div>
            {tasks.length === 0 ? (
              <div style={{ padding: '24px 14px', color: 'var(--text-muted)', fontSize: 12 }}>No pending tasks — all caught up</div>
            ) : (
              <div>
                {tasks.map(t => (
                  <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 80px 80px', gap: '0 10px', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--surface-muted)' }}>
                    {entityTypeBadge(t.entityType)}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.requestor}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.age}</span>
                    <Link href={t.href} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', textAlign: 'right' }}>→ Review</Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 3: Recent Discussions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Recent Discussions</span>
            </div>
            {Object.keys(entityGroups).length === 0 ? (
              <div style={{ padding: '24px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                No discussions yet — comments on issues, anomalies, and glossary terms appear here
              </div>
            ) : (
              <div>
                {Object.entries(entityGroups).map(([key, group]) => {
                  const [type, id] = key.split('::')
                  const last = group[group.length - 1]
                  const unresolved = group.filter(c => !c.is_resolved).length
                  const href = entityHref(type)
                  const label = entityLabel(type, id)
                  const excerpt = last.body.length > 80 ? last.body.slice(0, 80) + '…' : last.body
                  const author = last.author_email?.split('@')[0] ?? 'unknown'
                  return (
                    <Link key={key} href={href} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px', gap: '0 10px', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--surface-muted)', textDecoration: 'none' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-muted)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}
                    >
                      {entityTypeBadge(type)}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{excerpt}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{author} · {ageLabel(last.created_at)}</span>
                      {unresolved > 0 && (
                        <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, justifySelf: 'end' }}>
                          {unresolved} open
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/stewardship/
git commit -m "feat(stewardship): add /stewardship hub page with ownership, task queue, discussions"
```

---

### Task 4: Add Stewardship to SectionTabBar

**Files:**
- Modify: `frontend/src/components/ui/SectionTabBar.tsx`

**Interfaces:**
- Consumes: existing `SECTIONS` array
- Produces: `/stewardship` route visible in the "govern" tab bar

---

- [ ] **Step 1: Add the tab**

In `frontend/src/components/ui/SectionTabBar.tsx`, in the `govern` section, insert the Stewardship tab after `{ href: '/governance', label: 'Governance' }`:

Find this block:
```ts
  {
    key: 'govern',
    tabs: [
      { href: '/lineage',    label: 'Lineage' },
      { href: '/catalog',    label: 'Catalog' },
      { href: '/governance', label: 'Governance' },
      { href: '/glossary',   label: 'Glossary' },
```

Change to:
```ts
  {
    key: 'govern',
    tabs: [
      { href: '/lineage',       label: 'Lineage' },
      { href: '/catalog',       label: 'Catalog' },
      { href: '/governance',    label: 'Governance' },
      { href: '/stewardship',   label: 'Stewardship' },
      { href: '/glossary',      label: 'Glossary' },
```

- [ ] **Step 2: Verify in browser**

Start dev server (`cd frontend && npm run dev`). Navigate to any "Govern" section page. Confirm "Stewardship" tab appears between "Governance" and "Glossary". Click it — `/stewardship` should load with the three panels.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/SectionTabBar.tsx
git commit -m "feat(stewardship): add Stewardship tab to govern section nav"
```

---

### Task 5: Governance Page — Ownership Coverage KPI + Rule Approvals Filter

**Files:**
- Modify: `frontend/src/app/governance/page.tsx`

**Interfaces:**
- Consumes: existing `avgOwnership` (computed at line 334), existing `approvals` state and `approvalFilter` state
- Produces: 5-tile KPI row with Ownership Coverage; Approvals tab gains a "Rules" filter

---

- [ ] **Step 1: Expand the KPI grid from 4 to 5 tiles**

In `frontend/src/app/governance/page.tsx`, find the KPI row (around line 374):

```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          ['Governance Score', govScore !== null ? String(govScore) : '—'],
          ['Policies Active', String(activeCount)],
          ['Open Violations', violationsLoaded ? String(openViolations.length) : '—'],
          ['High Severity', violationsLoaded ? String(highViolations.length) : '—'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '5px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
```

Replace with:
```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          ['Governance Score', govScore !== null ? String(govScore) : '—'],
          ['Ownership Coverage', avgOwnership !== null ? avgOwnership + '%' : '—'],
          ['Policies Active', String(activeCount)],
          ['Open Violations', violationsLoaded ? String(openViolations.length) : '—'],
          ['High Severity', violationsLoaded ? String(highViolations.length) : '—'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '5px 10px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
```

- [ ] **Step 2: Add `pendingRules` state and fetch logic**

At the top of `GovernancePage()`, after the existing state declarations, add:

```tsx
  const [pendingRules, setPendingRules] = useState<Array<{ id: string; name: string; createdBy?: string; createdAt: string }>>([])
  const [pendingRulesLoaded, setPendingRulesLoaded] = useState(false)
```

- [ ] **Step 3: Load pending rules when rule filter is selected**

After the existing `useEffect` for approvals (around line 258), add:

```tsx
  useEffect(() => {
    if (tab === 'approvals' && approvalFilter === 'rule' && !pendingRulesLoaded) {
      fetch('/api/rules')
        .then(r => r.json())
        .then(data => {
          const arr = Array.isArray(data) ? data : []
          setPendingRules(arr.filter((r: Record<string, unknown>) => r.status === 'pending_review').map((r: Record<string, unknown>) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? ''),
            createdBy: r.createdBy ? String(r.createdBy) : undefined,
            createdAt: String(r.createdAt ?? r.created_at ?? ''),
          })))
          setPendingRulesLoaded(true)
        })
        .catch(() => setPendingRulesLoaded(true))
    }
  }, [tab, approvalFilter, pendingRulesLoaded])
```

- [ ] **Step 4: Add `rule` to approval filter type and button list**

Find the type declaration (around line 164):
```tsx
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'policy' | 'contract' | 'data_product' | 'domain_ownership' | 'glossary_term'>('pending')
```

Change to:
```tsx
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'policy' | 'contract' | 'data_product' | 'domain_ownership' | 'glossary_term' | 'rule'>('pending')
```

Find the filter button list in the Approvals tab (around line 509):
```tsx
              {(['all', 'pending', 'policy', 'contract', 'data_product', 'domain_ownership', 'glossary_term'] as const).map(f => (
```

Change to:
```tsx
              {(['all', 'pending', 'policy', 'contract', 'data_product', 'domain_ownership', 'glossary_term', 'rule'] as const).map(f => (
```

And update the label mapping on the next line:
```tsx
                  {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'data_product' ? 'Data Products' : f === 'domain_ownership' ? 'Domain Ownership' : f === 'glossary_term' ? 'Glossary Terms' : f === 'rule' ? 'Rules' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
```

- [ ] **Step 5: Render pending rules when `approvalFilter === 'rule'`**

In the Approvals tab content, find the block that checks `approvals.length === 0` (around line 526). Wrap it so it conditionally renders rules vs approvals:

Replace the entire approvals render block (from `{approvals.length === 0 ?` to the closing `}`  before the reject modal) with:

```tsx
            {approvalFilter === 'rule' ? (
              !pendingRulesLoaded ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>Loading…</div>
              ) : pendingRules.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>No rules pending review.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingRules.map(r => (
                    <div key={r.id} style={{
                      display: 'grid', gridTemplateColumns: '100px 1fr 140px 80px auto',
                      alignItems: 'center', gap: 12, padding: '12px 16px',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--surface-muted)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>rule</span>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {r.createdBy ?? '—'}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }}>pending review</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</span>
                      <a href="/rules" style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, background: 'transparent', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>→ Rules</a>
                    </div>
                  ))}
                </div>
              )
            ) : approvals.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>No approval requests found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {approvals.map(item => (
                  <div key={item.approval_id} style={{
                    display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 80px auto',
                    alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--surface-muted)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.entity_type.replace('_', ' ')}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {String(item.entity_snapshot?.policy_name ?? item.entity_snapshot?.contract_name ?? item.entity_snapshot?.name ?? item.entity_id)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {item.requested_by}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: item.status === 'pending' ? 'var(--status-warn-bg)' : item.status === 'approved' ? 'var(--status-ok-bg)' : 'var(--status-error-bg)', color: item.status === 'pending' ? 'var(--status-warn-text)' : item.status === 'approved' ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                      {item.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(item.created_at)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.reviewed_by ?? '—'}</span>
                    {item.status === 'pending' && currentUser?.role && ['admin', 'domain_owner'].includes(currentUser.role) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={approvalActionLoading === item.approval_id} onClick={async () => { setApprovalActionLoading(item.approval_id); setApprovalActionError(null); try { const res = await fetch(`/api/governance/approvals/${item.approval_id}?action=approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!res.ok) throw new Error('Approve failed'); setApprovalsLoaded(false); loadApprovals() } catch { setApprovalActionError('Approve failed') } finally { setApprovalActionLoading(null) } }} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600 }}>Approve</button>
                        <button disabled={approvalActionLoading === item.approval_id} onClick={() => { setRejectTarget(item); setRejectNote('') }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: 'transparent', color: 'var(--text-muted)' }}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 6: Verify in browser**

1. Open `/governance` → KPI row now shows 5 tiles including "Ownership Coverage"
2. Click "Approvals" tab → "Rules" filter button appears
3. Click "Rules" filter → shows any `pending_review` rules (or empty state)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/governance/page.tsx
git commit -m "feat(stewardship): add ownership coverage KPI tile and rule approvals filter to governance page"
```

---

### Task 6: Embed EntityComments in IssueDetailPanel

**Files:**
- Modify: `frontend/src/components/issues/IssueDetailPanel.tsx`

**Interfaces:**
- Consumes: `EntityComments` from `@/components/EntityComments`, `issue.issue_id: string`

---

- [ ] **Step 1: Import EntityComments**

At the top of `frontend/src/components/issues/IssueDetailPanel.tsx`, add after the existing imports:

```tsx
import EntityComments from '@/components/EntityComments'
```

- [ ] **Step 2: Append EntityComments inside the scrollable content div**

In `IssueDetailPanel.tsx`, find the closing of the scrollable content `<div>` (the `<div>` that contains the Activity section, around line 312). The Activity section ends with:

```tsx
        </div>
      </div>
    </div>
  )
```

The structure is:
- outer `<div>` (flex column, overflow hidden) — line 173
  - header `<div>` — line 174
  - scrollable `<div style={{ flex: 1, overflowY: 'auto', ...}}>` — line 193
    - meta grid — line 194
    - description — line 212
    - (editing fields...)
    - activity section — line 293
    - **← insert EntityComments here**
  - close of scrollable div
- close of outer div

Add `EntityComments` as the last child inside the scrollable div, immediately before its closing `</div>`. The activity section ends at line 311 with `</div>`. Add after it:

```tsx
        <EntityComments entityType="issue" entityId={issue.issue_id} />
```

So the bottom of the scrollable div becomes:
```tsx
        <div>
          <div style={metaLabelStyle}>Activity</div>
          {auditLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading activity…</div>
          ) : audit.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No activity yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {audit.map(a => (
                <div key={a.audit_id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '2px solid var(--border)', paddingLeft: '8px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--foreground)' }}>
                    <strong>{a.user_email || 'system'}</strong> {describeAction(a)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmtDate(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <EntityComments entityType="issue" entityId={issue.issue_id} />
      </div>
    </div>
  )
```

- [ ] **Step 3: Verify in browser**

Open Issues page, click any issue row. The detail panel opens. Scroll to the bottom — "Discussion" collapsible section appears below "Activity". Click to expand — compose box and empty state show. Post a comment — it appears immediately.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/issues/IssueDetailPanel.tsx
git commit -m "feat(stewardship): embed EntityComments in issue detail panel"
```

---

### Task 7: Embed EntityComments in AnomaliesPage

**Files:**
- Modify: `frontend/src/app/anomalies/page.tsx`

**Interfaces:**
- Consumes: `EntityComments` from `@/components/EntityComments`, `a.id: string` (the `detection_id` mapped to `id`)

---

- [ ] **Step 1: Import EntityComments**

At the top of `frontend/src/app/anomalies/page.tsx`, add after the existing imports:

```tsx
import EntityComments from '@/components/EntityComments'
```

- [ ] **Step 2: Add EntityComments inside the expanded detail section**

In `anomalies/page.tsx`, the expanded detail block starts at line 258 and ends around line 294. Find the closing of the expanded section:

```tsx
                  {/* asset path */}
                  {tablePath && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Path: </span>{tablePath}
                    </div>
                  )}
                </div>
```

Add `EntityComments` after the tablePath block and before the closing `</div>` of the expanded section:

```tsx
                  {tablePath && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Path: </span>{tablePath}
                    </div>
                  )}

                  <EntityComments entityType="anomaly" entityId={a.id} />
                </div>
```

- [ ] **Step 3: Verify in browser**

Open Anomalies page. Click any anomaly row to expand. Scroll to the bottom of the expanded detail — "Discussion" collapsible appears. Expand and post a comment.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/anomalies/page.tsx
git commit -m "feat(stewardship): embed EntityComments in anomaly expanded detail"
```

---

### Task 8: Embed EntityComments in Glossary Term Panel

**Files:**
- Modify: `frontend/src/app/glossary/page.tsx`

**Interfaces:**
- Consumes: `EntityComments` from `@/components/EntityComments`, `popup.id: string` (the term's `term_id`)

---

- [ ] **Step 1: Import EntityComments**

At the top of `frontend/src/app/glossary/page.tsx`, add after the existing imports:

```tsx
import EntityComments from '@/components/EntityComments'
```

- [ ] **Step 2: Add EntityComments inside the popup slide-in panel**

In `glossary/page.tsx`, the Linked Assets section ends around line 521. Find the closing of the Linked Assets section:

```tsx
            </div>

            {/* Link Asset modal (inline within popup) */}
```

Insert `EntityComments` between the end of the Linked Assets section and the Link Asset modal:

```tsx
            </div>

            <div style={{ padding: '0 14px 16px' }}>
              <EntityComments entityType="glossary_term" entityId={popup.id} />
            </div>

            {/* Link Asset modal (inline within popup) */}
```

- [ ] **Step 3: Verify in browser**

Open Glossary page. Click any term to open the detail panel. Scroll to the bottom — "Discussion" collapsible appears below "Linked Assets". Expand and post a comment.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/glossary/page.tsx
git commit -m "feat(stewardship): embed EntityComments in glossary term detail panel"
```

---

### Task 9: Update Settings Page Gaps Description

**Files:**
- Modify: `frontend/src/app/settings/page.tsx`

---

- [ ] **Step 1: Update the gaps text**

In `frontend/src/app/settings/page.tsx`, find the gaps entry for "Stewardship & Collaboration" (around line 483):

```
                    gaps: 'Ownership Coverage KPI still shows "—" — the dimension score is not calculated from real data. No comments, annotations, or discussion threads on any entity (issues, anomalies, datasets, lineage nodes, glossary terms). No @mentions or in-platform notifications. No stewardship task queue for data quality improvement goals. Approval workflows exist only for glossary terms; policies, rules, domain assignments, data products, and contracts have none. All investigation coordination must still happen outside the platform (Slack, email), losing all context.',
```

Replace with:

```
                    gaps: 'No @mentions or in-platform push notifications. Comments not yet on datasets, lineage nodes, or contracts (architecture supports it — just pass a different entity_type). Stewardship task queue is read-only derived from pending approvals and pending_review rules — no custom task creation. Approval workflows surface pending rules, policies, contracts, and data products but approve/reject actions for rules still live on the Rules page rather than inline in the approval queue.',
```

- [ ] **Step 2: Update the exists text** (same object, `exists` field, around line 482):

Find:
```
                    exists: 'Ownership fields exist on domains, policies, glossary terms, contracts, and SLAs. Governance scorecard tracks an "Ownership" dimension (% of tables with an assigned owner). Domain management page shows tables in each domain with basic statistics. Partial stewardship progress: glossary terms now have a review-and-approval workflow — the Governance page shows a pending terms queue where authorized users can approve or reject submissions with written feedback.',
```

Replace with:

```
                    exists: 'Ownership Coverage KPI on the Governance page shows real % from domain scorecards. /stewardship hub page provides: ownership coverage bar chart per domain (sorted worst-first), unified task queue of pending approvals and pending_review rules, and a recent-discussions feed. Threaded comment system on Issues, Anomalies, and Glossary terms — collapsible discussion section in each detail panel. Governance Approvals tab now shows rules pending review in addition to glossary terms, policies, contracts, and data products.',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "docs(settings): update stewardship gap descriptions to reflect new features"
```

---

## Self-Review Checklist

After all tasks complete:

- [ ] `GET /api/comments?entity_type=issue&entity_id=<id>` returns `[]` or comment array (not 404)
- [ ] `POST /api/comments` with `entity_type`, `entity_id`, `body` returns created comment
- [ ] Opening an issue detail panel shows "Discussion" collapsible at the bottom
- [ ] Opening an anomaly expanded row shows "Discussion" collapsible at the bottom
- [ ] Opening a glossary term panel shows "Discussion" collapsible below Linked Assets
- [ ] `/stewardship` loads three panels with no JS errors
- [ ] `/governance` KPI row shows 5 tiles including "Ownership Coverage"
- [ ] Governance Approvals tab → "Rules" filter button exists and shows pending rules
- [ ] Stewardship tab appears in the govern section tab bar
