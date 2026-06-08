'use client'
import { useState, useEffect, useCallback } from 'react'
import ImportDatasetsModal from '@/components/datasets/ImportDatasetsModal'

type HealthFilter = 'all' | 'healthy' | 'warning' | 'error'
type TableRow = Record<string, unknown>

interface Asset {
  TABLE_NAME:    string
  TABLE_TYPE:    string
  ROW_COUNT:     number | null
  BYTES:         number | null
  CREATED:       string | null
  LAST_ALTERED:  string | null
  COMMENT:       string | null
  TABLE_SCHEMA:  string
  TABLE_CATALOG: string
  CERT_STATUS?:  string
  CONNECTION_ID: string | null
  ASSET_ID:      string
}

interface ColMeta {
  COLUMN_NAME:              string
  DATA_TYPE:                string
  IS_NULLABLE:              string
  COLUMN_DEFAULT:           string | null
  CHARACTER_MAXIMUM_LENGTH: number | null
  NUMERIC_PRECISION:        number | null
  ORDINAL_POSITION:         number
  COMMENT:                  string | null
}

interface ColModal   { asset: Asset; cols: ColMeta[]; loading: boolean; error: string | null }
interface PrevModal  { asset: Asset; rows: TableRow[]; cols: string[]; loading: boolean; error: string | null }
interface IssueModal { asset: Asset; refreshing: boolean; refreshError: string | null; certifying: boolean; certStatus: string }

// ── helpers ──────────────────────────────────────────────────────────────────

function tkey(t: Asset) { return `${t.TABLE_CATALOG}__${t.TABLE_SCHEMA}__${t.TABLE_NAME}` }

function fmtN(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1)     + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1)         + 'K'
  return n.toLocaleString('en-US')
}
function fmtB(b: number | null): string {
  if (b == null) return '—'
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(1) + 'GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1)     + 'MB'
  if (b >= 1_024)         return (b / 1_024).toFixed(0)         + 'KB'
  return b + 'B'
}
function fmtD(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

type HealthLevel = 'healthy' | 'warning' | 'error'

function healthOf(t: Asset): HealthLevel {
  if (t.CERT_STATUS === 'failed')  return 'error'
  if (t.CERT_STATUS === 'warning') return 'warning'
  if (t.CERT_STATUS && t.CERT_STATUS !== 'uncertified') return 'healthy'
  if (t.ROW_COUNT == null || t.ROW_COUNT === 0) return 'warning'
  return 'healthy'
}

function issueReason(t: Asset): string {
  if (t.CERT_STATUS === 'failed')  return 'Data certification failed'
  if (t.CERT_STATUS === 'warning') return 'Certification has warnings'
  if (t.ROW_COUNT == null)         return 'Row statistics unavailable'
  if (t.ROW_COUNT === 0)           return 'Table is empty (0 rows)'
  return 'Unknown issue'
}

function issueDetail(t: Asset): string {
  if (t.CERT_STATUS === 'failed')  return 'This table failed its certification check. Review the certification criteria and re-certify once the data quality issues are resolved.'
  if (t.CERT_STATUS === 'warning') return 'Certification completed with warnings. Review the certification notes and update the status once resolved.'
  if (t.ROW_COUNT == null)         return 'Row count and size were not captured at import time. Use "Refresh Stats" to fetch current values from Snowflake.'
  if (t.ROW_COUNT === 0)           return 'The table currently has zero rows. This may be intentional (staging table) or indicate a data pipeline issue. Refresh to check the latest count.'
  return ''
}

const DOT: Record<HealthLevel, string> = { healthy: '#16a34a', warning: '#d97706', error: '#dc2626' }

const STATUS = {
  healthy: { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)'      },
  warning: { bg: 'var(--status-warn-bg)',     color: 'var(--status-warn-text)'    },
  error:   { bg: 'var(--status-error-bg)',    color: 'var(--status-error-text)'   },
}

function group(ts: Asset[]): Record<string, Record<string, Asset[]>> {
  const r: Record<string, Record<string, Asset[]>> = {}
  for (const t of ts) {
    const db = t.TABLE_CATALOG || '(none)'
    const sc = t.TABLE_SCHEMA  || '(none)'
    ;(r[db] ??= {})[sc] ??= []
    r[db][sc].push(t)
  }
  return r
}

const GRID = '8px 1fr 52px 52px 44px 58px 80px 40px'

// ── modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose, width = '760px' }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 48px rgba(15,23,42,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)' }}>{title}</div>
        {sub && <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{sub}</div>}
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 0 0 12px' }}>×</button>
    </div>
  )
}

