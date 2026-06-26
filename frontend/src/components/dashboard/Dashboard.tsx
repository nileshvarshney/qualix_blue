'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Gauge, AlertTriangle, Database, ShieldCheck, Activity, GitCompare, Fingerprint,
  Target, ListChecks, Clock, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp,
  TrendingDown, Eye, Users, Lock, Layers,
} from 'lucide-react'
import { DashboardStats, DimensionScores, TrendPoint, Connection } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'


const TIME_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
]

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

function SkeletonBar({ width, height = '14px' }: { width: string; height?: string }) {
  return (
    <div style={{
      width, height, borderRadius: '4px', background: 'var(--surface-muted)',
      animation: 'qx-pulse 1.4s ease-in-out infinite',
    }} />
  )
}

function HeroSkeleton() {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'stretch', gap: '24px', padding: '20px 24px', marginBottom: '12px', flexWrap: 'wrap' }}>
      <style>{'@keyframes qx-pulse { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
        <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: 'var(--surface-muted)', animation: 'qx-pulse 1.4s ease-in-out infinite' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
          <SkeletonBar width="120px" />
          <SkeletonBar width="150px" height="5px" />
        </div>
      </div>
      <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch' }} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...kpiTile, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SkeletonBar width="80px" height="11px" />
            <SkeletonBar width="50px" height="22px" />
            <SkeletonBar width="110px" height="11px" />
          </div>
        ))}
      </div>
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
interface DomainOption { domain_id: string; domain_name: string }

function MiniTrendChart({ data }: { data: { date: string; score: number | null; failed: number }[] }) {
  const pts = data.filter(d => d.score !== null) as { date: string; score: number; failed: number }[]
  if (pts.length < 2) {
    return <div style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No data</div>
  }
  const W = 240, H = 52, padX = 4, padY = 6
  const scores = pts.map(p => p.score)
  const minS = Math.max(0, Math.min(...scores) - 5)
  const maxS = 100
  const x = (i: number) => padX + (i / (pts.length - 1)) * (W - padX * 2)
  const y = (s: number) => padY + (1 - (s - minS) / (maxS - minS)) * (H - padY * 2)
  const lastS = pts[pts.length - 1].score
  const lineColor = lastS >= 90 ? '#16a34a' : lastS >= 75 ? '#ea8b3a' : '#dc2626'
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const maxFailed = Math.max(...pts.map(p => p.failed), 1)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: '52px' }}>
      {/* Failed bars */}
      {pts.map((p, i) => p.failed > 0 && (
        <rect key={i}
          x={x(i) - 2} width={4}
          y={H - (p.failed / maxFailed) * (H * 0.35)}
          height={(p.failed / maxFailed) * (H * 0.35)}
          fill="#ef444466" rx={1} />
      ))}
      {/* Area fill */}
      <path d={areaD} fill={lineColor} fillOpacity={0.12} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      <circle cx={x(pts.length - 1)} cy={y(lastS)} r={3} fill={lineColor} />
    </svg>
  )
}

const ACTIVE_CONN_KEY = 'qualix-active-conn'

function switchToConnection(id: string) {
  try { localStorage.setItem(ACTIVE_CONN_KEY, id) } catch {}
  window.dispatchEvent(new CustomEvent('qualix-active-conn-changed', { detail: id }))
}

const DB_TYPE_COLORS: Record<string, string> = {
  snowflake: '#29B5E8', postgresql: '#336791', mysql: '#4479A1', bigquery: '#4285F4',
  redshift: '#8C4FFF', databricks: '#FF3621', sqlserver: '#CC2927', oracle: '#F80000',
  mongodb: '#4DB33D', s3: '#FF9900', gcs: '#4285F4', azureblob: '#0089D6',
}

