'use client'
import { useState, useEffect } from 'react'

interface DataProduct {
  id: string; name: string; description: string; domain: string; owner: string
  status: 'certified' | 'published' | 'draft'; tier: 'gold' | 'silver' | 'bronze'
  qualityScore: number; consumers: number; datasets: number
  sla: string; freshness: string; lastUpdated: string
  tags?: string[]
}

function tierStyle(t: string) {
  if (t === 'gold') return { bg: '#fef3c7', color: '#d97706', icon: '🥇', label: 'Gold' }
  if (t === 'silver') return { bg: '#f1f5f9', color: '#64748b', icon: '🥈', label: 'Silver' }
  return { bg: '#fed7aa', color: '#c2410c', icon: '🥉', label: 'Bronze' }
}

function statusStyle(s: string) {
  if (s === 'certified') return { bg: '#dcfce7', color: '#16a34a', label: '✓ Certified' }
  if (s === 'published') return { bg: '#dbeafe', color: '#2563eb', label: '● Published' }
  return { bg: '#f1f5f9', color: '#94a3b8', label: '○ Draft' }
}

function scoreColor(s: number) { return s >= 90 ? '#16a34a' : s >= 80 ? '#ea8b3a' : '#dc2626' }
function scoreBg(s: number) { return s >= 90 ? '#dcfce7' : s >= 80 ? '#fef3c7' : '#fee2e2' }

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }
const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }

const DOMAINS = ['Sales', 'Finance', 'Marketing', 'Supply Chain', 'Engineering', 'Operations', 'HR']

