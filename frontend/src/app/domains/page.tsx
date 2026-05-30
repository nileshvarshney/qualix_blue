'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const ICONS = ['💰','📣','🚚','📦','⚙️','🌐','📊','🏥','🎓','🛒','🏗️','💡','🔬','📱','🎯']
const COLORS = ['#2563eb','#ec4899','#f59e0b','#8b5cf6','#14b8a6','#ef4444','#16a34a','#0ea5e9','#f97316','#6366f1']

interface Domain {
  id: string; name: string; icon: string; color: string; owner: string
  datasets: number; rules: number; score: number; issues: number
  connection: string; desc: string; tables: string[]
}


function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 28, circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
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

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Domain | null>(null)

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
  const [showModal, setShowModal] = useState(false)
  const [editDomain, setEditDomain] = useState<Domain | null>(null)
  const [form, setForm] = useState({ name: '', icon: '🌐', color: '#2563eb', owner: '', connection: 'SF_Codex', desc: '', tables: '' })
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setForm({ name: '', icon: '🌐', color: '#2563eb', owner: '', connection: 'SF_Codex', desc: '', tables: '' })
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
      const newDomain: Domain = {
        id: `d${Date.now()}`, name: form.name, icon: form.icon, color: form.color,
        owner: form.owner, datasets: tables.length, rules: 0, score: 100, issues: 0,
        connection: form.connection, desc: form.desc, tables,
      }
      setDomains(prev => [...prev, newDomain])
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

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Analytics platform</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Domain Management</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>Organize and govern data by business domain · {domains.length} domains</p>
        </div>
        <button onClick={openAdd} style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>+ New Domain</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '28px' }}>
        {[{ label: 'Total Domains', value: domains.length, icon: '🌐' }, { label: 'Total Datasets', value: domains.reduce((a, d) => a + d.datasets, 0), icon: '📦' }, { label: 'Total Rules', value: domains.reduce((a, d) => a + d.rules, 0), icon: '🛡️' }, { label: 'Avg Quality Score', value: domains.length ? Math.round(domains.reduce((a, d) => a + d.score, 0) / domains.length) + '%' : '—', icon: '📊' }].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#1a1a1a' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: '16px' }}>
        {loading && (
          <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '14px', border: '1px solid #ebe8df' }}>
            Loading…
          </div>
        )}
        {!loading && domains.map(d => (
          <div key={d.id} onClick={() => setSelected(selected?.id === d.id ? null : d)} style={{ background: '#fff', border: `2px solid ${selected?.id === d.id ? d.color : '#ebe8df'}`, borderRadius: '14px', padding: '20px 22px', cursor: 'pointer', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${d.color}18`, border: `1px solid ${d.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>{d.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a1a' }}>{d.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Owner: {d.owner || '—'}</div>
                </div>
              </div>
              <ScoreRing score={d.score} color={d.color} />
            </div>

            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px', lineHeight: '1.5' }}>{d.desc || 'No description'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '14px' }}>
              {[{ label: 'Datasets', value: d.datasets }, { label: 'Rules', value: d.rules }, { label: 'Issues', value: d.issues }].map(m => (
                <div key={m.label} style={{ background: '#fafaf9', borderRadius: '8px', padding: '8px', textAlign: 'center', border: '1px solid #ebe8df' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: m.label === 'Issues' && m.value > 0 ? '#dc2626' : '#1a1a1a' }}>{m.value}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* Edit / Delete actions */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: selected?.id === d.id ? '14px' : '0' }}>
              <button onClick={e => openEdit(d, e)} style={{ flex: 1, padding: '6px', borderRadius: '7px', border: '1px solid #dbeafe', background: '#fff', color: '#2563eb', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>✏️ Edit</button>
              <button onClick={e => deleteDomain(d.id, e)} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>🗑</button>
            </div>

            {selected?.id === d.id && (
              <div style={{ borderTop: '1px solid #f3f1ea', paddingTop: '12px' }}>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>TABLES IN THIS DOMAIN</div>
                {d.tables.length > 0 ? d.tables.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                    <span style={{ color: d.color, fontSize: '12px' }}>▸</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12.5px', color: '#475569' }}>{t}</span>
                    <Link href="/catalog" style={{ marginLeft: 'auto', fontSize: '11px', color: '#2563eb', textDecoration: 'none' }}>View →</Link>
                  </div>
                )) : <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic' }}>No tables assigned yet</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <Link href="/issues" style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '12px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Issues</Link>
                  <Link href="/rules" style={{ flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #dbeafe', background: '#fff', color: '#2563eb', fontSize: '12px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Rules</Link>
                </div>
              </div>
            )}
          </div>
        ))}

        {!loading && domains.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No domains yet
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
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
              {/* Name */}
              <div>
                <label style={lbl}>Domain Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Finance, Marketing, Supply Chain" style={inp} />
              </div>

              {/* Icon picker */}
              <div>
                <label style={lbl}>Icon</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ICONS.map(ic => (
                    <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))} style={{ width: '36px', height: '36px', borderRadius: '8px', border: `2px solid ${form.icon === ic ? '#2563eb' : '#e2e8f0'}`, background: form.icon === ic ? '#dbeafe' : '#fafaf9', fontSize: '18px', cursor: 'pointer' }}>{ic}</button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label style={lbl}>Color</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div style={{ background: '#fafaf9', borderRadius: '10px', padding: '12px 14px', border: '1px solid #ebe8df', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${form.color}18`, border: `1px solid ${form.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{form.icon}</div>
                <div>
                  <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '14px' }}>{form.name || 'Domain Name'}</div>
                  <div style={{ fontSize: '12px', color: form.color, fontWeight: 600 }}>Preview</div>
                </div>
              </div>

              {/* Owner */}
              <div>
                <label style={lbl}>Owner</label>
                <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="e.g. Bhaskar R." style={inp} />
              </div>

              {/* Connection */}
              <div>
                <label style={lbl}>Connection</label>
                <input value={form.connection} onChange={e => setForm(f => ({ ...f, connection: e.target.value }))} placeholder="SF_Codex" style={inp} />
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Describe what data this domain covers…" rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>

              {/* Tables */}
              <div>
                <label style={lbl}>Tables (comma-separated)</label>
                <input value={form.tables} onChange={e => setForm(f => ({ ...f, tables: e.target.value }))} placeholder="fact_orders, dim_customers, revenue_by_channel" style={inp} />
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
