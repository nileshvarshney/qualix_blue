'use client'
import { useState, useEffect } from 'react'

/* ── Types ──────────────────────────────────────────────── */

interface DomainScore {
  id: string; name: string; icon: string
  quality: number; documentation: number; classification: number
  ownership: number; certification: number; sla: number; overall: number
  tables: string[]; rulesPassed: number; rulesTotal: number
}

interface PolicyItem {
  id: string; name: string; description: string; domain: string
  status: 'active' | 'draft' | 'review'; enforcement: 'enforced' | 'advisory'
  rulesCount: number; lastEval: string
  rules: PolicyRule[]
}

interface PolicyRule {
  name: string; table: string; type: string; status: 'pass' | 'fail' | 'warn'
}

/* ── Data ───────────────────────────────────────────────── */


const SCORE_DIMENSIONS = ['quality', 'documentation', 'classification', 'ownership', 'certification', 'sla'] as const
const DIM_LABELS: Record<string, string> = { quality: 'Data Quality', documentation: 'Documentation', classification: 'Classification', ownership: 'Ownership', certification: 'Certification', sla: 'SLA Compliance' }
const DIM_DESCRIPTIONS: Record<string, string> = {
  quality: 'Based on rule pass rate across all tables in this domain',
  documentation: 'Percentage of tables/columns with descriptions and metadata',
  classification: 'Percentage of sensitive columns properly tagged (PII, PHI, etc.)',
  ownership: 'Percentage of tables with assigned business & technical owners',
  certification: 'Percentage of datasets marked as certified/trusted',
  sla: 'Percentage of freshness and delivery SLAs met in last 30 days',
}

/* ── Helpers ────────────────────────────────────────────── */

function scoreColor(s: number): string { return s >= 90 ? '#16a34a' : s >= 75 ? '#ea8b3a' : '#dc2626' }
function scoreBg(s: number): string { return s >= 90 ? '#dcfce7' : s >= 75 ? '#fef3c7' : '#fee2e2' }
function statusColor(s: string): string { return s === 'active' ? '#16a34a' : s === 'review' ? '#ea8b3a' : '#94a3b8' }
function statusLabel(s: string): string { return s === 'active' ? 'Active' : s === 'review' ? 'Review' : 'Draft' }

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fff', ...extra })

/* ── Component ──────────────────────────────────────────── */

