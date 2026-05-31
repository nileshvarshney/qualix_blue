# Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Qualix login page — full-screen dark node-network background with a compact centered white card (email / password / role / Sign In / Cancel / inline forgot-password toggle).

**Architecture:** A `ShellWrapper` client component reads `usePathname` and conditionally skips the sidebar/nav for `/login`; the root layout delegates to it. The login page itself is a server component that composes a static `NodeNetworkBg` SVG and a client-side `LoginCard` form. No auth wiring — UI only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, inline styles (matching existing codebase convention)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| CREATE | `frontend/src/components/ShellWrapper.tsx` | Client component — conditionally renders Sidebar + nav shell based on `usePathname`. Auth routes (`/login`) get only `{children}`. |
| MODIFY | `frontend/src/app/layout.tsx` | Replace inline Sidebar/main/AgentChat with `<ShellWrapper>`. |
| CREATE | `frontend/src/components/auth/NodeNetworkBg.tsx` | Full-viewport SVG watermark — dark gradient + glow orbs + orange DQ nodes + blue AI nodes + purple bridge edges + labels. |
| CREATE | `frontend/src/components/auth/LoginCard.tsx` | Client form component — login mode + inline reset-password mode. Handles validation, Cancel (clears form), Forgot password toggle. |
| CREATE | `frontend/src/app/(auth)/login/page.tsx` | Server component — composes `NodeNetworkBg` + `LoginCard` on a full-viewport container. |

---

## Task 1: ShellWrapper — conditionally exclude nav shell on auth routes

**Files:**
- Create: `frontend/src/components/ShellWrapper.tsx`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Create ShellWrapper component**

Create `frontend/src/components/ShellWrapper.tsx`:

```tsx
'use client'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'
import SectionTabBar from '@/components/ui/SectionTabBar'

const AUTH_ROUTES = ['/login']

export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (isAuth) return <>{children}</>

  return (
    <>
      <Sidebar />
      <main style={{
        marginLeft: '72px',
        marginTop: '56px',
        minHeight: 'calc(100vh - 56px)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <SectionTabBar />
        {children}
      </main>
      <AgentChat />
    </>
  )
}
```

- [ ] **Step 2: Update root layout to use ShellWrapper**

