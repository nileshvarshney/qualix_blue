# LLM Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact "LLM / AI" tab to the Settings page that lets users pick one of five LLM providers (Anthropic, OpenAI, Gemini, Ollama, Groq), configure its credentials and model, and save — the system uses the active provider for all LLM calls.

**Architecture:** No new backend endpoints needed for existing providers. We add a thin Groq provider to the backend (OpenAI-compatible, minimal code). Two new Next.js route handlers proxy `GET /config?category=llm`, `POST /config/bulk-update`, and `POST /config/test/llm` to the FastAPI backend. A single new React component `LLMSettingsTab` renders the provider table, model dropdowns, inline key editing, and footer controls.

**Tech Stack:** FastAPI (Python), Next.js 15 (TypeScript, `'use client'` component), inline React styles matching the existing settings page conventions, `openai` Python SDK (reused for Groq via custom `base_url`).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `app/core/config.py` | Add `groq_api_key`, `groq_model` settings fields |
| Modify | `app/services/config_service.py` | Add 2 Groq entries to `CONFIG_DEFAULTS` |
| Modify | `app/services/llm_providers.py` | Add `GroqProvider` class + `groq` case in factory |
| Modify | `app/api/config.py` | Add `groq` branch to `test_llm` endpoint |
| Create | `frontend/src/app/api/config/route.ts` | Proxy `GET /config?category=…` to backend |
| Create | `frontend/src/app/api/config/bulk-update/route.ts` | Proxy `POST /config/bulk-update` to backend |
| Create | `frontend/src/app/api/config/test/route.ts` | Proxy `POST /config/test/llm` to backend |
| Create | `frontend/src/components/settings/LLMSettingsTab.tsx` | All tab UI and state logic |
| Modify | `frontend/src/app/settings/page.tsx` | Register `llm` tab and render `<LLMSettingsTab />` |
| Create | `tests/test_llm_providers.py` | Backend unit tests for Groq additions |

---

## Task 1: Add Groq fields to backend config

**Files:**
- Modify: `app/core/config.py`
- Modify: `app/services/config_service.py`
- Test: `tests/test_llm_providers.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_llm_providers.py`:

```python
"""Tests for LLM provider config additions."""
from app.core.config import settings


def test_settings_has_groq_api_key():
    assert hasattr(settings, "groq_api_key")
    assert isinstance(settings.groq_api_key, str)


def test_settings_has_groq_model():
    assert hasattr(settings, "groq_model")
    assert settings.groq_model == "llama-3.3-70b-versatile"


def test_groq_config_defaults_present():
    from app.services.config_service import CONFIG_DEFAULTS
    keys = {d["key"] for d in CONFIG_DEFAULTS}
    assert "groq_api_key" in keys
    assert "groq_model" in keys
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /path/to/DataGuard
pytest tests/test_llm_providers.py -v
```

Expected: 3 FAILs — `AttributeError: 'Settings' object has no attribute 'groq_api_key'`

- [ ] **Step 3: Add Groq fields to `app/core/config.py`**

In `app/core/config.py`, locate the LLM block (around line 33) and add two lines after `gemini_model`:

```python
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
```

- [ ] **Step 4: Add Groq entries to `app/services/config_service.py`**

In `config_service.py`, find the LLM section of `CONFIG_DEFAULTS` (the block starting with `# LLM`). Add two entries after the `gemini_model` entry:

```python
    {"category": "llm", "key": "groq_api_key", "value": "", "is_secret": True,  "description": "Groq API key (starts with gsk_)"},
    {"category": "llm", "key": "groq_model",   "value": "llama-3.3-70b-versatile", "is_secret": False, "description": "Groq model name (e.g. llama-3.3-70b-versatile)"},
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pytest tests/test_llm_providers.py -v
```

Expected: 3 PASSes

- [ ] **Step 6: Commit**

