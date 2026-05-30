'use client'
import { useState } from 'react'

interface DataProduct {
  id: string; name: string; description: string; domain: string; owner: string
  status: 'certified' | 'published' | 'draft'; tier: 'gold' | 'silver' | 'bronze'
  qualityScore: number; consumers: number; datasets: number
  sla: string; freshness: string; lastUpdated: string
  tags?: string[]
}

const INITIAL_PRODUCTS: DataProduct[] = [
  { id: 'dp1', name: 'Customer 360', description: 'Unified customer profile combining CRM, transactions, and engagement data', domain: 'Sales', owner: 'Data Platform', status: 'certified', tier: 'gold', qualityScore: 97, consumers: 24, datasets: 8, sla: '99.9%', freshness: '15m ago', lastUpdated: '2026-05-22T10:00:00Z', tags: ['customer', 'profile', 'CRM'] },
  { id: 'dp2', name: 'Revenue Analytics', description: 'Real-time revenue metrics, forecasting, and trend analysis', domain: 'Finance', owner: 'Finance Team', status: 'certified', tier: 'gold', qualityScore: 98, consumers: 18, datasets: 5, sla: '99.9%', freshness: '5m ago', lastUpdated: '2026-05-22T10:10:00Z', tags: ['revenue', 'forecast', 'metrics'] },
  { id: 'dp3', name: 'Marketing Attribution', description: 'Multi-touch attribution model with channel performance metrics', domain: 'Marketing', owner: 'Growth Team', status: 'published', tier: 'silver', qualityScore: 89, consumers: 12, datasets: 6, sla: '99.5%', freshness: '1h ago', lastUpdated: '2026-05-22T09:00:00Z', tags: ['marketing', 'attribution', 'channels'] },
  { id: 'dp4', name: 'Supply Chain Metrics', description: 'Inventory levels, lead times, and supplier performance KPIs', domain: 'Supply Chain', owner: 'Logistics', status: 'published', tier: 'silver', qualityScore: 91, consumers: 8, datasets: 7, sla: '99.5%', freshness: '30m ago', lastUpdated: '2026-05-22T09:30:00Z', tags: ['inventory', 'logistics', 'supplier'] },
  { id: 'dp5', name: 'Product Catalog', description: 'Master product data with pricing, categories, and attributes', domain: 'Engineering', owner: 'Product Team', status: 'certified', tier: 'gold', qualityScore: 99, consumers: 32, datasets: 3, sla: '99.9%', freshness: '2m ago', lastUpdated: '2026-05-22T10:13:00Z', tags: ['product', 'catalog', 'pricing'] },
  { id: 'dp6', name: 'User Behavior Analytics', description: 'Clickstream data with session analytics and conversion funnels', domain: 'Engineering', owner: 'Analytics', status: 'draft', tier: 'bronze', qualityScore: 76, consumers: 4, datasets: 4, sla: '99.0%', freshness: '3h ago', lastUpdated: '2026-05-22T07:00:00Z', tags: ['clickstream', 'behavior', 'funnel'] },
]

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

