'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Column {
  column_name: string
  data_type?: string
  ordinal_position?: number
  is_nullable?: boolean
  is_primary_key?: boolean
  classification?: string
  description?: string
  _masked?: boolean
  _masked_reason?: string
}

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

interface Props {
  assetId: string
  connectionId?: string
  sourceMeta?: { sf_database_name?: string; sf_schema_name?: string; sf_table_name?: string }
  editing?: boolean
  saveRef?: React.RefObject<(() => Promise<void>) | null>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLS_OPTIONS = ['PII', 'PHI', 'SENSITIVE', 'CONFIDENTIAL', 'RESTRICTED', 'PUBLIC']

const CLS_STYLE: Record<string, { bg: string; color: string }> = {
  PII:          { bg: '#fef2f2', color: '#dc2626' },
  PHI:          { bg: '#fef2f2', color: '#b91c1c' },
  SENSITIVE:    { bg: '#fff7ed', color: '#c2410c' },
  CONFIDENTIAL: { bg: '#fffbeb', color: '#d97706' },
  RESTRICTED:   { bg: '#fefce8', color: '#ca8a04' },
  PUBLIC:       { bg: '#f0fdf4', color: '#16a34a' },
}

const REMEDIATION: Record<string, string> = {
  PII:          'Masked for roles below Data Steward — samples, min/max, top values hidden',
  PHI:          'Masked for roles below Data Steward — samples, min/max, top values hidden',
  SENSITIVE:    'Masked for roles below Data Steward — samples, min/max, top values hidden',
  CONFIDENTIAL: 'Masked for roles below Analyst — samples, min/max, top values hidden',
  RESTRICTED:   'Masked for roles below Analyst — samples, min/max, top values hidden',
  PUBLIC:       'No access restrictions',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clsStyle(cls?: string) {
  return cls ? (CLS_STYLE[cls.toUpperCase()] ?? { bg: 'var(--surface-muted)', color: 'var(--text-secondary)' }) : null
}

function confidenceBar(score: number) {
  const pct = Math.round(score * 100)
  const color = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '48px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  background: 'var(--surface-raised, var(--surface))',
  padding: '6px 10px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  cursor: 'pointer', borderBottom: '1px solid var(--border)', userSelect: 'none',
}
const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden',
}

export default function AssetColumnsSection({ assetId, connectionId, sourceMeta, editing, saveRef }: Props) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [loadingCols, setLoadingCols] = useState(false)
  const [colError, setColError] = useState<string | null>(null)

  // Classification state
  const [classifications, setClassifications] = useState<Record<string, Classification>>({})
  const [tagging, setTagging] = useState<string | null>(null)   // column_name being tagged
  const [tagValue, setTagValue] = useState('')
  const [tagJust, setTagJust] = useState('')
  const [applyingTag, setApplyingTag] = useState(false)

