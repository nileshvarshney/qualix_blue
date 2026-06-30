'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SecurityState {
  ssoEnabled: boolean
  mfaRequired: boolean
  mfaMethod: string
  minPasswordLength: number
  requireSpecialChars: boolean
  passwordRotationDays: number
  sessionTimeoutMinutes: number
  maxLoginAttempts: number
  ipWhitelist: string
  enforceRBAC: boolean
  auditLogging: boolean
  dataEncryption: boolean
  apiRateLimit: number
  columnAccessPiiMinRole: string
  columnAccessConfidentialMinRole: string
}

const DEFAULTS: SecurityState = {
  ssoEnabled: false, mfaRequired: true, mfaMethod: 'totp',
  minPasswordLength: 12, requireSpecialChars: true, passwordRotationDays: 90,
  sessionTimeoutMinutes: 480, maxLoginAttempts: 5, ipWhitelist: '',
  enforceRBAC: true, auditLogging: true, dataEncryption: true, apiRateLimit: 1000,
  columnAccessPiiMinRole: 'data_steward', columnAccessConfidentialMinRole: 'analyst',
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'data_steward', label: 'Data Steward' },
  { value: 'data_engineer', label: 'Data Engineer' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'viewer', label: 'Viewer' },
]

interface SessionAnomaly {
  id: string; user: string; user_email: string; anomaly_type: string
  timestamp: string; ip: string; severity: 'low' | 'medium' | 'high'; status: 'open' | 'resolved'; detail: string
}

// ── IP whitelist validation ────────────────────────────────────────────────────

function validateIpEntry(entry: string): boolean {
  entry = entry.trim()
  if (!entry) return true
  // IPv4/IPv6 address
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
  const ipv6Simple = /^[0-9a-fA-F:]+(\/.+)?$/
  return ipv4.test(entry) || ipv6Simple.test(entry)
}

