'use client'
import { useState, useEffect } from 'react'

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

const complianceColor = (c: number) =>
  c >= 90 ? 'var(--status-ok-text)' : c >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const complianceBg = (c: number) =>
  c >= 90 ? 'var(--status-ok-bg)' : c >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'
const statusColor = (s: ContractStatus) =>
  s === 'active' ? 'var(--status-ok-text)' : s === 'warning' ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const statusBg = (s: ContractStatus) =>
  s === 'active' ? 'var(--status-ok-bg)' : s === 'warning' ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'

const termColor: Record<'pass' | 'fail' | 'warn', string> = {
  pass: 'var(--status-ok-text)', fail: 'var(--status-error-text)', warn: 'var(--status-warn-text)',
}
const termBg: Record<'pass' | 'fail' | 'warn', string> = {
  pass: 'var(--status-ok-bg)', fail: 'var(--status-error-bg)', warn: 'var(--status-warn-bg)',
}
const termIcon = { pass: '✓', fail: '✕', warn: '⚠' }

const COLS = '1fr 180px 90px 55px 45px 72px 90px'

export default function ContractsPage() {
  const [filter, setFilter]       = useState<FilterType>('all')
  const [selected, setSelected]   = useState<Contract | null>(null)
  const [search, setSearch]       = useState('')
  const [allContracts, setAllContracts] = useState<Contract[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [cForm, setCForm]         = useState({ name: '', producer: '', consumer: '', owner: '', description: '', sla: '99%', connection: '' })

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
    setCForm({ name: '', producer: '', consumer: '', owner: '', description: '', sla: '99%', connection: '' })
  }

  const total    = allContracts.length
  const active   = allContracts.filter(c => c.status === 'active').length
  const breached = allContracts.filter(c => c.status === 'breached').length
  const avgComp  = total ? Math.round(allContracts.reduce((s, c) => s + c.compliance, 0) / total) : 0

  const filtered = allContracts.filter(c => {
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'active'   ? c.status === 'active' || c.status === 'warning' :
      filter === 'breached' ? c.status === 'breached' : true
    const matchSearch = search === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.producer.toLowerCase().includes(search.toLowerCase()) ||
      c.consumer.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Data Contracts</span>
        <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{active} active</span>
        {breached > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{breached} breached</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Contract</button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          { label: 'Total', value: total },
          { label: 'Active', value: active },
          { label: 'Breached', value: breached },
          { label: 'Avg Compliance', value: avgComp + '%' },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '5px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
            <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', marginTop: '1px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {(['all', 'active', 'breached'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '5px', border: 'none', fontSize: '11px',
            fontWeight: filter === f ? 700 : 400,
            background: filter === f ? 'var(--accent)' : 'var(--surface)',
            color: filter === f ? 'var(--accent-bg)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}>
            {f === 'all' ? `All (${total})` : f === 'active' ? `Active (${active})` : `Breached (${breached})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', width: '160px' }} />
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 8px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['Contract', 'Producer → Consumer', 'Owner', 'Checks', 'Fails', 'Compliance', 'Status'].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>No contracts found</div>}
        {!loading && filtered.map(c => (
          <div key={c.id}
            onClick={() => setSelected(selected?.id === c.id ? null : c)}
            onMouseEnter={() => setHoverId(c.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
              padding: '5px 6px',
              borderLeft: `2px solid ${statusColor(c.status)}`,
              borderBottom: '1px solid var(--surface-muted)',
              background: selected?.id === c.id ? 'var(--surface)' : hoverId === c.id ? 'var(--surface-muted)' : 'transparent',
              cursor: 'pointer',
            }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{c.producer} → {c.consumer}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.owner || '—'}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>{c.checks}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: c.failures > 0 ? 'var(--status-error-text)' : 'var(--foreground)' }}>{c.failures}</span>
            <span style={{ background: complianceBg(c.compliance), color: complianceColor(c.compliance), padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>{c.compliance}%</span>
            <span style={{ background: statusBg(c.status), color: statusColor(c.status), padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, textTransform: 'capitalize' }}>{c.status}</span>
          </div>
        ))}
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
              {/* Compliance badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: complianceBg(selected.compliance), borderRadius: '6px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: complianceColor(selected.compliance), letterSpacing: '0.05em' }}>Compliance</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: complianceColor(selected.compliance) }}>{selected.compliance}%</span>
                <span style={{ fontSize: '10px', color: complianceColor(selected.compliance) }}>{selected.checks} checks · {selected.failures} failures</span>
              </div>
              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { label: 'Producer', value: selected.producer },
                  { label: 'Consumer', value: selected.consumer },
                  { label: 'Owner', value: selected.owner },
                  { label: 'SLA Target', value: selected.sla },
                  { label: 'Connection', value: selected.connection },
                  { label: 'Created', value: selected.created },
                  { label: 'Last Checked', value: selected.lastChecked },
                  { label: 'Trend', value: selected.trend },
                ].map(m => (
                  <div key={m.label} style={{ padding: '6px 8px', background: 'var(--surface-muted)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', marginTop: '1px', wordBreak: 'break-all' }}>{m.value || '—'}</div>
                  </div>
                ))}
              </div>
              {/* Breach section */}
              {(selected.status === 'breached' || selected.status === 'warning') && selected.breachReason && (
                <div style={{ border: '1px solid var(--status-error-text)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', background: 'var(--status-error-bg)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--status-error-text)', textTransform: 'uppercase' }}>Breach Reason</div>
                  <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.breachReason}</div>
                  {selected.breachImpact && <>
                    <div style={{ padding: '6px 10px', background: 'var(--status-warn-bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--status-warn-text)', textTransform: 'uppercase' }}>Impact</div>
                    <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.breachImpact}</div>
                  </>}
                  {selected.breachRecommendation && <>
                    <div style={{ padding: '6px 10px', background: 'var(--status-ok-bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--status-ok-text)', textTransform: 'uppercase' }}>Recommended Fix</div>
                    <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.breachRecommendation}</div>
                  </>}
                </div>
              )}
              {/* Terms checklist */}
              {selected.terms.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Contract Terms</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{selected.terms.filter(t => t.status === 'pass').length}/{selected.terms.length} passing</span>
                  </div>
                  {selected.terms.map((t, i) => (
                    <div key={t.term} style={{ padding: '6px 10px', background: t.status !== 'pass' ? termBg[t.status] : 'transparent', borderLeft: `2px solid ${termColor[t.status]}`, borderBottom: i < selected.terms.length - 1 ? '1px solid var(--surface-muted)' : 'none' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '11px', color: termColor[t.status], flexShrink: 0, marginTop: '1px' }}>{termIcon[t.status]}</span>
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--foreground)' }}>{t.term}</div>
                          <div style={{ fontSize: '10.5px', color: termColor[t.status] }}>{t.detail}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* New Contract Modal — unchanged from original */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Producer *</label>
                  <input value={cForm.producer} onChange={e => setCForm(f => ({ ...f, producer: e.target.value }))} placeholder="source table or dataset" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Consumer *</label>
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
              <button onClick={addContract} disabled={!cForm.name || !cForm.producer || !cForm.consumer} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: cForm.name && cForm.producer && cForm.consumer ? 'pointer' : 'not-allowed', background: cForm.name && cForm.producer && cForm.consumer ? '#E8541A' : '#e2e8f0', color: cForm.name && cForm.producer && cForm.consumer ? '#fff' : '#94a3b8' }}>Create Contract</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
