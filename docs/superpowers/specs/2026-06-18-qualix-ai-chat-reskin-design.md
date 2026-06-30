# Qualix AI Chat Widget — Look & Feel Reskin

**Date:** 2026-06-18  
**Status:** Approved  
**Scope:** `frontend/src/components/agent/AgentChat.tsx` only — no backend changes, no new files.

---

## Goal

Replace the generic robot-themed chat widget with a design that matches the Qualix brand: warm orange gradient, the app's existing logo mark (Q ring + 4-pointed star), and consistent accents throughout the panel.

---

## Brand Tokens (from `icon.svg` and `globals.css`)

| Token | Value |
|---|---|
| Brand orange gradient | `#FF9050 → #E8541A → #A82E06` |
| Brand primary | `#E8541A` |
| Brand deep | `#7C1A02` |
| Brand light | `#FFB347` |
| Brand tint bg | `#FFF4EF` |
| App surface | `#ffffff` |
| App border | `#e2e8f0` |
| App foreground | `#0f172a` |

---

## Component Changes

### 1. QualixMark SVG component (replaces RobotIcon + RobotIconSmall)

A single reusable component rendered at three sizes:
- **Small (28×28):** AI message avatar (left of each response bubble)
- **Large (38×38):** panel header avatar
- **FAB (42×42):** floating action button icon

Contents (from `icon.svg`):
- Rounded-rect background: `linear-gradient(135deg, #FF9050, #E8541A, #A82E06)`
- Q circle ring: `circle cx≈45% cy≈42% r≈23%`, white stroke, semi-transparent fill
- 4-pointed star: `path d="M14.5 8 L15.8 11.8 L19.5 13.5 L15.8 15.2 L14.5 19 L13.2 15.2 L9.5 13.5 L13.2 11.8 Z"` (scaled to viewBox), white fill
- Crown dot: small white circle at 12 o'clock on the Q ring

The component accepts a `size` prop; the internal SVG viewBox is `0 0 32 32` matching `icon.svg`.

### 2. Floating Action Button (FAB)

| Property | Old | New |
|---|---|---|
| Background | `linear-gradient(145deg, #1a2e4a, #1d4ed8)` | `linear-gradient(145deg, #FF9050, #A82E06)` |
| Box shadow (idle) | `rgba(29,78,216,0.55)` | `rgba(232,84,26,0.55)` |
| Box shadow (open) | `rgba(29,78,216,0.5)` | `rgba(124,26,2,0.5)` |
| Icon (closed) | RobotIcon (robot SVG) | QualixMark at 42px |
| Icon (open) | white ✕ | white ✕ (unchanged) |

### 3. Panel Header

| Property | Old | New |
|---|---|---|
| Background | `linear-gradient(135deg, #0f172a, #1e1b4b)` | `linear-gradient(135deg, #7C1A02, #C94015, #E8541A)` |
| Avatar | 38×38 blue gradient + RobotIcon | 38×38 QualixMark (large) |
| Status dot color | `#10b981` (green) | `#FFB347` (warm amber) |
| Status text | "Online & Ready" | "Online & Ready" (unchanged) |

### 4. AI Message Avatar

| Property | Old | New |
|---|---|---|
| Background | `linear-gradient(135deg, #1e3a5f, #2563eb)` | QualixMark component (self-contained gradient) |
| Icon | RobotIconSmall (20px robot) | QualixMark at 28px |

### 5. Suggestion Chips

| Property | Old | New |
|---|---|---|
| Border | `1px solid #e2e8f0` | `1px solid rgba(232,84,26,0.25)` |
| Text color | `#6366f1` (indigo) | `#E8541A` (brand orange) |
| Hover background | (none defined) | `#FFF4EF` (brand tint) |

### 6. Send Button

| Property | Old | New |
|---|---|---|
| Active background | `linear-gradient(135deg, #6366f1, #8b5cf6)` | `linear-gradient(135deg, #FF9050, #A82E06)` |
| Disabled | `#e2e8f0` (unchanged) | `#e2e8f0` (unchanged) |

### 7. User Message Bubble

No change — the dark slate keeps good contrast against the orange theme.

### 8. Loading / Typing Dots

| Property | Old | New |
|---|---|---|
| Dot color | `#6366f1` (indigo) | `#E8541A` (brand orange) |

---

## Implementation Notes

- Delete `RobotIcon` and `RobotIconSmall` functions entirely.
- Add one `QualixMark({ size }: { size: number })` component at the top of the file.
- `QualixMark` calls React's `useId()` hook to generate a per-instance gradient ID (e.g. `qualix-grad-:r1:`). Multiple instances render simultaneously (FAB + header + one per message); `useId()` guarantees no ID collisions across them.
- Suggestion chips gain `onMouseEnter` / `onMouseLeave` handlers to toggle the `#FFF4EF` hover background — this is new state (`hoveredChip: string | null`) or simple inline handler via `style` and React synthetic events.
- All colour changes are inline-style props (no CSS files touched).
- No prop interface changes to `AgentChat` — purely internal visual changes.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/agent/AgentChat.tsx` | Replace robot icons, update all colour values |

---

## Out of Scope

- Backend / API changes
- Dark-mode variants (existing dark-mode globals do not affect this widget's inline styles)
- Animation changes beyond colour updates to existing animations
