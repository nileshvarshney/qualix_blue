'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import IssueDetailPanel from '@/components/issues/IssueDetailPanel'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import { Issue, IssueStatus, IssueSeverity } from '@/lib/types'

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
  padding: '4px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-bg)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  textTransform: 'capitalize',
})

function buildAssetPath(issue: Issue): string {
  const parts: string[] = []
  if (issue.connection_name) parts.push(issue.connection_name)
  if (issue.sf_database_name) parts.push(issue.sf_database_name)
  if (issue.sf_schema_name) parts.push(issue.sf_schema_name)
  if (issue.sf_table_name) parts.push(issue.sf_table_name)
  if (parts.length > 0) return parts.join(' › ')
  return issue.asset_name || 'Unassigned'
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusF, setStatusF] = useState<IssueStatus | 'all'>('all')
  const [sevF, setSevF] = useState<IssueSeverity | 'all'>('all')
  const [selected, setSelected] = useState<Issue | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetch('/api/issues')
      .then(r => r.json())
      .then(data => setIssues(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load issues'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = issues.filter(i =>
    (statusF === 'all' || i.status === statusF) &&
    (sevF === 'all' || i.severity === sevF)
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
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Issues</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Create Issue
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatusF(s)} style={pillStyle(statusF === s)}>
              {s === 'all' ? 'All Statuses' : ST_CFG[s].label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {SEV_FILTERS.map(s => (
            <button key={s} onClick={() => setSevF(s)} style={pillStyle(sevF === s)}>
              {s === 'all' ? 'All Severities' : SEV_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading issues…</div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--status-error-text)', fontSize: '13px' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No issues yet</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 280px 110px 130px 90px',
            gap: '8px',
            padding: '8px 12px',
            background: 'var(--surface-muted)',
            borderBottom: '1px solid var(--border)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
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
            const assetPath = buildAssetPath(issue)
            return (
              <div
                key={issue.issue_id}
                onClick={() => setSelected(issue)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 280px 110px 130px 90px',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '9px 12px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--surface-muted)' : 'none',
                  cursor: 'pointer',
                  background: 'var(--surface)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover, var(--accent-bg))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <span style={{ background: sev.bg, color: sev.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {sev.label}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.title}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }} title={assetPath}>
                  {assetPath}
                </span>
                <span style={{ background: st.bg, color: st.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {st.label}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.assigned_to || issue.assigned_team_name || '—'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