export default function GovernancePage() {
  const [tab, setTab] = useState<'scorecards' | 'policies'>('scorecards')
  const [selectedDomain, setSelectedDomain] = useState<DomainScore | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [domains, setDomains] = useState<DomainScore[]>([])
  const [loadingPolicies, setLoadingPolicies] = useState(true)
  const [policyForm, setPolicyForm] = useState({ name: '', description: '', domain: 'All', enforcement: 'enforced' as 'enforced' | 'advisory', status: 'draft' as 'active' | 'draft' | 'review' })
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/governance')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setPolicies(items.map((p: Record<string, unknown>) => ({
          id: String(p.policy_id ?? p.id ?? ''),
          name: String(p.policy_name ?? p.name ?? ''),
          description: String(p.description ?? ''),
          domain: String(p.domain ?? 'All'),
          status: (p.status as 'active' | 'draft' | 'review') ?? 'draft',
          enforcement: (p.enforcement as 'enforced' | 'advisory') ?? 'advisory',
          rulesCount: Number(p.rules_count ?? p.rulesCount ?? 0),
          lastEval: String(p.last_evaluated ?? p.lastEval ?? 'Never'),
          rules: [],
        })))
        setLoadingPolicies(false)
      })
      .catch(() => setLoadingPolicies(false))
  }, [])

  const createPolicy = () => {
    if (!policyForm.name) return
    const newPolicy: PolicyItem = {
      id: `p${Date.now()}`, name: policyForm.name, description: policyForm.description,
      domain: policyForm.domain, status: policyForm.status, enforcement: policyForm.enforcement,
      rulesCount: 0, lastEval: 'Never', rules: [],
    }
    setPolicies(prev => [...prev, newPolicy])
    setShowCreatePolicy(false)
    setPolicyForm({ name: '', description: '', domain: 'All', enforcement: 'enforced', status: 'draft' })
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Governance</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Data Governance</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>Monitor governance posture, domain scorecards, and policy compliance</p>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { key: 'governance', label: 'Governance Score', value: '—' },
          { key: 'policies', label: 'Policies Active', value: String(policies.filter(p => p.status === 'active').length), sub: `${policies.filter(p => p.enforcement === 'enforced').length} enforced · ${policies.filter(p => p.enforcement === 'advisory').length} advisory` },
          { key: 'classified', label: 'Assets Classified', value: '—' },
          { key: 'ownership', label: 'Ownership Coverage', value: '—' },
        ].map((kpi) => (
          <div key={kpi.key} onClick={() => setSelectedKpi(kpi.key)} style={{ ...card, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8541A'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(232,84,26,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#ebe8df'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>{kpi.label} <span style={{ fontSize: '10px', color: '#94a3b8' }}>→</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-1px' }}>{kpi.value}</span>
              {kpi.change && <span style={{ fontSize: '12px', color: kpi.changeColor, fontWeight: 600 }}>{kpi.change}</span>}
            </div>
            {kpi.sub && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['scorecards', 'policies'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, textTransform: 'capitalize',
            background: tab === t ? '#1a1a1a' : '#f8fafc', color: tab === t ? '#fff' : '#64748b',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Scorecards Tab ──────────────────────────────── */}
      {tab === 'scorecards' && (
        <div style={card}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Domain Governance Scorecards</div>
          {domains.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
              No governance policies yet
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ebe8df' }}>
                  {['Domain', 'Quality', 'Docs', 'Classification', 'Ownership', 'Certification', 'SLA', 'Overall'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {domains.map(d => (
                  <tr key={d.id} onClick={() => setSelectedDomain(d)} style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#1a1a1a' }}>
                      <span style={{ marginRight: '8px' }}>{d.icon}</span>{d.name}
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>→</span>
                    </td>
                    {[d.quality, d.documentation, d.classification, d.ownership, d.certification, d.sla].map((s, i) => (
                      <td key={i} style={{ padding: '12px' }}>
                        <span style={{ background: scoreBg(s), color: scoreColor(s), padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{s}</span>
                      </td>
                    ))}
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: scoreBg(d.overall), color: scoreColor(d.overall), padding: '4px 14px', borderRadius: '20px', fontSize: '14px', fontWeight: 700 }}>{d.overall}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Policies Tab ────────────────────────────────── */}
      {tab === 'policies' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a' }}>Governance Policies</div>
            <button onClick={() => setShowCreatePolicy(true)} style={{ background: '#E8541A', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Create Policy</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingPolicies ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
            ) : policies.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No governance policies yet</div>
            ) : null}
            {!loadingPolicies && policies.map(p => (
              <div key={p.id} onClick={() => setSelectedPolicy(p)}
                style={{ border: '1px solid #ebe8df', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8541A'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(232,84,26,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#ebe8df'; e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🛡️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1a1a1a' }}>{p.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{p.description}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{p.domain}</span>
                  <span style={{ background: p.enforcement === 'enforced' ? '#dbeafe' : '#fef3c7', color: p.enforcement === 'enforced' ? '#2563eb' : '#d97706', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{p.enforcement}</span>
                  <span style={{ background: '#f8fafc', color: statusColor(p.status), padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize', border: `1px solid ${statusColor(p.status)}33` }}>{statusLabel(p.status)}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{p.rulesCount} rules · {p.lastEval}</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Domain Scorecard Detail Drawer ──────────────── */}
      {selectedDomain && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} onClick={() => setSelectedDomain(null)} />
          <div style={{ width: '560px', background: '#fff', height: '100%', boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '24px', marginBottom: '2px' }}>{selectedDomain.icon}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>{selectedDomain.name} Domain</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Governance scorecard breakdown</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ background: scoreBg(selectedDomain.overall), color: scoreColor(selectedDomain.overall), padding: '6px 18px', borderRadius: '20px', fontSize: '22px', fontWeight: 700, display: 'inline-block' }}>{selectedDomain.overall}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Overall Score</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Score Breakdown */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Score Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {SCORE_DIMENSIONS.map(dim => {
                    const val = selectedDomain[dim]
                    return (
                      <div key={dim} style={{ padding: '12px 14px', background: '#fafaf9', borderRadius: '10px', border: '1px solid #ebe8df' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{DIM_LABELS[dim]}</div>
                          <span style={{ background: scoreBg(val), color: scoreColor(val), padding: '2px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>{val}%</span>
                        </div>
                        <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                          <div style={{ height: '100%', width: `${val}%`, background: scoreColor(val), borderRadius: '3px', transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{DIM_DESCRIPTIONS[dim]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tables in Domain */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Tables in Domain</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedDomain.tables.map(t => (
                    <span key={t} style={{ background: '#f0f9ff', color: '#0369a1', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, fontFamily: 'monospace', border: '1px solid #bae6fd' }}>{t}</span>
                  ))}
                </div>
              </div>

              {/* Rules Summary */}
              <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', marginBottom: '6px' }}>Rules Coverage</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>{selectedDomain.rulesPassed}</span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>/ {selectedDomain.rulesTotal} rules passing</span>
                </div>
                <div style={{ height: '6px', background: '#dcfce7', borderRadius: '3px', overflow: 'hidden', marginTop: '8px' }}>
                  <div style={{ height: '100%', width: `${(selectedDomain.rulesPassed / selectedDomain.rulesTotal * 100)}%`, background: '#16a34a', borderRadius: '3px' }} />
                </div>
              </div>

              {/* How Score is Calculated */}
              <div style={{ marginTop: '20px', padding: '14px', background: '#fafaf9', borderRadius: '10px', border: '1px solid #ebe8df' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>How Overall Score is Calculated</div>
                <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                  The overall governance score is a weighted average of all six dimensions:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '8px' }}>
                  {[
                    { dim: 'Data Quality', weight: '25%' },
                    { dim: 'SLA Compliance', weight: '20%' },
                    { dim: 'Ownership', weight: '20%' },
                    { dim: 'Classification', weight: '15%' },
                    { dim: 'Documentation', weight: '10%' },
                    { dim: 'Certification', weight: '10%' },
                  ].map(w => (
                    <div key={w.dim} style={{ fontSize: '11px', color: '#64748b', padding: '3px 0' }}>
                      <span style={{ fontWeight: 600 }}>{w.weight}</span> {w.dim}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #ebe8df' }}>
              <button onClick={() => setSelectedDomain(null)} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Policy Detail Drawer ───────────────────────── */}
      {selectedPolicy && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} onClick={() => setSelectedPolicy(null)} />
          <div style={{ width: '560px', background: '#fff', height: '100%', boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>{selectedPolicy.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{selectedPolicy.description}</div>
              </div>
              <button onClick={() => setSelectedPolicy(null)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '13px' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Policy Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Domain</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>{selectedPolicy.domain}</div>
                </div>
                <div style={{ padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Enforcement</div>
                  <span style={{ background: selectedPolicy.enforcement === 'enforced' ? '#dbeafe' : '#fef3c7', color: selectedPolicy.enforcement === 'enforced' ? '#2563eb' : '#d97706', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{selectedPolicy.enforcement}</span>
                </div>
                <div style={{ padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Status</div>
                  <span style={{ background: '#f8fafc', color: statusColor(selectedPolicy.status), padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, border: `1px solid ${statusColor(selectedPolicy.status)}33` }}>{statusLabel(selectedPolicy.status)}</span>
                </div>
              </div>

              {/* Policy Rules */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Policy Rules ({selectedPolicy.rules.length} of {selectedPolicy.rulesCount})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedPolicy.rules.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: r.status === 'pass' ? '#f0fdf4' : r.status === 'fail' ? '#fef2f2' : '#fffbeb', borderRadius: '8px', border: `1px solid ${r.status === 'pass' ? '#bbf7d0' : r.status === 'fail' ? '#fecaca' : '#fde68a'}` }}>
                      <span style={{ fontSize: '14px' }}>{r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1a1a1a' }}>{r.name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          <span style={{ fontFamily: 'monospace' }}>{r.table}</span> · {r.type}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                        background: r.status === 'pass' ? '#dcfce7' : r.status === 'fail' ? '#fee2e2' : '#fef3c7',
                        color: r.status === 'pass' ? '#16a34a' : r.status === 'fail' ? '#dc2626' : '#d97706',
                      }}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Last Evaluated */}
              <div style={{ padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Last Evaluated</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{selectedPolicy.lastEval}</div>
              </div>

              {/* Enabled On */}
              <div style={{ marginTop: '12px', padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>Applied To Tables</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {[...new Set(selectedPolicy.rules.map(r => r.table))].map(t => (
                    <span key={t} style={{ background: '#f0f9ff', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, fontFamily: 'monospace', border: '1px solid #bae6fd' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '8px' }}>
              <button onClick={() => setSelectedPolicy(null)} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Policy Modal ────────────────────────── */}
      {showCreatePolicy && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowCreatePolicy(false)} />
          <div style={{ background: '#fff', borderRadius: '14px', width: '480px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>Create Governance Policy</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Define a new policy to enforce data governance standards</div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Policy Name *</label>
                <input value={policyForm.name} onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Data Quality Standards" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Description</label>
                <textarea value={policyForm.description} onChange={e => setPolicyForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the policy requirements..." style={{ ...inp(), resize: 'vertical' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={policyForm.domain} onChange={e => setPolicyForm(f => ({ ...f, domain: e.target.value }))} style={inp()}>
                    <option value="All">All Domains</option>
                    {domains.map(d => <option key={d.id} value={d.name}>{d.icon} {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Enforcement</label>
                  <select value={policyForm.enforcement} onChange={e => setPolicyForm(f => ({ ...f, enforcement: e.target.value as 'enforced' | 'advisory' }))} style={inp()}>
                    <option value="enforced">🔒 Enforced</option>
                    <option value="advisory">💡 Advisory</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Initial Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['draft', 'review', 'active'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setPolicyForm(f => ({ ...f, status: s }))} style={{
                      padding: '8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                      border: policyForm.status === s ? `2px solid ${statusColor(s)}` : '1px solid #e2e8f0',
                      background: policyForm.status === s ? `${statusColor(s)}11` : '#fafaf9',
                      fontSize: '12px', fontWeight: policyForm.status === s ? 700 : 500, color: policyForm.status === s ? statusColor(s) : '#475569',
                      textTransform: 'capitalize',
                    }}>{statusLabel(s)}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowCreatePolicy(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createPolicy} disabled={!policyForm.name} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: policyForm.name ? 'pointer' : 'not-allowed',
                background: policyForm.name ? '#E8541A' : '#e2e8f0',
                color: policyForm.name ? '#fff' : '#94a3b8'
              }}>Create Policy</button>
            </div>
          </div>
        </div>
      )}
      {/* ── KPI Detail Drawer ──────────────────────────── */}
      {selectedKpi && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} onClick={() => setSelectedKpi(null)} />
          <div style={{ width: '560px', background: '#fff', height: '100%', boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>
                  {selectedKpi === 'governance' && 'Governance Score'}
                  {selectedKpi === 'policies' && 'Active Policies'}
                  {selectedKpi === 'classified' && 'Assets Classification'}
                  {selectedKpi === 'ownership' && 'Ownership Coverage'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Detailed breakdown of how this metric is calculated</div>
              </div>
              <button onClick={() => setSelectedKpi(null)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '13px' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

              {selectedKpi === 'governance' && (
                <>
                  <div style={{ textAlign: 'center', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '52px', fontWeight: 700, color: '#94a3b8' }}>—</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>No data yet — add connections and run rules to compute scores</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Domain Contributions</div>
                  {domains.map(d => (
                    <div key={d.id} onClick={() => { setSelectedKpi(null); setSelectedDomain(d) }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ebe8df', marginBottom: '6px', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontSize: '18px' }}>{d.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{d.name}</div>
                        <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.overall}%`, background: scoreColor(d.overall), borderRadius: '2px' }} />
                        </div>
                      </div>
                      <span style={{ background: scoreBg(d.overall), color: scoreColor(d.overall), padding: '3px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>{d.overall}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Calculation Method</div>
                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                      The overall governance score (87.5) is computed as the weighted average of all domain scores. Each domain is weighted by the number of tables and rules it contains. Domains with more critical data assets carry higher weight.
                    </div>
                  </div>
                </>
              )}

              {selectedKpi === 'policies' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>{policies.filter(p => p.status === 'active').length}</div>
                      <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Active</div>
                    </div>
                    <div style={{ padding: '14px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 700, color: '#d97706' }}>{policies.filter(p => p.status === 'review').length}</div>
                      <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>In Review</div>
                    </div>
                    <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '28px', fontWeight: 700, color: '#94a3b8' }}>{policies.filter(p => p.status === 'draft').length}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Draft</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>All Policies</div>
                  {policies.map(p => (
                    <div key={p.id} onClick={() => { setSelectedKpi(null); setSelectedPolicy(p) }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ebe8df', marginBottom: '6px', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontSize: '14px' }}>🛡️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1a1a1a' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.domain} · {p.rulesCount} rules</div>
                      </div>
                      <span style={{ background: p.enforcement === 'enforced' ? '#dbeafe' : '#fef3c7', color: p.enforcement === 'enforced' ? '#2563eb' : '#d97706', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{p.enforcement}</span>
                      <span style={{ color: statusColor(p.status), fontSize: '11px', fontWeight: 600 }}>{statusLabel(p.status)}</span>
                    </div>
                  ))}
                </>
              )}

              {selectedKpi === 'classified' && (
                <>
                  <div style={{ textAlign: 'center', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '52px', fontWeight: 700, color: '#94a3b8' }}>—</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>No classification data yet</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Classification by Domain</div>
                  {domains.map(d => (
                    <div key={d.id} onClick={() => { setSelectedKpi(null); setSelectedDomain(d) }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ebe8df', marginBottom: '6px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontSize: '18px' }}>{d.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{d.name}</div>
                        <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.classification}%`, background: scoreColor(d.classification), borderRadius: '2px' }} />
                        </div>
                      </div>
                      <span style={{ background: scoreBg(d.classification), color: scoreColor(d.classification), padding: '3px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>{d.classification}%</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>How It Works</div>
                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                      Classification score measures the percentage of columns containing sensitive data (PII, PHI, financial) that have been properly tagged and documented. Columns are scanned using pattern matching and AI-based detection.
                    </div>
                  </div>
                </>
              )}

              {selectedKpi === 'ownership' && (
                <>
                  <div style={{ textAlign: 'center', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '52px', fontWeight: 700, color: '#94a3b8' }}>—</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>No ownership data yet</div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Ownership by Domain</div>
                  {domains.map(d => (
                    <div key={d.id} onClick={() => { setSelectedKpi(null); setSelectedDomain(d) }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ebe8df', marginBottom: '6px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontSize: '18px' }}>{d.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{d.name}</div>
                        <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.ownership}%`, background: scoreColor(d.ownership), borderRadius: '2px' }} />
                        </div>
                      </div>
                      <span style={{ background: scoreBg(d.ownership), color: scoreColor(d.ownership), padding: '3px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>{d.ownership}%</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', padding: '12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>How It Works</div>
                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                      Ownership coverage tracks the percentage of tables that have both a business owner and a technical owner assigned. Unassigned tables are flagged for review in the Ownership Assignment policy.
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #ebe8df' }}>
              <button onClick={() => setSelectedKpi(null)} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
