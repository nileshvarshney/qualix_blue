'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Classification {
  classification_id: string
  column_name: string | null
  classification: string
  justification?: string | null
  applied_by?: string | null
  created_at?: string | null
}

interface PiiFinding {
  column_name: string
  pii_type: string
  confidence: number
  suggested_classification: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLS_ORDER = ['PII', 'PHI', 'SENSITIVE', 'CONFIDENTIAL', 'RESTRICTED', 'PUBLIC']

const CLS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  PII:          { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  PHI:          { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  SENSITIVE:    { bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  CONFIDENTIAL: { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },
  RESTRICTED:   { bg: '#fefce8', color: '#ca8a04', border: '#fde047' },
  PUBLIC:       { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
}

const REMEDIATION_DESC: Record<string, { title: string; desc: string; minRole: string }> = {
  PII:          { title: 'PII / PHI', desc: 'Samples, top values, min/max masked for roles below Data Steward', minRole: 'data_steward' },
  PHI:          { title: 'PII / PHI', desc: 'Samples, top values, min/max masked for roles below Data Steward', minRole: 'data_steward' },
  SENSITIVE:    { title: 'Sensitive', desc: 'Samples, top values, min/max masked for roles below Data Steward', minRole: 'data_steward' },
  CONFIDENTIAL: { title: 'Confidential', desc: 'Samples, top values, min/max masked for roles below Analyst', minRole: 'analyst' },
  RESTRICTED:   { title: 'Restricted', desc: 'Samples, top values, min/max masked for roles below Analyst', minRole: 'analyst' },
  PUBLIC:       { title: 'Public', desc: 'No column-level access restrictions', minRole: 'viewer' },
}

const CLS_OPTIONS = ['PII', 'PHI', 'SENSITIVE', 'CONFIDENTIAL', 'RESTRICTED', 'PUBLIC']

// ── Helpers ───────────────────────────────────────────────────────────────────

function clsStyle(cls?: string) {
  return cls ? (CLS_STYLE[cls.toUpperCase()] ?? { bg: 'var(--surface-muted)', color: 'var(--text-secondary)', border: 'var(--border)' }) : null
}

function fmt(ts?: string | null) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'short' }) } catch { return ts }
}

