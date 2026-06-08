'use client'
import { useState, useEffect } from 'react'
import { Connection } from '@/lib/types'

type CheckState = 'none' | 'partial' | 'all'

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
  const [dbs, setDbs] = useState<DbNode[]>([])
  const [dbsLoading, setDbsLoading] = useState(false)
  const [dbsError, setDbsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!connection.id) {
      setDbsError('Connection has no ID — save it before managing exclusions.')
      setLoaded(true)
      return
    }
    setDbsLoading(true)
    setDbsError(null)
    const excluded = new Set(connection.excludedDatabases ?? [])
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
          checked: excluded.has(name) ? 'all' : 'none',
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
      const excludedSchemas = new Set(
        (connection.excludedSchemas ?? [])
          .filter(e => e.database === dbName)
          .map(e => e.schema)
      )
      setDbs(prev => prev.map(d => {
        if (d.name !== dbName) return d
        const schemas: SchemaNode[] = schemaNames.map(name => ({
          name,
          checked: d.checked === 'all' || excludedSchemas.has(name),
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
    const excludedDatabases: string[] = []
    const excludedSchemas: Array<{ database: string; schema: string }> = []

    for (const db of dbs) {
      if (db.checked === 'all') {
        excludedDatabases.push(db.name)
      } else if (db.checked === 'partial') {
        for (const schema of db.schemas) {
          if (schema.checked) {
            excludedSchemas.push({ database: db.name, schema: schema.name })
          }
        }
      }
    }

    try {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excluded_databases: excludedDatabases.length > 0 ? excludedDatabases : null,
          excluded_schemas: excludedSchemas.length > 0 ? excludedSchemas : null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved({
        ...connection,
        excludedDatabases: excludedDatabases.length > 0 ? excludedDatabases : undefined,
        excludedSchemas: excludedSchemas.length > 0 ? excludedSchemas : undefined,
      })
      onClose()
    } catch {
      alert('Failed to save exclusions. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalExcluded = dbs.filter(d => d.checked !== 'none').reduce((sum, db) => {
    if (db.checked === 'all') return sum + 1
    return sum + db.schemas.filter(s => s.checked).length
  }, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Discovery Exclusions</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Select databases or schemas to skip during data discovery for <strong>{connection.name}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
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
              {/* Database row */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: db.checked !== 'none' ? '#fef3c7' : '#fafaf9', border: '1px solid ' + (db.checked !== 'none' ? '#fde68a' : '#ebe8df'), cursor: 'pointer' }}
                onClick={() => expandDb(db.name)}
              >
                <input
                  type="checkbox"
                  checked={db.checked === 'all'}
                  ref={(el) => { if (el) el.indeterminate = db.checked === 'partial' }}
                  onChange={e => { e.stopPropagation(); toggleDb(db.name) }}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor: '#f59e0b', flexShrink: 0 }}
                />
                <span style={{ fontSize: '14px' }}>🗄</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{db.name}</span>
                {db.loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', color: '#94a3b8', fontSize: '12px' }}>⟳</span>}
                {!db.loading && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{db.expanded ? '▲' : '▼'}</span>}
              </div>

              {/* Schema rows */}
              {db.expanded && db.schemasLoaded && (
                <div style={{ paddingLeft: '28px', marginTop: '2px' }}>
                  {db.schemas.length === 0 && (
                    <div style={{ padding: '6px 10px', fontSize: '12px', color: '#94a3b8' }}>No schemas found</div>
                  )}
                  {db.schemas.map(schema => (
                    <div key={schema.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderRadius: '6px', background: schema.checked ? '#fef9c3' : '#fff', border: '1px solid ' + (schema.checked ? '#fde68a' : '#f1f5f9'), marginBottom: '2px' }}>
                      <input
                        type="checkbox"
                        checked={schema.checked}
                        onChange={() => toggleSchema(db.name, schema.name)}
                        style={{ accentColor: '#f59e0b', flexShrink: 0 }}
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
            {totalExcluded > 0
              ? <span style={{ color: '#d97706', fontWeight: 600 }}>{totalExcluded} item{totalExcluded !== 1 ? 's' : ''} will be excluded</span>
              : 'No exclusions set — all databases and schemas will be discovered'}
          </div>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: saving ? '#e2e8f0' : '#2563eb', color: saving ? '#94a3b8' : '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳ Saving…' : '✓ Save Exclusions'}
          </button>
        </div>
      </div>
    </div>
  )
}
