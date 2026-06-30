'use client'
import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Framework {
  id: string; name: string; version: string; description: string
  controlsTotal: number; controlsPassed: number; controlsFailed: number
  status: 'compliant' | 'partial' | 'non-compliant'
}

interface Control {
  id: string; code: string; name: string; description: string; framework: string
  status: 'passed' | 'failed' | 'not-assessed'
  rulesMapped: number; lastAssessed: string | null; evidence: string
  ruleTypes: string
}

function statusStyle(s: string) {
  if (s === 'compliant' || s === 'passed') return { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
  if (s === 'partial' || s === 'not-assessed') return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
  return { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' }
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }

export default function CompliancePage() {
  const [selectedFw, setSelectedFw] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'not-assessed'>('all')
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [controls, setControls] = useState<Control[]>([])
  const [controlsLoading, setControlsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [assessing, setAssessing] = useState<string | null>(null)
  const [evidenceDays, setEvidenceDays] = useState(30)
  const [exportingEvidence, setExportingEvidence] = useState(false)
  const [autoMapping, setAutoMapping] = useState(false)
  const [aiGaps, setAiGaps] = useState<{ gaps?: { control: string; action: string }[]; summary?: string; [key: string]: unknown } | null>(null)
  const [aiGapsLoading, setAiGapsLoading] = useState(false)
  const [aiGapsError, setAiGapsError] = useState<string | null>(null)
  const autoMapFiredRef = useRef<string | null>(null)
  const [autoMapStatus, setAutoMapStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  useEffect(() => {
    apiFetch('/api/compliance')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setFrameworks(items.map((f: Record<string, unknown>, i: number) => ({
          id: String(f.framework_id ?? f.id ?? i),
          name: String(f.framework_name ?? f.name ?? ''),
          version: String(f.version ?? ''),
          description: String(f.description ?? ''),
          controlsTotal: Number(f.controls_total ?? f.controlsTotal ?? 0),
          controlsPassed: Number(f.controls_passed ?? f.controlsPassed ?? 0),
          controlsFailed: Number(f.controls_failed ?? f.controlsFailed ?? 0),
          status: (f.status as 'compliant' | 'partial' | 'non-compliant') ?? 'partial',
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFw) { setControls([]); return }
    setControlsLoading(true)
    apiFetch(`/api/compliance/${selectedFw}/controls`)
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setControls(items.map((c: Record<string, unknown>) => ({
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
        setControlsLoading(false)

        // AUTO-MAP: if controls came back empty and we haven't fired for this framework yet
        if (items.length === 0 && selectedFw && autoMapFiredRef.current !== selectedFw) {
          autoMapFiredRef.current = selectedFw
          setAutoMapStatus('running')
          apiFetch(`/api/compliance/${selectedFw}/auto-map`, { method: 'POST' })
            .then(r => r.json())
            .then(() => {
              setAutoMapStatus('done')
              // Re-fetch controls after auto-map completes
              return apiFetch(`/api/compliance/${selectedFw}/controls`)
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
      .catch(() => setControlsLoading(false))
  }, [selectedFw])

  async function handleSeed() {
    setSeeding(true)
    try {
      await apiFetch('/api/compliance/seed', { method: 'POST' })
      const r = await apiFetch('/api/compliance')
      const data = await r.json()
      const items = Array.isArray(data) ? data : []
      setFrameworks(items.map((f: Record<string, unknown>, i: number) => ({
        id: String(f.framework_id ?? f.id ?? i),
        name: String(f.framework_name ?? f.name ?? ''),
        version: String(f.version ?? ''),
        description: String(f.description ?? ''),
        controlsTotal: Number(f.controls_total ?? 0),
        controlsPassed: Number(f.controls_passed ?? 0),
        controlsFailed: Number(f.controls_failed ?? 0),
        status: (f.status as 'compliant' | 'partial' | 'non-compliant') ?? 'partial',
      })))
    } finally { setSeeding(false) }
  }

  async function handleAssessAll(fwId: string) {
    setAssessing(fwId)
    try {
      await apiFetch(`/api/compliance/${fwId}/assess-all`, { method: 'POST' })
      const r = await apiFetch('/api/compliance')
      const data = await r.json()
      const items = Array.isArray(data) ? data : []
      setFrameworks(items.map((f: Record<string, unknown>, i: number) => ({
        id: String(f.framework_id ?? f.id ?? i),
        name: String(f.framework_name ?? f.name ?? ''),
        version: String(f.version ?? ''),
        description: String(f.description ?? ''),
        controlsTotal: Number(f.controls_total ?? 0),
        controlsPassed: Number(f.controls_passed ?? 0),
        controlsFailed: Number(f.controls_failed ?? 0),
        status: (f.status as 'compliant' | 'partial' | 'non-compliant') ?? 'partial',
      })))
      if (fwId === selectedFw) {
        const cr = await apiFetch(`/api/compliance/${fwId}/controls`)
        const cd = await cr.json()
        setControls((Array.isArray(cd) ? cd : []).map((c: Record<string, unknown>) => ({
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
      }
    } finally { setAssessing(null) }
  }

  async function handleAutoMap() {
    if (!selectedFw) return
    setAutoMapping(true)
    try {
      await apiFetch(`/api/compliance/${selectedFw}/auto-map`, { method: 'POST' })
      const cr = await apiFetch(`/api/compliance/${selectedFw}/controls`)
      const cd = await cr.json()
      setControls((Array.isArray(cd) ? cd : []).map((c: Record<string, unknown>) => ({
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
    } finally { setAutoMapping(false) }
  }

  function runAiGapAnalysis() {
    if (!selectedFw) return
    setAiGapsLoading(true)
    setAiGapsError(null)
    const fw = frameworks.find(f => f.id === selectedFw)
    apiFetch('/api/ai/compliance-gaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework_id: selectedFw,
        framework_name: fw?.name,
        controls: controls.map(c => ({ code: c.code, name: c.name, status: c.status, rules_mapped: c.rulesMapped })),
        failed_count: controls.filter(c => c.status === 'failed').length,
        not_assessed_count: controls.filter(c => c.status === 'not-assessed').length,
      }),
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(d => setAiGaps(d as typeof aiGaps))
      .catch(e => setAiGapsError(e instanceof Error ? e.message : 'AI analysis unavailable'))
      .finally(() => setAiGapsLoading(false))
  }

  async function handleExportEvidence() {
    setExportingEvidence(true)
    try {
      const r = await apiFetch(`/api/audit/evidence-report?days=${evidenceDays}`)
      const data = await r.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `evidence-report-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 100)
    } catch { /* silent */ }
    finally { setExportingEvidence(false) }
  }

  const filteredControls = controls.filter(c => filter === 'all' || c.status === filter)

  const totalControls = frameworks.reduce((s, f) => s + f.controlsTotal, 0)
  const passedControls = frameworks.reduce((s, f) => s + f.controlsPassed, 0)
  const failedControls = frameworks.reduce((s, f) => s + f.controlsFailed, 0)
  const compliantCount = frameworks.filter(f => f.status === 'compliant').length
  const overallPct = frameworks.length > 0 ? (totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 0) : null

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>Workspace · <span style={{ color: 'var(--text-secondary)' }}>Compliance</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Compliance & Regulations</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            value={evidenceDays}
            onChange={e => setEvidenceDays(Number(e.target.value))}
            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={handleExportEvidence}
            disabled={exportingEvidence}
            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '12px', color: 'var(--text-secondary)', cursor: exportingEvidence ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            {exportingEvidence ? 'Generating…' : '⬇ Export Evidence'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>Map data quality rules to regulatory frameworks and track compliance posture</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Overall Compliance</div>
          <span style={{ fontSize: '32px', fontWeight: 700, color: overallPct != null ? 'var(--foreground)' : 'var(--text-muted)', letterSpacing: '-1px' }}>
            {overallPct != null ? `${overallPct}%` : '—'}
          </span>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Frameworks Tracked</div>
          <span style={{ fontSize: '32px', fontWeight: 700, color: frameworks.length > 0 ? 'var(--foreground)' : 'var(--text-muted)', letterSpacing: '-1px' }}>
            {frameworks.length > 0 ? frameworks.length : '—'}
          </span>
          {compliantCount > 0 && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>{compliantCount} fully compliant</div>}
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Controls Passed</div>
          <span style={{ fontSize: '32px', fontWeight: 700, color: totalControls > 0 ? 'var(--foreground)' : 'var(--text-muted)', letterSpacing: '-1px' }}>
            {totalControls > 0 ? `${passedControls}/${totalControls}` : '—'}
          </span>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Open Gaps</div>
          <span style={{ fontSize: '32px', fontWeight: 700, color: totalControls > 0 ? 'var(--foreground)' : 'var(--text-muted)', letterSpacing: '-1px' }}>
            {totalControls > 0 ? failedControls : '—'}
          </span>
        </div>
      </div>

      {/* Frameworks Grid */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '16px' }}>Regulatory Frameworks</div>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : frameworks.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            <div style={{ marginBottom: '12px' }}>No compliance frameworks configured</div>
            <button onClick={handleSeed} disabled={seeding} style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: seeding ? 'not-allowed' : 'pointer',
              background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '13px',
            }}>{seeding ? 'Initializing…' : 'Initialize Frameworks'}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
            {frameworks.map(fw => {
              const pct = fw.controlsTotal > 0 ? Math.round((fw.controlsPassed / fw.controlsTotal) * 100) : 0
              const st = statusStyle(fw.status)
              const isSelected = selectedFw === fw.id
              return (
                <div key={fw.id} onClick={() => setSelectedFw(isSelected ? null : fw.id)} style={{
                  border: `1px solid ${isSelected ? '#93c5fd' : 'var(--border)'}`, borderRadius: '10px',
                  padding: '14px 16px', cursor: 'pointer', background: isSelected ? 'var(--status-info-bg)' : 'var(--surface)',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--foreground)' }}>{fw.name}</div>
                    <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {fw.status.replace('-', ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>{fw.version}</div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: st.color, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--status-ok-text)' }}>{fw.controlsPassed}</span>
                    {' / '}{fw.controlsTotal} controls passed
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssessAll(fw.id) }}
                    disabled={assessing === fw.id}
                    style={{
                      marginTop: '8px', width: '100%', padding: '4px 0', borderRadius: '6px', border: '1px solid var(--border)',
                      background: 'transparent', cursor: assessing === fw.id ? 'not-allowed' : 'pointer',
                      fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500,
                    }}
                  >{assessing === fw.id ? 'Assessing…' : 'Assess All Assets'}</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Controls Table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>
            Controls {selectedFw ? `· ${frameworks.find(f => f.id === selectedFw)?.name}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedFw && (
              <>
                <button
                  onClick={handleAutoMap}
                  disabled={autoMapping}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', fontSize: '11.5px', fontWeight: 600, cursor: autoMapping ? 'not-allowed' : 'pointer', opacity: autoMapping ? 0.6 : 1 }}
                >
                  {autoMapping ? 'Mapping…' : '⚡ Auto-Map Rules'}
                </button>
                <button
                  onClick={runAiGapAnalysis}
                  disabled={aiGapsLoading || controls.length === 0}
                  style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #93c5fd', background: aiGapsLoading ? 'var(--surface-muted)' : '#f0f9ff', color: aiGapsLoading ? 'var(--text-muted)' : '#1d4ed8', fontSize: '11.5px', fontWeight: 600, cursor: (aiGapsLoading || controls.length === 0) ? 'not-allowed' : 'pointer' }}
                >
                  {aiGapsLoading ? '🤖 Analyzing…' : '🤖 AI Gap Analysis'}
                </button>
              </>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'passed', 'failed', 'not-assessed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 500, textTransform: 'capitalize',
                  background: filter === f ? 'var(--foreground)' : 'var(--surface-muted)', color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
                }}>{f.replace('-', ' ')}</button>
              ))}
            </div>
          </div>
        </div>

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

        {!selectedFw ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            Select a framework above to view its controls
          </div>
        ) : controlsLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading controls…</div>
        ) : filteredControls.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No controls match this filter
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Code', 'Control', 'Rule Types', 'Status', 'Rules', 'Last Assessed', 'Evidence'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredControls.map(c => {
                const st = statusStyle(c.status)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{c.code}</td>
                    <td style={{ padding: '12px', fontWeight: 500, color: 'var(--foreground)', maxWidth: '220px' }}>
                      <div>{c.name}</div>
                      {c.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.description.slice(0, 80)}{c.description.length > 80 ? '…' : ''}</div>}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'monospace' }}>
                      {c.ruleTypes ? c.ruleTypes.split(',').map(rt => (
                        <span key={rt} style={{ display: 'inline-block', background: 'var(--surface-muted)', borderRadius: '4px', padding: '1px 6px', marginRight: '4px', marginBottom: '2px' }}>{rt.trim()}</span>
                      )) : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                        {c.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>{c.rulesMapped || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.lastAssessed ?? 'Never'}</td>
                    <td style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{c.evidence || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* AI Gap Analysis Panel */}
      {(aiGaps || aiGapsLoading || aiGapsError) && selectedFw && (
        <div style={{ ...card, marginTop: '20px', background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #93c5fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontSize: '16px' }}>🤖</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8' }}>AI Compliance Gap Analysis</span>
              <span style={{ fontSize: '10px', color: '#3b82f6', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>AI Generated</span>
            </div>
            <button onClick={runAiGapAnalysis} disabled={aiGapsLoading} style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '5px', border: '1px solid #93c5fd', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', opacity: aiGapsLoading ? 0.6 : 1 }}>
              {aiGapsLoading ? '…' : '↺ Re-analyze'}
            </button>
          </div>
          {aiGapsLoading && <div style={{ fontSize: '12.5px', color: '#3b82f6' }}>Analyzing compliance gaps…</div>}
          {aiGapsError && <div style={{ fontSize: '12.5px', color: 'var(--status-error-text)' }}>{aiGapsError}</div>}
          {!aiGapsLoading && !aiGapsError && aiGaps && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {aiGaps.summary && (
                <p style={{ margin: 0, fontSize: '13px', color: '#1e3a5f', lineHeight: '1.7' }}>{aiGaps.summary}</p>
              )}
              {Array.isArray(aiGaps.gaps) && aiGaps.gaps.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Unmet Controls &amp; Recommended Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiGaps.gaps.map((g, i) => (
                      <div key={i} style={{ background: '#fff', borderRadius: '8px', padding: '10px 14px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '3px' }}>{g.control}</div>
                        <div style={{ fontSize: '12px', color: '#1e3a5f', lineHeight: '1.6' }}>{g.action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!aiGaps.summary && !Array.isArray(aiGaps.gaps) && (
                <div style={{ fontSize: '12.5px', color: '#3b82f6' }}>Analysis complete — check the response structure from your AI backend.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
