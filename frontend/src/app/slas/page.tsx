'use client'
import { useState, useEffect } from 'react'

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

const adColor = (n: number) =>
  n >= 95 ? 'var(--status-ok-text)' : n >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const adBg = (n: number) =>
  n >= 95 ? 'var(--status-ok-bg)' : n >= 80 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'
const statusColor = (s: SLAStatus) =>
  s === 'healthy' ? 'var(--status-ok-text)' : s === 'at-risk' ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const statusBg = (s: SLAStatus) =>
  s === 'healthy' ? 'var(--status-ok-bg)' : s === 'at-risk' ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'

function MiniTrend({ data, color, h = 28 }: { data: number[]; color: string; h?: number }) {
  const w = h <= 18 ? 60 : 80
  const max = 100, min = Math.min(...data) - 2
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`)
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const COLS = '1fr 110px 72px 88px 62px 68px 40px 78px 80px'

export default function SLAsPage() {
  const [filter, setFilter]   = useState<FilterType>('all')
  const [selected, setSelected] = useState<SLA | null>(null)
  const [allSlas, setAllSlas] = useState<SLA[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [sForm, setSForm]     = useState({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: '', connection: '' })

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
      affectedPipelines: [], nextReview: '',
    }
    setAllSlas(prev => [ns, ...prev])
    setShowAdd(false)
    setSForm({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: '', connection: '' })
  }

  const overall  = allSlas.length ? Math.round(allSlas.reduce((acc, s) => acc + s.adherence, 0) / allSlas.length) : 0
  const healthy  = allSlas.filter(s => s.status === 'healthy').length
  const atRisk   = allSlas.filter(s => s.status === 'at-risk').length
  const breached = allSlas.filter(s => s.status === 'breached').length
  const filtered = allSlas.filter(s => filter === 'all' || s.status === filter)

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>SLA Management</span>
        <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{healthy} healthy</span>
        {atRisk > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{atRisk} at-risk</span>}
        {breached > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{breached} breached</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ SLA</button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          { label: 'Overall Adherence', value: overall + '%' },
          { label: 'Healthy', value: healthy },
          { label: 'At Risk', value: atRisk },
          { label: 'Breached', value: breached },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '5px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
            <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', marginTop: '1px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {(['all', 'healthy', 'at-risk', 'breached'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '5px', border: 'none', fontSize: '11px',
            fontWeight: filter === f ? 700 : 400,
            background: filter === f ? 'var(--accent)' : 'var(--surface)',
            color: filter === f ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer', textTransform: 'capitalize',
          }}>
            {f === 'all' ? `All (${allSlas.length})` : f === 'healthy' ? `Healthy (${healthy})` : f === 'at-risk' ? `At Risk (${atRisk})` : `Breached (${breached})`}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 8px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['SLA Name', 'Dataset', 'Type', 'Target', 'Adherence', 'Trend', 'Brch', 'Status', 'Owner'].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>No SLAs found</div>}
        {!loading && filtered.map(s => {
          const ac = adColor(s.adherence)
          return (
            <div key={s.id}
              onClick={() => setSelected(selected?.id === s.id ? null : s)}
              onMouseEnter={() => setHoverId(s.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
                padding: '4px 6px',
                borderLeft: `2px solid ${statusColor(s.status)}`,
                borderBottom: '1px solid var(--surface-muted)',
                background: selected?.id === s.id ? 'var(--surface)' : hoverId === s.id ? 'var(--surface-muted)' : 'transparent',
                cursor: 'pointer',
              }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{s.dataset}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.type}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.target}</span>
              <span style={{ background: adBg(s.adherence), color: ac, padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>{s.adherence}%</span>
              <div style={{ display: 'flex', alignItems: 'center' }}><MiniTrend data={s.trend} color={ac} h={18} /></div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: s.breaches > 0 ? 'var(--status-error-text)' : 'var(--foreground)', textAlign: 'center' }}>{s.breaches}</span>
              <span style={{ background: statusBg(s.status), color: statusColor(s.status), padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.status}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.owner}</span>
            </div>
          )
        })}
      </div>

      {/* Slide-in panel */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', flex: 1, color: 'var(--foreground)' }}>{selected.name}</span>
              <span style={{ background: statusBg(selected.status), color: statusColor(selected.status), padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize' }}>{selected.status}</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Adherence + trend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', background: adBg(selected.adherence), borderRadius: '6px' }}>
                <div>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: adColor(selected.adherence), letterSpacing: '0.05em' }}>Adherence</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: adColor(selected.adherence) }}>{selected.adherence}%</div>
                </div>
                <MiniTrend data={selected.trend} color={adColor(selected.adherence)} h={28} />
                <div style={{ fontSize: '10px', color: adColor(selected.adherence) }}>
                  <div>Target: {selected.target}</div>
                  <div>Current: {selected.current}</div>
                  <div>{selected.breaches} breach{selected.breaches !== 1 ? 'es' : ''}</div>
                </div>
              </div>
              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { label: 'Dataset', value: selected.dataset },
                  { label: 'Type', value: selected.type },
                  { label: 'Domain', value: selected.domain },
                  { label: 'Owner', value: selected.owner },
                  { label: 'Connection', value: selected.connection },
                  { label: 'Last Breach', value: selected.lastBreachDate || 'None' },
                  { label: 'Next Review', value: selected.nextReview || '—' },
                  { label: 'Breaches (30d)', value: String(selected.breaches) },
                ].map(m => (
                  <div key={m.label} style={{ padding: '6px 8px', background: 'var(--surface-muted)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', marginTop: '1px' }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {/* Root cause */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Root Cause</div>
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.rootCause || '—'}</div>
                <div style={{ padding: '6px 10px', background: 'var(--status-warn-bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--status-warn-text)', textTransform: 'uppercase' }}>Business Impact</div>
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.impact || '—'}</div>
                <div style={{ padding: '6px 10px', background: 'var(--status-ok-bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--status-ok-text)', textTransform: 'uppercase' }}>
                  {selected.status === 'healthy' ? 'Observations' : 'Recommended Fix'}
                </div>
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.recommendation || '—'}</div>
              </div>
              {/* Affected pipelines */}
              {selected.affectedPipelines.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>Affected Pipelines</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selected.affectedPipelines.map(p => (
                      <code key={p} style={{ background: 'var(--surface-muted)', color: 'var(--foreground)', padding: '3px 8px', borderRadius: '5px', fontSize: '11px', fontFamily: 'monospace', border: '1px solid var(--border)' }}>{p}</code>
                    ))}
                  </div>
                </div>
              )}
              {/* 7-day bar chart */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>7-Day Adherence</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px' }}>
                  {selected.trend.map((v, i) => {
                    const bc = v >= 95 ? 'var(--status-ok-text)' : v >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
                    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
                    return (
                      <div key={days[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 600, color: bc }}>{v}%</div>
                        <div style={{ width: '100%', height: '20px', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{ width: '100%', height: `${v}%`, background: bc, borderRadius: '2px' }} />
                        </div>
                        <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{days[i]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* New SLA Modal — unchanged from original */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <input value={sForm.dataset} onChange={e => setSForm(f => ({ ...f, dataset: e.target.value }))} placeholder="table or dataset name" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={sForm.type} onChange={e => setSForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {['Freshness','Quality Score','Accuracy','Completeness','Validity','Volume'].map(t => <option key={t} value={t}>{t}</option>)}
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
                  <input value={sForm.domain} onChange={e => setSForm(f => ({ ...f, domain: e.target.value }))} placeholder="e.g. Finance" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={sForm.owner} onChange={e => setSForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addSla} disabled={!sForm.name || !sForm.dataset || !sForm.target} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: sForm.name && sForm.dataset && sForm.target ? 'pointer' : 'not-allowed', background: sForm.name && sForm.dataset && sForm.target ? '#E8541A' : '#e2e8f0', color: sForm.name && sForm.dataset && sForm.target ? '#fff' : '#94a3b8' }}>Create SLA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
