'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import DomainHealthTrends from '@/components/domains/DomainHealthTrends'
import { apiFetch } from '@/lib/apiFetch'

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

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--foreground)', background: 'var(--surface-muted)', boxSizing: 'border-box' }

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
    Promise.all([
      apiFetch('/api/domains-list').then(r => r.json()).catch(() => []),
      apiFetch('/api/dashboard/domains').then(r => r.json()).catch(() => []),
    ]).then(([listData, statsData]) => {
      const items: Record<string, unknown>[] = Array.isArray(listData) ? listData : []
      const stats: Record<string, Record<string, unknown>> = {}
      if (Array.isArray(statsData)) {
        for (const s of statsData as Record<string, unknown>[]) {
          if (s.domain_id) stats[String(s.domain_id)] = s
        }
      }
      setDomains(items.map((d: Record<string, unknown>, i: number) => {
        const id = String(d.domain_id ?? d.id ?? i)
        const s = stats[id] ?? {}
        return {
          id,
          name: String(d.domain_name ?? d.name ?? ''),
          icon: String(d.icon ?? '🌐'),
          color: String(d.color ?? COLORS[i % COLORS.length]),
          owner: String(d.owner ?? d.owner_name ?? ''),
          datasets: Number(s.total_assets ?? d.datasets ?? d.asset_count ?? 0),
          rules: Number(s.total_rules ?? d.rules ?? d.rule_count ?? 0),
          score: Number(s.quality_score ?? d.score ?? 100),
          issues: Number(s.failed_rules ?? d.issues ?? d.issue_count ?? 0),
          connection: String(d.connection ?? ''),
          desc: String(d.description ?? d.desc ?? ''),
          tables: Array.isArray(d.tables) ? d.tables as string[] : [],
        }
      }))
      setLoading(false)
    }).catch(() => setLoading(false))
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

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const tables = form.tables.split(',').map(t => t.trim()).filter(Boolean)
    try {
      if (editDomain) {
        await fetch('/api/domains-list', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editDomain.id, domain_name: form.name, description: form.desc, owner_name: form.owner }),
        })
        setDomains(prev => prev.map(d => d.id === editDomain.id ? { ...d, ...form, tables, datasets: tables.length || d.datasets } : d))
        if (selected?.id === editDomain.id) setSelected(prev => prev ? { ...prev, ...form, tables, datasets: tables.length || prev.datasets } : null)
      } else {
        const res = await fetch('/api/domains-list', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain_name: form.name, description: form.desc, owner_name: form.owner }),
        })
        const created = await res.json()
        setDomains(prev => [...prev, {
          id: String(created.domain_id ?? `d${Date.now()}`), name: form.name, icon: form.icon, color: form.color,
          owner: form.owner, datasets: tables.length, rules: 0, score: 100, issues: 0,
          connection: form.connection, desc: form.desc, tables,
        }])
      }
    } catch { /* keep local state on error */ }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteDomain(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this domain?')) return
    try {
      await fetch(`/api/domains-list?id=${id}`, { method: 'DELETE' })
    } catch { /* proceed with local removal */ }
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
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Domain Management</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{domains.length} domains</span>
        <div style={{ flex: 1 }} />
        <button onClick={openAdd} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Domain</button>
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

              {/* Health Trends */}
              <DomainHealthTrends domainId={selected.id} />
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal — unchanged from original */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>{editDomain ? '✏️ Edit Domain' : '+ New Domain'}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>{editDomain ? 'Update domain details' : 'Create a new business domain'}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}>✕</button>
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
                    <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))} style={{ width: '36px', height: '36px', borderRadius: '8px', border: `2px solid ${form.icon === ic ? '#2563eb' : 'var(--border)'}`, background: form.icon === ic ? 'var(--status-info-bg)' : 'var(--surface-muted)', fontSize: '18px', cursor: 'pointer' }}>{ic}</button>
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
              <div style={{ background: 'var(--surface-muted)', borderRadius: '10px', padding: '12px 14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${form.color}18`, border: `1px solid ${form.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{form.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '14px' }}>{form.name || 'Domain Name'}</div>
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
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Enter table names separated by commas</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving || !form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? '#2563eb' : 'var(--border)', color: form.name.trim() ? '#fff' : 'var(--text-muted)' }}>
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
