'use client'
import { useState, useMemo, useEffect } from 'react'
import { Report, CheckResult } from '@/lib/types'
import { formatDateTime, formatNumber, categoryColors } from '@/lib/utils'
import { useRouter } from 'next/navigation'

/* ── Config ──────────────────────────────────────────────────────── */

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
  { id: 'quality',   label: 'Quality Check',     icon: '🛡️', desc: 'Run all active quality rules and score every dataset' },
  { id: 'freshness', label: 'Freshness Report',   icon: '⏱️', desc: 'Check all SLA freshness targets across connections' },
  { id: 'anomaly',   label: 'Anomaly Summary',    icon: '📡', desc: 'Summarise all open anomalies by severity and domain' },
  { id: 'sla',       label: 'SLA Compliance',     icon: '📋', desc: 'Report adherence against every defined SLA' },
  { id: 'lineage',   label: 'Lineage Impact',     icon: '🔗', desc: 'Show downstream impact of datasets with open issues' },
  { id: 'custom',    label: 'Custom Report',      icon: '✨', desc: 'Pick specific datasets, rules, and date range' },
]

const FORMATS = [
  { id: 'web',  label: 'Web Report', icon: '🌐' },
  { id: 'pdf',  label: 'PDF',        icon: '📄' },
  { id: 'csv',  label: 'CSV Export', icon: '📊' },
  { id: 'json', label: 'JSON',       icon: '{ }' },
]

const DOMAINS   = ['All Domains', 'Finance', 'Marketing', 'Supply Chain', 'Catalog', 'Operations']

const DATASETS_BY_DOMAIN: Record<string, string[]> = {
  'Finance':      ['SALES_ORDERS', 'FINANCE_TRANSACTIONS'],
  'Marketing':    ['CUSTOMERS'],
  'Supply Chain': ['INVENTORY', 'PURCHASE_ORDERS', 'PURCHASE_ORDER_ITEMS', 'SUPPLIERS'],
  'Catalog':      ['PRODUCTS', 'PRODUCT_CATEGORIES'],
  'Operations':   ['RETURNS', 'WAREHOUSES', 'CARRIERS'],
}
const ALL_DATASETS = Object.values(DATASETS_BY_DOMAIN).flat()
const DATE_RANGES = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Custom range']

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }
const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
const sel: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }

const scoreColor = (s: number) => s >= 90 ? '#16a34a' : s >= 75 ? '#ea8b3a' : '#dc2626'
const scoreBg = (s: number) => s >= 90 ? '#dcfce7' : s >= 75 ? '#fef3c7' : '#fee2e2'