function validateIpWhitelist(raw: string): string | null {
  if (!raw.trim()) return null
  const bad: string[] = []
  raw.split(',').forEach(e => {
    if (e.trim() && !validateIpEntry(e.trim())) bad.push(e.trim())
  })
  return bad.length ? `Invalid IP/CIDR entries: ${bad.join(', ')}` : null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none',
        background: on ? '#16a34a' : 'var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: on ? '22px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s', display: 'block',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function NumericInput({ value, onChange, min, max, unit, width = '70px' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string; width?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="number" value={value}
        onChange={e => {
          const v = parseInt(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        min={min} max={max}
        style={{
          width, padding: '7px 10px', borderRadius: '8px',
          border: '1px solid var(--border)', fontSize: '13px',
          background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center',
        }}
      />
      {unit && <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{unit}</span>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [security, setSecurity] = useState<SecurityState>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [anomalies, setAnomalies] = useState<SessionAnomaly[]>([])
  const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'unresolved' | 'high'>('unresolved')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [ipError, setIpError] = useState<string | null>(null)

  // Load from backend on mount
  useEffect(() => {
    apiFetch('/api/security', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        if (!data || Object.keys(data).length === 0) return
        setSecurity({
          ssoEnabled: data.sso_enabled === 'true',
          mfaRequired: data.mfa_required !== 'false',
          mfaMethod: data.mfa_method || 'totp',
          minPasswordLength: parseInt(data.min_password_length || '12'),
          requireSpecialChars: data.require_special_chars !== 'false',
          passwordRotationDays: parseInt(data.password_rotation_days || '90'),
          sessionTimeoutMinutes: parseInt(data.session_timeout_minutes || '480'),
          maxLoginAttempts: parseInt(data.max_login_attempts || '5'),
          ipWhitelist: data.ip_whitelist || '',
          enforceRBAC: data.enforce_rbac !== 'false',
          auditLogging: data.audit_logging !== 'false',
          dataEncryption: data.data_encryption !== 'false',
          apiRateLimit: parseInt(data.api_rate_limit || '1000'),
          columnAccessPiiMinRole: data.column_access_pii_min_role || 'data_steward',
          columnAccessConfidentialMinRole: data.column_access_confidential_min_role || 'analyst',
        })
      })
      .catch(() => { /* silently use defaults if backend unavailable */ })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const load = () =>
      apiFetch('/api/security/session-anomalies', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { anomalies: [] })
        .then(d => setAnomalies(d.anomalies ?? []))
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  async function resolveAnomaly(id: string) {
    setResolvingId(id)
    try {
      await apiFetch(`/api/security/session-anomalies/${id}/resolve`, { method: 'PATCH' })
      setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))
    } finally { setResolvingId(null) }
  }

  const set = useCallback(<K extends keyof SecurityState>(key: K, value: SecurityState[K]) => {
    setSecurity(s => ({ ...s, [key]: value }))
    if (key === 'ipWhitelist') {
      setIpError(validateIpWhitelist(value as string))
    }
  }, [])

  async function save() {
    const ipErr = validateIpWhitelist(security.ipWhitelist)
    if (ipErr) { setIpError(ipErr); return }
    setSaving(true)
    setSaveResult(null)
    try {
      const body = {
        sso_enabled: security.ssoEnabled,
        mfa_required: security.mfaRequired,
        mfa_method: security.mfaMethod,
        min_password_length: security.minPasswordLength,
        require_special_chars: security.requireSpecialChars,
        password_rotation_days: security.passwordRotationDays,
        session_timeout_minutes: security.sessionTimeoutMinutes,
        max_login_attempts: security.maxLoginAttempts,
        ip_whitelist: security.ipWhitelist,
        enforce_rbac: security.enforceRBAC,
        audit_logging: security.auditLogging,
        data_encryption: security.dataEncryption,
        api_rate_limit: security.apiRateLimit,
        column_access_pii_min_role: security.columnAccessPiiMinRole,
        column_access_confidential_min_role: security.columnAccessConfidentialMinRole,
      }
      const res = await apiFetch('/api/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setSaveResult({ ok: res.ok, msg: res.ok ? 'Settings saved successfully' : (data.detail || data.error || 'Save failed') })
    } catch {
      setSaveResult({ ok: false, msg: 'Could not reach backend' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult(null), 4000)
    }
  }

  // ── Security posture score (based on persisted state) ──────────────────────
  const secScores = {
    Authentication: security.mfaRequired ? 12 : 4,
    Session: security.sessionTimeoutMinutes <= 480 ? 8 : 3,
    'Access Control': security.enforceRBAC ? 5 : 2,
    'Data Protection': security.dataEncryption ? 16 : 5,
    'API Security': security.apiRateLimit > 0 ? 10 : 3,
    Audit: security.auditLogging ? 10 : 2,
    Compliance: security.requireSpecialChars && security.minPasswordLength >= 12 ? 6 : 2,
  }
  const secTotal = Object.values(secScores).reduce((a, b) => a + b, 0)
  const secLevel = secTotal >= 60 ? 'Strong' : secTotal >= 40 ? 'Moderate' : 'Weak'
  const secColor = secTotal >= 60 ? 'var(--status-ok-text)' : secTotal >= 40 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
  const secBg    = secTotal >= 60 ? 'var(--status-ok-bg)'   : secTotal >= 40 ? 'var(--status-warn-bg)'   : 'var(--status-error-bg)'

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '24px',
  }
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 0', borderBottom: '1px solid var(--border)',
  }
  const lastRow: React.CSSProperties = { ...row, borderBottom: 'none' }
  const label = (text: string, sub?: string) => (
    <div>
      <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>{text}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  )

  if (loading) return (
    <div style={{ padding: '28px 36px', color: 'var(--text-secondary)', fontSize: '14px' }}>
      Loading security settings...
    </div>
  )

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>Security</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ── Security Posture Score ── */}
        <div style={card}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              border: `4px solid ${secColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: '28px', fontWeight: 700, color: secColor }}>{secTotal}</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--foreground)' }}>Security Posture</span>
                <span style={{ background: secBg, color: secColor, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                  {secLevel}
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Calculated from 7 security domains based on saved configuration. Max score: 67.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(secScores).map(([key, val]) => (
              <div key={key} style={{ flex: 1, minWidth: '90px', padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  {key}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8541A' }}>+{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Session Anomaly Detection ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--foreground)' }}>Session Anomaly Detection</span>
            <span style={{ background: anomalies.filter(a => a.status === 'open').length > 0 ? 'var(--status-error-bg)' : 'var(--status-ok-bg)', color: anomalies.filter(a => a.status === 'open').length > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
              {anomalies.filter(a => a.status === 'open').length} open
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>Auto-refreshes every 60s</span>
          </div>
          {/* filter chips */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {([['all', 'All'], ['unresolved', 'Unresolved'], ['high', 'High Severity']] as const).map(([f, l]) => (
              <button key={f} onClick={() => setAnomalyFilter(f)}
                style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', cursor: 'pointer', background: anomalyFilter === f ? 'var(--foreground)' : 'var(--surface-muted)', color: anomalyFilter === f ? 'var(--background)' : 'var(--text-muted)', fontWeight: anomalyFilter === f ? 600 : 400 }}>
                {l}
              </button>
            ))}
          </div>
          {anomalies
            .filter(a => anomalyFilter === 'all' ? true : anomalyFilter === 'unresolved' ? a.status === 'open' : a.severity === 'high')
            .length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              No {anomalyFilter !== 'all' ? anomalyFilter + ' ' : ''}anomalies detected
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {anomalies
                .filter(a => anomalyFilter === 'all' ? true : anomalyFilter === 'unresolved' ? a.status === 'open' : a.severity === 'high')
                .map(a => {
                  const sevColor = a.severity === 'high' ? 'var(--status-error-text)' : a.severity === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
                  const sevBg = a.severity === 'high' ? 'var(--status-error-bg)' : a.severity === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
                  return (
                    <div key={a.id} style={{ padding: '10px 12px', border: `1px solid ${a.status === 'resolved' ? 'var(--border)' : a.severity === 'high' ? '#fca5a5' : 'var(--border)'}`, borderRadius: '8px', background: a.status === 'resolved' ? 'var(--surface-muted)' : 'var(--surface)', opacity: a.status === 'resolved' ? 0.65 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                        <span style={{ background: sevBg, color: sevColor, fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'capitalize' }}>{a.severity}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{a.anomaly_type.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.user_email}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.ip}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>{a.timestamp.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>{a.detail}</span>
                        {a.status === 'open' && (
                          <button onClick={() => resolveAnomaly(a.id)} disabled={resolvingId === a.id}
                            style={{ padding: '3px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', opacity: resolvingId === a.id ? 0.5 : 1, flexShrink: 0 }}>
                            {resolvingId === a.id ? 'Resolving…' : 'Resolve'}
                          </button>
                        )}
                        {a.status === 'resolved' && <span style={{ fontSize: '10px', color: 'var(--status-ok-text)', fontWeight: 600 }}>✓ Resolved</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* ── Authentication ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🔐</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Authentication</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Identity verification and password requirements</div>

          <div style={row}>
            {label('Single Sign-On (SSO)', 'Allow users to sign in via your configured OAuth provider')}
            <Toggle on={security.ssoEnabled} onChange={() => set('ssoEnabled', !security.ssoEnabled)} />
          </div>

          <div style={row}>
            {label('Require Multi-Factor Authentication', 'Force MFA for all users at login')}
            <Toggle on={security.mfaRequired} onChange={() => set('mfaRequired', !security.mfaRequired)} />
          </div>

          <div style={row}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>MFA Method</div>
            <select value={security.mfaMethod} onChange={e => set('mfaMethod', e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
              <option value="totp">TOTP (Authenticator app)</option>
              <option value="sms">SMS</option>
              <option value="email">Email OTP</option>
              <option value="webauthn">WebAuthn / Passkey</option>
            </select>
          </div>

          <div style={row}>
            {label('Minimum Password Length', 'Enforced on user creation and password changes')}
            <NumericInput value={security.minPasswordLength} onChange={v => set('minPasswordLength', v)} min={8} max={128} unit="chars" />
          </div>

          <div style={row}>
            {label('Require Special Characters', 'Passwords must include !@#$%^&* etc.')}
            <Toggle on={security.requireSpecialChars} onChange={() => set('requireSpecialChars', !security.requireSpecialChars)} />
          </div>

          <div style={lastRow}>
            {label('Password Rotation Period', '0 = disabled')}
            <NumericInput value={security.passwordRotationDays} onChange={v => set('passwordRotationDays', v)} min={0} max={365} unit="days" />
          </div>
        </div>

        {/* ── Session & Access ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Session & Access Control</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Session management, RBAC, and API policies</div>

          <div style={row}>
            {label('Session Timeout', 'JWT access token expiry — users re-authenticate after this period')}
            <NumericInput value={security.sessionTimeoutMinutes} onChange={v => set('sessionTimeoutMinutes', v)} min={1} max={10080} unit="minutes" width="80px" />
          </div>

          <div style={row}>
            {label('Max Login Attempts', 'Rate-limiting threshold before additional login attempts are slowed')}
            <NumericInput value={security.maxLoginAttempts} onChange={v => set('maxLoginAttempts', v)} min={1} max={100} unit="attempts" />
          </div>

          <div style={row}>
            {label('Enforce Role-Based Access Control (RBAC)', 'Domain-level data isolation by user role')}
            <Toggle on={security.enforceRBAC} onChange={() => set('enforceRBAC', !security.enforceRBAC)} />
          </div>

          <div style={row}>
            {label('Audit Logging', 'Track all user actions and data access in the audit trail')}
            <Toggle on={security.auditLogging} onChange={() => set('auditLogging', !security.auditLogging)} />
          </div>

          <div style={row}>
            {label('Data Encryption at Rest', 'Encrypt sensitive fields (API keys, passwords) stored in the platform')}
            <Toggle on={security.dataEncryption} onChange={() => set('dataEncryption', !security.dataEncryption)} />
          </div>

          <div style={lastRow}>
            {label('API Rate Limit', 'Global request rate limit per client')}
            <NumericInput value={security.apiRateLimit} onChange={v => set('apiRateLimit', v)} min={1} max={100000} unit="req/min" width="90px" />
          </div>
        </div>

        {/* ── IP Whitelist ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🌐</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>IP Whitelist</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Restrict API access to specific IP addresses or CIDR blocks. Leave empty to allow all IPs.
            Auth endpoints (/auth/login, /auth/refresh) are always exempt.
          </div>
          <textarea
            value={security.ipWhitelist}
            onChange={e => set('ipWhitelist', e.target.value)}
            placeholder="192.168.1.0/24, 10.0.0.1, 2001:db8::/32"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: `1px solid ${ipError ? '#dc2626' : 'var(--border)'}`,
              fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)',
              fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          {ipError && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>⚠</span> {ipError}
            </div>
          )}
          {!ipError && security.ipWhitelist.trim() && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--status-ok-text)' }}>
              ✓ {security.ipWhitelist.split(',').filter(e => e.trim()).length} allowed network(s) configured
            </div>
          )}
          {!security.ipWhitelist.trim() && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              All IP addresses are currently allowed.
            </div>
          )}
        </div>

        {/* ── Column-Level Access Control ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🔒</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Column-Level Access Control</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Configure the minimum role required to view profiled data (samples, top values, min/max) for columns
            tagged with sensitive classifications. Column names and types are always visible; only profiled values are masked.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              {
                key: 'columnAccessPiiMinRole' as const,
                label: 'PII / Sensitive Columns',
                desc: 'Columns tagged PII or SENSITIVE',
                badge: '#dc2626', badgeBg: '#fef2f2',
              },
              {
                key: 'columnAccessConfidentialMinRole' as const,
                label: 'Confidential / Restricted Columns',
                desc: 'Columns tagged CONFIDENTIAL or RESTRICTED',
                badge: '#d97706', badgeBg: '#fffbeb',
              },
            ].map(item => (
              <div key={item.key} style={{ padding: '16px', background: 'var(--surface-muted)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ background: item.badgeBg, color: item.badge, fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.05em' }}>
                    {item.label.split(' / ')[0].toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)', marginBottom: '2px' }}>{item.label}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>{item.desc}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px' }}>Minimum role to view profile data:</div>
                <select
                  value={security[item.key]}
                  onChange={e => set(item.key, e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '13px',
                    background: 'var(--surface)', color: 'var(--foreground)',
                  }}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '14px', padding: '12px 14px', background: 'var(--surface-muted)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--foreground)' }}>How it works:</strong> When a column has a classification tag in the data catalog,
            users whose role is below the configured minimum will see null values for profile statistics (samples, top values, min/max, mean).
            Column names, data types, and null percentages remain visible. Admins always have full access.
          </div>
        </div>

        {/* ── Row-Level Access Control ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>📋</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Row-Level Access Control</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Domain-scoped row isolation — users are automatically restricted to data assets in their assigned domain.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { role: 'Admin', desc: 'Full access to all domains', color: '#7e22ce', bg: '#fdf4ff', status: 'All data' },
              { role: 'Domain Owner', desc: 'Restricted to their assigned domain only', color: '#1d4ed8', bg: '#eff6ff', status: 'Own domain' },
              { role: 'Data Steward / Engineer', desc: 'Access to all domains they are granted', color: '#15803d', bg: '#f0fdf4', status: 'Granted domains' },
            ].map(item => (
              <div key={item.role} style={{ padding: '14px', background: item.bg, borderRadius: '10px', border: `1px solid ${item.color}30` }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: item.color, marginBottom: '4px' }}>{item.role}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>{item.desc}</div>
                <span style={{ background: item.color + '18', color: item.color, fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '12px', padding: '12px 14px', background: 'var(--surface-muted)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Domain isolation is enforced automatically via JWT claims. Assign a <strong style={{ color: 'var(--foreground)' }}>domain_id</strong> to users
            in User Management to activate row-level restrictions. This is always active and cannot be disabled — it is enforced at the API layer, not just in the UI.
          </div>
        </div>

        {/* ── Save ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={save}
            disabled={saving || !!ipError}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: saving ? '#6b7280' : ipError ? '#9ca3af' : '#2563eb',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: saving || ipError ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Security Settings'}
          </button>

          {saveResult && (
            <div style={{
              fontSize: '13px', fontWeight: 500,
              color: saveResult.ok ? 'var(--status-ok-text)' : '#dc2626',
              background: saveResult.ok ? 'var(--status-ok-bg)' : '#fef2f2',
              padding: '6px 14px', borderRadius: '8px',
            }}>
              {saveResult.ok ? '✓' : '✕'} {saveResult.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