function Spinner() {
  return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
}

function ErrMsg({ msg }: { msg: string }) {
  return <div style={{ padding: '16px 18px', color: 'var(--status-error-text)', fontSize: '11.5px', background: 'var(--status-error-bg)', margin: '12px 18px', borderRadius: '6px' }}>{msg}</div>
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  const [tables,     setTables]     = useState<Asset[]>([])
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState<string | null>(null)
  const [filter,     setFilter]     = useState<HealthFilter>('all')
  const [search,     setSearch]     = useState('')
  const [dbExp,      setDbExp]      = useState<Record<string, boolean>>({})
  const [scExp,      setScExp]      = useState<Record<string, boolean>>({})
  const [showImp,    setShowImp]    = useState(false)
  const [colModal,   setColModal]   = useState<ColModal   | null>(null)
  const [prevModal,  setPrevModal]  = useState<PrevModal  | null>(null)
  const [issueModal, setIssueModal] = useState<IssueModal | null>(null)

  const loadTables = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res  = await fetch('/api/catalog')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      const raw: Record<string, unknown>[] = Array.isArray(data) ? data : []
      const mapped: Asset[] = raw.map(a => ({
        TABLE_NAME:    String(a.sf_table_name    ?? ''),
        TABLE_TYPE:    String(a.table_type        ?? 'BASE TABLE'),
        ROW_COUNT:     a.row_count != null ? Number(a.row_count) : null,
        BYTES:         a.bytes     != null ? Number(a.bytes)     : null,
        CREATED:       a.created_at        ? String(a.created_at)        : null,
        LAST_ALTERED:  a.updated_at        ? String(a.updated_at)        : null,
        COMMENT:       a.table_description ? String(a.table_description) : null,
        TABLE_SCHEMA:  String(a.sf_schema_name   ?? ''),
        TABLE_CATALOG: String(a.sf_database_name ?? ''),
        CERT_STATUS:   a.certification_status ? String(a.certification_status) : undefined,
        CONNECTION_ID: a.connection_id ? String(a.connection_id) : null,
        ASSET_ID:      String(a.asset_id ?? ''),
      }))
      setTables(mapped)
      const dbs: Record<string, boolean> = {}
      const scs: Record<string, boolean> = {}
      for (const t of mapped) {
        dbs[t.TABLE_CATALOG] = true
        scs[`${t.TABLE_CATALOG}/${t.TABLE_SCHEMA}`] = true
      }
      setDbExp(dbs); setScExp(scs)
    } catch (e: unknown) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadTables() }, [loadTables])

  async function openCols(e: React.MouseEvent, t: Asset) {
    e.stopPropagation()
    setColModal({ asset: t, cols: [], loading: true, error: null })
    try {
      const qs = new URLSearchParams({
        table: t.TABLE_NAME, database: t.TABLE_CATALOG, schema: t.TABLE_SCHEMA,
        ...(t.CONNECTION_ID ? { connection_id: t.CONNECTION_ID } : {}),
      })
      const res  = await fetch(`/api/snowflake/columns?${qs}`)
      const data = await res.json()
      if (data.error && !data.columns?.length) throw new Error(data.error)
      setColModal(p => p ? { ...p, cols: data.columns ?? [], loading: false } : null)
    } catch (e: unknown) {
      setColModal(p => p ? { ...p, loading: false, error: (e as Error).message } : null)
    }
  }

  async function openPrev(e: React.MouseEvent, t: Asset) {
    e.stopPropagation()
    setPrevModal({ asset: t, rows: [], cols: [], loading: true, error: null })
    try {
      const qs = new URLSearchParams({
        table: t.TABLE_NAME, database: t.TABLE_CATALOG, schema: t.TABLE_SCHEMA, limit: '20',
        ...(t.CONNECTION_ID ? { connection_id: t.CONNECTION_ID } : {}),
      })
      const res  = await fetch(`/api/snowflake/preview?${qs}`)
      const data = await res.json()
      if (data.error && !data.rows?.length) throw new Error(data.error)
      setPrevModal(p => p ? { ...p, rows: data.rows ?? [], cols: data.columns ?? [], loading: false } : null)
    } catch (e: unknown) {
      setPrevModal(p => p ? { ...p, loading: false, error: (e as Error).message } : null)
    }
  }

  async function handleRefreshStats() {
    if (!issueModal) return
    setIssueModal(p => p ? { ...p, refreshing: true, refreshError: null } : null)
    try {
      const res  = await fetch('/api/datasets/refresh-stats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: issueModal.asset.ASSET_ID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed')
      setIssueModal(null)
      await loadTables()
    } catch (e: unknown) {
      setIssueModal(p => p ? { ...p, refreshing: false, refreshError: (e as Error).message } : null)
    }
  }

  async function handleCertify() {
    if (!issueModal) return
    setIssueModal(p => p ? { ...p, certifying: true, refreshError: null } : null)
    try {
      const res = await fetch('/api/datasets/certify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: issueModal.asset.ASSET_ID, certification_status: issueModal.certStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Certify failed')
      setIssueModal(null)
      await loadTables()
    } catch (e: unknown) {
      setIssueModal(p => p ? { ...p, certifying: false, refreshError: (e as Error).message } : null)
    }
  }

  const sl      = search.toLowerCase()
  const shown   = tables.filter(t => {
    if (filter !== 'all' && healthOf(t) !== filter) return false
    if (sl && ![t.TABLE_NAME, t.TABLE_SCHEMA, t.TABLE_CATALOG].some(s => s.toLowerCase().includes(sl))) return false
    return true
  })

  const healthy  = tables.filter(t => healthOf(t) === 'healthy').length
  const warnings = tables.filter(t => healthOf(t) === 'warning').length
  const errors   = tables.filter(t => healthOf(t) === 'error').length
  const grouped  = group(shown)
  const dbs      = Object.keys(grouped).sort()

  const CARDS = [
    { label: 'Total',   value: tables.length, color: 'var(--accent)',              f: 'all'     as HealthFilter },
    { label: 'Healthy', value: healthy,        color: 'var(--status-ok-text)',      f: 'healthy' as HealthFilter },
    { label: 'Warning', value: warnings,       color: 'var(--status-warn-text)',    f: 'warning' as HealthFilter },
    { label: 'Error',   value: errors,         color: 'var(--status-error-text)',   f: 'error'   as HealthFilter },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Datasets</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : err ? 'Error loading catalog' : `${tables.length} asset${tables.length !== 1 ? 's' : ''} · ${dbs.length} database${dbs.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={loadTables} disabled={loading}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? '…' : '↺ Refresh'}
          </button>
          <button onClick={() => setShowImp(true)}
            style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
            + Import
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(s => {
          const on = filter === s.f
          return (
            <div key={s.label} onClick={() => setFilter(p => p === s.f ? 'all' : s.f)}
              style={{ background: on ? s.color : 'var(--surface)', border: `1px solid ${on ? s.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search databases, schemas, tables…"
        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', flexShrink: 0, width: '100%', boxSizing: 'border-box' }} />

      {err && <div style={{ background: 'var(--status-error-bg)', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px 12px', color: 'var(--status-error-text)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>⚠ {err}</div>}

      {/* column header */}
      {!loading && shown.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 6px', padding: '0 8px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>
          {['', 'Table', 'Rows', 'Size', 'Type', 'Health', 'Modified', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 2 && i <= 6 ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {loading && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: '28px', background: 'var(--surface-muted)', borderRadius: '5px', marginBottom: '3px', opacity: 1 - i * 0.1, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}

        {!loading && shown.length === 0 && !err && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No datasets match your filter. Click &quot;Import&quot; to add tables.
          </div>
        )}

        {!loading && dbs.map(db => {
          const open    = dbExp[db] !== false
          const scMap   = grouped[db]
          const scNames = Object.keys(scMap).sort()
          const total   = scNames.reduce((s, sc) => s + scMap[sc].length, 0)

          return (
            <div key={db} style={{ marginBottom: '3px' }}>

              {/* database row */}
              <div onClick={() => setDbExp(p => ({ ...p, [db]: !p[db] }))}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>🗄️</span>
                <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{total} · {scNames.length} schema{scNames.length !== 1 ? 's' : ''}</span>
              </div>

              {open && scNames.map(sc => {
                const sk    = `${db}/${sc}`
                const sOpen = scExp[sk] !== false
                const rows  = scMap[sc]

                return (
                  <div key={sk} style={{ marginLeft: '16px', marginBottom: '2px' }}>

                    {/* schema row */}
                    <div onClick={() => setScExp(p => ({ ...p, [sk]: !p[sk] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 6px', borderLeft: '2px solid var(--border)', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                      <span style={{ fontSize: '8px', color: 'var(--border-strong)', display: 'inline-block', transform: sOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', lineHeight: 1, width: '7px', flexShrink: 0 }}>▶</span>
                      <span style={{ fontSize: '10px', flexShrink: 0 }}>📋</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flex: 1 }}>{sc}</span>
                      <span style={{ fontSize: '10px', color: 'var(--border-strong)' }}>{rows.length}</span>
                    </div>

                    {sOpen && (
                      <div style={{ marginLeft: '16px', marginBottom: '4px' }}>
                        {rows.map(t => {
                          const h   = healthOf(t)
                          const isV = t.TABLE_TYPE?.toUpperCase().includes('VIEW')
                          return (
                            <div key={tkey(t)}
                              style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 6px', alignItems: 'center', padding: '3px 8px', background: 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '28px' }}>

                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: DOT[h], display: 'inline-block', flexShrink: 0 }} />

                              <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={`${t.TABLE_CATALOG}.${t.TABLE_SCHEMA}.${t.TABLE_NAME}`}>
                                {t.TABLE_NAME}
                              </span>

                              <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textAlign: 'right' }}>{fmtN(t.ROW_COUNT)}</span>

                              <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textAlign: 'right' }}>{fmtB(t.BYTES)}</span>

                              <span style={{ textAlign: 'center' }}>
                                <span style={{ background: isV ? 'var(--accent-bg)' : 'var(--surface-muted)', color: isV ? 'var(--accent)' : 'var(--text-secondary)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                                  {isV ? 'VIEW' : 'TABLE'}
                                </span>
                              </span>

                              <span style={{ textAlign: 'center' }}>
                                <span style={{ background: STATUS[h].bg, color: STATUS[h].color, padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>{h}</span>
                              </span>

                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtD(t.LAST_ALTERED)}</span>

                              <span style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button onClick={e => openCols(e, t)} title="Column schema"
                                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>⌗</button>
                                <button onClick={e => openPrev(e, t)} title="Preview data"
                                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>👁</button>
                                {h !== 'healthy' && (
                                  <button onClick={e => { e.stopPropagation(); setIssueModal({ asset: t, refreshing: false, refreshError: null, certifying: false, certStatus: 'certified' }) }}
                                    title="View issue"
                                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: STATUS[h].color, cursor: 'pointer', lineHeight: 1, fontWeight: 700 }}>!</button>
                                )}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* ── Column schema modal ─────────────────────────────────────────────── */}
      {colModal && (
        <Modal onClose={() => setColModal(null)} width="800px">
          <ModalHeader
            title={`⌗ ${colModal.asset.TABLE_NAME}`}
            sub={`${colModal.asset.TABLE_CATALOG}.${colModal.asset.TABLE_SCHEMA}${!colModal.loading && colModal.cols.length ? ` · ${colModal.cols.length} columns` : ''}`}
            onClose={() => setColModal(null)}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {colModal.loading && <Spinner />}
            {colModal.error   && <ErrMsg msg={colModal.error} />}
            {!colModal.loading && !colModal.error && colModal.cols.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No column data available.</div>
            )}
            {colModal.cols.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', position: 'sticky', top: 0 }}>
                    {['#', 'Column', 'Type', 'Nullable', 'Default', 'Comment'].map(h => (
                      <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colModal.cols.map((c, i) => (
                    <tr key={c.COLUMN_NAME} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                      <td style={{ padding: '6px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10.5px' }}>{i + 1}</td>
                      <td style={{ padding: '6px 14px', color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 500 }}>{c.COLUMN_NAME}</td>
                      <td style={{ padding: '6px 14px', color: 'var(--status-ok-text)', fontFamily: 'monospace' }}>
                        {c.DATA_TYPE}{c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}{c.NUMERIC_PRECISION ? `(${c.NUMERIC_PRECISION})` : ''}
                      </td>
                      <td style={{ padding: '6px 14px', color: c.IS_NULLABLE === 'YES' ? 'var(--status-warn-text)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10.5px' }}>
                        {c.IS_NULLABLE === 'YES' ? 'nullable' : 'NOT NULL'}
                      </td>
                      <td style={{ padding: '6px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10.5px' }}>{c.COLUMN_DEFAULT ?? '—'}</td>
                      <td style={{ padding: '6px 14px', color: 'var(--text-secondary)', fontSize: '10.5px', fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.COMMENT ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}

      {/* ── Preview modal ───────────────────────────────────────────────────── */}
      {prevModal && (
        <Modal onClose={() => setPrevModal(null)} width="90vw">
          <ModalHeader
            title={`👁 ${prevModal.asset.TABLE_NAME}`}
            sub={`${prevModal.asset.TABLE_CATALOG}.${prevModal.asset.TABLE_SCHEMA} · sample rows (max 20)`}
            onClose={() => setPrevModal(null)}
          />
          <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
            {prevModal.loading && <Spinner />}
            {prevModal.error   && <ErrMsg msg={prevModal.error} />}
            {!prevModal.loading && !prevModal.error && prevModal.rows.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No rows returned.</div>
            )}
            {prevModal.rows.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', position: 'sticky', top: 0 }}>
                    {Object.keys(prevModal.rows[0]).map(k => (
                      <th key={k} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prevModal.rows.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                      {Object.values(row).map((v, vi) => (
                        <td key={vi} style={{ padding: '5px 12px', color: v == null ? 'var(--text-muted)' : 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'nowrap', fontStyle: v == null ? 'italic' : 'normal', fontSize: 'var(--text-xs)' }}>
                          {v == null ? 'NULL' : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}

      {/* ── Issues modal ────────────────────────────────────────────────────── */}
      {issueModal && (() => {
        const t  = issueModal.asset
        const h  = healthOf(t)
        const needsStats = t.ROW_COUNT == null || t.ROW_COUNT === 0
        const needsCert  = t.CERT_STATUS === 'failed' || t.CERT_STATUS === 'warning'
        return (
          <Modal onClose={() => setIssueModal(null)} width="440px">
            <ModalHeader
              title={`${h === 'error' ? '❌' : '⚠️'} ${issueReason(t)}`}
              sub={`${t.TABLE_CATALOG}.${t.TABLE_SCHEMA}.${t.TABLE_NAME}`}
              onClose={() => setIssueModal(null)}
            />

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>

              {/* detail */}
              <div style={{ background: STATUS[h].bg, border: `1px solid ${h === 'error' ? '#fca5a5' : '#fde68a'}`, borderRadius: '7px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {issueDetail(t)}
              </div>

              {/* stats snapshot */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                {[
                  { label: 'Row count',   value: fmtN(t.ROW_COUNT)   },
                  { label: 'Size',        value: fmtB(t.BYTES)        },
                  { label: 'Modified',    value: fmtD(t.LAST_ALTERED) },
                  { label: 'Cert status', value: t.CERT_STATUS || 'uncertified' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', marginTop: '2px' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* fix: refresh stats */}
              {needsStats && t.CONNECTION_ID && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Fix · Refresh Statistics</div>
                  {issueModal.refreshError && <ErrMsg msg={issueModal.refreshError} />}
                  <button onClick={handleRefreshStats} disabled={issueModal.refreshing}
                    style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '9px 14px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: issueModal.refreshing ? 'default' : 'pointer', opacity: issueModal.refreshing ? 0.7 : 1 }}>
                    {issueModal.refreshing ? 'Fetching from Snowflake…' : '↻ Refresh Stats from Snowflake'}
                  </button>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px', textAlign: 'center' }}>
                    Queries Snowflake INFORMATION_SCHEMA and updates row count &amp; size.
                  </div>
                </div>
              )}

              {/* fix: certify */}
              {needsCert && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Fix · Update Certification</div>
                  <div style={{ display: 'flex', gap: '7px' }}>
                    <select
                      value={issueModal.certStatus}
                      onChange={e => setIssueModal(p => p ? { ...p, certStatus: e.target.value } : null)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--foreground)' }}>
                      <option value="certified">✅ Certified</option>
                      <option value="warning">⚠️ Warning</option>
                      <option value="failed">❌ Failed</option>
                      <option value="uncertified">— Uncertified</option>
                    </select>
                    <button onClick={handleCertify} disabled={issueModal.certifying}
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: issueModal.certifying ? 'default' : 'pointer', opacity: issueModal.certifying ? 0.7 : 1 }}>
                      {issueModal.certifying ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* preview link */}
              <button onClick={e => { setIssueModal(null); openPrev(e, t) }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left' }}>
                👁 Preview sample data
              </button>
            </div>
          </Modal>
        )
      })()}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {showImp && (
        <ImportDatasetsModal
          onClose={() => setShowImp(false)}
          onComplete={() => { setShowImp(false); loadTables() }}
        />
      )}
    </div>
  )
}
