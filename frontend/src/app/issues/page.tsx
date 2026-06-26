'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import IssueDetailPanel from '@/components/issues/IssueDetailPanel'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import { Issue, IssueStatus, IssueSeverity } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const SEV_CFG: Record<IssueSeverity, { bg: string; color: string; label: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Critical' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'High' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Medium' },
  low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Low' },
}

const ST_CFG: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  new:         { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'New' },
  confirmed:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Confirmed' },
  in_progress: { bg: 'var(--accent-bg)',         color: 'var(--accent)',              label: 'In Progress' },
  blocked:     { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Blocked' },
  resolved:    { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)',      label: 'Resolved' },
  closed:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Closed' },
  reopened:    { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Reopened' },
}

const STATUS_FILTERS: (IssueStatus | 'all')[] = ['all', 'new', 'confirmed', 'in_progress', 'blocked', 'resolved', 'closed', 'reopened']
const SEV_FILTERS: (IssueSeverity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low']
const IN_PROGRESS_STATUSES: IssueStatus[] = ['confirmed', 'in_progress', 'blocked', 'reopened']

const pillStyle = (active: boolean): CSSProperties => ({
  padding: '3px 9px', fontSize: '10.5px', borderRadius: '12px', cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-bg)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  textTransform: 'capitalize', whiteSpace: 'nowrap',
})

function buildAssetPath(issue: Issue): { full: string; parts: string[] } {
  const parts: string[] = []
  if (issue.connection_name) parts.push(issue.connection_name)
  if (issue.sf_database_name) parts.push(issue.sf_database_name)
  if (issue.sf_schema_name) parts.push(issue.sf_schema_name)
  if (issue.sf_table_name) parts.push(issue.sf_table_name)
  if (parts.length === 0 && issue.asset_name) parts.push(issue.asset_name)
  return { full: parts.join(' › '), parts }
}

function matchesSearch(issue: Issue, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return (
    (issue.sf_table_name?.toLowerCase().includes(lower) ?? false) ||
    (issue.sf_schema_name?.toLowerCase().includes(lower) ?? false) ||
    (issue.sf_database_name?.toLowerCase().includes(lower) ?? false) ||
    (issue.connection_name?.toLowerCase().includes(lower) ?? false) ||
    (issue.asset_name?.toLowerCase().includes(lower) ?? false)
  )
}

const COL = '68px 1fr 280px 90px 105px 78px'

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusF, setStatusF] = useState<IssueStatus | 'all'>('all')
  const [sevF, setSevF] = useState<IssueSeverity | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Issue | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString()
    apiFetch(`/api/issues${qs ? '?' + qs : ''}`)
      .then(r => r.json())
      .then(data => setIssues(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load issues'))
      .finally(() => setLoading(false))
  }, [activeConnectionId])

  const filtered = issues.filter(i =>
    (statusF === 'all' || i.status === statusF) &&
    (sevF === 'all' || i.severity === sevF) &&
    matchesSearch(i, search)
  )

  const counts = {
    new: issues.filter(i => i.status === 'new').length,
    inProgress: issues.filter(i => IN_PROGRESS_STATUSES.includes(i.status)).length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    closed: issues.filter(i => i.status === 'closed').length,
    critical: issues.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'closed').length,
  }

  const CARDS = [
    { label: 'New', value: counts.new, color: ST_CFG.new.color },
    { label: 'In Progress', value: counts.inProgress, color: ST_CFG.in_progress.color },
    { label: 'Resolved', value: counts.resolved, color: ST_CFG.resolved.color },
    { label: 'Closed', value: counts.closed, color: ST_CFG.closed.color },
    { label: 'Critical', value: counts.critical, color: SEV_CFG.critical.color },
  ]

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Title + Create */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Issues</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '6px 13px', fontSize: '12px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Create Issue
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{c.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Source search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2"/>
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by table, schema, database…"
            style={{
              paddingLeft: '28px', paddingRight: '10px', paddingTop: '5px', paddingBottom: '5px',
              fontSize: '11.5px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', width: '230px',
            }}
          />
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Status pills */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatusF(s)} style={pillStyle(statusF === s)}>
              {s === 'all' ? 'All Statuses' : ST_CFG[s].label}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Severity pills */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {SEV_FILTERS.map(s => (
            <button key={s} onClick={() => setSevF(s)} style={pillStyle(sevF === s)}>
              {s === 'all' ? 'All Sev.' : SEV_CFG[s].label}
            </button>
          ))}
        </div>

        {(search || statusF !== 'all' || sevF !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusF('all'); setSevF('all') }}
            style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px' }}
          >
            Clear ✕
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading issues…</div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--status-error-text)', fontSize: '12px' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          {issues.length === 0 ? 'No issues yet' : 'No issues match the current filters'}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: COL, gap: '8px',
            padding: '6px 12px',
            background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)',
            fontSize: '9.5px', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span>Severity</span>
            <span>Issue</span>
            <span>Source</span>
            <span>Status</span>
            <span>Assigned To</span>
            <span style={{ textAlign: 'right' }}>Created</span>
          </div>

          {/* Rows */}
          {filtered.map((issue, idx) => {
            const sev = SEV_CFG[issue.severity]
            const st = ST_CFG[issue.status]
            const { full: assetPath, parts } = buildAssetPath(issue)
            const tableName = parts[parts.length - 1] ?? assetPath
            const prefix = parts.slice(0, -1).join(' › ')

            return (
              <div
                key={issue.issue_id}
                onClick={() => setSelected(issue)}
                style={{
                  display: 'grid', gridTemplateColumns: COL, gap: '8px',
                  alignItems: 'start', padding: '7px 12px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--surface-muted)' : 'none',
                  cursor: 'pointer', background: 'var(--surface)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover, var(--accent-bg))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                {/* Severity */}
                <span style={{ background: sev.bg, color: sev.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', marginTop: '1px' }}>
                  {sev.label}
                </span>

                {/* Issue title */}
                <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: '1px' }} title={issue.title}>
                  {issue.title}
                </span>

                {/* Source — table name + breadcrumb on second line */}
                <div style={{ minWidth: 0, overflow: 'hidden' }} title={assetPath}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tableName}
                  </div>
                  {prefix && (
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                      {prefix}
                    </div>
                  )}
                </div>

                {/* Status */}
                <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', marginTop: '1px' }}>
                  {st.label}
                </span>

                {/* Assigned */}
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: '1px' }}>
                  {issue.assigned_to || issue.assigned_team_name || '—'}
                </span>

                {/* Date */}
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap', paddingTop: '1px' }}>
                  {new Date(issue.created_at).toLocaleDateString()}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 90vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 900, display: 'flex' }}>
          <IssueDetailPanel
            issue={selected}
            onClose={() => setSelected(null)}
            onUpdated={updated => {
              const merged = { ...selected, ...updated }
              setIssues(prev => prev.map(i => i.issue_id === merged.issue_id ? merged : i))
              setSelected(merged)
            }}
          />
        </div>
      )}

      {showCreate && (
        <CreateIssueModal
          onClose={() => setShowCreate(false)}
          onCreated={issue => { setShowCreate(false); setIssues(prev => [issue, ...prev]) }}
        />
      )}
    </div>
  )
}
