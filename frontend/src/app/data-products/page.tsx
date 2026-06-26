'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface DataProduct {
  id: string; name: string; description: string; domain: string; owner: string
  status: 'certified' | 'published' | 'draft'; tier: 'gold' | 'silver' | 'bronze'
  qualityScore: number; consumers: number; datasets: number
  sla: string; freshness: string; lastUpdated: string; tags?: string[]
}

function tierStyle(t: string) {
  if (t === 'gold')   return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', icon: '🥇', label: 'Gold' }
  if (t === 'silver') return { bg: 'var(--surface-muted)',  color: 'var(--text-secondary)',   icon: '🥈', label: 'Silver' }
  return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', icon: '🥉', label: 'Bronze' }
}
function statusStyle(s: string) {
  if (s === 'certified') return { bg: 'var(--status-ok-bg)',   color: 'var(--status-ok-text)',   label: '✓ Certified' }
  if (s === 'published') return { bg: 'var(--surface-muted)', color: 'var(--text-secondary)',    label: '● Published' }
  return                        { bg: 'var(--surface-muted)', color: 'var(--text-muted)',         label: '○ Draft' }
}
const scoreColor = (s: number) => s >= 90 ? 'var(--status-ok-text)' : s >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const scoreBg    = (s: number) => s >= 90 ? 'var(--status-ok-bg)'   : s >= 80 ? 'var(--status-warn-bg)'   : 'var(--status-error-bg)'
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' as const }
const COLS = '20px 1fr 100px 80px 72px 58px 30px'

