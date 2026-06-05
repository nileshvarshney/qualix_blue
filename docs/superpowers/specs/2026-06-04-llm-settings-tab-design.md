# LLM / AI Settings Tab — Design Spec

**Date:** 2026-06-04  
**Branch:** nilesh_compact_design  
**Status:** Approved

---

## Overview

Add a new "LLM / AI" tab to the existing Settings page (`/settings`) that lets users configure which LLM provider the platform uses for all AI-driven features (rule generation, root cause analysis, catalog descriptions, etc.). Users select one active provider and configure its credentials and model. The system uses that provider for every LLM call.

---

## Backend

No backend changes required. All necessary endpoints already exist:

| Endpoint | Purpose |
|---|---|
| `GET /api/config?category=llm` | Load all LLM config values on mount |
| `POST /api/config/bulk-update` | Save changed keys atomically |
| `POST /api/config/test/llm` | Test the currently saved active provider |

Supported providers and their DB config keys:

| Provider | Keys |
|---|---|
| Anthropic (Claude) | `anthropic_api_key`, `claude_model` |
| OpenAI (GPT) | `openai_api_key`, `openai_model` |
| Google (Gemini) | `gemini_api_key`, `gemini_model` |
| Ollama (local) | `ollama_base_url`, `ollama_model` |
| Groq | `groq_api_key`, `groq_model` |

Active provider is stored under key `llm_provider`. Valid values: `ollama`, `openai`, `claude`, `gemini`, `groq`.

> **Groq note:** The backend `llm_providers.py` and `config_service.py` need a Groq provider added (GroqProvider class + `groq_api_key`/`groq_model` config defaults). This is a small addition — Groq is OpenAI-compatible so it reuses the same call shape.

---

## Frontend

### File structure

```
frontend/src/
  app/settings/page.tsx          — add 'llm' to tab union type and tab list, render <LLMSettingsTab />
  components/settings/
    LLMSettingsTab.tsx            — new component (all LLM tab logic lives here)
```

### Tab registration

In `settings/page.tsx`:
- Add `'llm'` to the tab type union.
- Add `{ id: 'llm', label: 'LLM / AI', icon: '🤖' }` to the `tabs` array (between Integrations and Workspace, or at the end before Roadmap).
- Render `<LLMSettingsTab />` when `tab === 'llm'`.

### LLMSettingsTab component

**Data loading:** On mount, fetch `GET /api/config?category=llm`. Parse the response to populate local state for all provider fields and the active provider selection.

**Local state:**
```ts
activeProvider: 'ollama' | 'openai' | 'claude' | 'gemini' | 'groq'
editingKey: string | null        // which provider's key field is in edit mode
fields: Record<string, string>   // all config key values keyed by DB key name
dirty: boolean
saving: boolean
testStatus: { status: 'ok' | 'error'; message: string } | null
testLoading: boolean
```

**Provider definitions (static config in the component):**

```ts
const PROVIDERS = [
  {
    id: 'claude',
    label: 'Anthropic (Claude)',
    color: '#7c3aed',
    keyField: 'anthropic_api_key',
    keyPlaceholder: 'sk-ant-…',
    modelField: 'claude_model',
    models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-3-5-sonnet-latest', 'claude-3-haiku-20240307'],
    requiresKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    color: '#16a34a',
    keyField: 'openai_api_key',
    keyPlaceholder: 'sk-proj-…',
    modelField: 'openai_model',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
    requiresKey: true,
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    color: '#2563eb',
    keyField: 'gemini_api_key',
    keyPlaceholder: 'AIza…',
    modelField: 'gemini_model',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    color: '#d97706',
    keyField: 'ollama_base_url',
    keyPlaceholder: 'http://localhost:11434',
    modelField: 'ollama_model',
    models: [],               // free text — Ollama model names vary
    requiresKey: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    color: '#0891b2',
    keyField: 'groq_api_key',
    keyPlaceholder: 'gsk_…',
    modelField: 'groq_model',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    requiresKey: true,
  },
]
```

### Layout

Single card (reusing the `card` style already defined in settings/page.tsx). Inside:

1. **Column header row** — 12px muted text: "Provider" / "Model" / "API Key / URL" / "Status"
2. **Five provider rows** — one per provider, ~38px tall, separated by a 1px border
3. **Footer** — right-aligned "Test Connection" + "Save Changes" buttons; test result message below

**Provider row columns:**
- **Radio** (16px) — selects the active provider; clicking marks dirty
- **Provider** (180px) — coloured dot + name label
- **Model** (200px) — `<select>` dropdown for cloud providers; `<input type="text">` for Ollama
- **API Key / URL** (flex) — if value is set: show masked truncation (`sk-ant-••••••••`) + pencil icon button that switches to an `<input type="password">` inline; if not set: show "Not configured" in muted text + pencil icon
- **Status** (80px) — green dot + "configured" if key/url is non-empty; grey dot + "not set" otherwise

**Active row styling:** left border `3px solid var(--accent)`, background `rgba(var(--accent-rgb), 0.04)`.

**Save flow:**
1. `POST /api/config/bulk-update` with all `fields` plus `llm_provider: activeProvider`
2. On success: show inline "Saved ✓" for 2 seconds, set `dirty = false`
3. On error: show inline error message in red

**Test flow:**
1. `POST /api/config/test/llm` (tests the currently *saved* provider, not the in-memory selection)
2. Show spinner on button during request
3. On response: render `testStatus` message below footer — green for ok, red for error

---

## Error handling

- Network error on load: show "Failed to load LLM config" with a retry button inside the card
- Save failure: inline red error below the footer buttons
- Test failure: inline red message — surface the backend's error string verbatim (it already includes actionable hints like "update the URL in Settings → LLM / AI")
- Unsaved changes: if `dirty` is true and user switches tabs, no blocking — state is preserved in the component while the tab stays mounted (React keeps it alive in the DOM with `display:none`)

---

## Backend additions (Groq support)

**`app/services/llm_providers.py`** — add `GroqProvider` class (OpenAI-compatible, use `openai` SDK with `base_url='https://api.groq.com/openai/v1'`). Add `groq` case to `get_provider_from_db` and `get_provider`.

**`app/services/config_service.py`** — add two entries to `CONFIG_DEFAULTS`:
```python
{"category": "llm", "key": "groq_api_key", "value": "", "is_secret": True, "description": "Groq API key (starts with gsk_)"},
{"category": "llm", "key": "groq_model",   "value": "llama-3.3-70b-versatile", "is_secret": False, "description": "Groq model name"},
```

**`app/api/config.py`** — add `groq` branch to the `test_llm` endpoint.

**`app/core/config.py`** — add `groq_api_key: str = ""` and `groq_model: str = "llama-3.3-70b-versatile"` to the `Settings` class.

---

## Out of scope

- Per-provider usage/cost tracking
- Model capability badges
- Streaming support in the test call
- Multiple active providers or per-feature provider overrides
