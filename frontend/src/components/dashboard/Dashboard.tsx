'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckResult, Connection, DashboardStats, DimensionScores, FailingRule, AtRiskTable } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { loadConnections } from '@/lib/seedData'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import DashboardTrendsTab from './DashboardTrendsTab'


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

interface AlertSummary { open: number; critical: number; high: number; acknowledged: number }

export default function Dashboard({ stats }: { stats: DashboardStats }) {
  const [running, setRunning] = useState(false)
  const [timeFilter, setTimeFilter] = useState('Last 7 days')
  const [domainFilter, setDomainFilter] = useState('All domains')
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'overview' | 'trends'>('overview')
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/alerts')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data)) return
        const open = data.filter(a => a.alert_status === 'open').length
        const critical = data.filter(a => a.severity === 'critical' && a.alert_status === 'open').length
        const high = data.filter(a => a.severity === 'high' && a.alert_status === 'open').length
        const acknowledged = data.filter(a => a.alert_status === 'acknowledged').length
        setAlertSummary({ open, critical, high, acknowledged })
      })
      .catch(() => {})
  }, [])

  async function runCheck() {
    setRunning(true)
    await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setRunning(false)
    router.refresh()
  }

  const score = stats.overallScore
  const trendData = stats.trend

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1300px', overflowY: 'auto' }} onClick={() => setActiveMetric(null)}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Data quality overview</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {stats.totalAssets} datasets · {stats.totalRules} rules · {stats.openAlerts} open issues
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Dropdown label="time" options={TIME_OPTIONS} value={timeFilter} onChange={setTimeFilter} />
          <Dropdown label="domain" options={DOMAIN_OPTIONS} value={domainFilter} onChange={setDomainFilter} />
          <button onClick={runCheck} disabled={running} style={{
            background: 'var(--accent)', border: 'none', padding: '5px 12px',
            borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--accent-text)', cursor: running ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: running ? 0.6 : 1
          }}>{running ? '⏳…' : '+ Run'}</button>
        </div>
      </div>

      {/* view tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
        {(['overview', 'trends'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: '6px 14px', fontSize: '12px',
              fontWeight: activeView === view ? 600 : 400,
              color: activeView === view ? 'var(--foreground)' : 'var(--text-muted)',
              background: 'transparent', border: 'none',
              borderBottom: activeView === view ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: '-1px',
            }}
          >
            {view === 'overview' ? 'Overview' : 'Trends & Monitoring'}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (<>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
        {/* Overall Quality Score */}
        <Link href="/reports" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>Overall quality score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>
                {score !== null ? score.toFixed(1) : '—'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '13px' }}>▲ 1.4</span>
                <span>vs last week</span>
              </div>
            </div>
            {/* Stacked bar */}
            {(stats.passed + stats.failed > 0) ? (
              <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px', gap: '1px' }}>
                <div style={{ background: '#16a34a', flex: stats.passed, transition: 'flex 0.5s' }} />
                <div style={{ background: '#dc2626', flex: stats.failed }} />
              </div>
            ) : (
              <div style={{ height: '6px', borderRadius: '3px', background: '#e5e7eb', marginBottom: '8px' }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              {([['Passing', stats.passed, '#16a34a'], ['Failing', stats.failed, '#dc2626']] as [string, number, string][]).map(([l, v, c]) => (
                <div key={l}>
                  <div style={{ color: 'var(--text-secondary)' }}>{l}</div>
                  <div style={{ fontWeight: 700, color: c }}>{v}</div>
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
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '8px', lineHeight: 1 }}>
              {stats.openAlerts}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>{stats.criticalAlerts} critical</span>
              {' · '}
              <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{stats.mediumAlerts} medium</span>
            </div>
            <div style={{ background: '#fee2e2', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${stats.openAlerts > 0 ? (stats.criticalAlerts / stats.openAlerts) * 100 : 0}%`, height: '100%', background: '#dc2626' }} />
            </div>
          </div>
        </Link>

        {/* Datasets monitored */}
        <Link href="/datasets" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>Datasets monitored</div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', marginBottom: '8px', lineHeight: 1 }}>
              {stats.totalAssets}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              across {stats.activeConnections || 1} sources
            </div>
          </div>
        </Link>

        {/* SLA Adherence */}
        <Link href="/slas" style={{ textDecoration: 'none' }}>
          <div style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={cardLabel}>SLA adherence</div>
            <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>—</span>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>No SLA data yet</div>
            <div style={{ background: '#e5e7eb', height: '4px', borderRadius: '2px', marginTop: '8px' }} />
          </div>
        </Link>
      </div>

      {/* Alert Summary Strip */}
      {alertSummary !== null && (
        <Link href="/alerts" style={{ textDecoration: 'none', display: 'block', marginBottom: '10px' }}>
          <div style={{ ...card, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', marginRight: '4px' }}>Active Alerts</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {alertSummary.critical > 0 && (
                <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  {alertSummary.critical} critical
                </span>
              )}
              {alertSummary.high > 0 && (
                <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  {alertSummary.high} high
                </span>
              )}
              {alertSummary.open === 0 && (
                <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                  All clear
                </span>
              )}
              {alertSummary.open > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{alertSummary.open} open total</span>
              )}
            </div>
            {alertSummary.acknowledged > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                {alertSummary.acknowledged} acknowledged
              </span>
            )}
            <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginLeft: alertSummary.acknowledged > 0 ? '0' : 'auto' }}>View all →</span>
          </div>
        </Link>
      )}

      {/* Six Dimensions */}
      <div style={{ ...card, padding: '14px 16px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Six dimensions of quality</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            {stats.totalRules} active rules · <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>view all →</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {([
            { name: 'Completeness', key: 'completeness' as const, category: 'completeness' },
            { name: 'Accuracy',     key: 'accuracy'     as const, category: 'accuracy' },
            { name: 'Validity',     key: 'validity'     as const, category: 'validity' },
            { name: 'Consistency',  key: 'consistency'  as const, category: 'consistency' },
            { name: 'Timeliness',   key: 'timeliness'   as const, category: 'timeliness' },
            { name: 'Uniqueness',   key: 'uniqueness'   as const, category: 'uniqueness' },
          ] as { name: string; key: keyof DimensionScores; category: string }[]).map(d => {
            const val = stats.dimensions[d.key]
            const color = val === null ? '#9ca3af' : val >= 90 ? '#16a34a' : val >= 75 ? '#ea8b3a' : '#dc2626'
            return (
              <Link key={d.name} href={`/rules?category=${d.category}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-neutral-bg)'; e.currentTarget.style.borderColor = '#93c5fd' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>{d.name}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.5px', marginBottom: '6px' }}>
                    {val !== null ? <>{val}<span style={{ fontSize: '12px' }}>%</span></> : '—'}
                  </div>
                  <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${val ?? 0}%`, background: color, transition: 'width 0.5s' }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Trend + Failing Rules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '10px', marginBottom: '10px' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Quality trend · {timeFilter}</div>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Incidents</span></div>
            </div>
          </div>
          <TrendChart data={trendData} />
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Top failing rules</div>
            <Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {stats.failingRules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '12px 8px', textAlign: 'center' }}>
                No failing rules
              </div>
            ) : stats.failingRules.map((rule, i) => (
              <Link key={i} href="/rules" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: '3px', alignSelf: 'stretch', background: rule.severity === 'critical' ? '#dc2626' : '#ea8b3a', borderRadius: '2px', flexShrink: 0, minHeight: '14px' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rule.rule_name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rule.asset_name} · {rule.detail}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Datasets requiring attention */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Datasets requiring attention</div>
          <Link href="/datasets" style={{ fontSize: '12.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            View all {stats.totalAssets} →
          </Link>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Dataset', 'Score', 'Δ Score', 'Domain', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.atRiskTables.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  All datasets healthy
                </td>
              </tr>
            ) : stats.atRiskTables.map((ds, i) => {
              const parts = ds.asset_name.split('.')
              const deltaColor = ds.score_delta === null ? 'var(--text-muted)' : ds.score_delta < 0 ? '#dc2626' : '#16a34a'
              const deltaLabel = ds.score_delta === null ? '—' : `${ds.score_delta > 0 ? '+' : ''}${ds.score_delta.toFixed(1)}`
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => router.push('/datasets')}>
                  <td style={{ padding: '7px 12px' }}>
                    {parts.length > 1
                      ? <><span style={{ color: 'var(--text-muted)' }}>{parts[0]}.</span><span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{parts.slice(1).join('.')}</span></>
                      : <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{ds.asset_name}</span>
                    }
                  </td>
                  <td style={{ padding: '7px 12px' }}><ScorePill score={ds.score} /></td>
                  <td style={{ padding: '7px 12px', color: deltaColor, fontWeight: 600 }}>{deltaLabel}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{ds.domain_name}</td>
                  <td style={{ padding: '7px 12px' }}><span style={{ color: 'var(--accent)', fontSize: '12px' }}>→</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Live results if available */}
      {stats.recentChecks.length > 0 && (
        <div style={{ ...card, marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Your latest check results</div>
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
      </>)}
      {activeView === 'trends' && <DashboardTrendsTab />}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }
const cardLabel: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 500 }
