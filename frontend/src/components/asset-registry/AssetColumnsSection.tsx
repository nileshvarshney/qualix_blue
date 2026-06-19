'use client'
import { useState, useEffect, useCallback } from 'react'

interface Column {
  column_name: string
  data_type?: string
  ordinal_position?: number
  is_nullable?: boolean
  is_primary_key?: boolean
  classification?: string
  description?: string
}

interface Props {
  assetId: string
  connectionId?: string
  sourceMeta?: { sf_database_name?: string; sf_schema_name?: string; sf_table_name?: string }
  editing?: boolean
  saveRef?: React.RefObject<(() => Promise<void>) | null>
}

const headerStyle: React.CSSProperties = {
  background: 'var(--surface-raised, var(--surface))',
  padding: '6px 10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
}

export default function AssetColumnsSection({ assetId, connectionId, sourceMeta, editing, saveRef }: Props) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [loadingCols, setLoadingCols] = useState(false)
  const [colError, setColError] = useState<string | null>(null)

  const [showSamples, setShowSamples] = useState(false)
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[] | null>(null)
  const [sampleCols, setSampleCols] = useState<string[]>([])
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const [descDrafts, setDescDrafts] = useState<Record<string, string>>({})
  const [savingDesc, setSavingDesc] = useState(false)
  const [descSaveError, setDescSaveError] = useState<string | null>(null)

  const hasPendingDescriptions = Object.keys(descDrafts).length > 0

  const saveDescriptions = useCallback(async () => {
    if (Object.keys(descDrafts).length === 0) return
    setSavingDesc(true)
    setDescSaveError(null)
    try {
      for (const [colName, desc] of Object.entries(descDrafts)) {
        const res = await fetch(`/api/asset-registry/${assetId}/column-meta/${encodeURIComponent(colName)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc }),
        })
        if (!res.ok) throw new Error(`Failed to save description for ${colName}`)
      }
      // Commit drafts into columns state
      setColumns(prev => (prev ?? []).map(c =>
        descDrafts[c.column_name] !== undefined
          ? { ...c, description: descDrafts[c.column_name] }
          : c
      ))
      setDescDrafts({})
    } catch (e: unknown) {
      setDescSaveError((e as Error).message)
    } finally {
      setSavingDesc(false)
    }
  }, [descDrafts, assetId])

  useEffect(() => {
    if (saveRef) saveRef.current = hasPendingDescriptions ? saveDescriptions : null
  }, [saveRef, hasPendingDescriptions, saveDescriptions])

  const canSample = Boolean(connectionId && sourceMeta?.sf_table_name)

  async function handleToggleColumns() {
    const next = !open
    setOpen(next)
    if (next && columns === null && !loadingCols) {
      setLoadingCols(true)
      setColError(null)
      try {
        const res = await fetch(`/api/asset-registry/${assetId}/columns`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setColumns(data.columns ?? [])
      } catch (e: unknown) {
        setColError((e as Error).message)
        setColumns([])
      } finally {
        setLoadingCols(false)
      }
    }
  }

  async function handleViewSamples(e: React.MouseEvent) {
    e.stopPropagation()
    if (!canSample) return
    if (sampleRows !== null) {
      setShowSamples(true)
      return
    }
    setLoadingSamples(true)
    setSampleError(null)
    setShowSamples(true)
    try {
      const qs = new URLSearchParams({
        connection_id: connectionId!,
        database: sourceMeta!.sf_database_name ?? '',
        schema: sourceMeta!.sf_schema_name ?? '',
        table: sourceMeta!.sf_table_name!,
        limit: '10',
      })
      const res = await fetch(`/api/snowflake/preview?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSampleCols(data.columns ?? [])
      setSampleRows(data.rows ?? [])
    } catch (e: unknown) {
      setSampleError((e as Error).message)
      setSampleRows([])
    } finally {
      setLoadingSamples(false)
    }
  }

  const colCount = columns?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Columns section */}
      <div style={sectionStyle}>
        <div style={headerStyle} onClick={handleToggleColumns}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
            {open ? '▼' : '▶'} Columns{columns !== null ? ` (${colCount})` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
            {editing && hasPendingDescriptions && (
              <button
                onClick={saveDescriptions}
                disabled={savingDesc}
                style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
                  border: 'none', background: 'var(--accent)', color: '#fff',
                  cursor: savingDesc ? 'not-allowed' : 'pointer', fontWeight: 600,
                  opacity: savingDesc ? 0.6 : 1,
                }}
              >
                {savingDesc ? 'Saving…' : 'Save Descriptions'}
              </button>
            )}
            <button
              onClick={handleViewSamples}
              disabled={!canSample}
              style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
                border: '1px solid var(--border)',
                background: canSample ? 'var(--accent-bg)' : 'var(--surface)',
                color: canSample ? 'var(--accent)' : 'var(--text-muted)',
                cursor: canSample ? 'pointer' : 'not-allowed', fontWeight: 600,
              }}
            >
              View 10 Samples
            </button>
          </div>
        </div>
        {descSaveError && (
          <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--status-error-text)', background: 'var(--status-error-bg)' }}>
            {descSaveError}
          </div>
        )}

        {open && (
          <div style={{ overflowX: 'auto' }}>
            {loadingCols && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Loading columns…
              </div>
            )}
            {colError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--status-error-text)' }}>
                {colError}
              </div>
            )}
            {!loadingCols && columns !== null && columns.length === 0 && !colError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                No column metadata available. Run column profiling to populate this.
              </div>
            )}
            {!loadingCols && columns && columns.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Name', 'Type', 'Nullable', 'Class', 'Description'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={col.column_name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {col.ordinal_position ?? i + 1}
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {col.column_name}
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {col.data_type ?? '—'}
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {col.is_primary_key
                          ? <span style={{ color: 'var(--status-ok-text)', fontWeight: 600, fontSize: '10px' }}>PK</span>
                          : <span style={{ color: col.is_nullable ? 'var(--text-muted)' : 'var(--foreground)', fontSize: '10px' }}>
                              {col.is_nullable === undefined ? '—' : col.is_nullable ? 'YES' : 'NO'}
                            </span>
                        }
                      </td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {col.classification && (
                          <span style={{
                            fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
                            background: col.classification === 'PII' ? 'var(--status-error-bg)' : 'var(--status-warn-bg)',
                            color: col.classification === 'PII' ? 'var(--status-error-text)' : 'var(--status-warn-text)',
                          }}>
                            {col.classification}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: '120px', maxWidth: '220px' }}>
                        {editing ? (
                          <input
                            value={descDrafts[col.column_name] ?? col.description ?? ''}
                            onChange={e => setDescDrafts(prev => ({ ...prev, [col.column_name]: e.target.value }))}
                            placeholder="Add description…"
                            style={{
                              width: '100%', fontSize: '10px', padding: '2px 4px',
                              border: '1px solid var(--border)', borderRadius: '3px',
                              background: 'var(--background)', color: 'var(--foreground)', outline: 'none',
                              boxSizing: 'border-box' as const,
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '10px', color: col.description ? 'var(--foreground)' : 'var(--text-muted)' }}>
                            {col.description || '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Sample Records section */}
      {showSamples && (
        <div style={sectionStyle}>
          <div style={{ ...headerStyle, cursor: 'default' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
              ▼ Sample Records{sampleRows ? ` (${sampleRows.length} rows)` : ''}
            </span>
            <button
              onClick={() => setShowSamples(false)}
              style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              ▲ hide
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {loadingSamples && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Loading sample records…
              </div>
            )}
            {sampleError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--status-error-text)' }}>
                {sampleError}
              </div>
            )}
            {!loadingSamples && sampleRows && sampleRows.length === 0 && !sampleError && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                No sample records returned.
              </div>
            )}
            {!loadingSamples && sampleRows && sampleRows.length > 0 && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {sampleCols.map(col => (
                        <th key={col} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        {sampleCols.map(col => (
                          <td key={col} style={{ padding: '4px 8px', color: 'var(--foreground)', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[col] == null ? <span style={{ color: 'var(--text-muted)' }}>null</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  {sampleRows.length} rows · live query from Snowflake
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
