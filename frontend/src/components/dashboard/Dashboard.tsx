'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckResult, Connection } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { loadConnections } from '@/lib/seedData'

interface DashboardStats {
  totalRules: number; enabledRules: number; totalConnections: number
  activeConnections: number; overallScore: number; passed: number
  failed: number; warnings: number; totalChecks: number
  trend: { date: string; score: number }[]; recentChecks: CheckResult[]
  lastRunAt: string | null
}

const TIME_OPTIONS = ['Last 1 hour','Last 6 hours','Last 24 hours','Last 7 days','Last 14 days','Last 30 days']
const DOMAIN_OPTIONS = ['All domains','Finance','Marketing','Sales','Engineering','Supply Chain','Data Platform']

/* ─── Connection Type Icons ─── */
const connIcons: Record<string, string> = {
  snowflake: '❄️', postgresql: '🐘', mysql: '🐬', bigquery: '📊',
  redshift: '🔴', mongodb: '🍃', csv: '📄', api: '🔌',
}

/* ─── Connection Selector ─── */
function ConnectionSelector() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadConnections().then(conns => {
      if (conns.length > 0) {
        setConnections(conns)
        const active = conns.find((c: Connection) => c.status === 'active')
        if (active) setActiveId(active.id)
        else setActiveId(conns[0].id)
      }
    })
  }, [])

  const active = connections.find(c => c.id === activeId)

  async function handleRefresh() {
    if (!active) return
    setRefreshing(true)
    try {
      await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active),
      })
      // Re-fetch connections
      const r = await fetch('/api/connections')
      const data = await r.json()
      setConnections(Array.isArray(data) ? data : (data.connections ?? []))
    } catch {}
    setRefreshing(false)
  }

  if (connections.length === 0) {
    return (
      <Link href="/connections" style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 14px',
        borderRadius: '8px', fontSize: '12.5px', color: 'var(--brand-primary)', fontWeight: 600,
        textDecoration: 'none', cursor: 'pointer',
      }}>
        + Add Connection
      </Link>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--surface)', border: '1px solid var(--border)', padding: '7px 14px',
          borderRadius: '8px', cursor: 'pointer', minWidth: '180px',
          boxShadow: open ? '0 0 0 2px var(--accent-bg)' : 'none',
        }}
      >
        <span style={{ fontSize: '16px' }}>{active ? (connIcons[active.type] ?? '🔗') : '🔗'}</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>
          {active?.name ?? 'Select connection'}
        </span>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: active?.status === 'active' ? '#16a34a' : active?.status === 'error' ? '#dc2626' : '#d97706',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </div>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', width: '34px', height: '34px',
          borderRadius: '8px', cursor: refreshing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', opacity: refreshing ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
        title="Refresh connection"
      >
        {refreshing ? '⏳' : '🔄'}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, minWidth: '240px', overflow: 'hidden',
        }}>
          {connections.map(conn => (
            <button key={conn.id} onClick={() => { setActiveId(conn.id); setOpen(false) }} style={{
              display: 'flex', width: '100%', padding: '10px 14px', textAlign: 'left',
              background: conn.id === activeId ? 'var(--accent-bg)' : 'var(--surface)', border: 'none',
              alignItems: 'center', gap: '10px', cursor: 'pointer',
              borderBottom: '1px solid #f3f1ea',
            }}>
              <span style={{ fontSize: '16px' }}>{connIcons[conn.type] ?? '🔗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: conn.id === activeId ? 600 : 400, color: conn.id === activeId ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {conn.id === activeId && '✓ '}{conn.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{conn.type} · {conn.database ?? conn.host ?? ''}</div>
              </div>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: conn.status === 'active' ? '#16a34a' : conn.status === 'error' ? '#dc2626' : '#d97706',
              }} />
            </button>
          ))}
          <Link href="/connections" style={{
            display: 'block', padding: '10px 14px', textAlign: 'center',
            fontSize: '12.5px', color: 'var(--brand-primary)', fontWeight: 600,
            textDecoration: 'none', borderTop: '1px solid var(--border)',
          }}>
            + Manage Connections
          </Link>
        </div>
      )}
    </div>
  )
}

