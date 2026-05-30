'use client'
import { useState, useEffect } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type SLAStatus = 'healthy' | 'at-risk' | 'breached'
type FilterType = 'all' | 'healthy' | 'at-risk' | 'breached'

interface SLA {
  id: string; name: string; dataset: string; type: string
  target: string; current: string; adherence: number
  status: SLAStatus; owner: string; connection: string
  domain: string; breaches: number; trend: number[]
  rootCause: string; impact: string; recommendation: string
  affectedPipelines: string[]
  lastBreachDate?: string
  nextReview: string
}


const statStyle: Record<SLAStatus, { bg: string; color: string; dot: string; border: string; activeBg: string }> = {
  healthy:  { bg: '#f0fdf4', color: '#16a34a', dot: '#16a34a', border: '#bbf7d0', activeBg: '#16a34a' },
  'at-risk':{ bg: '#fff7ed', color: '#ea580c', dot: '#ea580c', border: '#fdba74', activeBg: '#ea580c' },
  breached: { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626', border: '#fca5a5', activeBg: '#dc2626' },
}

function MiniTrend({ data, color }: { data: number[]; color: string }) {
  const max = 100, min = Math.min(...data) - 2
  const w = 80, h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`)
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SLAsPage() {
  const [filter, setFilter]     = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [allSlas, setAllSlas] = useState<SLA[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/slas')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setAllSlas(items.map((s: Record<string, unknown>, i: number) => ({
          id: String(s.contract_id ?? s.id ?? i),
          name: String(s.contract_name ?? s.name ?? ''),
          dataset: String(s.dataset ?? s.asset_name ?? ''),
          type: String(s.type ?? s.sla_type ?? 'Freshness'),
          target: String(s.target ?? ''),
          current: String(s.current ?? 'Pending'),
          adherence: Number(s.adherence ?? s.compliance ?? 100),
          status: (s.status as SLAStatus) ?? 'healthy',
          owner: String(s.owner ?? ''),
          connection: String(s.connection ?? ''),
          domain: String(s.domain ?? ''),
          breaches: Number(s.breaches ?? 0),
          trend: Array.isArray(s.trend) ? s.trend as number[] : [100, 100, 100, 100, 100, 100, 100],
          rootCause: String(s.root_cause ?? s.rootCause ?? ''),
          impact: String(s.impact ?? ''),
          recommendation: String(s.recommendation ?? ''),
          affectedPipelines: Array.isArray(s.affected_pipelines) ? s.affected_pipelines as string[] : [],
          lastBreachDate: s.last_breach_date ? String(s.last_breach_date) : undefined,
          nextReview: String(s.next_review ?? s.nextReview ?? ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])
  const [sForm, setSForm] = useState({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: 'Finance', connection: 'SF_Codex' })

  const addSla = () => {
    if (!sForm.name) return
    const ns: SLA = {
      id: `s${Date.now()}`, name: sForm.name, dataset: sForm.dataset,
      type: sForm.type, target: sForm.target, current: 'Pending',
      adherence: 100, status: 'healthy', owner: sForm.owner || 'Unassigned',
      connection: sForm.connection, domain: sForm.domain, breaches: 0,
      trend: [100, 100, 100, 100, 100, 100, 100],
      rootCause: 'No issues yet — newly created SLA.',
      impact: 'No impact — monitoring has not started.',
      recommendation: 'Configure monitoring and set up alerting thresholds.',
      affectedPipelines: [], nextReview: '2026-06-15',
    }
    setAllSlas(prev => [ns, ...prev])
    setShowAdd(false)
    setSForm({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: 'Finance', connection: 'SF_Codex' })
  }

  const overall  = Math.round(allSlas.reduce((acc, s) => acc + s.adherence, 0) / allSlas.length)
  const healthy  = allSlas.filter(s => s.status === 'healthy').length
  const atRisk   = allSlas.filter(s => s.status === 'at-risk').length
  const breached = allSlas.filter(s => s.status === 'breached').length

  const filtered = allSlas.filter(s => filter === 'all' || s.status === filter)

  const statCards = [
    { key: 'all'      as FilterType, label: 'Overall Adherence', value: overall + '%', icon: '📊', color: overall >= 90 ? '#16a34a' : '#ea580c', activeBg: '#475569' },
    { key: 'healthy'  as FilterType, label: 'Healthy',           value: healthy,        icon: '✅', color: '#16a34a',  activeBg: '#16a34a'  },
    { key: 'at-risk'  as FilterType, label: 'At Risk',           value: atRisk,         icon: '⚠️', color: '#ea580c',  activeBg: '#ea580c'  },
    { key: 'breached' as FilterType, label: 'Breached',          value: breached,       icon: '🚨', color: '#dc2626',  activeBg: '#dc2626'  },
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
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>SLA Management</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Track service-level agreements across all data assets — {overall}% overall adherence
            {breached > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {breached} SLA{breached > 1 ? 's' : ''} breached</span>}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#E8541A', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          + New SLA
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((card, idx) => {
          const isActive = filter === card.key && idx !== 0
          return (
            <div key={card.key + idx}
              onClick={() => idx === 0 ? undefined : setFilter(isActive ? 'all' : card.key)}
              style={{
                background: isActive ? card.activeBg : '#fff',
                border: `2px solid ${isActive ? card.activeBg : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: idx === 0 ? 'default' : 'pointer',
                boxShadow: isActive ? `0 4px 16px ${card.activeBg}40` : 'none',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : card.color }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear filter</div>}
            </div>
          )
        })}
      </div>

      {/* Filter label */}
      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{filter}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* SLA list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No SLA contracts yet</div>
        ) : null}
        {!loading && filtered.map(s => {
          const ss = statStyle[s.status]
          const adColor = s.adherence >= 95 ? '#16a34a' : s.adherence >= 80 ? '#ca8a04' : '#dc2626'
          const isOpen  = expanded === s.id

          return (
            <div key={s.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : s.status === 'breached' ? '#fca5a5' : s.status === 'at-risk' ? '#fdba74' : '#e2e8f0'}`,
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: isOpen ? '0 6px 24px rgba(99,102,241,0.13)' : s.status === 'breached' ? '0 2px 8px rgba(220,38,38,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.2s',
            }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>

                {/* Status bar */}
                <div style={{ width: '4px', alignSelf: 'stretch', background: ss.dot, borderRadius: '2px', flexShrink: 0 }} />

                {/* Name + dataset */}
                <div style={{ minWidth: '180px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>{s.name}</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>{s.dataset} · {s.domain}</div>
                </div>

                {/* Type */}
                <div style={{ minWidth: '100px', flexShrink: 0, color: '#64748b', fontSize: '12px' }}>{s.type}</div>

                {/* Target */}
                <div style={{ minWidth: '110px', flexShrink: 0, fontFamily: 'monospace', fontSize: '12px', color: '#475569' }}>{s.target}</div>

                {/* Current */}
                <div style={{ minWidth: '60px', flexShrink: 0, fontWeight: 700, fontFamily: 'monospace', fontSize: '12.5px', color: adColor }}>{s.current}</div>

                {/* Adherence bar */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px' }}>
                  <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: `${s.adherence}%`, background: adColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: adColor, minWidth: '38px' }}>{s.adherence}%</span>
                </div>

                {/* Mini trend */}
                <div style={{ flexShrink: 0 }}><MiniTrend data={s.trend} color={adColor} /></div>

                {/* Breaches */}
                <div style={{ minWidth: '40px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: s.breaches > 0 ? '#dc2626' : '#16a34a', flexShrink: 0 }}>{s.breaches}</div>

                {/* Status badge */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ background: ss.bg, color: ss.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ss.dot, display: 'inline-block' }} />
                    {s.status}
                  </span>
                </div>

                {/* Owner */}
                <div style={{ fontSize: '11.5px', color: '#94a3b8', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{s.owner}</div>

                {/* Toggle */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                  background: isOpen ? '#6366f1' : '#f1f5f9',
                  color: isOpen ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', transition: 'all 0.18s',
                }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Connection',   value: s.connection },
                      { label: 'Owner',        value: s.owner },
                      { label: 'Breaches (30d)', value: String(s.breaches) },
                      { label: 'Last Breach',  value: s.lastBreachDate || 'None' },
                      { label: 'Next Review',  value: s.nextReview },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: m.label === 'Breaches (30d)' && Number(m.value) > 0 ? '#dc2626' : '#334155' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Root Cause */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0e7ff', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🔍</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Root Cause — Why is this SLA in this state?</span>
                      </div>
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.rootCause}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {/* Business Impact */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${ss.border}`, overflow: 'hidden' }}>
                        <div style={{ background: ss.bg, padding: '10px 16px', borderBottom: `1px solid ${ss.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>💥</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: ss.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business Impact</span>
                        </div>
                        <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.impact}</div>
                      </div>

                      {/* Recommended Fix */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                        <div style={{ background: '#f0fdf4', padding: '10px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>✅</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {s.status === 'healthy' ? 'Observations & Optimisations' : 'Recommended Fix'}
                          </span>
                        </div>
                        <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.recommendation}</div>
                      </div>
                    </div>

                    {/* Affected pipelines */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                        🔗 Affected Pipelines & Models
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {s.affectedPipelines.map(p => (
                          <code key={p} style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #e2e8f0' }}>{p}</code>
                        ))}
                      </div>
                    </div>

                    {/* 7-day trend chart */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
                        📈 7-Day Adherence Trend
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '48px' }}>
                        {s.trend.map((v, i) => {
                          const barColor = v >= 95 ? '#16a34a' : v >= 80 ? '#ca8a04' : '#dc2626'
                          const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 600, color: barColor }}>{v}%</div>
                              <div style={{ width: '100%', background: `${barColor}25`, borderRadius: '4px', overflow: 'hidden', height: '28px', display: 'flex', alignItems: 'flex-end' }}>
                                <div style={{ width: '100%', height: `${v}%`, background: barColor, borderRadius: '4px', transition: 'height 0.4s' }} />
                              </div>
                              <div style={{ fontSize: '9px', color: '#94a3b8' }}>{days[i]}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

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
      </div>

      {/* New SLA Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAdd(false)} />
          <div style={{ background: '#fff', borderRadius: '14px', width: '520px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>New SLA</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Define a service-level agreement for a data asset</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>SLA Name *</label>
                <input value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Orders Freshness" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Dataset *</label>
                  <input value={sForm.dataset} onChange={e => setSForm(f => ({ ...f, dataset: e.target.value }))} placeholder="e.g. fact_orders" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={sForm.type} onChange={e => setSForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {['Freshness', 'Quality Score', 'Accuracy', 'Completeness', 'Validity', 'Volume'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Target *</label>
                <input value={sForm.target} onChange={e => setSForm(f => ({ ...f, target: e.target.value }))} placeholder="e.g. < 4h delay, ≥ 95%" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={sForm.domain} onChange={e => setSForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {['Finance', 'Marketing', 'Supply Chain', 'Sales', 'Engineering', 'Catalog'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={sForm.owner} onChange={e => setSForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addSla} disabled={!sForm.name || !sForm.dataset || !sForm.target} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: sForm.name && sForm.dataset && sForm.target ? 'pointer' : 'not-allowed',
                background: sForm.name && sForm.dataset && sForm.target ? '#E8541A' : '#e2e8f0',
                color: sForm.name && sForm.dataset && sForm.target ? '#fff' : '#94a3b8'
              }}>Create SLA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
