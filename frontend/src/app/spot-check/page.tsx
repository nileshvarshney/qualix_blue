'use client'
import { useState, useMemo, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface ColumnDef {
  name: string; type: string; nullable: boolean; isPK?: boolean; isFK?: boolean; sampleValues?: string[]
}
interface TableSchema {
  name: string; rowCount: number; columns: ColumnDef[]
  stats: Record<string, { sum?: number; avg?: number; min?: number; max?: number; nullCount: number; distinctCount: number }>
}
interface SchemaData { name: string; database: string; tables: TableSchema[] }

function fmt(n: number | undefined): string {
  if (n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function pctDiff(a: number, b: number): { text: string; color: string } {
  if (a === 0 && b === 0) return { text: '0%', color: 'var(--text-muted)' }
  if (a === 0) return { text: '+100%', color: 'var(--status-error-text)' }
  const pct = ((b - a) / a) * 100
  if (Math.abs(pct) < 0.01) return { text: '0%', color: 'var(--status-ok-text)' }
  const sign = pct > 0 ? '+' : ''
  const color = Math.abs(pct) < 1 ? 'var(--status-ok-text)' : Math.abs(pct) < 5 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
  return { text: `${sign}${pct.toFixed(2)}%`, color }
}

const COLS = '1fr 70px 70px 90px'

export default function SpotCheckPage() {
  const [schemas,       setSchemas]       = useState<SchemaData[]>([])
  const [loading,       setLoading]       = useState(true)
  const [schemaA,       setSchemaA]       = useState(0)
  const [schemaB,       setSchemaB]       = useState(1)
  const [search,        setSearch]        = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tab,           setTab]           = useState<'columns'|'stats'>('columns')
  const [hoverId,       setHoverId]       = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const url = `/api/snowflake/tables${activeConnectionId ? `?${params}` : ''}`
    apiFetch(url)
      .then(r => r.json())
      .then(data => {
        const tables = Array.isArray(data) ? data : (data.tables ?? [])
        if (tables.length === 0) { setLoading(false); return }
        const schemaMap = new Map<string, TableSchema[]>()
        for (const t of tables) {
          const key = `${t.database_name ?? ''}.${t.schema_name ?? ''}`
          if (!schemaMap.has(key)) schemaMap.set(key, [])
          schemaMap.get(key)!.push({ name: String(t.table_name ?? t.name ?? ''), rowCount: Number(t.row_count ?? t.rowCount ?? 0), columns: [], stats: {} })
        }
        const built: SchemaData[] = []
        for (const [key, tbs] of schemaMap) {
          const parts = key.split('.')
          built.push({ name: parts[1] || key, database: parts[0] || '', tables: tbs })
        }
        setSchemas(built); setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeConnectionId])

  const SCHEMAS  = schemas
  const sA       = SCHEMAS[schemaA] ?? SCHEMAS[0]
  const sB       = SCHEMAS[Math.min(schemaB, SCHEMAS.length - 1)] ?? SCHEMAS[0]

  const allTableNames = useMemo(() => {
    if (!sA || !sB) return []
    const set = new Set([...sA.tables.map(t => t.name), ...sB.tables.map(t => t.name)])
    return [...set].sort()
  }, [sA, sB])

  const filteredTables = useMemo(() => {
    if (!search) return allTableNames
    return allTableNames.filter(t => t.toLowerCase().includes(search.toLowerCase()))
  }, [allTableNames, search])

  const tableA = sA?.tables.find(t => t.name === selectedTable)
  const tableB = sB?.tables.find(t => t.name === selectedTable)

  const columnComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const colsA = tableA?.columns || []; const colsB = tableB?.columns || []
    const allNames = new Set([...colsA.map(c => c.name), ...colsB.map(c => c.name)])
    return [...allNames].map(name => ({ name, inA: colsA.find(c => c.name === name), inB: colsB.find(c => c.name === name) }))
  }, [tableA, tableB])

  const statsComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const statsA = tableA?.stats || {}; const statsB = tableB?.stats || {}
    const allCols = new Set([...Object.keys(statsA), ...Object.keys(statsB)])
    return [...allCols].map(col => ({ column: col, a: statsA[col], b: statsB[col] }))
  }, [tableA, tableB])

  const tablesOnlyA  = sA && sB ? allTableNames.filter(t =>  sA.tables.some(ta => ta.name === t) && !sB.tables.some(tb => tb.name === t)) : []
  const tablesOnlyB  = sA && sB ? allTableNames.filter(t => !sA.tables.some(ta => ta.name === t) &&  sB.tables.some(tb => tb.name === t)) : []
  const tablesCommon = sA && sB ? allTableNames.filter(t =>  sA.tables.some(ta => ta.name === t) &&  sB.tables.some(tb => tb.name === t)) : []
  const totalRowsA   = sA ? sA.tables.reduce((s, t) => s + t.rowCount, 0) : 0
  const totalRowsB   = sB ? sB.tables.reduce((s, t) => s + t.rowCount, 0) : 0
  const rowDiff      = sA && sB ? pctDiff(totalRowsA, totalRowsB) : null

  const sel = { width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }

  if (loading) return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>Loading…</span>
      </div>
    </div>
  )

  if (schemas.length === 0) return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
      </div>
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', border: '2px dashed var(--border)', borderRadius: '8px' }}>
        Connect a data source to use schema comparison
      </div>
    </div>
  )

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Spot Check</span>
        <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesCommon.length} common</span>
        {tablesOnlyA.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesOnlyA.length} only A</span>}
        {tablesOnlyB.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{tablesOnlyB.length} only B</span>}
        {rowDiff && <span style={{ background: 'var(--surface-muted)', color: rowDiff.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>row diff {rowDiff.text}</span>}
      </div>

      {/* Schema selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <select value={schemaA} onChange={e => { setSchemaA(Number(e.target.value)); setSelectedTable(null) }} style={{ ...sel, fontWeight: 600 }}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '4px' }}>{sA?.tables.length} tables · {fmt(totalRowsA)} rows</div>
        </div>
        <button onClick={() => { setSchemaA(schemaB); setSchemaB(schemaA); setSelectedTable(null) }}
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '5px', padding: '4px', cursor: 'pointer', fontSize: '13px', textAlign: 'center' }}>⇄</button>
        <div>
          <select value={schemaB} onChange={e => { setSchemaB(Number(e.target.value)); setSelectedTable(null) }} style={{ ...sel, fontWeight: 600 }}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '4px' }}>{sB?.tables.length} tables · {fmt(totalRowsB)} rows</div>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter tables…"
        style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', flexShrink: 0 }} />

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', padding: '0 6px 3px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['Table', 'Rows A', 'Rows B', 'Status'].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* Table list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredTables.map(name => {
          const inA = sA.tables.some(t => t.name === name)
          const inB = sB.tables.some(t => t.name === name)
          const tA  = sA.tables.find(t => t.name === name)
          const tB  = sB.tables.find(t => t.name === name)
          const diff = tA && tB ? pctDiff(tA.rowCount, tB.rowCount) : null
          const missing = !inA || !inB
          const hasDiff = diff && Math.abs(parseFloat(diff.text)) > 1

          const statusBg    = missing ? 'var(--status-error-bg)'   : hasDiff ? 'var(--status-warn-bg)'   : 'var(--status-ok-bg)'
          const statusColor = missing ? 'var(--status-error-text)' : hasDiff ? 'var(--status-warn-text)' : 'var(--status-ok-text)'
          const statusLabel = missing ? (!inA ? 'Only in B' : 'Only in A') : hasDiff ? 'Row Diff' : 'Match'

          return (
            <div key={name}
              onClick={() => { setSelectedTable(selectedTable === name ? null : name); setTab('columns') }}
              onMouseEnter={() => setHoverId(name)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0 6px', alignItems: 'center',
                padding: '5px 6px', borderLeft: `2px solid ${missing ? 'var(--status-error-text)' : hasDiff ? 'var(--status-warn-text)' : 'var(--border)'}`,
                borderBottom: '1px solid var(--surface-muted)',
                background: selectedTable === name ? 'var(--surface)' : hoverId === name ? 'var(--surface-muted)' : 'transparent',
                cursor: 'pointer',
              }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{name}</span>
              <span style={{ fontSize: '10px', color: inA ? 'var(--status-info-text)' : 'var(--status-error-text)', fontFamily: 'monospace', textAlign: 'right' }}>{tA ? fmt(tA.rowCount) : '—'}</span>
              <span style={{ fontSize: '10px', color: inB ? 'rgba(124,58,237,0.85)' : 'var(--status-error-text)', fontFamily: 'monospace', textAlign: 'right' }}>{tB ? fmt(tB.rowCount) : '—'}</span>
              <span style={{ background: statusBg, color: statusColor, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{statusLabel}</span>
            </div>
          )
        })}
        {filteredTables.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No tables match filter</div>
        )}
      </div>

      {/* Slide-in panel */}
      {selectedTable && (() => {
        const tA = sA.tables.find(t => t.name === selectedTable)
        const tB = sB.tables.find(t => t.name === selectedTable)
        const diff = tA && tB ? pctDiff(tA.rowCount, tB.rowCount) : null

        return (
          <>
            <div onClick={() => setSelectedTable(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px,60vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
              {/* Panel header */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTable}</div>
                </div>
                {diff && <span style={{ fontSize: '11px', fontWeight: 700, color: diff.color }}>row diff: {diff.text}</span>}
                <button onClick={() => setSelectedTable(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '24px', height: '24px', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {/* A / B summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {tA ? (
                  <div style={{ background: 'var(--status-info-bg)', border: '1px solid var(--status-info-text)', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9px', color: 'var(--status-info-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schema A</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-info-text)', marginTop: '2px' }}>{fmt(tA.rowCount)} rows · {tA.columns.length} cols</div>
                  </div>
                ) : <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: 'var(--status-error-text)', fontWeight: 600 }}>Not in Schema A</div>}
                {tB ? (
                  <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: '6px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9px', color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schema B</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed', marginTop: '2px' }}>{fmt(tB.rowCount)} rows · {tB.columns.length} cols</div>
                  </div>
                ) : <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: 'var(--status-error-text)', fontWeight: 600 }}>Not in Schema B</div>}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {(['columns', 'stats'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: tab === t ? 600 : 400,
                    background: tab === t ? 'var(--foreground)' : 'var(--surface-muted)', color: tab === t ? 'var(--background)' : 'var(--text-secondary)', textTransform: 'capitalize',
                  }}>{t === 'columns' ? 'Columns' : 'Statistics'}</button>
                ))}
              </div>

              {/* Column comparison */}
              {tab === 'columns' && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 50px 50px 72px', gap: '0 4px', padding: '4px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                    {['Column', 'Type A', 'Type B', 'Null', 'Keys', 'Status'].map(h => (
                      <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {columnComparison.map(({ name, inA, inB }) => {
                    const typeMismatch = inA && inB && inA.type !== inB.type
                    const nullMismatch = inA && inB && inA.nullable !== inB.nullable
                    const missing = !inA || !inB
                    const hasDiff2 = typeMismatch || nullMismatch || missing
                    return (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 50px 50px 72px', gap: '0 4px', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--surface-muted)', background: hasDiff2 ? 'var(--status-warn-bg)' : 'transparent', fontSize: '10.5px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: inA ? (typeMismatch ? 'var(--status-error-text)' : 'var(--text-secondary)') : 'var(--status-error-text)' }}>{inA ? inA.type : 'MISSING'}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: inB ? (typeMismatch ? 'var(--status-error-text)' : 'var(--text-secondary)') : 'var(--status-error-text)' }}>{inB ? inB.type : 'MISSING'}</span>
                        <span style={{ fontSize: '9.5px', color: nullMismatch ? 'var(--status-warn-text)' : 'var(--text-muted)' }}>
                          {inA && inB ? (nullMismatch ? `A:${inA.nullable?'Y':'N'} B:${inB.nullable?'Y':'N'}` : (inA.nullable ? 'Y' : 'N')) : '—'}
                        </span>
                        <span style={{ fontSize: '9px' }}>
                          {(inA?.isPK || inB?.isPK) && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '0 3px', borderRadius: '2px', fontWeight: 700, marginRight: '2px' }}>PK</span>}
                          {(inA?.isFK || inB?.isFK) && <span style={{ background: 'var(--status-info-bg)', color: 'var(--status-info-text)', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>FK</span>}
                        </span>
                        <span style={{ background: missing ? 'var(--status-error-bg)' : typeMismatch ? 'var(--status-warn-bg)' : nullMismatch ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)', color: missing ? 'var(--status-error-text)' : typeMismatch ? 'var(--status-warn-text)' : nullMismatch ? 'var(--status-warn-text)' : 'var(--status-ok-text)', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>
                          {missing ? (!inA ? 'Only B' : 'Only A') : typeMismatch ? 'Type ≠' : nullMismatch ? 'Null ≠' : 'Match'}
                        </span>
                      </div>
                    )
                  })}
                  {columnComparison.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No column data available</div>}
                </div>
              )}

              {/* Stats */}
              {tab === 'stats' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {statsComparison.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No numeric statistics available</div>
                  ) : statsComparison.map(({ column, a, b }) => (
                    <div key={column} style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11.5px', color: 'var(--foreground)' }}>{column}</span>
                        {a && b && a.sum !== undefined && b.sum !== undefined && (() => {
                          const d = pctDiff(a.sum, b.sum)
                          return <span style={{ fontSize: '10px', fontWeight: 600, color: d.color }}>SUM diff: {d.text}</span>
                        })()}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['Metric', 'Schema A', 'Schema B', 'Diff'].map(h => (
                              <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Metric' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: 'SUM', valA: a?.sum, valB: b?.sum },
                            { label: 'AVG', valA: a?.avg, valB: b?.avg },
                            { label: 'MIN', valA: a?.min, valB: b?.min },
                            { label: 'MAX', valA: a?.max, valB: b?.max },
                            { label: 'NULLs', valA: a?.nullCount, valB: b?.nullCount },
                            { label: 'Distinct', valA: a?.distinctCount, valB: b?.distinctCount },
                          ].map(row => {
                            const d = row.valA !== undefined && row.valB !== undefined ? pctDiff(row.valA, row.valB) : null
                            return (
                              <tr key={row.label} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                                <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>{row.label}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--foreground)' }}>{fmt(row.valA)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--foreground)' }}>{fmt(row.valB)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: d?.color || 'var(--text-muted)' }}>{d?.text || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
