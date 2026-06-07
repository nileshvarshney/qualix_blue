# Compact /contracts, /slas, /domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/contracts`, `/slas`, and `/domains` pages with the compact layout used on `/governance` and `/catalog`: `10px 16px` padding, `100vh` flex column, mini KPI grid, dense table rows, slide-in right panel.

**Architecture:** Pure layout/style migration — no API, state, or data-fetching changes. Three independent full rewrites of `page.tsx`. Each can be done and committed independently.

**Tech Stack:** Next.js App Router, React, inline styles, CSS variables (`--background`, `--foreground`, `--surface`, `--surface-muted`, `--border`, `--accent`, `--accent-bg`, `--text-muted`, `--text-secondary`, `--status-ok-*`, `--status-warn-*`, `--status-error-*`)

---

## Task 1: Compact /contracts

**Files:**
- Modify: `frontend/src/app/contracts/page.tsx` (full rewrite)

- [ ] **Step 1: Replace contracts/page.tsx**

Replace the entire file with:

```tsx
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
        <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: 'var(--accent-bg)', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Contract</button>
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
                    <div key={i} style={{ padding: '6px 10px', background: t.status !== 'pass' ? termBg[t.status] : 'transparent', borderLeft: `2px solid ${termColor[t.status]}`, borderBottom: i < selected.terms.length - 1 ? '1px solid var(--surface-muted)' : 'none' }}>
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/contracts/page.tsx
git commit -m "feat: compact /contracts — dense rows, slide-in panel, mini KPI grid"
```

---

## Task 2: Compact /slas

**Files:**
- Modify: `frontend/src/app/slas/page.tsx` (full rewrite)

- [ ] **Step 1: Replace slas/page.tsx**

Replace the entire file with:

```tsx
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
        <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: 'var(--accent-bg)', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ SLA</button>
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
            color: filter === f ? 'var(--accent-bg)' : 'var(--text-secondary)',
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
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/slas/page.tsx
git commit -m "feat: compact /slas — dense rows, inline MiniTrend, slide-in panel"
```

---

## Task 3: Compact /domains

**Files:**
- Modify: `frontend/src/app/domains/page.tsx` (full rewrite)

- [ ] **Step 1: Replace domains/page.tsx**

Replace the entire file with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const ICONS  = ['💰','📣','🚚','📦','⚙️','🌐','📊','🏥','🎓','🛒','🏗️','💡','🔬','📱','🎯']
const COLORS = ['#2563eb','#ec4899','#f59e0b','#8b5cf6','#14b8a6','#ef4444','#16a34a','#0ea5e9','#f97316','#6366f1']

interface Domain {
  id: string; name: string; icon: string; color: string; owner: string
  datasets: number; rules: number; score: number; issues: number
  connection: string; desc: string; tables: string[]
}

const scoreColor = (s: number) =>
  s >= 90 ? 'var(--status-ok-text)' : s >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const scoreBg = (s: number) =>
  s >= 90 ? 'var(--status-ok-bg)' : s >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'

function ScoreRing({ score }: { score: number }) {
  const r = 28, circ = 2 * Math.PI * r, dash = (score / 100) * circ
  const c = score >= 90 ? '#16a34a' : score >= 80 ? '#ca8a04' : '#dc2626'
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#f1f5f9" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={c} strokeWidth="6" strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" transform="rotate(-90 36 36)" />
      <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill={c}>{score}</text>
    </svg>
  )
}

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: '#fafaf9', boxSizing: 'border-box' }

const COLS = '1fr 130px 65px 60px 60px 55px 64px'

