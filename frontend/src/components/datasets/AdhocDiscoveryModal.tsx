'use client'
import { useState, useEffect, useRef } from 'react'
import { Connection } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const LS_KEY = 'qualix_connections'

type JobResult = { database: string; schema: string; table_name: string; status: 'imported' | 'skipped' | 'error' | 'excluded'; reason?: string | null }
type Phase = 'idle' | 'building' | 'running' | 'done'

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
}
const DIALOG: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', width: '580px',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  imported: { bg: 'var(--status-ok-bg)',   color: 'var(--status-ok-text)'   },
  skipped:  { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' },
  error:    { bg: 'var(--status-error-bg)',color: 'var(--status-error-text)' },
  excluded: { bg: 'var(--surface-muted)',  color: 'var(--text-secondary)'   },
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
    apiFetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setConnections(data.map((c: Record<string, unknown>) => ({
            id: String(c.connection_id ?? c.id ?? ''),
            name: String(c.connection_name ?? c.name ?? ''),
            type: String(c.connection_type ?? c.type ?? '') as import('@/lib/types').ConnectionType,
            status: String(c.status ?? 'active') as 'active' | 'inactive' | 'error',
            host: String(c.host ?? ''),
            database: String(c.database ?? ''),
            createdAt: String(c.created_at ?? c.createdAt ?? new Date().toISOString()),
            filterMode: (c.filterMode ?? 'exclude') as 'include' | 'exclude',
            includedDatabases: Array.isArray(c.includedDatabases) ? c.includedDatabases as string[] : [],
            includedSchemas: Array.isArray(c.includedSchemas) ? c.includedSchemas as { database: string; schema: string }[] : [],
            excludedDatabases: Array.isArray(c.excludedDatabases) ? c.excludedDatabases as string[] : [],
            excludedSchemas: Array.isArray(c.excludedSchemas) ? c.excludedSchemas as { database: string; schema: string }[] : [],
          })))
        } else {
          try {
            const raw = localStorage.getItem(LS_KEY)
            setConnections(raw ? JSON.parse(raw) : [])
          } catch { setConnections([]) }
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem(LS_KEY)
          setConnections(raw ? JSON.parse(raw) : [])
        } catch { setConnections([]) }
      })
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
  const bannerBg      = bannerFailed ? 'var(--status-error-bg)' : allExcluded ? 'var(--status-warn-bg)' : 'var(--status-ok-bg)'
  const bannerBorder  = bannerFailed ? '#fca5a5' : allExcluded ? '#fde68a' : '#bbf7d0'
  const excludedPart  = excludedCount > 0 ? ` · ${excludedCount} excluded` : ''
  const summaryLine   = `${importedCount} imported · ${skippedCount} skipped${excludedPart} · ${errorCount} errors`

  const isRunning = phase === 'building' || phase === 'running'

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget && !isRunning) onClose() }}>
      <div style={DIALOG}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--foreground)' }}>Adhoc Discovery</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Runs discovery using your saved Database Filter settings</div>
          </div>
          <button onClick={onClose} disabled={isRunning} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-muted)', cursor: isRunning ? 'default' : 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {globalError && (
            <div style={{ background: 'var(--status-error-bg)', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: 'var(--status-error-text)', fontSize: '13px' }}>
              <strong>Error:</strong> {globalError}
            </div>
          )}

          {/* Connection selector — always visible */}
          {phase === 'idle' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Connection</label>
              <select
                value={selectedConn?.id ?? ''}
                onChange={e => {
                  const c = connections.find(x => x.id === e.target.value) ?? null
                  setSelectedConn(c)
                  setGlobalError(null)
                }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}
              >
                <option value="">— Select a connection —</option>
                {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
              {connections.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>No connections found. Add one on the Connections page first.</div>
              )}
            </div>
          )}

          {/* Filter summary (read-only) */}
          {phase === 'idle' && selectedConn && (
            <FilterSummary conn={selectedConn} />
          )}

          {/* Building phase */}
          {phase === 'building' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '18px' }}>⏳</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Building selections from filter settings…</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Enumerating databases and schemas.</div>
              </div>
            </div>
          )}

          {/* Running phase */}
          {phase === 'running' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '18px' }}>⏳</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Discovery in progress…</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tables are being classified and registered.</div>
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
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Discovery Complete</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{summaryLine}</div>
                </div>
              </div>
              {jobResults.length > 0 && <ResultsTable results={jobResults} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          {phase === 'done' ? (
            <>
              <button onClick={handleStartOver} style={{ background: 'none', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Start Over
              </button>
              <button onClick={() => { onComplete(); onClose() }} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </>
          ) : isRunning ? (
            <button disabled style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'default' }}>
              {phase === 'building' ? 'Building…' : 'Running…'}
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleRunDiscovery}
                disabled={!selectedConn}
                style={{ background: selectedConn ? '#2563eb' : 'var(--surface-muted)', color: selectedConn ? '#fff' : 'var(--text-muted)', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: selectedConn ? 'pointer' : 'default' }}
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
    <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Database Filter Settings</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, background: isInclude ? '#dbeafe' : 'var(--status-warn-bg)', color: isInclude ? '#1d4ed8' : 'var(--status-warn-text)' }}>
          {isInclude ? 'Include only selected' : 'Exclude selected'}
        </span>
      </div>

      {!hasFilters ? (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
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

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        To change filters, go to <strong>Settings → Connections</strong>
      </div>
    </div>
  )
}

function FilterGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: '11px', fontFamily: 'monospace', background: 'var(--border)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '6px' }}>
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
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Schema · Table</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const { bg, color } = STATUS_COLORS[r.status] ?? STATUS_COLORS.error
            return (
              <tr key={i} style={{ borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: 'var(--foreground)' }}>
                  {r.table_name === '*'
                    ? <span style={{ fontFamily: 'inherit', fontStyle: 'italic', color: 'var(--text-muted)' }}>{r.schema} · all tables</span>
                    : `${r.schema}.${r.table_name}`
                  }
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                  <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '11px' }}>{r.status}</span>
                </td>
                <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{r.reason ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
