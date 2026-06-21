'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Issue, IssueAuditEntry, IssueStatus, IssueSeverity, ISSUE_TRANSITIONS } from '@/lib/types'
import EntityComments from '@/components/EntityComments'

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

const NEEDS_NOTE: IssueStatus[] = ['resolved', 'closed']

const metaLabelStyle: CSSProperties = { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }
const actionBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }
const cancelBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }
const primaryBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }
const fieldInputStyle: CSSProperties = { fontSize: '12px', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100%' }

function fmtDate(s?: string | null) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) } catch { return s }
}

function describeAction(a: IssueAuditEntry): string {
  if (a.action === 'create') return 'created this issue'
  if (a.action === 'status_change') {
    const from = (a.old_value as { status?: string } | null)?.status
    const to = (a.new_value as { status?: string } | null)?.status
    return `changed status from "${from ?? '?'}" to "${to ?? '?'}"`
  }
  if (a.action === 'update') {
    const fields = Object.keys(a.new_value ?? {})
    return `updated ${fields.join(', ') || 'issue'}`
  }
  return a.action
}

function MetaField({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  return (
    <div>
      <div style={metaLabelStyle}>{label}</div>
      {value && href ? (
        <Link href={href} style={{ fontSize: '12.5px', color: 'var(--accent)' }}>{value}</Link>
      ) : (
        <div style={{ fontSize: '12.5px', color: value ? 'var(--foreground)' : 'var(--text-muted)' }}>{value || '—'}</div>
      )}
    </div>
  )
}

export default function IssueDetailPanel({
  issue,
  onClose,
  onUpdated,
}: {
  issue: Issue
  onClose: () => void
  onUpdated: (issue: Issue) => void
}) {
  const [audit, setAudit] = useState<IssueAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<IssueStatus | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: issue.title,
    description: issue.description ?? '',
    severity: issue.severity,
    assigned_to: issue.assigned_to ?? '',
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuditLoading(true)
    fetch(`/api/issues/${issue.issue_id}/audit`)
      .then(r => r.json())
      .then(d => setAudit(Array.isArray(d.items) ? d.items : []))
      .catch(() => setAudit([]))
      .finally(() => setAuditLoading(false))
  }, [issue.issue_id])

  async function applyTransition(status: IssueStatus, note?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${issue.issue_id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(note ? { resolution_note: note } : {}) }),
      })
      if (!res.ok) throw new Error(`Failed to update status (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setPendingStatus(null)
      setResolutionNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setBusy(false)
    }
  }

  async function reopen(note?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${issue.issue_id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { resolution_note: note } : {}),
      })
      if (!res.ok) throw new Error(`Failed to reopen (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setPendingStatus(null)
      setResolutionNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen issue')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issue.issue_id, ...editForm }),
      })
      if (!res.ok) throw new Error(`Failed to save (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setBusy(false)
    }
  }

  function handleTransitionClick(status: IssueStatus) {
    if (NEEDS_NOTE.includes(status)) {
      setPendingStatus(status)
    } else {
      applyTransition(status)
    }
  }

  const sev = SEV_CFG[issue.severity]
  const st = ST_CFG[issue.status]
  const nextStatuses = (ISSUE_TRANSITIONS[issue.status] ?? []).filter(s => s !== 'reopened')
  const canReopen = issue.status === 'resolved' || issue.status === 'closed'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ background: sev.bg, color: sev.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{sev.label}</span>
            <span style={{ background: st.bg, color: st.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{st.label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>✕</button>
        </div>
        {editing ? (
          <input
            value={editForm.title}
            onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
            style={{ ...fieldInputStyle, fontSize: '14px', fontWeight: 700 }}
          />
        ) : (
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>{issue.title}</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          <MetaField label="Asset" value={issue.asset_name} href={issue.asset_id ? `/asset-registry?asset_id=${issue.asset_id}` : undefined} />
          <MetaField label="Rule" value={issue.rule_name} href={issue.rule_id ? `/rules?rule_id=${issue.rule_id}` : undefined} />
          <MetaField label="Run" value={issue.run_id} href={issue.run_id ? `/rule-runs/${issue.run_id}` : undefined} />
          <MetaField label="Alert" value={issue.alert_id ? 'View alert' : undefined} href={issue.alert_id ? `/alerts?alert_id=${issue.alert_id}` : undefined} />
          {editing ? (
            <div>
              <div style={metaLabelStyle}>Assignee</div>
              <input value={editForm.assigned_to} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))} style={fieldInputStyle} />
            </div>
          ) : (
            <MetaField label="Assigned To" value={issue.assigned_to || issue.assigned_team_name} />
          )}
          <MetaField label="Created By" value={issue.created_by} />
          <MetaField label="Created At" value={fmtDate(issue.created_at)} />
          {issue.reopen_count > 0 && <MetaField label="Reopened" value={`${issue.reopen_count} time(s)`} />}
        </div>

        <div>
          <div style={metaLabelStyle}>Description</div>
          {editing ? (
            <textarea
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              style={{ ...fieldInputStyle, minHeight: '60px', resize: 'vertical' }}
            />
          ) : (
            <div style={{ fontSize: '12.5px', color: issue.description ? 'var(--foreground)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {issue.description || 'No description provided'}
            </div>
          )}
        </div>

        {editing && (
          <div>
            <div style={metaLabelStyle}>Severity</div>
            <select
              value={editForm.severity}
              onChange={e => setEditForm(f => ({ ...f, severity: e.target.value as IssueSeverity }))}
              style={fieldInputStyle}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{error}</div>}

        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={metaLabelStyle}>Actions</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {nextStatuses.map(s => (
                <button key={s} disabled={busy} onClick={() => handleTransitionClick(s)} style={actionBtnStyle}>
                  Move to {ST_CFG[s].label}
                </button>
              ))}
              {canReopen && (
                <button disabled={busy} onClick={() => setPendingStatus('reopened')} style={actionBtnStyle}>
                  Reopen
                </button>
              )}
              <button disabled={busy} onClick={() => setEditing(true)} style={actionBtnStyle}>
                Edit
              </button>
            </div>
            {pendingStatus && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                <div style={metaLabelStyle}>Resolution note (optional)</div>
                <textarea
                  value={resolutionNote}
                  onChange={e => setResolutionNote(e.target.value)}
                  style={{ ...fieldInputStyle, minHeight: '50px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button disabled={busy} onClick={() => { setPendingStatus(null); setResolutionNote('') }} style={cancelBtnStyle}>Cancel</button>
                  <button
                    disabled={busy}
                    onClick={() => pendingStatus === 'reopened' ? reopen(resolutionNote || undefined) : applyTransition(pendingStatus, resolutionNote || undefined)}
                    style={primaryBtnStyle}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {editing && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button disabled={busy} onClick={() => setEditing(false)} style={cancelBtnStyle}>Cancel</button>
            <button disabled={busy} onClick={saveEdit} style={primaryBtnStyle}>Save</button>
          </div>
        )}

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
}