/* ── Sample datasets and lineage for detail drawer ── */
const SAMPLE_DATASETS: Record<string, { name: string; table: string; rows: number; freshness: string; quality: number }[]> = {
  dp1: [
    { name: 'CRM Contacts', table: 'dim_customers', rows: 125400, freshness: '15m', quality: 98 },
    { name: 'Transaction History', table: 'fact_transactions', rows: 2450000, freshness: '10m', quality: 96 },
    { name: 'Engagement Events', table: 'fact_engagement', rows: 890000, freshness: '30m', quality: 95 },
    { name: 'Support Tickets', table: 'fact_support', rows: 34500, freshness: '1h', quality: 99 },
    { name: 'Web Sessions', table: 'fact_web_sessions', rows: 1200000, freshness: '5m', quality: 97 },
    { name: 'Customer Segments', table: 'dim_segments', rows: 28, freshness: '24h', quality: 100 },
    { name: 'NPS Scores', table: 'fact_nps', rows: 15600, freshness: '6h', quality: 94 },
    { name: 'Churn Predictions', table: 'ml_churn_scores', rows: 125400, freshness: '12h', quality: 96 },
  ],
  dp2: [
    { name: 'Revenue Facts', table: 'fact_revenue', rows: 980000, freshness: '5m', quality: 99 },
    { name: 'Forecast Model', table: 'ml_revenue_forecast', rows: 365, freshness: '6h', quality: 97 },
    { name: 'GL Entries', table: 'fact_gl_entries', rows: 4500000, freshness: '1h', quality: 98 },
    { name: 'Cost Centers', table: 'dim_cost_centers', rows: 142, freshness: '24h', quality: 100 },
    { name: 'Exchange Rates', table: 'dim_exchange_rates', rows: 1200, freshness: '15m', quality: 99 },
  ],
  dp3: [
    { name: 'Campaign Events', table: 'fact_campaigns', rows: 560000, freshness: '30m', quality: 91 },
    { name: 'Channel Performance', table: 'agg_channel_perf', rows: 2400, freshness: '1h', quality: 88 },
    { name: 'Attribution Weights', table: 'ml_attribution', rows: 560000, freshness: '6h', quality: 85 },
    { name: 'Ad Spend', table: 'fact_ad_spend', rows: 45000, freshness: '2h', quality: 92 },
    { name: 'Conversion Funnel', table: 'agg_funnel', rows: 8400, freshness: '1h', quality: 90 },
    { name: 'UTM Tags', table: 'dim_utm', rows: 3200, freshness: '24h', quality: 87 },
  ],
  dp4: [
    { name: 'Inventory Levels', table: 'fact_inventory', rows: 34000, freshness: '15m', quality: 93 },
    { name: 'Purchase Orders', table: 'fact_purchase_orders', rows: 12800, freshness: '30m', quality: 92 },
    { name: 'Supplier Ratings', table: 'dim_suppliers', rows: 480, freshness: '24h', quality: 95 },
    { name: 'Warehouse Stock', table: 'fact_warehouse_stock', rows: 68000, freshness: '10m', quality: 90 },
    { name: 'Lead Times', table: 'agg_lead_times', rows: 2400, freshness: '6h', quality: 88 },
    { name: 'Shipping Metrics', table: 'fact_shipments', rows: 95000, freshness: '1h', quality: 91 },
    { name: 'Returns Data', table: 'fact_returns', rows: 8700, freshness: '2h', quality: 89 },
  ],
  dp5: [
    { name: 'Product Master', table: 'dim_products', rows: 8500, freshness: '2m', quality: 100 },
    { name: 'Pricing History', table: 'fact_pricing', rows: 340000, freshness: '5m', quality: 99 },
    { name: 'Categories', table: 'dim_categories', rows: 245, freshness: '24h', quality: 100 },
  ],
  dp6: [
    { name: 'Clickstream', table: 'fact_clicks', rows: 4500000, freshness: '2h', quality: 78 },
    { name: 'Session Aggregates', table: 'agg_sessions', rows: 890000, freshness: '3h', quality: 80 },
    { name: 'Conversion Events', table: 'fact_conversions', rows: 125000, freshness: '2h', quality: 74 },
    { name: 'Page Views', table: 'fact_page_views', rows: 12000000, freshness: '4h', quality: 72 },
  ],
}

const SAMPLE_CONSUMERS: Record<string, string[]> = {
  dp1: ['Sales Dashboard', 'CRM Integration', 'Customer Support Portal', 'Marketing Automation', 'Churn Prediction ML', 'Executive KPIs'],
  dp2: ['CFO Dashboard', 'Board Reports', 'Investor Relations', 'Budget Planning', 'Tax Compliance'],
  dp3: ['Marketing Dashboard', 'Campaign Manager', 'ROI Calculator', 'Growth Team Reports'],
  dp4: ['Operations Dashboard', 'Procurement System', 'Warehouse Management', 'Vendor Portal'],
  dp5: ['E-commerce Platform', 'Mobile App', 'Search Engine', 'Recommendation ML', 'Pricing Engine', 'Content Management'],
  dp6: ['Product Analytics', 'A/B Testing Platform', 'Personalization Engine'],
}

