'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: on ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

export default function NotificationsPage() {
  const [saved, setSaved] = useState(false)
  const [notifs, setNotifs] = useState({ emailCritical: true, emailHigh: true, emailWeekly: true, slackCritical: true, slackHigh: false, slackDaily: false, pagerduty: false })

  useEffect(() => {
    try {
      const n = localStorage.getItem('dg_settings_notifs')
      if (n) setNotifs(JSON.parse(n))
    } catch { }
  }, [])

  function save() {
    localStorage.setItem('dg_settings_notifs', JSON.stringify(notifs))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>Notifications</h1>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)', marginBottom: '20px' }}>Notification Preferences</div>
        {[
          { section: 'Email Notifications', items: [['emailCritical', 'Critical quality issues'], ['emailHigh', 'High severity alerts'], ['emailWeekly', 'Weekly summary report']] },
          { section: 'Slack Notifications', items: [['slackCritical', 'Critical quality issues'], ['slackHigh', 'High severity alerts'], ['slackDaily', 'Daily digest']] },
          { section: 'PagerDuty', items: [['pagerduty', 'Critical incidents (24/7 on-call)']] },
        ].map(({ section, items }) => (
          <div key={section} style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '12px' }}>{section.toUpperCase()}</div>
            {items.map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
                <Toggle on={notifs[key as keyof typeof notifs]} onChange={() => setNotifs(n => ({ ...n, [key]: !n[key as keyof typeof n] }))} />
              </div>
            ))}
          </div>
        ))}
        <button onClick={save} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: saved ? '#16a34a' : '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          {saved ? '✓ Saved!' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )
}
