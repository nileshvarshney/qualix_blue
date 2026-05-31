# Login Page Design

**Date:** 2026-05-31
**Status:** Approved

---

## Overview

A standalone full-screen login page for Qualix that communicates the platform's AI + Data Quality & Governance identity through a static node-network watermark, while presenting a compact, focused sign-in form centered on the page.

---

## Route & Layout

- **Route:** `/login` (Next.js route group `(auth)` is transparent — resolves to `/login`)
- **Layout:** Standalone — does NOT use the root `layout.tsx` (no Sidebar, no SectionTabBar, no AgentChat). Needs its own `layout.tsx` at `app/(auth)/layout.tsx` or a dedicated route segment that excludes the main shell.
- **Page file:** `app/(auth)/login/page.tsx` (client component — `'use client'`)

---

## Visual Design

### Background
- **Fill:** Dark gradient — `linear-gradient(135deg, #060d1a 0%, #0d1f3c 40%, #0a1628 70%, #110a02 100%)`
- **Ambient glow orbs:** Three blurred radial blobs (orange top-left, blue bottom-right, faint orange center) layered via absolute-positioned `<div>` elements with `filter: blur(60px)`
- **Node network SVG:** Full-viewport `<svg>` absolutely positioned over the background, `viewBox="0 0 960 540"`, `preserveAspectRatio="xMidYMid slice"`, `pointer-events: none`

### Node Network — Two Clusters

| Cluster | Color | Terms |
|---------|-------|-------|
| Data Quality & Governance | `#FF9050` (orange) nodes + edges | Completeness, Accuracy, Timeliness, Governance, Stewardship, Compliance, Data Lineage, Data Catalog, Policies |
| AI Features | `#60a5fa` (blue) nodes + edges | AI Engine, Neural Network, Deep Learning, Predictive Analytics, Anomaly Detection, NLP Processing, Smart Alerts, ML Profiling |
| Bridge | `#a78bfa` (purple) edges | Label: "AI-Powered Governance" — connects the two clusters |

Node opacity: ~0.65–0.75. Label opacity: ~0.45–0.6. Edge opacity: ~0.15–0.25. All watermark — never distracting from the form.

---

## Login Card

- **Position:** Absolutely centered (`display: flex; align-items: center; justify-content: center` on the page)
- **Width:** 300px
- **Background:** `#ffffff`
- **Border-radius:** 14px
- **Padding:** 24px 28px 20px
- **Box-shadow:** `0 28px 70px rgba(0,0,0,0.65)`

### Card Sections (top to bottom)

#### 1. Header
- Qualix logo icon (34×34px, orange gradient `#FF9050 → #A82E06`, border-radius 9px) + inline SVG mark
- Brand name: **Qualix** (16px, weight 800, `#0f172a`)
- Tagline: "AI Data Quality & Governance" (9px, `#94a3b8`)

#### 2. Greeting
- Title: **"Welcome back"** (13px, weight 700, `#0f172a`)
- Subtitle: "Sign in to your workspace" (10px, `#94a3b8`)

#### 3. Form Fields
| Field | Type | Placeholder |
|-------|------|-------------|
| Email address | `<input type="email">` | `your@email.com` |
| Password | `<input type="password">` | `••••••••••••` |
| Role | `<select>` | "Select your role…" |

- Input height: 30px. Background: `#f8fafc`. Border: `1px solid #e2e8f0`. Border-radius: 6px.
- **"Forgot password?"** — small right-aligned link (9px, `#2d5a9e`) below the password field. Clicking toggles an inline reset-password view within the same card (no page navigation).

#### 4. Role Options (select dropdown)
Admin, Data Owner, Data Steward, Analyst, Auditor, Business User, Technical User

#### 5. Actions
- **Sign In** button — full width, 32px height, `linear-gradient(90deg, #FF9050, #A82E06)`, white text 12px bold, border-radius 7px
- **Cancel** button — full width, 28px height, transparent background, `1px solid #e2e8f0`, `#64748b` text, clears all form fields on click

#### 6. Footer
- Divider (1px `#f1f5f9`)
- "Need access? **Request account**" — 9px, `#94a3b8` / `#2d5a9e` link

---

## Behavior

| Interaction | Behavior |
|-------------|----------|
| Sign In | Submit form; show inline validation errors if fields empty or invalid email |
| Cancel | Reset all form fields to empty (no navigation) |
| Forgot password? | Toggle inline reset-password view inside the card (email input + "Send reset link" button + "Back to login" link) |
| Request account | Navigate to `/login/request` or show a modal (TBD — outside scope of this spec) |
| Role select | Stores selected role in form state; passed with login credentials |

---

## Form Validation

- Email: required, valid email format
- Password: required, non-empty
- Role: required, must select one of the 7 options
- Show error message below the relevant field on submit attempt

---

## Responsiveness

- Card stays centered on all viewport sizes
- Minimum viewport width: 320px — card padding reduces to 16px below 360px
- Background SVG scales via `preserveAspectRatio="xMidYMid slice"` — always covers full viewport

---

## Integration Notes

- The main `app/layout.tsx` wraps all routes with `<Sidebar>` and `<SectionTabBar>`. The login page must be excluded from this shell.
- Use a route group `app/(auth)/` with its own `layout.tsx` that renders `{children}` only (no nav).
- Existing app routes remain unaffected.
- No authentication logic is in scope for this spec — this is purely the UI component. Auth wiring (session, JWT, redirect-on-success) is a separate concern.
