'use client'
import { useState, useEffect } from 'react'
import { Connection } from '@/lib/types'
import { loadConnections } from '@/lib/seedData'
import PageTabBar from '@/components/ui/PageTabBar'

const connIcons: Record<string, string> = {
  snowflake: '❄️', postgresql: '🐘', mysql: '🐬', bigquery: '📊',
  redshift: '🔴', mongodb: '🍃', csv: '📄', api: '🔌',
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'connections' | 'security' | 'notifications' | 'api' | 'integrations' | 'workspace'>('profile')
  const [saved, setSaved] = useState(false)
  const [profile, setProfile] = useState({ name: '', email: '', role: 'Admin', timezone: '', language: 'en' })
  const [notifs, setNotifs] = useState({ emailCritical: true, emailHigh: true, emailWeekly: true, slackCritical: true, slackHigh: false, slackDaily: false, pagerduty: false })

  // Connections state
  const [connections, setConnections] = useState<Connection[]>([])
  const [connsLoading, setConnsLoading] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})

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

  // Load connections when tab switches to connections
  useEffect(() => {
    if (tab === 'connections') {
      setConnsLoading(true)
      loadConnections().then(conns => {
        setConnections(conns)
        setConnsLoading(false)
      })
    }
  }, [tab])

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

  async function testConnection(conn: Connection) {
    setTesting(conn.id)
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conn),
      })
      const data = await res.json()
      setTestResult(prev => ({ ...prev, [conn.id]: { ok: data.success !== false && !data.error, msg: data.error || data.message || 'Connected successfully' } }))
    } catch {
      setTestResult(prev => ({ ...prev, [conn.id]: { ok: false, msg: 'Test failed' } }))
    }
    setTesting(null)
  }

  function save() {
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
    { id: 'workspace', label: 'Workspace', icon: '🏢' },
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
      <PageTabBar tabs={[
        { href: '/settings',     label: 'General' },
        { href: '/compliance',   label: 'Compliance' },
        { href: '/architecture', label: 'User Guide' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Analytics platform</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px' }}>Settings</h1>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Sidebar */}
        <div style={{ width: '200px', flexShrink: 0 }}>
          <div style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', overflow: 'hidden' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: 'none', borderLeft: tab === t.id ? '2px solid #2563eb' : '2px solid transparent', background: tab === t.id ? '#eff6ff' : '#fff', color: tab === t.id ? '#2563eb' : '#475569', fontSize: '13px', fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', textAlign: 'left' }}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
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
              <button onClick={save} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* ─── Connections ─── */}
          {tab === 'connections' && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>Connections</div>
                  <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>Manage your database connections</div>
                </div>
                <a href="/connections" style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#E8541A', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>+ Add Connection</a>
              </div>

              {connsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading connections...</div>
              ) : connections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed #e2e8f0', borderRadius: '12px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔌</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>No connections configured</div>
                  <div style={{ fontSize: '12.5px', marginTop: '4px' }}>Add a connection to start monitoring your data</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {connections.map(conn => {
                    const tr = testResult[conn.id]
                    return (
                      <div key={conn.id} style={{ background: '#fafaf9', borderRadius: '10px', padding: '16px 18px', border: `1px solid ${conn.status === 'active' ? '#86efac' : conn.status === 'error' ? '#fca5a5' : '#ebe8df'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '24px' }}>{connIcons[conn.type] ?? '🔗'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a' }}>{conn.name}</span>
                              <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: conn.status === 'active' ? '#16a34a' : conn.status === 'error' ? '#dc2626' : '#d97706',
                              }} />
                              <span style={{
                                background: conn.status === 'active' ? '#dcfce7' : conn.status === 'error' ? '#fee2e2' : '#fef3c7',
                                color: conn.status === 'active' ? '#16a34a' : conn.status === 'error' ? '#dc2626' : '#d97706',
                                padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
                              }}>{conn.status}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                              {conn.type} · {conn.database ?? conn.host ?? ''}{conn.schema ? `.${conn.schema}` : ''}{conn.warehouse ? ` · WH: ${conn.warehouse}` : ''}
                            </div>
                            {conn.lastTested && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Last tested: {new Date(conn.lastTested).toLocaleString()}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => testConnection(conn)} disabled={testing === conn.id} style={{
                              padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff',
                              color: '#475569', fontSize: '12px', fontWeight: 500, cursor: testing === conn.id ? 'not-allowed' : 'pointer',
                              opacity: testing === conn.id ? 0.5 : 1,
                            }}>{testing === conn.id ? '⏳ Testing...' : '🔄 Test'}</button>
                            <a href="/connections" style={{
                              padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff',
                              color: '#2563eb', fontSize: '12px', fontWeight: 500, textDecoration: 'none',
                            }}>✏️ Edit</a>
                          </div>
                        </div>
                        {tr && (
                          <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', background: tr.ok ? '#f0fdf4' : '#fef2f2', color: tr.ok ? '#16a34a' : '#dc2626', border: `1px solid ${tr.ok ? '#86efac' : '#fca5a5'}` }}>
                            {tr.ok ? '✅' : '❌'} {tr.msg}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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

              <button onClick={save} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
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
              <button onClick={save} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
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
              <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>Use API keys to authenticate DataGuard from CI/CD pipelines, dashboards, or external tools.</div>

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
    </div>
  )
}
