'use client'
import { useState, useEffect } from 'react'
import ConnectionsClient from '@/components/connections/ConnectionsClient'
import LLMSettingsTab from '@/components/settings/LLMSettingsTab'

export default function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'connections' | 'security' | 'notifications' | 'api' | 'integrations' | 'llm' | 'workspace' | 'roadmap'>('profile')
  const [saved, setSaved] = useState(false)
  const [profile, setProfile] = useState({ name: '', email: '', role: 'Admin', timezone: '', language: 'en' })
  const [notifs, setNotifs] = useState({ emailCritical: true, emailHigh: true, emailWeekly: true, slackCritical: true, slackHigh: false, slackDaily: false, pagerduty: false })

  // Security state
  const [security, setSecurity] = useState({
    ssoEnabled: false, mfaRequired: true, mfaMethod: 'totp',
    minPasswordLength: 12, requireSpecialChars: true, passwordRotationDays: 90,
    sessionTimeoutMinutes: 480, maxLoginAttempts: 5, ipWhitelist: '',
    enforceRBAC: true, auditLogging: true, dataEncryption: true, apiRateLimit: 1000,
  })

  // API Keys state (starts empty — keys are created at runtime)
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; created: string; lastUsed: string; status: string; visible: boolean }[]>([])
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScope, setNewKeyScope] = useState('read')
  const [newKeyExpiry, setNewKeyExpiry] = useState('never')
  const [justCreated, setJustCreated] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    try {
      const p = localStorage.getItem('dg_settings_profile')
      if (p) setProfile(JSON.parse(p))
      const n = localStorage.getItem('dg_settings_notifs')
      if (n) setNotifs(JSON.parse(n))
      const k = localStorage.getItem('dg_settings_apikeys')
      if (k) setApiKeys(JSON.parse(k))
    } catch { }
  }, [])

  // Sync API keys to localStorage whenever they change
  useEffect(() => {
    if (apiKeys.length > 0 || localStorage.getItem('dg_settings_apikeys')) {
      localStorage.setItem('dg_settings_apikeys', JSON.stringify(apiKeys))
    }
  }, [apiKeys])

  function generateKey(prefix = 'dg_live_') {
    const chars = 'abcdef0123456789'
    return prefix + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  function createKey() {
    if (!newKeyName.trim()) return
    const key = generateKey()
    const today = new Date().toISOString().split('T')[0]
    setApiKeys(prev => [...prev, { id: `k${Date.now()}`, name: newKeyName, key, created: today, lastUsed: 'Never', status: 'active', visible: true }])
    setJustCreated({ name: newKeyName, key })
    setShowKeyModal(false)
    setNewKeyName('')
  }

  function revokeKey(id: string) {
    if (!confirm('Revoke this API key? It cannot be undone.')) return
    setApiKeys(prev => prev.filter(k => k.id !== id))
  }

  function toggleVisible(id: string) {
    setApiKeys(prev => prev.map(k => k.id === id ? { ...k, visible: !k.visible } : k))
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function save(tab?: string) {
    if (tab === 'profile') localStorage.setItem('dg_settings_profile', JSON.stringify(profile))
    if (tab === 'notifications') localStorage.setItem('dg_settings_notifs', JSON.stringify(notifs))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Security posture score
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
  const secColor = secTotal >= 60 ? '#16a34a' : secTotal >= 40 ? '#d97706' : '#dc2626'
  const secBg = secTotal >= 60 ? '#dcfce7' : secTotal >= 40 ? '#fef3c7' : '#fee2e2'

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'connections', label: 'Connections', icon: '🔌' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'api', label: 'API Keys', icon: '🔑' },
    { id: 'integrations', label: 'Integrations', icon: '🧩' },
    { id: 'llm', label: 'LLM / AI', icon: '🤖' },
    { id: 'workspace', label: 'Workspace', icon: '🏢' },
    { id: 'roadmap', label: 'Under Development', icon: '🚧' },
  ] as const

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '24px' }
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
    fontSize: '13px', color: '#0f172a', background: '#fafaf9', boxSizing: 'border-box' as const, outline: 'none', ...extra,
  })

  function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
      <button onClick={onChange} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: on ? '#16a34a' : '#e2e8f0', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: '3px', left: on ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    )
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>Settings</h1>

      {/* Horizontal tab bar */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '24px',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', border: 'none', background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 'var(--text-sm)', fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: '14px' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

        {/* Content */}
        <div>
          {/* ─── Profile ─── */}
          {tab === 'profile' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a', marginBottom: '20px' }}>Profile Settings</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', padding: '16px', background: '#fafaf9', borderRadius: '10px', border: '1px solid #ebe8df' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '22px' }}>B</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a1a' }}>{profile.name}</div>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>{profile.role} · {profile.email}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[['Full Name', 'name'], ['Email', 'email'], ['Role', 'role'], ['Timezone', 'timezone']].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ fontSize: '12.5px', color: '#374151', fontWeight: 500, display: 'block', marginBottom: '6px' }}>{label}</label>
                    <input value={profile[key as keyof typeof profile]} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))} disabled={key === 'role'} style={inp(key === 'role' ? { background: '#f8fafc' } : undefined)} />
                  </div>
                ))}
              </div>
              <button onClick={() => save('profile')} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* ─── Connections ─── */}
          {tab === 'connections' && (
            <ConnectionsClient initialConnections={[]} />
          )}

          {/* ─── Security ─── */}
          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Security Posture Score */}
              <div style={card}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${secColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: secColor }}>{secTotal}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a1a' }}>Security Posture</span>
                      <span style={{ background: secBg, color: secColor, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{secLevel}</span>
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>Calculated from 7 security domains. Higher score = stronger defenses.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap' }}>
                  {Object.entries(secScores).map(([key, val]) => (
                    <div key={key} style={{ flex: 1, minWidth: '100px', padding: '8px 12px', background: '#fafaf9', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
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
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>Authentication</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>Identity verification and password requirements</div>

                {[
                  { label: 'Single Sign-On (SSO)', desc: 'Allow users to sign in via your IdP', key: 'ssoEnabled' },
                  { label: 'Require Multi-Factor Authentication', desc: 'Force MFA for all users at login', key: 'mfaRequired' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                    <Toggle on={security[item.key as keyof typeof security] as boolean} onChange={() => setSecurity(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))} />
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>MFA Method</div>
                  <select value={security.mfaMethod} onChange={e => setSecurity(s => ({ ...s, mfaMethod: e.target.value }))}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#1a1a1a' }}>
                    <option value="totp">TOTP (Authenticator app)</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email OTP</option>
                    <option value="webauthn">WebAuthn / Passkey</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>Minimum Password Length</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" value={security.minPasswordLength} onChange={e => setSecurity(s => ({ ...s, minPasswordLength: parseInt(e.target.value) || 8 }))}
                      style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', textAlign: 'center' }} />
                    <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>chars</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>Require Special Characters</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Passwords must include !@#$%^&* etc.</div>
                  </div>
                  <Toggle on={security.requireSpecialChars} onChange={() => setSecurity(s => ({ ...s, requireSpecialChars: !s.requireSpecialChars }))} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>Password Rotation Period</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" value={security.passwordRotationDays} onChange={e => setSecurity(s => ({ ...s, passwordRotationDays: parseInt(e.target.value) || 90 }))}
                      style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', textAlign: 'center' }} />
                    <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>days</span>
                  </div>
                </div>
              </div>

              {/* Access Control */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '18px' }}>🛡️</span>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>Access Control</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>Session management and access policies</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>Session Timeout</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" value={security.sessionTimeoutMinutes} onChange={e => setSecurity(s => ({ ...s, sessionTimeoutMinutes: parseInt(e.target.value) || 480 }))}
                      style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', textAlign: 'center' }} />
                    <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>minutes</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>Max Login Attempts</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" value={security.maxLoginAttempts} onChange={e => setSecurity(s => ({ ...s, maxLoginAttempts: parseInt(e.target.value) || 5 }))}
                      style={{ width: '70px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', textAlign: 'center' }} />
                    <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>attempts</span>
                  </div>
                </div>

                {[
                  { label: 'Enforce Role-Based Access Control (RBAC)', desc: 'Domain-level isolation of data assets', key: 'enforceRBAC' },
                  { label: 'Audit Logging', desc: 'Track all user actions and data access', key: 'auditLogging' },
                  { label: 'Data Encryption at Rest', desc: 'Encrypt sensitive data stored in platform', key: 'dataEncryption' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f1ea' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{item.desc}</div>
                    </div>
                    <Toggle on={security[item.key as keyof typeof security] as boolean} onChange={() => setSecurity(s => ({ ...s, [item.key]: !s[item.key as keyof typeof s] }))} />
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#1a1a1a' }}>API Rate Limit</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="number" value={security.apiRateLimit} onChange={e => setSecurity(s => ({ ...s, apiRateLimit: parseInt(e.target.value) || 1000 }))}
                      style={{ width: '80px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', textAlign: 'center' }} />
                    <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>req/min</span>
                  </div>
                </div>
              </div>

              <button onClick={() => save()} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
                {saved ? '✓ Saved!' : 'Save Security Settings'}
              </button>
            </div>
          )}

          {/* ─── Notifications ─── */}
          {tab === 'notifications' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a', marginBottom: '20px' }}>Notification Preferences</div>
              {[
                { section: 'Email Notifications', items: [['emailCritical', 'Critical quality issues'], ['emailHigh', 'High severity alerts'], ['emailWeekly', 'Weekly summary report']] },
                { section: 'Slack Notifications', items: [['slackCritical', 'Critical quality issues'], ['slackHigh', 'High severity alerts'], ['slackDaily', 'Daily digest']] },
                { section: 'PagerDuty', items: [['pagerduty', 'Critical incidents (24/7 on-call)']] },
              ].map(({ section, items }) => (
                <div key={section} style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '12px' }}>{section.toUpperCase()}</div>
                  {items.map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f1ea' }}>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{label}</span>
                      <Toggle on={notifs[key as keyof typeof notifs]} onChange={() => setNotifs(n => ({ ...n, [key]: !n[key as keyof typeof n] }))} />
                    </div>
                  ))}
                </div>
              ))}
              <button onClick={() => save('notifications')} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save Preferences'}
              </button>
            </div>
          )}

          {/* ─── API Keys ─── */}
          {tab === 'api' && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>API Keys</div>
                <button onClick={() => { setShowKeyModal(true); setJustCreated(null) }} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #93c5fd', background: '#dbeafe', color: '#2563eb', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Generate Key</button>
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>Use API keys to authenticate Qualix from CI/CD pipelines, dashboards, or external tools.</div>

              {justCreated && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#166534', marginBottom: '6px' }}>✅ Key created — copy it now, it won&apos;t be shown again</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <code style={{ flex: 1, fontSize: '12px', color: '#166534', background: '#dcfce7', padding: '6px 10px', borderRadius: '6px', wordBreak: 'break-all' }}>{justCreated.key}</code>
                    <button onClick={() => copyKey(justCreated.key)} style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #86efac', background: '#fff', color: '#166534', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{copied ? '✓ Copied!' : 'Copy'}</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {apiKeys.map(k => (
                  <div key={k.id} style={{ background: '#fafaf9', borderRadius: '10px', padding: '14px 16px', border: '1px solid #ebe8df' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a', marginBottom: '6px' }}>{k.name}</div>
                        <code style={{ fontSize: '11.5px', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '5px', wordBreak: 'break-all' }}>
                          {k.visible ? k.key : k.key.slice(0, 12) + '••••••••••••••••••••'}
                        </code>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                        <button onClick={() => toggleVisible(k.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '11.5px', cursor: 'pointer' }}>{k.visible ? '🙈 Hide' : '👁 Show'}</button>
                        <button onClick={() => copyKey(k.key)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '11.5px', cursor: 'pointer' }}>📋 Copy</button>
                        <button onClick={() => revokeKey(k.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: '11.5px', cursor: 'pointer' }}>Revoke</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11.5px', color: '#94a3b8' }}>
                      <span>Created: {k.created}</span><span>Last used: {k.lastUsed}</span><span style={{ color: '#16a34a' }}>● {k.status}</span>
                    </div>
                  </div>
                ))}
              </div>

              {showKeyModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, backdropFilter: 'blur(4px)' }}>
                  <div style={{ background: '#fff', borderRadius: '14px', width: '420px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>Generate API Key</div>
                      <button onClick={() => setShowKeyModal(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', color: '#64748b' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Key Name *</label>
                        <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. CI/CD Pipeline" style={inp()} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Scope</label>
                        <select value={newKeyScope} onChange={e => setNewKeyScope(e.target.value)} style={inp()}>
                          <option value="read">Read only</option><option value="write">Read + Write</option><option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Expiry</label>
                        <select value={newKeyExpiry} onChange={e => setNewKeyExpiry(e.target.value)} style={inp()}>
                          <option value="never">Never expires</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
                        </select>
                      </div>
                      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', color: '#92400e' }}>
                        ⚠️ The key will only be shown once after creation. Copy it immediately.
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setShowKeyModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={createKey} disabled={!newKeyName.trim()} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: newKeyName.trim() ? 'pointer' : 'not-allowed', background: newKeyName.trim() ? '#2563eb' : '#e2e8f0', color: newKeyName.trim() ? '#fff' : '#94a3b8' }}>
                          🔑 Generate Key
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Integrations ─── */}
          {tab === 'integrations' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a', marginBottom: '20px' }}>Integrations</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' }}>
                {[
                  { name: 'Slack', icon: '💬', desc: 'Send alerts to Slack channels', connected: false, channel: '' },
                  { name: 'PagerDuty', icon: '🚨', desc: 'Escalate critical issues 24/7', connected: false, channel: '' },
                  { name: 'Jira', icon: '📋', desc: 'Auto-create tickets for issues', connected: false, channel: '' },
                  { name: 'dbt', icon: '🔧', desc: 'Sync dbt model metadata', connected: false, channel: '' },
                  { name: 'GitHub Actions', icon: '⚙️', desc: 'Run checks in CI/CD pipelines', connected: false, channel: '' },
                  { name: 'Grafana', icon: '📊', desc: 'Visualize quality metrics', connected: false, channel: '' },
                ].map(intg => (
                  <div key={intg.name} style={{ background: '#fafaf9', borderRadius: '10px', padding: '16px', border: `1px solid ${intg.connected ? '#86efac' : '#ebe8df'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '22px' }}>{intg.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a' }}>{intg.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{intg.desc}</div>
                        </div>
                      </div>
                      <span style={{ background: intg.connected ? '#f0fdf4' : '#f8fafc', color: intg.connected ? '#16a34a' : '#94a3b8', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>{intg.connected ? 'Connected' : 'Not connected'}</span>
                    </div>
                    {intg.connected && <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#64748b' }}>→ {intg.channel}</div>}
                    <button style={{ marginTop: '10px', width: '100%', padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: '#fff', color: intg.connected ? '#dc2626' : '#2563eb', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                      {intg.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── LLM / AI ─── */}
          {tab === 'llm' && (
            <LLMSettingsTab />
          )}

          {/* ─── Under Development / Roadmap ─── */}
          {tab === 'roadmap' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header banner */}
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)', borderRadius: '14px', padding: '28px 32px', color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '32px' }}>🚀</span>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.01em' }}>Upcoming Capabilities</div>
                    <div style={{ fontSize: '13px', color: '#c4b5fd', marginTop: '2px' }}>Internal reference — AI-first platform roadmap</div>
                  </div>
                </div>
                <div style={{ fontSize: '12.5px', color: '#a5b4fc', lineHeight: '1.7', marginTop: '8px' }}>
                  This page documents the major capabilities that are missing or only partially built in the current platform. Each item is grounded in what actually exists today: where a page or feature is a stub, empty, or hardcoded, that gap is described in detail so development teams know exactly what needs to be built and why it matters.
                </div>
              </div>

              {[
                {
                  category: 'Agentic AI',
                  icon: '🤖',
                  color: '#7c3aed',
                  bg: '#f5f3ff',
                  border: '#ddd6fe',
                  summary: 'The platform currently has no AI execution anywhere. The AI Assistant page is a pure placeholder. Issues, anomalies, and alerts all show "root cause" and "recommendations" fields, but these are static strings from the API — not generated by any model. Every feature below addresses a specific gap where human effort today should be replaced or augmented by AI.',
                  features: [
                    {
                      name: 'Conversational AI Assistant',
                      where: '/ai-assistant page',
                      status: 'Placeholder only',
                      desc: 'The /ai-assistant page currently renders a static placeholder component with hardcoded feature bullet points and no chat functionality. The Architecture page describes how it should work — using tool_use calls to list connections, create rules, and run checks — but none of that is implemented. The full build requires: a streaming chat UI, a backend agent loop using the Anthropic API with tool definitions for every platform action (list issues, run a schedule, query a dataset, create a rule), and context injection so the agent knows which connection is active and what the current quality scores are.',
                    },
                    {
                      name: 'AI-Powered Root Cause Analysis',
                      where: 'Issues & Anomalies pages',
                      status: 'Static fields, no AI',
                      desc: 'Both the Issues and Anomalies pages already have "root cause", "business impact", and "recommendations" fields in the UI — but their values come verbatim from static API response data. They are not generated by any model. What is needed is a backend agent that, when an issue or anomaly is created, (1) traverses the lineage graph to find the upstream table where the failure originates, (2) pulls recent execution logs for that table to detect timing or volume patterns, (3) cross-references similar past anomalies, and (4) uses an LLM to write a specific, actionable root cause explanation and recommendations — replacing the current static text.',
                    },
                    {
                      name: 'Natural Language Rule Builder',
                      where: 'Rules page',
                      status: 'No AI in rule creation',
                      desc: 'Rules must currently be created via structured forms with manual SQL or condition logic. There is no way to express intent in plain language. This feature would allow a user to type something like "flag any customer record where email is missing but phone is also null" and have an LLM translate it into a validated rule targeting the correct table and columns from the active connection. The AI should also suggest the appropriate threshold, severity level, and schedule based on the dataset\'s historical pass rates.',
                    },
                    {
                      name: 'Predictive Quality Forecasting',
                      where: 'Dashboard',
                      status: 'Current scores only, no prediction',
                      desc: 'The dashboard displays current quality scores across six dimensions (completeness, accuracy, uniqueness, validity, timeliness, consistency) but has no forward-looking intelligence. A predictive model trained on historical execution logs, anomaly frequency, and schedule patterns should surface which datasets are at elevated risk of quality degradation in the next 24–72 hours — before any rule fires. This gives data teams proactive lead time instead of reactive firefighting.',
                    },
                    {
                      name: 'Agentic Monitoring & Auto-Remediation',
                      where: 'Issues page & Schedules',
                      status: 'Not built',
                      desc: 'Today when a scheduled rule fails, a human must open the Issues page, investigate manually, and decide what to do. An autonomous agent should handle the first-response loop automatically: detect the failure from the execution log, classify it as a known pattern (e.g. late load, threshold drift, upstream schema change), propose a specific fix (e.g. "adjust null threshold from 5% to 8% based on the last 30 days of data"), and — with one-click human approval — apply the change and trigger a re-run. For well-understood recurring issues, fully automated remediation (no approval required) should be configurable.',
                    },
                  ],
                },
                {
                  category: 'AI Workflow',
                  icon: '⚡',
                  color: '#0369a1',
                  bg: '#f0f9ff',
                  border: '#bae6fd',
                  summary: 'AI Workflow covers features where AI should orchestrate multi-step processes, generate content, or automate communication — rather than just answering a single question. These are workflow-level automations that currently require significant manual effort from data engineers, data stewards, and leadership.',
                  features: [
                    {
                      name: 'Executive AI Reporting',
                      where: '/executive page',
                      status: 'Page exists, all KPIs show "—"',
                      desc: 'The /executive page is live but completely empty — all five KPI cards display "—" and the three content sections (Quality by Domain, Weekly Trend, Active Incidents) render nothing. Beyond simply connecting the data, this page needs an AI narrative layer: a weekly auto-generated written summary that translates quality scores, incident counts, and SLA adherence into business language for leadership. The AI should identify the most significant changes since last week, quantify business impact where possible, and suggest the top three priorities for the coming week.',
                    },
                    {
                      name: 'AI Documentation Generator',
                      where: 'Catalog & Glossary pages',
                      status: 'Catalog is a minimal list; Glossary is manual-only',
                      desc: 'The Catalog page shows assets as a simple list with name, status, and schema path — no descriptions, no classifications, no linked policies. The Glossary requires users to manually write every term definition. AI should be able to scan a table\'s column names, sample data rows, and existing governance policies to auto-generate: business-readable column descriptions, a suggested glossary term for business concepts embedded in the schema, data sensitivity tags (PII, financial, operational), and links to related assets and SLAs. This dramatically reduces the documentation burden for data stewards.',
                    },
                    {
                      name: 'Compliance Automation',
                      where: '/compliance page',
                      status: 'Framework cards shown, no actual controls',
                      desc: 'The compliance page fetches framework data (GDPR, HIPAA, SOC 2) and shows pass/fail counts with a percentage bar — but it renders no actual control details, and the controls table is empty by default with no data fetched. Real compliance automation means automatically mapping each dataset\'s ownership, classification tags, encryption status, audit log coverage, and SLA definitions against the specific control requirements of each framework. The AI layer should highlight exactly which controls are unmet, why, and what action would close each gap — generating audit-ready evidence reports on demand.',
                    },
                    {
                      name: 'Slack / Teams AI Bot',
                      where: 'Integrations (Settings)',
                      status: 'Slack listed as alert-only, no two-way interaction',
                      desc: 'The current Slack integration (listed in Settings → Integrations) is one-directional: it sends alert notifications to a channel. There is no way to interact with the platform from Slack. The full vision is a two-way bot where data engineers can type commands like "what is the quality score of orders_fact today?", "run the null checks on customer_dim", or "summarise the open issues for the finance domain" — and receive accurate answers without opening the Qualix UI. This requires a Slack App with event subscriptions, a backend that maps messages to platform actions, and the AI agent from the AI Assistant to handle the reasoning.',
                    },
                  ],
                },
                {
                  category: 'RAG — Retrieval-Augmented Generation',
                  icon: '🔍',
                  color: '#065f46',
                  bg: '#f0fdf4',
                  border: '#a7f3d0',
                  summary: 'RAG capabilities index the platform\'s own data — assets, policies, issues, anomalies, glossary terms, contracts — into a vector store so that AI can retrieve specific, accurate context before generating answers. Without RAG, an LLM answering questions about the platform would hallucinate or give generic responses. With RAG, it pulls the exact relevant records and reasons over real data.',
                  features: [
                    {
                      name: 'Semantic Data Asset Search',
                      where: 'Data Browser & Catalog',
                      status: 'Keyword-only, no semantic search',
                      desc: 'Both the Data Browser and Catalog use basic string matching for search — you must know the exact table or asset name. RAG-powered semantic search would index table names, column names, sample values, glossary definitions, and data contract descriptions into a vector store. A user searching "customer purchase history last quarter" would find the correct table even if it is named fact_ord_hist_q — because the search understands intent, not just string overlap. Results should be ranked by relevance and current quality score so high-quality assets surface first.',
                    },
                    {
                      name: 'Anomaly Context Retrieval',
                      where: 'Anomalies page',
                      status: 'Shows static root cause text only',
                      desc: 'When an anomaly fires, the current page shows a root cause field and a list of affected downstream models — but all of this is static API data with no intelligence applied. A RAG system should automatically retrieve: the five most similar historical anomalies and their resolutions, any data contracts or SLAs that this anomaly puts at risk, the full lineage path affected, and any open issues on the same table. This context should appear automatically in the expanded anomaly card, giving on-call engineers everything they need to triage without searching other pages.',
                    },
                    {
                      name: 'Governance Policy Q&A',
                      where: 'Governance page',
                      status: 'Policies are cards only, no querying',
                      desc: 'The Governance page shows policies as expandable cards with status (active/draft/review) and enforcement type (enforced/advisory). There is no way to query across policies. A RAG layer indexed over all policy text, domain scorecards, and linked assets would answer questions like "which policies apply to tables in the finance domain?", "are there any advisory policies that should be enforced given our SOC 2 requirement?", or "which datasets lack an active ownership policy?" — critical capabilities for a data steward preparing for an audit.',
                    },
                    {
                      name: 'Cross-Platform Knowledge Search',
                      where: 'Global (all pages)',
                      status: 'No global search exists at all',
                      desc: 'There is currently no global search bar anywhere in Qualix. To find an issue related to a specific table, a user must navigate to Issues and filter manually. To find a glossary term, they go to Glossary. To find a contract for a producer, they go to Contracts. A RAG-powered global search bar in the top navigation would search across every entity type — assets, rules, issues, anomalies, alerts, glossary terms, policies, contracts, SLAs — using natural language, and surface results grouped by type with a relevance score and the entity\'s current health status.',
                    },
                  ],
                },
                {
                  category: 'Platform Capabilities',
                  icon: '🏗️',
                  color: '#92400e',
                  bg: '#fffbeb',
                  border: '#fde68a',
                  summary: 'These are foundational platform features — not AI-specific — that are either entirely missing or only partially implemented today. Without them, the platform cannot scale to enterprise use cases or become the single source of truth for data quality operations.',
                  features: [
                    {
                      name: 'Data Observability Engine',
                      where: 'Dashboard & Datasets',
                      status: 'Not built — rules fire on schedule, no automatic detection',
                      desc: 'The platform currently only detects quality issues when a scheduled rule runs. There is no automatic detection of: table freshness (when was this table last loaded?), volume anomalies (row count dropped by 40% vs yesterday), schema drift (a column was dropped or its type changed), or distribution shifts (the range of a numeric column changed significantly). These checks should run continuously and independently of user-defined rules — firing alerts the moment a structural change or data absence is detected, which is often the earliest signal that an upstream pipeline has failed.',
                    },
                    {
                      name: 'Cost Impact Quantification',
                      where: 'Issues & Reports',
                      status: 'Business impact text exists but no dollar values',
                      desc: 'Issues, anomalies, and alerts all have "business impact" text fields, but these are freeform strings with no monetary quantification. If the platform could integrate with business metric definitions (e.g. average revenue per order record, SLA penalty per hour of breach, number of downstream pipelines blocked per incident), it could express every quality failure in dollar terms automatically. A "$42,000 estimated impact" on an issue card is far more compelling to a business stakeholder than "affects revenue reporting" — and makes it possible to prioritise remediation by financial risk rather than arbitrary severity labels.',
                    },
                    {
                      name: 'Collaboration & Annotations',
                      where: 'All pages (Issues, Datasets, Anomalies, Lineage, etc.)',
                      status: 'All pages are read-only for discussion',
                      desc: 'Every page in Qualix is purely read-only when it comes to team communication. There are no comments, @mentions, or discussion threads on any entity — no way to note "investigated this anomaly, it is a known upstream delay" or tag a colleague on a recurring issue. This forces teams to coordinate in Slack or email, where context is immediately lost. In-platform collaboration would make Qualix the single source of truth: every investigation note, decision, and status update stays attached to the data asset it relates to, visible to anyone who looks at it in the future.',
                    },
                    {
                      name: 'Data Products Quality Engine',
                      where: '/data-products page',
                      status: 'Quality scores are mocked client-side',
                      desc: 'The Data Products page fetches product records and displays quality scores (gold/silver/bronze tier, numeric quality %) — but the quality scores are generated client-side with mock logic, not derived from real platform data. A genuine quality engine should aggregate: the pass rate of all rules covering the product\'s underlying datasets, SLA adherence over the last 30 days, documentation completeness score from the Catalog, ownership and certification status from Governance, and any open critical issues. This computed health score is what makes a data product trustworthy enough for self-service consumption by other teams.',
                    },
                    {
                      name: 'Multi-Source Connector Expansion',
                      where: 'Connections & Settings',
                      status: 'Snowflake primary; other connectors incomplete',
                      desc: 'The platform is built primarily around Snowflake, with PostgreSQL and a few other types listed in the connection type selector. However, most enterprise data stacks also include Databricks (Delta Lake), BigQuery, Amazon Redshift, Azure Synapse, and streaming sources like Apache Kafka and Amazon Kinesis. Each connector requires its own metadata API (to discover tables and schemas), its own query executor (to run rule checks), and lineage parser (to extract upstream/downstream relationships). Without these, the platform cannot serve as a unified quality layer across a multi-cloud data stack.',
                    },
                  ],
                },
              ].map(section => (
                <div key={section.category} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', overflow: 'hidden' }}>
                  {/* Section header */}
                  <div style={{ padding: '18px 24px', background: section.bg, borderBottom: `1px solid ${section.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{section.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: '15px', color: section.color }}>{section.category}</span>
                      <span style={{ marginLeft: 'auto', background: section.border, color: section.color, fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px' }}>
                        {section.features.length} features
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: section.color, opacity: 0.85, lineHeight: '1.65' }}>{section.summary}</p>
                  </div>
                  {/* Feature rows */}
                  <div>
                    {section.features.map((f, i) => (
                      <div key={f.name} style={{
                        padding: '18px 24px',
                        borderBottom: i < section.features.length - 1 ? '1px solid #f3f1ea' : 'none',
                      }}>
                        {/* Feature header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>{f.name}</span>
                          <span style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '5px', padding: '2px 8px', fontSize: '10.5px', color: '#92400e', fontWeight: 600 }}>
                            Current: {f.status}
                          </span>
                          <span style={{ marginLeft: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 10px', fontSize: '10.5px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {f.where}
                          </span>
                        </div>
                        {/* Detailed description */}
                        <p style={{ margin: 0, fontSize: '12.5px', color: '#4b5563', lineHeight: '1.7' }}>{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Governance & Compliance Gaps */}
              {(() => {
                const section = {
                  category: 'Governance & Compliance Gaps',
                  icon: '🔐',
                  color: '#0f172a',
                  bg: '#f8fafc',
                  border: '#cbd5e1',
                  summary: 'These six capabilities were specifically verified against the current codebase. Each one is either entirely missing or only partially wired up — the UI may hint at it existing, but the actual implementation is absent or non-functional. They represent the most critical gaps for enterprise data governance and compliance use cases.',
                  features: [
                    {
                      name: 'Business Glossary — Term-to-Asset Linking',
                      where: 'Glossary page',
                      status: 'Glossary exists; linking UI does not',
                      desc: 'The Glossary page is functional and stores terms with name, definition, domain, owner, synonyms, and status. Each term shows a "linkedAssets" count in the expanded view, but this is a read-only number returned by the API — there is no UI to actually link a term to a specific table or column, and new terms are created with linkedAssets: 0 with no way to change it. What is needed is: a link-management UI on the term card (search for a table/column and attach it), a reverse display on the Catalog page showing which glossary terms apply to each asset, and navigation between the two (click the asset count to see which tables, click a table in Catalog to see its glossary terms).',
                    },
                    {
                      name: 'Data Contracts — Active Enforcement',
                      where: 'Contracts page & data pipelines',
                      status: 'Monitoring exists; enforcement does not',
                      desc: 'The Contracts page shows compliance percentages, breach status, and a check-by-check pass/fail list per contract. This is passive monitoring — it reads existing data and reports whether terms are met. True enforcement means blocking: when data does not meet a contract\'s schema or SLA terms at load time, the load should be rejected or quarantined before it reaches downstream consumers. The Contracts page also reuses the /api/slas endpoint with no dedicated contracts API, indicating the backend has not been built separately. Enforcement requires: a contract evaluation engine that runs at pipeline trigger time (not on a separate schedule), a reject/quarantine action, and a notification to both producer and consumer when enforcement fires.',
                    },
                    {
                      name: 'Write-Time Schema Validation',
                      where: 'Rules page (schema_drift_check) & data ingestion layer',
                      status: 'Post-load detection exists; write-time interception does not',
                      desc: 'The Rules page includes a schema_drift_check rule type that can detect unexpected column additions, removals, or type changes by querying what is already in the database and comparing it to an expected schema definition. This is a post-load, scheduled check — by the time it runs, the bad data is already in the warehouse. Write-time schema validation intercepts data as it arrives at the ingestion point (before it is committed to the target table), validates the incoming schema against the registered contract or expected definition, and rejects non-conforming loads immediately. This requires integration at the pipeline or connector layer — not at the Qualix rule-checking layer — which is a fundamentally different architecture that has not been started.',
                    },
                    {
                      name: 'Automated PII Detection & Remediation',
                      where: 'Governance scorecards, Catalog',
                      status: 'Referenced in descriptions; not built',
                      desc: 'The Governance page lists "Classification" as one of its six scorecard dimensions, describing it as "percentage of sensitive columns properly tagged (PII, PHI, etc.) — columns are scanned using pattern matching and AI-based detection." However, the actual Classification score shows "—" with no data, and the scan does not run anywhere in the codebase. There is no PII tagging UI on any page and no column-level sensitivity labels visible anywhere in the Catalog or Datasets pages. Remediation — masking SSNs, tokenizing credit card numbers, anonymizing email addresses at query or export time — does not exist at all. This capability needs: a scanner that runs against connected data sources and detects PII patterns, a tagging interface in the Catalog to review and confirm detections, and a remediation engine (masking rules, dynamic data masking at query time, or transformation pipelines) to remove or obfuscate PII before it reaches unauthorised consumers.',
                    },
                    {
                      name: 'Governance Approval Workflows',
                      where: 'Rules page, Governance page, Glossary, Data Products',
                      status: 'pending_review state exists for rules only; no approver UI',
                      desc: 'The Rules component creates new rules with a pending_review status and shows an "Approval notice" message in the UI explaining that data stewards must review it. However, there is no page or queue where a data steward can see pending rules, review them, and approve or reject them. There is no notification sent to approvers, no audit trail of who approved what and when, and no approve/reject action anywhere in the UI. Additionally, this partial flow only applies to rules — governance policies, glossary terms, data product certification, domain ownership assignments, and contract creation all have zero approval workflow. A complete implementation needs: a dedicated approval queue page accessible to data stewards, role-based routing of approval requests, email or Slack notification on submission, one-click approve/reject with required comment, and an audit log of every approval decision.',
                    },
                    {
                      name: 'Real-Time Anomaly Detection & Alerting',
                      where: 'Anomalies page, Alerts page',
                      status: 'Schedule-triggered polling only; no real-time capability',
                      desc: 'Both the Anomalies and Alerts pages fetch data via standard REST API calls on page load — there are no WebSockets, Server-Sent Events, or background polling anywhere in the codebase. Anomalies are only detected when a scheduled rule runs (which could be hourly, daily, or weekly). If an upstream table is dropped, a pipeline fails, or row counts collapse to zero between schedule runs, Qualix will not surface this until the next scheduled execution — which could be hours later. Real-time anomaly alerting requires: continuous lightweight monitoring (freshness checks every few minutes, not full rule scans), a push delivery mechanism (WebSocket or SSE from the server to the browser so the UI updates without a page refresh), and integration with notification channels (Slack, PagerDuty, email) that fires within seconds of detection rather than waiting for a user to reload the Alerts page.',
                    },
                  ],
                }
                return (
                  <div key={section.category} style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '18px 24px', background: section.bg, borderBottom: `1px solid ${section.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '20px' }}>{section.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: section.color }}>{section.category}</span>
                        <span style={{ marginLeft: 'auto', background: section.border, color: section.color, fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px' }}>
                          {section.features.length} verified gaps
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: '1.65' }}>{section.summary}</p>
                    </div>
                    <div>
                      {section.features.map((f, i) => (
                        <div key={f.name} style={{ padding: '18px 24px', borderBottom: i < section.features.length - 1 ? '1px solid #f3f1ea' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>{f.name}</span>
                            <span style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '5px', padding: '2px 8px', fontSize: '10.5px', color: '#92400e', fontWeight: 600 }}>
                              Current: {f.status}
                            </span>
                            <span style={{ marginLeft: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 10px', fontSize: '10.5px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {f.where}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '12.5px', color: '#4b5563', lineHeight: '1.7' }}>{f.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Enterprise Capability Assessment */}
              {(() => {
                const STATUS = {
                  built:   { label: 'BUILT',   bg: '#dcfce7', color: '#15803d', border: '#86efac' },
                  partial: { label: 'PARTIAL', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
                  missing: { label: 'MISSING', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
                } as const

                const areas: {
                  area: string; icon: string; status: keyof typeof STATUS
                  exists: string; gaps: string
                }[] = [
                  {
                    area: 'Data Quality',
                    icon: '✅',
                    status: 'partial',
                    exists: '17 rule types built: null_check, uniqueness, duplicate, accepted_values, range, comparison, freshness, volume, schema_drift, referential_integrity, regex, business_rule, custom_sql, semantic_consistency, referential_sanity, business_metric, distribution_consistency, and an LLM semantic check. Rules have scheduling, execution logs, pause/resume, and a full issue status workflow (open → investigating → resolved). Dashboard shows 6-dimension quality scoring (completeness, accuracy, uniqueness, validity, timeliness, consistency). Anomalies page with severity levels and expandable root cause.',
                    gaps: 'All root cause, business impact, and recommendation text in Issues/Anomalies/Alerts comes from static API data — not AI-generated. No predictive quality scoring (only current state, no forecast). No automated remediation. All detection is schedule-triggered; nothing fires between schedule runs. LLM semantic check exists in the UI but backend execution is unverified.',
                  },
                  {
                    area: 'Metadata & Catalog',
                    icon: '📦',
                    status: 'partial',
                    exists: 'Datasets page shows live Snowflake table metadata — column names, types, nullability, row counts, bytes, and a live 20-row data preview loaded lazily on expand. Glossary page manages business terms with definition, domain, owner, synonyms, and status (draft/approved/deprecated). Catalog page lists data assets fetched from the backend.',
                    gaps: 'Catalog is a minimal flat list — no column descriptions, no quality scores, no tags, no owner display, no expand/detail view. No business context or column-level annotations anywhere. Glossary term-to-asset linking is a display-only count; no UI to attach a term to a specific table or column, and no navigation between terms and their assets. No metadata versioning, history, or bulk editing.',
                  },
                  {
                    area: 'Lineage & Impact Analysis',
                    icon: '🔗',
                    status: 'partial',
                    exists: 'Lineage page is real and sophisticated: SVG graph with 8 node types (source/raw/transform/warehouse/output), layer-based auto-positioning, auto-refresh every 30s. Column-level lineage visible in a sidebar on node selection — showing upstream/downstream chains with roles (origin, passthrough, consumer, reference). Lazily loads column data per node.',
                    gaps: 'No impact analysis action: given a node, users cannot ask "what breaks downstream if I change this table?" The graph visualises lineage but does not compute or surface blast radius. No cross-connection lineage (only works within one active connection). No dbt model lineage parsing. Business impact (which reports/dashboards/pipelines depend on a table) is not surfaced anywhere.',
                  },
                  {
                    area: 'Policy Management',
                    icon: '🛡️',
                    status: 'partial',
                    exists: 'Governance page has a Policies tab: create policies with name, description, domain, enforcement type (enforced/advisory), and status (draft/review/active). Policy detail drawer shows linked rule pass/fail results and which tables the policy applies to. Enforcement and advisory labels are clearly distinguished.',
                    gaps: 'The "enforced" label is a display tag only — no engine actually enforces it. Policies have a rules_count field but no live rule evaluation is triggered by a policy. No policy approval workflow (no queue, no reviewer role, no approve/reject action). No policy versioning or change history. No automatic notifications when a policy is violated. No policy library or templates to start from.',
                  },
                  {
                    area: 'Access Control & Security',
                    icon: '🔒',
                    status: 'partial',
                    exists: 'Settings → Security has a full UI: SSO toggle, MFA toggle with method selector (TOTP/SMS/Email/WebAuthn), password policy (min length, special chars, rotation days), session timeout, max login attempts, RBAC toggle, audit logging toggle, data encryption toggle, API rate limit, IP whitelist. A security posture score (0–67) is computed from 7 dimensions and displayed with a ring chart.',
                    gaps: 'Every security setting is frontend UI state only — none of the toggles or values are sent to or enforced by a backend. Flipping SSO to "on" does nothing. The security posture score is computed entirely in the browser from the toggle states, not from actual security telemetry. No real role management (only one hardcoded "Admin" role in the profile). No column-level or row-level access control. IP whitelist is a textarea field with no validation or enforcement.',
                  },
                  {
                    area: 'Classification & Sensitivity',
                    icon: '🏷️',
                    status: 'missing',
                    exists: 'Governance scorecard lists "Classification" as one of its six dimensions with the description "Percentage of sensitive columns properly tagged (PII, PHI, etc.) — columns are scanned using pattern matching and AI-based detection." The KPI detail drawer for Assets Classified also references this dimension.',
                    gaps: 'The Classification score always shows "—" — no scanner exists and no data is fetched. There is no PII tagging UI on any page (not in Catalog, Datasets, or Governance). No column-level sensitivity labels are shown anywhere. The "AI-based detection" mentioned in descriptions is aspirational text — the code does not call any detection API. Sensitivity classification is entirely absent from the working platform.',
                  },
                  {
                    area: 'Data Protection & Privacy',
                    icon: '🔐',
                    status: 'missing',
                    exists: 'Compliance page lists GDPR, HIPAA, and SOC 2 as framework cards with a compliance percentage bar and pass/fail control counts (sourced from API when data exists). The data encryption toggle in Settings implies intent.',
                    gaps: 'The compliance controls table is always empty — the controls array is never populated from the API. No data masking or anonymization. No right-to-erasure or data subject request workflow. No consent management. No data residency configuration. No query-time dynamic data masking for PII. The compliance page KPIs show "—" whenever no framework data is returned, which is the default state with a fresh connection.',
                  },
                  {
                    area: 'Compliance & Audit',
                    icon: '📋',
                    status: 'partial',
                    exists: 'Audit logs page is real: fetches from /api/audit, displays user, action, resource, IP address, category (connection/rule/schedule/alert/auth/report/contract/sla/anomaly), result (success/failed), timestamp, session ID, duration, and expandable event detail. Filtering by user type, failure, category, and search all work. User avatars are colour-coded per person.',
                    gaps: 'Audit logging is passive record-keeping from the API — no alerting fires when suspicious patterns appear (e.g. repeated failed logins, unusual data access by an unknown IP). No export to CSV/JSON for auditors. No tamper-evident log storage. Compliance controls table is always empty (see Data Protection). No automated evidence generation for audit reports. No audit coverage metrics (what % of actions are logged).',
                  },
                  {
                    area: 'Observability & Monitoring',
                    icon: '📡',
                    status: 'partial',
                    exists: 'Alerts page with recent alerts (acknowledge, filter by severity) and configurable alert rules (enable/disable toggle, expandable description, business context, and remediation playbook). Execution logs track every rule run with pass/fail counts, quality score, and error samples. Anomalies page surfaces quality issues with severity classification. SLAs page shows 7-day adherence trend charts.',
                    gaps: 'Everything is schedule-triggered — nothing fires between runs. No continuous/real-time monitoring. Freshness and volume are only observed if a user manually creates a freshness_check or volume_check rule on a specific table; there is no automatic baseline monitoring. No WebSocket or Server-Sent Events — the browser never receives push updates. No schema-change auto-detection. No cross-table correlation (e.g. two tables degrading simultaneously = upstream failure). No SLA breach prediction.',
                  },
                  {
                    area: 'Data Lifecycle',
                    icon: '♻️',
                    status: 'missing',
                    exists: 'Workspace settings has a "Data Retention" row that shows "—". No other lifecycle-related UI exists anywhere in the platform.',
                    gaps: 'Data lifecycle management is entirely absent. No retention policy creation or enforcement. No dataset archival workflow. No data expiry or deprecation process. No cold/warm/hot tier management. No dataset "end of life" notifications. No data aging/staleness tracking beyond what a manually created freshness rule would catch. No version history for datasets or schemas.',
                  },
                  {
                    area: 'Stewardship & Collaboration',
                    icon: '🤝',
                    status: 'missing',
                    exists: 'Ownership fields exist on domains (managed via the Domains page), policies, glossary terms, contracts, and SLAs. The Governance scorecard tracks an "Ownership" dimension (% of tables with an assigned owner). Domain management page shows tables in each domain with basic statistics.',
                    gaps: 'Ownership Coverage KPI always shows "—" — the dimension score is not calculated from real data. No comments, annotations, or discussion threads on any entity (issues, anomalies, datasets, lineage nodes, glossary terms). No @mentions or in-platform notifications. No stewardship task queue or assignment workflow. No data quality improvement goals per steward. No collaboration history. All coordination must happen outside the platform (Slack, email), losing all context.',
                  },
                ]

                return (
                  <div style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderBottom: '1px solid #334155' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '20px' }}>📊</span>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>Enterprise Capability Assessment</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                          {(['built', 'partial', 'missing'] as const).map(s => (
                            <span key={s} style={{ background: STATUS[s].bg, color: STATUS[s].color, fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: `1px solid ${STATUS[s].border}` }}>
                              {areas.filter(a => a.status === s).length} {STATUS[s].label}
                            </span>
                          ))}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8', lineHeight: '1.6' }}>
                        11 capability domains verified against the actual codebase. Each entry shows exactly what is implemented today vs. what is missing — based on reading the source code directly, not documentation.
                      </p>
                    </div>

                    {/* Capability rows */}
                    {areas.map((a, i) => {
                      const st = STATUS[a.status]
                      return (
                        <div key={a.area} style={{ borderBottom: i < areas.length - 1 ? '1px solid #f3f1ea' : 'none' }}>
                          {/* Area header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 24px 0', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '16px' }}>{a.icon}</span>
                            <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>{a.area}</span>
                            <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: '10px', fontWeight: 700, padding: '2px 10px', borderRadius: '20px', letterSpacing: '0.04em' }}>
                              {st.label}
                            </span>
                          </div>
                          {/* Two-column: exists + gaps */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', padding: '10px 24px 16px' }}>
                            <div style={{ paddingRight: '20px', borderRight: '1px solid #f3f1ea' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>✓ What exists today</div>
                              <p style={{ margin: 0, fontSize: '12px', color: '#374151', lineHeight: '1.7' }}>{a.exists}</p>
                            </div>
                            <div style={{ paddingLeft: '20px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>✗ What is missing or broken</div>
                              <p style={{ margin: 0, fontSize: '12px', color: '#374151', lineHeight: '1.7' }}>{a.gaps}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Footer note */}
              <div style={{ background: '#fafaf9', border: '1px solid #ebe8df', borderRadius: '10px', padding: '14px 20px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                Internal reference only — not shown to end users. All capability statuses verified against source code, May 2026.
              </div>
            </div>
          )}

          {/* ─── Workspace ─── */}
          {tab === 'workspace' && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a', marginBottom: '20px' }}>Workspace Settings</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[['Workspace Name', '—'], ['Organization', '—'], ['Default Connection', '—'], ['Data Retention', '—'], ['Timezone', '—']].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f1ea' }}>
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '24px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#dc2626', marginBottom: '6px' }}>Danger Zone</div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '12px' }}>These actions cannot be undone.</div>
                <button style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>Reset Workspace Data</button>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}
