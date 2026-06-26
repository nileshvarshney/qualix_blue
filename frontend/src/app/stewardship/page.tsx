'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'

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
  actionId?: string
  actionType?: 'rule' | 'approval'
}

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
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [domains, setDomains] = useState<DomainScore[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([])
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTask, setNewTask] = useState({ type: 'review', entity_type: 'asset', entity_id: '', description: '', assignee: '', due_date: '' })
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    setLoading(true)
    const connParam = activeConnectionId ? `?connection_id=${activeConnectionId}` : ''
    Promise.allSettled([
      apiFetch(`/api/governance/scorecards${connParam}`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/governance/approvals?status=pending${activeConnectionId ? '&connection_id=' + activeConnectionId : ''}`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/rules${connParam}`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/comments?limit=30${activeConnectionId ? '&connection_id=' + activeConnectionId : ''}`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/stewardship/tasks${connParam}`).then(r => r.json()).catch(() => []),
    ]).then(([scoreRes, approvalRes, rulesRes, commentRes, customTasksRes]) => {
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
        actionId: a.approval_id,
        actionType: 'approval' as const,
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
          actionId: r.id,
          actionType: 'rule' as const,
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

      // Custom stewardship tasks
      const customTasksRaw = customTasksRes.status === 'fulfilled' ? customTasksRes.value : []
      const pending = (Array.isArray(customTasksRaw) ? customTasksRaw : []) as CustomTask[]
      setCustomTasks(pending.filter(t => t.status !== 'completed'))

      setLoading(false)
    })
  }, [activeConnectionId])

  async function handleAction(task: TaskRow, action: 'approve' | 'reject') {
    if (!task.actionId) return
    setActioning(task.key)
    try {
      const url = task.actionType === 'rule'
        ? `/api/rules/${task.actionId}/${action}`
        : `/api/governance/approvals/${task.actionId}/${action}`
      await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      setTasks(prev => prev.filter(t => t.key !== task.key))
    } catch { /* silently ignore */ }
    finally { setActioning(null) }
  }

  async function handleCreateTask() {
    setCreating(true)
    setCreateResult(null)
    try {
      const res = await apiFetch('/api/stewardship/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      })
      if (res.ok) {
        setCreateResult({ ok: true, msg: 'Task created' })
        setNewTask({ type: 'review', entity_type: 'asset', entity_id: '', description: '', assignee: '', due_date: '' })
        setTimeout(() => { setCreateOpen(false); setCreateResult(null) }, 1500)
      } else {
        setCreateResult({ ok: false, msg: 'Failed to create task' })
      }
    } catch {
      setCreateResult({ ok: false, msg: 'Network error' })
    } finally {
      setCreating(false)
    }
  }

  async function markTaskDone(taskId: string) {
    setMarkingDone(taskId)
    try {
      const res = await apiFetch(`/api/stewardship/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
      if (res.ok) {
        setCustomTasks(prev => prev.filter(t => t.id !== taskId))
      }
    } catch { /* leave in list on error */ }
    finally { setMarkingDone(null) }
  }

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
        {(tasks.length + customTasks.length) > 0 && (
          <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            {tasks.length + customTasks.length} pending
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
              {(tasks.length + customTasks.length) > 0 && (
                <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{tasks.length + customTasks.length}</span>
              )}
              <button
                onClick={() => setCreateOpen(o => !o)}
                style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: createOpen ? 'var(--accent)' : 'var(--surface)', color: createOpen ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
              >
                + Create Task
              </button>
            </div>

            {/* Create Task form */}
            {createOpen && (
              <div style={{ padding: '12px 14px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task Type</div>
                    <select value={newTask.type} onChange={e => setNewTask(t => ({ ...t, type: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}>
                      <option value="review">Review</option>
                      <option value="investigation">Investigation</option>
                      <option value="remediation">Remediation</option>
                      <option value="certification">Certification</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entity Type</div>
                    <select value={newTask.entity_type} onChange={e => setNewTask(t => ({ ...t, entity_type: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}>
                      <option value="asset">Asset</option>
                      <option value="issue">Issue</option>
                      <option value="rule">Rule</option>
                      <option value="glossary_term">Glossary Term</option>
                      <option value="policy">Policy</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entity ID / Name</div>
                    <input value={newTask.entity_id} onChange={e => setNewTask(t => ({ ...t, entity_id: e.target.value }))}
                      placeholder="ID or name of the entity"
                      style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee</div>
                    <input value={newTask.assignee} onChange={e => setNewTask(t => ({ ...t, assignee: e.target.value }))}
                      placeholder="user@domain.com"
                      style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
                  <input value={newTask.description} onChange={e => setNewTask(t => ({ ...t, description: e.target.value }))}
                    placeholder="What needs to be done?"
                    style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={handleCreateTask} disabled={creating || !newTask.entity_id.trim()}
                    style={{ fontSize: 11, padding: '5px 14px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                    {creating ? 'Creating…' : 'Create Task'}
                  </button>
                  {createResult && (
                    <span style={{ fontSize: 11, color: createResult.ok ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                      {createResult.ok ? '✓' : '✕'} {createResult.msg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {tasks.length === 0 && customTasks.length === 0 ? (
              <div style={{ padding: '24px 14px', color: 'var(--text-muted)', fontSize: 12 }}>No pending tasks — all caught up</div>
            ) : (
              <div>
                {tasks.map(t => (
                  <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 70px auto', gap: '0 10px', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--surface-muted)' }}>
                    {entityTypeBadge(t.entityType)}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.requestor}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.age}</span>
                    {t.actionId ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          disabled={actioning === t.key}
                          onClick={() => handleAction(t, 'approve')}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--status-ok-text)', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', cursor: 'pointer', fontWeight: 700 }}
                        >✓</button>
                        <button
                          disabled={actioning === t.key}
                          onClick={() => handleAction(t, 'reject')}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--status-error-text)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', cursor: 'pointer', fontWeight: 700 }}
                        >✕</button>
                      </div>
                    ) : (
                      <Link href={t.href} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', textAlign: 'right' }}>→ Review</Link>
                    )}
                  </div>
                ))}
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