const dimensions = [
  { name: 'Completeness', score: 98, color: '#16a34a', category: 'completeness' },
  { name: 'Accuracy',     score: 96, color: '#16a34a', category: 'accuracy' },
  { name: 'Validity',     score: 87, color: '#ea8b3a', category: 'validity' },
  { name: 'Consistency',  score: 94, color: '#16a34a', category: 'consistency' },
  { name: 'Timeliness',   score: 79, color: '#dc2626', category: 'timeliness' },
  { name: 'Uniqueness',   score: 99, color: '#16a34a', category: 'uniqueness' },
]

const failingRules = [
  { name: 'order_total > 0', source: 'orders.transactions', detail: '412 fails', severity: 'critical' },
  { name: 'email matches regex', source: 'crm.users', detail: '287 fails', severity: 'critical' },
  { name: 'freshness < 6h', source: 'ga.sessions', detail: '1.2h late', severity: 'warning' },
  { name: 'sku not null', source: 'inventory.items', detail: '94 fails', severity: 'warning' },
  { name: 'row count Δ < 20%', source: 'finance.ledger', detail: '31% drop', severity: 'warning' },
]

const datasetsAttention = [
  { name: 'prod.orders_fact', source: 'Snowflake', score: 71, freshness: '14m ago', issues: '5 critical', issueSev: 'critical', owner: 'Data platform', id: 'orders_fact' },
  { name: 'crm.users_dim', source: 'Postgres', score: 82, freshness: '1h ago', issues: '3 medium', issueSev: 'warning', owner: 'Growth', id: 'users_dim' },
  { name: 'ga.sessions_daily', source: 'BigQuery', score: 85, freshness: '7h late', issues: '2 medium', issueSev: 'warning', owner: 'Marketing', id: 'sessions_daily', lateFreshness: true },
  { name: 'inv.items_stock', source: 'Databricks', score: 89, freshness: '22m ago', issues: '1 medium', issueSev: 'warning', owner: 'Supply chain', id: 'items_stock' },
  { name: 'fin.ledger_gl', source: 'Oracle', score: 96, freshness: '3m ago', issues: '— none', issueSev: 'none', owner: 'Finance', id: 'ledger_gl' },
]

function Dropdown({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', padding: '7px 14px',
        borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer',
        fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
        boxShadow: open ? '0 0 0 2px var(--accent-bg)' : 'none'
      }}>
        {value.includes('domains') && value !== 'All domains'
          ? <><span style={{ background: 'var(--accent-bg)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{value}</span></>
          : value}
        <span style={{ fontSize: '10px', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, minWidth: '170px', overflow: 'hidden'
        }}>
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }} style={{
              display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: opt === value ? 'var(--accent-bg)' : 'var(--surface)', border: 'none',
              fontSize: '13px', color: opt === value ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: opt === value ? 600 : 400, cursor: 'pointer'
            }}>
              {opt === value && '✓ '}{opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#ea8b3a' : '#dc2626'
  const bg = score >= 90 ? '#dcfce7' : score >= 80 ? '#fef3c7' : '#fee2e2'
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, color, padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, minWidth: '38px' }}>{score}</span>
}

