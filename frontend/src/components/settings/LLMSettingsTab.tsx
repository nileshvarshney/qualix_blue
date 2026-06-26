'use client'
import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const MASKED = '***MASKED***'

const PROVIDERS = [
  {
    id: 'claude',
    label: 'Anthropic (Claude)',
    dot: '#7c3aed',
    keyField: 'anthropic_api_key',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-ant-…',
    modelField: 'claude_model',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-sonnet-latest', 'claude-3-haiku-20240307'],
    requiresKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    dot: '#16a34a',
    keyField: 'openai_api_key',
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-proj-…',
    modelField: 'openai_model',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
    requiresKey: true,
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    dot: '#2563eb',
    keyField: 'gemini_api_key',
    keyLabel: 'API Key',
    keyPlaceholder: 'AIza…',
    modelField: 'gemini_model',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    dot: '#d97706',
    keyField: 'ollama_base_url',
    keyLabel: 'Base URL',
    keyPlaceholder: 'http://localhost:11434',
    modelField: 'ollama_model',
    models: [],
    requiresKey: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    dot: '#0891b2',
    keyField: 'groq_api_key',
    keyLabel: 'API Key',
    keyPlaceholder: 'gsk_…',
    modelField: 'groq_model',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    requiresKey: true,
  },
] as const

type ProviderId = (typeof PROVIDERS)[number]['id']

export default function LLMSettingsTab() {
  const [activeProvider, setActiveProvider] = useState<ProviderId>('ollama')
  const [fields, setFields]         = useState<Record<string, string>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dirty, setDirty]           = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [testStatus, setTestStatus] = useState<{ status: 'ok' | 'error'; message: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const skipBlurRef = useRef(false)

  useEffect(() => {
    apiFetch('/api/config?category=llm')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => {
        const rows: { key: string; value: string }[] = data.config?.llm ?? []
        const map: Record<string, string> = {}
        for (const row of rows) map[row.key] = row.value ?? ''
        setFields(map)
        const p = map['llm_provider'] as ProviderId
        if (p && PROVIDERS.find(x => x.id === p)) setActiveProvider(p)
      })
      .catch(e => setLoadError(String(e)))
  }, [])

  function fieldValue(key: string): string {
    return editValues[key] !== undefined ? editValues[key] : (fields[key] ?? '')
  }

  function startEdit(keyField: string) {
    const cur = fields[keyField] ?? ''
    setEditValues(prev => ({ ...prev, [keyField]: cur === MASKED ? '' : cur }))
    setEditingKey(keyField)
  }

  function commitEdit(keyField: string, val: string) {
    setEditValues(prev => ({ ...prev, [keyField]: val }))
    setEditingKey(null)
    setDirty(true)
  }

  function selectProvider(id: ProviderId) {
    if (id !== activeProvider) { setActiveProvider(id); setDirty(true) }
  }

  async function save() {
    setSaving(true); setSaveMsg(null)
    const updates: Record<string, string> = { llm_provider: activeProvider }
    for (const [k, v] of Object.entries(editValues)) {
      if (v !== MASKED && v !== '') updates[k] = v
    }
    for (const p of PROVIDERS) {
      const mv = editValues[p.modelField] !== undefined
        ? editValues[p.modelField]
        : (fields[p.modelField] ?? '')
      if (mv && mv !== MASKED) updates[p.modelField] = mv
    }
    try {
      const res = await apiFetch('/api/config/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDirty(false); setEditValues({})
      try {
        const data = await apiFetch('/api/config?category=llm').then(r => r.json())
        const rows: { key: string; value: string }[] = data.config?.llm ?? []
        const map: Record<string, string> = {}
        for (const row of rows) map[row.key] = row.value ?? ''
        setFields(map)
      } catch {
        // Save succeeded; re-fetch failed. Fields may be slightly stale until next load.
      }
      setSaveMsg({ ok: true, text: 'Saved ✓' })
      setTimeout(() => setSaveMsg(null), 2500)
    } catch (e) {
      setSaveMsg({ ok: false, text: String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTestLoading(true); setTestStatus(null)
    try {
      const res = await apiFetch('/api/config/test', { method: 'POST' })
      const data = await res.json()
      setTestStatus({ status: data.status, message: data.message })
    } catch (e) {
      setTestStatus({ status: 'error', message: String(e) })
    } finally {
      setTestLoading(false)
    }
  }

  if (loadError) {
    return (
      <div style={{ padding: '14px 16px', color: 'var(--status-error-text)', fontSize: '12px', background: 'var(--status-error-bg)', borderRadius: '8px' }}>
        Failed to load LLM config: {loadError}
      </div>
    )
  }

  const COL = { radio: 28, provider: 185, model: 210, status: 96 }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '7px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        <div style={{ width: COL.radio }} />
        <div style={{ width: COL.provider, ...hdr }}>Provider</div>
        <div style={{ width: COL.model, ...hdr }}>Model</div>
        <div style={{ flex: 1, ...hdr }}>API Key / URL</div>
        <div style={{ width: COL.status, ...hdr, textAlign: 'right' as const }}>Status</div>
      </div>

      {/* Provider rows */}
      {PROVIDERS.map((p, i) => {
        const isActive   = activeProvider === p.id
        const curKeyVal  = fieldValue(p.keyField)
        const configured = curKeyVal !== '' && curKeyVal !== MASKED
        const maskedDisplay = curKeyVal === MASKED
        const isCurKeyEditing = editingKey === p.keyField
        const curModel   = fieldValue(p.modelField)

        return (
          <div
            key={p.id}
            onClick={() => selectProvider(p.id)}
            style={{
              display: 'flex', alignItems: 'center', padding: '7px 16px',
              borderBottom: i < PROVIDERS.length - 1 ? '1px solid var(--border)' : 'none',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              background: isActive ? 'rgba(99,102,241,0.04)' : 'transparent',
              cursor: 'pointer', transition: 'background 0.1s',
              minHeight: 38,
            }}
          >
            {/* Radio indicator */}
            <div style={{ width: COL.radio, display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: isActive ? '4px solid var(--accent)' : '2px solid var(--border)',
                background: isActive ? 'var(--accent)' : 'transparent',
              }} />
            </div>

            {/* Provider name */}
            <div style={{ width: COL.provider, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.dot, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '12.5px', fontWeight: isActive ? 600 : 400, color: 'var(--foreground)' }}>{p.label}</span>
            </div>

            {/* Model selector */}
            <div style={{ width: COL.model }} onClick={e => e.stopPropagation()}>
              {p.models.length > 0 ? (
                <select
                  value={curModel}
                  onChange={e => { setEditValues(prev => ({ ...prev, [p.modelField]: e.target.value })); setDirty(true) }}
                  style={sel}
                >
                  {!curModel && <option value="">Loading…</option>}
                  {p.models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={curModel}
                  onChange={e => { setEditValues(prev => ({ ...prev, [p.modelField]: e.target.value })); setDirty(true) }}
                  placeholder="model name"
                  style={{ ...sel, boxSizing: 'border-box' as const }}
                />
              )}
            </div>

            {/* API Key / URL */}
            <div style={{ flex: 1, padding: '0 12px' }} onClick={e => e.stopPropagation()}>
              {isCurKeyEditing ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type={p.requiresKey ? 'password' : 'text'}
                    autoFocus
                    defaultValue={editValues[p.keyField] ?? ''}
                    placeholder={p.keyPlaceholder}
                    onBlur={e => {
                      if (skipBlurRef.current) { skipBlurRef.current = false; return }
                      commitEdit(p.keyField, e.target.value)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        skipBlurRef.current = true
                        commitEdit(p.keyField, (e.target as HTMLInputElement).value)
                      }
                      if (e.key === 'Escape') {
                        skipBlurRef.current = true
                        setEditingKey(null)
                      }
                    }}
                    style={{ flex: 1, fontSize: '12px', padding: '4px 8px', border: '1px solid var(--accent)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
                  />
                  <button
                    onMouseDown={e => { e.preventDefault(); skipBlurRef.current = true }}
                    onClick={() => setEditingKey(null)}
                    style={iconBtn}
                  >✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '12px', color: (configured || maskedDisplay) ? 'var(--foreground)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {maskedDisplay
                      ? `${p.keyPlaceholder.slice(0, 6)}••••••••`
                      : configured
                        ? curKeyVal
                        : 'Not configured'}
                  </span>
                  <button onClick={() => startEdit(p.keyField)} style={iconBtn} title={`Edit ${p.keyLabel}`}>✎</button>
                </div>
              )}
            </div>

            {/* Status */}
            <div style={{ width: COL.status, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: (configured || maskedDisplay) ? '#16a34a' : '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {(configured || maskedDisplay) ? 'configured' : 'not set'}
              </span>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {testStatus && (
          <span style={{ fontSize: '11.5px', color: testStatus.status === 'ok' ? '#16a34a' : 'var(--status-error-text)', maxWidth: 360, textAlign: 'right' as const }}>
            {testStatus.status === 'ok' ? '✓' : '✗'} {testStatus.message}
          </span>
        )}
        {saveMsg && (
          <span style={{ fontSize: '12px', color: saveMsg.ok ? '#16a34a' : 'var(--status-error-text)' }}>
            {saveMsg.text}
          </span>
        )}
        <button
          onClick={testConnection}
          disabled={testLoading || dirty}
          title={dirty ? 'Save changes first, then test' : 'Test the saved LLM connection'}
          style={{ fontSize: '12px', padding: '6px 14px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--surface)', color: dirty ? 'var(--text-muted)' : 'var(--foreground)', cursor: (testLoading || dirty) ? 'not-allowed' : 'pointer', opacity: (testLoading || dirty) ? 0.5 : 1 }}
        >
          {testLoading ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: dirty ? 'var(--accent)' : 'var(--surface-muted)', color: dirty ? '#fff' : 'var(--text-muted)', cursor: (!dirty || saving) ? 'not-allowed' : 'pointer', fontWeight: 500 }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ── shared micro-styles ──────────────────────────────────────────────────────
const hdr: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const sel: React.CSSProperties = {
  width: '100%', fontSize: '12px', padding: '4px 6px',
  border: '1px solid var(--border)', borderRadius: '6px',
  background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none',
}
const iconBtn: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', background: 'none',
  border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: '3px',
  lineHeight: 1,
}
