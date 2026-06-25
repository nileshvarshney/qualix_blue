'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

const ROLES = [
  'Admin', 'Data Owner', 'Data Steward', 'Analyst',
  'Auditor', 'Business User', 'Technical User',
]

type Mode = 'login' | 'reset'
type LoginForm = { email: string; password: string; role: string }
type LoginErrors = { email?: string; password?: string; role?: string; form?: string }

export default function LoginCard({ returnUrl = '/', reason }: { returnUrl?: string; reason?: string }) {
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState<LoginForm>({ email: '', password: '', role: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetEmailError, setResetEmailError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const { login } = useAuth()
  const router = useRouter()

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }

  function handleCancel() {
    setForm({ email: '', password: '', role: '' })
    setErrors({})
  }

  function validate(): boolean {
    const e: LoginErrors = {}
    if (!form.email) {
      e.email = 'Email is required'
    } else if (!isValidEmail(form.email)) {
      e.email = 'Enter a valid email address'
    }
    if (!form.password) e.password = 'Password is required'
    if (!form.role) e.role = 'Please select a role'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSignIn() {
    if (!validate()) return
    setIsSubmitting(true)
    setErrors({})

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, role: form.role }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErrors({ form: err.detail || 'Invalid email or password' })
        return
      }

      const data = await res.json()
      login(data.access_token, data.user)
      router.replace(returnUrl)
    } catch {
      setErrors({ form: 'Connection error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleResetSubmit() {
    if (!resetEmail) {
      setResetEmailError('Email is required')
      return
    }
    if (!isValidEmail(resetEmail)) {
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
      {mode === 'login' ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>Welcome back</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>Sign in to your workspace</div>

          {reason === 'session_expired' && (
            <div style={{
              fontSize: 10, color: '#92400e',
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 6, padding: '6px 9px', marginBottom: 10,
            }}>
              Your session has expired. Please sign in again.
            </div>
          )}

          {errors.form && (
            <div style={{
              fontSize: 10, color: '#ef4444',
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 6, padding: '6px 9px', marginBottom: 10,
            }}>
              {errors.form}
            </div>
          )}

          <label htmlFor="login-email" style={labelStyle}>Email address</label>
          <input
            id="login-email"
            type="email"
            value={form.email}
            onChange={e => {
              setForm(f => ({ ...f, email: e.target.value }))
              setErrors(prev => ({ ...prev, email: undefined }))
            }}
            onBlur={e => {
              const v = e.target.value
              if (!v) {
                setErrors(prev => ({ ...prev, email: 'Email is required' }))
              } else if (!isValidEmail(v)) {
                setErrors(prev => ({ ...prev, email: 'Enter a valid email address' }))
              }
            }}
            placeholder="your@email.com"
            style={fieldStyle(!!errors.email)}
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}

          <label htmlFor="login-password" style={{ ...labelStyle, marginTop: 10 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => {
                setForm(f => ({ ...f, password: e.target.value }))
                setErrors(prev => ({ ...prev, password: undefined }))
              }}
              placeholder="••••••••••••"
              style={{ ...fieldStyle(!!errors.password), paddingRight: 32 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: '#94a3b8', display: 'flex', alignItems: 'center',
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
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

          <button onClick={handleSignIn} disabled={isSubmitting} style={{
            ...btnPrimaryStyle,
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
          <button onClick={handleCancel} disabled={isSubmitting} style={btnCancelStyle}>Cancel</button>

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
                onBlur={e => {
                  const v = e.target.value
                  if (!v) {
                    setResetEmailError('Email is required')
                  } else if (!isValidEmail(v)) {
                    setResetEmailError('Enter a valid email address')
                  }
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
