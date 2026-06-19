'use client'
import { useState } from 'react'

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: on ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

export default function SecurityPage() {
  const [saved, setSaved] = useState(false)
  const [security, setSecurity] = useState({
    ssoEnabled: false, mfaRequired: true, mfaMethod: 'totp',
    minPasswordLength: 12, requireSpecialChars: true, passwordRotationDays: 90,
    sessionTimeoutMinutes: 480, maxLoginAttempts: 5, ipWhitelist: '',
    enforceRBAC: true, auditLogging: true, dataEncryption: true, apiRateLimit: 1000,
  })

  const secScores = {
    authentication: security.mfaRequired ? 12 : 4,
    session: security.sessionTimeoutMinutes <= 480 ? 8 : 3,
    access: security.enforceRBAC ? 5 : 2,
    dataProtection: security.dataEncryption ? 16 : 5,
    api: security.apiRateLimit > 0 ? 10 : 3,
    audit: security.auditLogging ? 10 : 2,
    compliance: security.requireSpecialChars && security.minPasswordLength >= 12 ? 6 : 2,
  }
  const secTotal = Object.values(secScores).reduce((a, b) => a + b, 0)
  const secLevel = secTotal >= 60 ? 'Strong' : secTotal >= 40 ? 'Moderate' : 'Weak'
  const secColor = secTotal >= 60 ? 'var(--status-ok-text)' : secTotal >= 40 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
  const secBg = secTotal >= 60 ? 'var(--status-ok-bg)' : secTotal >= 40 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>Security</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Security Posture Score */}
        <div style={card}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${secColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '28px', fontWeight: 700, color: secColor }}>{secTotal}</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--foreground)' }}>Security Posture</span>
                <span style={{ background: secBg, color: secColor, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{secLevel}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Calculated from 7 security domains. Higher score = stronger defenses.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap' }}>
            {Object.entries(secScores).map(([key, val]) => (
              <div key={key} style={{ flex: 1, minWidth: '100px', padding: '8px 12px', background: 'var(--surface-muted)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim().slice(0, 10)}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8541A' }}>+{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Authentication */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🔐</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Authentication</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Identity verification and password requirements</div>

          {[
            { label: 'Single Sign-On (SSO)', desc: 'Allow users to sign in via your IdP', key: 'ssoEnabled' },
            { label: 'Require Multi-Factor Authentication', desc: 'Force MFA for all users at login', key: 'mfaRequired' },
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.desc}</div>
              </div>
              <Toggle on={security[item.key as keyof typeof security] as boolean} onChange={() => setSecurity(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))} />
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>MFA Method</div>
            <select value={security.mfaMethod} onChange={e => setSecurity(s => ({ ...s, mfaMethod: e.target.value }))}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
              <option value="totp">TOTP (Authenticator app)</option>
              <option value="sms">SMS</option>
              <option value="email">Email OTP</option>
              <option value="webauthn">WebAuthn / Passkey</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Minimum Password Length</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" value={security.minPasswordLength} onChange={e => setSecurity(s => ({ ...s, minPasswordLength: parseInt(e.target.value) || 8 }))}
                style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>chars</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Require Special Characters</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Passwords must include !@#$%^&* etc.</div>
            </div>
            <Toggle on={security.requireSpecialChars} onChange={() => setSecurity(s => ({ ...s, requireSpecialChars: !s.requireSpecialChars }))} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Password Rotation Period</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" value={security.passwordRotationDays} onChange={e => setSecurity(s => ({ ...s, passwordRotationDays: parseInt(e.target.value) || 90 }))}
                style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>days</span>
            </div>
          </div>
        </div>

        {/* Access Control */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Access Control</span>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Session management and access policies</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Session Timeout</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" value={security.sessionTimeoutMinutes} onChange={e => setSecurity(s => ({ ...s, sessionTimeoutMinutes: parseInt(e.target.value) || 480 }))}
                style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>minutes</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Max Login Attempts</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" value={security.maxLoginAttempts} onChange={e => setSecurity(s => ({ ...s, maxLoginAttempts: parseInt(e.target.value) || 5 }))}
                style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>attempts</span>
            </div>
          </div>

          {[
            { label: 'Enforce Role-Based Access Control (RBAC)', desc: 'Domain-level isolation of data assets', key: 'enforceRBAC' },
            { label: 'Audit Logging', desc: 'Track all user actions and data access', key: 'auditLogging' },
            { label: 'Data Encryption at Rest', desc: 'Encrypt sensitive data stored in platform', key: 'dataEncryption' },
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.desc}</div>
              </div>
              <Toggle on={security[item.key as keyof typeof security] as boolean} onChange={() => setSecurity(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))} />
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>API Rate Limit</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input type="number" value={security.apiRateLimit} onChange={e => setSecurity(s => ({ ...s, apiRateLimit: parseInt(e.target.value) || 1000 }))}
                style={{ width: '80px', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)', color: 'var(--foreground)', textAlign: 'center' }} />
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>req/min</span>
            </div>
          </div>
        </div>

        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}
          style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
          {saved ? '✓ Saved!' : 'Save Security Settings'}
        </button>
      </div>
    </div>
  )
}