export default function DataProductsPage() {
  const [products, setProducts] = useState<DataProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'certified' | 'published' | 'draft'>('all')
  const [selectedProduct, setSelectedProduct] = useState<DataProduct | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', domain: 'Sales', owner: '',
    status: 'draft' as DataProduct['status'],
    tier: 'bronze' as DataProduct['tier'],
    sla: '99.0%', tags: '',
  })

  useEffect(() => {
    fetch('/api/data-products')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: DataProduct[] = (Array.isArray(data) ? data : []).map((p, i) => ({
          id: String(p.product_id ?? p.id ?? i),
          name: String(p.product_name ?? p.name ?? ''),
          description: String(p.description ?? ''),
          domain: String(p.domain ?? ''),
          owner: String(p.owner ?? p.owner_team ?? ''),
          status: (p.status as DataProduct['status']) ?? 'draft',
          tier: (p.tier as DataProduct['tier']) ?? 'bronze',
          qualityScore: Number(p.quality_score ?? p.qualityScore ?? 0),
          consumers: Number(p.consumer_count ?? p.consumers ?? 0),
          datasets: Number(p.dataset_count ?? p.datasets ?? 0),
          sla: String(p.sla ?? p.sla_target ?? ''),
          freshness: String(p.freshness ?? ''),
          lastUpdated: String(p.last_updated ?? p.lastUpdated ?? new Date().toISOString()),
          tags: Array.isArray(p.tags) ? p.tags as string[] : [],
        }))
        setProducts(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = products.filter(p => filter === 'all' || p.status === filter)

  const totalConsumers = products.reduce((s, p) => s + p.consumers, 0)
  const avgQuality = products.length > 0 ? Math.round(products.reduce((s, p) => s + p.qualityScore, 0) / products.length) : 0
  const certifiedCount = products.filter(p => p.status === 'certified').length

  function createProduct() {
    if (!form.name.trim()) return
    const newProd: DataProduct = {
      id: `dp_${Date.now()}`,
      name: form.name,
      description: form.description,
      domain: form.domain,
      owner: form.owner || 'Unassigned',
      status: form.status,
      tier: form.tier,
      qualityScore: form.status === 'certified' ? 95 : form.status === 'published' ? 85 : 70,
      consumers: 0,
      datasets: 0,
      sla: form.sla,
      freshness: 'Just now',
      lastUpdated: new Date().toISOString(),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }
    setProducts(prev => [newProd, ...prev])
    setShowCreate(false)
    setForm({ name: '', description: '', domain: 'Sales', owner: '', status: 'draft', tier: 'bronze', sla: '99.0%', tags: '' })
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Data Products</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Data Products</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Curated, trusted datasets available as self-service data products</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background: '#E8541A', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Create Product</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Products', value: String(products.length), sub: `${certifiedCount} certified`, color: '#2563eb' },
          { label: 'Total Consumers', value: String(totalConsumers), sub: 'across all products', color: '#7c3aed' },
          { label: 'Avg Quality Score', value: products.length > 0 ? `${avgQuality}%` : '—', color: products.length > 0 ? scoreColor(avgQuality) : '#94a3b8' },
          { label: 'SLA Compliance', value: '—', sub: 'No data yet', color: '#94a3b8' },
        ].map((kpi, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>{kpi.label}</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: kpi.color, letterSpacing: '-1px' }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['all', 'certified', 'published', 'draft'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12.5px', fontWeight: 500, textTransform: 'capitalize',
            background: filter === f ? '#1a1a1a' : '#f8fafc', color: filter === f ? '#fff' : '#64748b',
          }}>
            {f} {f !== 'all' ? `(${products.filter(p => p.status === f).length})` : `(${products.length})`}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : products.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          No data products yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '14px' }}>
          {filtered.map(p => {
            const tier = tierStyle(p.tier)
            const stat = statusStyle(p.status)
            return (
              <div key={p.id} onClick={() => setSelectedProduct(p)} style={{
                ...card, padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
                border: selectedProduct?.id === p.id ? '2px solid #E8541A' : '1px solid #ebe8df',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{tier.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>{p.name}</div>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>{p.domain} · {p.owner}</div>
                    </div>
                  </div>
                  <span style={{ background: stat.bg, color: stat.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600 }}>{stat.label}</span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 14px', lineHeight: 1.5 }}>{p.description}</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{ background: scoreBg(p.qualityScore), color: scoreColor(p.qualityScore), padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>Quality: {p.qualityScore}%</span>
                  <span style={{ background: '#f0f9ff', color: '#2563eb', padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{p.consumers} consumers</span>
                  <span style={{ background: '#faf5ff', color: '#7c3aed', padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{p.datasets} datasets</span>
                </div>
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {p.tags.map(tag => (
                      <span key={tag} style={{ background: '#f8fafc', color: '#64748b', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 500 }}>#{tag}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#94a3b8' }}>
                  <span>SLA: {p.sla || '—'}</span>
                  <span>Freshness: {p.freshness || '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedProduct && (() => {
        const p = selectedProduct
        const tier = tierStyle(p.tier)
        const stat = statusStyle(p.status)

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 300, backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedProduct(null) }}>
            <div style={{ width: '620px', background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #ebe8df', background: '#fafaf9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '36px' }}>{tier.icon}</span>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a' }}>{p.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{p.domain} · {p.owner}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <span style={{ background: stat.bg, color: stat.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{stat.label}</span>
                        <span style={{ background: tier.bg, color: tier.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{tier.label} Tier</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedProduct(null)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>✕</button>
                </div>
              </div>

              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Description</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>{p.description || '—'}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Quality', value: `${p.qualityScore}%`, color: scoreColor(p.qualityScore), bg: scoreBg(p.qualityScore) },
                    { label: 'Consumers', value: String(p.consumers), color: '#2563eb', bg: '#dbeafe' },
                    { label: 'Datasets', value: String(p.datasets), color: '#7c3aed', bg: '#f3e8ff' },
                    { label: 'SLA', value: p.sla || '—', color: '#16a34a', bg: '#dcfce7' },
                  ].map(m => (
                    <div key={m.label} style={{ background: m.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>Overall Quality Score</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: scoreColor(p.qualityScore) }}>{p.qualityScore}%</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.qualityScore}%`, background: scoreColor(p.qualityScore), borderRadius: '4px', transition: 'width 0.5s' }} />
                  </div>
                </div>

                {p.tags && p.tags.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Tags</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {p.tags.map(tag => (
                        <span key={tag} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500 }}>#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: '#fafaf9', borderRadius: '10px', padding: '14px 16px', border: '1px solid #ebe8df' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                    <div><span style={{ color: '#94a3b8' }}>Last Updated:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{fmtDate(p.lastUpdated)}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Freshness:</span> <span style={{ color: '#16a34a', fontWeight: 500 }}>{p.freshness || '—'}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Domain:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{p.domain}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Owner:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{p.owner}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Create Product Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>Create Data Product</div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>Define a new curated data product</div>
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>✕</button>
            </div>

            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={lbl}>Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer 360 Analytics" style={inp} />
              </div>

              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what this data product provides..." rows={3}
                  style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Domain *</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} style={inp}>
                    {DOMAINS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Owner</label>
                  <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" style={inp} />
                </div>
              </div>

              <div>
                <label style={lbl}>Tier *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['gold', 'silver', 'bronze'] as const).map(t => {
                    const ts = tierStyle(t)
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, tier: t }))} style={{
                        flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                        border: form.tier === t ? `2px solid ${ts.color}` : '1px solid #e2e8f0',
                        background: form.tier === t ? ts.bg : '#fafaf9',
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{ts.icon}</div>
                        <div style={{ fontSize: '11px', fontWeight: form.tier === t ? 700 : 500, color: ts.color, textTransform: 'capitalize' }}>{t}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DataProduct['status'] }))} style={inp}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="certified">Certified</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>SLA Target</label>
                  <select value={form.sla} onChange={e => setForm(f => ({ ...f, sla: e.target.value }))} style={inp}>
                    <option value="99.9%">99.9%</option>
                    <option value="99.5%">99.5%</option>
                    <option value="99.0%">99.0%</option>
                    <option value="98.0%">98.0%</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Tags (comma-separated)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. analytics, real-time, customer" style={inp} />
              </div>

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={createProduct} disabled={!form.name.trim()} style={{
                  flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                  background: form.name.trim() ? '#E8541A' : '#e2e8f0',
                  color: form.name.trim() ? '#fff' : '#94a3b8',
                }}>+ Create Product</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