```bash
git add app/core/config.py app/services/config_service.py tests/test_llm_providers.py
git commit -m "feat: add Groq API key and model to backend config"
```

---

## Task 2: Add GroqProvider class

**Files:**
- Modify: `app/services/llm_providers.py`
- Test: `tests/test_llm_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_llm_providers.py`:

```python
def test_groq_provider_exists():
    from app.services.llm_providers import GroqProvider
    p = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
    assert p.api_key == "gsk_test"
    assert p.model == "llama-3.3-70b-versatile"


def test_get_provider_groq_returns_groq_provider():
    from app.services.llm_providers import get_provider, GroqProvider
    import os
    os.environ["GROQ_API_KEY"] = "gsk_test"
    p = get_provider("groq")
    assert isinstance(p, GroqProvider)
```

- [ ] **Step 2: Run to confirm failure**

```bash
pytest tests/test_llm_providers.py::test_groq_provider_exists tests/test_llm_providers.py::test_get_provider_groq_returns_groq_provider -v
```

Expected: 2 FAILs — `ImportError: cannot import name 'GroqProvider'`

- [ ] **Step 3: Add `GroqProvider` to `app/services/llm_providers.py`**

After the `GeminiProvider` class and before the `# ── DB-aware factory ──` comment, add:

```python
class GroqProvider(LLMProvider):
    """Groq Cloud — OpenAI-compatible API at https://api.groq.com/openai/v1."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        if api_key:
            from openai import AsyncOpenAI
            self._client: "Optional[AsyncOpenAI]" = AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
            )
        else:
            self._client = None

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key or self._client is None:
            raise RuntimeError("Groq API key is not configured. Add it in Settings → LLM / AI.")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
            )
            tok = resp.usage
            if tok:
                logger.debug(
                    "Groq usage: prompt=%d completion=%d total=%d",
                    tok.prompt_tokens, tok.completion_tokens, tok.total_tokens,
                )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"Groq error: {e}")
            raise RuntimeError(f"Groq: {e}")
```

- [ ] **Step 4: Add `groq` case to `get_provider_from_db`**

In `get_provider_from_db`, after the `gemini_flash`/`gemini` block and before the unknown-provider fallback, add:

```python
    if provider_name == "groq":
        return GroqProvider(
            api_key=await cfg("groq_api_key", settings.groq_api_key),
            model=await cfg("groq_model", settings.groq_model or "llama-3.3-70b-versatile"),
        )
```

- [ ] **Step 5: Add `groq` case to `get_provider` (sync factory)**

In `get_provider`, after the `gemini_flash`/`gemini` block and before the `return OllamaProvider(...)` fallback:

```python
    if provider_name == "groq":
        return GroqProvider(settings.groq_api_key, settings.groq_model or "llama-3.3-70b-versatile")
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_llm_providers.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/services/llm_providers.py tests/test_llm_providers.py
git commit -m "feat: add GroqProvider (OpenAI-compatible via api.groq.com)"
```

---

## Task 3: Add Groq to test_llm endpoint

**Files:**
- Modify: `app/api/config.py`
- Test: `tests/test_llm_providers.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_llm_providers.py`:

```python
def test_groq_in_valid_provider_names():
    """test_llm endpoint must handle 'groq' as a valid provider name."""
    import ast, inspect
    from app.api import config as config_module
    src = inspect.getsource(config_module.test_llm)
    # The function source must contain a branch for 'groq'
    assert "groq" in src, "test_llm endpoint missing 'groq' branch"
```

- [ ] **Step 2: Run to confirm failure**

```bash
pytest tests/test_llm_providers.py::test_groq_in_valid_provider_names -v
```

Expected: FAIL — `AssertionError: test_llm endpoint missing 'groq' branch`

- [ ] **Step 3: Add Groq branch to `test_llm` in `app/api/config.py`**

Inside the `test_llm` async function, find the final `else:` block that returns an "Unknown provider" error. Insert the Groq branch **before** that `else:`:

