'use client'
import { useState, useMemo, useEffect } from 'react'

/* ── Schema definitions (two schemas for comparison) ──────────── */

interface ColumnDef {
  name: string; type: string; nullable: boolean; isPK?: boolean; isFK?: boolean
  sampleValues?: string[]
}

interface TableSchema {
  name: string; rowCount: number; columns: ColumnDef[]
  stats: Record<string, { sum?: number; avg?: number; min?: number; max?: number; nullCount: number; distinctCount: number }>
}

interface SchemaData {
  name: string; database: string; tables: TableSchema[]
}


/* ── Helpers ──────────────────────────────────────────────────── */

function fmt(n: number | undefined): string {
  if (n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function pctDiff(a: number, b: number): { text: string; color: string } {
  if (a === 0 && b === 0) return { text: '0%', color: '#94a3b8' }
  if (a === 0) return { text: '+100%', color: '#dc2626' }
  const pct = ((b - a) / a) * 100
  if (Math.abs(pct) < 0.01) return { text: '0%', color: '#16a34a' }
  const sign = pct > 0 ? '+' : ''
  const color = Math.abs(pct) < 1 ? '#16a34a' : Math.abs(pct) < 5 ? '#d97706' : '#dc2626'
  return { text: `${sign}${pct.toFixed(2)}%`, color }
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }
const inp = (extra?: React.CSSProperties): React.CSSProperties => ({ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fff', boxSizing: 'border-box' as const, ...extra })

/* ── Component ────────────────────────────────────────────────── */

export default function SpotCheckPage() {
  const [schemas, setSchemas] = useState<SchemaData[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaA, setSchemaA] = useState(0)
  const [schemaB, setSchemaB] = useState(1)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tab, setTab] = useState<'tables' | 'columns' | 'stats'>('tables')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/snowflake/tables')
      .then(r => r.json())
      .then(data => {
        const tables = Array.isArray(data) ? data : (data.tables ?? [])
        if (tables.length === 0) { setLoading(false); return }
        // Group by schema to build schema objects
        const schemaMap = new Map<string, TableSchema[]>()
        for (const t of tables) {
          const key = `${t.database_name ?? ''}.${t.schema_name ?? ''}`
          if (!schemaMap.has(key)) schemaMap.set(key, [])
          schemaMap.get(key)!.push({
            name: String(t.table_name ?? t.name ?? ''),
            rowCount: Number(t.row_count ?? t.rowCount ?? 0),
            columns: [],
            stats: {},
          })
        }
        const built: SchemaData[] = []
        for (const [key, tbs] of schemaMap) {
          const parts = key.split('.')
          built.push({ name: parts[1] || key, database: parts[0] || '', tables: tbs })
        }
        setSchemas(built)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 20px' }}>Spot Check</h1>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
      </div>
    )
  }

  if (schemas.length === 0) {
    return (
      <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
        <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Explore</span></div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Spot Check</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>Compare tables, columns, and summary statistics across schemas</p>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          Connect a data source to use schema comparison
        </div>
      </div>
    )
  }

  const SCHEMAS = schemas
  const sA = SCHEMAS[schemaA] ?? SCHEMAS[0]
  const sB = SCHEMAS[Math.min(schemaB, SCHEMAS.length - 1)] ?? SCHEMAS[0]

  // Table comparison
  const allTableNames = useMemo(() => {
    const set = new Set([...sA.tables.map(t => t.name), ...sB.tables.map(t => t.name)])
    return [...set].sort()
  }, [sA, sB])

  const filteredTables = useMemo(() => {
    if (!search) return allTableNames
    return allTableNames.filter(t => t.toLowerCase().includes(search.toLowerCase()))
  }, [allTableNames, search])

  const tableA = sA.tables.find(t => t.name === selectedTable)
  const tableB = sB.tables.find(t => t.name === selectedTable)

  // Column comparison for selected table
  const columnComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const colsA = tableA?.columns || []
    const colsB = tableB?.columns || []
    const allNames = new Set([...colsA.map(c => c.name), ...colsB.map(c => c.name)])
    return [...allNames].map(name => ({
      name,
      inA: colsA.find(c => c.name === name),
      inB: colsB.find(c => c.name === name),
    }))
  }, [tableA, tableB])

  // Stats comparison
  const statsComparison = useMemo(() => {
    if (!tableA && !tableB) return []
    const statsA = tableA?.stats || {}
    const statsB = tableB?.stats || {}
    const allCols = new Set([...Object.keys(statsA), ...Object.keys(statsB)])
    return [...allCols].map(col => ({
      column: col,
      a: statsA[col],
      b: statsB[col],
    }))
  }, [tableA, tableB])

  // Summary KPIs
  const tablesOnlyA = allTableNames.filter(t => sA.tables.some(ta => ta.name === t) && !sB.tables.some(tb => tb.name === t))
  const tablesOnlyB = allTableNames.filter(t => !sA.tables.some(ta => ta.name === t) && sB.tables.some(tb => tb.name === t))
  const tablesCommon = allTableNames.filter(t => sA.tables.some(ta => ta.name === t) && sB.tables.some(tb => tb.name === t))

  const totalRowsA = sA.tables.reduce((s, t) => s + t.rowCount, 0)
  const totalRowsB = sB.tables.reduce((s, t) => s + t.rowCount, 0)

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Explore</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Spot Check</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>Compare tables, columns, and summary statistics across schemas</p>

      {/* Schema Selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', marginBottom: '20px', alignItems: 'end' }}>
        <div style={card}>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Source Schema (A)</div>
          <select value={schemaA} onChange={e => { setSchemaA(Number(e.target.value)); setSelectedTable(null) }} style={inp({ fontWeight: 600 })}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            <span><strong style={{ color: '#1a1a1a' }}>{sA.tables.length}</strong> tables</span>
            <span><strong style={{ color: '#1a1a1a' }}>{fmt(totalRowsA)}</strong> total rows</span>
          </div>
        </div>

        <div style={{ padding: '10px', textAlign: 'center' }}>
          <button onClick={() => { setSchemaA(schemaB); setSchemaB(schemaA); setSelectedTable(null) }}
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '16px' }}
            title="Swap schemas">⇄</button>
        </div>

        <div style={card}>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Target Schema (B)</div>
          <select value={schemaB} onChange={e => { setSchemaB(Number(e.target.value)); setSelectedTable(null) }} style={inp({ fontWeight: 600 })}>
            {SCHEMAS.map((s, i) => <option key={i} value={i}>{s.database}.{s.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            <span><strong style={{ color: '#1a1a1a' }}>{sB.tables.length}</strong> tables</span>
            <span><strong style={{ color: '#1a1a1a' }}>{fmt(totalRowsB)}</strong> total rows</span>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Common Tables', value: tablesCommon.length, icon: '✅', color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Only in A', value: tablesOnlyA.length, icon: '🔵', color: '#2563eb', bg: '#eff6ff' },
          { label: 'Only in B', value: tablesOnlyB.length, icon: '🟣', color: '#7c3aed', bg: '#faf5ff' },
          { label: 'Row Diff', value: pctDiff(totalRowsA, totalRowsB).text, icon: '📊', color: pctDiff(totalRowsA, totalRowsB).color, bg: '#fafaf9' },
          { label: 'Total Tables', value: allTableNames.length, icon: '📋', color: '#475569', bg: '#f8fafc' },
        ].map(k => (
          <div key={k.label} style={{ ...card, background: k.bg, textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>{k.icon}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px' }}>
        {/* Table List */}
        <div style={{ ...card, padding: '0', overflow: 'hidden', alignSelf: 'start', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #ebe8df', background: '#fafaf9' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>Tables ({allTableNames.length})</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter tables..."
              style={inp({ fontSize: '12px', padding: '6px 8px' })} />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredTables.map(name => {
              const inA = sA.tables.some(t => t.name === name)
              const inB = sB.tables.some(t => t.name === name)
              const isSelected = selectedTable === name
              return (
                <div key={name} onClick={() => { setSelectedTable(name); setTab('columns') }}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f1ea',
                    background: isSelected ? '#E8541A08' : 'transparent',
                    borderLeft: isSelected ? '3px solid #E8541A' : '3px solid transparent',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafaf9' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: isSelected ? 700 : 500, color: '#1a1a1a', fontFamily: 'monospace' }}>{name}</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {inA && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb' }} title="In Schema A" />}
                      {inB && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7c3aed' }} title="In Schema B" />}
                    </div>
                  </div>
                  {!inA && <span style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 600 }}>Only in B</span>}
                  {!inB && <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 600 }}>Only in A</span>}
                  {inA && inB && (
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                      A: {fmt(sA.tables.find(t => t.name === name)!.rowCount)} rows · B: {fmt(sB.tables.find(t => t.name === name)!.rowCount)} rows
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail Panel */}
        <div>
          {!selectedTable ? (
            /* Table Overview */
            <div style={card}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Table-Level Comparison</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ebe8df' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11px' }}>Table</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: '#2563eb', fontWeight: 600, fontSize: '11px' }}>Rows (A)</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: '#7c3aed', fontWeight: 600, fontSize: '11px' }}>Rows (B)</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11px' }}>Diff</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11px' }}>Cols (A)</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11px' }}>Cols (B)</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, fontSize: '11px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allTableNames.map(name => {
                    const tA = sA.tables.find(t => t.name === name)
                    const tB = sB.tables.find(t => t.name === name)
                    const diff = tA && tB ? pctDiff(tA.rowCount, tB.rowCount) : null
                    return (
                      <tr key={name} onClick={() => { setSelectedTable(name); setTab('columns') }}
                        style={{ borderBottom: '1px solid #f3f1ea', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fafaf9')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#1a1a1a' }}>{name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{tA ? fmt(tA.rowCount) : <span style={{ color: '#dc2626' }}>MISSING</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{tB ? fmt(tB.rowCount) : <span style={{ color: '#dc2626' }}>MISSING</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: diff?.color || '#94a3b8' }}>{diff?.text || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569' }}>{tA?.columns.length || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569' }}>{tB?.columns.length || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {!tA || !tB ? (
                            <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Schema Drift</span>
                          ) : diff && Math.abs(parseFloat(diff.text)) > 1 ? (
                            <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Row Diff</span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Match</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Table Detail */
            <div style={card}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <button onClick={() => setSelectedTable(null)} style={{ background: 'none', border: 'none', color: '#E8541A', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: 0, marginBottom: '4px' }}>← Back to all tables</button>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'monospace' }}>{selectedTable}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {tableA && (
                    <div style={{ padding: '6px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 600 }}>Schema A</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e40af' }}>{fmt(tableA.rowCount)} rows · {tableA.columns.length} cols</div>
                    </div>
                  )}
                  {tableB && (
                    <div style={{ padding: '6px 12px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #d8b4fe' }}>
                      <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 600 }}>Schema B</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#6d28d9' }}>{fmt(tableB.rowCount)} rows · {tableB.columns.length} cols</div>
                    </div>
                  )}
                  {tableA && tableB && (() => {
                    const d = pctDiff(tableA.rowCount, tableB.rowCount)
                    return (
                      <div style={{ padding: '6px 12px', background: '#fafaf9', borderRadius: '8px', border: '1px solid #ebe8df', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Row Diff</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: d.color }}>{d.text}</div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
                {(['columns', 'stats'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: 600, textTransform: 'capitalize',
                    background: tab === t ? '#1a1a1a' : '#f8fafc', color: tab === t ? '#fff' : '#64748b',
                  }}>{t === 'columns' ? 'Column Comparison' : 'Summary Statistics'}</button>
                ))}
              </div>

              {/* Columns Tab */}
              {tab === 'columns' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ebe8df' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Column</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: '#2563eb', fontWeight: 600, fontSize: '10.5px' }}>Type (A)</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: '#7c3aed', fontWeight: 600, fontSize: '10.5px' }}>Type (B)</th>
                      <th style={{ textAlign: 'center', padding: '8px 10px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Nullable</th>
                      <th style={{ textAlign: 'center', padding: '8px 10px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Keys</th>
                      <th style={{ textAlign: 'center', padding: '8px 10px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnComparison.map(({ name, inA, inB }) => {
                      const typeMismatch = inA && inB && inA.type !== inB.type
                      const nullMismatch = inA && inB && inA.nullable !== inB.nullable
                      const missing = !inA || !inB
                      const hasDiff = typeMismatch || nullMismatch || missing
                      return (
                        <tr key={name} style={{ borderBottom: '1px solid #f3f1ea', background: hasDiff ? '#fffbeb' : '' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#1a1a1a' }}>
                            {name}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', color: inA ? (typeMismatch ? '#dc2626' : '#475569') : '#dc2626' }}>
                            {inA ? inA.type : 'MISSING'}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '11px', color: inB ? (typeMismatch ? '#dc2626' : '#475569') : '#dc2626' }}>
                            {inB ? inB.type : 'MISSING'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {inA && inB ? (
                              nullMismatch ? (
                                <span style={{ color: '#d97706', fontWeight: 600, fontSize: '10px' }}>A:{inA.nullable ? 'Y' : 'N'} B:{inB.nullable ? 'Y' : 'N'}</span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{inA.nullable ? 'Yes' : 'No'}</span>
                              )
                            ) : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {(inA?.isPK || inB?.isPK) && <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, marginRight: '2px' }}>PK</span>}
                            {(inA?.isFK || inB?.isFK) && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700 }}>FK</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {missing ? (
                              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
                                {!inA ? 'Only in B' : 'Only in A'}
                              </span>
                            ) : typeMismatch ? (
                              <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Type Diff</span>
                            ) : nullMismatch ? (
                              <span style={{ background: '#fff7ed', color: '#ea580c', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Null Diff</span>
                            ) : (
                              <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>Match</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {/* Stats Tab */}
              {tab === 'stats' && (
                statsComparison.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No numeric statistics available for this table</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {statsComparison.map(({ column, a, b }) => (
                      <div key={column} style={{ border: '1px solid #ebe8df', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: '#fafaf9', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>{column}</span>
                          {a && b && a.sum !== undefined && b.sum !== undefined && (() => {
                            const d = pctDiff(a.sum, b.sum)
                            return <span style={{ fontSize: '11px', fontWeight: 600, color: d.color }}>SUM diff: {d.text}</span>
                          })()}
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #f3f1ea' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Metric</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#2563eb', fontWeight: 600, fontSize: '10.5px' }}>Schema A</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#7c3aed', fontWeight: 600, fontSize: '10.5px' }}>Schema B</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#94a3b8', fontWeight: 500, fontSize: '10.5px' }}>Diff</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { label: 'SUM', valA: a?.sum, valB: b?.sum },
                                { label: 'AVG', valA: a?.avg, valB: b?.avg },
                                { label: 'MIN', valA: a?.min, valB: b?.min },
                                { label: 'MAX', valA: a?.max, valB: b?.max },
                                { label: 'NULL Count', valA: a?.nullCount, valB: b?.nullCount },
                                { label: 'Distinct Count', valA: a?.distinctCount, valB: b?.distinctCount },
                              ].map(row => {
                                const diff = row.valA !== undefined && row.valB !== undefined ? pctDiff(row.valA, row.valB) : null
                                return (
                                  <tr key={row.label} style={{ borderBottom: '1px solid #f8f7f4' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#475569' }}>{row.label}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1a1a1a' }}>{fmt(row.valA)}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1a1a1a' }}>{fmt(row.valB)}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: diff?.color || '#94a3b8' }}>{diff?.text || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
