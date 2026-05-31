'use client'
import { useState, useEffect } from 'react'

interface Framework {
  id: string; name: string; version: string; description: string
  controlsTotal: number; controlsPassed: number; controlsFailed: number
  status: 'compliant' | 'partial' | 'non-compliant'
}

interface Control {
  id: string; code: string; name: string; framework: string
  status: 'passed' | 'failed' | 'not-assessed'
  rulesMapped: number; lastAssessed: string; evidence: string
}


function statusStyle(s: string) {
  if (s === 'compliant' || s === 'passed') return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'partial' || s === 'not-assessed') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#fee2e2', color: '#dc2626' }
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

export default function CompliancePage() {
  const [selectedFw, setSelectedFw] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [controls, setControls] = useState<Control[]>([])
  const [loading, setLoading] = useState(true)

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

  const filteredControls = controls.filter(c => {
    if (selectedFw && c.framework !== frameworks.find(f => f.id === selectedFw)?.name) return false
    if (filter !== 'all' && c.status !== filter) return false
    return true
  })

  const totalControls = frameworks.reduce((s, f) => s + f.controlsTotal, 0)
  const passedControls = frameworks.reduce((s, f) => s + f.controlsPassed, 0)
  const failedControls = frameworks.reduce((s, f) => s + f.controlsFailed, 0)
  const compliantCount = frameworks.filter(f => f.status === 'compliant').length
  const overallPct = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : null

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Compliance</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Compliance & Regulations</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>Map data quality rules to regulatory frameworks and track compliance posture</p>

      {/* KPIs derived from real data */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Overall Compliance</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: overallPct != null ? '#1a1a1a' : '#94a3b8', letterSpacing: '-1px' }}>
              {overallPct != null ? `${overallPct}%` : '—'}
            </span>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Frameworks Tracked</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: frameworks.length > 0 ? '#1a1a1a' : '#94a3b8', letterSpacing: '-1px' }}>
              {frameworks.length > 0 ? frameworks.length : '—'}
            </span>
          </div>
          {compliantCount > 0 && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>{compliantCount} fully compliant</div>}
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Controls Passed</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: totalControls > 0 ? '#1a1a1a' : '#94a3b8', letterSpacing: '-1px' }}>
              {totalControls > 0 ? `${passedControls}/${totalControls}` : '—'}
            </span>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Open Gaps</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: totalControls > 0 ? '#1a1a1a' : '#94a3b8', letterSpacing: '-1px' }}>
              {totalControls > 0 ? failedControls : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Frameworks Grid */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Regulatory Frameworks</div>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        ) : frameworks.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No compliance frameworks yet</div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
          {!loading && frameworks.map(fw => {
            const pct = fw.controlsTotal > 0 ? Math.round((fw.controlsPassed / fw.controlsTotal) * 100) : 0
            const st = statusStyle(fw.status)
            return (
              <div key={fw.id} onClick={() => setSelectedFw(selectedFw === fw.id ? null : fw.id)} style={{
                border: `1px solid ${selectedFw === fw.id ? '#93c5fd' : '#ebe8df'}`, borderRadius: '10px',
                padding: '14px 16px', cursor: 'pointer', background: selectedFw === fw.id ? '#f0f9ff' : '#fff',
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a' }}>{fw.name}</div>
                  <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600, textTransform: 'capitalize' }}>{fw.status.replace('-', ' ')}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>{fw.version}</div>
                <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: st.color, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: '11.5px', color: '#475569' }}>
                  <span style={{ fontWeight: 600, color: '#16a34a' }}>{fw.controlsPassed}</span> / {fw.controlsTotal} controls passed
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Controls Table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a' }}>
            Controls {selectedFw ? `· ${frameworks.find(f => f.id === selectedFw)?.name}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'passed', 'failed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 500, textTransform: 'capitalize',
                background: filter === f ? '#1a1a1a' : '#f8fafc', color: filter === f ? '#fff' : '#64748b',
              }}>{f}</button>
            ))}
          </div>
        </div>
        {controls.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No controls yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe8df' }}>
                {['Code', 'Control', 'Framework', 'Status', 'Rules', 'Last Assessed', 'Evidence'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredControls.map(c => {
                const st = statusStyle(c.status)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f1ea' }}>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: '#475569' }}>{c.code}</td>
                    <td style={{ padding: '12px', fontWeight: 500, color: '#1a1a1a' }}>{c.name}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>{c.framework}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '12px', color: '#475569' }}>{c.rulesMapped}</td>
                    <td style={{ padding: '12px', color: '#94a3b8' }}>{c.lastAssessed}</td>
                    <td style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>{c.evidence}</td>
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
