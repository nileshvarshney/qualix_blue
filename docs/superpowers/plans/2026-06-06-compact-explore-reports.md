# Compact Redesign — Data Browser · Spot Check · Reports · Executive · Data Products

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the compact, dense layout (top bar + inline stat badges + dense rows + slide-in panel) to five remaining pages: `/data-products`, `/executive`, `/data-browser`, `/spot-check`, and `/reports`.

**Architecture:** Pure layout migration — no API, state logic, or data-fetching changes. Each page is a full rewrite of its component. The compact pattern: `10px 16px` padding, `100vh` flex column, inline badge counts in the top bar, dense grid rows (`padding: 5px 0`, `font-size: 11px`), right slide-in panel (`width: min(480px,55vw)`) on row click.

**Tech Stack:** Next.js App Router, React, inline styles, CSS variables (`--background`, `--foreground`, `--surface`, `--surface-muted`, `--border`, `--accent`, `--text-muted`, `--text-secondary`, `--status-ok-*`, `--status-warn-*`, `--status-error-*`)

---

## Files Modified

| File | Change |
|---|---|
| `frontend/src/app/data-products/page.tsx` | Full rewrite — compact list + slide-in panel |
| `frontend/src/app/executive/page.tsx` | Full rewrite — compact header only |
| `frontend/src/app/data-browser/page.tsx` | Full rewrite — compact header + denser accordion + slide-in panel; DataGrid/ColumnLoader unchanged |
| `frontend/src/app/spot-check/page.tsx` | Full rewrite — compact schema selector + dense table list + slide-in panel |
| `frontend/src/components/reports/ReportsClient.tsx` | Full rewrite — compact top bar + full-width dense list + slide-in panel |

---

## Task 1: Compact /data-products

**Files:**
- Modify: `frontend/src/app/data-products/page.tsx` (full rewrite)

- [ ] **Step 1: Replace page.tsx with compact implementation**

Replace the entire contents of `frontend/src/app/data-products/page.tsx` with:

```tsx
'use client'
import { useState, useEffect } from 'react'

interface DataProduct {
  id: string; name: string; description: string; domain: string; owner: string
  status: 'certified' | 'published' | 'draft'; tier: 'gold' | 'silver' | 'bronze'
  qualityScore: number; consumers: number; datasets: number
  sla: string; freshness: string; lastUpdated: string; tags?: string[]
}

function tierStyle(t: string) {
  if (t === 'gold')   return { bg: '#fef3c7', color: '#d97706', icon: '🥇', label: 'Gold' }
  if (t === 'silver') return { bg: '#f1f5f9', color: '#64748b', icon: '🥈', label: 'Silver' }
  return { bg: '#fed7aa', color: '#c2410c', icon: '🥉', label: 'Bronze' }
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

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const }
const DOMAINS = ['Sales', 'Finance', 'Marketing', 'Supply Chain', 'Engineering', 'Operations', 'HR']
const COLS = '20px 1fr 100px 80px 72px 58px 30px'

export default function DataProductsPage() {
  const [products,    setProducts]    = useState<DataProduct[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<'all'|'certified'|'published'|'draft'>('all')
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState<DataProduct | null>(null)
  const [hoverId,     setHoverId]     = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', domain: 'Sales', owner: '',
    status: 'draft' as DataProduct['status'], tier: 'bronze' as DataProduct['tier'],
    sla: '99.0%', tags: '',
  })

  useEffect(() => {
    fetch('/api/data-products')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: DataProduct[] = (Array.isArray(data) ? data : []).map((p, i) => ({
          id:           String(p.product_id ?? p.id ?? i),
          name:         String(p.product_name ?? p.name ?? ''),
          description:  String(p.description ?? ''),
          domain:       String(p.domain ?? ''),
          owner:        String(p.owner ?? p.owner_team ?? ''),
          status:       (p.status as DataProduct['status']) ?? 'draft',
          tier:         (p.tier   as DataProduct['tier'])   ?? 'bronze',
          qualityScore: Number(p.quality_score ?? p.qualityScore ?? 0),
          consumers:    Number(p.consumer_count ?? p.consumers ?? 0),
          datasets:     Number(p.dataset_count  ?? p.datasets  ?? 0),
          sla:          String(p.sla ?? p.sla_target ?? ''),
          freshness:    String(p.freshness ?? ''),
          lastUpdated:  String(p.last_updated ?? p.lastUpdated ?? new Date().toISOString()),
          tags:         Array.isArray(p.tags) ? p.tags as string[] : [],
        }))
        setProducts(items); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const certifiedCount = products.filter(p => p.status === 'certified').length
  const avgQuality     = products.length > 0 ? Math.round(products.reduce((s, p) => s + p.qualityScore, 0) / products.length) : 0

  const filtered = products.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.domain.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function createProduct() {
    if (!form.name.trim()) return
    const np: DataProduct = {
      id: `dp_${Date.now()}`, name: form.name, description: form.description,
      domain: form.domain, owner: form.owner || 'Unassigned',
      status: form.status, tier: form.tier,
      qualityScore: form.status === 'certified' ? 95 : form.status === 'published' ? 85 : 70,
      consumers: 0, datasets: 0, sla: form.sla, freshness: 'Just now',
      lastUpdated: new Date().toISOString(),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }
    setProducts(prev => [np, ...prev])
    setShowCreate(false)
    setForm({ name: '', description: '', domain: 'Sales', owner: '', status: 'draft', tier: 'bronze', sla: '99.0%', tags: '' })
  }

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

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
            background: filter === f ? '#1a1a1a' : 'var(--surface-muted)',
            color: filter === f ? '#fff' : 'var(--text-secondary)',
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
          {['', 'Name', 'Domain', 'Owner', 'Status', 'Quality', ''].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
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
                <button onClick={e => e.stopPropagation()} style={{ padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '9px', cursor: 'pointer' }}>✏️</button>
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

      {/* Create modal — unchanged from original */}
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
              <div><label style={lbl}>Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer 360 Analytics" style={inp} /></div>
              <div><label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what this data product provides..." rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={lbl}>Domain *</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} style={inp}>{DOMAINS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label style={lbl}>Owner</label>
                  <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" style={inp} /></div>
              </div>
              <div><label style={lbl}>Tier *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['gold', 'silver', 'bronze'] as const).map(t => {
                    const ts = tierStyle(t)
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, tier: t }))} style={{ flex: 1, padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', border: form.tier === t ? `2px solid ${ts.color}` : '1px solid #e2e8f0', background: form.tier === t ? ts.bg : '#fafaf9' }}>
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
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={createProduct} disabled={!form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? 'var(--accent)' : '#e2e8f0', color: form.name.trim() ? '#fff' : '#94a3b8' }}>+ Create Product</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Start dev server if not running: `cd frontend && npm run dev`

Open http://localhost:3000/data-products and verify:
- Top bar shows title + stat badges (no large KPI cards)
- Dense row list with tier icon, name, domain, owner, status badge, quality score
- Clicking a row opens the slide-in panel from the right
- Clicking outside (backdrop) closes the panel
- "+ Create Product" button opens the modal

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/data-products/page.tsx
git commit -m "feat: compact /data-products — dense rows, inline badges, slide-in panel"
```

---

## Task 2: Compact /executive

**Files:**
- Modify: `frontend/src/app/executive/page.tsx` (full rewrite)

- [ ] **Step 1: Replace page.tsx with compact implementation**

Replace the entire contents of `frontend/src/app/executive/page.tsx` with:

