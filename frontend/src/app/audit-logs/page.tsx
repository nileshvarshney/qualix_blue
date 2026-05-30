'use client'
import { useState, useEffect } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type FilterType = 'all' | 'failed' | 'system' | 'user'

interface AuditLog {
  id: string; user: string; action: string; resource: string
  ip: string; ts: string; category: string; result: 'success' | 'failed'
  detail: string; context: string; sessionId: string; duration: string
}

const catColor: Record<string, { bg: string; color: string }> = {
  connection: { bg: '#eff6ff', color: '#2563eb' },
  rule:       { bg: '#f5f3ff', color: '#7c3aed' },
  schedule:   { bg: '#f0fdf4', color: '#16a34a' },
  alert:      { bg: '#fee2e2', color: '#dc2626' },
  auth:       { bg: '#fff7ed', color: '#ea580c' },
  report:     { bg: '#fef9c3', color: '#ca8a04' },
  contract:   { bg: '#f0fdfa', color: '#0d9488' },
  sla:        { bg: '#fdf4ff', color: '#a21caf' },
  anomaly:    { bg: '#fff1f2', color: '#e11d48' },
}

const avatarColors: Record<string, string> = {
  'Bhaskar R.': '#6366f1', 'Priya M.': '#ec4899',
  'Rajan S.': '#f59e0b',   'Anil K.': '#10b981', 'System': '#94a3b8',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]     = useState<FilterType>('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

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
          result: (l.result as 'success' | 'failed') ?? (l.status === 'failed' ? 'failed' : 'success'),
          detail: String(l.detail ?? l.description ?? ''),
          context: String(l.context ?? l.notes ?? ''),
          sessionId: String(l.session_id ?? l.sessionId ?? ''),
          duration: String(l.duration ?? l.duration_ms ? `${l.duration_ms}ms` : ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const categories = ['all', ...Array.from(new Set(logs.map(l => l.category)))]
  const totalEvents  = logs.length
  const usersActive  = new Set(logs.filter(l => l.user !== 'System').map(l => l.user)).size
  const systemEvents = logs.filter(l => l.user === 'System').length
  const failedEvents = logs.filter(l => l.result === 'failed').length

  const filtered = logs.filter(l => {
    const matchFilter =
      filter === 'all'    ? true :
      filter === 'failed' ? l.result === 'failed' :
      filter === 'system' ? l.user === 'System' :
      filter === 'user'   ? l.user !== 'System' : true
    const matchCat    = category === 'all' || l.category === category
    const matchSearch = search === '' ||
      l.user.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.resource.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchCat && matchSearch
  })

  const statCards = [
    { key: 'all'    as FilterType, label: 'Total Events',    value: totalEvents,  icon: '📋', color: '#1a1a1a', activeBg: '#1a1a1a' },
    { key: 'user'   as FilterType, label: 'Users Active',    value: usersActive,  icon: '👥', color: '#2563eb', activeBg: '#2563eb' },
    { key: 'system' as FilterType, label: 'System Events',   value: systemEvents, icon: '⚙️', color: '#6366f1', activeBg: '#6366f1' },
    { key: 'failed' as FilterType, label: 'Failed Actions',  value: failedEvents, icon: '⚠️', color: '#dc2626', activeBg: '#dc2626' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/alerts',     label: 'Alerts' },
        { href: '/incidents',  label: 'Incidents' },
        { href: '/audit-logs', label: 'Audit Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Audit Logs</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Complete record of all user and system actions — {logs.length} events
            {failedEvents > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {failedEvents} failed action{failedEvents > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: 'pointer' }}>
          ⬇ Export Log
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((card, idx) => {
          const isActive = filter === card.key && idx !== 0
          return (
            <div key={card.key}
              onClick={() => idx === 0 ? setFilter('all') : setFilter(isActive ? 'all' : card.key)}
              style={{
                background: isActive ? card.activeBg : '#fff',
                border: `2px solid ${isActive ? card.activeBg : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: idx === 0 ? 'default' : 'pointer',
                boxShadow: isActive ? `0 4px 16px ${card.activeBg}40` : 'none',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : card.color }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear</div>}
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, action, resource…"
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }} />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#475569' }}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Filter label */}
      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{filter}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* Log list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            {logs.length === 0 ? 'No audit logs yet' : 'No audit events match your filters'}
          </div>
        ) : null}
        {!loading && filtered.map(l => {
          const cc     = catColor[l.category] || { bg: '#f8fafc', color: '#64748b' }
          const isOpen = expanded === l.id
          const isFail = l.result === 'failed'
          const avatarColor = avatarColors[l.user] || '#64748b'
          const initials = l.user === 'System' ? '⚙' : l.user.split(' ').map(w => w[0]).join('').slice(0, 2)

          return (
            <div key={l.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : isFail ? '#fca5a5' : '#e2e8f0'}`,
              borderRadius: '10px', overflow: 'hidden',
              boxShadow: isOpen ? '0 4px 16px rgba(99,102,241,0.1)' : isFail ? '0 1px 4px rgba(220,38,38,0.06)' : 'none',
              transition: 'all 0.18s',
            }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(isOpen ? null : l.id)}
                style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>

                {/* Avatar */}
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: avatarColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: l.user === 'System' ? '14px' : '11px', fontWeight: 700,
                }}>{initials}</div>

                {/* Timestamp */}
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0, minWidth: '120px' }}>{l.ts}</div>

                {/* User */}
                <div style={{ fontWeight: 600, fontSize: '12.5px', color: l.user === 'System' ? '#6366f1' : '#1a1a1a', flexShrink: 0, minWidth: '90px' }}>{l.user}</div>

                {/* Category */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ ...cc, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{l.category}</span>
                </div>

                {/* Action */}
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a', flexShrink: 0, minWidth: '150px' }}>{l.action}</div>

                {/* Resource */}
                <div style={{ flex: 1, fontSize: '12.5px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.resource}</div>

                {/* IP */}
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0, minWidth: '110px' }}>{l.ip}</div>

                {/* Result */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ background: isFail ? '#fee2e2' : '#f0fdf4', color: isFail ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                    {isFail ? '✕ failed' : '✓ success'}
                  </span>
                </div>

                {/* Toggle */}
                <div style={{
                  width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                  background: isOpen ? '#6366f1' : '#f1f5f9',
                  color: isOpen ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', transition: 'all 0.18s',
                }}>{isOpen ? '▲' : '▼'}</div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Session ID', value: l.sessionId },
                      { label: 'Duration',   value: l.duration  },
                      { label: 'IP Address', value: l.ip        },
                      { label: 'Category',   value: l.category  },
                      { label: 'Result',     value: l.result    },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: m.label === 'Result' && l.result === 'failed' ? '#dc2626' : '#334155', fontFamily: m.label === 'Session ID' || m.label === 'IP Address' ? 'monospace' : 'inherit' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Action detail */}
                    <div style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${isFail ? '#fca5a5' : '#e0e7ff'}`, overflow: 'hidden' }}>
                      <div style={{ background: isFail ? '#fee2e2' : 'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding: '9px 14px', borderBottom: `1px solid ${isFail ? '#fca5a5' : '#e0e7ff'}`, display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span>{isFail ? '🚨' : '📝'}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: isFail ? '#dc2626' : '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Event Detail</span>
                      </div>
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{l.detail || '—'}</div>
                    </div>

                    {/* Context */}
                    {l.context && (
                      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ background: '#fafaf9', padding: '9px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span>💬</span>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Context & Notes</span>
                        </div>
                        <div style={{ padding: '12px 14px', fontSize: '13px', color: '#475569', lineHeight: '1.7' }}>{l.context}</div>
                      </div>
                    )}

                    <div>
                      <button onClick={() => setExpanded(null)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