```python
        elif provider_name == "groq":
            groq_key = await config_service.get_value("groq_api_key", db)
            groq_model_name = await config_service.get_value("groq_model", db)
            if not groq_key:
                return {"status": "error", "message": "Groq API key is not configured"}
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
            )
            resp = await client.chat.completions.create(
                model=groq_model_name or "llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                max_tokens=5,
            )
            return {"status": "ok", "message": f"Groq connection successful (model: {resp.model})"}
```

- [ ] **Step 4: Run all LLM tests**

```bash
pytest tests/test_llm_providers.py -v
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/config.py tests/test_llm_providers.py
git commit -m "feat: add Groq branch to test_llm endpoint"
```

---

## Task 4: Create Next.js API route handlers for config

**Files:**
- Create: `frontend/src/app/api/config/route.ts`
- Create: `frontend/src/app/api/config/bulk-update/route.ts`
- Create: `frontend/src/app/api/config/test/route.ts`

No automated tests — these are thin proxies; verify manually in Task 6.

- [ ] **Step 1: Create `frontend/src/app/api/config/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const url = category
    ? `${BACKEND}/config?category=${encodeURIComponent(category)}`
    : `${BACKEND}/config`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ config: {}, categories: [] }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ config: {}, categories: [] }, { status: 502 })
  }
}
```

- [ ] **Step 2: Create `frontend/src/app/api/config/bulk-update/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/config/bulk-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
```

- [ ] **Step 3: Create `frontend/src/app/api/config/test/route.ts`**

```ts
import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST() {
  try {
    const res = await fetch(`${BACKEND}/config/test/llm`, {
      method: 'POST',
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'error', message: 'Backend unreachable' })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/config/
git commit -m "feat: add Next.js proxy routes for config GET, bulk-update, and test"
```

---

## Task 5: Create LLMSettingsTab component

**Files:**
- Create: `frontend/src/components/settings/LLMSettingsTab.tsx`

- [ ] **Step 1: Create `frontend/src/components/settings/LLMSettingsTab.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'

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
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-3-5-sonnet-latest', 'claude-3-haiku-20240307'],
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

  useEffect(() => {
    fetch('/api/config?category=llm')
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

  function isConfigured(keyField: string): boolean {
    const v = fieldValue(keyField)
    return v !== '' && v !== MASKED
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
      const res = await fetch('/api/config/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDirty(false); setEditValues({})
      const data = await fetch('/api/config?category=llm').then(r => r.json())
      const rows: { key: string; value: string }[] = data.config?.llm ?? []
      const map: Record<string, string> = {}
      for (const row of rows) map[row.key] = row.value ?? ''
      setFields(map)
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
      const res = await fetch('/api/config/test', { method: 'POST' })
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
      <div style={{ display: 'flex', alignItems: 'center', padding: '7px 16px', borderBottom: '1px solid var(--border)', background: '#fafaf9' }}>
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
                border: isActive ? '4px solid var(--accent)' : '2px solid #cbd5e1',
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
                    onBlur={e => commitEdit(p.keyField, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  commitEdit(p.keyField, (e.target as HTMLInputElement).value)
                      if (e.key === 'Escape') setEditingKey(null)
                    }}
                    style={{ flex: 1, fontSize: '12px', padding: '4px 8px', border: '1px solid var(--accent)', borderRadius: '6px', background: '#fff', outline: 'none' }}
                  />
                  <button onClick={() => setEditingKey(null)} style={iconBtn}>✕</button>
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
          style={{ fontSize: '12px', padding: '6px 14px', border: '1px solid var(--border)', borderRadius: '7px', background: '#fff', color: dirty ? 'var(--text-muted)' : 'var(--foreground)', cursor: (testLoading || dirty) ? 'not-allowed' : 'pointer', opacity: (testLoading || dirty) ? 0.5 : 1 }}
        >
          {testLoading ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: dirty ? 'var(--accent)' : '#e2e8f0', color: dirty ? '#fff' : 'var(--text-muted)', cursor: (!dirty || saving) ? 'not-allowed' : 'pointer', fontWeight: 500 }}
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
  border: '1px solid #e2e8f0', borderRadius: '6px',
  background: '#fafaf9', color: 'var(--foreground)', outline: 'none',
}
const iconBtn: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', background: 'none',
  border: 'none', cursor: 'pointer', padding: '1px 4px', borderRadius: '3px',
  lineHeight: 1,
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/settings/LLMSettingsTab.tsx
git commit -m "feat: add LLMSettingsTab component with provider table, model dropdowns, inline key editing"
```