function TrendChart({ data }: { data: { date: string; score: number }[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; score: number; date: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const w = 600, h = 180, pad = { top: 20, right: 20, bottom: 30, left: 35 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom
  const max = 100, min = 82

  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`

  // Fixed random incident bar heights (seeded)
  const incidentHeights = data.map((_, i) => [8, 14, 6, 18, 10, 7, 20, 12, 5, 16, 9][i % 11])

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closest = pts[0], minDist = Infinity
          pts.forEach(p => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closest = p } })
          if (minDist < 30) setTooltip({ x: (closest.x / w) * 100, y: (closest.y / h) * 100, score: closest.score, date: closest.date })
          else setTooltip(null)
        }}>
        <defs>
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[100, 95, 90, 85].map(v => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return <g key={v}><line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" /><text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text></g>
        })}
        {data.map((d, i) => {
          const barH = incidentHeights[i]
          return <rect key={i} x={pad.left + (i / (data.length - 1)) * chartW - 5} y={pad.top + chartH - barH} width="10" height={barH} fill="#ef4444" opacity="0.75" rx="2" />
        })}
        <path d={areaPath} fill="url(#ag2)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            style={{ transition: 'r 0.1s' }} />
        ))}
        {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((d, _, arr) => {
          const idx = data.indexOf(d)
          return <text key={idx} x={pad.left + (idx / (data.length - 1)) * chartW} y={h - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.date}</text>
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', left: `${tooltip.x}%`, top: `${tooltip.y}%`,
          transform: 'translate(-50%, -130%)', background: '#1e293b', color: '#fff',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 10
        }}>
          <div>{tooltip.date}</div>
          <div style={{ color: '#60a5fa', fontSize: '16px' }}>{tooltip.score}%</div>
          <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1e293b' }} />
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ stats }: { stats: DashboardStats }) {
  const [running, setRunning] = useState(false)
  const [timeFilter, setTimeFilter] = useState('Last 7 days')
  const [domainFilter, setDomainFilter] = useState('All domains')
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const router = useRouter()

  async function runCheck() {
    setRunning(true)
    await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setRunning(false)
    router.refresh()
  }

  const score = stats.overallScore || 94.2
  const trendData = stats.trend.length > 0 ? stats.trend : [
    { date: 'Apr 5', score: 93 }, { date: 'Apr 8', score: 91 }, { date: 'Apr 11', score: 94 },
    { date: 'Apr 14', score: 92 }, { date: 'Apr 17', score: 95 }, { date: 'Apr 20', score: 93 },
    { date: 'Apr 23', score: 96 }, { date: 'Apr 26', score: 94 }, { date: 'Apr 29', score: 96 },
    { date: 'May 2', score: 95 }, { date: 'May 5', score: 97 }
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }} onClick={() => setActiveMetric(null)}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        Workspace · <span style={{ color: 'var(--text-secondary)' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.4px' }}>Data quality overview</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Dropdown label="time" options={TIME_OPTIONS} value={timeFilter} onChange={setTimeFilter} />
          <Dropdown label="domain" options={DOMAIN_OPTIONS} value={domainFilter} onChange={setDomainFilter} />
          <button onClick={runCheck} disabled={running} style={{
            background: 'var(--accent-bg)', border: '1px solid #93c5fd', padding: '7px 14px',
            borderRadius: '8px', fontSize: '12.5px', color: 'var(--accent)', cursor: running ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: running ? 0.6 : 1
          }}>{running ? '⏳ Running…' : '+ New rule'}</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {/* Overall Quality Score */}
        <Link href="/reports" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>Overall quality score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>{score.toFixed(1)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '13px' }}>▲ 1.4</span>
                <span>vs last week</span>
              </div>
            </div>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px', gap: '1px' }}>
              <div style={{ background: '#16a34a', flex: stats.passed || 268, transition: 'flex 0.5s' }} />
              <div style={{ background: '#ea8b3a', flex: stats.warnings || 91 }} />
              <div style={{ background: '#dc2626', flex: stats.failed || 59 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              {[['Passing', stats.passed || 268, '#16a34a'], ['Warning', stats.warnings || 91, '#ea8b3a'], ['Failing', stats.failed || 59, '#dc2626']].map(([l, v, c]) => (
                <div key={l as string}>
                  <div style={{ color: 'var(--text-secondary)' }}>{l}</div>
                  <div style={{ fontWeight: 700, color: c as string }}>{v as number}</div>
                </div>
              ))}
            </div>
          </div>
        </Link>

        {/* Open Issues */}
        <Link href="/issues" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>Open issues</div>
            <div style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '12px', lineHeight: 1 }}>23</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>8 critical</span> · <span style={{ color: '#ea8b3a', fontWeight: 600 }}>15 medium</span>
            </div>
            <div style={{ background: '#fee2e2', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${(8/23)*100}%`, height: '100%', background: '#dc2626' }} />
            </div>
          </div>
        </Link>

        {/* Datasets monitored */}
        <Link href="/datasets" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>Datasets monitored</div>
            <div style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '8px', lineHeight: 1 }}>142</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>across {stats.activeConnections || 9} sources</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>↑ 12 new</span>
            </div>
          </div>
        </Link>

        {/* SLA Adherence */}
        <Link href="/slas" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>SLA adherence</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '8px' }}>
              <span style={{ fontSize: '40px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>98.6</span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
            </div>
            <div style={{ fontSize: '12.5px', color: '#16a34a', fontWeight: 700, marginBottom: '8px' }}>▲ 0.3 pts</div>
            <div style={{ background: '#e5e7eb', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: '98.6%', height: '100%', background: '#16a34a' }} />
            </div>
          </div>
        </Link>
      </div>

      {/* Six Dimensions */}
      <div style={{ ...card, padding: '22px 24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>Six dimensions of quality</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>scored on 1.2M records · refreshed 4m ago · <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>view all →</span></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
          {dimensions.map(d => (
            <Link key={d.name} href={`/rules?category=${d.category}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--surface-muted)', borderRadius: '10px', padding: '14px 12px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-neutral-bg)'; e.currentTarget.style.borderColor = '#93c5fd' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: d.color, letterSpacing: '-0.5px', marginBottom: '8px' }}>{d.score}<span style={{ fontSize: '14px' }}>%</span></div>
                <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.score}%`, background: d.color, transition: 'width 0.5s' }} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Trend + Failing Rules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 310px', gap: '16px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>Quality trend · {timeFilter}</div>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Incidents</span></div>
            </div>
          </div>
          <TrendChart data={trendData} />
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>Top failing rules</div>
            <Link href="/rules" style={{ fontSize: '11.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {failingRules.map((rule, i) => (
              <Link key={i} href="/rules" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: '3px', alignSelf: 'stretch', background: rule.severity === 'critical' ? '#dc2626' : '#ea8b3a', borderRadius: '2px', marginTop: '3px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>{rule.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{rule.source} · {rule.detail}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Datasets requiring attention */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>Datasets requiring attention</div>
          <Link href="/datasets" style={{ fontSize: '12.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all 142 →</Link>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Dataset', 'Source', 'Score', 'Freshness', 'Issues', 'Owner', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datasetsAttention.map((ds, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => router.push('/datasets')}>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{ds.name.split('.')[0]}.</span>
                  <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{ds.name.split('.')[1]}</span>
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{ds.source}</td>
                <td style={{ padding: '12px' }}><ScorePill score={ds.score} /></td>
                <td style={{ padding: '12px', color: ds.lateFreshness ? '#ea8b3a' : 'var(--text-secondary)', fontWeight: ds.lateFreshness ? 600 : 400 }}>{ds.freshness}</td>
                <td style={{ padding: '12px' }}>
                  {ds.issueSev !== 'none' ? (
                    <span style={{ color: ds.issueSev === 'critical' ? '#dc2626' : '#ea8b3a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>•</span>{ds.issues}
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>{ds.issues}</span>}
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{ds.owner}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: 'var(--accent)', fontSize: '12px' }}>→</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live results if available */}
      {stats.recentChecks.length > 0 && (
        <div style={{ ...card, marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--foreground)' }}>Your latest check results</div>
            <span style={{ fontSize: '11px', color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>LIVE</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Rule', 'Connection', 'Score', 'Records', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentChecks.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => router.push('/reports')}>
                  <td style={{ padding: '12px', fontWeight: 500, color: 'var(--foreground)' }}>{c.ruleName}</td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{c.connectionName}</td>
                  <td style={{ padding: '12px' }}><ScorePill score={Math.round(c.score)} /></td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(c.recordsChecked)}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      background: c.status === 'passed' ? '#dcfce7' : c.status === 'failed' ? '#fee2e2' : '#fef3c7',
                      color: c.status === 'passed' ? '#16a34a' : c.status === 'failed' ? '#dc2626' : '#ea8b3a',
                      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase'
                    }}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }
const cardLabel: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }
