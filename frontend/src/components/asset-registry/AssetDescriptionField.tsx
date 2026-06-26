'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Props {
  assetId: string
  description: string | null
  inheritedFrom: string | null
  onSave: (desc: string) => void
}

export default function AssetDescriptionField({ assetId, description, inheritedFrom, onSave }: Props) {
  const [value, setValue] = useState(description ?? '')
  const [generating, setGenerating] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}/generate-description`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setValue(data.description ?? '')
        setDirty(true)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    await apiFetch(`/api/asset-registry/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: value }),
    })
    onSave(value)
    setDirty(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          Description
        </span>
        <button
          onClick={generate}
          disabled={generating}
          style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}
        >
          {generating ? '...' : 'Generate'}
        </button>
        {dirty && (
          <button
            onClick={save}
            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            Save
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setDirty(true) }}
        rows={3}
        placeholder={inheritedFrom ? `Inherited from ${inheritedFrom}` : 'Add a business description...'}
        style={{
          width: '100%', resize: 'vertical', padding: '6px 8px',
          border: '1px solid var(--border)', borderRadius: '6px',
          background: 'var(--surface)', color: 'var(--foreground)',
          fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {!description && inheritedFrom && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          inherited from {inheritedFrom}
        </span>
      )}
    </div>
  )
}
