# Conversational AI Assistant — Design

## Problem

The "Under Development" roadmap (Settings → Under Development → Agentic AI) lists
"Conversational AI Assistant" as `Placeholder only`, pointing at `/ai-assistant`. In
reality, a fully working agentic chat widget (`AgentChat.tsx`) already exists,
floating bottom-right on every page, backed by a real tool-use loop
(`POST /ai/agent` in `app/api/ai.py`) with 11 tools covering rules, alerts,
domains, connections, and live warehouse queries. The `/ai-assistant` page is a
separate, static placeholder that just tells the user to use the floating widget —
it is redundant and inaccurate documentation of the actual feature state.

## Decision

Make the floating widget the one and only conversational AI surface, give it the
remaining capabilities the roadmap calls for (expanded view, persistent history),
delete the redundant placeholder page and its nav entry, and correct the roadmap
status to reflect reality.

## Changes

### 1. `frontend/src/components/agent/AgentChat.tsx`
- **Expand toggle**: header button switches the panel between compact
  (400×580px, current behavior) and expanded (~900px wide, ~85vh tall, still
  anchored bottom-right). State is local (`expanded` boolean), not persisted.
- **Persistent history**: messages are saved to `localStorage` under
  `qualix-chat-messages`. Hydration happens in a `useEffect` after mount (not in
  the initial `useState`) to avoid SSR/client hydration mismatches, consistent
  with the existing stable-timestamp handling on `INITIAL_MSG`. Every message
  change after hydration is written back to storage.
- **New chat button**: resets `messages` to `[INITIAL_MSG]` and clears the
  stored history.
- No change to the request/response flow, the backend, or the tool-use loop —
  those are already real and correct. No streaming is added (the agent loop
  does multiple server-side tool round-trips per turn, so token-level streaming
  has limited value relative to its implementation cost).

### 2. Removals
- Delete `frontend/src/app/ai-assistant/page.tsx`.
- Remove the `'ai'` section from `Sidebar.tsx` (`key: 'ai', label: 'AI
  Assistant', defaultHref: '/ai-assistant'`) and its entry in
  `SECTION_KEY_MAP` (`'/ai-assistant': 'ai'`).
- Confirmed via codebase search: no other component links to `/ai-assistant` or
  references the `'ai'` section key, so this is a clean removal.

### 3. Roadmap status (`frontend/src/app/settings/page.tsx`, Conversational AI
   Assistant entry, ~lines 605–609)
- `where`: `/ai-assistant page` → `Floating widget (all pages)`
- `status`: `Placeholder only` → `Implemented — agentic chat widget with live
  tool-use`
- `desc`: rewritten to describe what is actually built (floating widget,
  backend tool-execution loop, expand toggle, persistent history) and to note
  that the dedicated page was removed because the widget supersedes it.

## Out of scope
- Token-level SSE streaming (explicitly deferred — current request/response
  pattern with loading animation is sufficient).
- Backend changes to the tool-use loop or tool set.
- Persisting the `expanded` UI state across sessions.

## Risk / testing
- Pure frontend change with no schema/API changes. Verify: widget opens/closes,
  expand toggle resizes correctly, history survives a page reload, "New chat"
  clears it, `/ai-assistant` 404s (or is gone from nav) with no dangling links,
  and the roadmap tab shows the corrected status with no leftover "Placeholder"
  styling (red badge) for this entry.
