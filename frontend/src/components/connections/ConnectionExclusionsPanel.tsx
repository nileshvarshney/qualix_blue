'use client'
import { useState, useEffect } from 'react'
import { Connection } from '@/lib/types'

type CheckState = 'none' | 'partial' | 'all'
type FilterMode = 'include' | 'exclude'

interface SchemaNode {
  name: string
  checked: boolean
}

interface DbNode {
  name: string
  checked: CheckState
  expanded: boolean
  schemas: SchemaNode[]
  schemasLoaded: boolean
  loading: boolean
}

interface Props {
  connection: Connection
  onClose: () => void
  onSaved: (updated: Connection) => void
}

export default function ConnectionExclusionsPanel({ connection, onClose, onSaved }: Props) {
  const [filterMode, setFilterMode] = useState<FilterMode>((connection.filterMode as FilterMode) ?? 'exclude')
  const [dbs, setDbs] = useState<DbNode[]>([])
  const [dbsLoading, setDbsLoading] = useState(false)
  const [dbsError, setDbsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!connection.id) {
      setDbsError('Connection has no ID — save it before managing filters.')
      setLoaded(true)
      return
    }
    setDbsLoading(true)
    setDbsError(null)

    // Pre-select based on current filter mode
    const mode = (connection.filterMode as FilterMode) ?? 'exclude'
    const checkedSet = new Set(
      mode === 'include'
        ? (connection.includedDatabases ?? [])
        : (connection.excludedDatabases ?? [])
    )

    fetch(`/api/connections/${connection.id}/databases`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setDbsError(`Failed to load databases: ${data.error}`)
          setLoaded(true)
          return
        }
        const dbNames: string[] = (data.databases ?? []).map((x: { name: string }) => x.name)
        setDbs(dbNames.map(name => ({
          name,
          checked: checkedSet.has(name) ? 'all' : 'none',
          expanded: false,
          schemas: [],
          schemasLoaded: false,
          loading: false,
        })))
        setLoaded(true)
      })
      .catch(() => setDbsError('Failed to load databases. Check connection credentials.'))
      .finally(() => setDbsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When mode changes, reset all selections
  function handleModeChange(newMode: FilterMode) {
    setFilterMode(newMode)
    setDbs(prev => prev.map(db => ({
      ...db,
      checked: 'none',
      schemas: db.schemas.map(s => ({ ...s, checked: false })),
    })))
  }

  function toggleDb(dbName: string) {
    setDbs(prev => prev.map(db => {
      if (db.name !== dbName) return db
      const next: CheckState = db.checked === 'all' ? 'none' : 'all'
      return {
        ...db,
        checked: next,
        schemas: db.schemas.map(s => ({ ...s, checked: next === 'all' })),
      }
    }))
  }

  async function expandDb(dbName: string) {
    const db = dbs.find(d => d.name === dbName)
    if (!db) return

    if (db.expanded) {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: false } : d))
      return
    }

    if (db.schemasLoaded) {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: true } : d))
      return
    }

    setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: true, loading: true } : d))
    try {
      const res = await fetch(`/api/connections/${connection.id}/schemas?database=${encodeURIComponent(dbName)}`)
      const data = await res.json()
      const schemaNames: string[] = (data.schemas ?? []).map((x: { name: string }) => x.name)

      // Pre-select schemas based on current filter mode
      const checkedSchemaSet = new Set(
        filterMode === 'include'
          ? (connection.includedSchemas ?? [])
              .filter(e => e.database === dbName)
              .map(e => e.schema)
          : (connection.excludedSchemas ?? [])
              .filter(e => e.database === dbName)
              .map(e => e.schema)
      )

      setDbs(prev => prev.map(d => {
        if (d.name !== dbName) return d
        const schemas: SchemaNode[] = schemaNames.map(name => ({
          name,
          checked: d.checked === 'all' || checkedSchemaSet.has(name),
        }))
        const allChecked = schemas.length > 0 && schemas.every(s => s.checked)
        const anyChecked = schemas.some(s => s.checked)
        return {
          ...d,
          loading: false,
          schemasLoaded: true,
          schemas,
          checked: allChecked ? 'all' : anyChecked ? 'partial' : 'none',
        }
      }))
    } catch {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, loading: false, expanded: false } : d))
    }
  }

  function toggleSchema(dbName: string, schemaName: string) {
    setDbs(prev => prev.map(db => {
      if (db.name !== dbName) return db
      const schemas = db.schemas.map(s =>
        s.name === schemaName ? { ...s, checked: !s.checked } : s
      )
      const allChecked = schemas.length > 0 && schemas.every(s => s.checked)
      const anyChecked = schemas.some(s => s.checked)
      return {
        ...db,
        schemas,
        checked: allChecked ? 'all' : anyChecked ? 'partial' : 'none',
      }
    }))
  }

  async function save() {
    setSaving(true)
    const selectedDatabases: string[] = []
    const selectedSchemas: Array<{ database: string; schema: string }> = []

    for (const db of dbs) {
      if (db.checked === 'all') {
        selectedDatabases.push(db.name)
      } else if (db.checked === 'partial') {
        for (const schema of db.schemas) {
          if (schema.checked) {
            selectedSchemas.push({ database: db.name, schema: schema.name })
          }
        }
      }
    }

    const payload: Record<string, unknown> = { filter_mode: filterMode }
    if (filterMode === 'include') {
      payload.included_databases = selectedDatabases.length > 0 ? selectedDatabases : null
      payload.included_schemas   = selectedSchemas.length > 0 ? selectedSchemas : null
      payload.excluded_databases = null
      payload.excluded_schemas   = null
    } else {
      payload.excluded_databases = selectedDatabases.length > 0 ? selectedDatabases : null
      payload.excluded_schemas   = selectedSchemas.length > 0 ? selectedSchemas : null
      payload.included_databases = null
      payload.included_schemas   = null
    }

    try {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved({
        ...connection,
        filterMode,
        ...(filterMode === 'include'
          ? {
              includedDatabases: selectedDatabases.length > 0 ? selectedDatabases : undefined,
              includedSchemas:   selectedSchemas.length > 0   ? selectedSchemas   : undefined,
              excludedDatabases: undefined,
              excludedSchemas:   undefined,
            }
          : {
              excludedDatabases: selectedDatabases.length > 0 ? selectedDatabases : undefined,
              excludedSchemas:   selectedSchemas.length > 0   ? selectedSchemas   : undefined,
              includedDatabases: undefined,
              includedSchemas:   undefined,
            }),
      })
      onClose()
    } catch {
      alert('Failed to save filters. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalSelected = dbs.filter(d => d.checked !== 'none').reduce((sum, db) => {
    if (db.checked === 'all') return sum + 1
    return sum + db.schemas.filter(s => s.checked).length
  }, 0)

  const accentColor = filterMode === 'include' ? '#2563eb' : '#d97706'
  const accentBg    = filterMode === 'include' ? '#dbeafe' : '#fef3c7'
  const accentBorder = filterMode === 'include' ? '#93c5fd' : '#fde68a'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <div style={{ background: '#fff', borderRadius: '16px', width: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Database Filters</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Control which databases and schemas are discovered for <strong>{connection.name}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Mode selector */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em', marginBottom: '8px' }}>FILTER MODE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {(['exclude', 'include'] as FilterMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                style={{
                  padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${filterMode === mode ? accentBorder : '#e2e8f0'}`,
                  background: filterMode === mode ? accentBg : '#fafaf9',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{
                    width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${filterMode === mode ? accentColor : '#cbd5e1'}`,
                    background: filterMode === mode ? accentColor : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {filterMode === mode && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'block' }} />}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: filterMode === mode ? accentColor : '#1a1a1a', textTransform: 'capitalize' }}>
                    {mode === 'exclude' ? 'Exclude selected' : 'Include only selected'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', paddingLeft: '22px' }}>
                  {mode === 'exclude'
                    ? 'Checked items are SKIPPED — everything else is discovered'
                    : 'Only checked items are discovered — everything else is SKIPPED'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '2px' }}>
            {filterMode === 'include' ? 'SELECT DATABASES TO INCLUDE' : 'SELECT DATABASES TO EXCLUDE'}
          </div>
          {dbsLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Loading databases…
            </div>
          )}
          {dbsError && (
            <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>{dbsError}</div>
          )}
          {!dbsLoading && !dbsError && dbs.length === 0 && loaded && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>No databases found</div>
          )}
          {dbs.map(db => (
            <div key={db.name} style={{ marginBottom: '2px' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px',
                  borderRadius: '7px', cursor: 'pointer',
                  background: db.checked !== 'none' ? accentBg : '#fafaf9',
                  border: `1px solid ${db.checked !== 'none' ? accentBorder : '#ebe8df'}`,
                }}
                onClick={() => expandDb(db.name)}
              >
                <input
                  type="checkbox"
                  checked={db.checked === 'all'}
                  ref={(el) => { if (el) el.indeterminate = db.checked === 'partial' }}
                  onChange={e => { e.stopPropagation(); toggleDb(db.name) }}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor, flexShrink: 0 }}
                />
                <span style={{ fontSize: '14px' }}>🗄</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{db.name}</span>
                {db.loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', color: '#94a3b8', fontSize: '12px' }}>⟳</span>}
                {!db.loading && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{db.expanded ? '▲' : '▼'}</span>}
              </div>

              {db.expanded && db.schemasLoaded && (
                <div style={{ paddingLeft: '28px', marginTop: '2px' }}>
                  {db.schemas.length === 0 && (
                    <div style={{ padding: '6px 10px', fontSize: '12px', color: '#94a3b8' }}>No schemas found</div>
                  )}
                  {db.schemas.map(schema => (
                    <div key={schema.name} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px',
                      borderRadius: '6px', marginBottom: '2px',
                      background: schema.checked ? accentBg : '#fff',
                      border: `1px solid ${schema.checked ? accentBorder : '#f1f5f9'}`,
                    }}>
                      <input
                        type="checkbox"
                        checked={schema.checked}
                        onChange={() => toggleSchema(db.name, schema.name)}
                        style={{ accentColor, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '12px' }}>📋</span>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{schema.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #ebe8df', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: '12px', color: '#64748b' }}>
            {totalSelected > 0
              ? (
                <span style={{ color: accentColor, fontWeight: 600 }}>
                  {totalSelected} item{totalSelected !== 1 ? 's' : ''} {filterMode === 'include' ? 'will be discovered' : 'will be excluded'}
                </span>
              )
              : filterMode === 'include'
                ? 'No selection — all databases will be skipped (nothing included)'
                : 'No exclusions set — all databases and schemas will be discovered'}
          </div>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? '#e2e8f0' : accentColor,
              color: saving ? '#94a3b8' : '#fff',
            }}
          >
            {saving ? '⏳ Saving…' : '✓ Save Filters'}
          </button>
        </div>
      </div>
    </div>
  )
}