Replace the contents of `frontend/src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import ShellWrapper from '@/components/ShellWrapper'

export const metadata: Metadata = {
  title: 'Qualix — AI Data Quality & Governance',
  description: 'AI-powered data quality monitoring, governance, and management',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
}

const themeInitScript = `(function(){try{var t=localStorage.getItem('qualix-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body style={{ minHeight: '100vh', background: 'var(--background)' }}>
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify existing routes still show the sidebar**

Run: `cd frontend && npm run dev`

Open `http://localhost:3000` — sidebar and tab bar should appear exactly as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ShellWrapper.tsx frontend/src/app/layout.tsx
git commit -m "feat: add ShellWrapper to exclude nav shell on auth routes"
```

---

## Task 2: NodeNetworkBg — full-viewport SVG watermark

**Files:**
- Create: `frontend/src/components/auth/NodeNetworkBg.tsx`

- [ ] **Step 1: Create the auth components directory and NodeNetworkBg**

Create `frontend/src/components/auth/NodeNetworkBg.tsx`:

```tsx
export default function NodeNetworkBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0 }}>
      {/* dark gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #060d1a 0%, #0d1f3c 40%, #0a1628 70%, #110a02 100%)',
      }} />

      {/* ambient glow orbs */}
      <div style={{ position: 'absolute', top: -100, left: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,100,30,0.07)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(45,90,158,0.09)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', left: '25%', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,144,80,0.05)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      {/* node network */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="ng1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF9050" stopOpacity="1" />
            <stop offset="100%" stopColor="#FF9050" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="ng2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* DQ / Governance edges — orange */}
        <line x1="55"  y1="55"  x2="180" y2="35"  stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="180" y1="35"  x2="330" y2="75"  stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="55"  y1="55"  x2="75"  y2="200" stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="75"  y1="200" x2="210" y2="245" stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="75"  y1="200" x2="45"  y2="370" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="45"  y1="370" x2="155" y2="435" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="155" y1="435" x2="285" y2="470" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="285" y1="470" x2="420" y2="490" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="330" y1="75"  x2="210" y2="245" stroke="#FF9050" strokeWidth="0.5" opacity="0.14" />

        {/* AI edges — blue */}
        <line x1="590" y1="45"  x2="760" y2="28"  stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="760" y1="28"  x2="920" y2="65"  stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="920" y1="65"  x2="900" y2="210" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="900" y1="210" x2="820" y2="330" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="820" y1="330" x2="890" y2="440" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="890" y1="440" x2="750" y2="485" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="590" y1="45"  x2="670" y2="195" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="670" y1="195" x2="820" y2="330" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="670" y1="195" x2="750" y2="485" stroke="#60a5fa" strokeWidth="0.5" opacity="0.14" />

        {/* Bridge edges — purple */}
        <line x1="330" y1="75"  x2="590" y2="45"  stroke="#a78bfa" strokeWidth="0.8" opacity="0.18" />
        <line x1="210" y1="245" x2="670" y2="195" stroke="#a78bfa" strokeWidth="0.8" opacity="0.15" />
        <line x1="420" y1="490" x2="750" y2="485" stroke="#a78bfa" strokeWidth="0.8" opacity="0.15" />

        {/* DQ / Governance nodes */}
        <circle cx="55"  cy="55"  r="4"   fill="url(#ng1)" opacity="0.65" />
        <circle cx="180" cy="35"  r="3.5" fill="url(#ng1)" opacity="0.6" />
        <circle cx="330" cy="75"  r="4"   fill="url(#ng1)" opacity="0.65" />
        <circle cx="75"  cy="200" r="5"   fill="url(#ng1)" opacity="0.75" />
        <circle cx="210" cy="245" r="3.5" fill="url(#ng1)" opacity="0.6" />
        <circle cx="45"  cy="370" r="4"   fill="url(#ng1)" opacity="0.6" />
        <circle cx="155" cy="435" r="3.5" fill="url(#ng1)" opacity="0.55" />
        <circle cx="285" cy="470" r="4"   fill="url(#ng1)" opacity="0.6" />
        <circle cx="420" cy="490" r="3.5" fill="url(#ng1)" opacity="0.55" />

        {/* AI nodes */}
        <circle cx="590" cy="45"  r="4.5" fill="url(#ng2)" opacity="0.75" />
        <circle cx="760" cy="28"  r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="920" cy="65"  r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="900" cy="210" r="3.5" fill="url(#ng2)" opacity="0.6" />
        <circle cx="670" cy="195" r="5"   fill="url(#ng2)" opacity="0.75" />
        <circle cx="820" cy="330" r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="890" cy="440" r="3.5" fill="url(#ng2)" opacity="0.6" />
        <circle cx="750" cy="485" r="4"   fill="url(#ng2)" opacity="0.65" />

        {/* DQ labels */}
        <text x="63"  y="52"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Completeness</text>
        <text x="188" y="32"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Accuracy</text>
        <text x="338" y="72"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Timeliness</text>
        <text x="83"  y="197" fill="#FF9050" fontSize="10" fontFamily="monospace" fontWeight="600" opacity="0.55">Governance</text>
        <text x="218" y="242" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Stewardship</text>
        <text x="53"  y="367" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Compliance</text>
        <text x="163" y="432" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Data Lineage</text>
        <text x="293" y="467" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Data Catalog</text>
        <text x="428" y="487" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Policies</text>

        {/* AI labels */}
        <text x="598" y="42"  fill="#93c5fd" fontSize="10" fontFamily="monospace" fontWeight="700" opacity="0.6">AI Engine</text>
        <text x="768" y="25"  fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.55">Neural Network</text>
        <text x="928" y="62"  fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.55">Deep Learning</text>
        <text x="908" y="207" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.5">Predictive Analytics</text>
        <text x="678" y="192" fill="#93c5fd" fontSize="10" fontFamily="monospace" fontWeight="700" opacity="0.6">Anomaly Detection</text>
        <text x="828" y="327" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.5">NLP Processing</text>
        <text x="898" y="437" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.45">Smart Alerts</text>
        <text x="758" y="482" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.45">ML Profiling</text>

        {/* Bridge label */}
        <text x="460" y="140" fill="#c4b5fd" fontSize="9" fontFamily="monospace" opacity="0.35">AI-Powered Governance</text>
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/auth/NodeNetworkBg.tsx
git commit -m "feat: add NodeNetworkBg SVG watermark for login page"
```

---

## Task 3: LoginCard — form with validation and inline reset toggle

**Files:**
- Create: `frontend/src/components/auth/LoginCard.tsx`

- [ ] **Step 1: Create LoginCard**

Create `frontend/src/components/auth/LoginCard.tsx`:

```tsx
'use client'
import { useState } from 'react'

const ROLES = [
  'Admin', 'Data Owner', 'Data Steward', 'Analyst',
  'Auditor', 'Business User', 'Technical User',
]

type Mode = 'login' | 'reset'
type LoginForm = { email: string; password: string; role: string }
type LoginErrors = { email?: string; password?: string; role?: string }

export default function LoginCard() {
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState<LoginForm>({ email: '', password: '', role: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [resetEmail, setResetEmail] = useState('')
  const [resetEmailError, setResetEmailError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  function handleCancel() {
    setForm({ email: '', password: '', role: '' })
    setErrors({})
  }

  function validate(): boolean {
    const e: LoginErrors = {}
    if (!form.email) {
      e.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address'
    }
    if (!form.password) e.password = 'Password is required'
    if (!form.role) e.role = 'Please select a role'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSignIn() {
    if (validate()) {
      // Auth wiring out of scope — replace with real call
      console.log('sign in', form.email, form.role)
    }
  }

  function handleResetSubmit() {
    if (!resetEmail) {
      setResetEmailError('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setResetEmailError('Enter a valid email address')
      return
    }
    setResetEmailError('')
    setResetSent(true)
  }

  function backToLogin() {
    setMode('login')
    setResetEmail('')
    setResetEmailError('')
    setResetSent(false)
  }

  return (
    <div style={{
      position: 'relative', zIndex: 10,
      background: '#ffffff', borderRadius: 14,
      padding: '24px 28px 20px', width: 300,
      boxShadow: '0 28px 70px rgba(0,0,0,0.65)',
    }}>
      {/* Header — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34,
          background: 'linear-gradient(135deg, #FF9050, #A82E06)',
          borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 32 32" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14.5" cy="13.5" r="7.5" stroke="white" strokeWidth="2.2" fill="rgba(255,255,255,0.15)" />
            <line x1="19.8" y1="18.8" x2="27" y2="26" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M14.5 8 L15.8 11.8 L19.5 13.5 L15.8 15.2 L14.5 19 L13.2 15.2 L9.5 13.5 L13.2 11.8 Z" fill="white" />
            <circle cx="14.5" cy="6" r="1.8" fill="white" opacity="0.9" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '0.4px', lineHeight: 1 }}>
            Qualix
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
            AI Data Quality &amp; Governance
          </div>
        </div>
      </div>

      {mode === 'login' ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Welcome back</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>Sign in to your workspace</div>

          <label style={labelStyle}>Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="your@email.com"
            style={inputStyle(!!errors.email)}
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}

          <label style={{ ...labelStyle, marginTop: 10 }}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="••••••••••••"
            style={inputStyle(!!errors.password)}
          />
          {errors.password && <div style={errorStyle}>{errors.password}</div>}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setMode('reset')}
            onKeyDown={e => e.key === 'Enter' && setMode('reset')}
            style={{ fontSize: 9, color: '#2d5a9e', textAlign: 'right', marginTop: 4, cursor: 'pointer' }}
          >
            Forgot password?
          </div>

          <label style={{ ...labelStyle, marginTop: 10 }}>Role</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={selectStyle(!!errors.role)}
          >
            <option value="">Select your role…</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {errors.role && <div style={errorStyle}>{errors.role}</div>}

          <button onClick={handleSignIn} style={btnPrimaryStyle}>Sign In</button>
          <button onClick={handleCancel} style={btnCancelStyle}>Cancel</button>

          <div style={{ height: 1, background: '#f1f5f9', margin: '14px 0 0' }} />
          <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
            Need access?{' '}
            <span style={{ color: '#2d5a9e', cursor: 'pointer' }}>Request account</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Reset password</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>
            {resetSent
              ? 'Check your inbox for a reset link.'
              : "Enter your email and we'll send a reset link."}
          </div>

          {!resetSent && (
            <>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="your@email.com"
                style={inputStyle(!!resetEmailError)}
              />
              {resetEmailError && <div style={errorStyle}>{resetEmailError}</div>}
              <button onClick={handleResetSubmit} style={{ ...btnPrimaryStyle, marginTop: 16 }}>
                Send reset link
              </button>
            </>
          )}

          <button onClick={backToLogin} style={{ ...btnCancelStyle, marginTop: resetSent ? 16 : 8 }}>
            ← Back to login
          </button>
        </>
      )}
    </div>
  )
}

/* ── shared styles ── */

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600,
  color: '#475569', marginBottom: 3,
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%', height: 30,
    background: '#f8fafc',
    border: `1px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
    borderRadius: 6, padding: '0 9px',
    fontSize: 11, color: '#0f172a',
    outline: 'none', boxSizing: 'border-box',
  }
}

function selectStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%', height: 30,
    background: '#f8fafc',
    border: `1px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
    borderRadius: 6, padding: '0 9px',
    fontSize: 11, color: '#0f172a',
    outline: 'none', boxSizing: 'border-box',
  }
}

const errorStyle: React.CSSProperties = {
  fontSize: 9, color: '#ef4444', marginTop: 3,
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'block', width: '100%', height: 32, marginTop: 16,
  background: 'linear-gradient(90deg, #FF9050, #A82E06)',
  border: 'none', borderRadius: 7,
  color: 'white', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '0.3px',
}

const btnCancelStyle: React.CSSProperties = {
  display: 'block', width: '100%', height: 28, marginTop: 6,
  background: 'transparent', border: '1px solid #e2e8f0',
  borderRadius: 7, color: '#64748b',
  fontSize: 11, cursor: 'pointer',
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/auth/LoginCard.tsx
git commit -m "feat: add LoginCard with validation and inline reset-password toggle"
```

---

## Task 4: Login page — compose background + card

**Files:**
- Create: `frontend/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create the (auth) route group and login page**

Create `frontend/src/app/(auth)/login/page.tsx`:

```tsx
import NodeNetworkBg from '@/components/auth/NodeNetworkBg'
import LoginCard from '@/components/auth/LoginCard'

export default function LoginPage() {
  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <NodeNetworkBg />
      <LoginCard />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/'(auth)'/login/page.tsx
git commit -m "feat: add login page at /login route"
```

---

## Task 5: Verify in browser

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Check the login page**

Open `http://localhost:3000/login`

Expected:
- Full-screen dark gradient background
- Orange node network (left/bottom — DQ labels: Completeness, Accuracy, Governance…)
- Blue node network (right/top — AI labels: AI Engine, Anomaly Detection, Neural Network…)
- Purple bridge edges connecting the two clusters
- Small white card centered — logo, "Welcome back", email/password/role fields, Sign In + Cancel buttons

- [ ] **Step 3: Test Cancel clears form**

Type text into email, password, and select a role. Click **Cancel**. All fields should clear to empty.

- [ ] **Step 4: Test Sign In validation**

Click **Sign In** with all fields empty. Expect three inline error messages:
- "Email is required" below email
- "Password is required" below password
- "Please select a role" below role dropdown

Then fill in an invalid email (e.g. `notanemail`). Click **Sign In**. Expect:
- "Enter a valid email address" below email

- [ ] **Step 5: Test Forgot password toggle**

Click **Forgot password?**. Card should switch to reset view:
- Title: "Reset password"
- Email input + "Send reset link" button
- "← Back to login" button

Click **Send reset link** with empty email. Expect "Email is required".

Enter a valid email and click **Send reset link**. Card should show "Check your inbox for a reset link." with only the "← Back to login" button.

Click **← Back to login**. Card returns to login view with all reset state cleared.

- [ ] **Step 6: Verify existing routes are unaffected**

Navigate to `http://localhost:3000` — sidebar, tab bar, and dashboard should all display exactly as before.

- [ ] **Step 7: Final commit if any tweaks were needed**

```bash
git add -p
git commit -m "fix: login page tweaks from manual verification"
```
