'use client'
import { useState, useEffect, useRef } from 'react'
import { Connection } from '@/lib/types'

const LS_KEY = 'qualix_connections'

type JobResult = { database: string; schema: string; table_name: string; status: 'imported' | 'skipped' | 'error' | 'excluded'; reason?: string | null }
type Phase = 'idle' | 'building' | 'running' | 'done'

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}
const DIALOG: React.CSSProperties = {
  background: '#fff', borderRadius: '16px', width: '580px',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  imported: { bg: '#f0fdf4', color: '#16a34a' },
  skipped:  { bg: '#fefce8', color: '#ca8a04' },
  error:    { bg: '#fee2e2', color: '#dc2626' },
  excluded: { bg: '#f8fafc', color: '#64748b' },
}

export default function AdhocDiscoveryModal({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [connections, setConnections]   = useState<Connection[]>([])
  const [selectedConn, setSelectedConn] = useState<Connection | null>(null)
  const [phase, setPhase]               = useState<Phase>('idle')
  const [jobId, setJobId]               = useState<string | null>(null)
  const [jobStatus, setJobStatus]       = useState('')
  const [jobResults, setJobResults]     = useState<JobResult[]>([])
  const [globalError, setGlobalError]   = useState<string | null>(null)

  const connRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      setConnections(raw ? JSON.parse(raw) : [])
    } catch { setConnections([]) }
  }, [])

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
          setPhase('done')
        }
      } catch { /* keep polling */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [jobId])

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

  async function fetchDatabases(connId: string): Promise<string[]> {
    const r = await fetch(`/api/connections/${connId}/databases`)
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    return (d.databases ?? []).map((x: { name: string }) => x.name)
  }

  async function fetchSchemas(connId: string, dbName: string): Promise<string[]> {
    const r = await fetch(`/api/connections/${connId}/schemas?database=${encodeURIComponent(dbName)}`)
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    return (d.schemas ?? []).map((x: { name: string }) => x.name)
  }

  async function handleRunDiscovery() {
    if (!selectedConn) return
    const conn = selectedConn
    connRef.current = conn.id

    setPhase('building')
    setGlobalError(null)
    setJobResults([])
    setJobStatus('queued')

    try {
      const filterMode = conn.filterMode ?? 'exclude'
      const selections: { database: string; schema: string }[] = []

      if (filterMode === 'include') {
        const includedDbs = conn.includedDatabases ?? []
        const includedSchemas = conn.includedSchemas ?? []

        const schemaResults = await Promise.all(
          includedDbs.map(db =>
            fetchSchemas(conn.id, db).then(schemas =>
              schemas.map(s => ({ database: db, schema: s }))
            )
          )
        )
        selections.push(...schemaResults.flat())

        // Add explicitly included schemas whose database is not in includedDbs
        const coveredDbs = new Set(includedDbs)
        for (const s of includedSchemas) {
          if (!coveredDbs.has(s.database)) {
            selections.push({ database: s.database, schema: s.schema })
          }
        }
      } else {
        // exclude mode (default)
        const excludedDbSet = new Set(conn.excludedDatabases ?? [])
        const excludedSchemaSet = new Set(
          (conn.excludedSchemas ?? []).map(s => `${s.database}||${s.schema}`)
        )

        const allDbs = await fetchDatabases(conn.id)
        const relevantDbs = allDbs.filter(db => !excludedDbSet.has(db))

        const schemaResults = await Promise.all(
          relevantDbs.map(db =>
            fetchSchemas(conn.id, db).then(schemas =>
              schemas
                .filter(s => !excludedSchemaSet.has(`${db}||${s}`))
                .map(s => ({ database: db, schema: s }))
            )
          )
        )
        selections.push(...schemaResults.flat())
      }

      if (selections.length === 0) {
        setGlobalError('No schemas match the current filter settings. Check Settings → Connections → Database Filters.')
        setPhase('idle')
        return
      }

      setPhase('running')
      const connectionId = await resolveBackendConnectionId()
      const res = await fetch('/api/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, selections }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.detail ?? 'Failed to start discovery')
      setJobId(data.job_id)
    } catch (e: unknown) {
      setGlobalError((e as Error).message)
      setPhase('done')
    }
  }

  function handleStartOver() {
    setPhase('idle')
    setJobId(null)
    setJobStatus('')
    setJobResults([])
    setGlobalError(null)
  }

  // ── Computed banner values ────────────────────────────────────────────────────
  const importedCount = jobResults.filter(r => r.status === 'imported').length
  const skippedCount  = jobResults.filter(r => r.status === 'skipped').length
  const errorCount    = jobResults.filter(r => r.status === 'error').length
  const excludedCount = jobResults.filter(r => r.status === 'excluded').length
  const allExcluded   = excludedCount > 0 && importedCount === 0 && skippedCount === 0 && errorCount === 0
  const bannerFailed  = jobStatus === 'failed' && importedCount === 0
  const bannerIcon    = bannerFailed ? '❌' : allExcluded ? '⚠️' : '✅'
  const bannerBg      = bannerFailed ? '#fee2e2' : allExcluded ? '#fefce8' : '#f0fdf4'
  const bannerBorder  = bannerFailed ? '#fca5a5' : allExcluded ? '#fde68a' : '#bbf7d0'
  const excludedPart  = excludedCount > 0 ? ` · ${excludedCount} excluded` : ''
  const summaryLine   = `${importedCount} imported · ${skippedCount} skipped${excludedPart} · ${errorCount} errors`

  const isRunning = phase === 'building' || phase === 'running'

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget && !isRunning) onClose() }}>
      <div style={DIALOG}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Adhoc Discovery</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Runs discovery using your saved Database Filter settings</div>
          </div>
          <button onClick={onClose} disabled={isRunning} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: isRunning ? 'default' : 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {globalError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px' }}>
              <strong>Error:</strong> {globalError}
            </div>
          )}

          {/* Connection selector — always visible */}
          {phase === 'idle' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Connection</label>
              <select
                value={selectedConn?.id ?? ''}
                onChange={e => {
                  const c = connections.find(x => x.id === e.target.value) ?? null
                  setSelectedConn(c)
                  setGlobalError(null)
                }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a' }}
              >
                <option value="">— Select a connection —</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
              {connections.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>No connections found. Add one on the Connections page first.</div>
              )}
            </div>
          )}

          {/* Filter summary (read-only) */}
          {phase === 'idle' && selectedConn && (
            <FilterSummary conn={selectedConn} />
          )}

          {/* Building phase */}
          {phase === 'building' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '18px' }}>⏳</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>Building selections from filter settings…</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Enumerating databases and schemas.</div>
              </div>
            </div>
          )}

          {/* Running phase */}
          {phase === 'running' && (
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
          {phase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: bannerBg, borderRadius: '8px', border: `1px solid ${bannerBorder}` }}>
                <span style={{ fontSize: '22px' }}>{bannerIcon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a' }}>Discovery Complete</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{summaryLine}</div>
                </div>
              </div>
              {jobResults.length > 0 && <ResultsTable results={jobResults} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          {phase === 'done' ? (
            <>
              <button onClick={handleStartOver} style={{ background: 'none', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                Start Over
              </button>
              <button onClick={() => { onComplete(); onClose() }} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </>
          ) : isRunning ? (
            <button disabled style={{ background: '#e2e8f0', color: '#94a3b8', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'default' }}>
              {phase === 'building' ? 'Building…' : 'Running…'}
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleRunDiscovery}
                disabled={!selectedConn}
                style={{ background: selectedConn ? '#2563eb' : '#e2e8f0', color: selectedConn ? '#fff' : '#94a3b8', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: selectedConn ? 'pointer' : 'default' }}
              >
                Run Adhoc Discovery
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filter summary (read-only) ────────────────────────────────────────────────

function FilterSummary({ conn }: { conn: Connection }) {
  const filterMode      = conn.filterMode ?? 'exclude'
  const isInclude       = filterMode === 'include'
  const includedDbs     = conn.includedDatabases ?? []
  const includedSchemas = conn.includedSchemas ?? []
  const excludedDbs     = conn.excludedDatabases ?? []
  const excludedSchemas = conn.excludedSchemas ?? []

  const hasFilters = isInclude
    ? includedDbs.length > 0 || includedSchemas.length > 0
    : excludedDbs.length > 0 || excludedSchemas.length > 0

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Database Filter Settings</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, background: isInclude ? '#dbeafe' : '#fef9c3', color: isInclude ? '#1d4ed8' : '#92400e' }}>
          {isInclude ? 'Include only selected' : 'Exclude selected'}
        </span>
      </div>

      {!hasFilters ? (
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {isInclude
            ? 'No items in include list — nothing will be discovered. Add databases or schemas in Settings → Connections.'
            : 'No exclusions configured — all databases and schemas will be discovered.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isInclude ? (
            <>
              {includedDbs.length > 0 && (
                <FilterGroup label="Included databases (all schemas)" items={includedDbs} />
              )}
              {includedSchemas.length > 0 && (
                <FilterGroup label="Included schemas" items={includedSchemas.map(s => `${s.database} › ${s.schema}`)} />
              )}
            </>
          ) : (
            <>
              {excludedDbs.length > 0 && (
                <FilterGroup label="Excluded databases" items={excludedDbs} />
              )}
              {excludedSchemas.length > 0 && (
                <FilterGroup label="Excluded schemas" items={excludedSchemas.map(s => `${s.database} › ${s.schema}`)} />
              )}
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
        To change filters, go to <strong>Settings → Connections</strong>
      </div>
    </div>
  )
}

function FilterGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: '11px', fontFamily: 'monospace', background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '6px' }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Results table ─────────────────────────────────────────────────────────────

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
