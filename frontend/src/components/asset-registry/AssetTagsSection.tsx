'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

type AppliedTag = { id: string; tag_id: string; tag_name: string | null; color: string | null }
type CatalogTag = { tag_id: string; tag_name: string; color: string }

interface Props {
  assetId: string
  editing: boolean
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }
const inputStyle = { fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' as const }

function Chip({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: color, color: '#fff', padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '11px', opacity: 0.85 }}>
          ×
        </button>
      )}
    </span>
  )
}

export default function AssetTagsSection({ assetId, editing }: Props) {
  const [tags, setTags] = useState<AppliedTag[]>([])
  const [catalog, setCatalog] = useState<CatalogTag[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch(`/api/asset-registry/${assetId}/tags`)
      .then(res => (res.ok ? res.json() : []))
      .then(setTags)
      .catch(() => setError('Failed to load tags'))
  }, [assetId])

  useEffect(() => {
    if (!editing || catalogLoaded) return
    apiFetch('/api/tags')
      .then(res => (res.ok ? res.json() : []))
      .then(data => { setCatalog(data); setCatalogLoaded(true) })
      .catch(() => setError('Failed to load tag catalog'))
  }, [editing, catalogLoaded])

  async function addTag() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: [selected] }),
      })
      if (!res.ok) { setError('Failed to add tag'); return }
      const added = catalog.find(t => t.tag_id === selected)
      if (added) setTags(t => [...t, { id: added.tag_id, tag_id: added.tag_id, tag_name: added.tag_name, color: added.color }])
      setSelected('')
    } finally {
      setBusy(false)
    }
  }

  async function removeTag(tagId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/tags/${tagId}`, { method: 'DELETE' })
      if (!res.ok) { setError('Failed to remove tag'); return }
      setTags(t => t.filter(x => x.tag_id !== tagId))
    } finally {
      setBusy(false)
    }
  }

  const appliedIds = new Set(tags.map(t => t.tag_id))
  const available = catalog.filter(t => !appliedIds.has(t.tag_id))

  return (
    <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ ...labelStyle, marginBottom: '4px' }}>Tags</div>
      {error && <div style={{ fontSize: '10px', color: 'var(--status-error-text)', marginBottom: '4px' }}>{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {tags.length === 0 && !editing && <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>—</span>}
        {tags.map(t => (
          <Chip key={t.tag_id} label={t.tag_name ?? t.tag_id} color={t.color ?? '#6366f1'} onRemove={editing ? () => removeTag(t.tag_id) : undefined} />
        ))}
      </div>
      {editing && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <select style={{ ...inputStyle, flex: 1 }} value={selected} onChange={e => setSelected(e.target.value)} disabled={busy}>
            <option value="">— Select tag to add —</option>
            {available.map(t => <option key={t.tag_id} value={t.tag_id}>{t.tag_name}</option>)}
          </select>
          <button onClick={addTag} disabled={busy || !selected} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: busy || !selected ? 'not-allowed' : 'pointer' }}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
