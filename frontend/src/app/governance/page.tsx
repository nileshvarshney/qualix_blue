'use client'
import { useState, useEffect } from 'react'

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

type GovernanceTab = 'scorecards' | 'policies'
type ScorecardFilter = 'all' | 'healthy' | 'at-risk'
type PolicyFilter = 'all' | 'active' | 'draft' | 'enforced'

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

function scoreColor(s: number): string { return s >= 90 ? 'var(--status-ok-text)' : s >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)' }
function scoreBg(s: number): string { return s >= 90 ? 'var(--status-ok-bg)' : s >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)' }
function policyStatusColor(s: string): string { return s === 'active' ? 'var(--status-ok-text)' : s === 'review' ? 'var(--status-warn-text)' : 'var(--text-muted)' }
function policyStatusBg(s: string): string { return s === 'active' ? 'var(--status-ok-bg)' : s === 'review' ? 'var(--status-warn-bg)' : 'var(--surface-muted)' }

export default function GovernancePage() {
  const [tab, setTab] = useState<GovernanceTab>('scorecards')
  const [scorecardFilter, setScorecardFilter] = useState<ScorecardFilter>('all')
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('all')
  const [selectedDomain, setSelectedDomain] = useState<DomainScore | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null)
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [domains, setDomains] = useState<DomainScore[]>([])
  const [loadingPolicies, setLoadingPolicies] = useState(true)
  const [policyForm, setPolicyForm] = useState({ name: '', description: '', domain: 'All', enforcement: 'enforced' as 'enforced' | 'advisory', status: 'draft' as 'active' | 'draft' | 'review' })

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
          status: (['active', 'draft', 'review'] as const).includes(p.status as 'active' | 'draft' | 'review') ? (p.status as 'active' | 'draft' | 'review') : 'draft',
          enforcement: (['enforced', 'advisory'] as const).includes(p.enforcement as 'enforced' | 'advisory') ? (p.enforcement as 'enforced' | 'advisory') : 'advisory',
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

  const activeCount = policies.filter(p => p.status === 'active').length
  const enforcedCount = policies.filter(p => p.enforcement === 'enforced').length

  const filteredDomains = domains.filter(d => {
    if (scorecardFilter === 'healthy') return d.overall >= 90
    if (scorecardFilter === 'at-risk') return d.overall < 75
    return true
  })

  const filteredPolicies = policies.filter(p => {
    if (policyFilter === 'active') return p.status === 'active'
    if (policyFilter === 'draft') return p.status === 'draft'
    if (policyFilter === 'enforced') return p.enforcement === 'enforced'
    return true
  })

  const closePopups = () => { setSelectedDomain(null); setSelectedPolicy(null) }

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Governance</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Score: —</span>
        {activeCount > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{activeCount} active</span>}
        {enforcedCount > 0 && <span style={{ background: 'var(--accent-bg)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{enforcedCount} enforced</span>}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowCreatePolicy(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Policy</button>
        </div>
      </div>

      {/* mini KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          ['Governance Score', '—'],
          ['Policies Active', String(activeCount)],
          ['Assets Classified', '—'],
          ['Ownership Coverage', '—'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '5px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{l}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: v === '—' ? 'var(--text-muted)' : 'var(--foreground)', marginTop: '1px' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* tabs + filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['scorecards', 'policies'] as GovernanceTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === t ? '#1a1a1a' : 'var(--surface-muted)',
            color: tab === t ? '#fff' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400, fontSize: '11px', textTransform: 'capitalize',
          }}>
            {t === 'scorecards' ? `Scorecards (${filteredDomains.length})` : `Policies (${filteredPolicies.length})`}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        {tab === 'scorecards' && ([['all', 'All'], ['healthy', 'Healthy'], ['at-risk', 'At-Risk']] as [ScorecardFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setScorecardFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${scorecardFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: scorecardFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: scorecardFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
        {tab === 'policies' && ([['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['enforced', 'Enforced']] as [PolicyFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setPolicyFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${policyFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: policyFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: policyFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      {/* column headers */}
      {tab === 'scorecards' && !loadingPolicies && filteredDomains.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 45px 45px 55px 50px 50px 45px 65px', gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Domain', 'Qual', 'Docs', 'Class', 'Own', 'Cert', 'SLA', 'Overall'].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}
      {tab === 'policies' && !loadingPolicies && filteredPolicies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 80px 50px 80px', gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Status', 'Policy', 'Domain', 'Enforcement', 'Rules', 'Last Eval'].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingPolicies && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}

        {/* scorecards tab */}
        {tab === 'scorecards' && !loadingPolicies && filteredDomains.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No domain scorecard data yet</div>
        )}
        {tab === 'scorecards' && !loadingPolicies && filteredDomains.map(d => (
          <div key={d.id} onClick={() => setSelectedDomain(d)}
            style={{ display: 'grid', gridTemplateColumns: '1fr 45px 45px 55px 50px 50px 45px 65px', gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${scoreColor(d.overall)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.icon} {d.name}</span>
            {SCORE_DIMENSIONS.map(dim => (
              <span key={dim} style={{ background: scoreBg(d[dim]), color: scoreColor(d[dim]), padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{d[dim]}</span>
            ))}
            <span style={{ background: scoreBg(d.overall), color: scoreColor(d.overall), padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>{d.overall}</span>
          </div>
        ))}

        {/* policies tab */}
        {tab === 'policies' && !loadingPolicies && filteredPolicies.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No policies yet</div>
        )}
        {tab === 'policies' && !loadingPolicies && filteredPolicies.map(p => (
          <div key={p.id} onClick={() => setSelectedPolicy(p)}
            style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 80px 50px 80px', gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${policyStatusColor(p.status)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ background: policyStatusBg(p.status), color: policyStatusColor(p.status), padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textTransform: 'capitalize' }}>{p.status}</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.domain}</span>
            <span style={{ background: p.enforcement === 'enforced' ? 'var(--accent-bg)' : 'var(--status-warn-bg)', color: p.enforcement === 'enforced' ? 'var(--accent)' : 'var(--status-warn-text)', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{p.enforcement}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{p.rulesCount}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.lastEval}</span>
          </div>
        ))}
      </div>

      {/* slide-in domain scorecard panel */}
      {selectedDomain && (
        <>
          <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '18px' }}>{selectedDomain.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{selectedDomain.name} Domain</span>
              <span style={{ background: scoreBg(selectedDomain.overall), color: scoreColor(selectedDomain.overall), padding: '2px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 700 }}>{selectedDomain.overall}</span>
              <button onClick={closePopups} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Score Breakdown</div>
              {SCORE_DIMENSIONS.map(dim => {
                const val = selectedDomain[dim]
                return (
                  <div key={dim} style={{ padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{DIM_LABELS[dim]}</span>
                      <span style={{ background: scoreBg(val), color: scoreColor(val), padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{val}%</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: scoreColor(val), borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{DIM_DESCRIPTIONS[dim]}</div>
                  </div>
                )
              })}
              {selectedDomain.tables.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tables in Domain</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selectedDomain.tables.map(t => (
                      <span key={t} style={{ background: 'var(--accent-bg)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 500, fontFamily: 'monospace' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedDomain.rulesTotal > 0 && (
                <div style={{ padding: '10px 12px', background: 'var(--status-ok-bg)', borderRadius: '6px', border: '1px solid var(--status-ok-text)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--status-ok-text)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Rules Coverage</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-ok-text)' }}>{selectedDomain.rulesPassed}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>/ {selectedDomain.rulesTotal} passing</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* slide-in policy panel */}
      {selectedPolicy && (
        <>
          <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ background: policyStatusBg(selectedPolicy.status), color: policyStatusColor(selectedPolicy.status), padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{selectedPolicy.status}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{selectedPolicy.name}</span>
              <button onClick={closePopups} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {[['Domain', selectedPolicy.domain], ['Enforcement', selectedPolicy.enforcement], ['Rules', String(selectedPolicy.rulesCount)]].map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              {[['Last Evaluated', selectedPolicy.lastEval], ['Tables', [...new Set(selectedPolicy.rules.map(r => r.table))].length + ' tables']].map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v}</div>
                </div>
              ))}
            </div>
            {selectedPolicy.description && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                  <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', padding: '7px 12px' }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📋 DESCRIPTION</span>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{selectedPolicy.description}</div>
                </div>
              </div>
            )}
            {selectedPolicy.rules.length > 0 && (
              <div style={{ padding: '0 14px 12px' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Policy Rules ({selectedPolicy.rules.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedPolicy.rules.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: r.status === 'pass' ? 'var(--status-ok-bg)' : r.status === 'fail' ? 'var(--status-error-bg)' : 'var(--status-warn-bg)', borderRadius: '6px', border: `1px solid ${r.status === 'pass' ? 'var(--status-ok-text)' : r.status === 'fail' ? 'var(--status-error-text)' : 'var(--status-warn-text)'}33` }}>
                      <span style={{ fontSize: '12px' }}>{r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{r.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.table} · {r.type}</div>
                      </div>
                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: r.status === 'pass' ? 'var(--status-ok-text)' : r.status === 'fail' ? 'var(--status-error-text)' : 'var(--status-warn-text)' }}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Policy Modal — keep existing logic, update colors to CSS vars */}
      {showCreatePolicy && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowCreatePolicy(false)} />
          <div style={{ background: 'var(--surface)', borderRadius: '14px', width: '480px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>Create Governance Policy</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Define a new policy to enforce data governance standards</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Policy Name *</label>
                <input value={policyForm.name} onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Data Quality Standards" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Description</label>
                <textarea value={policyForm.description} onChange={e => setPolicyForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the policy requirements..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', resize: 'vertical' as const, background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={policyForm.domain} onChange={e => setPolicyForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }}>
                    <option value="All">All Domains</option>
                    {domains.map(d => <option key={d.id} value={d.name}>{d.icon} {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Enforcement</label>
                  <select value={policyForm.enforcement} onChange={e => setPolicyForm(f => ({ ...f, enforcement: e.target.value as 'enforced' | 'advisory' }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }}>
                    <option value="enforced">🔒 Enforced</option>
                    <option value="advisory">💡 Advisory</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Initial Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['draft', 'review', 'active'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setPolicyForm(f => ({ ...f, status: s }))} style={{
                      padding: '8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                      border: policyForm.status === s ? `2px solid ${policyStatusColor(s)}` : `1px solid var(--border)`,
                      background: policyForm.status === s ? policyStatusBg(s) : 'var(--surface-muted)',
                      fontSize: '12px', fontWeight: policyForm.status === s ? 700 : 500,
                      color: policyForm.status === s ? policyStatusColor(s) : 'var(--text-secondary)',
                      textTransform: 'capitalize',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowCreatePolicy(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createPolicy} disabled={!policyForm.name} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: policyForm.name ? 'pointer' : 'not-allowed',
                background: policyForm.name ? 'var(--accent)' : 'var(--border)',
                color: policyForm.name ? '#fff' : 'var(--text-muted)',
              }}>Create Policy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
