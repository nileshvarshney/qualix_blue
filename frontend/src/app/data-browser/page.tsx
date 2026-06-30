'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

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
      const res = await apiFetch('/api/snowflake/overview')
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
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

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
      {!loading && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables…"
            style={{ flex: 1, padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', minWidth: '120px' }} />
          {(['all', 'data', 'empty'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 500,
              background: filter === f ? 'var(--foreground)' : 'var(--surface-muted)',
              color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
            }}>
              {f === 'all' ? `All (${tables.length})` : f === 'data' ? `Has Data (${s?.populated ?? 0})` : `Empty (${s?.empty ?? 0})`}
            </button>
          ))}
        </div>
      )}

      {/* Column headers */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Table', 'Rows', 'Size', 'Modified', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
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
    apiFetch(`/api/snowflake/columns?table=${encodeURIComponent(tableName)}`)
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