export default function DataProductsPage() {
  const [products, setProducts] = useState<DataProduct[]>(INITIAL_PRODUCTS)
  const [filter, setFilter] = useState<'all' | 'certified' | 'published' | 'draft'>('all')
  const [selectedProduct, setSelectedProduct] = useState<DataProduct | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', domain: 'Sales', owner: '',
    status: 'draft' as DataProduct['status'],
    tier: 'bronze' as DataProduct['tier'],
    sla: '99.0%', tags: '',
  })

  const filtered = products.filter(p => filter === 'all' || p.status === filter)

  const totalConsumers = products.reduce((s, p) => s + p.consumers, 0)
  const avgQuality = Math.round(products.reduce((s, p) => s + p.qualityScore, 0) / products.length)
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
          { label: 'Avg Quality Score', value: `${avgQuality}%`, color: scoreColor(avgQuality) },
          { label: 'SLA Compliance', value: '99.4%', sub: '▲ 0.2% vs last week', color: '#16a34a' },
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
                <span>SLA: {p.sla}</span>
                <span>Freshness: {p.freshness}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Detail Drawer ── */}
      {selectedProduct && (() => {
        const p = selectedProduct
        const tier = tierStyle(p.tier)
        const stat = statusStyle(p.status)
        const datasets = SAMPLE_DATASETS[p.id] || []
        const consumers = SAMPLE_CONSUMERS[p.id] || []
        const totalRows = datasets.reduce((s, d) => s + d.rows, 0)
        const avgDsQuality = datasets.length > 0 ? Math.round(datasets.reduce((s, d) => s + d.quality, 0) / datasets.length) : 0

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 300, backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedProduct(null) }}>
            <div style={{ width: '620px', background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)' }}>
              {/* Header */}
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
                {/* Description */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Description</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>{p.description}</div>
                </div>

                {/* Key Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Quality', value: `${p.qualityScore}%`, color: scoreColor(p.qualityScore), bg: scoreBg(p.qualityScore) },
                    { label: 'Consumers', value: String(p.consumers), color: '#2563eb', bg: '#dbeafe' },
                    { label: 'Datasets', value: String(p.datasets), color: '#7c3aed', bg: '#f3e8ff' },
                    { label: 'SLA', value: p.sla, color: '#16a34a', bg: '#dcfce7' },
                  ].map(m => (
                    <div key={m.label} style={{ background: m.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Quality Score Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a' }}>Overall Quality Score</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: scoreColor(p.qualityScore) }}>{p.qualityScore}%</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.qualityScore}%`, background: scoreColor(p.qualityScore), borderRadius: '4px', transition: 'width 0.5s' }} />
                  </div>
                </div>

                {/* Datasets Table */}
                {datasets.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                      Datasets ({datasets.length}) · {totalRows.toLocaleString()} total rows · Avg Quality: {avgDsQuality}%
                    </div>
                    <div style={{ borderRadius: '10px', border: '1px solid #ebe8df', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 70px 70px', gap: '6px', padding: '8px 14px', background: '#fafaf9', borderBottom: '1px solid #ebe8df' }}>
                        {['Dataset', 'Table', 'Rows', 'Fresh', 'Quality'].map(h => (
                          <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                        ))}
                      </div>
                      {datasets.map((ds, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 70px 70px', gap: '6px', padding: '8px 14px', borderBottom: i < datasets.length - 1 ? '1px solid #f8f6f0' : 'none', fontSize: '12px', alignItems: 'center' }}>
                          <div style={{ fontWeight: 500, color: '#0f172a' }}>{ds.name}</div>
                          <div><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#475569' }}>{ds.table}</code></div>
                          <div style={{ color: '#64748b' }}>{ds.rows >= 1000000 ? `${(ds.rows / 1000000).toFixed(1)}M` : ds.rows >= 1000 ? `${(ds.rows / 1000).toFixed(0)}K` : ds.rows}</div>
                          <div style={{ color: '#64748b' }}>{ds.freshness}</div>
                          <div><span style={{ background: scoreBg(ds.quality), color: scoreColor(ds.quality), padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>{ds.quality}%</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consumers */}
                {consumers.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                      Consumers ({consumers.length})
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {consumers.map(c => (
                        <span key={c} style={{ background: '#f0f9ff', color: '#2563eb', padding: '5px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 500 }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
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

                {/* Metadata footer */}
                <div style={{ background: '#fafaf9', borderRadius: '10px', padding: '14px 16px', border: '1px solid #ebe8df' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                    <div><span style={{ color: '#94a3b8' }}>Last Updated:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{fmtDate(p.lastUpdated)}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Freshness:</span> <span style={{ color: '#16a34a', fontWeight: 500 }}>{p.freshness}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Domain:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{p.domain}</span></div>
                    <div><span style={{ color: '#94a3b8' }}>Owner:</span> <span style={{ color: '#475569', fontWeight: 500 }}>{p.owner}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Create Product Modal ── */}
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
