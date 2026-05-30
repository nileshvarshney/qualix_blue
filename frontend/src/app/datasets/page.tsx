'use client'
import { useState, useEffect, useCallback } from 'react'

type HealthFilter = 'all' | 'healthy' | 'warning' | 'error'
type TableRow    = Record<string, unknown>

interface SnowflakeTable {
  TABLE_NAME:   string
  TABLE_TYPE:   string
  ROW_COUNT:    number | null
  BYTES:        number | null
  CREATED:      string | null
  LAST_ALTERED: string | null
  COMMENT:      string | null
  TABLE_SCHEMA: string
  TABLE_CATALOG: string
}

interface ColumnMeta {
  COLUMN_NAME:              string
  DATA_TYPE:                string
  IS_NULLABLE:              string
  COLUMN_DEFAULT:           string | null
  CHARACTER_MAXIMUM_LENGTH: number | null
  NUMERIC_PRECISION:        number | null
  ORDINAL_POSITION:         number
  COMMENT:                  string | null
}

interface ExpandedState {
  columns:     ColumnMeta[]
  preview:     TableRow[]
  loadingCols: boolean
  loadingPrev: boolean
  error:       string | null
  showPreview: boolean
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1)     + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1)         + 'K'
  return n.toLocaleString('en-US')
}
function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GB'
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1)     + ' MB'
  if (b >= 1_024)         return (b / 1_024).toFixed(0)         + ' KB'
  return b + ' B'
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function healthOf(t: SnowflakeTable): 'healthy' | 'warning' | 'error' {
  if (t.ROW_COUNT === 0 || t.ROW_COUNT == null) return 'warning'
  return 'healthy'
}

