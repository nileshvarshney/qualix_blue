'use client'
import { useEffect, useState } from 'react'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import IssueDetailPanel from '@/components/issues/IssueDetailPanel'
import { Issue, IssueSeverity, IssueStatus } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const SEV_CFG: Record<IssueSeverity, { bg: string; color: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
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

export default function AssetIssuesTab({ assetId, domainId }: { assetId: string; domainId?: string | null }) {
  const [items, setItems] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Issue | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    apiFetch(`/api/issues?asset_id=${assetId}&limit=50`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [assetId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Create Issue
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading issues…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No issues for this asset
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map(issue => {
            const sev = SEV_CFG[issue.severity]
            const st = ST_CFG[issue.status]
            return (
              <div
                key={issue.issue_id}
                onClick={() => setSelected(issue)}
                style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: '8px', alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              >
                <span style={{ background: sev.bg, color: sev.color, padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{issue.severity}</span>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</span>
                <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, textAlign: 'center' }}>{st.label}</span>
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
              setItems(prev => prev.map(i => i.issue_id === merged.issue_id ? merged : i))
              setSelected(merged)
            }}
          />
        </div>
      )}

      {showCreate && (
        <CreateIssueModal
          prefill={{ assetId, issueType: 'manual', domainId }}
          onClose={() => setShowCreate(false)}
          onCreated={issue => { setShowCreate(false); setItems(prev => [issue, ...prev]) }}
        />
      )}
    </div>
  )
}
