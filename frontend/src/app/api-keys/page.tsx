'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; created: string; lastUsed: string; status: string; visible: boolean }[]>([])
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScope, setNewKeyScope] = useState('read')
  const [newKeyExpiry, setNewKeyExpiry] = useState('never')
  const [justCreated, setJustCreated] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      const k = localStorage.getItem('dg_settings_apikeys')
      if (k) setApiKeys(JSON.parse(k))
    } catch { }
  }, [])

  useEffect(() => {
    if (apiKeys.length > 0 || localStorage.getItem('dg_settings_apikeys')) {
      localStorage.setItem('dg_settings_apikeys', JSON.stringify(apiKeys))
    }
  }, [apiKeys])

  function generateKey(prefix = 'dg_live_') {
    const chars = 'abcdef0123456789'
    return prefix + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  function createKey() {
    if (!newKeyName.trim()) return
    const key = generateKey()
    const today = new Date().toISOString().split('T')[0]
    setApiKeys(prev => [...prev, { id: `k${Date.now()}`, name: newKeyName, key, created: today, lastUsed: 'Never', status: 'active', visible: true }])
    setJustCreated({ name: newKeyName, key })
    setShowKeyModal(false)
    setNewKeyName('')
  }

  function revokeKey(id: string) {
    if (!confirm('Revoke this API key? It cannot be undone.')) return
    setApiKeys(prev => prev.filter(k => k.id !== id))
  }

  function toggleVisible(id: string) {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, visible: !k.visible } : k))
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    fontSize: '13px', color: 'var(--foreground)', background: 'var(--surface-muted)', boxSizing: 'border-box' as const, outline: 'none', ...extra,
  })

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>API Keys</h1>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>API Keys</div>
          <button onClick={() => { setShowKeyModal(true); setJustCreated(null) }} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--status-info-text)', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Generate Key</button>
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Use API keys to authenticate Qualix from CI/CD pipelines, dashboards, or external tools.</div>

        {justCreated && (
          <div style={{ background: 'var(--status-ok-bg)', border: '1px solid #86efac', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--status-ok-text)', marginBottom: '6px' }}>✅ Key created — copy it now, it won&apos;t be shown again</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '12px', color: 'var(--status-ok-text)', background: 'var(--status-ok-bg)', padding: '6px 10px', borderRadius: '6px', wordBreak: 'break-all' }}>{justCreated.key}</code>
              <button onClick={() => copyKey(justCreated.key)} style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #86efac', background: 'var(--surface)', color: 'var(--status-ok-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{copied ? '✓ Copied!' : 'Copy'}</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {apiKeys.map(k => (
            <div key={k.id} style={{ background: 'var(--surface-muted)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--foreground)', marginBottom: '6px' }}>{k.name}</div>
                  <code style={{ fontSize: '11.5px', color: 'var(--text-secondary)', background: 'var(--surface-muted)', padding: '3px 8px', borderRadius: '5px', wordBreak: 'break-all' }}>
                    {k.visible ? k.key : k.key.slice(0, 12) + '••••••••••••••••••••'}
                  </code>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => toggleVisible(k.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11.5px', cursor: 'pointer' }}>{k.visible ? '🙈 Hide' : '👁 Show'}</button>
                  <button onClick={() => copyKey(k.key)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11.5px', cursor: 'pointer' }}>📋 Copy</button>
                  <button onClick={() => revokeKey(k.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--status-error-bg)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '11.5px', cursor: 'pointer' }}>Revoke</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                <span>Created: {k.created}</span><span>Last used: {k.lastUsed}</span><span style={{ color: 'var(--status-ok-text)' }}>● {k.status}</span>
              </div>
            </div>
          ))}
        </div>

        {showKeyModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: 'var(--surface)', borderRadius: '14px', width: '420px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Generate API Key</div>
                <button onClick={() => setShowKeyModal(false)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Key Name *</label>
                  <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. CI/CD Pipeline" style={inp()} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Scope</label>
                  <select value={newKeyScope} onChange={e => setNewKeyScope(e.target.value)} style={inp()}>
                    <option value="read">Read only</option><option value="write">Read + Write</option><option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Expiry</label>
                  <select value={newKeyExpiry} onChange={e => setNewKeyExpiry(e.target.value)} style={inp()}>
                    <option value="never">Never expires</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
                  </select>
                </div>
                <div style={{ background: 'var(--status-warn-bg)', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', color: 'var(--status-warn-text)' }}>
                  ⚠️ The key will only be shown once after creation. Copy it immediately.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setShowKeyModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={createKey} disabled={!newKeyName.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: newKeyName.trim() ? 'pointer' : 'not-allowed', background: newKeyName.trim() ? '#2563eb' : 'var(--border)', color: newKeyName.trim() ? '#fff' : 'var(--text-muted)' }}>
                    🔑 Generate Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