function ruleTypeLabel(type?: string): string {
  if (!type) return 'Check'
  const map: Record<string, string> = {
    not_null: 'Not Null', unique: 'Unique', range: 'Range', regex: 'Regex',
    custom_sql: 'Custom SQL', freshness: 'Freshness', row_count: 'Row Count',
    referential: 'Referential', null_check: 'Null Check', uniqueness_check: 'Uniqueness',
    duplicate_check: 'Duplicate', accepted_values_check: 'Accepted Values',
    range_check: 'Range', freshness_check: 'Freshness', volume_check: 'Volume',
    schema_drift_check: 'Schema Drift', referential_integrity_check: 'Ref. Integrity',
    regex_check: 'Regex', business_rule_check: 'Business Rule', custom_sql_check: 'Custom SQL',
    semantic_consistency_check: 'Semantic', referential_sanity_check: 'Ref. Sanity',
    business_metric_check: 'Business Metric', distribution_consistency_check: 'Distribution',
    llm_semantic_check: 'LLM Semantic',
  }
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ── Main Component ──────────────────────────────────────────────── */

export default function ReportsClient({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(
    initialReports.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
  )
  const [selected, setSelected] = useState<Report | null>(reports[0] || null)

  // Sync when parent provides new data (async load)
  useEffect(() => {
    if (initialReports.length > 0) {
      const sorted = [...initialReports].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      setReports(sorted)
      setSelected(sorted[0] || null)
    }
  }, [initialReports])
  const [running, setRunning] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [expandedResult, setExpandedResult] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed' | 'warning'>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'generic' | 'object-specific'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [resultSearch, setResultSearch] = useState('')
  const [form, setForm] = useState({
    name: '', type: 'quality', format: 'web',
    domain: 'All Domains', dataset: 'All Datasets',
    dateRange: 'Last 7 days', includeAnomalies: true,
    includeSLAs: true, includeLineage: false, notify: false,
  })
  const router = useRouter()

  /* ── Analytics ──────────────────────────────────────────────── */

  const analytics = useMemo(() => {
    const totalRuns = reports.length
    const avgScore = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.overallScore, 0) / reports.length) : 0
    // Use selected report counts so KPI cards match the filtered results when clicked
    const src = selected || reports[0]
    const totalPassed = src ? src.passed : 0
    const totalFailed = src ? src.failed : 0
    const totalWarnings = src ? src.warnings : 0
    const totalChecks = src ? src.totalChecks : 0
    return { totalRuns, avgScore, totalPassed, totalFailed, totalWarnings, totalChecks }
  }, [reports, selected])

  const filteredResults = useMemo(() => {
    if (!selected) return []
    let results = selected.results
    if (statusFilter !== 'all') results = results.filter(r => r.status === statusFilter)
    if (scopeFilter !== 'all') results = results.filter(r => (r.scope || 'generic') === scopeFilter)
    if (categoryFilter !== 'all') results = results.filter(r => r.ruleCategory === categoryFilter)
    if (resultSearch.trim()) {
      const q = resultSearch.toLowerCase()
      results = results.filter(r =>
        r.ruleName.toLowerCase().includes(q) ||
        r.tableName.toLowerCase().includes(q) ||
        (r.columnName && r.columnName.toLowerCase().includes(q)) ||
        (r.ruleType && r.ruleType.toLowerCase().includes(q))
      )
    }
    return results
  }, [selected, statusFilter, scopeFilter, categoryFilter, resultSearch])

  /* Category breakdown for selected report */
  const categoryBreakdown = useMemo(() => {
    if (!selected) return []
    const cats = new Map<string, { total: number; passed: number; failed: number; warnings: number }>()
    for (const r of selected.results) {
      const cat = r.ruleCategory || 'uncategorized'
      const c = cats.get(cat) || { total: 0, passed: 0, failed: 0, warnings: 0 }
      c.total++
      if (r.status === 'passed') c.passed++
      else if (r.status === 'failed') c.failed++
      else c.warnings++
      cats.set(cat, c)
    }
    return Array.from(cats.entries()).map(([cat, counts]) => ({ category: cat, ...counts }))
  }, [selected])

  /* ── Actions ────────────────────────────────────────────────── */

  function openCreate() {
    setForm({ name: '', type: 'quality', format: 'web', domain: 'All Domains', dataset: 'All Datasets', dateRange: 'Last 7 days', includeAnomalies: true, includeSLAs: true, includeLineage: false, notify: false })
    setShowModal(true)
  }

  async function runReport() {
    if (!form.name.trim()) return
    setRunning(true); setShowModal(false)
    const res = await fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, type: form.type, domain: form.domain, dataset: form.dataset, dateRange: form.dateRange }),
    })
    const report = await res.json()
    const enriched = { ...report, name: form.name || `${REPORT_TYPES.find(t => t.id === form.type)?.label}` }
    setReports(prev => [enriched, ...prev])
    setSelected(enriched)
    setRunning(false)
    router.refresh()
  }

  function kpiClick(filter: 'all' | 'passed' | 'failed' | 'warning') {
    setStatusFilter(filter)
    setScopeFilter('all')
    setCategoryFilter('all')
    setExpandedResult(null)
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Reports</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Quality Reports</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{reports.length} report{reports.length !== 1 ? 's' : ''} · execution history and analytics</p>
        </div>
        <button onClick={openCreate} disabled={running} style={{
          background: running ? '#e2e8f0' : '#E8541A',
          color: running ? '#94a3b8' : '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px',
          fontSize: '12.5px', fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
        }}>{running ? '⏳ Running...' : '+ Create Report'}</button>
      </div>

      {/* KPI Summary Strip — CLICKABLE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Runs', value: String(analytics.totalRuns), icon: '📊', color: '#2563eb', bg: '#dbeafe', filter: 'all' as const },
          { label: 'Avg Score', value: `${analytics.avgScore}%`, icon: '📈', color: scoreColor(analytics.avgScore), bg: scoreBg(analytics.avgScore), filter: 'all' as const },
          { label: 'Total Checks', value: formatNumber(analytics.totalChecks), icon: '🔍', color: '#475569', bg: '#f1f5f9', filter: 'all' as const },
          { label: 'Passed', value: formatNumber(analytics.totalPassed), icon: '✓', color: '#16a34a', bg: '#dcfce7', filter: 'passed' as const },
          { label: 'Failed', value: formatNumber(analytics.totalFailed), icon: '✗', color: '#dc2626', bg: '#fee2e2', filter: 'failed' as const },
          { label: 'Warnings', value: formatNumber(analytics.totalWarnings), icon: '⚠', color: '#ca8a04', bg: '#fef9c3', filter: 'warning' as const },
        ].map((kpi, i) => (
          <div key={i} onClick={() => kpiClick(kpi.filter)} style={{
            ...card, cursor: 'pointer', transition: 'all 0.15s',
            border: statusFilter === kpi.filter && kpi.filter !== 'all' ? `2px solid ${kpi.color}` : '1px solid #ebe8df',
            transform: statusFilter === kpi.filter && kpi.filter !== 'all' ? 'translateY(-2px)' : 'none',
            boxShadow: statusFilter === kpi.filter && kpi.filter !== 'all' ? `0 4px 12px ${kpi.color}22` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{kpi.icon}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{kpi.label}</div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: kpi.color, letterSpacing: '-0.5px' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px' }}>

        {/* ── Reports List ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reports.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>📈</div>
              <div style={{ fontWeight: 600, color: '#475569', marginBottom: '6px' }}>No reports yet</div>
              <button onClick={openCreate} style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>+ Create Report</button>
            </div>
          ) : reports.map(r => (
            <button key={r.id} onClick={() => { setSelected(r); setExpandedResult(null); setStatusFilter('all'); setScopeFilter('all'); setCategoryFilter('all'); setResultSearch('') }} style={{
              background: selected?.id === r.id ? '#f0f9ff' : '#fff',
              border: selected?.id === r.id ? '1px solid #93c5fd' : '1px solid #ebe8df',
              borderRadius: '10px', padding: '12px', textAlign: 'left', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{r.name}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: scoreColor(r.overallScore) }}>{r.overallScore}%</div>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>{formatDateTime(r.executedAt)}</div>
              <div style={{ display: 'flex', gap: '5px' }}>
                <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 600 }}>✓{r.passed}</span>
                {r.failed > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 600 }}>✗{r.failed}</span>}
                {r.warnings > 0 && <span style={{ background: '#fef9c3', color: '#ca8a04', padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 600 }}>⚠{r.warnings}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* ── Report Detail ── */}
        {selected ? (
          <div style={{ ...card, padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>{selected.name}</h2>
                <div style={{ fontSize: '13px', color: '#64748b' }}>Executed {formatDateTime(selected.executedAt)} · {selected.totalChecks} checks across {new Set(selected.results.map(r => r.tableName)).size} tables</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '36px', fontWeight: 800, color: scoreColor(selected.overallScore), lineHeight: 1 }}>{selected.overallScore}%</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Overall Score</div>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Total Checks', value: selected.totalChecks, bg: '#f8fafc', color: '#0f172a' },
                { label: 'Passed', value: selected.passed, bg: '#dcfce7', color: '#16a34a' },
                { label: 'Failed', value: selected.failed, bg: '#fee2e2', color: '#dc2626' },
                { label: 'Warnings', value: selected.warnings, bg: '#fef9c3', color: '#ca8a04' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Category breakdown */}
            {categoryBreakdown.length > 0 && (
              <div style={{ marginBottom: '20px', background: '#fafaf9', borderRadius: '12px', padding: '16px 18px', border: '1px solid #ebe8df' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '12px' }}>Quality by Category</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(categoryBreakdown.length, 6)}, 1fr)`, gap: '10px' }}>
                  {categoryBreakdown.map(cb => {
                    const catColor = categoryColors[cb.category] || '#64748b'
                    const passRate = cb.total > 0 ? Math.round((cb.passed / cb.total) * 100) : 0
                    const isActive = categoryFilter === cb.category
                    return (
                      <div key={cb.category} onClick={() => setCategoryFilter(isActive ? 'all' : cb.category)} style={{
                        background: isActive ? `${catColor}12` : '#fff', borderRadius: '10px', padding: '12px',
                        border: isActive ? `2px solid ${catColor}` : '1px solid #ebe8df',
                        cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: catColor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                          {cb.category}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: scoreColor(passRate) }}>{passRate}%</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                          {cb.passed}/{cb.total} passed
                        </div>
                        {/* Mini bar */}
                        <div style={{ height: '3px', borderRadius: '2px', background: '#f1f5f9', marginTop: '6px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${passRate}%`, background: scoreColor(passRate), borderRadius: '2px' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Trend chart */}
            {selected.trend && selected.trend.length > 1 && (() => {
              const W = 560, H = 80, PAD = 12
              const scores = selected.trend.map(t => t.score)
              const minS = Math.min(...scores) - 5
              const maxS = Math.max(...scores) + 5
              const range = maxS - minS || 1
              const pts = selected.trend.map((t, i) => ({
                x: PAD + (i / (selected.trend.length - 1)) * (W - PAD * 2),
                y: H - PAD - ((t.score - minS) / range) * (H - PAD * 2),
                score: t.score,
                label: t.date.split(' ')[1] ?? t.date,
              }))
              const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
              const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
              const last = pts[pts.length - 1]
              return (
                <div style={{ marginBottom: '20px', background: '#fafaf9', borderRadius: '12px', padding: '16px 18px', border: '1px solid #ebe8df' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>Quality Trend</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: scoreColor(last.score) }}>{last.score}%</div>
                  </div>
                  <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="tG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={scoreColor(last.score)} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={scoreColor(last.score)} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[0, 0.5, 1].map((t, i) => (
                      <line key={i} x1={PAD} y1={PAD + t * (H - PAD * 2)} x2={W - PAD} y2={PAD + t * (H - PAD * 2)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
                    ))}
                    <path d={areaD} fill="url(#tG)" />
                    <path d={pathD} fill="none" stroke={scoreColor(last.score)} strokeWidth="2" strokeLinecap="round" />
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="3" fill={i === pts.length - 1 ? scoreColor(p.score) : '#fff'} stroke={scoreColor(p.score)} strokeWidth="1.5" />
                        <text x={p.x} y={H} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">{p.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              )
            })()}

            {/* ── Filters Bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>Check Results</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search */}
                <input value={resultSearch} onChange={e => setResultSearch(e.target.value)}
                  placeholder="Search rules, tables..."
                  style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11.5px', width: '160px', outline: 'none', background: '#fafaf9' }} />
                {/* Status tabs */}
                <div style={{ display: 'flex', gap: '3px' }}>
                  {(['all', 'passed', 'failed', 'warning'] as const).map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)} style={{
                      padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 500, textTransform: 'capitalize',
                      background: statusFilter === f ? '#1a1a1a' : '#f8fafc',
                      color: statusFilter === f ? '#fff' : '#64748b',
                    }}>{f} {f !== 'all' ? `(${selected.results.filter(r => r.status === f).length})` : ''}</button>
                  ))}
                </div>
                {/* Scope filter */}
                <div style={{ display: 'flex', gap: '3px', borderLeft: '1px solid #e2e8f0', paddingLeft: '6px' }}>
                  {(['all', 'generic', 'object-specific'] as const).map(s => (
                    <button key={s} onClick={() => setScopeFilter(s)} style={{
                      padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 500,
                      background: scopeFilter === s ? '#E8541A' : '#f8fafc',
                      color: scopeFilter === s ? '#fff' : '#64748b',
                    }}>{s === 'all' ? 'All Scopes' : s === 'generic' ? '🔧 Generic' : '🎯 Object-Specific'}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results table */}
            <div style={{ borderRadius: '10px', border: '1px solid #ebe8df', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 70px 60px 70px 70px 80px', gap: '6px', padding: '8px 14px', background: '#fafaf9', borderBottom: '1px solid #ebe8df' }}>
                {['Rule', 'Type', 'Table', 'Category', 'Severity', 'Score', 'Checked', 'Failed', 'Status'].map(h => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              {filteredResults.map((r, i) => {
                const s = statusConfig[r.status]
                const sev = severityConfig[r.severity || 'medium']
                const isExpanded = expandedResult === i
                const scopeBadge = r.scope === 'object-specific'
                  ? { bg: '#faf5ff', color: '#7c3aed', label: 'Object' }
                  : { bg: '#f0f9ff', color: '#0369a1', label: 'Generic' }
                return (
                  <div key={i}>
                    <div onClick={() => setExpandedResult(isExpanded ? null : i)} style={{
                      display: 'grid', gridTemplateColumns: '1fr 100px 100px 80px 70px 60px 70px 70px 80px', gap: '6px',
                      padding: '10px 14px', borderBottom: '1px solid #f8f6f0', cursor: 'pointer',
                      background: isExpanded ? '#fafaf9' : r.status === 'failed' ? '#fef2f2' : '#fff',
                      alignItems: 'center', transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = r.status === 'failed' ? '#fef2f2' : '#fff' }}
                    >
                      {/* Rule name + scope badge */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 500, color: '#0f172a' }}>{r.ruleName}</span>
                          <span style={{ background: scopeBadge.bg, color: scopeBadge.color, padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 600 }}>{scopeBadge.label}</span>
                        </div>
                      </div>
                      {/* Rule Type */}
                      <div>
                        <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#475569', fontWeight: 500 }}>
                          {ruleTypeLabel(r.ruleType)}
                        </span>
                      </div>
                      {/* Table.Column */}
                      <div>
                        <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#475569' }}>
                          {r.tableName}{r.columnName ? `.${r.columnName}` : ''}
                        </code>
                      </div>
                      {/* Category */}
                      <div>
                        <span style={{
                          background: `${categoryColors[r.ruleCategory || ''] || '#64748b'}18`,
                          color: categoryColors[r.ruleCategory || ''] || '#64748b',
                          padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500, textTransform: 'capitalize',
                        }}>{r.ruleCategory || '—'}</span>
                      </div>
                      {/* Severity */}
                      <div>
                        <span style={{ background: sev.bg, color: sev.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{sev.label}</span>
                      </div>
                      {/* Score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontWeight: 600, fontSize: '12px', color: scoreColor(r.score) }}>{r.score}%</span>
                      </div>
                      {/* Records Checked */}
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{formatNumber(r.recordsChecked)}</div>
                      {/* Records Failed */}
                      <div style={{ fontSize: '11px', color: r.recordsFailed > 0 ? '#ef4444' : '#16a34a', fontWeight: r.recordsFailed > 0 ? 600 : 400 }}>{formatNumber(r.recordsFailed)}</div>
                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: '14px 18px', background: '#fafaf9', borderBottom: '1px solid #ebe8df' }}>
                        {/* Detail header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #ebe8df' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rule Details</div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{r.ruleName}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid #ebe8df' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Type</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{ruleTypeLabel(r.ruleType)}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid #ebe8df' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Category</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: categoryColors[r.ruleCategory || ''] || '#475569', textTransform: 'capitalize' }}>{r.ruleCategory || '—'}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid #ebe8df' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Scope</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: r.scope === 'object-specific' ? '#7c3aed' : '#0369a1' }}>{r.scope === 'object-specific' ? '🎯 Object-Specific' : '🔧 Generic'}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid #ebe8df' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>Target</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{r.connectionName}</div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                          {[
                            { label: 'Records Checked', value: formatNumber(r.recordsChecked) },
                            { label: 'Records Failed', value: formatNumber(r.recordsFailed) },
                            { label: 'Quality Score', value: `${r.score}%` },
                            { label: 'Duration', value: `${(r.duration / 1000).toFixed(1)}s` },
                          ].map(m => (
                            <div key={m.label} style={{ background: '#fff', borderRadius: '8px', padding: '10px 12px', border: '1px solid #ebe8df' }}>
                              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                              <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginTop: '4px' }}>{m.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* SQL Preview */}
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Executed SQL</div>
                          <pre style={{
                            background: '#1e293b', color: '#86efac', padding: '12px 14px', borderRadius: '8px',
                            fontSize: '11.5px', fontFamily: 'monospace', overflow: 'auto', lineHeight: 1.5, maxHeight: '140px',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            {r.sql || `SELECT COUNT(*) AS failed_count\nFROM ${r.tableName}\nWHERE ${r.columnName || 'column'} IS NULL`}
                          </pre>
                        </div>

                        {/* AI Analysis */}
                        {r.status === 'failed' && (
                          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '14px' }}>🤖</span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#0369a1' }}>AI Analysis</span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                              {r.recordsFailed} records failed the <strong>{ruleTypeLabel(r.ruleType)}</strong> check ({r.ruleCategory}) on <strong>{r.tableName}</strong>.{r.columnName ? ` Column ${r.columnName} contains invalid or null values.` : ''} Severity: <strong>{r.severity || 'medium'}</strong>. This may indicate an ETL issue in the upstream pipeline.
                            </div>
                          </div>
                        )}

                        {r.details && (
                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b', background: '#fafaf9', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ebe8df' }}>
                            {r.details}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {filteredResults.length === 0 && (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No results match the selected filters
                </div>
              )}

              {/* Footer */}
              <div style={{ padding: '8px 14px', background: '#fafaf9', fontSize: '11.5px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                <span>Showing {filteredResults.length} of {selected.results.length} results</span>
                <span>Click a row to expand details</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...card, textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📈</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '6px' }}>Select a report</div>
            <div style={{ color: '#64748b', fontSize: '13px' }}>Click a report on the left to see its full results</div>
          </div>
        )}
      </div>

      {/* ── Create Report Modal ── */}
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
              <div>
                <label style={lbl}>Report Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Finance Quality Report" style={sel} />
              </div>

              <div>
                <label style={lbl}>Report Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {REPORT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))} style={{
                      padding: '12px 8px', borderRadius: '10px', border: `1px solid ${form.type === t.id ? '#E8541A' : '#e2e8f0'}`,
                      background: form.type === t.id ? '#fef3e2' : '#fafaf9', cursor: 'pointer', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '22px', marginBottom: '4px' }}>{t.icon}</div>
                      <div style={{ fontSize: '11px', fontWeight: form.type === t.id ? 700 : 500, color: form.type === t.id ? '#E8541A' : '#475569' }}>{t.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', padding: '8px 12px', background: '#f0f9ff', borderRadius: '7px', border: '1px solid #bae6fd' }}>
                  {REPORT_TYPES.find(t => t.id === form.type)?.desc}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Domain</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value, dataset: 'All Datasets' }))} style={sel}>
                    {DOMAINS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Dataset</label>
                  <select value={form.dataset} onChange={e => setForm(f => ({ ...f, dataset: e.target.value }))} style={sel}>
                    <option value="All Datasets">All Datasets</option>
                    {(form.domain === 'All Domains' ? ALL_DATASETS : (DATASETS_BY_DOMAIN[form.domain] || [])).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Date Range</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {DATE_RANGES.map(dr => (
                    <button key={dr} onClick={() => setForm(f => ({ ...f, dateRange: dr }))} style={{
                      padding: '6px 12px', borderRadius: '20px', border: `1px solid ${form.dateRange === dr ? '#E8541A' : '#e2e8f0'}`,
                      background: form.dateRange === dr ? '#fef3e2' : '#fff', color: form.dateRange === dr ? '#E8541A' : '#64748b',
                      fontSize: '12px', fontWeight: form.dateRange === dr ? 600 : 400, cursor: 'pointer',
                    }}>{dr}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Include in Report</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { key: 'includeAnomalies', label: 'Anomaly detections', icon: '📡' },
                    { key: 'includeSLAs',      label: 'SLA compliance status', icon: '⏱️' },
                    { key: 'includeLineage',   label: 'Data lineage impact', icon: '🔗' },
                    { key: 'notify',           label: 'Send email notification', icon: '📧' },
                  ].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '7px 10px', borderRadius: '8px', background: '#fafaf9', border: '1px solid #ebe8df' }}>
                      <input type="checkbox" checked={form[opt.key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#E8541A' }} />
                      <span style={{ fontSize: '12.5px', color: '#475569' }}>{opt.icon} {opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Output Format</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {FORMATS.map(fmt => (
                    <button key={fmt.id} onClick={() => setForm(f => ({ ...f, format: fmt.id }))} style={{
                      flex: 1, padding: '9px 6px', borderRadius: '8px', border: `1px solid ${form.format === fmt.id ? '#E8541A' : '#e2e8f0'}`,
                      background: form.format === fmt.id ? '#fef3e2' : '#fafaf9', cursor: 'pointer', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '16px', marginBottom: '3px' }}>{fmt.icon}</div>
                      <div style={{ fontSize: '10.5px', fontWeight: form.format === fmt.id ? 700 : 500, color: form.format === fmt.id ? '#E8541A' : '#64748b' }}>{fmt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={runReport} disabled={!form.name.trim()} style={{
                  flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                  background: form.name.trim() ? '#E8541A' : '#e2e8f0',
                  color: form.name.trim() ? '#fff' : '#94a3b8',
                }}>▶ Run Report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