export default function DomainsPage() {
  const [domains, setDomains]     = useState<Domain[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<Domain | null>(null)
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editDomain, setEditDomain] = useState<Domain | null>(null)
  const [form, setForm]           = useState({ name: '', icon: '🌐', color: '#2563eb', owner: '', connection: '', desc: '', tables: '' })
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')

  useEffect(() => {
    fetch('/api/domains-list')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setDomains(items.map((d: Record<string, unknown>, i: number) => ({
          id: String(d.domain_id ?? d.id ?? i),
          name: String(d.domain_name ?? d.name ?? ''),
          icon: String(d.icon ?? '🌐'),
          color: String(d.color ?? COLORS[i % COLORS.length]),
          owner: String(d.owner ?? d.owner_name ?? ''),
          datasets: Number(d.datasets ?? d.asset_count ?? 0),
          rules: Number(d.rules ?? d.rule_count ?? 0),
          score: Number(d.score ?? d.quality_score ?? 100),
          issues: Number(d.issues ?? d.issue_count ?? 0),
          connection: String(d.connection ?? ''),
          desc: String(d.description ?? d.desc ?? ''),
          tables: Array.isArray(d.tables) ? d.tables as string[] : [],
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function openAdd() {
    setForm({ name: '', icon: '🌐', color: '#2563eb', owner: '', connection: '', desc: '', tables: '' })
    setEditDomain(null)
    setShowModal(true)
  }

  function openEdit(d: Domain, e: React.MouseEvent) {
    e.stopPropagation()
    setForm({ name: d.name, icon: d.icon, color: d.color, owner: d.owner, connection: d.connection, desc: d.desc, tables: d.tables.join(', ') })
    setEditDomain(d)
    setShowModal(true)
  }

  function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const tables = form.tables.split(',').map(t => t.trim()).filter(Boolean)
    if (editDomain) {
      setDomains(prev => prev.map(d => d.id === editDomain.id ? { ...d, ...form, tables, datasets: tables.length || d.datasets } : d))
      if (selected?.id === editDomain.id) setSelected(prev => prev ? { ...prev, ...form, tables, datasets: tables.length || prev.datasets } : null)
    } else {
      setDomains(prev => [...prev, {
        id: `d${Date.now()}`, name: form.name, icon: form.icon, color: form.color,
        owner: form.owner, datasets: tables.length, rules: 0, score: 100, issues: 0,
        connection: form.connection, desc: form.desc, tables,
      }])
    }
    setSaving(false)
    setShowModal(false)
  }

  function deleteDomain(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this domain?')) return
    setDomains(prev => prev.filter(d => d.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const totalDatasets = domains.reduce((a, d) => a + d.datasets, 0)
  const totalRules    = domains.reduce((a, d) => a + d.rules, 0)
  const avgScore      = domains.length ? Math.round(domains.reduce((a, d) => a + d.score, 0) / domains.length) : 0

  const filtered = domains.filter(d =>
    search === '' || d.name.toLowerCase().includes(search.toLowerCase()) || d.owner.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Domain Management</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{domains.length} domains</span>
        <div style={{ flex: 1 }} />
        <button onClick={openAdd} style={{ background: 'var(--accent)', color: 'var(--accent-bg)', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Domain</button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          { label: 'Total Domains',   value: domains.length },
          { label: 'Total Datasets',  value: totalDatasets },
          { label: 'Total Rules',     value: totalRules },
          { label: 'Avg Quality',     value: avgScore + '%' },
        ].map((k, i) => (
          <div key={k.label} style={{ padding: '5px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
            <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', marginTop: '1px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search domains…"
          style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', width: '200px' }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 8px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['Domain', 'Owner', 'Datasets', 'Rules', 'Score', 'Issues', ''].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>No domains yet</div>}
        {!loading && filtered.map(d => (
          <div key={d.id}
            onClick={() => setSelected(selected?.id === d.id ? null : d)}
            onMouseEnter={() => setHoverId(d.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
              padding: '5px 6px',
              borderLeft: `2px solid ${d.color}`,
              borderBottom: '1px solid var(--surface-muted)',
              background: selected?.id === d.id ? 'var(--surface)' : hoverId === d.id ? 'var(--surface-muted)' : 'transparent',
              cursor: 'pointer',
            }}>
            {/* Icon + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span style={{ fontSize: '14px', flexShrink: 0 }}>{d.icon}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.owner || '—'}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', textAlign: 'center' }}>{d.datasets}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', textAlign: 'center' }}>{d.rules}</span>
            <span style={{ background: scoreBg(d.score), color: scoreColor(d.score), padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, textAlign: 'center' }}>{d.score}</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: d.issues > 0 ? 'var(--status-error-text)' : 'var(--foreground)', textAlign: 'center' }}>{d.issues}</span>
            {/* Edit/delete: only visible on hover */}
            <div style={{ display: 'flex', gap: '3px', opacity: hoverId === d.id ? 1 : 0, transition: 'opacity 0.1s' }}>
              <button onClick={e => openEdit(d, e)} style={{ padding: '2px 5px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>✏️</button>
              <button onClick={e => deleteDomain(d.id, e)} style={{ padding: '2px 5px', borderRadius: '4px', border: '1px solid var(--status-error-bg)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: 'pointer' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {/* Slide-in panel */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '18px' }}>{selected.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', flex: 1, color: 'var(--foreground)' }}>{selected.name}</span>
              <span style={{ background: scoreBg(selected.score), color: scoreColor(selected.score), padding: '2px 8px', borderRadius: '4px', fontSize: '13px', fontWeight: 700 }}>{selected.score}</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Score ring */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px' }}>
                <ScoreRing score={selected.score} />
                <div>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '4px' }}>Quality Score</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[{ label: 'Datasets', value: selected.datasets }, { label: 'Rules', value: selected.rules }, { label: 'Issues', value: selected.issues }].map(m => (
                      <div key={m.label}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: m.label === 'Issues' && m.value > 0 ? 'var(--status-error-text)' : 'var(--foreground)' }}>{m.value}</div>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { label: 'Owner', value: selected.owner },
                  { label: 'Connection', value: selected.connection },
                ].map(m => (
                  <div key={m.label} style={{ padding: '6px 8px', background: 'var(--surface-muted)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', marginTop: '1px' }}>{m.value || '—'}</div>
                  </div>
                ))}
              </div>
              {/* Description */}
              {selected.desc && (
                <div style={{ padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '5px', fontSize: '12px', color: 'var(--foreground)', lineHeight: 1.6 }}>{selected.desc}</div>
              )}
              {/* Tables */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Tables in this domain ({selected.tables.length})
                </div>
                {selected.tables.length === 0 && <div style={{ padding: '10px', fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No tables assigned yet</div>}
                {selected.tables.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderBottom: '1px solid var(--surface-muted)' }}>
                    <span style={{ color: selected.color, fontSize: '10px' }}>▸</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--foreground)', flex: 1 }}>{t}</span>
                    <Link href="/catalog" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>View →</Link>
                  </div>
                ))}
              </div>
              {/* Quick links */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <Link href="/issues" style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid var(--status-error-bg)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '11px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Issues</Link>
                <Link href="/rules" style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', fontSize: '11px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Rules</Link>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal — unchanged from original */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>{editDomain ? '✏️ Edit Domain' : '+ New Domain'}</div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>{editDomain ? 'Update domain details' : 'Create a new business domain'}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={lbl}>Domain Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Finance, Marketing, Supply Chain" style={inp} />
              </div>
              <div>
                <label style={lbl}>Icon</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ICONS.map(ic => (
                    <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))} style={{ width: '36px', height: '36px', borderRadius: '8px', border: `2px solid ${form.icon === ic ? '#2563eb' : '#e2e8f0'}`, background: form.icon === ic ? '#dbeafe' : '#fafaf9', fontSize: '18px', cursor: 'pointer' }}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Color</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <div style={{ background: '#fafaf9', borderRadius: '10px', padding: '12px 14px', border: '1px solid #ebe8df', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${form.color}18`, border: `1px solid ${form.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{form.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '14px' }}>{form.name || 'Domain Name'}</div>
                  <div style={{ fontSize: '12px', color: form.color, fontWeight: 600 }}>Preview</div>
                </div>
              </div>
              <div>
                <label style={lbl}>Owner</label>
                <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. Bhaskar R." style={inp} />
              </div>
              <div>
                <label style={lbl}>Connection</label>
                <input value={form.connection} onChange={e => setForm(f => ({ ...f, connection: e.target.value }))} placeholder="Connection name" style={inp} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Describe what data this domain covers…" rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lbl}>Tables (comma-separated)</label>
                <input value={form.tables} onChange={e => setForm(f => ({ ...f, tables: e.target.value }))} placeholder="table_name_1, table_name_2" style={inp} />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Enter table names separated by commas</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving || !form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? '#2563eb' : '#e2e8f0', color: form.name.trim() ? '#fff' : '#94a3b8' }}>
                  {editDomain ? '✓ Save Changes' : '+ Create Domain'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/domains/page.tsx
git commit -m "feat: compact /domains — dense rows, score badge, slide-in panel, edit/delete on hover"
```
