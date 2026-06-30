'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

type Owner = { owner_id: string; name: string; email?: string | null; owner_type: string }

interface Props {
  assetId: string
  ownerType: 'owner' | 'technical_owner'
  label: string
  editing: boolean
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }
const inputStyle = { fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' as const }

export default function AssetOwnersSection({ assetId, ownerType, label, editing }: Props) {
  const [owners, setOwners] = useState<Owner[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiFetch(`/api/asset-registry/${assetId}/owners?owner_type=${ownerType}`)
      .then(res => (res.ok ? res.json() : []))
      .then(setOwners)
      .catch(() => setError('Failed to load owners'))
  }, [assetId, ownerType])

  async function addOwner() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_type: ownerType, name: name.trim(), email: email.trim() || null }),
      })
      if (!res.ok) { setError('Failed to add owner'); return }
      const created: Owner = await res.json()
      setOwners(o => [...o, created])
      setName('')
      setEmail('')
    } finally {
      setBusy(false)
    }
  }

  async function removeOwner(ownerId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/owners/${ownerId}`, { method: 'DELETE' })
      if (!res.ok) { setError('Failed to remove owner'); return }
      setOwners(o => o.filter(x => x.owner_id !== ownerId))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ margin: '6px 14px 0' }}>
      <div style={{ ...labelStyle, marginBottom: '4px' }}>{label}</div>
      {error && <div style={{ fontSize: '10px', color: 'var(--status-error-text)', marginBottom: '4px' }}>{error}</div>}
      {owners.length === 0 && !editing && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>—</div>}
      {owners.map(o => (
        <div key={o.owner_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--foreground)', flex: 1 }}>
            {o.name}{o.email ? ` <${o.email}>` : ''}
          </span>
          {editing && (
            <button onClick={() => removeOwner(o.owner_id)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>
              ×
            </button>
          )}
        </div>
      ))}
      {editing && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          <input type="text" style={{ ...inputStyle, flex: 1 }} value={name} onChange={e => setName(e.target.value)} placeholder="Name" disabled={busy} />
          <input type="text" style={{ ...inputStyle, flex: 1 }} value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" disabled={busy} />
          <button onClick={addOwner} disabled={busy || !name.trim()} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
