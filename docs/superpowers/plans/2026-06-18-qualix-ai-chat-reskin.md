# Qualix AI Chat Widget — Look & Feel Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the robot-themed Qualix AI chat widget with Qualix brand visuals — orange gradient FAB with the logo's 4-pointed star, Qualix logo mark as the AI message avatar, and orange accents throughout.

**Architecture:** All changes are confined to a single React client component. A new `QualixMark` SVG component replaces both `RobotIcon` helpers. Colours are updated via inline styles only — no CSS files are touched.

**Tech Stack:** Next.js 14+, React 18+ (`useId` hook), TypeScript, inline SVG

## Global Constraints

- Single file change only: `frontend/src/components/agent/AgentChat.tsx`
- No new files created
- No CSS/globals files touched — all colour changes via inline `style` props
- No prop interface changes to `AgentChat` — purely internal
- Brand orange gradient: `#FF9050 → #E8541A → #A82E06`
- Brand primary: `#E8541A`
- Brand deep: `#7C1A02`
- Brand light (amber): `#FFB347`
- Brand tint bg: `#FFF4EF`
- `QualixMark` uses React `useId()` for per-instance SVG gradient IDs

---

## File Map

| File | Action |
|---|---|
| `frontend/src/components/agent/AgentChat.tsx` | Modify — all 4 tasks below |

---

### Task 1: Add QualixMark component, remove robot icons

**Files:**
- Modify: `frontend/src/components/agent/AgentChat.tsx:1-43`

**Interfaces:**
- Produces: `QualixMark({ size }: { size: number }): JSX.Element` — used by Tasks 2, 3, 4

- [ ] **Step 1: Update the React import to include `useId`**

Replace line 1–3:
```tsx
'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { AgentMessage } from '@/lib/types'
```

- [ ] **Step 2: Delete `RobotIcon` and `RobotIconSmall`, add `QualixMark` in their place**

Replace lines 5–43 (the two robot functions) with:
```tsx
function QualixMark({ size }: { size: number }) {
  const id = useId()
  const gradId = `qm-grad-${id}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9050" />
          <stop offset="55%" stopColor="#E8541A" />
          <stop offset="100%" stopColor="#A82E06" />
        </linearGradient>
      </defs>
      {/* Orange gradient background */}
      <rect width="32" height="32" rx="7" fill={`url(#${gradId})`} />
      {/* Q circle ring */}
      <circle cx="14.5" cy="13.5" r="7.5" stroke="white" strokeWidth="2.2" fill="rgba(255,255,255,0.15)" />
      {/* 4-pointed star */}
      <path d="M14.5 8 L15.8 11.8 L19.5 13.5 L15.8 15.2 L14.5 19 L13.2 15.2 L9.5 13.5 L13.2 11.8 Z" fill="white" />
      {/* Crown dot */}
      <circle cx="14.5" cy="6" r="1.8" fill="white" opacity="0.9" />
    </svg>
  )
}
```

- [ ] **Step 3: Verify the file still compiles (dev server hot-reload shows no red overlay)**

The frontend dev server is already running at `http://localhost:3000`. After saving, check the browser — no red Next.js error overlay should appear. The FAB button may briefly show nothing until Task 2 wires it up.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/agent/AgentChat.tsx
git commit -m "feat(chat): add QualixMark SVG component, remove robot icons"
```

---

### Task 2: Update Floating Action Button (FAB)

**Files:**
- Modify: `frontend/src/components/agent/AgentChat.tsx` — the FAB `<button>` at the bottom of the JSX return

**Interfaces:**
- Consumes: `QualixMark({ size: 42 })` from Task 1

- [ ] **Step 1: Find the FAB button**

Locate the button that has `position: 'fixed', bottom: '20px', right: '20px'` in its style prop. It currently renders `<RobotIcon size={42} />` when closed and `<span>✕</span>` when open.

- [ ] **Step 2: Replace the FAB button JSX**

Replace the entire FAB `<button>` element with:
```tsx
{/* Floating Button */}
<button onClick={() => setOpen(!open)} style={{
  position: 'fixed', bottom: '20px', right: '20px',
  width: '62px', height: '62px', borderRadius: '20px', border: 'none',
  background: 'linear-gradient(145deg, #FF9050, #A82E06)',
  cursor: 'pointer', zIndex: 1001,
  boxShadow: open
    ? '0 8px 28px rgba(124,26,2,0.5)'
    : '0 8px 32px rgba(232,84,26,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.25s', transform: open ? 'scale(0.9)' : 'scale(1)'
}}>
  {open
    ? <span style={{ color: '#fff', fontSize: '22px', fontWeight: 300, lineHeight: 1 }}>✕</span>
    : <QualixMark size={42} />}