const HC: Record<string, { bg: string; color: string; border: string }> = {
  healthy: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  warning: { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
  error:   { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}

export default function DatasetsPage() {
  const [tables,     setTables]     = useState<SnowflakeTable[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState<HealthFilter>('all')
  const [search,     setSearch]     = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [expandData, setExpandData] = useState<Record<string, ExpandedState>>({})

  const loadTables = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/snowflake/tables')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load tables')
      setTables(data.tables as SnowflakeTable[])
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadTables() }, [loadTables])

  async function expand(name: string) {
    if (expanded === name) { setExpanded(null); return }
    setExpanded(name)
    if (expandData[name]) return
    const init: ExpandedState = { columns: [], preview: [], loadingCols: true, loadingPrev: false, error: null, showPreview: false }
    setExpandData(prev => ({ ...prev, [name]: init }))
    try {
      const res  = await fetch(`/api/snowflake/columns?table=${encodeURIComponent(name)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setExpandData(prev => ({ ...prev, [name]: { ...prev[name], columns: data.columns, loadingCols: false } }))
    } catch (e: unknown) {
      setExpandData(prev => ({ ...prev, [name]: { ...prev[name], loadingCols: false, error: (e as Error).message } }))
    }
  }

  async function loadPreview(name: string) {
    setExpandData(prev => ({ ...prev, [name]: { ...prev[name], loadingPrev: true, showPreview: true } }))
    try {
      const res  = await fetch(`/api/snowflake/preview?table=${encodeURIComponent(name)}&limit=20`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setExpandData(prev => ({ ...prev, [name]: { ...prev[name], preview: data.rows, loadingPrev: false } }))
    } catch (e: unknown) {
      setExpandData(prev => ({ ...prev, [name]: { ...prev[name], loadingPrev: false, error: (e as Error).message } }))
    }
  }

  const healthy  = tables.filter(t => healthOf(t) === 'healthy').length
  const warnCnt  = tables.filter(t => healthOf(t) === 'warning').length
  const errCnt   = tables.filter(t => healthOf(t) === 'error').length
  const displayed = tables.filter(t => {
    if (filter !== 'all' && healthOf(t) !== filter) return false
    if (search && !t.TABLE_NAME.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const cards = [
    { label: 'Total Tables / Views', value: tables.length, color: '#2563eb', filter: 'all'     as HealthFilter, icon: '🗄️' },
    { label: 'Healthy',              value: healthy,        color: '#16a34a', filter: 'healthy'  as HealthFilter, icon: '✅' },
    { label: 'Empty / No Stats',     value: warnCnt,        color: '#ca8a04', filter: 'warning'  as HealthFilter, icon: '⚠️' },
    { label: 'Error',                value: errCnt,         color: '#dc2626', filter: 'error'    as HealthFilter, icon: '❌' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Datasets</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            {loading ? 'Connecting to Snowflake…' : error ? 'Connection error' : `Live from Snowflake · ${tables.length} objects in SUPPLYCHAIN_DB.SUPPLYCHAIN`}
          </p>
        </div>
        <button onClick={loadTables} disabled={loading} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳ Loading…' : '↺ Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {cards.map(s => {
          const active = filter === s.filter
          return (
            <div key={s.label} onClick={() => setFilter(p => p === s.filter ? 'all' : s.filter)}
              style={{ background: active ? s.color : '#fff', border: `1px solid ${active ? s.color : '#ebe8df'}`, borderRadius: '12px', padding: '16px 20px', cursor: 'pointer', transition: 'all 0.18s', boxShadow: active ? `0 4px 16px ${s.color}33` : 'none' }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: active ? '#fff' : s.color }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: '12px', color: active ? 'rgba(255,255,255,0.85)' : '#64748b', marginTop: '2px' }}>{s.label}</div>
              {active && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>▼ filtered</div>}
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables & views…"
          style={{ width: '100%', padding: '9px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', color: '#dc2626', fontSize: '13px' }}>
          <strong>⚠ Snowflake connection error:</strong> {error}
          <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.8 }}>Verify your connection is active in the Connections page and your credentials are correct.</div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '16px 20px', height: '64px', animation: 'pulse 1.5s ease-in-out infinite', opacity: 1 - i * 0.12 }}>
              <div style={{ width: `${60 - i * 5}%`, height: '12px', background: '#f1f5f9', borderRadius: '4px', marginBottom: '8px' }} />
              <div style={{ width: '40%', height: '10px', background: '#f8fafc', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {displayed.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #ebe8df' }}>No tables match your filter.</div>
          )}
          {displayed.map(t => {
            const health = healthOf(t)
            const hc     = HC[health]
            const isExp  = expanded === t.TABLE_NAME
            const ex     = expandData[t.TABLE_NAME]
            return (
              <div key={t.TABLE_NAME} onClick={() => expand(t.TABLE_NAME)}
                style={{ background: '#fff', border: `1px solid ${isExp ? '#93c5fd' : '#ebe8df'}`, borderLeft: `3px solid ${hc.color}`, borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '13px 18px' }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a', fontFamily: 'monospace' }}>{t.TABLE_NAME}</span>
                      <span style={{ background: t.TABLE_TYPE === 'VIEW' ? '#ede9fe' : '#f0f9ff', color: t.TABLE_TYPE === 'VIEW' ? '#7c3aed' : '#0284c7', padding: '1px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>
                        {t.TABLE_TYPE === 'VIEW' ? 'VIEW' : 'TABLE'}
                      </span>
                      <span style={{ background: hc.bg, color: hc.color, padding: '1px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>{health}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>{t.TABLE_CATALOG}.{t.TABLE_SCHEMA}.{t.TABLE_NAME}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{fmt(t.ROW_COUNT)}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>rows</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: '70px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{fmtBytes(t.BYTES)}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>size</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px', fontSize: '11px', color: '#94a3b8' }}>
                    <div>Created {fmtDate(t.CREATED)}</div>
                    <div>Modified {fmtDate(t.LAST_ALTERED)}</div>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '14px', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }} onClick={e => e.stopPropagation()}>
                    {/* Meta bar */}
                    <div style={{ display: 'flex', background: '#fafaf9', borderBottom: '1px solid #f1f5f9' }}>
                      {[
                        { label: 'Database', value: t.TABLE_CATALOG },
                        { label: 'Schema',   value: t.TABLE_SCHEMA  },
                        { label: 'Type',     value: t.TABLE_TYPE    },
                        { label: 'Rows',     value: fmt(t.ROW_COUNT) },
                        { label: 'Size',     value: fmtBytes(t.BYTES) },
                        { label: 'Modified', value: fmtDate(t.LAST_ALTERED) },
                      ].map((m, i, arr) => (
                        <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px', fontFamily: 'monospace' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {t.COMMENT && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#475569' }}>
                          📝 {t.COMMENT}
                        </div>
                      )}

                      {/* Column schema */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                        <div style={{ background: '#1e293b', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '12px' }}>⌗ SCHEMA — COLUMNS</span>
                          {ex?.columns?.length > 0 && <span style={{ color: '#64748b', fontSize: '11px' }}>{ex.columns.length} columns</span>}
                        </div>
                        <div style={{ background: '#0f172a', overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                          {ex?.loadingCols && <div style={{ padding: '16px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>Loading schema…</div>}
                          {ex?.error && !ex.loadingCols && <div style={{ padding: '12px 16px', color: '#f87171', fontSize: '12px' }}>{ex.error}</div>}
                          {ex?.columns?.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ background: '#162032', position: 'sticky', top: 0 }}>
                                  {['#','Column','Type','Nullable','Default','Comment'].map(h => (
                                    <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ex.columns.map((col, ci) => (
                                  <tr key={col.COLUMN_NAME} style={{ borderTop: '1px solid #1a2535' }}>
                                    <td style={{ padding: '6px 14px', color: '#475569', fontFamily: 'monospace' }}>{ci + 1}</td>
                                    <td style={{ padding: '6px 14px', color: '#7dd3fc', fontFamily: 'monospace', fontWeight: 600 }}>{col.COLUMN_NAME}</td>
                                    <td style={{ padding: '6px 14px', color: '#34d399', fontFamily: 'monospace' }}>
                                      {col.DATA_TYPE}{col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}{col.NUMERIC_PRECISION ? `(${col.NUMERIC_PRECISION})` : ''}
                                    </td>
                                    <td style={{ padding: '6px 14px', color: col.IS_NULLABLE === 'YES' ? '#fbbf24' : '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}>
                                      {col.IS_NULLABLE === 'YES' ? 'nullable' : 'NOT NULL'}
                                    </td>
                                    <td style={{ padding: '6px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' }}>{col.COLUMN_DEFAULT ?? '—'}</td>
                                    <td style={{ padding: '6px 14px', color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>{col.COMMENT ?? ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      {/* Preview */}
                      {!ex?.showPreview ? (
                        <button onClick={() => loadPreview(t.TABLE_NAME)}
                          style={{ background: '#dbeafe', border: '1px solid #93c5fd', color: '#2563eb', padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                          👁 Preview first 20 rows
                        </button>
                      ) : (
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                          <div style={{ background: '#334155', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '12px' }}>📋 DATA PREVIEW (20 rows)</span>
                            <button onClick={() => setExpandData(prev => ({ ...prev, [t.TABLE_NAME]: { ...prev[t.TABLE_NAME], showPreview: false } }))}
                              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>hide</button>
                          </div>
                          {ex?.loadingPrev && <div style={{ background: '#1e293b', padding: '16px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>Loading data…</div>}
                          {!ex?.loadingPrev && ex?.preview?.length > 0 && (
                            <div style={{ overflowX: 'auto', background: '#1e293b', maxHeight: '280px', overflowY: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                                <thead>
                                  <tr style={{ background: '#0f172a', position: 'sticky', top: 0 }}>
                                    {Object.keys(ex.preview[0]).map(k => (
                                      <th key={k} style={{ padding: '7px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{k}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {ex.preview.map((row, ri) => (
                                    <tr key={ri} style={{ borderTop: '1px solid #162032' }}>
                                      {Object.values(row).map((v, vi) => (
                                        <td key={vi} style={{ padding: '5px 12px', color: v == null ? '#475569' : '#e2e8f0', fontFamily: 'monospace', whiteSpace: 'nowrap', fontStyle: v == null ? 'italic' : 'normal' }}>
                                          {v == null ? 'NULL' : String(v)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {!ex?.loadingPrev && ex?.preview?.length === 0 && (
                            <div style={{ background: '#1e293b', padding: '16px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>No rows returned</div>
                          )}
                        </div>
                      )}
                    </div>
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