---

## Task 6: Wire LLMSettingsTab into settings/page.tsx

**Files:**
- Modify: `frontend/src/app/settings/page.tsx`

- [ ] **Step 1: Add the import at the top of `settings/page.tsx`**

After the existing import on line 3 (`import ConnectionsClient from ...`), add:

```tsx
import LLMSettingsTab from '@/components/settings/LLMSettingsTab'
```

- [ ] **Step 2: Add `'llm'` to the tab union type (line 6)**

Change:
```tsx
const [tab, setTab] = useState<'profile' | 'connections' | 'security' | 'notifications' | 'api' | 'integrations' | 'workspace' | 'roadmap'>('profile')
```

To:
```tsx
const [tab, setTab] = useState<'profile' | 'connections' | 'security' | 'notifications' | 'api' | 'integrations' | 'llm' | 'workspace' | 'roadmap'>('profile')
```

- [ ] **Step 3: Add `llm` tab entry to the `tabs` array (around line 85)**

In the `tabs` array, add after the `integrations` entry and before `workspace`:

```tsx
    { id: 'llm', label: 'LLM / AI', icon: '🤖' },
```

- [ ] **Step 4: Add the tab panel render (find the integrations tab render block, ~line 418)**

After the `{tab === 'integrations' && (...)}` block and before `{tab === 'workspace' && (...)}`, add:

```tsx
          {tab === 'llm' && (
            <LLMSettingsTab />
          )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start the dev server and manually verify the tab**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/settings` in a browser.

Manual checklist:
- [ ] "LLM / AI 🤖" tab appears in the tab bar between Integrations and Workspace
- [ ] Clicking the tab shows the provider table with 5 rows (Anthropic, OpenAI, Gemini, Ollama, Groq)
- [ ] The currently saved provider (from DB) has its radio pre-selected
- [ ] Cloud providers show a model dropdown; Ollama shows a text input
- [ ] API key column shows masked value for any configured keys
- [ ] Clicking ✎ opens inline edit input; pressing Enter commits; pressing Escape cancels
- [ ] Changing a model dropdown or selecting a new provider enables "Save Changes" button
- [ ] Clicking "Save Changes" posts to `/api/config/bulk-update` and shows "Saved ✓"
- [ ] After saving, "Test Connection" becomes enabled
- [ ] "Test Connection" hits `/api/config/test` and shows the result message

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "feat: add LLM / AI settings tab to settings page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections covered — 5 providers, provider table rows, model dropdowns, inline key editing, Test + Save footer, backend Groq additions, Next.js route proxies, error state, dirty-state management.
- [x] **No placeholders:** All steps contain complete code.
- [x] **Type consistency:** `ProviderId` type derived from `PROVIDERS` constant — no string drift. `fieldValue()`, `isConfigured()`, `startEdit()`, `commitEdit()` used consistently throughout the component. Route handler paths match what the component fetches (`/api/config`, `/api/config/bulk-update`, `/api/config/test`).
- [x] **Groq DB migration:** `CONFIG_DEFAULTS` seeds new rows at startup via `config_service.seed_defaults()` which is already called on app boot — no migration file needed.
