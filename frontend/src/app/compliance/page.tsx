'use client'
import { useState, useEffect } from 'react'

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

  useEffect(() => {
    fetch('/api/compliance')
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
    fetch(`/api/compliance/${selectedFw}/controls`)
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
      })
      .catch(() => setControlsLoading(false))
  }, [selectedFw])

  async function handleSeed() {
    setSeeding(true)
    try {
      await fetch('/api/compliance/seed', { method: 'POST' })
      const r = await fetch('/api/compliance')
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
      await fetch(`/api/compliance/${fwId}/assess-all`, { method: 'POST' })
      const r = await fetch('/api/compliance')
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
        const cr = await fetch(`/api/compliance/${fwId}/controls`)
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

  async function handleExportEvidence() {
    setExportingEvidence(true)
    try {
      const r = await fetch(`/api/audit/evidence-report?days=${evidenceDays}`)
      const data = await r.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `evidence-report-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(a.href)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>
            Controls {selectedFw ? `· ${frameworks.find(f => f.id === selectedFw)?.name}` : ''}
          </div>
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
    </div>
  )
}
