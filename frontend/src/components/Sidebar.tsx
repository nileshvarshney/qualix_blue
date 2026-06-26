'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { loadConnections } from '@/lib/seedData'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from '@/lib/apiFetch'

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

function publishActiveConn(id: string | null) {
  try { localStorage.setItem(ACTIVE_CONN_KEY, id ?? '__all__') } catch {}
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
    if (saved === '__all__' && activeConns.length > 1) {
      setActiveId(null)
      publishActiveConn(null)
      return
    }
    const keep = saved && saved !== '__all__' && activeConns.find(c => c.id === saved)
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

  function selectConn(id: string | null) {
    setActiveId(id)
    setOpen(false)
    publishActiveConn(id)
  }

  const active = connections.find(c => c.id === activeId)

  async function handleRefresh() {
    if (!active) return
    setRefreshing(true)
    try {
      await apiFetch('/api/connections/test', {
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
        <span style={{ fontSize: '14px' }}>{activeId === null ? '📊' : (active ? (connIcons[active.type] ?? '🔗') : '🔗')}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {activeId === null ? 'All Connections' : (active?.name ?? 'Select')}
        </span>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: activeId === null ? '#3b82f6' : '#16a34a', flexShrink: 0 }} />
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
          {connections.length > 1 && (
            <button onClick={() => selectConn(null)} style={{
              display: 'flex', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: activeId === null ? 'var(--accent-bg)' : 'var(--surface)', border: 'none',
              alignItems: 'center', gap: '10px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '15px' }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: activeId === null ? 600 : 400, color: activeId === null ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {activeId === null && '✓ '}All Connections
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>View consolidated metrics</div>
              </div>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6' }} />
            </button>
          )}
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
      const data = await apiFetch('/api/notifications').then(r => r.json()).catch(() => [])
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
    await apiFetch('/api/notifications?action=read-all', { method: 'POST' }).catch(() => {})
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
  }

  const markOne = async (id: string) => {
    await apiFetch(`/api/notifications?id=${id}`, { method: 'POST' }).catch(() => {})
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
    key: 'govern', label: 'Governance', defaultHref: '/catalog',
    railIconD: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z',
  },
  {
    key: 'operations', label: 'Operations', defaultHref: '/command-center',
    railIconD: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    key: 'admin', label: 'Admin', defaultHref: '/users',
    railIconD: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 100 8 4 4 0 000-8z',
  },
]

/* Maps every known route to its parent section key */
const SECTION_KEY_MAP: Record<string, string> = {
  '/': 'quality', '/rules': 'quality', '/issues': 'quality', '/datasets': 'quality', '/asset-registry': 'quality',
  '/anomalies': 'quality', '/schedules': 'quality', '/execution-logs': 'quality',
  '/lineage': 'govern', '/catalog': 'govern', '/governance': 'govern',
  '/glossary': 'govern', '/contracts': 'govern', '/data-products': 'govern', '/slas': 'govern', '/domains': 'govern',
  '/alerts': 'operations', '/incidents': 'operations', '/audit-logs': 'operations', '/observability': 'operations',
  '/command-center': 'operations', '/pipelines': 'operations', '/cost': 'operations',
  '/data-browser': 'explore', '/spot-check': 'explore', '/reports': 'explore',
  '/executive': 'explore',
  '/compliance': 'govern', '/privacy': 'govern',
  '/scan-jobs': 'operations', '/run-history': 'operations',
  '/users': 'admin', '/teams': 'admin', '/roles': 'admin',
  '/connections': 'admin', '/security': 'admin', '/notifications': 'admin',
  '/api-keys': 'admin', '/integrations': 'admin', '/llm': 'admin',
  '/workspace': 'admin', '/under-development': 'admin', '/architecture': 'admin',
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
        apiFetch(`/api/catalog?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        apiFetch(`/api/issues?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        apiFetch(`/api/anomalies?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        apiFetch(`/api/glossary?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
        apiFetch(`/api/contracts?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
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

/* ─── User Guide data ─── */
const GUIDE_STEPS = [
  { id: 'sources', label: 'Data Sources', icon: '🗄️', color: '#6366f1', description: 'Connect any data source. DataGuard reads metadata and samples rows without moving your data.', flow: 'Your data stays in place. We connect via read-only credentials and pull only what is needed for checks.', items: ['Snowflake', 'BigQuery', 'PostgreSQL', 'MySQL', 'MongoDB', 'REST API', 'CSV / File'] },
  { id: 'connections', label: 'Connections', icon: '🔗', color: '#0ea5e9', description: 'Secure, tested connections store credentials and continuously monitor reachability.', flow: 'Credentials are Fernet-encrypted at rest. Schema is auto-discovered and kept in sync. Connection health is checked every 5 minutes.', items: ['Credential store (Fernet-encrypted)', 'Connection test', 'Schema discovery', 'Metadata sync', 'Status monitoring'] },
  { id: 'catalog', label: 'Catalog & Lineage', icon: '📚', color: '#8b5cf6', description: 'All assets are catalogued with lineage, ownership, quality scores, and business context.', flow: 'Lineage is built by parsing SQL and view definitions with sqlglot. Every upstream/downstream dependency is tracked.', items: ['Full-text catalog search', 'Column profiling + stats', 'SQL-parsed lineage graph', 'Business domains + ownership', 'Glossary terms + approval'] },
  { id: 'rules', label: 'Rules Engine', icon: '🛡️', color: '#f59e0b', description: 'Define quality rules declaratively — no code needed. AI Assistant can generate rules from natural language.', flow: 'Rules are versioned: every change snapshots the previous state. The approval workflow (draft → pending_review → active) requires a domain_owner or admin to approve.', items: ['NOT NULL checks', 'Uniqueness', 'Range / regex', 'Freshness SLAs', 'Referential integrity', 'Custom SQL', 'AI rule suggestions'] },
  { id: 'scheduler', label: 'Scheduler', icon: '📅', color: '#14b8a6', description: 'Run quality checks on any cadence — from real-time to weekly — or trigger from pipeline events.', flow: 'Schedules are stored per connection. Checks fan out in parallel across rules for that dataset, then aggregate results.', items: ['Cron schedules', 'Event triggers', 'dbt integration', 'CI/CD hooks', 'Manual runs', 'Scan jobs'] },
  { id: 'engine', label: 'Check Execution', icon: '⚡', color: '#ec4899', description: 'Checks execute as SQL directly on your database — no data extraction, no ETL.', flow: 'Each rule compiles to a SQL query that runs on your source DB. Results (pass/fail count) are returned and stored. After every run, schema drift is checked and anomaly detectors re-evaluated automatically.', items: ['SQL pushdown to source', 'asyncio parallelism', 'Timeout handling', 'Row sampling', 'Post-run drift check', 'Anomaly re-evaluation'] },
  { id: 'monitoring', label: 'Monitoring & Alerts', icon: '🔔', color: '#ef4444', description: 'AI-powered anomaly detection and configurable alerts notify your team before issues reach production.', flow: 'Quality scores are compared against z-score / IQR baselines. Schema column diffs trigger drift events. Incidents track root-cause analysis, TTD, and TTR.', items: ['Statistical anomaly detection', 'Schema drift events', 'SLA tracking', 'Alert routing', 'Slack / Email / PagerDuty', 'Incident lifecycle'] },
  { id: 'governance', label: 'Governance', icon: '⚖️', color: '#16a34a', description: 'Governance policies enforce data standards across all assets. Every policy change is reviewed and version-controlled.', flow: 'Policies evaluate assets on a sweep schedule. Violations are recorded per asset. Glossary terms follow an approval workflow.', items: ['Policy definitions (versioned)', 'Approval workflow', 'Policy violation sweep', 'Business glossary', 'Audit trail'] },
  { id: 'privacy', label: 'Privacy & Compliance', icon: '🔒', color: '#a855f7', description: 'End-to-end privacy engineering and compliance tracking built into the platform.', flow: 'Column classifications (PII, PHI) drive masking policy enforcement. DSR requests track processing through a status lifecycle.', items: ['Column masking policies', 'Data Subject Requests (DSR)', 'Consent records', 'Compliance frameworks (GDPR, HIPAA…)', 'Control mapping'] },
  { id: 'reports', label: 'Reports & Insights', icon: '📊', color: '#f97316', description: 'Comprehensive reports, scorecards, and forecasting for every stakeholder.', flow: 'Reports aggregate check results over time across completeness, validity, uniqueness, timeliness, consistency, and accuracy dimensions.', items: ['Quality scorecards', 'Dimension breakdowns', 'Forecast charts', 'Data contracts + SLA adherence', 'Executive dashboard'] },
]

const GUIDE_WORKFLOWS = [
  { title: 'How a Quality Check Runs', color: '#2563eb', steps: ['Scheduler triggers at configured time (or you click "Run Now")', 'DataGuard fetches the active rules for that dataset from PostgreSQL', 'Each rule compiles to an optimized SQL query (e.g. SELECT COUNT(*) WHERE email IS NULL)', 'SQL is sent to your Snowflake/BigQuery/PostgreSQL via the saved connection pool', 'Results (records checked, failed count, score) are returned in seconds', 'Post-run: schema drift is checked; anomaly detectors are re-evaluated', 'If score drops below threshold → alert fires → Slack/Email/PagerDuty'] },
  { title: 'How the Governance Approval Flow Works', color: '#16a34a', steps: ['Admin or domain_owner creates or edits a governance policy', 'Policy is saved with status "draft" and a version snapshot is created', 'Submitter requests approval — an ApprovalRequest record is created', 'Approver reviews the change and approves or rejects', 'On approval, policy status moves to "active" and takes effect on next sweep', 'Every action is written to audit_logs with before/after JSON'] },
  { title: 'How the AI Agent Works', color: '#0d9488', steps: ['You type a request: "Create a NOT NULL rule for email in dim_customers"', 'Agent uses tool_use to call list_connections() and list_rules() to understand context', 'Agent calls create_rule() with the correct parameters — no form-filling needed', 'Agent confirms the action and shows the created rule', 'You can ask "Run all checks on Snowflake now" → agent calls run_checks()', 'Agent reads results and summarizes: "3 rules failed — here are the details"'] },
  { title: 'How Anomaly Detection Works', color: '#dc2626', steps: ['Every check execution stores a quality score timestamped in dq_rule_runs', 'AnomalyDetector is configured per column with type: zscore, iqr, or threshold', 'Training computes a rolling baseline from the last N executions', 'On each run, post_run_service re-evaluates all active detectors', 'Volume anomalies: row count compared to same-day-of-week 4-week average', 'AnomalyDetection record written with delta, severity, and AI explanation'] },
]

/* ─── User Guide Modal ─── */
function UserGuideModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<typeof GUIDE_STEPS[0] | null>(null)
  const [wfOpen, setWfOpen] = useState<number | null>(0)

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: '90vw', maxWidth: 1100,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)' }}>Architecture &amp; User Guide</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>End-to-end data governance platform — click any component to learn how it works</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

          {/* Pipeline diagram */}
          <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 20, overflowX: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 14 }}>END-TO-END PIPELINE</div>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 900 }}>
              {GUIDE_STEPS.map((step, i) => (
                <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div
                    onClick={() => setActive(active?.id === step.id ? null : step)}
                    style={{
                      flex: 1, background: active?.id === step.id ? `${step.color}15` : 'var(--surface)',
                      border: `2px solid ${active?.id === step.id ? step.color : 'var(--border)'}`,
                      borderRadius: 10, padding: '10px 6px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{step.icon}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: active?.id === step.id ? step.color : 'var(--text-secondary)', lineHeight: '1.3' }}>{step.label}</div>
                  </div>
                  {i < GUIDE_STEPS.length - 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 2px' }}>
                      <div style={{ width: 10, height: 2, background: 'var(--border)' }} />
                      <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid var(--border)' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {active && (
              <div style={{ marginTop: 16, border: `1px solid ${active.color}40`, borderRadius: 10, padding: '16px 20px', background: `${active.color}06` }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 24 }}>{active.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: active.color }}>{active.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{active.description}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: '1.6', background: 'var(--surface)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <strong style={{ color: 'var(--foreground)' }}>How it works: </strong>{active.flow}
                    </div>
                  </div>
                  <div style={{ width: 180, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>CAPABILITIES</div>
                    {active.items.map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: active.color, fontSize: 9 }}>●</span> {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Workflows */}
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', marginBottom: 12 }}>Step-by-Step Workflows</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GUIDE_WORKFLOWS.map((wf, i) => (
              <div key={wf.title} style={{ border: `1px solid ${wfOpen === i ? wf.color + '60' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
                <div
                  onClick={() => setWfOpen(wfOpen === i ? null : i)}
                  style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: wfOpen === i ? `${wf.color}08` : 'transparent' }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: wfOpen === i ? wf.color : 'var(--foreground)' }}>{wf.title}</div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{wfOpen === i ? '▲' : '▼'}</span>
                </div>
                {wfOpen === i && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {wf.steps.map((step, si) => (
                      <div key={si} style={{ display: 'flex', gap: 10, paddingBottom: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: wf.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{si + 1}</div>
                          {si < wf.steps.length - 1 && <div style={{ width: 2, flex: 1, background: `${wf.color}30`, minHeight: 10, margin: '2px 0' }} />}
                        </div>
                        <div style={{ flex: 1, paddingTop: 3, paddingBottom: si < wf.steps.length - 1 ? 6 : 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: '1.5' }}>{step}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}

/* ─── User Menu ─── */
function UserMenu() {
  const { user, logout, updateUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'profile'>('menu')
  const [popupPos, setPopupPos] = useState<{ bottom: number; left: number } | null>(null)
  const [dark, setDark] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [form, setForm] = useState({ full_name: '', timezone: '' })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setDark(localStorage.getItem('qualix-theme') === 'dark')
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.closest('[data-user-menu]')?.contains(e.target as Node)) {
        setOpen(false)
        setView('menu')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!user) return null

  const initials = user.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  function handleOpen() {
    if (open) { setOpen(false); setView('menu'); return }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopupPos({ bottom: window.innerHeight - rect.bottom, left: rect.right + 8 })
    }
    setView('menu')
    setOpen(true)
  }

  function goToProfile() {
    let savedTz = ''
    try {
      const stored = localStorage.getItem('qualix_profile')
      if (stored) savedTz = JSON.parse(stored).timezone ?? ''
    } catch { }
    setForm({ full_name: user?.full_name ?? '', timezone: savedTz })
    setSaveStatus('idle')
    setView('profile')
  }

  async function saveProfile() {
    setSaving(true)
    setSaveStatus('idle')
    const payload = { full_name: form.full_name.trim(), timezone: form.timezone }
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null) // backend failure is non-fatal — localStorage is the fallback
    } catch { /* ignore */ }
    // Always persist locally and update context so UI reflects the change
    try { localStorage.setItem('qualix_profile', JSON.stringify(payload)) } catch { }
    updateUser({ full_name: payload.full_name })
    setSaving(false)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2500)
  }

  function toggleTheme() {
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

  const menuRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9,
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '6px 4px', borderRadius: 6, width: '100%',
    color: 'var(--text-secondary)', fontSize: 12, textAlign: 'left',
  }

  return (
    <div data-user-menu="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={user.full_name ?? user.email}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--brand-primary)', color: '#fff',
          border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, outline: open ? '2px solid var(--accent-bg)' : 'none',
          outlineOffset: 2,
        }}
      >
        {initials}
      </button>

      <button
        onClick={logout}
        title="Sign out"
        style={{
          width: 36, height: 28, borderRadius: 6,
          background: '#fee2e2', border: '1px solid #fca5a5',
          cursor: 'pointer', color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 4, fontSize: 10, fontWeight: 600, flexShrink: 0,
        }}
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>

      {open && popupPos && (
        <div style={{
          position: 'fixed', bottom: popupPos.bottom, left: popupPos.left,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
          width: view === 'profile' ? 280 : 220, zIndex: 300, overflow: 'hidden',
        }}>

          {/* ── Profile view ── */}
          {view === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => setView('menu')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Profile</span>
              </div>

              {/* Avatar + read-only info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 10px' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--brand-primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700,
                }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
                    {user.role}
                  </div>
                </div>
              </div>

              {/* Editable fields */}
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Full Name */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                    Full Name
                  </label>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Your name"
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', fontSize: 12,
                      color: 'var(--foreground)', background: 'var(--surface-muted)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Timezone dropdown */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                    Timezone
                  </label>
                  <select
                    value={form.timezone}
                    onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', fontSize: 12,
                      color: 'var(--foreground)', background: 'var(--surface-muted)',
                      outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
                    }}
                  >
                    <option value="">— Select timezone —</option>
                    <optgroup label="Americas">
                      <option value="America/New_York">Eastern Time (New York)</option>
                      <option value="America/Chicago">Central Time (Chicago)</option>
                      <option value="America/Denver">Mountain Time (Denver)</option>
                      <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
                      <option value="America/Anchorage">Alaska (Anchorage)</option>
                      <option value="Pacific/Honolulu">Hawaii (Honolulu)</option>
                      <option value="America/Toronto">Eastern Time (Toronto)</option>
                      <option value="America/Vancouver">Pacific Time (Vancouver)</option>
                      <option value="America/Sao_Paulo">Brazil (São Paulo)</option>
                      <option value="America/Mexico_City">Mexico City</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Paris (CET)</option>
                      <option value="Europe/Berlin">Berlin (CET)</option>
                      <option value="Europe/Amsterdam">Amsterdam (CET)</option>
                      <option value="Europe/Madrid">Madrid (CET)</option>
                      <option value="Europe/Rome">Rome (CET)</option>
                      <option value="Europe/Helsinki">Helsinki (EET)</option>
                      <option value="Europe/Istanbul">Istanbul (TRT)</option>
                      <option value="Europe/Moscow">Moscow (MSK)</option>
                    </optgroup>
                    <optgroup label="Asia / Pacific">
                      <option value="Asia/Dubai">Dubai (GST)</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Asia/Dhaka">Bangladesh (BST)</option>
                      <option value="Asia/Bangkok">Bangkok (ICT)</option>
                      <option value="Asia/Singapore">Singapore (SGT)</option>
                      <option value="Asia/Shanghai">China (CST)</option>
                      <option value="Asia/Tokyo">Japan (JST)</option>
                      <option value="Asia/Seoul">Korea (KST)</option>
                      <option value="Australia/Sydney">Sydney (AEST)</option>
                      <option value="Australia/Melbourne">Melbourne (AEST)</option>
                      <option value="Pacific/Auckland">New Zealand (NZST)</option>
                    </optgroup>
                    <optgroup label="Africa">
                      <option value="Africa/Cairo">Cairo (EET)</option>
                      <option value="Africa/Johannesburg">Johannesburg (SAST)</option>
                      <option value="Africa/Lagos">Lagos (WAT)</option>
                      <option value="Africa/Nairobi">Nairobi (EAT)</option>
                    </optgroup>
                    <optgroup label="UTC">
                      <option value="UTC">UTC</option>
                    </optgroup>
                  </select>
                </div>

                <button
                  onClick={saveProfile}
                  disabled={saving}
                  style={{
                    marginTop: 2, padding: '8px 0', borderRadius: 7, border: 'none',
                    background: saveStatus === 'saved' ? '#16a34a' : 'var(--brand-primary)',
                    color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1, transition: 'background 0.2s',
                  }}
                >
                  {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── Main menu view ── */}
          {view === 'menu' && (
            <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column' }}>
              {/* User summary */}
              <div style={{ padding: '4px 4px 10px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.full_name ?? user.email}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {user.email}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>
                  {user.role}
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 0 6px' }} />

              {/* Profile */}
              <button onClick={goToProfile} style={menuRowStyle}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* User Guide */}
              <button onClick={() => { setOpen(false); setShowGuide(true) }} style={menuRowStyle}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                </svg>
                User Guide
              </button>

              {/* Theme toggle */}
              <button onClick={toggleTheme} style={menuRowStyle}>
                {dark ? (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
                {dark ? 'Switch to Light' : 'Switch to Dark'}
                <span style={{
                  marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
                  width: 32, height: 18, borderRadius: 9,
                  background: dark ? 'var(--brand-primary)' : 'var(--border)',
                  transition: 'background 0.2s', flexShrink: 0, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: '#fff',
                    left: dark ? 'calc(100% - 14px)' : '2px',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </span>
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

              {/* Sign out */}
              <button onClick={() => { setOpen(false); logout() }} style={{ ...menuRowStyle, color: '#dc2626' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          )}

        </div>
      )}

      {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  )
}

/* ─── Component ─── */
export default function Sidebar() {
  const pathname = usePathname()
  const activeSectionKey =
    SECTION_KEY_MAP[pathname] ??
    (pathname.startsWith('/scan-jobs/') ? 'operations' : null) ??
    (pathname.startsWith('/pipelines/') ? 'operations' : null) ??
    (pathname.startsWith('/command-center/') ? 'operations' : null) ??
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

        {/* ── User info + logout ── */}
        <div style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--nav-border)',
          padding: '12px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <UserMenu />
        </div>

      </nav>
    </>
  )
}
