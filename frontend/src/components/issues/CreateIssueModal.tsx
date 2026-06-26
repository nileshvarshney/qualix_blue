'use client'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Issue, IssueSeverity, IssueType } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: '13px',
  border: '1px solid var(--border)', borderRadius: '6px',
  background: 'var(--background)', color: 'var(--foreground)',
}
const labelStyle: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block',
}
const cancelBtnStyle: CSSProperties = {
  padding: '7px 14px', fontSize: '12px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer',
}
const primaryBtnStyle: CSSProperties = {
  padding: '7px 14px', fontSize: '12px', borderRadius: '6px',
  border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600,
}

export interface CreateIssuePrefill {
  assetId?: string | null
  ruleId?: string | null
  runId?: string | null
  alertId?: string | null
  issueType?: IssueType
  severity?: IssueSeverity
  title?: string
  domainId?: string | null
}

export default function CreateIssueModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill?: CreateIssuePrefill
  onClose: () => void
  onCreated: (issue: Issue) => void
}) {
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IssueSeverity>(prefill?.severity ?? 'medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (title.trim().length > 200) {
      setError('Title must be 200 characters or fewer')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          issue_type: prefill?.issueType ?? 'manual',
          asset_id: prefill?.assetId ?? undefined,
          rule_id: prefill?.ruleId ?? undefined,
          run_id: prefill?.runId ?? undefined,
          alert_id: prefill?.alertId ?? undefined,
          domain_id: prefill?.domainId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Failed to create issue (${res.status})`)
      }
      const issue: Issue = await res.json()
      onCreated(issue)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create issue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '20px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Create Issue</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div>
          <label style={labelStyle}>Title *</label>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of the issue" maxLength={200} />
          <div style={{ fontSize: '10px', color: title.length > 180 ? 'var(--status-error-text)' : 'var(--text-muted)', textAlign: 'right', marginTop: '2px' }}>{title.length}/200</div>
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" />
        </div>

        <div>
          <label style={labelStyle}>Severity</label>
          <select style={inputStyle} value={severity} onChange={e => setSeverity(e.target.value as IssueSeverity)}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {error && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'default' : 'pointer' }}>
            {submitting ? 'Creating…' : 'Create Issue'}
          </button>
        </div>
      </div>
    </div>
  )
}
