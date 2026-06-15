'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Gauge, AlertTriangle, Database, ShieldCheck, Activity, GitCompare, Fingerprint,
  Target, ListChecks, Clock, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp,
} from 'lucide-react'
import { DashboardStats, DimensionScores } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import DashboardTrendsTab from './DashboardTrendsTab'


const TIME_OPTIONS = ['Last 1 hour','Last 6 hours','Last 24 hours','Last 7 days','Last 14 days','Last 30 days']
const DOMAIN_OPTIONS = ['All domains','Finance','Marketing','Sales','Engineering','Supply Chain','Data Platform']

/* ─── Score helpers ─── */
function scoreColor(value: number | null): string {
  if (value === null) return '#9ca3af'
  return value >= 90 ? '#16a34a' : value >= 75 ? '#ea8b3a' : '#dc2626'
}

/* ─── Radial ring gauge ─── */
function RingGauge({ value, size, stroke, color }: { value: number | null; size: number; stroke: number; color: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const offset = c - (pct / 100) * c
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      {value !== null && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      )}
    </svg>
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

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '7px', background: 'var(--accent-bg)',
          color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>{title}</span>
      </div>
      {action}
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
  const healthyAssets = Math.max(stats.totalAssets - stats.atRiskTables.length, 0)

  return (
    <div style={{ padding: '20px 28px', overflowY: 'auto' }} onClick={() => setActiveMetric(null)}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 10px rgba(45,90,158,0.25)',
            }}>
              <Gauge size={18} color="#fff" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Data Quality Overview</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{formatNumber(stats.totalAssets)} datasets</span>
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span>{stats.totalRules} active rules</span>
                <span style={{ color: 'var(--border-strong)' }}>·</span>
                <span style={{ color: stats.openAlerts > 0 ? 'var(--status-error-text)' : 'var(--text-muted)', fontWeight: stats.openAlerts > 0 ? 600 : 400 }}>
                  {stats.openAlerts} open issues
                </span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Dropdown label="time" options={TIME_OPTIONS} value={timeFilter} onChange={setTimeFilter} />
          <Dropdown label="domain" options={DOMAIN_OPTIONS} value={domainFilter} onChange={setDomainFilter} />
          <button onClick={runCheck} disabled={running} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)', border: 'none', padding: '7px 16px',
            borderRadius: '8px', fontSize: 'var(--text-xs)', color: 'var(--accent-text)', cursor: running ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: running ? 0.6 : 1, boxShadow: '0 2px 8px rgba(45,90,158,0.25)',
          }}>
            <Play size={12} fill="currentColor" />
            {running ? 'Running…' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* view tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        {(['overview', 'trends'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: '7px 16px', fontSize: '12.5px',
              fontWeight: activeView === view ? 600 : 400,
              color: activeView === view ? 'var(--foreground)' : 'var(--text-muted)',
              background: 'transparent', border: 'none',
              borderBottom: activeView === view ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: '-1px', transition: 'color 0.15s',
            }}
          >
            {view === 'overview' ? 'Overview' : 'Trends & Monitoring'}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (<>
      {/* Hero: score gauge + KPI tiles */}
      <div style={{ ...card, display: 'flex', alignItems: 'stretch', gap: '24px', padding: '20px 24px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {/* Overall score gauge */}
        <Link href="/reports" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
          <div style={{ position: 'relative', width: '108px', height: '108px', flexShrink: 0 }}>
            <RingGauge value={score} size={108} stroke={9} color={scoreColor(score)} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1 }}>
                {score !== null ? score.toFixed(1) : '—'}
              </span>
              <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>/ 100</span>
            </div>
          </div>
          <div style={{ minWidth: '150px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '6px' }}>Overall Quality Score</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)',
                padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
              }}>
                <TrendingUp size={11} strokeWidth={2.6} /> +1.4
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>vs last week</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>{stats.passed}</span> passing
              {' · '}
              <span style={{ color: '#dc2626', fontWeight: 700 }}>{stats.failed}</span> failing
            </div>
            {(stats.passed + stats.failed > 0) ? (
              <div style={{ display: 'flex', height: '5px', width: '150px', borderRadius: '3px', overflow: 'hidden', gap: '1px' }}>
                <div style={{ background: '#16a34a', flex: stats.passed, transition: 'flex 0.5s' }} />
                <div style={{ background: '#dc2626', flex: stats.failed }} />
              </div>
            ) : (
              <div style={{ height: '5px', width: '150px', borderRadius: '3px', background: '#e5e7eb' }} />
            )}
          </div>
        </Link>

        {/* Divider */}
        <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch' }} />

        {/* KPI tiles */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: '16px', minWidth: '460px' }}>
          {/* Open Issues */}
          <Link href="/issues" style={{ textDecoration: 'none' }}>
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>Open Issues</span>
                <div style={{ ...kpiIconWrap, background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
                  <AlertTriangle size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>
                {stats.openAlerts}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
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
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>Datasets Monitored</span>
                <div style={{ ...kpiIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                  <Database size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>
                {stats.totalAssets}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                across {stats.activeConnections || 1} sources · <span style={{ color: stats.atRiskTables.length > 0 ? '#ea8b3a' : '#16a34a', fontWeight: 600 }}>{stats.atRiskTables.length} need attention</span>
              </div>
              <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', gap: '1px' }}>
                <div style={{ background: '#16a34a', flex: healthyAssets || 1, transition: 'flex 0.5s' }} />
                <div style={{ background: '#ea8b3a', flex: stats.atRiskTables.length }} />
              </div>
            </div>
          </Link>

          {/* SLA Adherence */}
          <Link href="/slas" style={{ textDecoration: 'none' }}>
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>SLA Adherence</span>
                <div style={{ ...kpiIconWrap, background: 'var(--status-neutral-bg)', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>—</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>No SLA data yet</div>
              <div style={{ background: '#e5e7eb', height: '4px', borderRadius: '2px' }} />
            </div>
          </Link>
        </div>
      </div>

      {/* Alert Summary Strip */}
      {alertSummary !== null && (
        <Link href="/alerts" style={{ textDecoration: 'none', display: 'block', marginBottom: '12px' }}>
          <div style={{ ...card, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {alertSummary.open === 0
                ? <CheckCircle2 size={14} color="#16a34a" strokeWidth={2.4} />
                : <AlertTriangle size={14} color="#dc2626" strokeWidth={2.4} />}
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Active Alerts</span>
            </div>
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginLeft: alertSummary.acknowledged > 0 ? '0' : 'auto' }}>
              View all <ChevronRight size={12} />
            </span>
          </div>
        </Link>
      )}

      {/* Six Dimensions */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
        <SectionHeader
          icon={<Target size={13} strokeWidth={2.4} />}
          title="Six Dimensions of Quality"
          action={
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {stats.totalRules} active rules · <Link href="/rules" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>view all →</Link>
            </div>
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
          {([
            { name: 'Completeness', key: 'completeness' as const, category: 'completeness', icon: <ListChecks size={14} strokeWidth={2.2} /> },
            { name: 'Accuracy',     key: 'accuracy'     as const, category: 'accuracy',     icon: <Target size={14} strokeWidth={2.2} /> },
            { name: 'Validity',     key: 'validity'     as const, category: 'validity',     icon: <ShieldCheck size={14} strokeWidth={2.2} /> },
            { name: 'Consistency',  key: 'consistency'  as const, category: 'consistency',  icon: <GitCompare size={14} strokeWidth={2.2} /> },
            { name: 'Timeliness',   key: 'timeliness'   as const, category: 'timeliness',   icon: <Clock size={14} strokeWidth={2.2} /> },
            { name: 'Uniqueness',   key: 'uniqueness'   as const, category: 'uniqueness',   icon: <Fingerprint size={14} strokeWidth={2.2} /> },
          ] as { name: string; key: keyof DimensionScores; category: string; icon: React.ReactNode }[]).map(d => {
            const val = stats.dimensions[d.key]
            const color = scoreColor(val)
            return (
              <Link key={d.name} href={`/rules?category=${d.category}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--surface-muted)', borderRadius: '10px', padding: '14px 10px', border: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                    <RingGauge value={val} size={60} stroke={5} color={color} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.5px' }}>
                        {val !== null ? val : '—'}{val !== null && <span style={{ fontSize: '9px' }}>%</span>}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ color }}>{d.icon}</span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{d.name}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Trend + Failing Rules */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px', marginBottom: '12px' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <SectionHeader icon={<Activity size={13} strokeWidth={2.4} />} title={`Quality Trend · ${timeFilter}`} />
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Incidents</span></div>
            </div>
          </div>
          <TrendChart data={trendData} />
        </div>

        <div style={card}>
          <SectionHeader
            icon={<AlertTriangle size={13} strokeWidth={2.4} />}
            title="Top Failing Rules"
            action={<Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {stats.failingRules.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '24px 8px', textAlign: 'center' }}>
                <CheckCircle2 size={20} color="#16a34a" strokeWidth={2} />
                No failing rules
              </div>
            ) : stats.failingRules.map((rule, i) => (
              <Link key={i} href="/rules" style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, marginTop: '1px',
                    background: rule.severity === 'critical' ? 'var(--status-error-bg)' : 'var(--status-warn-bg)',
                    color: rule.severity === 'critical' ? 'var(--status-error-text)' : 'var(--status-warn-text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AlertTriangle size={12} strokeWidth={2.4} />
                  </div>
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
      <div style={{ ...card, marginBottom: '12px' }}>
        <SectionHeader
          icon={<Database size={13} strokeWidth={2.4} />}
          title="Datasets Requiring Attention"
          action={<Link href="/datasets" style={{ fontSize: '12.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all {stats.totalAssets} →</Link>}
        />
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
                <td colSpan={5} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={20} color="#16a34a" strokeWidth={2} />
                    All datasets healthy
                  </div>
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
                  <td style={{ padding: '8px 12px' }}>
                    {parts.length > 1
                      ? <><span style={{ color: 'var(--text-muted)' }}>{parts[0]}.</span><span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{parts.slice(1).join('.')}</span></>
                      : <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{ds.asset_name}</span>
                    }
                  </td>
                  <td style={{ padding: '8px 12px' }}><ScorePill score={ds.score} /></td>
                  <td style={{ padding: '8px 12px', color: deltaColor, fontWeight: 600 }}>{deltaLabel}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{ds.domain_name}</td>
                  <td style={{ padding: '8px 12px' }}><ChevronRight size={14} color="var(--accent)" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Live results if available */}
      {stats.recentChecks.length > 0 && (
        <div style={{ ...card, marginBottom: '12px' }}>
          <SectionHeader
            icon={<Activity size={13} strokeWidth={2.4} />}
            title="Your Latest Check Results"
            action={<span style={{ fontSize: '11px', color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: '20px', fontWeight: 600 }}>LIVE</span>}
          />
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
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: c.status === 'passed' ? '#dcfce7' : c.status === 'failed' ? '#fee2e2' : '#fef3c7',
                      color: c.status === 'passed' ? '#16a34a' : c.status === 'failed' ? '#dc2626' : '#ea8b3a',
                      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase'
                    }}>
                      {c.status === 'passed' ? <CheckCircle2 size={11} strokeWidth={2.6} /> : c.status === 'failed' ? <XCircle size={11} strokeWidth={2.6} /> : <AlertTriangle size={11} strokeWidth={2.6} />}
                      {c.status}
                    </span>
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

const card: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '14px', padding: '18px 20px', border: '1px solid var(--border)',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
}
const kpiTile: React.CSSProperties = {
  background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)',
  padding: '14px 16px', height: '100%', cursor: 'pointer', transition: 'border-color 0.15s',
}
const kpiLabel: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 500 }
const kpiIconWrap: React.CSSProperties = {
  width: '22px', height: '22px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