</button>
```

- [ ] **Step 3: Verify visually**

Open `http://localhost:3000`. The FAB button in the bottom-right should now show the orange Qualix logo mark (Q ring + 4-pointed star). Clicking it should open the panel; the button should change to a white ✕ on orange background.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/agent/AgentChat.tsx
git commit -m "feat(chat): update FAB to orange Qualix gradient + star icon"
```

---

### Task 3: Update panel header

**Files:**
- Modify: `frontend/src/components/agent/AgentChat.tsx` — the header `<div>` inside the chat panel

**Interfaces:**
- Consumes: `QualixMark({ size: 38 })` from Task 1

- [ ] **Step 1: Find the panel header div**

Locate the `<div>` with `background: 'linear-gradient(135deg, #0f172a, #1e1b4b)'` and `padding: '16px 20px'`.

- [ ] **Step 2: Replace the header JSX**

Replace the entire header `<div>` (from the padding/gradient div down to and including its closing tag, which contains the avatar div, the title/status div, and the close button) with:
```tsx
{/* Header */}
<div style={{
  padding: '16px 20px',
  background: 'linear-gradient(135deg, #7C1A02, #C94015, #E8541A)',
  display: 'flex', alignItems: 'center', gap: '10px'
}}>
  <div style={{
    width: '38px', height: '38px', borderRadius: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(124,26,2,0.4)'
  }}>
    <QualixMark size={38} />
  </div>
  <div>
    <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Qualix AI</div>
    <div style={{ color: '#FFB347', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFB347' }} />
      Online & Ready
    </div>
  </div>
  <button onClick={() => setOpen(false)} style={{
    marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none',
    color: '#fff', width: '28px', height: '28px', borderRadius: '8px',
    cursor: 'pointer', fontSize: '14px'
  }}>✕</button>
</div>
```

- [ ] **Step 3: Verify visually**

Open the chat panel. The header should now be a deep orange → brand orange gradient. The avatar is the Qualix logo mark. The status dot and text are warm amber (`#FFB347`), not green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/agent/AgentChat.tsx
git commit -m "feat(chat): update panel header to orange gradient + Qualix avatar"
```

---

### Task 4: Update AI message avatars and loading indicator

**Files:**
- Modify: `frontend/src/components/agent/AgentChat.tsx` — message list and loading dots

**Interfaces:**
- Consumes: `QualixMark({ size: 28 })` from Task 1

- [ ] **Step 1: Find the AI message avatar in the messages map**

Locate the block inside the `messages.map` that renders the assistant avatar — it's a `<div>` with `background: 'linear-gradient(135deg, #1e3a5f, #2563eb)'` containing `<RobotIconSmall size={20} />`.

- [ ] **Step 2: Replace the message avatar div**

Replace that avatar `<div>` with:
```tsx
{msg.role === 'assistant' && (
  <div style={{
    width: '28px', height: '28px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginRight: '8px', marginTop: '2px'
  }}>
    <QualixMark size={28} />
  </div>
)}
```

- [ ] **Step 3: Find the loading indicator avatar**

Locate the loading spinner section (`{loading && ...}`) — it also has a `<div>` with `background: 'linear-gradient(135deg, #1e3a5f, #2563eb)'` containing `<RobotIconSmall size={20} />`.

- [ ] **Step 4: Replace the loading avatar and update dot colours**

Replace the loading block's avatar div with the same pattern as Step 2, and update the three bouncing dots from `#6366f1` to `#E8541A`:
```tsx
{loading && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div style={{
      width: '28px', height: '28px', borderRadius: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <QualixMark size={28} />
    </div>
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
      {[0, 1, 2].map(j => (
        <div key={j} style={{
          width: '6px', height: '6px', borderRadius: '50%', background: '#E8541A',
          animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`
        }} />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify visually**

