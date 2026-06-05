'use client'
import { useState, useEffect } from 'react'

type FilterType = 'all' | 'failed' | 'system' | 'user'

interface AuditLog {
  id: string; user: string; action: string; resource: string
  ip: string; ts: string; category: string; result: 'success' | 'failed'
  detail: string; context: string; sessionId: string; duration: string
}

const catColor: Record<string, { bg: string; color: string }> = {
  connection: { bg: '#eff6ff', color: '#2563eb' }, rule: { bg: '#f5f3ff', color: '#7c3aed' },
  schedule:   { bg: '#f0fdf4', color: '#16a34a' }, alert: { bg: '#fee2e2', color: '#dc2626' },
  auth:       { bg: '#fff7ed', color: '#ea580c' }, report: { bg: '#fef9c3', color: '#ca8a04' },
  contract:   { bg: '#f0fdfa', color: '#0d9488' }, sla: { bg: '#fdf4ff', color: '#a21caf' },
  anomaly:    { bg: '#fff1f2', color: '#e11d48' },
}
const avatarColors: Record<string, string> = {
  'Bhaskar R.': '#6366f1', 'Priya M.': '#ec4899',
  'Rajan S.': '#f59e0b',   'Anil K.': '#10b981', 'System': '#94a3b8',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [popup, setPopup] = useState<AuditLog | null>(null)

  useEffect(() => {
    fetch('/api/audit')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setLogs(items.map((l: Record<string, unknown>, i: number) => ({
          id: String(l.audit_id ?? l.id ?? i),
          user: String(l.user_name ?? l.user ?? 'System'),
          action: String(l.action ?? l.action_type ?? ''),
          resource: String(l.resource ?? l.resource_name ?? ''),
          ip: String(l.ip_address ?? l.ip ?? 'internal'),
          ts: String(l.created_at ?? l.ts ?? l.timestamp ?? ''),
          category: String(l.category ?? l.event_type ?? 'system'),
          result: l.result === 'failed' || l.status === 'failed' ? 'failed' : 'success',
          detail: String(l.detail ?? l.description ?? ''),
          context: String(l.context ?? l.notes ?? ''),
          sessionId: String(l.session_id ?? l.sessionId ?? ''),
          duration: l.duration_ms ? `${l.duration_ms}ms` : String(l.duration ?? ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const categories    = ['all', ...Array.from(new Set(logs.map(l => l.category)))]
  const failedEvents  = logs.filter(l => l.result === 'failed').length
  const usersActive   = new Set(logs.filter(l => l.user !== 'System').map(l => l.user)).size
  const systemEvents  = logs.filter(l => l.user === 'System').length

  const filtered = logs.filter(l => {
    const matchFilter =
      filter === 'failed' ? l.result === 'failed' :
      filter === 'system' ? l.user === 'System' :
      filter === 'user'   ? l.user !== 'System' : true
    const matchCat    = category === 'all' || l.category === category
    const matchSearch = !search || [l.user, l.action, l.resource].some(v => v.toLowerCase().includes(search.toLowerCase()))
    return matchFilter && matchCat && matchSearch
  })

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Audit Logs</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{logs.length} events</span>
        {usersActive > 0 && <span style={{ background: '#dbeafe', color: '#2563eb', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{usersActive} users</span>}
        {systemEvents > 0 && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{systemEvents} system</span>}
        {failedEvents > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{failedEvents} failed</span>}
        <button style={{ marginLeft: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>⬇ Export</button>
      </div>

      {/* search + category */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search user, action, resource…"
          style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* filter pills */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {(['all','user','system','failed'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: filter === f ? '#1a1a1a' : 'var(--surface-muted)',
            color: filter === f ? '#fff' : 'var(--text-secondary)',
            fontWeight: filter === f ? 600 : 400, fontSize: '11px',
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '24px 90px auto 1fr 70px auto', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['', 'User', 'Category', 'Action · Resource', 'Time', 'Result'].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{logs.length === 0 ? 'No audit logs yet' : 'No events match filters'}</div>
        )}
        {!loading && filtered.map(l => {
          const cc = catColor[l.category] ?? { bg: '#f8fafc', color: '#64748b' }
          const isFail = l.result === 'failed'
          const avatarColor = avatarColors[l.user] ?? '#64748b'
          const initials = l.user === 'System' ? '⚙' : l.user.split(' ').map((w: string) => w[0]).join('').slice(0, 2)
          return (
            <div key={l.id} onClick={() => setPopup(l)}
              style={{ display: 'grid', gridTemplateColumns: '24px 90px auto 1fr 70px auto', gap: '0 8px', alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${isFail ? '#fca5a5' : 'transparent'}`, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: l.user === 'System' ? '11px' : '9px', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user}</span>
              <span style={{ background: cc.bg, color: cc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.category}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong style={{ color: 'var(--foreground)' }}>{l.action}</strong>{l.resource ? ` · ${l.resource}` : ''}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.ts}</span>
              <span style={{ background: isFail ? '#fee2e2' : '#f0fdf4', color: isFail ? '#dc2626' : '#16a34a', padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600 }}>{isFail ? '✕ failed' : '✓ ok'}</span>
            </div>
          )
        })}
      </div>

      {/* popup */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popup.action}</span>
              <span style={{ background: popup.result === 'failed' ? '#fee2e2' : '#f0fdf4', color: popup.result === 'failed' ? '#dc2626' : '#16a34a', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{popup.result}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {([['User', popup.user], ['IP Address', popup.ip], ['Category', popup.category]] as [string, string][]).map(([lbl, val], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{lbl}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: lbl === 'IP Address' ? 'monospace' : 'inherit' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              {([['Session ID', popup.sessionId], ['Duration', popup.duration], ['Timestamp', popup.ts]] as [string, string][]).map(([lbl, val], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{lbl}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: lbl === 'Session ID' ? 'monospace' : 'inherit' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {popup.detail && (
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${popup.result === 'failed' ? '#fca5a5' : '#e0e7ff'}` }}>
                  <div style={{ background: popup.result === 'failed' ? '#fee2e2' : 'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding: '7px 12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '11px', color: popup.result === 'failed' ? '#dc2626' : '#4338ca', letterSpacing: '0.04em' }}>{popup.result === 'failed' ? '🚨 EVENT DETAIL' : '📝 EVENT DETAIL'}</span>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: '12px', color: '#1e293b', lineHeight: '1.6' }}>{popup.detail}</div>
                </div>
              )}
              {popup.context && (
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ background: 'var(--surface-muted)', padding: '7px 12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>💬 CONTEXT</span>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{popup.context}</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
