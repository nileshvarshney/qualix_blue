'use client'
import { useState, useMemo, useEffect } from 'react'
import { Report, CheckResult } from '@/lib/types'
import { formatDateTime, formatNumber, categoryColors } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/apiFetch'

const statusConfig = {
  passed:  { bg: 'var(--status-ok-bg)',   color: 'var(--status-ok-text)',   label: '✓ Passed',  dot: 'var(--status-ok-text)'   },
  failed:  { bg: 'var(--status-error-bg)',color: 'var(--status-error-text)',label: '✗ Failed',  dot: 'var(--status-error-text)' },
  warning: { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', label: '⚠ Warning', dot: 'var(--status-warn-text)'  },
}
const severityConfig: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)', label: 'Critical' },
  high:     { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  label: 'High' },
  medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  label: 'Medium' },
  low:      { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    label: 'Low' },
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

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }
const sel: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none' }

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
  const [reports,  setReports]  = useState([...initialReports].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()))
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
  const [hoverResultIdx,  setHoverResultIdx]   = useState<number | null>(null)
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
    try {
      const res    = await apiFetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, type: form.type, domain: form.domain, dataset: form.dataset, dateRange: form.dateRange }) })
      const report = await res.json()
      const enriched = { ...report, name: form.name || REPORT_TYPES.find(t => t.id === form.type)?.label }
      setReports(prev => [enriched, ...prev])
      setSelected(enriched)
      router.refresh()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

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
                      {(() => { const gradId = `tG-${selected.id}`; return (
                        <>
                          <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={scoreColor(last.score)} stopOpacity="0.15" /><stop offset="100%" stopColor={scoreColor(last.score)} stopOpacity="0" /></linearGradient></defs>
                          {[0, 0.5, 1].map((t, i) => <line key={i} x1={PAD} y1={PAD + t * (H - PAD * 2)} x2={W - PAD} y2={PAD + t * (H - PAD * 2)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 2" />)}
                          <path d={areaD} fill={`url(#${gradId})`} />
                          <path d={pathD} fill="none" stroke={scoreColor(last.score)} strokeWidth="1.5" strokeLinecap="round" />
                        </>
                      ) })()}
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
                  <button key={f} onClick={() => setStatusFilter(f)} style={{ padding: '3px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 500, textTransform: 'capitalize', background: statusFilter === f ? 'var(--foreground)' : 'var(--surface-muted)', color: statusFilter === f ? 'var(--surface)' : 'var(--text-secondary)' }}>
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
                  const s      = statusConfig[r.status as keyof typeof statusConfig]
                  const sev    = severityConfig[r.severity || 'medium']
                  const isExp  = expandedResult === i
                  const scope  = r.scope === 'object-specific' ? { bg: 'var(--surface-muted)', color: 'var(--accent)', label: 'Object' } : { bg: 'var(--status-info-bg)', color: 'var(--status-info-text)', label: 'Generic' }
                  return (
                    <div key={i}>
                      <div onClick={() => setExpandedResult(isExp ? null : i)} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 72px 62px 52px 62px 62px 72px', gap: '0 4px', padding: '7px 10px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', background: isExp ? 'var(--surface-muted)' : hoverResultIdx === i ? 'var(--surface-muted)' : r.status === 'failed' ? 'var(--status-error-bg)' : 'transparent', alignItems: 'center', fontSize: '10.5px' }}
                        onMouseEnter={() => setHoverResultIdx(i)}
                        onMouseLeave={() => setHoverResultIdx(null)}>
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
                            <div style={{ background: 'var(--status-info-bg)', border: '1px solid #bae6fd', borderRadius: '6px', padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px' }}>🤖</span>
                                <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--status-info-text)' }}>AI Analysis</span>
                              </div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
          <div style={{ background: 'var(--surface)', borderRadius: '16px', width: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>Create Report</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>Configure and run a new quality report</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}>✕</button>
            </div>
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={lbl}>Report Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekly Finance Quality Report" style={sel} /></div>
              <div><label style={lbl}>Report Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {REPORT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))} style={{ padding: '12px 8px', borderRadius: '10px', border: `1px solid ${form.type === t.id ? '#E8541A' : 'var(--border)'}`, background: form.type === t.id ? '#fef3e2' : 'var(--surface-muted)', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', marginBottom: '4px' }}>{t.icon}</div>
                      <div style={{ fontSize: '11px', fontWeight: form.type === t.id ? 700 : 500, color: form.type === t.id ? '#E8541A' : 'var(--text-secondary)' }}>{t.label}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', padding: '7px 10px', background: 'var(--status-info-bg)', borderRadius: '6px', border: '1px solid #bae6fd' }}>{REPORT_TYPES.find(t => t.id === form.type)?.desc}</div>
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
                    <button key={dr} onClick={() => setForm(f => ({ ...f, dateRange: dr }))} style={{ padding: '5px 10px', borderRadius: '20px', border: `1px solid ${form.dateRange === dr ? '#E8541A' : 'var(--border)'}`, background: form.dateRange === dr ? '#fef3e2' : 'var(--surface)', color: form.dateRange === dr ? '#E8541A' : 'var(--text-secondary)', fontSize: '12px', fontWeight: form.dateRange === dr ? 600 : 400, cursor: 'pointer' }}>{dr}</button>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Include in Report</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[{ key: 'includeAnomalies', label: 'Anomaly detections', icon: '📡' }, { key: 'includeSLAs', label: 'SLA compliance status', icon: '⏱️' }, { key: 'includeLineage', label: 'Data lineage impact', icon: '🔗' }, { key: 'notify', label: 'Send email notification', icon: '📧' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 8px', borderRadius: '6px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                      <input type="checkbox" checked={form[opt.key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))} style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#E8541A' }} />
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{opt.icon} {opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Output Format</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {FORMATS.map(fmt => (
                    <button key={fmt.id} onClick={() => setForm(f => ({ ...f, format: fmt.id }))} style={{ flex: 1, padding: '8px 6px', borderRadius: '8px', border: `1px solid ${form.format === fmt.id ? '#E8541A' : 'var(--border)'}`, background: form.format === fmt.id ? '#fef3e2' : 'var(--surface-muted)', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', marginBottom: '2px' }}>{fmt.icon}</div>
                      <div style={{ fontSize: '10px', fontWeight: form.format === fmt.id ? 700 : 500, color: form.format === fmt.id ? '#E8541A' : 'var(--text-secondary)' }}>{fmt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={runReport} disabled={!form.name.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: form.name.trim() ? '#E8541A' : 'var(--surface-muted)', color: form.name.trim() ? '#fff' : 'var(--text-muted)' }}>▶ Run Report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
