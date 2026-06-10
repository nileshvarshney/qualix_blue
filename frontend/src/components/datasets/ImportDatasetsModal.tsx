'use client'
import { useState, useEffect, useRef } from 'react'
import { Connection } from '@/lib/types'
import ConnectionExclusionsPanel from '@/components/connections/ConnectionExclusionsPanel'

const LS_KEY = 'qualix_connections'

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckState = 'none' | 'partial' | 'all'
interface TableNode  { type: string; rowCount: number | null; checked: boolean }
interface SchemaNode { checked: CheckState; expanded: boolean; loading: boolean; loaded: boolean; error?: string; tables: Record<string, TableNode> }
interface DbNode     { checked: CheckState; expanded: boolean; loading: boolean; loaded: boolean; error?: string; schemas: Record<string, SchemaNode> }
interface JobResult  { database: string; schema: string; table_name: string; status: 'imported' | 'skipped' | 'error' | 'excluded'; reason?: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveFromSchemas(schemas: Record<string, SchemaNode>): CheckState {
  const vals = Object.values(schemas).map(s => s.checked)
  if (vals.length === 0) return 'none'
  if (vals.every(s => s === 'all'))  return 'all'
  if (vals.every(s => s === 'none')) return 'none'
  return 'partial'
}

function deriveFromTables(tables: Record<string, TableNode>): CheckState {
  const vals = Object.values(tables).map(t => t.checked)
  if (vals.length === 0) return 'none'
  if (vals.every(v => v))  return 'all'
  if (vals.every(v => !v)) return 'none'
  return 'partial'
}

function countSelected(tree: Record<string, DbNode>): number {
  let n = 0
  for (const db of Object.values(tree)) {
    if (db.checked === 'none') continue
    if (!db.loaded) { n += 1; continue }
    for (const schema of Object.values(db.schemas)) {
      if (schema.checked === 'none') continue
      if (!schema.loaded) { n += 1; continue }
      n += Object.values(schema.tables).filter(t => t.checked).length
    }
  }
  return n
}

// ── Styles ────────────────────────────────────────────────────────────────────

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}
const DIALOG: React.CSSProperties = {
  background: '#fff', borderRadius: '16px', width: '660px',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  imported: { bg: '#f0fdf4', color: '#16a34a' },
  skipped:  { bg: '#fefce8', color: '#ca8a04' },
  error:    { bg: '#fee2e2', color: '#dc2626' },
  excluded: { bg: '#f8fafc', color: '#64748b' },
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ImportDatasetsModal({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [connections, setConnections]   = useState<Connection[]>([])
  const [selectedConn, setSelectedConn] = useState<Connection | null>(null)
  const [tree, setTree]                 = useState<Record<string, DbNode>>({})
  const [dbsLoading, setDbsLoading]     = useState(false)
  const [dbsError, setDbsError]         = useState<string | null>(null)
  const [importPhase, setImportPhase]   = useState<'idle' | 'importing' | 'done'>('idle')
  const [jobId, setJobId]               = useState<string | null>(null)
  const [jobStatus, setJobStatus]       = useState('')
  const [jobResults, setJobResults]     = useState<JobResult[]>([])
  const [globalError, setGlobalError]   = useState<string | null>(null)
  const [showExclusions, setShowExclusions] = useState(false)

  // Guard against stale fetch responses when connection changes
  const connRef = useRef<string | null>(null)

  // Load connections from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      setConnections(raw ? JSON.parse(raw) : [])
    } catch { setConnections([]) }
  }, [])

  // Load databases when connection changes
  useEffect(() => {
    if (!selectedConn) { setTree({}); return }
    connRef.current = selectedConn.id
    const myConnId = selectedConn.id
    setTree({})
    setDbsLoading(true)
    setDbsError(null)

    fetch(`/api/connections/${selectedConn.id}/databases`)
      .then(r => r.json())
      .then(d => {
        if (connRef.current !== myConnId) return
        if (d.error) { setDbsError(d.error); return }
        const dbs: string[] = (d.databases ?? []).map((x: { name: string }) => x.name)
        setTree(Object.fromEntries(dbs.map(name => [name, {
          checked: 'none', expanded: false, loading: false, loaded: false, schemas: {},
        } as DbNode])))
      })
      .catch(e => { if (connRef.current === myConnId) setDbsError((e as Error).message) })
      .finally(() => { if (connRef.current === myConnId) setDbsLoading(false) })
  }, [selectedConn])

  // Poll job status
  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/datasets/import/jobs/${jobId}`)
        const d = await r.json()
        setJobStatus(d.status ?? '')
        setJobResults(d.results ?? [])
        if (d.status === 'completed' || d.status === 'failed') {
          clearInterval(interval)
          setImportPhase('done')
        }
      } catch { /* keep polling */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [jobId])

  // ── Tree mutations ───────────────────────────────────────────────────────────

  function handleDbToggle(dbName: string) {
    setTree(prev => {
      const db = prev[dbName]
      if (!db) return prev
      const next: CheckState = db.checked === 'all' ? 'none' : 'all'
      const updatedSchemas = Object.fromEntries(
        Object.entries(db.schemas).map(([sName, schema]) => [sName, {
          ...schema,
          checked: next,
          tables: Object.fromEntries(
            Object.entries(schema.tables).map(([tName, t]) => [tName, { ...t, checked: next === 'all' }])
          ),
        }])
      )
      return { ...prev, [dbName]: { ...db, checked: next, schemas: updatedSchemas } }
    })
  }

  function handleDbExpand(dbName: string) {
    const db = tree[dbName]
    if (!db) return
    const expand = !db.expanded

    if (expand && !db.loaded && !db.loading && selectedConn) {
      const myConnId = selectedConn.id
      setTree(prev => ({ ...prev, [dbName]: { ...prev[dbName], expanded: true, loading: true, error: undefined } }))

      fetch(`/api/connections/${selectedConn.id}/schemas?database=${encodeURIComponent(dbName)}`)
        .then(r => r.json())
        .then(d => {
          if (connRef.current !== myConnId) return
          const schemaNames: string[] = d.error
            ? []
            : (d.schemas ?? []).map((x: { name: string }) => x.name)
          setTree(prev => {
            const parentChecked = prev[dbName]?.checked ?? 'none'
            const initChecked: CheckState = parentChecked === 'all' ? 'all' : 'none'
            return {
              ...prev,
              [dbName]: {
                ...prev[dbName],
                loading: false, loaded: true,
                error: d.error ?? undefined,
                schemas: Object.fromEntries(schemaNames.map(s => [s, {
                  checked: initChecked, expanded: false,
                  loading: false, loaded: false, tables: {},
                } as SchemaNode])),
              },
            }
          })
        })
        .catch(e => {
          if (connRef.current !== myConnId) return
          setTree(prev => ({ ...prev, [dbName]: { ...prev[dbName], loading: false, error: (e as Error).message } }))
        })
    } else {
      setTree(prev => ({ ...prev, [dbName]: { ...prev[dbName], expanded: expand } }))
    }
  }

  function handleSchemaToggle(dbName: string, schemaName: string) {
    setTree(prev => {
      const db = prev[dbName]
      const schema = db?.schemas[schemaName]
      if (!schema) return prev
      const next: CheckState = schema.checked === 'all' ? 'none' : 'all'
      const updatedTables = Object.fromEntries(
        Object.entries(schema.tables).map(([tName, t]) => [tName, { ...t, checked: next === 'all' }])
      )
      const updatedSchema: SchemaNode = { ...schema, checked: next, tables: updatedTables }
      const updatedSchemas = { ...db.schemas, [schemaName]: updatedSchema }
      const dbChecked = deriveFromSchemas(updatedSchemas)
      return { ...prev, [dbName]: { ...db, checked: dbChecked, schemas: updatedSchemas } }
    })
  }

  function handleSchemaExpand(dbName: string, schemaName: string) {
    const schema = tree[dbName]?.schemas[schemaName]
    if (!schema) return
    const expand = !schema.expanded

    if (expand && !schema.loaded && !schema.loading && selectedConn) {
      const myConnId = selectedConn.id
      setTree(prev => ({
        ...prev,
        [dbName]: {
          ...prev[dbName],
          schemas: { ...prev[dbName].schemas, [schemaName]: { ...prev[dbName].schemas[schemaName], expanded: true, loading: true, error: undefined } },
        },
      }))

      fetch(`/api/connections/${selectedConn.id}/tables?database=${encodeURIComponent(dbName)}&schema=${encodeURIComponent(schemaName)}`)
        .then(r => r.json())
        .then(d => {
          if (connRef.current !== myConnId) return
          const rawTables = d.error ? [] : (d.tables ?? [])
          setTree(prev => {
            const parentChecked = prev[dbName]?.schemas[schemaName]?.checked ?? 'none'
            const initChecked = parentChecked === 'all'
            const tables = Object.fromEntries(
              rawTables
                .map((t: Record<string, unknown>) => ({
                  name:     String(t.table_name ?? t.name ?? ''),
                  type:     String(t.table_type ?? 'TABLE'),
                  rowCount: (t.row_count ?? null) as number | null,
                }))
                .filter((t: { name: string }) => t.name)
                .map((t: { name: string; type: string; rowCount: number | null }) => [
                  t.name,
                  { type: t.type, rowCount: t.rowCount, checked: initChecked } as TableNode,
                ])
            )
            const updatedSchema: SchemaNode = {
              ...prev[dbName].schemas[schemaName],
              loading: false, loaded: true,
              error: d.error ?? undefined,
              tables,
            }
            const updatedSchemas = { ...prev[dbName].schemas, [schemaName]: updatedSchema }
            return {
              ...prev,
              [dbName]: { ...prev[dbName], schemas: updatedSchemas },
            }
          })
        })
        .catch(e => {
          if (connRef.current !== myConnId) return
          setTree(prev => ({
            ...prev,
            [dbName]: {
              ...prev[dbName],
              schemas: { ...prev[dbName].schemas, [schemaName]: { ...prev[dbName].schemas[schemaName], loading: false, error: (e as Error).message } },
            },
          }))
        })
    } else {
      setTree(prev => ({
        ...prev,
        [dbName]: {
          ...prev[dbName],
          schemas: { ...prev[dbName].schemas, [schemaName]: { ...prev[dbName].schemas[schemaName], expanded: expand } },
        },
      }))
    }
  }

  function handleTableToggle(dbName: string, schemaName: string, tableName: string) {
    setTree(prev => {
      const db = prev[dbName]
      const schema = db?.schemas[schemaName]
      if (!schema) return prev
      const updatedTables = { ...schema.tables, [tableName]: { ...schema.tables[tableName], checked: !schema.tables[tableName].checked } }
      const schemaChecked = deriveFromTables(updatedTables)
      const updatedSchema: SchemaNode = { ...schema, checked: schemaChecked, tables: updatedTables }
      const updatedSchemas = { ...db.schemas, [schemaName]: updatedSchema }
      const dbChecked = deriveFromSchemas(updatedSchemas)
      return { ...prev, [dbName]: { ...db, checked: dbChecked, schemas: updatedSchemas } }
    })
  }

  // ── Import ────────────────────────────────────────────────────────────────────

  async function resolveBackendConnectionId(): Promise<string> {
    const res = await fetch('/api/datasets/sync-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection: selectedConn }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to register connection')
    return data.connection_id as string
  }

  async function fetchSchemasNow(dbName: string): Promise<string[]> {
    const r = await fetch(`/api/connections/${selectedConn!.id}/schemas?database=${encodeURIComponent(dbName)}`)
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    return (d.schemas ?? []).map((x: { name: string }) => x.name)
  }

  async function handleImport() {
    if (!selectedConn) return
    setImportPhase('importing')
    setGlobalError(null)
    setJobResults([])
    setJobStatus('queued')

    const selections: { database: string; schema: string; tables?: string[] }[] = []

    try {
      for (const [dbName, db] of Object.entries(tree)) {
        if (db.checked === 'none') continue

        if (!db.loaded) {
          // db checked without expanding — load schemas now
          const schemas = await fetchSchemasNow(dbName)
          for (const s of schemas) selections.push({ database: dbName, schema: s })
          continue
        }

        for (const [schemaName, schema] of Object.entries(db.schemas)) {
          if (schema.checked === 'none') continue

          if (!schema.loaded || schema.checked === 'all') {
            selections.push({ database: dbName, schema: schemaName })
          } else {
            const tables = Object.entries(schema.tables)
              .filter(([, t]) => t.checked)
              .map(([name]) => name)
            if (tables.length > 0) selections.push({ database: dbName, schema: schemaName, tables })
          }
        }
      }

      if (selections.length === 0) { setImportPhase('idle'); return }

      const connectionId = await resolveBackendConnectionId()
      const res = await fetch('/api/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, selections }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.detail ?? 'Failed to start import')
      setJobId(data.job_id)
    } catch (e: unknown) {
      setGlobalError((e as Error).message)
      setImportPhase('done')
    }
  }

  function handleStartOver() {
    setImportPhase('idle')
    setJobId(null)
    setJobStatus('')
    setJobResults([])
    setGlobalError(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const selected = countSelected(tree)
  const importedCount  = jobResults.filter(r => r.status === 'imported').length
  const skippedCount   = jobResults.filter(r => r.status === 'skipped').length
  const errorCount     = jobResults.filter(r => r.status === 'error').length
  const excludedCount  = jobResults.filter(r => r.status === 'excluded').length

  const allExcluded  = excludedCount > 0 && importedCount === 0 && skippedCount === 0 && errorCount === 0
  const bannerFailed = jobStatus === 'failed' && importedCount === 0
  const bannerIcon   = bannerFailed ? '❌' : allExcluded ? '⚠️' : '✅'
  const bannerBg     = bannerFailed ? '#fee2e2' : allExcluded ? '#fefce8' : '#f0fdf4'
  const bannerBorder = bannerFailed ? '#fca5a5' : allExcluded ? '#fde68a' : '#bbf7d0'
  const excludedPart = excludedCount > 0 ? ` · ${excludedCount} excluded` : ''
  const summaryLine  = `${importedCount} imported · ${skippedCount} skipped${excludedPart} · ${errorCount} errors`

  return (
    <>
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={DIALOG}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Import Datasets</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Browse and select databases, schemas, and tables to import</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Connection selector */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={selectedConn?.id ?? ''}
              onChange={e => {
                const c = connections.find(x => x.id === e.target.value) ?? null
                setSelectedConn(c)
                setGlobalError(null)
                setShowExclusions(false)
              }}
              style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a' }}
            >
              <option value="">— Select a connection —</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
            {selectedConn && (
              <button
                onClick={() => setShowExclusions(v => !v)}
                title="Include / exclude databases and schemas"
                style={{
                  padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  background: showExclusions ? '#dbeafe' : '#fff',
                  color: showExclusions ? '#2563eb' : '#64748b',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                ⚙ Exclusions
              </button>
            )}
          </div>
          {connections.length === 0 && (
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>No connections found. Add one on the Connections page first.</div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>

          {globalError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', color: '#dc2626', fontSize: '13px' }}>
              <strong>Error:</strong> {globalError}
            </div>
          )}

          {/* Importing phase */}
          {importPhase === 'importing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '18px' }}>⏳</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>Discovery in progress…</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Tables are being classified and registered.</div>
                </div>
              </div>
              {jobResults.length > 0 && <ResultsTable results={jobResults} />}
            </div>
          )}

          {/* Done phase */}
          {importPhase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: bannerBg, borderRadius: '8px', border: `1px solid ${bannerBorder}` }}>
                <span style={{ fontSize: '22px' }}>{bannerIcon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a' }}>Import Complete</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{summaryLine}</div>
                </div>
              </div>
              {jobResults.length > 0 && <ResultsTable results={jobResults} />}
            </div>
          )}

          {/* Tree view (idle phase) */}
          {importPhase === 'idle' && (
            <>
              {dbsLoading && (
                <div style={{ fontSize: '13px', color: '#94a3b8', padding: '8px 0' }}>Loading databases…</div>
              )}
              {dbsError && (
                <div style={{ color: '#dc2626', fontSize: '13px', padding: '8px 0' }}>Error: {dbsError}</div>
              )}
              {!dbsLoading && !dbsError && selectedConn && Object.keys(tree).length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>No databases found for this connection.</div>
              )}
              {!selectedConn && (
                <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>Select a connection above to browse its databases.</div>
              )}

              {Object.entries(tree).map(([dbName, db]) => (
                <div key={dbName}>
                  {/* Database row */}
                  <DbRow
                    name={dbName}
                    node={db}
                    onToggle={() => handleDbToggle(dbName)}
                    onExpand={() => handleDbExpand(dbName)}
                  />

                  {/* Schemas */}
                  {db.expanded && (
                    <div>
                      {db.loading && <div style={{ paddingLeft: '44px', fontSize: '12px', color: '#94a3b8', padding: '4px 0 4px 44px' }}>Loading schemas…</div>}
                      {db.error && <div style={{ paddingLeft: '44px', fontSize: '12px', color: '#dc2626', padding: '4px 0 4px 44px' }}>Error: {db.error}</div>}
                      {db.loaded && Object.keys(db.schemas).length === 0 && !db.error && (
                        <div style={{ paddingLeft: '44px', fontSize: '12px', color: '#94a3b8', padding: '4px 0 4px 44px' }}>No schemas found.</div>
                      )}

                      {Object.entries(db.schemas).map(([schemaName, schema]) => (
                        <div key={schemaName}>
                          {/* Schema row */}
                          <SchemaRow
                            name={schemaName}
                            node={schema}
                            onToggle={() => handleSchemaToggle(dbName, schemaName)}
                            onExpand={() => handleSchemaExpand(dbName, schemaName)}
                          />

                          {/* Tables */}
                          {schema.expanded && (
                            <div>
                              {schema.loading && <div style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 0 4px 68px' }}>Loading tables…</div>}
                              {schema.error && <div style={{ fontSize: '12px', color: '#dc2626', padding: '4px 0 4px 68px' }}>Error: {schema.error}</div>}
                              {schema.loaded && Object.keys(schema.tables).length === 0 && !schema.error && (
                                <div style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 0 4px 68px' }}>No tables found.</div>
                              )}

                              {Object.entries(schema.tables).map(([tableName, table]) => (
                                <TableRow
                                  key={tableName}
                                  name={tableName}
                                  node={table}
                                  onToggle={() => handleTableToggle(dbName, schemaName, tableName)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          {importPhase === 'done' ? (
            <>
              <button onClick={handleStartOver} style={{ background: 'none', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                Start Over
              </button>
              <button onClick={() => { onComplete(); onClose() }} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </>
          ) : importPhase === 'importing' ? (
            <button disabled style={{ background: '#e2e8f0', color: '#94a3b8', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'default' }}>
              Importing…
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selected === 0}
                style={{ background: selected > 0 ? '#2563eb' : '#e2e8f0', color: selected > 0 ? '#fff' : '#94a3b8', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: selected > 0 ? 'pointer' : 'default', opacity: 1 }}
              >
                {selected > 0 ? `Import ${selected} selected` : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>

    {showExclusions && selectedConn && (
      <ConnectionExclusionsPanel
        connection={selectedConn}
        onClose={() => setShowExclusions(false)}
        onSaved={(updated: Connection) => {
          setSelectedConn(updated)
          setConnections(prev => prev.map(c => c.id === updated.id ? updated : c))
          setShowExclusions(false)
        }}
      />
    )}
    </>
  )
}

// ── Row sub-components ────────────────────────────────────────────────────────

function DbRow({ name, node, onToggle, onExpand }: { name: string; node: DbNode; onToggle: () => void; onExpand: () => void }) {
  const schemaCount = Object.keys(node.schemas).length
  const isSelected = node.checked !== 'none'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', borderRadius: '8px', border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`, background: isSelected ? '#eff6ff' : '#fafaf9', marginBottom: '4px', cursor: 'pointer' }}
      onClick={onExpand}>
      {/* Expand arrow */}
      <span style={{ fontSize: '11px', color: '#64748b', width: '14px', textAlign: 'center', flexShrink: 0 }}>
        {node.loading ? '…' : node.expanded ? '▼' : '▶'}
      </span>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={node.checked === 'all'}
        ref={(el) => { if (el) el.indeterminate = node.checked === 'partial' }}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ accentColor: '#2563eb', flexShrink: 0 }}
      />
      {/* DB icon */}
      <span style={{ fontSize: '13px' }}>🗄️</span>
      {/* Name */}
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', color: '#0f172a' }}>{name}</span>
      {/* Badge */}
      {node.loaded && schemaCount > 0 && (
        <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: '10px' }}>
          {schemaCount} schema{schemaCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

function SchemaRow({ name, node, onToggle, onExpand }: { name: string; node: SchemaNode; onToggle: () => void; onExpand: () => void }) {
  const tableCount = Object.keys(node.tables).length
  const checkedCount = Object.values(node.tables).filter(t => t.checked).length
  const isSelected = node.checked !== 'none'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px 6px 24px', borderRadius: '8px', border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`, background: isSelected ? '#f0f9ff' : '#fafaf9', marginBottom: '3px', cursor: 'pointer' }}
      onClick={onExpand}>
      <span style={{ fontSize: '11px', color: '#64748b', width: '14px', textAlign: 'center', flexShrink: 0 }}>
        {node.loading ? '…' : node.expanded ? '▼' : '▶'}
      </span>
      <input
        type="checkbox"
        checked={node.checked === 'all'}
        ref={(el) => { if (el) el.indeterminate = node.checked === 'partial' }}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ accentColor: '#2563eb', flexShrink: 0 }}
      />
      <span style={{ fontSize: '12px' }}>📋</span>
      <span style={{ flex: 1, fontSize: '12px', fontFamily: 'monospace', color: '#334155', fontWeight: 500 }}>{name}</span>
      {node.loaded && tableCount > 0 && (
        <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: '10px' }}>
          {node.checked === 'partial' ? `${checkedCount}/` : ''}{tableCount} table{tableCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

function TableRow({ name, node, onToggle }: { name: string; node: TableNode; onToggle: () => void }) {
  const isView = node.type.toUpperCase().includes('VIEW')
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px 5px 48px', borderRadius: '7px', border: `1px solid ${node.checked ? '#93c5fd' : '#e2e8f0'}`, background: node.checked ? '#eff6ff' : '#fff', marginBottom: '2px', cursor: 'pointer', fontSize: '12px' }}>
      <input type="checkbox" checked={node.checked} onChange={onToggle} style={{ accentColor: '#2563eb', flexShrink: 0 }} />
      <span style={{ flex: 1, fontFamily: 'monospace', color: '#0f172a' }}>{name}</span>
      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, background: isView ? '#fef3c7' : '#e0e7ff', color: isView ? '#92400e' : '#3730a3' }}>
        {isView ? 'VIEW' : 'TABLE'}
      </span>
      {node.rowCount != null && (
        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{node.rowCount.toLocaleString()} rows</span>
      )}
    </label>
  )
}

// ── Results table (unchanged) ─────────────────────────────────────────────────

function ResultsTable({ results }: { results: JobResult[] }) {
  if (results.length === 0) return null
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Schema · Table</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Status</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const { bg, color } = STATUS_COLORS[r.status] ?? STATUS_COLORS.error
            return (
              <tr key={i} style={{ borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#0f172a' }}>
                  {r.table_name === '*'
                    ? <span style={{ fontFamily: 'inherit', fontStyle: 'italic', color: '#94a3b8' }}>{r.schema} · all tables</span>
                    : `${r.schema}.${r.table_name}`
                  }
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                  <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '11px' }}>{r.status}</span>
                </td>
                <td style={{ padding: '7px 12px', color: '#64748b' }}>{r.reason ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
