'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface SlackBotState {
  enabled: boolean
  webhookUrl: string
  botToken: string
  signingSecret: string
  channel: string
  allowedCommands: string
}

function SlackBotConfig() {
  const [config, setConfig] = useState<SlackBotState>({
    enabled: false, webhookUrl: '', botToken: '', signingSecret: '', channel: '#data-quality', allowedCommands: 'quality, issues, anomalies, run',
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('qualix_slack_bot_config')
      if (stored) setConfig(JSON.parse(stored))
    } catch {}
  }, [])

  async function save() {
    setSaving(true)
    try {
      await apiFetch('/api/integrations/slack/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }).catch(() => {})
      localStorage.setItem('qualix_slack_bot_config', JSON.stringify(config))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await apiFetch('/api/integrations/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: config.webhookUrl, channel: config.channel }),
      })
      const data = await res.json() as Record<string, unknown>
      setTestResult(data.ok ? '✓ Connection successful — test message sent to ' + config.channel : '✕ ' + String(data.error ?? 'Connection failed'))
    } catch {
      setTestResult('✕ Could not reach backend — check that the Slack integration service is configured')
    } finally {
      setTestLoading(false)
    }
  }

  const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '12.5px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '20px' }}>🤖</span>
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Slack / Teams AI Bot</span>
        <span style={{ marginLeft: 'auto', background: config.enabled ? 'var(--status-ok-bg)' : 'var(--surface-muted)', color: config.enabled ? 'var(--status-ok-text)' : 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px' }}>
          {config.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
        Enable two-way Slack integration so data engineers can query the platform directly from Slack using natural language commands like <em>&quot;quality score for orders_fact&quot;</em> or <em>&quot;open issues in finance domain&quot;</em>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, flex: 1 }}>Enable Slack Bot</span>
          <button
            onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
            style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', background: config.enabled ? 'var(--status-ok-bg)' : 'var(--border)', color: config.enabled ? 'var(--status-ok-text)' : 'var(--text-muted)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
            {config.enabled ? 'On' : 'Off'}
          </button>
        </div>
        {config.enabled && (
          <>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Slack Webhook URL</label>
              <input value={config.webhookUrl} onChange={e => setConfig(c => ({ ...c, webhookUrl: e.target.value }))} placeholder="https://hooks.slack.com/services/..." style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Bot Token (for two-way)</label>
              <input type="password" value={config.botToken} onChange={e => setConfig(c => ({ ...c, botToken: e.target.value }))} placeholder="xoxb-..." style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Signing Secret</label>
              <input type="password" value={config.signingSecret} onChange={e => setConfig(c => ({ ...c, signingSecret: e.target.value }))} placeholder="Slack app signing secret" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Default Channel</label>
                <input value={config.channel} onChange={e => setConfig(c => ({ ...c, channel: e.target.value }))} placeholder="#data-quality" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Allowed Commands</label>
                <input value={config.allowedCommands} onChange={e => setConfig(c => ({ ...c, allowedCommands: e.target.value }))} placeholder="quality, issues, anomalies" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={testConnection} disabled={!config.webhookUrl || testLoading} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: config.webhookUrl ? 'pointer' : 'not-allowed' }}>
                {testLoading ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && <span style={{ fontSize: '12px', color: testResult.startsWith('✓') ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>{testResult}</span>}
            </div>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface RetentionConfig {
  defaultRetentionDays: number
  archiveStrategy: 'delete' | 'archive' | 'compress'
  notifyDaysBefore: number
  enableAutoArchive: boolean
  domainOverrides: { domain: string; days: number }[]
}

interface TierEntry { domain: string; tier: 'hot' | 'warm' | 'cold'; query_sla: string; cost_profile: string; last_reclassified: string }
interface ExpiryRequest { id: string; dataset: string; domain: string; expires_at: string; days_remaining: number; recommended_action: string; status: string }

function DataLifecycleConfig() {
  const [config, setConfig] = useState<RetentionConfig>({
    defaultRetentionDays: 365,
    archiveStrategy: 'archive',
    notifyDaysBefore: 30,
    enableAutoArchive: false,
    domainOverrides: [],
  })
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [newDays, setNewDays] = useState(180)
  const [tiers, setTiers] = useState<TierEntry[]>([])
  const [notifRecipients, setNotifRecipients] = useState({ emails: '', slack_webhook: '' })
  const [tierSaving, setTierSaving] = useState(false)
  const [tierSaved, setTierSaved] = useState(false)
  const [expiryRequests, setExpiryRequests] = useState<ExpiryRequest[]>([])
  const [expiryExtendId, setExpiryExtendId] = useState<string | null>(null)
  const [expiryExtendDays, setExpiryExtendDays] = useState(90)
  const [actingId, setActingId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/settings/retention')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConfig({ ...config, ...data }) })
      .catch(() => {})
    apiFetch('/api/settings/lifecycle-tiers').then(r => r.ok ? r.json() : null).then(d => { if (d) { setTiers(d.tiers ?? []); setNotifRecipients(d.notification_recipients ?? { emails: '', slack_webhook: '' }) } }).catch(() => {})
    apiFetch('/api/lifecycle/expiry-requests').then(r => r.ok ? r.json() : null).then(d => { if (d) setExpiryRequests(d.requests ?? []) }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await apiFetch('/api/settings/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      setSaveResult({ ok: res.ok, msg: res.ok ? 'Retention policy saved' : 'Save failed' })
    } catch {
      setSaveResult({ ok: false, msg: 'Could not reach backend' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult(null), 3000)
    }
  }

  async function saveTiers() {
    setTierSaving(true)
    try {
      const res = await apiFetch('/api/settings/lifecycle-tiers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers, notification_recipients: notifRecipients }),
      })
      if (res.ok) { const d = await res.json(); setTiers(d.tiers ?? []); setNotifRecipients(d.notification_recipients ?? notifRecipients) }
      setTierSaved(true); setTimeout(() => setTierSaved(false), 2500)
    } finally { setTierSaving(false) }
  }

  async function actOnExpiry(id: string, action: 'approve' | 'extend' | 'exempt', extendDays?: number) {
    setActingId(id)
    try {
      const res = await apiFetch(`/api/lifecycle/expiry-requests/${id}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, extend_days: extendDays }),
      })
      if (res.ok) {
        const d = await res.json()
        setExpiryRequests(prev => prev.map(r => r.id === id ? { ...r, status: d.status, expires_at: d.new_expires_at ?? r.expires_at } : r))
      }
    } finally { setActingId(null); setExpiryExtendId(null) }
  }

  const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }
  const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '12.5px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none' }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '20px' }}>♻️</span>
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)' }}>Data Lifecycle & Retention</span>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
        Configure how long datasets are retained before archival or deletion. Domain-level overrides take precedence over the default policy.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={row}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Default Retention Period</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>How long to keep datasets before triggering the archive strategy</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" value={config.defaultRetentionDays} min={1} max={3650}
              onChange={e => setConfig(c => ({ ...c, defaultRetentionDays: parseInt(e.target.value) || 365 }))}
              style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>days</span>
          </div>
        </div>

        <div style={row}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Archive Strategy</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Action taken when retention period expires</div>
          </div>
          <select value={config.archiveStrategy} onChange={e => setConfig(c => ({ ...c, archiveStrategy: e.target.value as RetentionConfig['archiveStrategy'] }))}
            style={{ ...inputStyle, paddingRight: '24px' }}>
            <option value="archive">Move to archive storage</option>
            <option value="compress">Compress and retain</option>
            <option value="delete">Delete permanently</option>
          </select>
        </div>

        <div style={row}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Notify Before Expiry</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Alert dataset owners N days before retention period ends</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" value={config.notifyDaysBefore} min={0} max={365}
              onChange={e => setConfig(c => ({ ...c, notifyDaysBefore: parseInt(e.target.value) || 0 }))}
              style={{ ...inputStyle, width: '60px', textAlign: 'center' }} />
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>days</span>
          </div>
        </div>

        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--foreground)' }}>Auto-Archive</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Automatically apply the archive strategy without manual approval</div>
          </div>
          <button onClick={() => setConfig(c => ({ ...c, enableAutoArchive: !c.enableAutoArchive }))}
            style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: config.enableAutoArchive ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '3px', left: config.enableAutoArchive ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>

      {/* Domain overrides */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Domain-Level Overrides</div>
        {config.domainOverrides.length === 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>No domain overrides — all domains use the default retention period</div>
        )}
        {config.domainOverrides.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--foreground)', flex: 1, fontWeight: 500 }}>{d.domain}</span>
            <input type="number" value={d.days} min={1}
              onChange={e => setConfig(c => ({ ...c, domainOverrides: c.domainOverrides.map((o, j) => j === i ? { ...o, days: parseInt(e.target.value) || 180 } : o) }))}
              style={{ ...inputStyle, width: '70px', textAlign: 'center' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days</span>
            <button onClick={() => setConfig(c => ({ ...c, domainOverrides: c.domainOverrides.filter((_, j) => j !== i) }))}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Domain name…"
            style={{ ...inputStyle, flex: 1 }} />
          <input type="number" value={newDays} min={1}
            onChange={e => setNewDays(parseInt(e.target.value) || 180)}
            style={{ ...inputStyle, width: '70px', textAlign: 'center' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days</span>
          <button
            disabled={!newDomain.trim()}
            onClick={() => {
              if (!newDomain.trim()) return
              setConfig(c => ({ ...c, domainOverrides: [...c.domainOverrides, { domain: newDomain.trim(), days: newDays }] }))
              setNewDomain('')
              setNewDays(180)
            }}
            style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '5px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: newDomain.trim() ? 'pointer' : 'not-allowed', opacity: newDomain.trim() ? 1 : 0.5 }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save Retention Policy'}
        </button>
        {saveResult && (
          <span style={{ fontSize: '12.5px', color: saveResult.ok ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
            {saveResult.ok ? '✓' : '✕'} {saveResult.msg}
          </span>
        )}
      </div>

      {/* ── Data Tier Management ── */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Data Tier Management</div>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>Classify each domain as Hot (frequent, highest cost), Warm (occasional), or Cold (archival, lowest cost).</p>
        {tiers.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>No domains configured — add domains in Asset Registry first</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {tiers.map((t, i) => {
              const tierColor = t.tier === 'hot' ? { bg: 'var(--status-error-bg)', text: 'var(--status-error-text)' } : t.tier === 'warm' ? { bg: 'var(--status-warn-bg)', text: 'var(--status-warn-text)' } : { bg: 'var(--surface-muted)', text: 'var(--text-muted)' }
              return (
                <div key={t.domain} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < tiers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--foreground)', flex: 1 }}>{t.domain}</span>
                  <select value={t.tier} onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, tier: e.target.value as TierEntry['tier'] } : x))}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                    <option value="hot">Hot</option>
                    <option value="warm">Warm</option>
                    <option value="cold">Cold</option>
                  </select>
                  <span style={{ background: tierColor.bg, color: tierColor.text, fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', minWidth: '36px', textAlign: 'center', textTransform: 'uppercase' }}>{t.tier}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '60px' }}>{t.query_sla}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '50px' }}>{t.cost_profile}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── EoL Notification Recipients ── */}
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Expiry Notification Recipients</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Email (comma-separated)</label>
              <input value={notifRecipients.emails} onChange={e => setNotifRecipients(n => ({ ...n, emails: e.target.value }))}
                placeholder="owner@company.com, steward@company.com"
                style={{ ...inputStyle, fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Slack Webhook</label>
              <input value={notifRecipients.slack_webhook} onChange={e => setNotifRecipients(n => ({ ...n, slack_webhook: e.target.value }))}
                placeholder="https://hooks.slack.com/services/…"
                style={{ ...inputStyle, fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        <button onClick={saveTiers} disabled={tierSaving}
          style={{ marginTop: '12px', padding: '7px 18px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', opacity: tierSaving ? 0.7 : 1 }}>
          {tierSaving ? 'Saving…' : tierSaved ? 'Saved ✓' : 'Save Tiers & Recipients'}
        </button>
      </div>

      {/* ── Expiry Approval Workflow ── */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '6px' }}>Expiry Approval Workflow</div>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>Datasets approaching their retention expiry date — approve deletion, extend, or exempt.</p>
        {expiryRequests.filter(r => r.status === 'pending').length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>No datasets approaching expiry</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {expiryRequests.filter(r => r.status === 'pending').map(r => {
              const urgent = r.days_remaining <= 10
              return (
                <div key={r.id} style={{ padding: '10px 12px', border: `1px solid ${urgent ? '#fca5a5' : 'var(--border)'}`, borderRadius: '8px', background: urgent ? 'var(--status-error-bg)' : 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{r.dataset}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '4px' }}>{r.domain}</span>
                    <span style={{ fontSize: '11px', color: urgent ? 'var(--status-error-text)' : 'var(--text-muted)', fontWeight: urgent ? 700 : 400 }}>
                      Expires {r.expires_at} ({r.days_remaining}d remaining)
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)', background: 'var(--surface-muted)', padding: '1px 7px', borderRadius: '4px' }}>Recommended: {r.recommended_action}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => actOnExpiry(r.id, 'approve')} disabled={actingId === r.id}
                      style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: 'var(--status-error-text)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: actingId === r.id ? 0.5 : 1 }}>
                      Approve Expiry
                    </button>
                    {expiryExtendId === r.id ? (
                      <>
                        <input type="number" value={expiryExtendDays} min={1} onChange={e => setExpiryExtendDays(Number(e.target.value))}
                          style={{ width: '60px', padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>days</span>
                        <button onClick={() => actOnExpiry(r.id, 'extend', expiryExtendDays)} disabled={actingId === r.id}
                          style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          Confirm Extension
                        </button>
                        <button onClick={() => setExpiryExtendId(null)}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setExpiryExtendId(r.id)}
                        style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: '11px', cursor: 'pointer' }}>
                        Extend
                      </button>
                    )}
                    <button onClick={() => actOnExpiry(r.id, 'exempt')} disabled={actingId === r.id}
                      style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', opacity: actingId === r.id ? 0.5 : 1 }}>
                      Exempt
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkspacePage() {
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 24px' }}>Workspace</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)', marginBottom: '20px' }}>Workspace Settings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[['Workspace Name', '—'], ['Organization', '—'], ['Default Connection', '—'], ['Data Retention', '—'], ['Timezone', '—']].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: '13px', color: 'var(--foreground)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '24px', background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--status-error-text)', marginBottom: '6px' }}>Danger Zone</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>These actions cannot be undone.</div>
            <button style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--status-error-text)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>Reset Workspace Data</button>
          </div>
        </div>

        <SlackBotConfig />
        <DataLifecycleConfig />
      </div>
    </div>
  )
}