  // AI scan state
  const [scanOpen, setScanOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [findings, setFindings] = useState<PiiFinding[] | null>(null)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  // AI classify-table state
  const [classifyOpen, setClassifyOpen] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [classifyResult, setClassifyResult] = useState<Record<string, unknown> | null>(null)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [appliedClassify, setAppliedClassify] = useState<Set<string>>(new Set())

  // Samples
  const [showSamples, setShowSamples] = useState(false)
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[] | null>(null)
  const [sampleCols, setSampleCols] = useState<string[]>([])
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  // Descriptions
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({})
  const [savingDesc, setSavingDesc] = useState(false)
  const [descSaveError, setDescSaveError] = useState<string | null>(null)

  const hasPendingDescriptions = Object.keys(descDrafts).length > 0

  // ── Load classifications whenever assetId changes ─────────────────────────
  const loadClassifications = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications`, { cache: 'no-store' })
      if (!res.ok) return
      const list: Classification[] = await res.json()
      const map: Record<string, Classification> = {}
      list.forEach(c => { if (c.column_name) map[c.column_name] = c })
      setClassifications(map)
    } catch { /* silently ignore */ }
  }, [assetId])

  // ── Save descriptions ─────────────────────────────────────────────────────
  const saveDescriptions = useCallback(async () => {
    if (Object.keys(descDrafts).length === 0) return
    setSavingDesc(true)
    setDescSaveError(null)
    try {
      for (const [colName, desc] of Object.entries(descDrafts)) {
        const res = await apiFetch(`/api/asset-registry/${assetId}/column-meta/${encodeURIComponent(colName)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc }),
        })
        if (!res.ok) throw new Error(`Failed to save description for ${colName}`)
      }
      setColumns(prev => (prev ?? []).map(c =>
        descDrafts[c.column_name] !== undefined ? { ...c, description: descDrafts[c.column_name] } : c
      ))
      setDescDrafts({})
    } catch (e: unknown) {
      setDescSaveError((e as Error).message)
    } finally {
      setSavingDesc(false)
    }
  }, [descDrafts, assetId])

  useEffect(() => {
    if (saveRef) saveRef.current = hasPendingDescriptions ? saveDescriptions : null
  }, [saveRef, hasPendingDescriptions, saveDescriptions])

  // ── Toggle columns section ────────────────────────────────────────────────
  async function handleToggleColumns() {
    const next = !open
    setOpen(next)
    if (next && columns === null && !loadingCols) {
      setLoadingCols(true)
      setColError(null)
      try {
        const [colRes] = await Promise.all([
          apiFetch(`/api/asset-registry/${assetId}/columns`),
          loadClassifications(),
        ])
        if (!colRes.ok) throw new Error(`HTTP ${colRes.status}`)
        const data = await colRes.json()
        setColumns(data.columns ?? [])
      } catch (e: unknown) {
        setColError((e as Error).message)
        setColumns([])
      } finally {
        setLoadingCols(false)
      }
    }
  }

  // ── Apply a classification to a single column ─────────────────────────────
  async function applyTag(colName: string, cls: string, justification?: string) {
    setApplyingTag(true)
    try {
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_name: colName, classification: cls, justification: justification || null }),
      })
      if (!res.ok) return
      const saved: Classification = await res.json()
      setClassifications(prev => ({ ...prev, [colName]: saved }))
    } finally {
      setApplyingTag(false)
      setTagging(null)
      setTagValue('')
      setTagJust('')
    }
  }

  // ── Remove a classification ───────────────────────────────────────────────
  async function removeTag(colName: string) {
    const existing = classifications[colName]
    if (!existing) return
    await apiFetch(`/api/classifications/assets/${assetId}/classifications/${existing.classification_id}`, {
      method: 'DELETE',
    })
    setClassifications(prev => {
      const next = { ...prev }
      delete next[colName]
      return next
    })
  }

  // ── AI PII Scan ───────────────────────────────────────────────────────────
  async function runAIScan() {
    setScanning(true)
    setFindings(null)
    setScanMsg(null)
    setAccepted(new Set())
    setApplyResult(null)
    try {
      const res = await apiFetch(`/api/ai/discover-pii/${assetId}`, { method: 'POST' })
      const data = await res.json()
      if (data.message) setScanMsg(data.message)
      const f: PiiFinding[] = (data.findings ?? []).filter((f: PiiFinding) =>
        f.suggested_classification !== 'PUBLIC'
      )
      setFindings(f)
      if (f.length === 0 && !data.message) setScanMsg('No sensitive columns detected.')
    } catch {
      setScanMsg('Scan failed — check that an LLM provider is configured in Settings.')
    } finally {
      setScanning(false)
    }
  }

  function toggleAccept(colName: string) {
    setAccepted(prev => {
      const next = new Set(prev)
      next.has(colName) ? next.delete(colName) : next.add(colName)
      return next
    })
  }

  function acceptAll() {
    setAccepted(new Set(findings?.map(f => f.column_name) ?? []))
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
          justification: `AI scan: ${f.pii_type} (${Math.round(f.confidence * 100)}% confidence)`,
        }))
      const res = await apiFetch(`/api/classifications/assets/${assetId}/classifications/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classifications: toApply }),
      })
      const data = await res.json()
      if (res.ok) {
        // Merge saved classifications back into state
        const saved: Classification[] = data.classifications ?? []
        setClassifications(prev => {
          const next = { ...prev }
          saved.forEach(c => { if (c.column_name) next[c.column_name] = c })
          return next
        })
        setApplyResult(`✓ Applied ${data.applied} classification${data.applied !== 1 ? 's' : ''}`)
        setAccepted(new Set())
      } else {
        setApplyResult('✕ Failed to apply — see console')
      }
    } finally {
      setApplying(false)
    }
  }

  // ── AI Classify Table ─────────────────────────────────────────────────────
  async function runClassifyTable() {
    setClassifying(true)
    setClassifyError(null)
    setClassifyResult(null)
    setAppliedClassify(new Set())
    try {
      const res = await apiFetch(`/api/ai/classify-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          table_name: sourceMeta?.sf_table_name,
          schema_name: sourceMeta?.sf_schema_name,
          database_name: sourceMeta?.sf_database_name,
          columns: (columns ?? []).map(c => ({ name: c.column_name, type: c.data_type })),
        }),
      })
      const data = await res.json() as Record<string, unknown>
      setClassifyResult(data)
    } catch (e: unknown) {
      setClassifyError((e as Error).message)
    } finally {
      setClassifying(false)
    }
  }

  async function applyColumnDescription(colName: string, description: string) {
    setAppliedClassify(prev => new Set([...prev, colName]))
    await apiFetch(`/api/asset-registry/${assetId}/column-meta/${encodeURIComponent(colName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    }).catch(() => {/* silently continue */})
    setColumns(prev => (prev ?? []).map(c =>
      c.column_name === colName ? { ...c, description } : c
    ))
  }

  // ── Samples ───────────────────────────────────────────────────────────────
  const canSample = Boolean(connectionId && sourceMeta?.sf_table_name)

  async function handleViewSamples(e: React.MouseEvent) {
    e.stopPropagation()
    if (!canSample) return
    if (sampleRows !== null) { setShowSamples(true); return }
    setLoadingSamples(true)
    setSampleError(null)
    setShowSamples(true)
    try {
      const qs = new URLSearchParams({
        connection_id: connectionId!,
        database: sourceMeta!.sf_database_name ?? '',
        schema: sourceMeta!.sf_schema_name ?? '',
        table: sourceMeta!.sf_table_name!,
        limit: '10',
      })
      const res = await apiFetch(`/api/snowflake/preview?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSampleCols(data.columns ?? [])
      setSampleRows(data.rows ?? [])
    } catch (e: unknown) {
      setSampleError((e as Error).message)
      setSampleRows([])
    } finally {
      setLoadingSamples(false)
    }
  }

  const colCount = columns?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* ── Column section ── */}
      <div style={sectionStyle}>
        <div style={headerStyle} onClick={handleToggleColumns}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
            {open ? '▼' : '▶'} Columns{columns !== null ? ` (${colCount})` : ''}
            {Object.keys(classifications).length > 0 && (
              <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: '4px' }}>
                {Object.keys(classifications).length} tagged
              </span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
            {editing && hasPendingDescriptions && (
              <button onClick={saveDescriptions} disabled={savingDesc}
                style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: savingDesc ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: savingDesc ? 0.6 : 1 }}>
                {savingDesc ? 'Saving…' : 'Save Descriptions'}
              </button>
            )}
            {/* AI Scan button */}
            <button
              onClick={() => { setScanOpen(o => !o); if (!scanOpen && !findings) runAIScan() }}
              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid #d97706', background: scanOpen ? '#fffbeb' : 'var(--surface)', color: '#d97706', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              🔍 Scan with AI
            </button>
            {/* AI Classify button */}
            <button
              onClick={() => { setClassifyOpen(o => !o); if (!classifyOpen && !classifyResult) runClassifyTable() }}
              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid #7c3aed', background: classifyOpen ? '#f5f3ff' : 'var(--surface)', color: '#7c3aed', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✨ Classify with AI
            </button>
            <button onClick={handleViewSamples} disabled={!canSample}
              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: canSample ? 'var(--accent-bg)' : 'var(--surface)', color: canSample ? 'var(--accent)' : 'var(--text-muted)', cursor: canSample ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
              View 10 Samples
            </button>
          </div>
        </div>

        {descSaveError && (
          <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--status-error-text)', background: 'var(--status-error-bg)' }}>
            {descSaveError}
          </div>
        )}

        {/* ── AI Scan results panel ── */}
        {scanOpen && (
          <div style={{ borderBottom: '1px solid var(--border)', background: '#fffbeb', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>AI Sensitivity Scan</span>
              <button onClick={runAIScan} disabled={scanning}
                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #d97706', background: 'transparent', color: '#d97706', cursor: scanning ? 'not-allowed' : 'pointer' }}>
                {scanning ? 'Scanning…' : 'Re-scan'}
              </button>
              {applyResult && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: applyResult.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{applyResult}</span>
              )}
              <button onClick={() => setScanOpen(false)} style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕ close</button>
            </div>

            {scanning && <div style={{ fontSize: '12px', color: '#92400e' }}>Scanning columns for sensitive data…</div>}
            {scanMsg && !scanning && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{scanMsg}</div>}

            {findings && findings.length > 0 && !scanning && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '10px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #d97706' }}>
                      {['', 'Column', 'PII Type', 'Confidence', 'Classification'].map(h => (
                        <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#92400e', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => {
                      const s = clsStyle(f.suggested_classification)
                      const isAccepted = accepted.has(f.column_name)
                      const alreadyTagged = !!classifications[f.column_name]
                      return (
                        <tr key={f.column_name} style={{ borderBottom: '1px solid #fde68a', background: isAccepted ? '#fef9c3' : 'transparent' }}>
                          <td style={{ padding: '4px 8px' }}>
                            <input type="checkbox" checked={isAccepted} onChange={() => toggleAccept(f.column_name)}
                              style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: 'var(--foreground)', fontWeight: 500 }}>{f.column_name}</td>
                          <td style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}>{f.pii_type}</td>
                          <td style={{ padding: '4px 8px' }}>{confidenceBar(f.confidence)}</td>
                          <td style={{ padding: '4px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {s && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: s.bg, color: s.color }}>{f.suggested_classification}</span>}
                              {alreadyTagged && <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>(already tagged)</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={acceptAll} style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: '1px solid #d97706', background: 'transparent', color: '#d97706', cursor: 'pointer', fontWeight: 600 }}>
                    Select All
                  </button>
                  <button onClick={applyAccepted} disabled={accepted.size === 0 || applying}
                    style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '4px', border: 'none', background: accepted.size > 0 ? '#d97706' : 'var(--border)', color: accepted.size > 0 ? '#fff' : 'var(--text-muted)', cursor: accepted.size > 0 && !applying ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                    {applying ? 'Applying…' : `Apply ${accepted.size > 0 ? `(${accepted.size})` : ''}`}
                  </button>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Check columns to accept, then click Apply to save classifications
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── AI Classify Table panel ── */}
        {classifyOpen && (
          <div style={{ borderBottom: '1px solid var(--border)', background: '#f5f3ff', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#5b21b6' }}>AI Column Classification</span>
              <button onClick={runClassifyTable} disabled={classifying}
                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: classifying ? 'not-allowed' : 'pointer' }}>
                {classifying ? 'Classifying…' : 'Re-classify'}
              </button>
              <button onClick={() => setClassifyOpen(false)} style={{ marginLeft: 'auto', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>✕ close</button>
            </div>
            {classifying && <div style={{ fontSize: '12px', color: '#7c3aed' }}>Analyzing table schema with AI…</div>}
            {classifyError && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>Classification failed: {classifyError}</div>}
            {!classifying && classifyResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {classifyResult.table_description != null && (
                  <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', fontSize: '12px', color: '#4c1d95', lineHeight: '1.6' }}>
                    <strong>Table summary:</strong> {String(classifyResult.table_description)}
                  </div>
                )}
                {Array.isArray(classifyResult.columns) && classifyResult.columns.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Column Descriptions</div>
                    {(classifyResult.columns as Record<string, unknown>[]).map((col, i) => {
                      const name = String(col.column_name ?? col.name ?? '')
                      const desc = String(col.description ?? col.business_meaning ?? '')
                      const applied = appliedClassify.has(name)
                      if (!name || !desc) return null
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid #ddd6fe' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#4c1d95', minWidth: '120px', fontWeight: 600, paddingTop: '1px' }}>{name}</span>
                          <span style={{ flex: 1, fontSize: '11.5px', color: '#3b0764', lineHeight: '1.5' }}>{desc}</span>
                          <button
                            onClick={() => applyColumnDescription(name, desc)}
                            disabled={applied}
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: 'none', background: applied ? 'var(--status-ok-bg)' : '#7c3aed', color: applied ? 'var(--status-ok-text)' : '#fff', cursor: applied ? 'default' : 'pointer', flexShrink: 0 }}>
                            {applied ? '✓ Applied' : 'Apply'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {!classifyResult.table_description && !Array.isArray(classifyResult.columns) && (
                  <div style={{ fontSize: '12px', color: '#7c3aed' }}>Classification complete. Check column descriptions in the table below.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Column table ── */}
        {open && (
          <div style={{ overflowX: 'auto' }}>
            {loadingCols && <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading columns…</div>}
            {colError && <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--status-error-text)' }}>{colError}</div>}
            {!loadingCols && columns !== null && columns.length === 0 && !colError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                No column metadata. Run column profiling to populate this.
              </div>
            )}
            {!loadingCols && columns && columns.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Name', 'Type', 'Nullable', 'Sensitivity', 'Remediation', 'Description'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => {
                    const saved = classifications[col.column_name]
                    const effectiveCls = saved?.classification || col.classification
                    const s = clsStyle(effectiveCls)
                    const isTagging = tagging === col.column_name
                    const isMasked = col._masked

                    return (
                      <tr key={col.column_name} style={{ borderBottom: '1px solid var(--border)', background: isMasked ? '#fef2f240' : undefined }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {col.ordinal_position ?? i + 1}
                        </td>
                        <td style={{ padding: '4px 8px', color: 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {col.column_name}
                          {col.is_primary_key && <span style={{ marginLeft: '4px', fontSize: '8px', color: 'var(--status-ok-text)', fontWeight: 700, background: 'var(--status-ok-bg)', padding: '0 4px', borderRadius: '3px' }}>PK</span>}
                        </td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {col.data_type ?? '—'}
                        </td>
                        <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: col.is_nullable === undefined ? 'var(--text-muted)' : col.is_nullable ? 'var(--text-muted)' : 'var(--foreground)', fontSize: '10px' }}>
                            {col.is_nullable === undefined ? '—' : col.is_nullable ? 'YES' : 'NO'}
                          </span>
                        </td>

                        {/* ── Sensitivity cell ── */}
                        <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                          {isTagging ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                              <select value={tagValue} onChange={e => setTagValue(e.target.value)} autoFocus
                                style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}>
                                <option value="">— select —</option>
                                {CLS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                              <input value={tagJust} onChange={e => setTagJust(e.target.value)}
                                placeholder="Justification (optional)"
                                style={{ fontSize: '10px', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }} />
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => tagValue && applyTag(col.column_name, tagValue, tagJust)} disabled={!tagValue || applyingTag}
                                  style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', border: 'none', background: '#2563eb', color: '#fff', cursor: !tagValue || applyingTag ? 'not-allowed' : 'pointer' }}>
                                  {applyingTag ? '…' : 'Save'}
                                </button>
                                <button onClick={() => { setTagging(null); setTagValue(''); setTagJust('') }}
                                  style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {s && effectiveCls ? (
                                <span
                                  title={saved ? `${saved.classification} · ${saved.justification || 'no justification'} · by ${saved.applied_by || 'unknown'} · ${saved.created_at ? new Date(saved.created_at).toLocaleDateString() : ''}` : effectiveCls}
                                  style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: s.bg, color: s.color, cursor: 'help' }}>
                                  {effectiveCls}
                                </span>
                              ) : (
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>—</span>
                              )}
                              <button onClick={() => { setTagging(col.column_name); setTagValue(effectiveCls || ''); setTagJust(saved?.justification || '') }}
                                title="Set classification"
                                style={{ fontSize: '10px', lineHeight: 1, padding: '0 3px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                ✎
                              </button>
                              {effectiveCls && (
                                <button onClick={() => removeTag(col.column_name)} title="Remove classification"
                                  style={{ fontSize: '9px', padding: '0 3px', borderRadius: '3px', border: '1px solid var(--border)', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* ── Remediation cell ── */}
                        <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                          {isMasked ? (
                            <span title={col._masked_reason} style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: '#fef2f2', color: '#dc2626', cursor: 'help' }}>
                              🔒 Masked
                            </span>
                          ) : effectiveCls ? (
                            <span title={REMEDIATION[effectiveCls.toUpperCase()] || 'No restrictions'} style={{ fontSize: '9px', color: 'var(--text-muted)', cursor: 'help' }}>
                              {effectiveCls.toUpperCase() === 'PUBLIC' ? '✓ No masking' : 'Access controlled'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>

                        {/* ── Description cell ── */}
                        <td style={{ padding: '4px 8px', minWidth: '120px', maxWidth: '220px' }}>
                          {editing ? (
                            <input
                              value={descDrafts[col.column_name] ?? col.description ?? ''}
                              onChange={e => setDescDrafts(prev => ({ ...prev, [col.column_name]: e.target.value }))}
                              placeholder="Add description…"
                              style={{ width: '100%', fontSize: '10px', padding: '2px 4px', border: '1px solid var(--border)', borderRadius: '3px', background: 'var(--background)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' as const }}
                            />
                          ) : (
                            <span style={{ fontSize: '10px', color: col.description ? 'var(--foreground)' : 'var(--text-muted)' }}>
                              {col.description || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Sample Records section ── */}
      {showSamples && (
        <div style={sectionStyle}>
          <div style={{ ...headerStyle, cursor: 'default' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
              ▼ Sample Records{sampleRows ? ` (${sampleRows.length} rows)` : ''}
            </span>
            <button onClick={() => setShowSamples(false)}
              style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              ▲ hide
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {loadingSamples && <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Loading sample records…</div>}
            {sampleError && <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--status-error-text)' }}>{sampleError}</div>}
            {!loadingSamples && sampleRows && sampleRows.length === 0 && !sampleError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No sample records returned.</div>
            )}
            {!loadingSamples && sampleRows && sampleRows.length > 0 && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {sampleCols.map(col => (
                        <th key={col} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                          {col}
                          {classifications[col] && (
                            <span style={{ marginLeft: '4px', fontSize: '8px', fontWeight: 700, padding: '0 3px', borderRadius: '2px', background: clsStyle(classifications[col].classification)?.bg, color: clsStyle(classifications[col].classification)?.color }}>
                              {classifications[col].classification}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        {sampleCols.map(col => (
                          <td key={col} style={{ padding: '4px 8px', color: 'var(--foreground)', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[col] == null ? <span style={{ color: 'var(--text-muted)' }}>null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  {sampleRows.length} rows · live query from Snowflake
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