function confidencePct(score: number) {
  return Math.round(score * 100)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssetSensitivityTab({ assetId }: { assetId: string }) {
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCls, setEditCls] = useState('')
  const [editJust, setEditJust] = useState('')
  const [saving, setSaving] = useState(false)

  // AI scan
  const [scanning, setScanning] = useState(false)
  const [findings, setFindings] = useState<PiiFinding[] | null>(null)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  // Security policy settings
  const [piiMinRole, setPiiMinRole] = useState<string | null>(null)
  const [confMinRole, setConfMinRole] = useState<string | null>(null)

  const loadClassifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications`, { cache: 'no-store' })
      if (!res.ok) { setClassifications([]); return }
      const list: Classification[] = await res.json()
      setClassifications(Array.isArray(list) ? list : [])
    } catch { setClassifications([]) }
    finally { setLoading(false) }
  }, [assetId])

  useEffect(() => {
    loadClassifications()
    // Load security settings for policy display
    apiFetch('/api/security').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setPiiMinRole(d.column_access_pii_min_role || 'data_steward')
        setConfMinRole(d.column_access_confidential_min_role || 'analyst')
      }
    }).catch(() => {})
  }, [assetId, loadClassifications])

  // ── Summary counts ────────────────────────────────────────────────────────
  const summary: Record<string, number> = {}
  classifications.forEach(c => {
    const k = c.classification.toUpperCase()
    summary[k] = (summary[k] ?? 0) + 1
  })
  const columnTagged = classifications.filter(c => c.column_name).length
  const assetTagged = classifications.filter(c => !c.column_name).length

  // ── Remove ────────────────────────────────────────────────────────────────
  async function removeTag(c: Classification) {
    setRemoving(c.classification_id)
    try {
      await apiFetch(`/api/classifications/assets/${assetId}/classifications/${c.classification_id}`, { method: 'DELETE' })
      setClassifications(prev => prev.filter(x => x.classification_id !== c.classification_id))
    } finally { setRemoving(null) }
  }

  // ── Inline edit save ──────────────────────────────────────────────────────
  async function saveEdit(c: Classification) {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_name: c.column_name, classification: editCls, justification: editJust }),
      })
      if (res.ok) {
        const updated: Classification = await res.json()
        setClassifications(prev => prev.map(x => x.classification_id === c.classification_id ? updated : x))
      }
    } finally { setSaving(false); setEditingId(null) }
  }

  // ── AI Scan ───────────────────────────────────────────────────────────────
  async function runScan() {
    setScanning(true)
    setFindings(null)
    setScanMsg(null)
    setAccepted(new Set())
    setApplyResult(null)
    try {
      const res = await apiFetch(`/api/ai/discover-pii/${assetId}`, { method: 'POST' })
      const data = await res.json()
      if (data.message) setScanMsg(data.message)
      const f: PiiFinding[] = (data.findings ?? []).filter((f: PiiFinding) => f.suggested_classification !== 'PUBLIC')
      setFindings(f)
      if (f.length === 0 && !data.message) setScanMsg('No sensitive columns detected — this asset appears clean.')
    } catch { setScanMsg('Scan failed — ensure an LLM provider is configured in Settings → LLM.') }
    finally { setScanning(false) }
  }

  async function applyAccepted() {
    if (accepted.size === 0 || !findings) return
    setApplying(true)
    setApplyResult(null)
    try {
      const toApply = findings
        .filter(f => accepted.has(f.column_name))
        .map(f => ({
          column_name: f.column_name,
          classification: f.suggested_classification,
          justification: `AI scan: ${f.pii_type} (${confidencePct(f.confidence)}% confidence)`,
        }))
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classifications: toApply }),
      })
      const data = await res.json()
      if (res.ok) {
        setApplyResult(`✓ Applied ${data.applied} classification${data.applied !== 1 ? 's' : ''}`)
        setAccepted(new Set())
        await loadClassifications()
      } else {
        setApplyResult('✕ Failed to apply')
      }
    } finally { setApplying(false) }
  }

  const hasSensitive = Object.keys(summary).some(k => ['PII', 'PHI', 'SENSITIVE'].includes(k))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Summary banner ── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {CLS_ORDER.map(cls => {
          const cnt = summary[cls] ?? 0
          if (cnt === 0) return null
          const s = CLS_STYLE[cls]
          return (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', background: s.bg, border: `1px solid ${s.border}` }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{cnt}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: s.color }}>{cls}</span>
            </div>
          )
        })}
        {classifications.length === 0 && !loading && (
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--surface-raised, var(--surface))', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
            No classifications yet — use the Columns tab to tag individual columns, or run an AI scan below.
          </div>
        )}
        {loading && <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>Loading…</div>}
      </div>

      {/* ── Stats row ── */}
      {classifications.length > 0 && (
        <div style={{ display: 'flex', gap: '24px', fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <span><strong style={{ color: 'var(--foreground)' }}>{classifications.length}</strong> total classifications</span>
          <span><strong style={{ color: 'var(--foreground)' }}>{columnTagged}</strong> column-level</span>
          {assetTagged > 0 && <span><strong style={{ color: 'var(--foreground)' }}>{assetTagged}</strong> asset-level</span>}
          {hasSensitive && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Contains sensitive data</span>}
        </div>
      )}

      {/* ── Classifications table ── */}
      {classifications.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--surface-raised, var(--surface))', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Tagged Columns</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click ✎ to edit, ✕ to remove</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted, transparent)' }}>
                {['Column', 'Classification', 'Justification', 'Tagged By', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classifications.map(c => {
                const s = clsStyle(c.classification)
                const isEditing = editingId === c.classification_id
                return (
                  <tr key={c.classification_id} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--surface-raised, var(--surface))' : undefined }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--foreground)', fontWeight: 500 }}>
                      {c.column_name ?? <em style={{ color: 'var(--text-muted)' }}>asset-level</em>}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      {isEditing ? (
                        <select value={editCls} onChange={e => setEditCls(e.target.value)}
                          style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}>
                          {CLS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        s && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: s.bg, color: s.color }}>{c.classification}</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                      {isEditing ? (
                        <input value={editJust} onChange={e => setEditJust(e.target.value)}
                          placeholder="Justification…"
                          style={{ width: '100%', fontSize: '10px', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
                      ) : (
                        <span style={{ fontSize: '10px', fontStyle: c.justification ? undefined : 'italic', color: c.justification ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                          {c.justification || 'none'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '10px' }}>
                      {c.applied_by || '—'}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '10px' }}>
                      {fmt(c.created_at)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => saveEdit(c)} disabled={saving}
                            style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '3px', border: 'none', background: '#2563eb', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                            {saving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => { setEditingId(c.classification_id); setEditCls(c.classification); setEditJust(c.justification || '') }}
                            title="Edit classification"
                            style={{ fontSize: '11px', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            ✎
                          </button>
                          <button onClick={() => removeTag(c)} disabled={removing === c.classification_id}
                            title="Remove classification"
                            style={{ fontSize: '11px', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: '#dc2626', cursor: removing === c.classification_id ? 'not-allowed' : 'pointer', opacity: removing === c.classification_id ? 0.5 : 1 }}>
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── AI Scan section ── */}
      <div style={{ border: '1px solid #fde68a', borderRadius: '6px', overflow: 'hidden', background: '#fffbeb' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>🔍 AI Sensitivity Scan</span>
          <span style={{ fontSize: '11px', color: '#92400e' }}>LLM-powered PII/PHI detection across all columns</span>
          <button onClick={runScan} disabled={scanning}
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '4px 14px', borderRadius: '5px', border: '1px solid #d97706', background: scanning ? 'transparent' : '#d97706', color: scanning ? '#d97706' : '#fff', cursor: scanning ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>

        <div style={{ padding: '12px 14px' }}>
          {!scanning && !findings && !scanMsg && (
            <div style={{ fontSize: '12px', color: '#92400e' }}>
              Click <strong>Run Scan</strong> to analyze column names and sample values for PII, PHI, and other sensitive data.
              Results are returned with confidence scores — you choose which to accept.
            </div>
          )}
          {scanning && (
            <div style={{ fontSize: '12px', color: '#92400e' }}>Analyzing columns for sensitive data patterns…</div>
          )}
          {scanMsg && !scanning && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: findings && findings.length > 0 ? '12px' : 0 }}>{scanMsg}</div>
          )}
          {applyResult && (
            <div style={{ fontSize: '12px', fontWeight: 600, color: applyResult.startsWith('✓') ? '#16a34a' : '#dc2626', marginBottom: '8px' }}>
              {applyResult}
            </div>
          )}

          {findings && findings.length > 0 && !scanning && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #fde68a' }}>
                    {['', 'Column', 'PII Type', 'Confidence', 'Suggested Classification', 'Currently Tagged'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#92400e', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {findings.map(f => {
                    const s = clsStyle(f.suggested_classification)
                    const isAcc = accepted.has(f.column_name)
                    const pct = confidencePct(f.confidence)
                    const barColor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'
                    const already = classifications.find(c => c.column_name === f.column_name)
                    return (
                      <tr key={f.column_name} style={{ borderBottom: '1px solid #fef9c3', background: isAcc ? '#fef9c3' : 'transparent' }}>
                        <td style={{ padding: '5px 8px' }}>
                          <input type="checkbox" checked={isAcc}
                            onChange={() => setAccepted(prev => { const n = new Set(prev); n.has(f.column_name) ? n.delete(f.column_name) : n.add(f.column_name); return n })}
                            style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 500, color: 'var(--foreground)' }}>{f.column_name}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{f.pii_type}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '56px', height: '5px', background: '#fde68a', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '2px' }} />
                            </div>
                            <span style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums', color: '#92400e', fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          {s && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: s.bg, color: s.color }}>{f.suggested_classification}</span>}
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          {already ? (
                            <span style={{ fontSize: '9px', fontWeight: 600, color: '#16a34a' }}>✓ {already.classification}</span>
                          ) : (
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => setAccepted(new Set(findings.map(f => f.column_name)))}
                  style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: '1px solid #d97706', background: 'transparent', color: '#d97706', cursor: 'pointer', fontWeight: 600 }}>
                  Select All
                </button>
                <button onClick={applyAccepted} disabled={accepted.size === 0 || applying}
                  style={{ fontSize: '11px', padding: '4px 14px', borderRadius: '4px', border: 'none', background: accepted.size > 0 ? '#d97706' : '#e5e7eb', color: accepted.size > 0 ? '#fff' : 'var(--text-muted)', cursor: accepted.size > 0 && !applying ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                  {applying ? 'Applying…' : `Apply Selected${accepted.size > 0 ? ` (${accepted.size})` : ''}`}
                </button>
                <button onClick={runScan} disabled={scanning}
                  style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Re-scan
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Remediation policy ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', background: 'var(--surface-raised, var(--surface))', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Remediation Policy</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>Column-level access control enforced at query time</span>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.entries(REMEDIATION_DESC).map(([cls, info]) => {
            const s = CLS_STYLE[cls]
            const isActive = !!summary[cls]
            const configRole = cls === 'PII' || cls === 'PHI' || cls === 'SENSITIVE'
              ? (piiMinRole || 'data_steward')
              : cls === 'PUBLIC'
                ? null
                : (confMinRole || 'analyst')
            return (
              <div key={cls} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', opacity: isActive ? 1 : 0.5 }}>
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: s.bg, color: s.color, whiteSpace: 'nowrap', marginTop: '2px' }}>{cls}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--foreground)', fontWeight: 500 }}>{info.desc}</div>
                  {configRole && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      Minimum role to see unmasked data: <strong style={{ color: 'var(--text-secondary)' }}>{configRole.replace('_', ' ')}</strong>
                      {' '}· <a href="/security" style={{ color: 'var(--accent)', textDecoration: 'none' }}>change in Security Settings</a>
                    </div>
                  )}
                </div>
                {isActive && (
                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {summary[cls]} col{summary[cls] !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
