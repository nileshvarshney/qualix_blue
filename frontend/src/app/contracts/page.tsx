'use client'
import { useState, useEffect } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type ContractStatus = 'active' | 'breached' | 'warning'
type FilterType = 'all' | 'active' | 'breached'

interface TermCheck {
  term: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
}

interface Contract {
  id: string; name: string; producer: string; consumer: string
  owner: string; status: ContractStatus; compliance: number
  checks: number; failures: number; created: string
  connection: string; description: string; sla: string
  terms: TermCheck[]
  breachReason?: string
  breachImpact?: string
  breachRecommendation?: string
  lastChecked: string
  trend: string
}


const complianceColor = (c: number) => c >= 90 ? '#16a34a' : c >= 75 ? '#ca8a04' : '#dc2626'
const stCfg: Record<ContractStatus, { bg: string; color: string; border: string }> = {
  active:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  warning: { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  breached:{ bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}
const termIcon = { pass: '✅', fail: '❌', warn: '⚠️' }
const termColor = { pass: '#16a34a', fail: '#dc2626', warn: '#d97706' }
const termBg   = { pass: '#f0fdf4', fail: '#fff1f2', warn: '#fffbeb' }

export default function ContractsPage() {
  const [filter, setFilter]     = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [allContracts, setAllContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/slas')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setAllContracts(items.map((c: Record<string, unknown>, i: number) => ({
          id: String(c.contract_id ?? c.id ?? i),
          name: String(c.contract_name ?? c.name ?? ''),
          producer: String(c.producer ?? c.source_dataset ?? ''),
          consumer: String(c.consumer ?? c.target_dataset ?? ''),
          owner: String(c.owner ?? ''),
          status: (c.status as ContractStatus) ?? 'active',
          compliance: Number(c.compliance ?? c.adherence ?? 100),
          checks: Number(c.checks ?? c.check_count ?? 0),
          failures: Number(c.failures ?? c.failure_count ?? 0),
          created: String(c.created_at ?? c.created ?? ''),
          connection: String(c.connection ?? ''),
          description: String(c.description ?? ''),
          sla: String(c.sla ?? c.sla_target ?? ''),
          terms: Array.isArray(c.terms) ? c.terms as Contract['terms'] : [],
          breachReason: c.breach_reason ? String(c.breach_reason) : undefined,
          breachImpact: c.breach_impact ? String(c.breach_impact) : undefined,
          breachRecommendation: c.breach_recommendation ? String(c.breach_recommendation) : undefined,
          lastChecked: String(c.last_checked ?? c.lastChecked ?? 'Never'),
          trend: String(c.trend ?? ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])
  const [cForm, setCForm] = useState({ name: '', producer: '', consumer: '', owner: '', description: '', sla: '99%', connection: 'SF_Codex' })

  const addContract = () => {
    if (!cForm.name) return
    const nc: Contract = {
      id: `ct${Date.now()}`, name: cForm.name, producer: cForm.producer, consumer: cForm.consumer,
      owner: cForm.owner || 'Unassigned', status: 'active', compliance: 100,
      checks: 0, failures: 0, created: new Date().toISOString().split('T')[0],
      connection: cForm.connection, description: cForm.description, sla: cForm.sla,
      terms: [], lastChecked: 'Never', trend: '— New',
    }
    setAllContracts(prev => [nc, ...prev])
    setShowAdd(false)
    setCForm({ name: '', producer: '', consumer: '', owner: '', description: '', sla: '99%', connection: 'SF_Codex' })
  }

  const total   = allContracts.length
  const active  = allContracts.filter(c => c.status === 'active').length
  const breached = allContracts.filter(c => c.status === 'breached').length
  const avgComp = Math.round(allContracts.reduce((s, c) => s + c.compliance, 0) / allContracts.length)

  const filtered = allContracts.filter(c => {
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'active'  ? c.status === 'active' || c.status === 'warning' :
      filter === 'breached'? c.status === 'breached' : true
    const matchSearch = search === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.producer.toLowerCase().includes(search.toLowerCase()) ||
      c.consumer.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const statCards = [
    { key: 'all'      as FilterType, label: 'Total Contracts', value: total,   icon: '📄', color: '#2563eb',  activeBg: '#2563eb'  },
    { key: 'active'   as FilterType, label: 'Active',          value: active,  icon: '✅', color: '#16a34a',  activeBg: '#16a34a'  },
    { key: 'breached' as FilterType, label: 'Breached',        value: breached,icon: '🚨', color: '#dc2626',  activeBg: '#dc2626'  },
    { key: 'all'      as FilterType, label: 'Avg Compliance',  value: avgComp + '%', icon: '📊', color: complianceColor(avgComp), activeBg: '#475569' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/contracts', label: 'Contracts' },
        { href: '/slas',      label: 'SLAs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Data Contracts</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Agreements between data producers and consumers
            {breached > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> — {breached} breach{breached > 1 ? 'es' : ''} active</span>}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#E8541A', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          + New Contract
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((card, idx) => {
          const isActive = filter === card.key && !(idx === 0 || idx === 3)
          return (
            <div key={idx} onClick={() => idx === 0 || idx === 3 ? setFilter('all') : setFilter(isActive ? 'all' : card.key)}
              style={{
                background: isActive ? card.activeBg : '#fff',
                border: `2px solid ${isActive ? card.activeBg : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: idx === 0 || idx === 3 ? 'default' : 'pointer',
                boxShadow: isActive ? `0 4px 16px ${card.activeBg}40` : 'none',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : card.color }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear</div>}
            </div>
          )
        })}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search contracts by name, producer, or consumer…"
        style={{ width: '100%', padding: '9px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', marginBottom: '16px', boxSizing: 'border-box', outline: 'none' }} />

      {/* Filter label */}
      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{filter}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* Contract cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map(c => {
          const ss = stCfg[c.status]
          const cc = complianceColor(c.compliance)
          const isOpen = expanded === c.id
          const failedTerms = c.terms.filter(t => t.status === 'fail')
          const warnTerms   = c.terms.filter(t => t.status === 'warn')

          return (
            <div key={c.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : c.status === 'breached' ? '#fca5a5' : c.status === 'warning' ? '#fde68a' : '#ebe8df'}`,
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: isOpen ? '0 6px 24px rgba(99,102,241,0.13)' : c.status === 'breached' ? '0 2px 8px rgba(220,38,38,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.2s',
            }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(isOpen ? null : c.id)}
                style={{ padding: '18px 22px', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a' }}>{c.name}</span>
                      <span style={{ ...ss, padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>{c.status}</span>
                      {failedTerms.length > 0 && (
                        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                          {failedTerms.length} check{failedTerms.length > 1 ? 's' : ''} failing
                        </span>
                      )}
                      {warnTerms.length > 0 && (
                        <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                          {warnTerms.length} warning{warnTerms.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '8px' }}>{c.description}</div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap' }}>
                      <span>Producer: <strong style={{ color: '#475569' }}>{c.producer}</strong></span>
                      <span>Consumer: <strong style={{ color: '#475569' }}>{c.consumer}</strong></span>
                      <span>Owner: <strong style={{ color: '#475569' }}>{c.owner}</strong></span>
                      <span>SLA: <strong style={{ color: cc }}>{c.sla}</strong></span>
                      <span style={{ color: c.trend.startsWith('↑') ? '#16a34a' : '#dc2626' }}>{c.trend}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '30px', fontWeight: 800, color: cc, lineHeight: 1 }}>{c.compliance}%</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>compliance</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.checks} checks · {c.failures} fail</div>
                    </div>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isOpen ? '#6366f1' : '#f1f5f9',
                      color: isOpen ? '#fff' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', transition: 'all 0.18s',
                    }}>
                      {isOpen ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {/* Compliance bar */}
                <div style={{ marginTop: '12px', height: '5px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.compliance}%`, background: cc, borderRadius: '4px', transition: 'width 0.5s' }} />
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Connection',   value: c.connection },
                      { label: 'SLA Target',   value: c.sla },
                      { label: 'Created',      value: c.created },
                      { label: 'Last Checked', value: c.lastChecked },
                      { label: 'Trend',        value: c.trend },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: m.label === 'Trend' ? (m.value.startsWith('↑') ? '#16a34a' : '#dc2626') : '#334155' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Breach explanation (only if breached or warning) */}
                    {(c.status === 'breached' || c.status === 'warning') && c.breachReason && (
                      <>
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #fca5a5', overflow: 'hidden' }}>
                          <div style={{ background: '#fee2e2', padding: '10px 16px', borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px' }}>🚨</span>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              {c.status === 'breached' ? 'Breach Reason — Why is this contract failing?' : 'Warning — What is at risk?'}
                            </span>
                          </div>
                          <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{c.breachReason}</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #fdba74', overflow: 'hidden' }}>
                            <div style={{ background: '#fff7ed', padding: '10px 16px', borderBottom: '1px solid #fdba74', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>💥</span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business Impact</span>
                            </div>
                            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{c.breachImpact}</div>
                          </div>
                          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                            <div style={{ background: '#f0fdf4', padding: '10px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>✅</span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recommended Fix</span>
                            </div>
                            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{c.breachRecommendation}</div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Contract Terms checklist */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: '#fafaf9', borderBottom: '1px solid #e9eef5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>📋</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Contract Terms — Check-by-Check Results</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#94a3b8' }}>
                          {c.terms.filter(t => t.status === 'pass').length}/{c.terms.length} passing
                        </span>
                      </div>
                      <div style={{ padding: '8px 0' }}>
                        {c.terms.map((t, i) => (
                          <div key={i} style={{
                            padding: '10px 16px',
                            background: t.status !== 'pass' ? termBg[t.status] : 'transparent',
                            borderLeft: `3px solid ${t.status !== 'pass' ? termColor[t.status] : 'transparent'}`,
                            marginLeft: t.status !== 'pass' ? '0' : '3px',
                            borderBottom: i < c.terms.length - 1 ? '1px solid #f3f1ea' : 'none',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{termIcon[t.status]}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>{t.term}</div>
                                <div style={{ fontSize: '12px', color: t.status !== 'pass' ? termColor[t.status] : '#64748b', lineHeight: '1.5' }}>{t.detail}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Collapse */}
                    <div>
                      <button onClick={() => setExpanded(null)} style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No data contracts yet
          </div>
        )}
      </div>

      {/* New Contract Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAdd(false)} />
          <div style={{ background: '#fff', borderRadius: '14px', width: '520px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>New Data Contract</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Define an agreement between data producer and consumer</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Contract Name *</label>
                <input value={cForm.name} onChange={e => setCForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Orders → Revenue Model" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Description</label>
                <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What this contract enforces..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Producer (source table) *</label>
                  <input value={cForm.producer} onChange={e => setCForm(f => ({ ...f, producer: e.target.value }))} placeholder="e.g. fact_orders" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Consumer (downstream) *</label>
                  <input value={cForm.consumer} onChange={e => setCForm(f => ({ ...f, consumer: e.target.value }))} placeholder="e.g. finance_report" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={cForm.owner} onChange={e => setCForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>SLA Target</label>
                  <select value={cForm.sla} onChange={e => setCForm(f => ({ ...f, sla: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    <option value="99.9%">99.9%</option>
                    <option value="99%">99%</option>
                    <option value="98%">98%</option>
                    <option value="95%">95%</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addContract} disabled={!cForm.name || !cForm.producer || !cForm.consumer} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: cForm.name && cForm.producer && cForm.consumer ? 'pointer' : 'not-allowed',
                background: cForm.name && cForm.producer && cForm.consumer ? '#E8541A' : '#e2e8f0',
                color: cForm.name && cForm.producer && cForm.consumer ? '#fff' : '#94a3b8'
              }}>Create Contract</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