Send a message in the chat. AI response bubbles should now show the Qualix logo mark (orange square, Q+star) as the avatar. The typing indicator dots should be orange while waiting for a response.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/agent/AgentChat.tsx
git commit -m "feat(chat): update AI message avatars and typing dots to Qualix brand"
```

---

### Task 5: Update suggestion chips and send button

**Files:**
- Modify: `frontend/src/components/agent/AgentChat.tsx` — suggestion chips and send button

**Interfaces:**
- No new dependencies

- [ ] **Step 1: Find the suggestion chips**

Locate the `{messages.length === 1 && (...)}` block containing the `SUGGESTIONS.map` buttons.

- [ ] **Step 2: Replace suggestion chip JSX**

The chip buttons need orange text, orange border, and a hover state. Add a `hoveredSuggestion` state variable and update the chips:

Add this state near the other `useState` calls at the top of `AgentChat`:
```tsx
const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null)
```

Replace the chip button JSX inside `SUGGESTIONS.map`:
```tsx
<button
  key={s}
  onClick={() => send(s)}
  onMouseEnter={() => setHoveredSuggestion(s)}
  onMouseLeave={() => setHoveredSuggestion(null)}
  style={{
    background: hoveredSuggestion === s ? '#FFF4EF' : '#fff',
    border: '1px solid rgba(232,84,26,0.25)',
    borderRadius: '20px',
    padding: '6px 12px', fontSize: '12px',
    color: '#E8541A', cursor: 'pointer',
    fontWeight: 500, transition: 'all 0.2s'
  }}
>{s}</button>
```

- [ ] **Step 3: Find the send button**

Locate the `<button onClick={() => send()}>↑</button>` at the bottom of the panel. It has `background: input.trim() && !loading ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0'`.

- [ ] **Step 4: Replace the send button background gradient**

Update just the active background value:
```tsx
background: input.trim() && !loading
  ? 'linear-gradient(135deg, #FF9050, #A82E06)'
  : '#e2e8f0',
```

- [ ] **Step 5: Verify visually**

Open the chat. On first open (only 1 message shown), the suggestion chips should have orange text and an orange border tint. Hover over a chip — it should turn light orange (`#FFF4EF`). Type something in the input box — the send button should turn orange when text is present.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/agent/AgentChat.tsx
git commit -m "feat(chat): update suggestion chips and send button to orange brand"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] FAB shows orange gradient + Qualix star icon (not robot)
- [ ] FAB open state shows white ✕ on orange background
- [ ] Panel header is deep-orange → brand-orange gradient
- [ ] Header avatar is Qualix logo mark (Q + star, not robot)
- [ ] Status dot is amber (`#FFB347`), not green
- [ ] AI message avatars are Qualix logo mark
- [ ] Typing dots are orange, not indigo
- [ ] Suggestion chips have orange text + orange border tint
- [ ] Suggestion chips turn `#FFF4EF` on hover
- [ ] Send button turns orange when input has text
- [ ] No indigo/purple (`#6366f1`) or navy blue (`#1e3a5f`, `#1e1b4b`) remains in the widget
- [ ] No red Next.js error overlay after any save
- [ ] User message bubbles are unchanged (dark slate gradient)
