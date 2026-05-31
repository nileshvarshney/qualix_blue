'use client'
import { useState, useEffect, useCallback } from 'react'

type Row = Record<string, unknown>

interface TableData {
  TABLE_NAME:   string
  TABLE_TYPE:   string
  ROW_COUNT:    number | null
  BYTES:        number | null
  CREATED:      string | null
  LAST_ALTERED: string | null
  TABLE_SCHEMA: string
  TABLE_CATALOG: string
  preview:      Row[]
}

interface Summary {
  tableCount: number
  populated:  number
  empty:      number
  totalRows:  number
  totalBytes: number
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

// Determine cell style based on value
function cellStyle(val: unknown): React.CSSProperties {
  if (val === null || val === undefined) return { color: '#475569', fontStyle: 'italic', opacity: 0.6 }
  if (typeof val === 'boolean') return { color: val ? '#34d399' : '#f87171' }
  if (typeof val === 'number') return { color: '#7dd3fc' }
  const s = String(val)
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return { color: '#c4b5fd' }
  return { color: '#e2e8f0' }
}

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
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 16px', background: '#162032', borderBottom: '1px solid #1e293b' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder={`Search ${tableName}…`}
          style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '5px 10px', color: '#e2e8f0', fontSize: '12px', outline: 'none' }}
        />
        <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
          {filtered.length.toLocaleString('en-US')} rows
          {filtered.length !== rows.length && ` (of ${rows.length.toLocaleString('en-US')})`}
        </span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', cursor: page === 0 ? 'default' : 'pointer', fontSize: '12px' }}>‹</button>
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{page+1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', cursor: page === totalPages-1 ? 'default' : 'pointer', fontSize: '12px' }}>›</button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 1 }}>
              {cols.map(c => (
                <th key={c} onClick={() => toggleSort(c)} style={{ padding: '8px 12px', textAlign: 'left', color: sortCol === c ? '#7dd3fc' : '#64748b', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderRight: '1px solid #1e293b' }}>
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
                    <td key={c} style={{ padding: '6px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap', borderRight: '1px solid #162032', ...cellStyle(v) }}>
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

export default function DataBrowserPage() {
  const [data,     setData]     = useState<{ summary: Summary; tables: TableData[] } | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'all'|'data'|'empty'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/snowflake/overview')
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setData(d)
      // Auto-expand tables that have data
      const withData = d.tables.filter((t: TableData) => (t.ROW_COUNT ?? 0) > 0).map((t: TableData) => t.TABLE_NAME)
      setExpanded(new Set(withData))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggleExpand(name: string) {
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
    <div style={{ padding: '28px 36px', maxWidth: '1600px' }}>
      {/* Header */}
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Live Data Browser</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            {loading ? 'Connecting to Snowflake…' : error ? 'Connection error' : `Live · ${s?.tableCount ?? 0} table${(s?.tableCount ?? 0) !== 1 ? 's' : ''} · ${fmtNum(s?.totalRows ?? 0)} total rows`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setExpanded(new Set(tables.map(t => t.TABLE_NAME)))}
            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
            Expand All
          </button>
          <button onClick={() => setExpanded(new Set())}
            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
            Collapse All
          </button>
          <button onClick={load} disabled={loading}
            style={{ background: '#2563eb', border: 'none', padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? '⏳ Loading…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Tables',         value: loading ? '…' : fmtNum(s?.tableCount  ?? 0), icon: '🗄️',  color: '#2563eb' },
          { label: 'With Data',      value: loading ? '…' : fmtNum(s?.populated   ?? 0), icon: '✅',  color: '#16a34a' },
          { label: 'Empty',          value: loading ? '…' : fmtNum(s?.empty       ?? 0), icon: '⬜',  color: '#94a3b8' },
          { label: 'Total Rows',     value: loading ? '…' : fmtNum(s?.totalRows   ?? 0), icon: '📊',  color: '#7c3aed' },
          { label: 'Total Size',     value: loading ? '…' : fmtBytes(s?.totalBytes ?? 0), icon: '💾', color: '#ca8a04' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>{c.icon}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Connection badge */}
      {!loading && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 16px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#15803d', fontWeight: 600 }}>Connected</span>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', color: '#dc2626', fontSize: '13px' }}>
          <strong>⚠ Connection error:</strong> {error}
        </div>
      )}

      {/* Filter + Search */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }} />
          {(['all','data','empty'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${filter === f ? '#2563eb' : '#e2e8f0'}`,
              background: filter === f ? '#dbeafe' : '#fff',
              color: filter === f ? '#2563eb' : '#64748b',
            }}>
              {f === 'all' ? `All (${tables.length})` : f === 'data' ? `Has Data (${s?.populated ?? 0})` : `Empty (${s?.empty ?? 0})`}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '20px', animation: 'pulse 1.5s ease-in-out infinite', opacity: 1 - i * 0.1 }}>
              <div style={{ width: `${50 - i * 4}%`, height: '14px', background: '#f1f5f9', borderRadius: '4px', marginBottom: '8px' }} />
              <div style={{ width: '30%', height: '10px', background: '#f8fafc', borderRadius: '4px' }} />
            </div>
          ))}
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '10px' }}>
            Querying Snowflake — fetching table schemas and data…
          </div>
        </div>
      )}

      {/* Table list */}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayed.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #ebe8df' }}>
              No tables match your filter.
            </div>
          )}

          {displayed.map(t => {
            const hasData   = (t.ROW_COUNT ?? 0) > 0
            const isExpanded = expanded.has(t.TABLE_NAME)
            const accentColor = hasData ? '#16a34a' : '#e2e8f0'

            return (
              <div key={t.TABLE_NAME} style={{ background: '#fff', border: `1px solid ${isExpanded && hasData ? '#bbf7d0' : '#ebe8df'}`, borderLeft: `3px solid ${accentColor}`, borderRadius: '12px', overflow: 'hidden', transition: 'all 0.15s' }}>
                {/* Table header row */}
                <div
                  onClick={() => toggleExpand(t.TABLE_NAME)}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}
                >
                  {/* Name */}
                  <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a', fontFamily: 'monospace' }}>{t.TABLE_NAME}</span>
                      <span style={{ background: t.TABLE_TYPE === 'VIEW' ? '#ede9fe' : '#f0f9ff', color: t.TABLE_TYPE === 'VIEW' ? '#7c3aed' : '#0284c7', padding: '1px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>
                        {t.TABLE_TYPE === 'VIEW' ? 'VIEW' : 'TABLE'}
                      </span>
                      {hasData ? (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 8px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>● has data</span>
                      ) : (
                        <span style={{ background: '#f8fafc', color: '#94a3b8', padding: '1px 8px', borderRadius: '10px', fontSize: '10.5px' }}>empty</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', fontFamily: 'monospace' }}>
                      {t.TABLE_CATALOG}.{t.TABLE_SCHEMA}.{t.TABLE_NAME}
                    </div>
                  </div>

                  {/* Row count */}
                  <div style={{ textAlign: 'center', minWidth: '90px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: hasData ? '#16a34a' : '#cbd5e1' }}>
                      {fmtNum(t.ROW_COUNT)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>rows</div>
                  </div>

                  {/* Size */}
                  <div style={{ textAlign: 'center', minWidth: '70px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{fmtBytes(t.BYTES)}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>size</div>
                  </div>

                  {/* Dates */}
                  <div style={{ minWidth: '160px', fontSize: '11px', color: '#94a3b8', textAlign: 'right' }}>
                    <div>Created {fmtDate(t.CREATED)}</div>
                    <div>Modified {fmtDate(t.LAST_ALTERED)}</div>
                  </div>

                  {/* Expand arrow */}
                  <span style={{ color: '#94a3b8', fontSize: '16px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {hasData ? (
                      /* Live data grid */
                      <div>
                        <div style={{ background: '#0f172a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: '#34d399', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>📊 LIVE DATA — {fmtNum(t.ROW_COUNT)} rows</span>
                          {(t.ROW_COUNT ?? 0) > 200 && (
                            <span style={{ background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                              showing first 200
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>Click column headers to sort · Search below to filter</span>
                        </div>
                        <DataGrid rows={t.preview} tableName={t.TABLE_NAME} />
                      </div>
                    ) : (
                      /* Schema view for empty tables */
                      <div style={{ background: '#0f172a' }}>
                        <div style={{ padding: '10px 16px', background: '#162032' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>⌗ SCHEMA — No data yet</span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: '#0d1520' }}>
                                {['Column Name', 'Data Type', 'Nullable', 'Notes'].map(h => (
                                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* We show a placeholder — columns are loaded lazily */}
                              <ColumnLoader tableName={t.TABLE_NAME} />
                            </tbody>
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

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
}

/** Lazy-loads columns for an empty table when expanded */
function ColumnLoader({ tableName }: { tableName: string }) {
  const [cols,    setCols]    = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/snowflake/columns?table=${encodeURIComponent(tableName)}`)
      .then(r => r.json())
      .then(d => { setCols(d.columns); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tableName])

  if (loading) return (
    <tr>
      <td colSpan={4} style={{ padding: '14px', color: '#475569', fontSize: '12px', textAlign: 'center' }}>Loading columns…</td>
    </tr>
  )

  return (
    <>
      {(cols ?? []).map((c, i) => (
        <tr key={String(c.COLUMN_NAME)} style={{ borderTop: '1px solid #162032', background: i % 2 === 0 ? '#0f172a' : '#0d1520' }}>
          <td style={{ padding: '6px 14px', color: '#7dd3fc', fontFamily: 'monospace', fontWeight: 600 }}>{String(c.COLUMN_NAME)}</td>
          <td style={{ padding: '6px 14px', color: '#34d399', fontFamily: 'monospace' }}>{String(c.DATA_TYPE)}</td>
          <td style={{ padding: '6px 14px', color: c.IS_NULLABLE === 'YES' ? '#fbbf24' : '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}>
            {c.IS_NULLABLE === 'YES' ? 'nullable' : 'NOT NULL'}
          </td>
          <td style={{ padding: '6px 14px', color: '#475569', fontSize: '11px' }}>{String(c.COMMENT ?? '')}</td>
        </tr>
      ))}
    </>
  )
}
