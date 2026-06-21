'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { loadConnections } from '@/lib/seedData'

/* ─── Icon helper ─── */
const I = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

/* ─── Connection type icons ─── */
const connIcons: Record<string, string> = {
  snowflake: '❄️', postgresql: '🐘', mysql: '🐬', bigquery: '📊',
  redshift: '🔴', mongodb: '🍃', csv: '📄', api: '🔌',
}

const ACTIVE_CONN_KEY = 'qualix-active-conn'

function publishActiveConn(id: string) {
  try { localStorage.setItem(ACTIVE_CONN_KEY, id) } catch {}
  window.dispatchEvent(new CustomEvent('qualix-active-conn-changed', { detail: id }))
}

/* ─── Top-bar Connection Selector ─── */
function TopBarConnectionSelector() {
  const [connections, setConnections] = useState<{ id: string; name: string; type: string; status: string; database?: string; host?: string }[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selectorPathname = usePathname()

  function applyConns(conns: { id: string; name: string; type: string; status: string }[]) {
    const activeConns = conns.filter(c => c.status === 'active')
    setConnections(activeConns)
    if (activeConns.length === 0) { setActiveId(null); return }
    const saved = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CONN_KEY) : null
    const keep = saved && activeConns.find(c => c.id === saved)
    const chosen = keep ? saved! : activeConns[0].id
    setActiveId(chosen)
    publishActiveConn(chosen)
  }

  useEffect(() => {
    loadConnections().then(applyConns)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectorPathname])

  useEffect(() => {
    function onUpdate() { loadConnections().then(applyConns) }
    window.addEventListener('storage', onUpdate)
    window.addEventListener('qualix-connections-updated', onUpdate)
    return () => {
      window.removeEventListener('storage', onUpdate)
      window.removeEventListener('qualix-connections-updated', onUpdate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function selectConn(id: string) {
    setActiveId(id)
    setOpen(false)
    publishActiveConn(id)
  }

  const active = connections.find(c => c.id === activeId)

  async function handleRefresh() {
    if (!active) return
    setRefreshing(true)
    try {
      await fetch('/api/connections/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active),
      })
      loadConnections().then(applyConns)
    } catch {}
    setRefreshing(false)
  }

  if (connections.length === 0) {
    return (
      <Link href="/connections" style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 12px',
        borderRadius: '7px', fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 600,
        textDecoration: 'none',
      }}>+ Connect</Link>
    )
  }

  return (
    <div ref={ref} style={{ display: 'flex', alignItems: 'center', gap: '5px', position: 'relative' }}>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '5px 12px',
        borderRadius: '7px', cursor: 'pointer', minWidth: '150px',
        boxShadow: open ? '0 0 0 2px var(--accent-bg)' : 'none',
      }}>
        <span style={{ fontSize: '14px' }}>{active ? (connIcons[active.type] ?? '🔗') : '🔗'}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active?.name ?? 'Select'}
        </span>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>
      <button onClick={handleRefresh} disabled={refreshing} style={{
        background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px',
        borderRadius: '7px', cursor: refreshing ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', opacity: refreshing ? 0.5 : 1,
      }} title="Refresh connection">
        {refreshing ? '⏳' : '🔄'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, minWidth: '240px', overflow: 'hidden',
        }}>
          {connections.map(conn => (
            <button key={conn.id} onClick={() => selectConn(conn.id)} style={{
              display: 'flex', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: conn.id === activeId ? 'var(--accent-bg)' : 'var(--surface)', border: 'none',
              alignItems: 'center', gap: '10px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '15px' }}>{connIcons[conn.type] ?? '🔗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: conn.id === activeId ? 600 : 400, color: conn.id === activeId ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {conn.id === activeId && '✓ '}{conn.name}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{conn.type} · {conn.database ?? conn.host ?? ''}</div>
              </div>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a' }} />
            </button>
          ))}
          <Link href="/connections" style={{
            display: 'block', padding: '9px 14px', textAlign: 'center',
            fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 600,
            textDecoration: 'none', borderTop: '1px solid var(--border)',
          }}>⚙ Manage Connections</Link>
        </div>
      )}
    </div>
  )
}