export default function DataProductsPage() {
  const [products,    setProducts]    = useState<DataProduct[]>([])
  const [loading,     setLoading]     = useState(true)
  const [domains,     setDomains]     = useState<string[]>([])
  const [filter,      setFilter]      = useState<'all'|'certified'|'published'|'draft'>('all')
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState<DataProduct | null>(null)
  const [hoverId,     setHoverId]     = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', domain: '', owner: '',
    status: 'draft' as DataProduct['status'], tier: 'bronze' as DataProduct['tier'],
    sla: '99.0%', tags: '',
  })
  const [editProduct, setEditProduct] = useState<DataProduct | null>(null)
  const [editPForm, setEditPForm] = useState<{
    name: string; description: string; domain: string; owner: string;
    status: DataProduct['status']; tier: DataProduct['tier']; sla: string
  }>({ name: '', description: '', domain: '', owner: '', status: 'draft', tier: 'bronze', sla: '' })
  const [editPSaving, setEditPSaving] = useState(false)

  useEffect(() => {
    apiFetch('/api/domains')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const names = (Array.isArray(data) ? data : [])
          .map(d => String(d.domain_name ?? d.name ?? ''))
          .filter(Boolean)
          .sort()
        if (names.length > 0) setDomains(names)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/data-products')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: DataProduct[] = (Array.isArray(data) ? data : []).map((p, i) => ({
          id:           String(p.product_id ?? p.id ?? i),
          name:         String(p.product_name ?? p.name ?? ''),
          description:  String(p.description ?? ''),
          domain:       String(p.domain ?? ''),
          owner:        String(p.owner ?? p.owner_email ?? p.owner_team ?? ''),
          status:       (p.status as DataProduct['status']) ?? 'draft',
          tier:         (p.tier   as DataProduct['tier'])   ?? 'bronze',
          qualityScore: Number(p.quality_score ?? p.qualityScore ?? 0),
          consumers:    Number(p.consumer_count ?? p.consumers ?? 0),
          datasets:     Number(p.dataset_count  ?? p.datasets  ?? 0),
          sla:          String(p.sla ?? p.sla_target ?? ''),
          freshness:    String(p.freshness ?? ''),
          lastUpdated:  String(p.last_updated ?? p.lastUpdated ?? p.updated_at ?? new Date().toISOString()),
          tags:         Array.isArray(p.tags) ? p.tags as string[] : [],
        }))
        setProducts(items); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const updateProduct = async () => {
    if (!editProduct || !editPForm.name) return
    setEditPSaving(true)
    try {
      const res = await apiFetch('/api/data-products', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editProduct.id,
          product_name: editPForm.name,
          description: editPForm.description,
          domain: editPForm.domain,
          owner_email: editPForm.owner,
          status: editPForm.status,
          sla: editPForm.sla,
        }),
      })
      if (!res.ok) throw new Error(`Update failed: ${res.status}`)
      setProducts(prev => prev.map(p => p.id === editProduct.id
        ? { ...p, name: editPForm.name, description: editPForm.description, domain: editPForm.domain,
            owner: editPForm.owner, status: editPForm.status, tier: editPForm.tier, sla: editPForm.sla } : p))
      if (selected?.id === editProduct.id) {
        setSelected(prev => prev ? { ...prev, name: editPForm.name, description: editPForm.description } : prev)
      }
      setEditProduct(null)
    } catch (err) {
      console.error(err)
    } finally {
      setEditPSaving(false)
    }
  }

  const certifiedCount = products.filter(p => p.status === 'certified').length
  const avgQuality     = products.length > 0 ? Math.round(products.reduce((s, p) => s + p.qualityScore, 0) / products.length) : 0

  const filtered = products.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.domain.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function createProduct() {
    if (!form.name.trim()) return
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    try {
      const res = await apiFetch('/api/data-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: form.name, description: form.description,
          domain: form.domain,
          status: form.status, tier: form.tier, sla_target: form.sla,
          owner_email: form.owner || null,
          tags: tags.length ? JSON.stringify(tags) : null,
        }),
      })
      const created = await res.json()
      const np: DataProduct = {
        id: String(created.product_id ?? `dp_${Date.now()}`), name: form.name,
        description: form.description, domain: form.domain,
        owner: form.owner || 'Unassigned', status: form.status, tier: form.tier,
        qualityScore: Number(created.quality_score ?? created.qualityScore ?? 0),
        consumers: 0, datasets: 0, sla: form.sla, freshness: 'Just now',
        lastUpdated: new Date().toISOString(), tags,
      }
      setProducts(prev => [np, ...prev])
    } catch {
      setProducts(prev => [{
        id: `dp_${Date.now()}`, name: form.name, description: form.description,
        domain: form.domain, owner: form.owner || 'Unassigned',
        status: form.status, tier: form.tier,
        qualityScore: 0,
        consumers: 0, datasets: 0, sla: form.sla, freshness: 'Just now',
        lastUpdated: new Date().toISOString(), tags,
      }, ...prev])
    }
    setShowCreate(false)
    setForm({ name: '', description: '', domain: 'Sales', owner: '', status: 'draft', tier: 'bronze', sla: '99.0%', tags: '' })
  }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Data Products</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{products.length} total</span>
        {certifiedCount > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{certifiedCount} certified</span>}
        {products.length > 0 && <span style={{ background: scoreBg(avgQuality), color: scoreColor(avgQuality), padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>avg {avgQuality}%</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Create Product</button>
      </div>

      {/* Filter + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['all', 'certified', 'published', 'draft'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: filter === f ? 'var(--foreground)' : 'var(--surface-muted)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
            fontWeight: filter === f ? 600 : 400, fontSize: '11px', textTransform: 'capitalize',
          }}>
            {f === 'all' ? `All (${products.length})` : `${f} (${products.filter(p => p.status === f).length})`}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          style={{ flex: 1, padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', minWidth: '120px' }} />
      </div>

      {/* Column headers */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['', 'Name', 'Domain', 'Owner', 'Status', 'Quality', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>
            {products.length === 0 ? 'No data products yet' : 'No products match filters'}
          </div>
        )}
        {!loading && filtered.map(p => {
          const tier = tierStyle(p.tier)
          const stat = statusStyle(p.status)
          return (
            <div key={p.id}
              onClick={() => setSelected(selected?.id === p.id ? null : p)}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
                padding: '5px 6px', borderLeft: `2px solid ${tier.color}`,
                borderBottom: '1px solid var(--surface-muted)',
                background: selected?.id === p.id ? 'var(--surface)' : hoverId === p.id ? 'var(--surface-muted)' : 'transparent',
                cursor: 'pointer',
              }}>
              <span style={{ fontSize: '13px' }}>{tier.icon}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.domain}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.owner || '—'}</span>
              <span style={{ background: stat.bg, color: stat.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{stat.label}</span>
              <span style={{ background: scoreBg(p.qualityScore), color: scoreColor(p.qualityScore), padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700 }}>{p.qualityScore}%</span>
              <div style={{ opacity: hoverId === p.id ? 1 : 0, transition: 'opacity 0.1s' }}>
                <button onClick={e => { e.stopPropagation(); setEditProduct(p); setEditPForm({ name: p.name, description: p.description, domain: p.domain, owner: p.owner, status: p.status, tier: p.tier, sla: p.sla ?? '' }) }} style={{ padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '9px', cursor: 'pointer' }}>✏️</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Slide-in panel */}
      {selected && (() => {
        const p = selected
        const tier = tierStyle(p.tier)
        const stat = statusStyle(p.status)
        return (
          <>
            <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '18px' }}>{tier.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{p.domain} · {p.owner}</div>
                </div>
                <span style={{ background: stat.bg, color: stat.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{stat.label}</span>
                <span style={{ background: tier.bg, color: tier.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tier.label}</span>
                <button onClick={() => setSelected(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {p.description && (
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Description</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.description}</div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  {[
                    { label: 'Quality',   value: `${p.qualityScore}%`, color: scoreColor(p.qualityScore) },
                    { label: 'Consumers', value: String(p.consumers), color: 'var(--foreground)' },
                    { label: 'Datasets',  value: String(p.datasets),  color: 'var(--foreground)' },
                    { label: 'SLA',       value: p.sla || '—',        color: 'var(--status-ok-text)' },
                  ].map((m, i) => (
                    <div key={m.label} style={{ padding: '8px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)', textAlign: 'center' }}>
                      <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: m.color, marginTop: '2px' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)' }}>Quality Score</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: scoreColor(p.qualityScore) }}>{p.qualityScore}%</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '3px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.qualityScore}%`, background: scoreColor(p.qualityScore), borderRadius: '3px', transition: 'width 0.5s' }} />
                  </div>
                </div>
                {p.tags && p.tags.length > 0 && (
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Tags</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {p.tags.map(tag => (
                        <span key={tag} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '2px 7px', borderRadius: '4px', fontSize: '10px' }}>#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '11px' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Last Updated:</span> <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fmtDate(p.lastUpdated)}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Freshness:</span>    <span style={{ color: 'var(--status-ok-text)', fontWeight: 500 }}>{p.freshness || '—'}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Domain:</span>       <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.domain}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Owner:</span>        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.owner}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Edit modal */}
      {editProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Data Product</div>
            {[
              { label: 'Name *', key: 'name' },
              { label: 'Description', key: 'description' },
              { label: 'Owner', key: 'owner' },
              { label: 'SLA Target', key: 'sla' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{label}</label>
                <input value={(editPForm as Record<string, string>)[key]} onChange={e => setEditPForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Domain</label>
                <select value={editPForm.domain} onChange={e => setEditPForm(p => ({ ...p, domain: e.target.value }))}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                  {domains.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                <select value={editPForm.status} onChange={e => setEditPForm(p => ({ ...p, status: e.target.value as DataProduct['status'] }))}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="certified">Certified</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Tier</label>
                <select value={editPForm.tier} onChange={e => setEditPForm(p => ({ ...p, tier: e.target.value as DataProduct['tier'] }))}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditProduct(null)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={updateProduct} disabled={editPSaving || !editPForm.name}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (editPSaving || !editPForm.name) ? 'not-allowed' : 'pointer', opacity: (editPSaving || !editPForm.name) ? 0.6 : 1 }}>
                {editPSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal — unchanged from original */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>Create Data Product</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Define a new curated data product</div>
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}>✕</button>
            </div>
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={lbl}>Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer 360 Analytics" style={inp} /></div>
              <div><label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what this data product provides..." rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={lbl}>Domain *</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} style={inp}>{domains.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                <div><label style={lbl}>Owner</label>
                  <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" style={inp} /></div>
              </div>
              <div><label style={lbl}>Tier *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['gold', 'silver', 'bronze'] as const).map(t => {
                    const ts = tierStyle(t)
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, tier: t }))} style={{ flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', border: form.tier === t ? `2px solid ${ts.color}` : '1px solid var(--border)', background: form.tier === t ? ts.bg : 'var(--surface-muted)' }}>
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{ts.icon}</div>
                        <div style={{ fontSize: '11px', fontWeight: form.tier === t ? 700 : 500, color: ts.color, textTransform: 'capitalize' }}>{t}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={lbl}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DataProduct['status'] }))} style={inp}>
                    <option value="draft">Draft</option><option value="published">Published</option><option value="certified">Certified</option>
                  </select></div>
                <div><label style={lbl}>SLA Target</label>
                  <select value={form.sla} onChange={e => setForm(f => ({ ...f, sla: e.target.value }))} style={inp}>
                    <option value="99.9%">99.9%</option><option value="99.5%">99.5%</option><option value="99.0%">99.0%</option><option value="98.0%">98.0%</option>
                  </select></div>
              </div>
              <div><label style={lbl}>Tags (comma-separated)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. analytics, real-time, customer" style={inp} /></div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={createProduct} disabled={!form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? 'var(--accent)' : 'var(--surface-muted)', color: form.name.trim() ? 'var(--accent-text)' : 'var(--text-muted)' }}>+ Create Product</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