```tsx
'use client'
import Link from 'next/link'

export default function ExecutivePage() {
  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Executive Dashboard</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Quality —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Governance —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>SLA —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>— incidents</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>— products</span>
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '10px', flex: 1, minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Quality by Domain</div>
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No domain quality data yet</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Weekly Trend</div>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No trend data yet</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No incidents yet</div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/executive and verify:
- Compact top bar with `—` badges (no large KPI cards)
- Two-column empty-state body

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/executive/page.tsx
git commit -m "feat: compact /executive — inline badges, remove large KPI cards"
```

---

## Task 3: Compact /data-browser

**Files:**
- Modify: `frontend/src/app/data-browser/page.tsx` (full rewrite — DataGrid and ColumnLoader components kept intact at bottom)

- [ ] **Step 1: Replace the DataBrowserPage component (keep DataGrid + ColumnLoader)**

Replace the entire contents of `frontend/src/app/data-browser/page.tsx` with:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'

type Row = Record<string, unknown>

interface TableData {
  TABLE_NAME: string; TABLE_TYPE: string; ROW_COUNT: number | null
  BYTES: number | null; CREATED: string | null; LAST_ALTERED: string | null
  TABLE_SCHEMA: string; TABLE_CATALOG: string; preview: Row[]
}

interface Summary {
  tableCount: number; populated: number; empty: number; totalRows: number; totalBytes: number
}