function ConnTypeBadge({ type }: { type: string }) {
  const color = DB_TYPE_COLORS[type] ?? '#6b7280'
  return (
    <span style={{
      background: `${color}18`, color, border: `1px solid ${color}44`,
      padding: '1px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {type}
    </span>
  )
}

function ConnectionCard({ conn, stats, loading, isActive: isSelected, onSelect }: {
  conn: Connection
  stats: Partial<DashboardStats> | undefined
  loading: boolean
  isActive: boolean
  onSelect: () => void
}) {
  const score = stats?.overallScore ?? null
  const color = scoreColor(score)
  const assets = stats?.totalAssets ?? 0
  const issues = stats?.openAlerts ?? 0
  const passed = stats?.passed ?? 0
  const failed = stats?.failed ?? 0
  const isActive = conn.status === 'active'

  return (
    <div
      onClick={onSelect}
      style={{
        background: isSelected ? 'var(--accent-bg)' : 'var(--surface-muted)',
        borderRadius: '12px',
        border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        padding: isSelected ? '13px 15px' : '14px 16px',
        cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', gap: '12px',
        boxShadow: isSelected ? '0 0 0 3px var(--accent-bg)' : 'none',
      }}
      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {conn.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <ConnTypeBadge type={conn.type} />
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
              background: isActive ? 'var(--status-ok-bg)' : 'var(--surface-muted)',
              color: isActive ? 'var(--status-ok-text)' : 'var(--text-muted)',
            }}>
              {isActive ? 'active' : 'inactive'}
            </span>
          </div>
        </div>
        {/* Mini score ring */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RingGauge value={loading ? null : score} size={52} stroke={5} color={color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: loading ? 'var(--text-muted)' : 'var(--foreground)', letterSpacing: '-0.5px' }}>
              {loading ? '—' : score !== null ? score.toFixed(0) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Datasets</span>
          <span style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '15px' }}>{loading ? '—' : assets}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</span>
          <span style={{ fontWeight: 700, fontSize: '15px', color: loading ? 'var(--text-muted)' : issues > 0 ? 'var(--status-error-text)' : '#16a34a' }}>
            {loading ? '—' : issues}
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</span>
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            {loading ? '—' : (
              <><span style={{ color: '#16a34a', fontWeight: 700 }}>{passed}✓</span>{' '}<span style={{ color: '#dc2626', fontWeight: 700 }}>{failed}✗</span></>
            )}
          </span>
        </div>
      </div>

      {/* Score bar */}
      {!loading && (passed + failed > 0) && (
        <div style={{ display: 'flex', height: '3px', borderRadius: '2px', overflow: 'hidden', gap: '1px' }}>
          <div style={{ background: '#16a34a', flex: passed }} />
          <div style={{ background: '#dc2626', flex: failed }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
        View details <ChevronRight size={11} />
      </div>
    </div>
  )
}

export default function Dashboard({ stats, loading = false, activeConnectionId = '' }: { stats: DashboardStats; loading?: boolean; activeConnectionId?: string }) {
  const [running, setRunning] = useState(false)
  const [runMessage, setRunMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [timeFilter, setTimeFilter] = useState('Last 7 days')
  const [domainFilter, setDomainFilter] = useState('All domains')
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>(stats.trend)
  const [trendLoading, setTrendLoading] = useState(false)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null)
  const [slaPredictions, setSlaPredictions] = useState<{ is_at_risk: boolean; breach_day: number | null }[]>([])
  const [slaLoading, setSlaLoading] = useState(true)
  const [freshness, setFreshness]               = useState<{ status: string }[]>([])
  const [freshnessLoading, setFreshnessLoading] = useState(true)
  const [ownershipScores, setOwnershipScores]   = useState<{ ownership_score: number }[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [stewardshipLoading, setStewardshipLoading] = useState(true)
  const [complianceFrameworks, setComplianceFrameworks] = useState<{ status: string }[]>([])
  const [complianceLoading, setComplianceLoading] = useState(true)
  const [piiExposure, setPiiExposure]           = useState<{ unprotected_pii_tables: number } | null>(null)
  const [privacyLoading, setPrivacyLoading]     = useState(true)
  const [connections, setConnections]           = useState<Connection[]>([])
  const [connStats, setConnStats]               = useState<Record<string, Partial<DashboardStats>>>({})
  const [connStatsLoading, setConnStatsLoading] = useState(false)
  const router = useRouter()

  const days = TIME_OPTIONS.find(o => o.label === timeFilter)?.days ?? 7
  const domainId = domains.find(d => d.domain_name === domainFilter)?.domain_id ?? ''

  useEffect(() => {
    const url = activeConnectionId ? `/api/alerts?connection_id=${activeConnectionId}` : '/api/alerts'
    fetch(url)
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
  }, [activeConnectionId])

  useEffect(() => {
    fetch('/api/monitoring/sla-predictions')
      .then(r => r.json())
      .then((data: unknown) => setSlaPredictions(Array.isArray(data) ? data as { is_at_risk: boolean; breach_day: number | null }[] : []))
      .catch(() => {})
      .finally(() => setSlaLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/observability/freshness-board')
      .then(r => r.json())
      .then((d: unknown) => setFreshness(Array.isArray(d) ? (d as { status: string }[]) : []))
      .catch(() => {})
      .finally(() => setFreshnessLoading(false))
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/governance/scorecards').then(r => r.json()).catch(() => []),
      fetch('/api/governance/approvals?status=pending').then(r => r.json()).catch(() => []),
    ]).then(([scores, approvals]: [unknown, unknown]) => {
      setOwnershipScores(Array.isArray(scores) ? (scores as { ownership_score: number }[]) : [])
      setPendingApprovals(Array.isArray(approvals) ? approvals.length : 0)
      setStewardshipLoading(false)
    }).catch(() => setStewardshipLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/compliance')
      .then(r => r.json())
      .then((d: unknown) => setComplianceFrameworks(Array.isArray(d) ? (d as { status: string }[]) : []))
      .catch(() => {})
      .finally(() => setComplianceLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/privacy/pii-exposure')
      .then(r => r.json())
      .then((d: { unprotected_pii_tables?: number }) => setPiiExposure({ unprotected_pii_tables: d?.unprotected_pii_tables ?? 0 }))
      .catch(() => setPiiExposure({ unprotected_pii_tables: 0 }))
      .finally(() => setPrivacyLoading(false))
  }, [])

  useEffect(() => {
    apiFetch('/api/domains-list')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data)) return
        setDomains(
          data
            .map(d => ({ domain_id: String(d.domain_id ?? ''), domain_name: String(d.domain_name ?? d.name ?? '') }))
            .filter(d => d.domain_id)
        )
      })
      .catch(() => {})
  }, [])

  // Load per-connection stats (always — shown as a persistent breakdown bar)
  useEffect(() => {
    apiFetch('/api/connections')
      .then(r => r.json())
      .then((data: Connection[]) => {
        const conns = Array.isArray(data) ? data.filter(c => c.status === 'active') : []
        setConnections(conns)
        if (conns.length === 0) return
        setConnStatsLoading(true)
        Promise.all(
          conns.map(c =>
            apiFetch(`/api/dashboard?connection_id=${c.id}`)
              .then(r => r.json())
              .catch(() => null)
          )
        ).then(results => {
          const map: Record<string, Partial<DashboardStats>> = {}
          conns.forEach((c, i) => { if (results[i]) map[c.id] = results[i] as Partial<DashboardStats> })
          setConnStats(map)
        }).finally(() => setConnStatsLoading(false))
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setTrendLoading(true)
    let url: string
    if (domainId) {
      url = `/api/dashboard/history/domain/${domainId}?days=${days}`
    } else {
      const params = new URLSearchParams({ days: String(days) })
      if (activeConnectionId) params.set('connection_id', activeConnectionId)
      url = `/api/dashboard/trend?${params.toString()}`
    }
    apiFetch(url)
      .then(r => r.json())
      .then((data: { trend?: TrendPoint[]; history?: TrendPoint[] }) => setTrend(data.trend ?? data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setTrendLoading(false))
  }, [days, domainId, activeConnectionId])

  async function runCheck() {
    setRunning(true)
    setRunMessage(null)
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunMessage({ text: data.error || data.message || 'Failed to start check', isError: true })
      } else if (data.total === 0) {
        setRunMessage({ text: 'No active rules to run', isError: false })
      } else {
        setRunMessage({ text: `Queued ${data.total} rule check${data.total !== 1 ? 's' : ''}`, isError: false })
        router.refresh()
      }
    } catch {
      setRunMessage({ text: 'Failed to start check', isError: true })
    } finally {
      setRunning(false)
    }
  }

  const score = stats.overallScore
  const healthyAssets = Math.max(stats.totalAssets - stats.atRiskTables.length, 0)
  const slaAtRisk    = slaPredictions.filter(p => p.is_at_risk && p.breach_day === null).length
  const slaBreached  = slaPredictions.filter(p => p.breach_day !== null).length

  const freshnessOnTime   = freshness.filter(f => f.status === 'on_time').length
  const freshnessAtRisk   = freshness.filter(f => f.status === 'at_risk').length
  const freshnessBreached = freshness.filter(f => f.status === 'breached').length

  const avgOwnership = ownershipScores.length > 0
    ? Math.round(ownershipScores.reduce((s, d) => s + (d.ownership_score ?? 0), 0) / ownershipScores.length)
    : null

  const complianceCompliantCount   = complianceFrameworks.filter(f => f.status === 'compliant').length
  const complianceHasNonCompliant  = complianceFrameworks.some(f => f.status === 'non-compliant')
  const complianceHasPartial       = complianceFrameworks.some(f => f.status === 'partial')

  const piiCount = piiExposure?.unprotected_pii_tables ?? 0

  // Use the first and last days that actually have a score — a day with no
  // checks run yet (score: null) isn't a real "0", so it shouldn't be treated
  // as one when computing the trend delta.
  const scoredDays = trend.filter(t => t.score !== null)
  const weeklyDelta: number | null = scoredDays.length >= 2
    ? (scoredDays[scoredDays.length - 1].score! - scoredDays[0].score!)
    : null

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
                {loading ? <span>Loading…</span> : (
                  <>
                    <span>{formatNumber(stats.totalAssets)} datasets</span>
                    <span style={{ color: 'var(--border-strong)' }}>·</span>
                    <span>{stats.totalRules} active rules</span>
                    <span style={{ color: 'var(--border-strong)' }}>·</span>
                    <span style={{ color: stats.openAlerts > 0 ? 'var(--status-error-text)' : 'var(--text-muted)', fontWeight: stats.openAlerts > 0 ? 600 : 400 }}>
                      {stats.openAlerts} open issues
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {runMessage && (
            <span style={{
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: runMessage.isError ? 'var(--status-error-text)' : 'var(--status-ok-text)',
            }}>
              {runMessage.text}
            </span>
          )}
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

      {/* Hero: score gauge + KPI tiles */}
      {loading ? <HeroSkeleton /> : (
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
            {weeklyDelta !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  background: weeklyDelta >= 0 ? 'var(--status-ok-bg)' : 'var(--status-error-bg)',
                  color: weeklyDelta >= 0 ? 'var(--status-ok-text)' : 'var(--status-error-text)',
                  padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                }}>
                  {weeklyDelta >= 0
                    ? <TrendingUp size={11} strokeWidth={2.6} />
                    : <TrendingDown size={11} strokeWidth={2.6} />}
                  {weeklyDelta >= 0 ? '+' : ''}{weeklyDelta.toFixed(1)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>vs period start</span>
              </div>
            )}
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
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          {/* Open Issues — this tile shows alert counts (openAlerts/criticalAlerts/mediumAlerts),
              so it must link to /alerts, not the separate Issues tracker, or the destination
              page won't match what the tile just showed. */}
          <Link href={stats.criticalAlerts > 0 ? '/alerts?severity=critical' : '/alerts'} style={{ textDecoration: 'none' }}>
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

          {/* Datasets monitored — /datasets is a bare redirect to /asset-registry, which
              opens to a blank "select an asset" tree with no context. Link straight there. */}
          <Link href="/asset-registry" style={{ textDecoration: 'none' }}>
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

          {/* SLA Health */}
          <Link href="/observability" style={{ textDecoration: 'none' }}>
            <div style={kpiTile}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={kpiLabel}>SLA Health</span>
                <div style={{
                  ...kpiIconWrap,
                  background: slaLoading ? 'var(--surface-muted)' : slaBreached > 0 ? 'var(--status-error-bg)' : slaAtRisk > 0 ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      slaLoading ? 'var(--text-muted)'    : slaBreached > 0 ? 'var(--status-error-text)' : slaAtRisk > 0 ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  <ShieldCheck size={13} strokeWidth={2.4} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: slaLoading ? 'var(--text-muted)' : 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1, marginBottom: '8px' }}>
                {slaLoading ? '—' : slaPredictions.length}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {slaLoading ? 'Loading…' : slaBreached > 0
                  ? <><span style={{ color: '#dc2626', fontWeight: 600 }}>{slaBreached} breached</span>{slaAtRisk > 0 && <> · <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{slaAtRisk} at risk</span></>}</>
                  : slaAtRisk > 0
                  ? <span style={{ color: '#ea8b3a', fontWeight: 600 }}>{slaAtRisk} at risk</span>
                  : <span style={{ color: '#16a34a', fontWeight: 600 }}>All on track</span>
                }
              </div>
              <div style={{ background: slaBreached > 0 ? '#fee2e2' : slaAtRisk > 0 ? '#fef3c7' : '#dcfce7', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: `${!slaLoading && slaPredictions.length > 0 ? ((slaBreached + slaAtRisk) / slaPredictions.length) * 100 : 0}%`,
                  height: '100%',
                  background: slaBreached > 0 ? '#dc2626' : '#ea8b3a',
                }} />
              </div>
            </div>
          </Link>
        </div>
      </div>
      )}

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

      {/* Connection Breakdown — only when All Connections is selected */}
      {!activeConnectionId && connections.length > 0 && (
        <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
          <SectionHeader
            icon={<Layers size={13} strokeWidth={2.4} />}
            title="Connection Breakdown"
            action={<Link href="/connections" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Manage →</Link>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(connections.length, 6)}, 1fr)`, gap: '12px' }}>
            {connections.map(conn => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                stats={connStats[conn.id]}
                loading={connStatsLoading && !connStats[conn.id]}
                isActive={activeConnectionId === conn.id}
                onSelect={() => switchToConnection(conn.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Platform Health */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
        <SectionHeader
          icon={<Activity size={13} strokeWidth={2.4} />}
          title="Platform Health"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>

          {/* Observability */}
          <Link href="/observability" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Eye size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Observability</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: freshnessLoading ? 'var(--surface-muted)' : freshnessBreached > 0 ? 'var(--status-error-bg)' : freshnessAtRisk > 0 ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      freshnessLoading ? 'var(--text-muted)'    : freshnessBreached > 0 ? 'var(--status-error-text)' : freshnessAtRisk > 0 ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  {freshnessLoading ? '—' : freshnessBreached > 0 ? 'Breached' : freshnessAtRisk > 0 ? 'At risk' : 'Healthy'}
                </span>
              </div>
              <div style={platformMetric}>
                {freshnessLoading ? '—'
                  : freshness.length === 0 ? 'No data'
                  : `${freshnessOnTime} on-time · ${freshnessAtRisk} at-risk · ${freshnessBreached} breached`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Stewardship */}
          <Link href="/stewardship" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Users size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Stewardship</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: stewardshipLoading ? 'var(--surface-muted)' : avgOwnership === null ? 'var(--surface-muted)' : avgOwnership >= 90 && pendingApprovals === 0 ? 'var(--status-ok-bg)' : avgOwnership >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)',
                  color:      stewardshipLoading ? 'var(--text-muted)'    : avgOwnership === null ? 'var(--text-muted)' : avgOwnership >= 90 && pendingApprovals === 0 ? 'var(--status-ok-text)' : avgOwnership >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)',
                }}>
                  {stewardshipLoading ? '—' : avgOwnership === null ? 'No data' : avgOwnership >= 90 && pendingApprovals === 0 ? 'Healthy' : avgOwnership >= 75 ? 'Review' : 'Low'}
                </span>
              </div>
              <div style={platformMetric}>
                {stewardshipLoading ? '—'
                  : avgOwnership === null ? 'No ownership data'
                  : `${avgOwnership}% ownership · ${pendingApprovals} pending approval${pendingApprovals !== 1 ? 's' : ''}`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Compliance */}
          <Link href="/compliance" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><ShieldCheck size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Compliance</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: complianceLoading ? 'var(--surface-muted)' : complianceHasNonCompliant ? 'var(--status-error-bg)' : complianceHasPartial ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)',
                  color:      complianceLoading ? 'var(--text-muted)'    : complianceHasNonCompliant ? 'var(--status-error-text)' : complianceHasPartial ? 'var(--status-warn-text)' : 'var(--status-ok-text)',
                }}>
                  {complianceLoading ? '—' : complianceHasNonCompliant ? 'Failing' : complianceHasPartial ? 'Partial' : 'Compliant'}
                </span>
              </div>
              <div style={platformMetric}>
                {complianceLoading ? '—'
                  : complianceFrameworks.length === 0 ? 'No frameworks'
                  : `${complianceCompliantCount} / ${complianceFrameworks.length} framework${complianceFrameworks.length !== 1 ? 's' : ''} compliant`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

          {/* Privacy */}
          <Link href="/privacy" style={{ textDecoration: 'none' }}>
            <div style={platformTile}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ ...platformIconWrap, background: 'var(--accent-bg)', color: 'var(--accent)' }}><Lock size={13} strokeWidth={2.2} /></div>
                  <span style={platformLabel}>Privacy</span>
                </div>
                <span style={{
                  ...statusPill,
                  background: privacyLoading ? 'var(--surface-muted)' : piiCount > 0 ? 'var(--status-error-bg)' : 'var(--status-ok-bg)',
                  color:      privacyLoading ? 'var(--text-muted)'    : piiCount > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)',
                }}>
                  {privacyLoading ? '—' : piiCount > 0 ? 'Exposed' : 'Protected'}
                </span>
              </div>
              <div style={platformMetric}>
                {privacyLoading ? '—'
                  : piiExposure === null ? 'Loading…'
                  : piiCount === 0 ? 'All PII tables protected'
                  : `${piiCount} unprotected PII table${piiCount !== 1 ? 's' : ''}`}
              </div>
              <div style={platformLink}>View details <ChevronRight size={11} /></div>
            </div>
          </Link>

        </div>
      </div>

      {/* Six Dimensions */}
      {(() => {
        const DIMS = [
          { name: 'Completeness', key: 'completeness' as const, category: 'completeness', icon: <ListChecks size={14} strokeWidth={2.2} /> },
          { name: 'Accuracy',     key: 'accuracy'     as const, category: 'accuracy',     icon: <Target size={14} strokeWidth={2.2} /> },
          { name: 'Validity',     key: 'validity'     as const, category: 'validity',     icon: <ShieldCheck size={14} strokeWidth={2.2} /> },
          { name: 'Consistency',  key: 'consistency'  as const, category: 'consistency',  icon: <GitCompare size={14} strokeWidth={2.2} /> },
          { name: 'Timeliness',   key: 'timeliness'   as const, category: 'timeliness',   icon: <Clock size={14} strokeWidth={2.2} /> },
          { name: 'Uniqueness',   key: 'uniqueness'   as const, category: 'uniqueness',   icon: <Fingerprint size={14} strokeWidth={2.2} /> },
        ] as { name: string; key: keyof DimensionScores; category: string; icon: React.ReactNode }[]

        const showMatrix = !activeConnectionId && connections.length > 1

        return (
          <div style={{ ...card, padding: '16px 18px', marginBottom: '12px' }}>
            <SectionHeader
              icon={<Target size={13} strokeWidth={2.4} />}
              title="Six Dimensions of Quality"
              action={
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {loading ? '— active rules' : `${stats.totalRules} active rules`} · <Link href="/rules" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>view all →</Link>
                </div>
              }
            />

            {showMatrix ? (
              /* ── Per-connection matrix ── */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', minWidth: '140px' }}>Connection</th>
                      {DIMS.map(d => (
                        <th key={d.key} style={{ textAlign: 'center', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>
                          <Link href={`/rules?category=${d.category}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {d.icon} {d.name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map(conn => {
                      const cs = connStats[conn.id]
                      const isLoading = connStatsLoading && !cs
                      const isRowActive = activeConnectionId === conn.id
                      return (
                        <tr
                          key={conn.id}
                          onClick={() => switchToConnection(conn.id)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isRowActive ? 'var(--accent-bg)' : 'transparent',
                            cursor: 'pointer', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => { if (!isRowActive) e.currentTarget.style.background = 'var(--surface-muted)' }}
                          onMouseLeave={e => { if (!isRowActive) e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <ConnTypeBadge type={conn.type} />
                              <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                                {conn.name}
                              </span>
                            </div>
                          </td>
                          {DIMS.map(d => {
                            const val = cs?.dimensions?.[d.key] ?? null
                            const bg = isLoading || val === null ? 'var(--surface-muted)' : val >= 90 ? '#dcfce7' : val >= 75 ? '#fef3c7' : '#fee2e2'
                            const color = isLoading || val === null ? 'var(--text-muted)' : val >= 90 ? '#16a34a' : val >= 75 ? '#b45309' : '#dc2626'
                            return (
                              <td key={d.key} style={{ padding: '10px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: bg, color, borderRadius: '6px',
                                  padding: '3px 10px', fontSize: '12px', fontWeight: 700,
                                  minWidth: '40px',
                                }}>
                                  {isLoading ? '—' : val !== null ? `${val}` : '—'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── Single-connection ring gauges ── */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '10px' }}>
                {DIMS.map(d => {
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
            )}
          </div>
        )
      })()}

      {/* Trend + Failing Rules */}
      <style>{'@media (max-width: 760px) { .qx-trend-grid { grid-template-columns: 1fr !important; } }'}</style>
      <div className="qx-trend-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px', marginBottom: '12px' }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 2px 6px rgba(45,90,158,0.25)',
              }}>
                <Activity size={14} strokeWidth={2.4} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.2px', lineHeight: 1.2 }}>
                  {days}-Day Quality Trend
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {timeFilter}
                  {domainFilter !== 'All domains' && (
                    <span style={{
                      marginLeft: '6px', background: 'var(--accent-bg)', color: 'var(--accent)',
                      padding: '1px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '10.5px',
                    }}>
                      {domainFilter}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Failed runs</span></div>
              </div>
              <Dropdown label="time" options={TIME_OPTIONS.map(o => o.label)} value={timeFilter} onChange={setTimeFilter} />
              <Dropdown label="domain" options={['All domains', ...domains.map(d => d.domain_name)]} value={domainFilter} onChange={setDomainFilter} />
            </div>
          </div>

          {/* Per-connection trend grid when All Connections selected */}
          {!activeConnectionId && connections.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(connections.length, 3)}, 1fr)`, gap: '10px' }}>
              {connections.map(conn => {
                const cs = connStats[conn.id]
                const connTrend = cs?.trend ?? []
                const scored = connTrend.filter(t => t.score !== null)
                const lastScore = scored.length > 0 ? scored[scored.length - 1].score ?? null : null
                const delta = scored.length >= 2 ? (scored[scored.length - 1].score! - scored[0].score!) : null
                const isRowActive = activeConnectionId === conn.id
                return (
                  <div
                    key={conn.id}
                    onClick={() => switchToConnection(conn.id)}
                    style={{
                      background: isRowActive ? 'var(--accent-bg)' : 'var(--surface-muted)',
                      border: `1px solid ${isRowActive ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isRowActive) { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'var(--accent)' } }}
                    onMouseLeave={e => { if (!isRowActive) { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conn.name}</div>
                        <ConnTypeBadge type={conn.type} />
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: lastScore === null ? 'var(--text-muted)' : scoreColor(lastScore), letterSpacing: '-0.5px', lineHeight: 1 }}>
                          {connStatsLoading && !cs ? '—' : lastScore !== null ? lastScore.toFixed(1) : '—'}
                        </div>
                        {delta !== null && (
                          <div style={{ fontSize: '10px', fontWeight: 700, color: delta >= 0 ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
                            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>
                    {connStatsLoading && !cs
                      ? <div style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>Loading…</div>
                      : <MiniTrendChart data={connTrend} />
                    }
                  </div>
                )
              })}
            </div>
          ) : (
            trendLoading
              ? <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
              : <TrendChart data={trend} onPointClick={setDrilldownDate} />
          )}

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            {!activeConnectionId && connections.length > 0
              ? 'Click any connection to drill into its full trend.'
              : 'Click any point on the chart to see that day\'s failed runs, alerts, and anomalies.'}
          </div>
        </div>

        <div style={card}>
          <SectionHeader
            icon={<AlertTriangle size={13} strokeWidth={2.4} />}
            title="Top Failing Rules"
            action={<Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 8px' }}>
                {[0, 1, 2].map(i => <SkeletonBar key={i} width="100%" height="32px" />)}
              </div>
            ) : stats.failingRules.length === 0 ? (
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
          action={<Link href="/asset-registry" style={{ fontSize: '12.5px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all {stats.totalAssets} →</Link>}
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
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '16px 12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[0, 1, 2].map(i => <SkeletonBar key={i} width="100%" height="20px" />)}
                  </div>
                </td>
              </tr>
            ) : stats.atRiskTables.length === 0 ? (
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
                  onClick={() => router.push(`/asset-registry?q=${encodeURIComponent(parts[parts.length - 1])}`)}>
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
      <TrendDrilldownPanel date={drilldownDate} scope={domainId ? { domainId } : {}} onClose={() => setDrilldownDate(null)} />
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
const platformTile: React.CSSProperties = {
  background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)',
  padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
}
const platformIconWrap: React.CSSProperties = {
  width: '22px', height: '22px', borderRadius: '6px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const platformLabel: React.CSSProperties = { fontSize: '12.5px', fontWeight: 700, color: 'var(--foreground)' }
const platformMetric: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '10px', minHeight: '16px' }
const platformLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '2px',
  fontSize: '11px', color: 'var(--accent)', fontWeight: 600,
}
const statusPill: React.CSSProperties = {
  padding: '2px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap',
}
