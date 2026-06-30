'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

type Doc = { doc_id: string; title: string; url: string }

interface Props {
  assetId: string
  editing: boolean
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }
const inputStyle = { fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' as const }

export default function AssetDocumentsSection({ assetId, editing }: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch(`/api/asset-registry/${assetId}/documents`)
      .then(res => (res.ok ? res.json() : []))
      .then(setDocs)
      .catch(() => setError('Failed to load documentation links'))
  }, [assetId])

  async function addDoc() {
    if (!title.trim() || !url.trim().startsWith('http')) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), url: url.trim() }),
      })
      if (!res.ok) { setError('Failed to add link'); return }
      const created: Doc = await res.json()
      setDocs(d => [...d, created])
      setTitle('')
      setUrl('')
    } finally {
      setBusy(false)
    }
  }

  async function removeDoc(docId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) { setError('Failed to remove link'); return }
      setDocs(d => d.filter(x => x.doc_id !== docId))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ ...labelStyle, marginBottom: '4px' }}>Documentation Links</div>
      {error && <div style={{ fontSize: '10px', color: 'var(--status-error-text)', marginBottom: '4px' }}>{error}</div>}
      {docs.length === 0 && !editing && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>—</div>}
      {docs.map(d => (
        <div key={d.doc_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
          <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11.5px', color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🔗 {d.title}
          </a>
          {editing && (
            <button onClick={() => removeDoc(d.doc_id)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>
              ×
            </button>
          )}
        </div>
      ))}
      {editing && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input type="text" style={{ ...inputStyle, flex: 1 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" disabled={busy} />
          <input type="text" style={{ ...inputStyle, flex: 2 }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" disabled={busy} />
          <button onClick={addDoc} disabled={busy || !title.trim() || !url.trim().startsWith('http')} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