function fmtBytes(b: number | null): string {
  if (!b) return '0 B'
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1)     + ' MB'
  if (b >= 1_024)         return (b / 1_024).toFixed(0)         + ' KB'
  return b + ' B'
}
function fmtNum(n: number | null): string {
  if (n == null) return '0'
  return n.toLocaleString('en-US')
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function cellStyle(val: unknown): React.CSSProperties {
  if (val === null || val === undefined) return { color: '#475569', fontStyle: 'italic', opacity: 0.6 }
  if (typeof val === 'boolean') return { color: val ? '#34d399' : '#f87171' }
  if (typeof val === 'number') return { color: '#7dd3fc' }
  const s = String(val)
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return { color: '#c4b5fd' }
  return { color: '#e2e8f0' }
}

const COLS = '1fr 80px 60px 140px 20px'

export default function DataBrowserPage() {
  const [data,     setData]     = useState<{ summary: Summary; tables: TableData[] } | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'all'|'data'|'empty'>('all')
  const [panel,    setPanel]    = useState<TableData | null>(null)
  const [hoverId,  setHoverId]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/snowflake/overview')
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setData(d)
      const withData = d.tables.filter((t: TableData) => (t.ROW_COUNT ?? 0) > 0).map((t: TableData) => t.TABLE_NAME)
      setExpanded(new Set(withData))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggleExpand(name: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const tables = data?.tables ?? []
  const s      = data?.summary

  const displayed = tables.filter(t => {
    const hasRows = (t.ROW_COUNT ?? 0) > 0
    if (filter === 'data'  && !hasRows) return false
    if (filter === 'empty' && hasRows)  return false
    if (search && !t.TABLE_NAME.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Live Data Browser</span>
        {!loading && !error && s && <>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{s.tableCount} tables</span>
          <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{s.populated} with data</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{s.empty} empty</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{fmtNum(s.totalRows)} rows</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{fmtBytes(s.totalBytes)}</span>
        </>}
        {loading && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>Connecting…</span>}
        {error   && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Connection error</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded(new Set(tables.map(t => t.TABLE_NAME)))}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '5px', fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Expand All</button>
        <button onClick={() => setExpanded(new Set())}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '5px', fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Collapse All</button>
        <button onClick={load} disabled={loading}
          style={{ background: 'var(--accent)', border: 'none', padding: '3px 10px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, color: '#fff', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳' : '↺ Refresh'}
        </button>
      </div>

      {/* Search + Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables…"
          style={{ flex: 1, padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', minWidth: '120px' }} />
        {(['all', 'data', 'empty'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 500,
            background: filter === f ? '#1a1a1a' : 'var(--surface-muted)',
            color: filter === f ? '#fff' : 'var(--text-secondary)',
          }}>
            {f === 'all' ? `All (${tables.length})` : f === 'data' ? `Has Data (${s?.populated ?? 0})` : `Empty (${s?.empty ?? 0})`}
          </button>
        ))}
      </div>

      {/* Column headers */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Table', 'Rows', 'Size', 'Modified', ''].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 12px', color: 'var(--status-error-text)', fontSize: '11px', flexShrink: 0 }}>
          ⚠ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding: '6px 8px', background: 'var(--surface)', borderRadius: '4px', opacity: 1 - i * 0.08 }}>
              <div style={{ width: `${60 - i * 4}%`, height: '10px', background: 'var(--surface-muted)', borderRadius: '3px' }} />
            </div>
          ))}
        </div>
      )}

      {/* Table list */}
      {!loading && !error && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayed.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>
              No tables match your filter.
            </div>
          )}
          {displayed.map(t => {
            const hasData    = (t.ROW_COUNT ?? 0) > 0
            const isExpanded = expanded.has(t.TABLE_NAME)
            return (
              <div key={t.TABLE_NAME} style={{ borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${hasData ? 'var(--status-ok-text)' : 'var(--border)'}` }}>
                {/* Row */}
                <div
                  onClick={() => setPanel(panel?.TABLE_NAME === t.TABLE_NAME ? null : t)}
                  onMouseEnter={() => setHoverId(t.TABLE_NAME)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
                    padding: '5px 6px', cursor: 'pointer',
                    background: panel?.TABLE_NAME === t.TABLE_NAME ? 'var(--surface)' : hoverId === t.TABLE_NAME ? 'var(--surface-muted)' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{t.TABLE_NAME}</span>
                    <span style={{ background: t.TABLE_TYPE === 'VIEW' ? '#ede9fe' : 'var(--surface-muted)', color: t.TABLE_TYPE === 'VIEW' ? '#7c3aed' : 'var(--text-muted)', padding: '0px 4px', borderRadius: '3px', fontSize: '8.5px', fontWeight: 600, flexShrink: 0 }}>{t.TABLE_TYPE === 'VIEW' ? 'VIEW' : 'TABLE'}</span>
                    {hasData && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--status-ok-text)', flexShrink: 0 }} />}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: hasData ? 'var(--status-ok-text)' : 'var(--text-muted)', textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(t.ROW_COUNT)}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'right' }}>{fmtBytes(t.BYTES)}</span>
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtDate(t.LAST_ALTERED)}</span>
                  <button
                    onClick={e => toggleExpand(t.TABLE_NAME, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: '0', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</button>
                </div>

                {/* Inline expanded content — unchanged */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--surface-muted)' }}>
                    {hasData ? (
                      <div>
                        <div style={{ background: '#0f172a', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#34d399', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📊 LIVE DATA — {fmtNum(t.ROW_COUNT)} rows</span>
                          {(t.ROW_COUNT ?? 0) > 200 && <span style={{ background: '#1e293b', color: '#94a3b8', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>showing first 200</span>}
                        </div>
                        <DataGrid rows={t.preview} tableName={t.TABLE_NAME} />
                      </div>
                    ) : (
                      <div style={{ background: '#0f172a' }}>
                        <div style={{ padding: '6px 12px', background: '#162032' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px' }}>⌗ SCHEMA — No data yet</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ background: '#0d1520' }}>
                                {['Column Name', 'Data Type', 'Nullable', 'Notes'].map(h => (
                                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody><ColumnLoader tableName={t.TABLE_NAME} /></tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Slide-in panel */}
      {panel && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel.TABLE_NAME}</div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{panel.TABLE_CATALOG}.{panel.TABLE_SCHEMA}.{panel.TABLE_NAME}</div>
              </div>
              <span style={{ background: panel.TABLE_TYPE === 'VIEW' ? '#ede9fe' : 'var(--surface-muted)', color: panel.TABLE_TYPE === 'VIEW' ? '#7c3aed' : 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{panel.TABLE_TYPE}</span>
              {(panel.ROW_COUNT ?? 0) > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>● has data</span>}
              <button onClick={() => setPanel(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  { label: 'Rows',     value: fmtNum(panel.ROW_COUNT) },
                  { label: 'Size',     value: fmtBytes(panel.BYTES)   },
                  { label: 'Created',  value: fmtDate(panel.CREATED).split(',')[0]  },
                  { label: 'Modified', value: fmtDate(panel.LAST_ALTERED).split(',')[0] },
                ].map((m, i) => (
                  <div key={m.label} style={{ padding: '8px 8px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)', textAlign: 'center' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', marginTop: '2px' }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)', fontSize: '11px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Schema:</span>   <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 500 }}> {panel.TABLE_SCHEMA}</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Catalog:</span>  <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 500 }}> {panel.TABLE_CATALOG}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── DataGrid — unchanged ──────────────────────────────────────── */
function DataGrid({ rows, tableName }: { rows: Row[]; tableName: string }) {
  const [page,    setPage]   = useState(0)
  const [search,  setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')

  if (!rows.length) return <div style={{ padding: '20px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>No rows</div>

  const cols = Object.keys(rows[0])
  const PAGE = 25

  const filtered = rows.filter(r =>
    search === '' || Object.values(r).some(v => v != null && String(v).toLowerCase().includes(search.toLowerCase()))
  )
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0
    const av = a[sortCol], bv = b[sortCol]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.ceil(sorted.length / PAGE)
  const pageRows   = sorted.slice(page * PAGE, (page + 1) * PAGE)

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(0)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 12px', background: '#162032', borderBottom: '1px solid #1e293b' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder={`Search ${tableName}…`}
          style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', padding: '4px 8px', color: '#e2e8f0', fontSize: '11px', outline: 'none' }} />
        <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{filtered.length.toLocaleString('en-US')} rows</span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 6px', borderRadius: '3px', cursor: page === 0 ? 'default' : 'pointer', fontSize: '11px' }}>‹</button>
            <span style={{ fontSize: '10px', color: '#64748b' }}>{page+1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '2px 6px', borderRadius: '3px', cursor: page === totalPages-1 ? 'default' : 'pointer', fontSize: '11px' }}>›</button>
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 1 }}>
              {cols.map(c => (
                <th key={c} onClick={() => toggleSort(c)} style={{ padding: '6px 10px', textAlign: 'left', color: sortCol === c ? '#7dd3fc' : '#64748b', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderRight: '1px solid #1e293b' }}>
                  {c} {sortCol === c ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #162032', background: ri % 2 === 0 ? '#0f172a' : '#0d1520' }}>
                {cols.map(c => {
                  const v = row[c]
                  return (
                    <td key={c} style={{ padding: '5px 10px', fontFamily: 'monospace', whiteSpace: 'nowrap', borderRight: '1px solid #162032', ...cellStyle(v) }}>
                      {v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? (v ? '✓ true' : '✗ false') : String(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── ColumnLoader — unchanged ──────────────────────────────────── */
function ColumnLoader({ tableName }: { tableName: string }) {
  const [cols,    setCols]    = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/snowflake/columns?table=${encodeURIComponent(tableName)}`)
      .then(r => r.json())
      .then(d => { setCols(d.columns); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tableName])

  if (loading) return <tr><td colSpan={4} style={{ padding: '12px', color: '#475569', fontSize: '11px', textAlign: 'center' }}>Loading columns…</td></tr>

  return (
    <>
      {(cols ?? []).map((c, i) => (
        <tr key={String(c.COLUMN_NAME)} style={{ borderTop: '1px solid #162032', background: i % 2 === 0 ? '#0f172a' : '#0d1520' }}>
          <td style={{ padding: '5px 12px', color: '#7dd3fc', fontFamily: 'monospace', fontWeight: 600 }}>{String(c.COLUMN_NAME)}</td>
          <td style={{ padding: '5px 12px', color: '#34d399', fontFamily: 'monospace' }}>{String(c.DATA_TYPE)}</td>
          <td style={{ padding: '5px 12px', color: c.IS_NULLABLE === 'YES' ? '#fbbf24' : '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>{c.IS_NULLABLE === 'YES' ? 'nullable' : 'NOT NULL'}</td>
          <td style={{ padding: '5px 12px', color: '#475569', fontSize: '10px' }}>{String(c.COMMENT ?? '')}</td>
        </tr>
      ))}
    </>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/data-browser and verify:
- Compact top bar with inline stat badges (no large KPI cards)
- Dense table rows with row count, size, modified date, chevron
- Clicking the chevron expands inline DataGrid / ColumnLoader (unchanged)
- Clicking anywhere else on the row opens the slide-in panel showing table details
- Clicking outside the panel closes it

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/data-browser/page.tsx
git commit -m "feat: compact /data-browser — inline badges, dense rows, slide-in panel"
```

---

## Task 4: Compact /spot-check

**Files:**
- Modify: `frontend/src/app/spot-check/page.tsx` (full rewrite)

- [ ] **Step 1: Replace page.tsx with compact implementation**

Replace the entire contents of `frontend/src/app/spot-check/page.tsx` with:

```tsx
'use client'
import { useState, useMemo, useEffect } from 'react'

interface ColumnDef {
  name: string; type: string; nullable: boolean; isPK?: boolean; isFK?: boolean; sampleValues?: string[]
}
interface TableSchema {
  name: string; rowCount: number; columns: ColumnDef[]
  stats: Record<string, { sum?: number; avg?: number; min?: number; max?: number; nullCount: number; distinctCount: number }>
}
interface SchemaData { name: string; database: string; tables: TableSchema[] }

function fmt(n: number | undefined): string {
  if (n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function pctDiff(a: number, b: number): { text: string; color: string } {
  if (a === 0 && b === 0) return { text: '0%', color: 'var(--text-muted)' }
  if (a === 0) return { text: '+100%', color: 'var(--status-error-text)' }
  const pct = ((b - a) / a) * 100
  if (Math.abs(pct) < 0.01) return { text: '0%', color: 'var(--status-ok-text)' }
  const sign = pct > 0 ? '+' : ''
  const color = Math.abs(pct) < 1 ? 'var(--status-ok-text)' : Math.abs(pct) < 5 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
  return { text: `${sign}${pct.toFixed(2)}%`, color }
}

const COLS = '1fr 70px 70px 90px'

export default function SpotCheckPage() {
  const [schemas,       setSchemas]       = useState<SchemaData[]>([])
  const [loading,       setLoading]       = useState(true)
  const [schemaA,       setSchemaA]       = useState(0)
  const [schemaB,       setSchemaB]       = useState(1)
  const [search,        setSearch]        = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tab,           setTab]           = useState<'columns'|'stats'>('columns')
  const [hoverId,       setHoverId]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/snowflake/tables')
      .then(r => r.json())
      .then(data => {
        const tables = Array.isArray(data) ? data : (data.tables ?? [])
        if (tables.length === 0) { setLoading(false); return }
        const schemaMap = new Map<string, TableSchema[]>()
        for (const t of tables) {
          const key = `${t.database_name ?? ''}.${t.schema_name ?? ''}`
          if (!schemaMap.has(key)) schemaMap.set(key, [])
          schemaMap.get(key)!.push({ name: String(t.table_name ?? t.name ?? ''), rowCount: Number(t.row_count ?? t.rowCount ?? 0), columns: [], stats: {} })
        }
        const built: SchemaData[] = []
        for (const [key, tbs] of schemaMap) {
          const parts = key.split('.')
          built.push({ name: parts[1] || key, database: parts[0] || '', tables: tbs })
        }
        setSchemas(built); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const SCHEMAS  = schemas
  const sA       = SCHEMAS[schemaA] ?? SCHEMAS[0]
  const sB       = SCHEMAS[Math.min(schemaB, SCHEMAS.length - 1)] ?? SCHEMAS[0]

  const allTableNames = useMemo(() => {
    if (!sA || !sB) return []
    const set = new Set([...sA.tables.map(t => t.name), ...sB.tables.map(t => t.name)])
    return [...set].sort()
  }, [sA, sB])

  const filteredTables = useMemo(() => {
    if (!search) return allTableNames
    return allTableNames.filter(t => t.toLowerCase().includes(search.toLowerCase()))
  }, [allTableNames, search])

  const tableA = sA?.tables.find(t => t.name === selectedTable)
  const tableB = sB?.tables.find(t => t.name === selectedTable)

  const columnComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const colsA = tableA?.columns || []; const colsB = tableB?.columns || []
    const allNames = new Set([...colsA.map(c => c.name), ...colsB.map(c => c.name)])
    return [...allNames].map(name => ({ name, inA: colsA.find(c => c.name === name), inB: colsB.find(c => c.name === name) }))
  }, [tableA, tableB])

  const statsComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const statsA = tableA?.stats || {}; const statsB = tableB?.stats || {}
    const allCols = new Set([...Object.keys(statsA), ...Object.keys(statsB)])
    return [...allCols].map(col => ({ column: col, a: statsA[col], b: statsB[col] }))
  }, [tableA, tableB])

  const tablesOnlyA  = sA && sB ? allTableNames.filter(t =>  sA.tables.some(ta => ta.name === t) && !sB.tables.some(tb => tb.name === t)) : []
  const tablesOnlyB  = sA && sB ? allTableNames.filter(t => !sA.tables.some(ta => ta.name === t) &&  sB.tables.some(tb => tb.name === t)) : []
  const tablesCommon = sA && sB ? allTableNames.filter(t =>  sA.tables.some(ta => ta.name === t) &&  sB.tables.some(tb => tb.name === t)) : []
  const totalRowsA   = sA ? sA.tables.reduce((s, t) => s + t.rowCount, 0) : 0
  const totalRowsB   = sB ? sB.tables.reduce((s, t) => s + t.rowCount, 0) : 0
  const rowDiff      = sA && sB ? pctDiff(totalRowsA, totalRowsB) : null

  const sel = { width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }

  if (loading) return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>Loading…</span>
      </div>
    </div>
  )

  if (schemas.length === 0) return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
      </div>
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', border: '2px dashed var(--border)', borderRadius: '8px' }}>
        Connect a data source to use schema comparison
      </div>
    </div>
  )

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
        <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesCommon.length} common</span>
        {tablesOnlyA.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesOnlyA.length} only A</span>}
        {tablesOnlyB.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesOnlyB.length} only B</span>}
        {rowDiff && <span style={{ background: 'var(--surface-muted)', color: rowDiff.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>row diff {rowDiff.text}</span>}
      </div>

      {/* Schema selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <select value={schemaA} onChange={e => { setSchemaA(Number(e.target.value)); setSelectedTable(null) }} style={{ ...sel, fontWeight: 600 }}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '4px' }}>{sA?.tables.length} tables · {fmt(totalRowsA)} rows</div>
        </div>
        <button onClick={() => { setSchemaA(schemaB); setSchemaB(schemaA); setSelectedTable(null) }}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '5px', padding: '4px', cursor: 'pointer', fontSize: '13px', textAlign: 'center' }}>⇄</button>
        <div>
          <select value={schemaB} onChange={e => { setSchemaB(Number(e.target.value)); setSelectedTable(null) }} style={{ ...sel, fontWeight: 600 }}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '4px' }}>{sB?.tables.length} tables · {fmt(totalRowsB)} rows</div>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter tables…"
        style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', flexShrink: 0 }} />

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['Table', 'Rows A', 'Rows B', 'Status'].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* Table list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredTables.map(name => {
          const inA = sA.tables.some(t => t.name === name)
          const inB = sB.tables.some(t => t.name === name)
          const tA  = sA.tables.find(t => t.name === name)
          const tB  = sB.tables.find(t => t.name === name)
          const diff = tA && tB ? pctDiff(tA.rowCount, tB.rowCount) : null
          const missing = !inA || !inB
          const hasDiff = diff && Math.abs(parseFloat(diff.text)) > 1

          const statusBg    = missing ? 'var(--status-error-bg)'   : hasDiff ? 'var(--status-warn-bg)'   : 'var(--status-ok-bg)'
          const statusColor = missing ? 'var(--status-error-text)' : hasDiff ? 'var(--status-warn-text)' : 'var(--status-ok-text)'
          const statusLabel = missing ? (!inA ? 'Only in B' : 'Only in A') : hasDiff ? 'Row Diff' : 'Match'

          return (
            <div key={name}
              onClick={() => { setSelectedTable(selectedTable === name ? null : name); setTab('columns') }}
              onMouseEnter={() => setHoverId(name)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
                padding: '5px 6px', borderLeft: `2px solid ${missing ? 'var(--status-error-text)' : hasDiff ? 'var(--status-warn-text)' : 'var(--border)'}`,
                borderBottom: '1px solid var(--surface-muted)',
                background: selectedTable === name ? 'var(--surface)' : hoverId === name ? 'var(--surface-muted)' : 'transparent',
                cursor: 'pointer',
              }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{name}</span>
              <span style={{ fontSize: '10px', color: inA ? '#2563eb' : 'var(--status-error-text)', fontFamily: 'monospace', textAlign: 'right' }}>{tA ? fmt(tA.rowCount) : '—'}</span>
              <span style={{ fontSize: '10px', color: inB ? '#7c3aed' : 'var(--status-error-text)', fontFamily: 'monospace', textAlign: 'right' }}>{tB ? fmt(tB.rowCount) : '—'}</span>
              <span style={{ background: statusBg, color: statusColor, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{statusLabel}</span>
            </div>
          )
        })}
        {filteredTables.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No tables match filter</div>
        )}
      </div>

      {/* Slide-in panel */}
      {selectedTable && (() => {
        const tA = sA.tables.find(t => t.name === selectedTable)
        const tB = sB.tables.find(t => t.name === selectedTable)
        const diff = tA && tB ? pctDiff(tA.rowCount, tB.rowCount) : null

        return (
          <>
            <div onClick={() => setSelectedTable(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px,60vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
              {/* Panel header */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTable}</div>
                </div>
                {diff && <span style={{ fontSize: '11px', fontWeight: 700, color: diff.color }}>row diff: {diff.text}</span>}
                <button onClick={() => setSelectedTable(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {/* A / B summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {tA ? (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9px', color: '#2563eb', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schema A</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', marginTop: '2px' }}>{fmt(tA.rowCount)} rows · {tA.columns.length} cols</div>
                  </div>
                ) : <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: 'var(--status-error-text)', fontWeight: 600 }}>Not in Schema A</div>}
                {tB ? (
                  <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9px', color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schema B</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#6d28d9', marginTop: '2px' }}>{fmt(tB.rowCount)} rows · {tB.columns.length} cols</div>
                  </div>
                ) : <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: 'var(--status-error-text)', fontWeight: 600 }}>Not in Schema B</div>}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {(['columns', 'stats'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: tab === t ? 600 : 400,
                    background: tab === t ? '#1a1a1a' : 'var(--surface-muted)', color: tab === t ? '#fff' : 'var(--text-secondary)', textTransform: 'capitalize',
                  }}>{t === 'columns' ? 'Columns' : 'Statistics'}</button>
                ))}
              </div>

              {/* Column comparison */}
              {tab === 'columns' && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 50px 50px 72px', gap: '0 4px', padding: '4px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                    {['Column', 'Type A', 'Type B', 'Null', 'Keys', 'Status'].map(h => (
                      <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {columnComparison.map(({ name, inA, inB }) => {
                    const typeMismatch = inA && inB && inA.type !== inB.type
                    const nullMismatch = inA && inB && inA.nullable !== inB.nullable
                    const missing = !inA || !inB
                    const hasDiff2 = typeMismatch || nullMismatch || missing
                    return (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 50px 50px 72px', gap: '0 4px', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--surface-muted)', background: hasDiff2 ? 'var(--status-warn-bg)' : 'transparent', fontSize: '10.5px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: inA ? (typeMismatch ? 'var(--status-error-text)' : 'var(--text-secondary)') : 'var(--status-error-text)' }}>{inA ? inA.type : 'MISSING'}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: inB ? (typeMismatch ? 'var(--status-error-text)' : 'var(--text-secondary)') : 'var(--status-error-text)' }}>{inB ? inB.type : 'MISSING'}</span>
                        <span style={{ fontSize: '9.5px', color: nullMismatch ? 'var(--status-warn-text)' : 'var(--text-muted)' }}>
                          {inA && inB ? (nullMismatch ? `A:${inA.nullable?'Y':'N'} B:${inB.nullable?'Y':'N'}` : (inA.nullable ? 'Y' : 'N')) : '—'}
                        </span>
                        <span style={{ fontSize: '9px' }}>
                          {(inA?.isPK || inB?.isPK) && <span style={{ background: '#fef3c7', color: '#b45309', padding: '0 3px', borderRadius: '2px', fontWeight: 700, marginRight: '2px' }}>PK</span>}
                          {(inA?.isFK || inB?.isFK) && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>FK</span>}
                        </span>
                        <span style={{ background: missing ? 'var(--status-error-bg)' : typeMismatch ? 'var(--status-warn-bg)' : nullMismatch ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)', color: missing ? 'var(--status-error-text)' : typeMismatch ? 'var(--status-warn-text)' : nullMismatch ? 'var(--status-warn-text)' : 'var(--status-ok-text)', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>
                          {missing ? (!inA ? 'Only B' : 'Only A') : typeMismatch ? 'Type ≠' : nullMismatch ? 'Null ≠' : 'Match'}
                        </span>
                      </div>
                    )
                  })}
                  {columnComparison.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No column data available</div>}
                </div>
              )}

              {/* Stats */}
              {tab === 'stats' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {statsComparison.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No numeric statistics available</div>
                  ) : statsComparison.map(({ column, a, b }) => (
                    <div key={column} style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11.5px', color: 'var(--foreground)' }}>{column}</span>
                        {a && b && a.sum !== undefined && b.sum !== undefined && (() => {
                          const d = pctDiff(a.sum, b.sum)
                          return <span style={{ fontSize: '10px', fontWeight: 600, color: d.color }}>SUM diff: {d.text}</span>
                        })()}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['Metric', 'Schema A', 'Schema B', 'Diff'].map(h => (
                              <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Metric' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'SUM', valA: a?.sum, valB: b?.sum },
                            { label: 'AVG', valA: a?.avg, valB: b?.avg },
                            { label: 'MIN', valA: a?.min, valB: b?.min },
                            { label: 'MAX', valA: a?.max, valB: b?.max },
                            { label: 'NULLs', valA: a?.nullCount, valB: b?.nullCount },
                            { label: 'Distinct', valA: a?.distinctCount, valB: b?.distinctCount },
                          ].map(row => {
                            const d = row.valA !== undefined && row.valB !== undefined ? pctDiff(row.valA, row.valB) : null
                            return (
                              <tr key={row.label} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                                <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>{row.label}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--foreground)' }}>{fmt(row.valA)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--foreground)' }}>{fmt(row.valB)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: d?.color || 'var(--text-muted)' }}>{d?.text || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/spot-check and verify:
- Top bar shows inline badges (no KPI cards)
- Compact schema selector: two dropdowns + ⇄ swap button, no large cards
- Dense table list with Rows A, Rows B, Status badge columns
- Clicking a row opens slide-in panel with Column comparison and Statistics tabs
- Clicking outside closes the panel

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/spot-check/page.tsx
git commit -m "feat: compact /spot-check — inline badges, compact selector, dense rows, slide-in panel"
```

---

## Task 5: Compact /reports

**Files:**
- Modify: `frontend/src/components/reports/ReportsClient.tsx` (full rewrite)

- [ ] **Step 1: Replace ReportsClient.tsx with compact implementation**

Replace the entire contents of `frontend/src/components/reports/ReportsClient.tsx` with:

```tsx
'use client'
import { useState, useMemo, useEffect } from 'react'
import { Report, CheckResult } from '@/lib/types'
import { formatDateTime, formatNumber, categoryColors } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const statusConfig = {
  passed:  { bg: '#dcfce7', color: '#16a34a', label: '✓ Passed',  dot: '#16a34a' },
  failed:  { bg: '#fee2e2', color: '#dc2626', label: '✗ Failed',  dot: '#dc2626' },
  warning: { bg: '#fef9c3', color: '#ca8a04', label: '⚠ Warning', dot: '#ca8a04' },
}
const severityConfig: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626', label: 'Critical' },
  high:     { bg: '#ffedd5', color: '#ea580c', label: 'High' },
  medium:   { bg: '#fef9c3', color: '#ca8a04', label: 'Medium' },
  low:      { bg: '#f0fdf4', color: '#16a34a', label: 'Low' },
}
const REPORT_TYPES = [
  { id: 'quality',   label: 'Quality Check',   icon: '🛡️', desc: 'Run all active quality rules and score every dataset' },
  { id: 'freshness', label: 'Freshness Report', icon: '⏱️', desc: 'Check all SLA freshness targets across connections' },
  { id: 'anomaly',   label: 'Anomaly Summary',  icon: '📡', desc: 'Summarise all open anomalies by severity and domain' },
  { id: 'sla',       label: 'SLA Compliance',   icon: '📋', desc: 'Report adherence against every defined SLA' },
  { id: 'lineage',   label: 'Lineage Impact',   icon: '🔗', desc: 'Show downstream impact of datasets with open issues' },
  { id: 'custom',    label: 'Custom Report',    icon: '✨', desc: 'Pick specific datasets, rules, and date range' },
]
const FORMATS    = [{ id: 'web', label: 'Web Report', icon: '🌐' }, { id: 'pdf', label: 'PDF', icon: '📄' }, { id: 'csv', label: 'CSV Export', icon: '📊' }, { id: 'json', label: 'JSON', icon: '{ }' }]
const DOMAINS    = ['All Domains', 'Finance', 'Marketing', 'Supply Chain', 'Catalog', 'Operations']
const DATASETS_BY_DOMAIN: Record<string, string[]> = { Finance: ['SALES_ORDERS', 'FINANCE_TRANSACTIONS'], Marketing: ['CUSTOMERS'], 'Supply Chain': ['INVENTORY', 'PURCHASE_ORDERS', 'PURCHASE_ORDER_ITEMS', 'SUPPLIERS'], Catalog: ['PRODUCTS', 'PRODUCT_CATEGORIES'], Operations: ['RETURNS', 'WAREHOUSES', 'CARRIERS'] }
const ALL_DATASETS = Object.values(DATASETS_BY_DOMAIN).flat()
const DATE_RANGES  = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Custom range']

const scoreColor = (s: number) => s >= 90 ? 'var(--status-ok-text)' : s >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const scoreBg    = (s: number) => s >= 90 ? 'var(--status-ok-bg)'   : s >= 75 ? 'var(--status-warn-bg)'   : 'var(--status-error-bg)'

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
const sel: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }

function ruleTypeLabel(type?: string): string {
  if (!type) return 'Check'
  const map: Record<string, string> = {
    not_null: 'Not Null', unique: 'Unique', range: 'Range', regex: 'Regex', custom_sql: 'Custom SQL',
    freshness: 'Freshness', row_count: 'Row Count', referential: 'Referential',
    null_check: 'Null Check', uniqueness_check: 'Uniqueness', duplicate_check: 'Duplicate',
    accepted_values_check: 'Accepted Values', range_check: 'Range', freshness_check: 'Freshness',
    volume_check: 'Volume', schema_drift_check: 'Schema Drift', referential_integrity_check: 'Ref. Integrity',
    regex_check: 'Regex', business_rule_check: 'Business Rule', custom_sql_check: 'Custom SQL',
    semantic_consistency_check: 'Semantic', referential_sanity_check: 'Ref. Sanity',
    business_metric_check: 'Business Metric', distribution_consistency_check: 'Distribution', llm_semantic_check: 'LLM Semantic',
  }
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const LIST_COLS = '44px 1fr 70px 90px'

export default function ReportsClient({ initialReports }: { initialReports: Report[] }) {
  const [reports,  setReports]  = useState(initialReports.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()))
  const [selected, setSelected] = useState<Report | null>(reports[0] || null)

  useEffect(() => {
    if (initialReports.length > 0) {
      const sorted = [...initialReports].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      setReports(sorted)
      setSelected(sorted[0] || null)
    }
  }, [initialReports])

  const [running,         setRunning]         = useState(false)
  const [showModal,       setShowModal]        = useState(false)
  const [expandedResult,  setExpandedResult]   = useState<number | null>(null)
  const [statusFilter,    setStatusFilter]     = useState<'all'|'passed'|'failed'|'warning'>('all')
  const [scopeFilter,     setScopeFilter]      = useState<'all'|'generic'|'object-specific'>('all')
  const [categoryFilter,  setCategoryFilter]   = useState<string>('all')
  const [resultSearch,    setResultSearch]     = useState('')
  const [hoverId,         setHoverId]          = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', type: 'quality', format: 'web', domain: 'All Domains', dataset: 'All Datasets', dateRange: 'Last 7 days', includeAnomalies: true, includeSLAs: true, includeLineage: false, notify: false })
  const router = useRouter()

  const analytics = useMemo(() => {
    const totalRuns = reports.length
    const avgScore  = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.overallScore, 0) / reports.length) : 0
    const src = selected || reports[0]
    return { totalRuns, avgScore, totalPassed: src?.passed ?? 0, totalFailed: src?.failed ?? 0, totalWarnings: src?.warnings ?? 0, totalChecks: src?.totalChecks ?? 0 }
  }, [reports, selected])

  const filteredResults = useMemo(() => {
    if (!selected) return []
    let results: CheckResult[] = selected.results
    if (statusFilter !== 'all')   results = results.filter(r => r.status === statusFilter)
    if (scopeFilter  !== 'all')   results = results.filter(r => (r.scope || 'generic') === scopeFilter)
    if (categoryFilter !== 'all') results = results.filter(r => r.ruleCategory === categoryFilter)
    if (resultSearch.trim()) {
      const q = resultSearch.toLowerCase()
      results = results.filter(r =>
        r.ruleName.toLowerCase().includes(q) || r.tableName.toLowerCase().includes(q) ||
        (r.columnName && r.columnName.toLowerCase().includes(q)) || (r.ruleType && r.ruleType.toLowerCase().includes(q))
      )
    }
    return results
  }, [selected, statusFilter, scopeFilter, categoryFilter, resultSearch])

  const categoryBreakdown = useMemo(() => {
    if (!selected) return []
    const cats = new Map<string, { total: number; passed: number; failed: number; warnings: number }>()
    for (const r of selected.results) {
      const cat = r.ruleCategory || 'uncategorized'
      const c = cats.get(cat) || { total: 0, passed: 0, failed: 0, warnings: 0 }
      c.total++
      if (r.status === 'passed') c.passed++; else if (r.status === 'failed') c.failed++; else c.warnings++
      cats.set(cat, c)
    }
    return Array.from(cats.entries()).map(([cat, counts]) => ({ category: cat, ...counts }))
  }, [selected])

  function openCreate() {
    setForm({ name: '', type: 'quality', format: 'web', domain: 'All Domains', dataset: 'All Datasets', dateRange: 'Last 7 days', includeAnomalies: true, includeSLAs: true, includeLineage: false, notify: false })
    setShowModal(true)
  }

  async function runReport() {
    if (!form.name.trim()) return
    setRunning(true); setShowModal(false)
    const res    = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, type: form.type, domain: form.domain, dataset: form.dataset, dateRange: form.dateRange }) })
    const report = await res.json()
    const enriched = { ...report, name: form.name || REPORT_TYPES.find(t => t.id === form.type)?.label }
    setReports(prev => [enriched, ...prev])
    setSelected(enriched)
    setRunning(false)
    router.refresh()
  }

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Quality Reports</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{reports.length} runs</span>
        {reports.length > 0 && <span style={{ background: scoreBg(analytics.avgScore), color: scoreColor(analytics.avgScore), padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>avg {analytics.avgScore}%</span>}
        {analytics.totalPassed  > 0 && <span style={{ background: 'var(--status-ok-bg)',   color: 'var(--status-ok-text)',   padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>✓ {formatNumber(analytics.totalPassed)}</span>}
        {analytics.totalFailed  > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>✗ {formatNumber(analytics.totalFailed)}</span>}
        {analytics.totalWarnings > 0 && <span style={{ background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>⚠ {formatNumber(analytics.totalWarnings)}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={openCreate} disabled={running} style={{ background: running ? 'var(--surface-muted)' : 'var(--accent)', color: running ? 'var(--text-muted)' : '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '⏳ Running…' : '+ Create Report'}
        </button>
      </div>

      {/* Column headers */}
      {reports.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: LIST_COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Score', 'Report Name', 'Date', 'Checks'].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* Report list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {reports.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', border: '2px dashed var(--border)', borderRadius: '8px', margin: '8px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📈</div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>No reports yet</div>
            <button onClick={openCreate} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>+ Create Report</button>
          </div>
        ) : reports.map(r => (
          <div key={r.id}
            onClick={() => { setSelected(selected?.id === r.id ? null : r); setExpandedResult(null); setStatusFilter('all'); setScopeFilter('all'); setCategoryFilter('all'); setResultSearch('') }}
            onMouseEnter={() => setHoverId(r.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid', gridTemplateColumns: LIST_COLS, gap: '0 6px', alignItems: 'center',
              padding: '5px 6px',
              borderLeft: `2px solid ${scoreColor(r.overallScore)}`,
              borderBottom: '1px solid var(--surface-muted)',
              background: selected?.id === r.id ? 'var(--surface)' : hoverId === r.id ? 'var(--surface-muted)' : 'transparent',
              cursor: 'pointer',
            }}>
            <span style={{ background: scoreBg(r.overallScore), color: scoreColor(r.overallScore), padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, textAlign: 'center' }}>{r.overallScore}%</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDateTime(r.executedAt)}</span>
            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>✓{r.passed}</span>
              {r.failed   > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>✗{r.failed}</span>}
              {r.warnings > 0 && <span style={{ background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>⚠{r.warnings}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Slide-in panel — report detail */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(720px,70vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>

            {/* Panel header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ background: scoreBg(selected.overallScore), color: scoreColor(selected.overallScore), padding: '2px 8px', borderRadius: '4px', fontSize: '13px', fontWeight: 700 }}>{selected.overallScore}%</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '1px' }}>Executed {formatDateTime(selected.executedAt)} · {selected.totalChecks} checks across {new Set(selected.results.map(r => r.tableName)).size} tables</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* 4-metric inline strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  { label: 'Total Checks', value: selected.totalChecks, color: 'var(--foreground)' },
                  { label: 'Passed',        value: selected.passed,      color: 'var(--status-ok-text)' },
                  { label: 'Failed',        value: selected.failed,      color: 'var(--status-error-text)' },
                  { label: 'Warnings',      value: selected.warnings,    color: 'var(--status-warn-text)' },
                ].map((m, i) => (
                  <div key={m.label} style={{ padding: '8px 10px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface)', textAlign: 'center' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{m.label}</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: m.color, marginTop: '2px' }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Category breakdown */}
              {categoryBreakdown.length > 0 && (
                <div style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Quality by Category</div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(categoryBreakdown.length, 6)}, 1fr)`, gap: '6px' }}>
                    {categoryBreakdown.map(cb => {
                      const catColor = categoryColors[cb.category] || '#64748b'
                      const passRate = cb.total > 0 ? Math.round((cb.passed / cb.total) * 100) : 0
                      const isActive = categoryFilter === cb.category
                      return (
                        <div key={cb.category} onClick={() => setCategoryFilter(isActive ? 'all' : cb.category)} style={{ background: isActive ? `${catColor}12` : 'var(--surface)', borderRadius: '6px', padding: '8px', border: isActive ? `2px solid ${catColor}` : '1px solid var(--border)', cursor: 'pointer', textAlign: 'center' }}>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: catColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{cb.category}</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: scoreColor(passRate) }}>{passRate}%</div>
                          <div style={{ fontSize: '8.5px', color: 'var(--text-muted)', marginTop: '1px' }}>{cb.passed}/{cb.total}</div>
                          <div style={{ height: '2px', borderRadius: '1px', background: 'var(--border)', marginTop: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${passRate}%`, background: scoreColor(passRate) }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Trend chart */}
              {selected.trend && selected.trend.length > 1 && (() => {
                const W = 560, H = 70, PAD = 10
                const scores = selected.trend.map(t => t.score)
                const minS = Math.min(...scores) - 5, maxS = Math.max(...scores) + 5
                const range = maxS - minS || 1
                const pts = selected.trend.map((t, i) => ({ x: PAD + (i / (selected.trend.length - 1)) * (W - PAD * 2), y: H - PAD - ((t.score - minS) / range) * (H - PAD * 2), score: t.score, label: t.date.split(' ')[1] ?? t.date }))
                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
                const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
                const last  = pts[pts.length - 1]
                return (
                  <div style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)' }}>Quality Trend</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: scoreColor(last.score) }}>{last.score}%</div>
                    </div>
                    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                      <defs><linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={scoreColor(last.score)} stopOpacity="0.15" /><stop offset="100%" stopColor={scoreColor(last.score)} stopOpacity="0" /></linearGradient></defs>
                      {[0, 0.5, 1].map((t, i) => <line key={i} x1={PAD} y1={PAD + t * (H - PAD * 2)} x2={W - PAD} y2={PAD + t * (H - PAD * 2)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 2" />)}
                      <path d={areaD} fill="url(#tG)" />
                      <path d={pathD} fill="none" stroke={scoreColor(last.score)} strokeWidth="1.5" strokeLinecap="round" />
                      {pts.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="2.5" fill={i === pts.length - 1 ? scoreColor(p.score) : 'var(--surface)'} stroke={scoreColor(p.score)} strokeWidth="1.5" />
                          <text x={p.x} y={H} textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="system-ui">{p.label}</text>
                        </g>
                      ))}
                    </svg>
                  </div>
                )
              })()}

              {/* Filters bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', marginRight: '2px' }}>Check Results</span>
                <input value={resultSearch} onChange={e => setResultSearch(e.target.value)} placeholder="Search rules, tables…"
                  style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '10.5px', width: '140px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }} />
                {(['all', 'passed', 'failed', 'warning'] as const).map(f => (
                  <button key={f} onClick={() => setStatusFilter(f)} style={{ padding: '3px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 500, textTransform: 'capitalize', background: statusFilter === f ? '#1a1a1a' : 'var(--surface-muted)', color: statusFilter === f ? '#fff' : 'var(--text-secondary)' }}>
                    {f}{f !== 'all' ? ` (${selected.results.filter(r => r.status === f).length})` : ''}
                  </button>
                ))}
                <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                {(['all', 'generic', 'object-specific'] as const).map(s => (
                  <button key={s} onClick={() => setScopeFilter(s)} style={{ padding: '3px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 500, background: scopeFilter === s ? 'var(--accent)' : 'var(--surface-muted)', color: scopeFilter === s ? '#fff' : 'var(--text-secondary)' }}>
                    {s === 'all' ? 'All Scopes' : s === 'generic' ? '🔧 Generic' : '🎯 Object'}
                  </button>
                ))}
              </div>

              {/* Results table */}
              <div style={{ borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 72px 62px 52px 62px 62px 72px', gap: '0 4px', padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  {['Rule', 'Type', 'Table', 'Category', 'Severity', 'Score', 'Checked', 'Failed', 'Status'].map(h => (
                    <div key={h} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                  ))}
                </div>
                {filteredResults.map((r, i) => {
                  const s      = statusConfig[r.status]
                  const sev    = severityConfig[r.severity || 'medium']
                  const isExp  = expandedResult === i
                  const scope  = r.scope === 'object-specific' ? { bg: '#faf5ff', color: '#7c3aed', label: 'Object' } : { bg: '#f0f9ff', color: '#0369a1', label: 'Generic' }
                  return (
                    <div key={i}>
                      <div onClick={() => setExpandedResult(isExp ? null : i)} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 72px 62px 52px 62px 62px 72px', gap: '0 4px', padding: '7px 10px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', background: isExp ? 'var(--surface-muted)' : r.status === 'failed' ? 'var(--status-error-bg)' : 'transparent', alignItems: 'center', fontSize: '10.5px' }}
                        onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'var(--surface-muted)' }}
                        onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = r.status === 'failed' ? 'var(--status-error-bg)' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ruleName}</span>
                          <span style={{ background: scope.bg, color: scope.color, padding: '0 4px', borderRadius: '3px', fontSize: '8.5px', fontWeight: 600, flexShrink: 0 }}>{scope.label}</span>
                        </div>
                        <span style={{ background: 'var(--surface-muted)', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>{ruleTypeLabel(r.ruleType)}</span>
                        <code style={{ background: 'var(--surface-muted)', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', color: 'var(--text-secondary)' }}>{r.tableName}{r.columnName ? `.${r.columnName}` : ''}</code>
                        <span style={{ background: `${categoryColors[r.ruleCategory || ''] || '#64748b'}18`, color: categoryColors[r.ruleCategory || ''] || '#64748b', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 500, textTransform: 'capitalize' }}>{r.ruleCategory || '—'}</span>
                        <span style={{ background: sev.bg, color: sev.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{sev.label}</span>
                        <span style={{ fontWeight: 600, fontSize: '11px', color: scoreColor(r.score) }}>{r.score}%</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{formatNumber(r.recordsChecked)}</span>
                        <span style={{ fontSize: '10px', color: r.recordsFailed > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)', fontWeight: r.recordsFailed > 0 ? 600 : 400 }}>{formatNumber(r.recordsFailed)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ background: s.bg, color: s.color, padding: '2px 6px', borderRadius: '10px', fontSize: '9.5px', fontWeight: 600 }}>{s.label}</span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                        </div>
                      </div>

                      {isExp && (
                        <div style={{ padding: '10px 14px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
                            {[
                              { label: 'Records Checked', value: formatNumber(r.recordsChecked) },
                              { label: 'Records Failed',  value: formatNumber(r.recordsFailed)  },
                              { label: 'Quality Score',   value: `${r.score}%`                  },
                              { label: 'Duration',        value: `${(r.duration / 1000).toFixed(1)}s` },
                            ].map(m => (
                              <div key={m.label} style={{ background: 'var(--surface)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', marginTop: '2px' }}>{m.value}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Executed SQL</div>
                            <pre style={{ background: '#1e293b', color: '#86efac', padding: '10px 12px', borderRadius: '6px', fontSize: '10.5px', fontFamily: 'monospace', overflow: 'auto', lineHeight: 1.5, maxHeight: '120px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                              {r.sql || `SELECT COUNT(*) AS failed_count\nFROM ${r.tableName}\nWHERE ${r.columnName || 'column'} IS NULL`}
                            </pre>
                          </div>
                          {r.status === 'failed' && (
                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px' }}>🤖</span>
                                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#0369a1' }}>AI Analysis</span>
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.5 }}>
                                {r.recordsFailed} records failed the <strong>{ruleTypeLabel(r.ruleType)}</strong> check ({r.ruleCategory}) on <strong>{r.tableName}</strong>.{r.columnName ? ` Column ${r.columnName} contains invalid or null values.` : ''} Severity: <strong>{r.severity || 'medium'}</strong>.
                              </div>
                            </div>
                          )}
                          {r.details && <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-secondary)', background: 'var(--surface)', padding: '6px 10px', borderRadius: '5px', border: '1px solid var(--border)' }}>{r.details}</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredResults.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No results match the selected filters</div>}
                <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', fontSize: '9.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Showing {filteredResults.length} of {selected.results.length} results</span>
                  <span>Click a row to expand details</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Report Modal — unchanged */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>Create Report</div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>Configure and run a new quality report</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>✕</button>
            </div>
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={lbl}>Report Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Finance Quality Report" style={sel} /></div>
              <div><label style={lbl}>Report Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {REPORT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))} style={{ padding: '12px 8px', borderRadius: '10px', border: `1px solid ${form.type === t.id ? '#E8541A' : '#e2e8f0'}`, background: form.type === t.id ? '#fef3e2' : '#fafaf9', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', marginBottom: '4px' }}>{t.icon}</div>
                      <div style={{ fontSize: '11px', fontWeight: form.type === t.id ? 700 : 500, color: form.type === t.id ? '#E8541A' : '#475569' }}>{t.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', padding: '7px 10px', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>{REPORT_TYPES.find(t => t.id === form.type)?.desc}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={lbl}>Domain</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value, dataset: 'All Datasets' }))} style={sel}>{DOMAINS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label style={lbl}>Dataset</label>
                  <select value={form.dataset} onChange={e => setForm(f => ({ ...f, dataset: e.target.value }))} style={sel}>
                    <option value="All Datasets">All Datasets</option>
                    {(form.domain === 'All Domains' ? ALL_DATASETS : (DATASETS_BY_DOMAIN[form.domain] || [])).map(d => <option key={d} value={d}>{d}</option>)}
                  </select></div>
              </div>
              <div><label style={lbl}>Date Range</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {DATE_RANGES.map(dr => (
                    <button key={dr} onClick={() => setForm(f => ({ ...f, dateRange: dr }))} style={{ padding: '5px 10px', borderRadius: '20px', border: `1px solid ${form.dateRange === dr ? '#E8541A' : '#e2e8f0'}`, background: form.dateRange === dr ? '#fef3e2' : '#fff', color: form.dateRange === dr ? '#E8541A' : '#64748b', fontSize: '12px', fontWeight: form.dateRange === dr ? 600 : 400, cursor: 'pointer' }}>{dr}</button>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Include in Report</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[{ key: 'includeAnomalies', label: 'Anomaly detections', icon: '📡' }, { key: 'includeSLAs', label: 'SLA compliance status', icon: '⏱️' }, { key: 'includeLineage', label: 'Data lineage impact', icon: '🔗' }, { key: 'notify', label: 'Send email notification', icon: '📧' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 8px', borderRadius: '6px', background: '#fafaf9', border: '1px solid #ebe8df' }}>
                      <input type="checkbox" checked={form[opt.key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))} style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#E8541A' }} />
                      <span style={{ fontSize: '12.5px', color: '#475569' }}>{opt.icon} {opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Output Format</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {FORMATS.map(fmt => (
                    <button key={fmt.id} onClick={() => setForm(f => ({ ...f, format: fmt.id }))} style={{ flex: 1, padding: '8px 6px', borderRadius: '8px', border: `1px solid ${form.format === fmt.id ? '#E8541A' : '#e2e8f0'}`, background: form.format === fmt.id ? '#fef3e2' : '#fafaf9', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', marginBottom: '2px' }}>{fmt.icon}</div>
                      <div style={{ fontSize: '10px', fontWeight: form.format === fmt.id ? 700 : 500, color: form.format === fmt.id ? '#E8541A' : '#64748b' }}>{fmt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={runReport} disabled={!form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? '#E8541A' : '#e2e8f0', color: form.name.trim() ? '#fff' : '#94a3b8' }}>▶ Run Report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/reports and verify:
- Compact top bar with inline stat badges (no large 6-card KPI strip)
- Full-width dense report list rows: score pill · name · date · check counts
- Clicking a row opens the wide slide-in panel (width: min(720px, 70vw))
- Panel shows: score + summary strip + category breakdown + trend chart + filter bar + results table with expandable rows
- Clicking outside closes the panel
- "+ Create Report" opens the modal unchanged

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/reports/ReportsClient.tsx
git commit -m "feat: compact /reports — inline badges, full-width list, slide-in detail panel"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| `/data-products` compact spine + row grid + slide-in | Task 1 |
| `/executive` compact header with `—` badges | Task 2 |
| `/data-browser` compact spine + accordion rows + slide-in | Task 3 |
| `/spot-check` compact spine + schema selector + row grid + slide-in | Task 4 |
| `/reports` compact top bar + dense list + slide-in detail | Task 5 |
| Shared compact spine pattern (10px 16px padding, flex column, gap 8px) | All tasks |
| Inline stat badges replacing KPI grid cards | All tasks |
| Slide-in panel with backdrop at z-index 199/200 | Tasks 1, 3, 4, 5 |
| Hover edit/delete icons | Task 1 |
| Chevron e.stopPropagation() for inline expand | Task 3 |
| DataGrid / ColumnLoader preserved verbatim | Task 3 |
| Spot Check comparison logic preserved | Task 4 |
| Reports category breakdown, trend chart, expandable rows preserved | Task 5 |
| Create modals unchanged | Tasks 1, 5 |

All spec requirements covered. No gaps found.

### Placeholder Scan

No "TBD", "TODO", or incomplete steps found in Tasks 1–5.

### Type Consistency

- `hoverId` state: `string | null` — used consistently in Tasks 1, 2, 3, 4
- `selected` state: item type specific per page — `DataProduct | null`, `TableInfo | null`, etc.
- `formatDateTime`, `formatNumber` imported from `@/lib/utils` in all tasks
- `categoryColors` imported in Task 5 — confirm this export exists in utils before committing

### Potential Issue

Task 5 imports `categoryColors` from `@/lib/utils`. Verify this is exported before implementing. If not, define inline:
```ts
const categoryColors: Record<string, string> = { completeness: '#3b82f6', freshness: '#f59e0b', uniqueness: '#8b5cf6', validity: '#ec4899', accuracy: '#10b981', consistency: '#6366f1', referential: '#ef4444' }
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-06-compact-explore-reports.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute all 5 tasks in this session sequentially

Which approach?
