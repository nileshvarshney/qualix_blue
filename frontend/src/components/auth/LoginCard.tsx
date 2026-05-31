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

          <label htmlFor="login-email" style={labelStyle}>Email address</label>
          <input
            id="login-email"
            type="email"
            value={form.email}
            onChange={e => {
              setForm(f => ({ ...f, email: e.target.value }))
              setErrors(prev => ({ ...prev, email: undefined }))
            }}
            placeholder="your@email.com"
            style={fieldStyle(!!errors.email)}
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}

          <label htmlFor="login-password" style={{ ...labelStyle, marginTop: 10 }}>Password</label>
          <input
            id="login-password"
            type="password"
            value={form.password}
            onChange={e => {
              setForm(f => ({ ...f, password: e.target.value }))
              setErrors(prev => ({ ...prev, password: undefined }))
            }}
            placeholder="••••••••••••"
            style={fieldStyle(!!errors.password)}
          />
          {errors.password && <div style={errorStyle}>{errors.password}</div>}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setMode('reset')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setMode('reset')}
            style={{ fontSize: 9, color: '#2d5a9e', textAlign: 'right', marginTop: 4, cursor: 'pointer' }}
          >
            Forgot password?
          </div>

          <label htmlFor="login-role" style={{ ...labelStyle, marginTop: 10 }}>Role</label>
          <select
            id="login-role"
            value={form.role}
            onChange={e => {
              setForm(f => ({ ...f, role: e.target.value }))
              setErrors(prev => ({ ...prev, role: undefined }))
            }}
            style={fieldStyle(!!errors.role)}
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
              <label htmlFor="reset-email" style={labelStyle}>Email address</label>
              <input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={e => {
                  setResetEmail(e.target.value)
                  setResetEmailError('')
                }}
                placeholder="your@email.com"
                style={fieldStyle(!!resetEmailError)}
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

function fieldStyle(hasError: boolean): React.CSSProperties {
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