/* ─── Notification Bell ─── */
function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Array<{
    notification_id: string; type: string; title: string; body: string | null;
    entity_type: string | null; entity_id: string | null; is_read: boolean; created_at: string
  }>>([])
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const load = async () => {
    try {
      const data = await fetch('/api/notifications').then(r => r.json()).catch(() => [])
      setNotifications(Array.isArray(data) ? data.slice(0, 20) : [])
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markAllRead = async () => {
    await fetch('/api/notifications?action=read-all', { method: 'POST' }).catch(() => {})
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
  }

  const markOne = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: 'POST' }).catch(() => {})
    setNotifications(ns => ns.map(n => n.notification_id === id ? { ...n, is_read: true } : n))
  }

  const typeIcon = (type: string) => type === 'violation_detected' ? '⚠️' : type === 'approval_requested' ? '📋' : '✅'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(!open); if (!open) load() }}
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: 6, borderRadius: 6, color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
        }}
        title="Notifications"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
            background: 'var(--brand-primary)', color: '#fff',
            borderRadius: 8, fontSize: 10, fontWeight: 700, lineHeight: '16px',
            textAlign: 'center', padding: '0 3px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, width: 360, maxHeight: 480,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No notifications</div>
            ) : notifications.map(n => (
              <div
                key={n.notification_id}
                onClick={() => markOne(n.notification_id)}
                style={{
                  padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: n.is_read ? 'transparent' : 'var(--surface-muted)',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{typeIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {n.created_at ? new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Theme Toggle ─── */
function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('qualix-theme')
    setDark(stored === 'dark')
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('qualix-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('qualix-theme', 'light')
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'transparent', border: '1px solid var(--border)',
        cursor: 'pointer', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', flexShrink: 0,
      }}
    >
      {dark ? '☀' : '🌙'}
    </button>
  )
}

/* ─── Section definitions ─── */
type Section = {
  key: string
  label: string
  railIconD: string
  defaultHref: string
}

const sections: Section[] = [
  {
    key: 'quality', label: 'Data Quality', defaultHref: '/',
    railIconD: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9zM3 12h18',
  },
  {
    key: 'govern', label: 'Governance', defaultHref: '/lineage',
    railIconD: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z',
  },
  {
    key: 'operations', label: 'Operations', defaultHref: '/scan-jobs',
    railIconD: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    key: 'admin', label: 'Admin', defaultHref: '/users',
    railIconD: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z',
  },
  {
    key: 'ai', label: 'AI Assistant', defaultHref: '/ai-assistant',
    railIconD: 'M12 2a2 2 0 012 2v1a7 7 0 014.9 11.9l.6 2.1-2.1-.6A7 7 0 015.1 15H4a2 2 0 01-2-2v-4a2 2 0 012-2h.1A7 7 0 0110 3V4a2 2 0 012-2zm-3 9a1 1 0 102 0 1 1 0 00-2 0zm4 0a1 1 0 102 0 1 1 0 00-2 0zm4 0a1 1 0 102 0 1 1 0 00-2 0z',
  },
  {
    key: 'settings', label: 'Settings', defaultHref: '/settings',
    railIconD: 'M10.3 3.5l-.4 1.7a7.5 7.5 0 00-1.6.7L6.6 5l-1.6 1.6 1 1.7c-.3.5-.5 1-.7 1.6l-1.7.4v2.3l1.7.4c.2.6.4 1.1.7 1.6l-1 1.7L6.6 19l1.7-.9c.5.3 1 .5 1.6.7l.4 1.7h2.3l.4-1.7c.6-.2 1.1-.4 1.6-.7l1.7.9 1.6-1.6-.9-1.7c.3-.5.5-1 .7-1.6l1.7-.4v-2.3l-1.7-.4c-.2-.6-.4-1.1-.7-1.6l.9-1.7-1.6-1.6-1.7.9c-.5-.3-1-.5-1.6-.7l-.4-1.7h-2.3zm1.2 5.5a3 3 0 110 6 3 3 0 010-6z',
  },
]

/* Maps every known route to its parent section key */
const SECTION_KEY_MAP: Record<string, string> = {
  '/': 'quality', '/rules': 'quality', '/issues': 'quality', '/datasets': 'quality', '/asset-registry': 'quality',
  '/anomalies': 'quality', '/schedules': 'quality', '/execution-logs': 'quality',
  '/lineage': 'govern', '/catalog': 'govern', '/governance': 'govern',
  '/glossary': 'govern', '/contracts': 'govern', '/data-products': 'govern', '/slas': 'govern', '/domains': 'govern',
  '/alerts': 'operations', '/incidents': 'operations', '/audit-logs': 'operations', '/observability': 'operations',
  '/data-browser': 'explore', '/spot-check': 'explore', '/reports': 'explore',
  '/executive': 'explore',
  '/ai-assistant': 'ai',
  '/settings': 'settings', '/architecture': 'settings',
  '/compliance': 'govern', '/privacy': 'govern',
  '/scan-jobs': 'operations', '/run-history': 'operations',
  '/users': 'admin', '/teams': 'admin', '/roles': 'admin',
  '/connections': 'admin', '/security': 'admin', '/notifications': 'admin',
  '/api-keys': 'admin', '/integrations': 'admin', '/llm': 'admin',
}

/* ─── Constants ─── */
const RAIL_W = 72
const TOP_H  = 56

/* ─── Global Search ─── */
interface SearchResult {
  id: string; type: string; label: string; sub?: string; href: string
}

const ENTITY_HREF: Record<string, string> = {
  asset: '/catalog', table: '/catalog', issue: '/issues', anomaly: '/anomalies',
  contract: '/contracts', glossary_term: '/glossary', policy: '/governance',
  alert: '/alerts', rule: '/rules',
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const sources = await Promise.allSettled([
        fetch(`/api/catalog?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        fetch(`/api/issues?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        fetch(`/api/anomalies?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        fetch(`/api/glossary?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        fetch(`/api/contracts?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
      ])
      const mapped: SearchResult[] = []
      const [catalog, issues, anomalies, glossary, contracts] = sources

      if (catalog.status === 'fulfilled') {
        const items = Array.isArray(catalog.value) ? catalog.value : (catalog.value?.items ?? [])
        for (const a of (items as Record<string, unknown>[]).slice(0, 3)) {
          mapped.push({ id: String(a.asset_id ?? a.id ?? ''), type: String(a.asset_type ?? 'asset'),
            label: String(a.display_name ?? a.physical_name ?? a.qualified_name ?? ''),
            sub: String(a.connection_name ?? ''), href: '/catalog' })
        }
      }
      if (issues.status === 'fulfilled') {
        const items = Array.isArray(issues.value) ? issues.value : []
        for (const i of (items as Record<string, unknown>[]).slice(0, 3)) {
          mapped.push({ id: String(i.issue_id ?? i.id ?? ''), type: 'issue',
            label: String(i.title ?? ''), sub: String(i.severity ?? ''), href: '/issues' })
        }
      }
      if (anomalies.status === 'fulfilled') {
        const items = Array.isArray(anomalies.value) ? anomalies.value : (anomalies.value?.items ?? [])
        for (const a of (items as Record<string, unknown>[]).slice(0, 2)) {
          mapped.push({ id: String(a.detection_id ?? a.id ?? ''), type: 'anomaly',
            label: String(a.asset_name ?? a.table_name ?? ''), sub: String(a.anomaly_type ?? ''), href: '/anomalies' })
        }
      }
      if (glossary.status === 'fulfilled') {
        const items = Array.isArray(glossary.value) ? glossary.value : []
        for (const t of (items as Record<string, unknown>[]).slice(0, 2)) {
          mapped.push({ id: String(t.term_id ?? t.id ?? ''), type: 'term',
            label: String(t.term_name ?? t.name ?? ''), sub: String(t.domain ?? ''), href: '/glossary' })
        }
      }
      if (contracts.status === 'fulfilled') {
        const items = Array.isArray(contracts.value) ? contracts.value : []
        for (const c of (items as Record<string, unknown>[]).slice(0, 2)) {
          mapped.push({ id: String(c.contract_id ?? c.id ?? ''), type: 'contract',
            label: String(c.contract_name ?? c.name ?? ''), sub: String(c.producer_team ?? ''), href: '/contracts' })
        }
      }
      setResults(mapped.filter(r => r.label))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setOpen(true)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(q), 280)
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const TYPE_ICON: Record<string, string> = {
    table: '🗃️', view: '👁️', asset: '📊', issue: '🐛', anomaly: '⚡',
    contract: '📋', term: '📖', policy: '🔐', alert: '🔔', rule: '📏',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 360, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
          placeholder="Search assets, issues, anomalies, terms…"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '12px', color: 'var(--foreground)', minWidth: 0 }}
        />
        {loading && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>…</span>}
      </div>
      {open && (query.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: '340px', overflowY: 'auto' }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No results for &quot;{query}&quot;
            </div>
          )}
          {results.map((r, i) => (
            <Link key={i} href={r.href} onClick={() => setOpen(false)} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{TYPE_ICON[r.type] ?? '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                  {r.sub && <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type} · {r.sub}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Component ─── */
export default function Sidebar() {
  const pathname = usePathname()
  const activeSectionKey =
    SECTION_KEY_MAP[pathname] ??
    (pathname.startsWith('/scan-jobs/') ? 'operations' : null) ??
    'quality'

  return (
    <>
      {/* ── Top bar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: TOP_H,
        background: 'var(--surface)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 14,
        zIndex: 60,
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* ── Brand lockup: artistic Q mark + wordmark ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>

          {/* Artistic Q mark — no background container */}
          <svg width="32" height="37" viewBox="0 0 38 44" fill="none" style={{ flexShrink: 0 }}>
            <defs>
              <linearGradient id="qMark" x1="2" y1="2" x2="36" y2="42" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#FF9050"/>
                <stop offset="55%"  stopColor="#E8541A"/>
                <stop offset="100%" stopColor="#A82E06"/>
              </linearGradient>
            </defs>

            {/* Outer ring — the Q circle */}
            <circle cx="19" cy="19" r="14" stroke="url(#qMark)" strokeWidth="4" fill="none"/>

            {/* Inner decorative ring — depth layer */}
            <circle cx="19" cy="19" r="8.5"
              stroke="url(#qMark)" strokeWidth="1" fill="none"
              opacity="0.35" strokeDasharray="2.5 3"/>

            {/* 4-pointed star — the quality compass */}
            <path
              d="M19 12.5 L20.9 17.1 L25.5 19 L20.9 20.9 L19 25.5 L17.1 20.9 L12.5 19 L17.1 17.1 Z"
              fill="url(#qMark)"/>

            {/* Q tail — bold, expressive diagonal */}
            <line x1="28" y1="29" x2="36" y2="42"
              stroke="url(#qMark)" strokeWidth="4.5" strokeLinecap="round"/>

            {/* Crown dot — accent at 12 o'clock */}
            <circle cx="19" cy="5" r="2.8" fill="#FF9050"/>
          </svg>

          {/* Artistic wordmark */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, gap: 0 }}>
              <span style={{
                fontSize: 21, fontWeight: 300,
                color: 'var(--foreground)',
                letterSpacing: '0.07em',
              }}>Qual</span>
              <span style={{
                fontSize: 21, fontWeight: 800,
                color: 'var(--brand-primary)',
                letterSpacing: '-0.01em',
                fontStyle: 'italic',
              }}>ix</span>
            </div>
            <div style={{
              fontSize: 9, color: 'var(--text-muted)',
              letterSpacing: '0.13em', textTransform: 'uppercase',
              fontWeight: 500, marginTop: 2,
            }}>
              AI Data Quality &amp; Governance
            </div>
          </div>

        </div>

        {/* Global search */}
        <GlobalSearch />

        {/* Right side controls */}
        <TopBarConnectionSelector />
        <NotificationBell />
        <ThemeToggle />
      </header>

      {/* ── Sidebar icon rail ── */}
      <nav style={{
        position: 'fixed', left: 0, top: TOP_H, bottom: 0,
        width: RAIL_W,
        background: 'var(--nav-bg)',
        display: 'flex', flexDirection: 'column',
        zIndex: 55,
        borderRight: '1px solid var(--nav-border)',
        overflowY: 'auto',
      }}>
        <div style={{ paddingTop: 8, paddingBottom: 8 }}>
          {sections.map((s, sIdx) => {
            const isActive = activeSectionKey === s.key

            return (
              <div key={s.key}>
                <Link href={s.defaultHref} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: '8px 0',
                    background: isActive ? 'var(--nav-item-active-bg)' : 'transparent',
                    color: isActive ? 'var(--nav-accent)' : 'var(--nav-text)',
                    transition: 'all 0.15s',
                    cursor: 'pointer',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <I d={s.railIconD} size={20} />
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: isActive ? 600 : 500,
                      textAlign: 'center', lineHeight: '11px',
                    }}>
                      {s.label}
                    </span>
                  </div>
                </Link>

                {sIdx < sections.length - 1 && (
                  <div style={{ height: 1, background: 'var(--nav-section-divider)', margin: '4px 12px' }} />
                )}
              </div>
            )
          })}
        </div>

      </nav>
    </>
  )
}
