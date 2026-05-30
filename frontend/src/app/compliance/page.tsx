'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

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

const FRAMEWORKS: Framework[] = [
  { id: 'f1', name: 'GDPR', version: '2016/679', description: 'General Data Protection Regulation — EU data privacy and protection', controlsTotal: 42, controlsPassed: 38, controlsFailed: 4, status: 'partial' },
  { id: 'f2', name: 'SOC 2 Type II', version: '2023', description: 'Service Organization Controls — security, availability, confidentiality', controlsTotal: 35, controlsPassed: 35, controlsFailed: 0, status: 'compliant' },
  { id: 'f3', name: 'HIPAA', version: '2013', description: 'Health Insurance Portability and Accountability Act', controlsTotal: 28, controlsPassed: 24, controlsFailed: 4, status: 'partial' },
  { id: 'f4', name: 'ISO 27001', version: '2022', description: 'Information security management system standard', controlsTotal: 56, controlsPassed: 52, controlsFailed: 4, status: 'partial' },
  { id: 'f5', name: 'CCPA', version: '2020', description: 'California Consumer Privacy Act — consumer data rights', controlsTotal: 18, controlsPassed: 18, controlsFailed: 0, status: 'compliant' },
]

const CONTROLS: Control[] = [
  { id: 'c1', code: 'GDPR-6.1', name: 'Lawful basis for processing', framework: 'GDPR', status: 'passed', rulesMapped: 5, lastAssessed: '2h ago', evidence: 'Automated via DQ rules' },
  { id: 'c2', code: 'GDPR-17.1', name: 'Right to erasure', framework: 'GDPR', status: 'failed', rulesMapped: 3, lastAssessed: '1h ago', evidence: '2 datasets missing PII tags' },
  { id: 'c3', code: 'SOC2-CC6.1', name: 'Access controls', framework: 'SOC 2 Type II', status: 'passed', rulesMapped: 8, lastAssessed: '30m ago', evidence: 'RBAC verified' },
  { id: 'c4', code: 'SOC2-CC7.2', name: 'Monitoring & detection', framework: 'SOC 2 Type II', status: 'passed', rulesMapped: 12, lastAssessed: '15m ago', evidence: 'Alert pipeline active' },
  { id: 'c5', code: 'HIPAA-164.312a', name: 'Access control (ePHI)', framework: 'HIPAA', status: 'failed', rulesMapped: 4, lastAssessed: '3h ago', evidence: 'PHI classification incomplete' },
  { id: 'c6', code: 'ISO-A.8.2', name: 'Information classification', framework: 'ISO 27001', status: 'passed', rulesMapped: 6, lastAssessed: '45m ago', evidence: 'Classification policy enforced' },
  { id: 'c7', code: 'CCPA-1798.100', name: 'Consumer data access', framework: 'CCPA', status: 'passed', rulesMapped: 4, lastAssessed: '2h ago', evidence: 'Data catalog linked' },
  { id: 'c8', code: 'GDPR-25.1', name: 'Data protection by design', framework: 'GDPR', status: 'failed', rulesMapped: 7, lastAssessed: '5h ago', evidence: 'Schema review pending' },
]

function statusStyle(s: string) {
  if (s === 'compliant' || s === 'passed') return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'partial' || s === 'not-assessed') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#fee2e2', color: '#dc2626' }
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

export default function CompliancePage() {
  const [selectedFw, setSelectedFw] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')

  const filteredControls = CONTROLS.filter(c => {
    if (selectedFw && c.framework !== FRAMEWORKS.find(f => f.id === selectedFw)?.name) return false
    if (filter !== 'all' && c.status !== filter) return false
    return true
  })

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/settings',     label: 'General' },
        { href: '/compliance',   label: 'Compliance' },
        { href: '/architecture', label: 'User Guide' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Compliance</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Compliance & Regulations</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>Map data quality rules to regulatory frameworks and track compliance posture</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Overall Compliance', value: '91.2%', change: '▲ 3.1%', changeColor: '#16a34a' },
          { label: 'Frameworks Tracked', value: '5', sub: '2 fully compliant' },
          { label: 'Controls Passed', value: '167/179', change: '93.3%', changeColor: '#16a34a' },
          { label: 'Open Gaps', value: '12', change: '▼ 3', changeColor: '#16a34a' },
        ].map((kpi, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>{kpi.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-1px' }}>{kpi.value}</span>
              {kpi.change && <span style={{ fontSize: '12px', color: kpi.changeColor, fontWeight: 600 }}>{kpi.change}</span>}
            </div>
            {kpi.sub && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Frameworks Grid */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Regulatory Frameworks</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
          {FRAMEWORKS.map(fw => {
            const pct = Math.round((fw.controlsPassed / fw.controlsTotal) * 100)
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
            Controls {selectedFw ? `· ${FRAMEWORKS.find(f => f.id === selectedFw)?.name}` : ''}
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
      </div>
    </div>
  )
}
