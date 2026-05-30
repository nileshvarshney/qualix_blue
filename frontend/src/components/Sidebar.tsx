'use client'
import { useState, useEffect, useRef } from 'react'
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

/* ─── Top-bar Connection Selector ─── */
function TopBarConnectionSelector() {
  const [connections, setConnections] = useState<{ id: string; name: string; type: string; status: string; database?: string; host?: string }[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selectorPathname = usePathname()

  // Load connections on mount and on every route change
  useEffect(() => {
    loadConnections().then(conns => {
      if (conns.length > 0) {
        setConnections(conns)
        const active = conns.find(c => c.status === 'active')
        if (active) setActiveId(active.id)
        else setActiveId(conns[0].id)
      }
    })
  }, [selectorPathname])

  // Listen for updates from ConnectionsClient
  useEffect(() => {
    function onUpdate() {
      loadConnections().then(conns => {
        setConnections(conns)
        const active = conns.find(c => c.status === 'active')
        if (active) setActiveId(active.id)
        else if (conns.length > 0) setActiveId(conns[0].id)
      })
    }
    window.addEventListener('storage', onUpdate)
    window.addEventListener('dataguard-connections-updated', onUpdate)
    return () => {
      window.removeEventListener('storage', onUpdate)
      window.removeEventListener('dataguard-connections-updated', onUpdate)
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const active = connections.find(c => c.id === activeId)

  async function handleRefresh() {
    if (!active) return
    setRefreshing(true)
    try {
      await fetch('/api/connections/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active),
      })
      const r = await fetch('/api/connections')
      const data = await r.json()
      setConnections(Array.isArray(data) ? data : (data.connections ?? []))
    } catch {}
    setRefreshing(false)
  }

  if (connections.length === 0) {
    return (
      <Link href="/connections" style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        background: '#fff', border: '1px solid #ebe8df', padding: '5px 12px',
        borderRadius: '7px', fontSize: '12px', color: '#E8541A', fontWeight: 600,
        textDecoration: 'none',
      }}>+ Connect</Link>
    )
  }

  return (
    <div ref={ref} style={{ display: 'flex', alignItems: 'center', gap: '5px', position: 'relative' }}>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        background: '#fff', border: '1px solid #ebe8df', padding: '5px 12px',
        borderRadius: '7px', cursor: 'pointer', minWidth: '150px',
        boxShadow: open ? '0 0 0 2px #dbeafe' : 'none',
      }}>
        <span style={{ fontSize: '14px' }}>{active ? (connIcons[active.type] ?? '🔗') : '🔗'}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a1a', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {active?.name ?? 'Select'}
        </span>
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: active?.status === 'active' ? '#16a34a' : active?.status === 'error' ? '#dc2626' : '#d97706',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '9px', color: '#94a3b8', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>
      <button onClick={handleRefresh} disabled={refreshing} style={{
        background: '#fff', border: '1px solid #ebe8df', width: '30px', height: '30px',
        borderRadius: '7px', cursor: refreshing ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', opacity: refreshing ? 0.5 : 1,
      }} title="Refresh connection">
        {refreshing ? '⏳' : '🔄'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff',
          border: '1px solid #ebe8df', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100, minWidth: '240px', overflow: 'hidden',
        }}>
          {connections.map(conn => (
            <button key={conn.id} onClick={() => { setActiveId(conn.id); setOpen(false) }} style={{
              display: 'flex', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: conn.id === activeId ? '#eff6ff' : '#fff', border: 'none',
              alignItems: 'center', gap: '10px', cursor: 'pointer',
              borderBottom: '1px solid #f3f1ea',
            }}>
              <span style={{ fontSize: '15px' }}>{connIcons[conn.type] ?? '🔗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12.5px', fontWeight: conn.id === activeId ? 600 : 400, color: conn.id === activeId ? '#2563eb' : '#374151' }}>
                  {conn.id === activeId && '✓ '}{conn.name}
                </div>
                <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{conn.type} · {conn.database ?? conn.host ?? ''}</div>
              </div>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: conn.status === 'active' ? '#16a34a' : conn.status === 'error' ? '#dc2626' : '#d97706' }} />
            </button>
          ))}
          <Link href="/connections" style={{
            display: 'block', padding: '9px 14px', textAlign: 'center',
            fontSize: '12px', color: '#E8541A', fontWeight: 600,
            textDecoration: 'none', borderTop: '1px solid #ebe8df',
          }}>⚙ Manage Connections</Link>
        </div>
      )}
    </div>
  )
}

/* ─── Section definitions ─── */
type SubItem = { href: string; label: string; iconD: string; badge?: string }
type Section = {
  key: string
  label: string
  railIconD: string
  items: SubItem[]
}

const sections: Section[] = [
  {
    key: 'quality', label: 'Data Quality',
    railIconD: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9zM3 12h18',
    items: [
      { href: '/',          label: 'Overview',    iconD: 'M3 12l2-2 4 4 8-8 4 4M3 21h18' },
      { href: '/rules',     label: 'Rules',       iconD: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z', badge: '418' },
      { href: '/issues',    label: 'Issues',      iconD: 'M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z', badge: '23' },
      { href: '/datasets',  label: 'Data Assets', iconD: 'M3 5c0-1.7 4-3 9-3s9 1.3 9 3v14c0 1.7-4 3-9 3s-9-1.3-9-3V5zm0 0c0 1.7 4 3 9 3s9-1.3 9-3M3 12c0 1.7 4 3 9 3s9-1.3 9-3' },
      { href: '/anomalies', label: 'Anomalies',   iconD: 'M3 17l6-6 4 4 8-8M14 7h7v7' },
      { href: '/schedules', label: 'Schedules',   iconD: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
      // Moved to Schedules page — "Execution Logs" tab (see /app/execution-logs/page.tsx)
    ]
  },
  {
    key: 'govern', label: 'Governance',
    railIconD: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z',
    items: [
      { href: '/lineage',    label: 'Lineage',    iconD: 'M5 12h4l3-7 4 14 3-7h4' },
      { href: '/catalog',    label: 'Catalog',    iconD: 'M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20' },
      { href: '/governance', label: 'Governance', iconD: 'M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z' },
      { href: '/glossary',   label: 'Glossary',   iconD: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z' },
      { href: '/contracts',  label: 'Contracts',  iconD: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6M9 9h2' },
      // Moved to Contracts page — "SLAs" tab (see /app/slas/page.tsx)
      { href: '/domains',    label: 'Domains',    iconD: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9zM3 12h18' },
    ]
  },
  {
    key: 'alerts', label: 'Alerts',
    railIconD: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1',
    items: [
      { href: '/alerts',     label: 'Alerts',     iconD: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1' },
      // Moved to Alerts page — "Incidents" tab in PageTabBar (see /app/alerts/page.tsx)
      { href: '/audit-logs', label: 'Audit Logs', iconD: 'M9 12l2 2 4-4M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2.5 0 4.7 1 6.4 2.6' },
    ]
  },
  {
    key: 'explore', label: 'Explore',
    railIconD: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    items: [
      { href: '/data-browser',  label: 'Data Browser',  iconD: 'M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z' },
      // Moved to Data Browser page — "Spot Check" tab (see /app/spot-check/page.tsx)
      { href: '/reports',       label: 'Reports',       iconD: 'M9 19V6a1 1 0 011-1h4a1 1 0 011 1v13M5 19V11a1 1 0 011-1h3v9M19 19v-5a1 1 0 00-1-1h-3v6M3 19h18' },
      { href: '/data-products', label: 'Data Products', iconD: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      // Moved to Reports page — "Executive View" tab (see /app/executive/page.tsx)
    ]
  },
  {
    key: 'settings', label: 'Settings',
    railIconD: 'M10.3 3.5l-.4 1.7a7.5 7.5 0 00-1.6.7L6.6 5l-1.6 1.6 1 1.7c-.3.5-.5 1-.7 1.6l-1.7.4v2.3l1.7.4c.2.6.4 1.1.7 1.6l-1 1.7L6.6 19l1.7-.9c.5.3 1 .5 1.6.7l.4 1.7h2.3l.4-1.7c.6-.2 1.1-.4 1.6-.7l1.7.9 1.6-1.6-.9-1.7c.3-.5.5-1 .7-1.6l1.7-.4v-2.3l-1.7-.4c-.2-.6-.4-1.1-.7-1.6l.9-1.7-1.6-1.6-1.7.9c-.5-.3-1-.5-1.6-.7l-.4-1.7h-2.3zm1.2 5.5a3 3 0 110 6 3 3 0 010-6z',
    items: [
      { href: '/ai-assistant', label: 'AI Assistant', iconD: 'M12 2a3 3 0 00-3 3v1H7a2 2 0 00-2 2v3H4a2 2 0 000 4h1v3a2 2 0 002 2h2v1a3 3 0 006 0v-1h2a2 2 0 002-2v-3h1a2 2 0 000-4h-1V8a2 2 0 00-2-2h-2V5a3 3 0 00-3-3z' },
      { href: '/settings',     label: 'Settings',     iconD: 'M10.3 3.5l-.4 1.7a7.5 7.5 0 00-1.6.7L6.6 5l-1.6 1.6 1 1.7c-.3.5-.5 1-.7 1.6l-1.7.4v2.3l1.7.4c.2.6.4 1.1.7 1.6l-1 1.7L6.6 19l1.7-.9c.5.3 1 .5 1.6.7l.4 1.7h2.3l.4-1.7c.6-.2 1.1-.4 1.6-.7l1.7.9 1.6-1.6-.9-1.7c.3-.5.5-1 .7-1.6l1.7-.4v-2.3l-1.7-.4c-.2-.6-.4-1.1-.7-1.6l.9-1.7-1.6-1.6-1.7.9c-.5-.3-1-.5-1.6-.7l-.4-1.7h-2.3zm1.2 5.5a3 3 0 110 6 3 3 0 010-6z' },
      // Moved to Settings page — "Compliance" tab (see /app/compliance/page.tsx)
      // Moved to Settings page — "User Guide" tab (see /app/architecture/page.tsx)
    ]
  },
]

/* ─── Constants ─── */
const RAIL_W    = 72
const EXPAND_W  = 240
const PANEL_W   = 220
const TOP_H     = 56

function sectionForPath(pathname: string): string {
  for (const s of sections) {
    if (s.items.some(i => i.href === pathname)) return s.key
  }
  return sections[0].key
}

/* ─── Component ─── */
export default function Sidebar() {
  const pathname = usePathname()

  // Hamburger expanded mode (accordion)
  const [expanded, setExpanded] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set([sectionForPath(pathname)]))
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Flyout panel mode (icon click when collapsed)
  const [flyoutSection, setFlyoutSection] = useState<string | null>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)

  // Close expanded on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-hamburger]')) return

      if (expanded && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
      if (flyoutSection && flyoutRef.current && !flyoutRef.current.contains(e.target as Node)
          && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setFlyoutSection(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expanded, flyoutSection])

  // Close on route change
  useEffect(() => { setExpanded(false); setFlyoutSection(null) }, [pathname])

  // Close flyout when hamburger expands
  useEffect(() => { if (expanded) setFlyoutSection(null) }, [expanded])

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const s = new Set(prev)
      if (s.has(key)) s.delete(key); else s.add(key)
      return s
    })
  }

  function handleIconClick(sectionKey: string) {
    if (expanded) {
      // In expanded mode: toggle accordion
      toggleSection(sectionKey)
    } else {
      // In collapsed mode: open flyout panel next to rail
      if (flyoutSection === sectionKey) {
        setFlyoutSection(null)
      } else {
        setFlyoutSection(sectionKey)
      }
    }
  }

  const sidebarWidth = expanded ? EXPAND_W : RAIL_W
  const flyoutSectionData = flyoutSection ? sections.find(s => s.key === flyoutSection) : null

  return (
    <>
      {/* ── Top bar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: TOP_H,
        background: '#ffffff',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 14,
        zIndex: 60,
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* Hamburger */}
        <button
          data-hamburger="true"
          onClick={() => { setExpanded(!expanded); setFlyoutSection(null) }}
          style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo icon */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--brand-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(232,84,26,0.3)',
          flexShrink: 0,
        }}>
          <svg width="22" height="13" viewBox="0 0 48 28" fill="none">
            <path d="M14 4 C6 4 2 9 2 14 C2 19 6 24 14 24 C19 24 23 21 25 17 C23 21 27 24 34 24 C42 24 46 19 46 14 C46 9 42 4 34 4 C27 4 23 7 25 11 C23 7 19 4 14 4 Z"
              fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="5" y1="14" x2="22" y2="14" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Brand name */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, flex: 1 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.5px' }}>Data</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-primary)', letterSpacing: '-0.5px' }}>Guard</span>
        </div>

        {/* Connection selector — right side */}
        <TopBarConnectionSelector />
      </header>

      {/* ── Overlay when expanded or flyout open ── */}
      {(expanded || flyoutSection) && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.12)',
          zIndex: 49,
          transition: 'opacity 0.2s',
        }} onClick={() => { setExpanded(false); setFlyoutSection(null) }} />
      )}

      {/* ── Sidebar (icon rail / expanded accordion) ── */}
      <nav
        ref={sidebarRef}
        style={{
          position: 'fixed', left: 0, top: TOP_H, bottom: 0,
          width: sidebarWidth,
          background: 'var(--nav-bg)',
          display: 'flex', flexDirection: 'column',
          zIndex: 55,
          borderRight: '1px solid var(--nav-border)',
          overflowY: 'auto', overflowX: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: expanded ? '4px 0 16px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <div style={{ paddingTop: 8, paddingBottom: 8 }}>
          {sections.map((s, sIdx) => {
            const hasActivePage = s.items.some(i => i.href === pathname)
            const isOpen = openSections.has(s.key)
            const isFlyoutActive = flyoutSection === s.key

            return (
              <div key={s.key}>
                {/* ── Section button (icon + label) ── */}
                <button
                  onClick={() => handleIconClick(s.key)}
                  style={{
                    width: '100%', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: expanded ? 'row' : 'column',
                    alignItems: 'center',
                    gap: expanded ? 10 : 2,
                    padding: expanded ? '9px 14px' : '8px 0',
                    background: isFlyoutActive
                      ? 'var(--nav-item-active-bg)'
                      : (hasActivePage && !expanded)
                        ? 'var(--nav-item-active-bg)'
                        : (expanded && isOpen)
                          ? 'var(--nav-item-hover-bg)'
                          : 'transparent',
                    color: (isFlyoutActive || hasActivePage) ? 'var(--nav-accent)' : 'var(--nav-text)',
                    transition: 'all 0.15s',
                    justifyContent: expanded ? 'flex-start' : 'center',
                  }}
                >
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: expanded ? 20 : 24,
                    flexShrink: 0,
                  }}>
                    <I d={s.railIconD} size={expanded ? 18 : 20} />
                  </span>

                  {/* Label — always visible */}
                  <span style={{
                    fontSize: expanded ? 12.5 : 9,
                    fontWeight: (hasActivePage || isFlyoutActive) ? 600 : expanded ? 450 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: expanded ? 1 : undefined,
                    textAlign: expanded ? 'left' : 'center',
                    lineHeight: expanded ? '18px' : '11px',
                    color: (hasActivePage || isFlyoutActive) ? 'var(--nav-accent)' : expanded ? 'var(--nav-text-active)' : 'var(--nav-text)',
                  }}>
                    {s.label}
                  </span>

                  {/* Expand arrow — only in expanded (hamburger) mode */}
                  {expanded && (
                    <span style={{
                      fontSize: 10, color: 'var(--text-muted)',
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}>▶</span>
                  )}
                </button>

                {/* ── Sub-items (only when expanded + section is open) ── */}
                {expanded && isOpen && (
                  <div style={{ paddingBottom: 4 }}>
                    {s.items.map(item => {
                      const isItemActive = pathname === item.href
                      return (
                        <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 14px 7px 44px',
                            background: isItemActive ? 'var(--nav-item-active-bg)' : 'transparent',
                            color: isItemActive ? 'var(--nav-accent)' : 'var(--nav-text)',
                            fontSize: 12, fontWeight: isItemActive ? 600 : 400,
                            transition: 'all 0.1s', cursor: 'pointer',
                            borderLeft: isItemActive ? '2px solid var(--nav-accent)' : '2px solid transparent',
                          }}>
                            <span style={{ display: 'flex', opacity: isItemActive ? 1 : 0.5, flexShrink: 0 }}>
                              <I d={item.iconD} size={15} />
                            </span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                            {item.badge && (
                              <span style={{
                                background: isItemActive ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
                                color: isItemActive ? 'var(--nav-accent)' : 'var(--nav-text)',
                                padding: '1px 7px', borderRadius: 20,
                                fontSize: 10, fontWeight: 600,
                              }}>{item.badge}</span>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}

                {/* Divider between sections */}
                {sIdx < sections.length - 1 && (
                  <div style={{
                    height: 1,
                    background: 'var(--nav-section-divider)',
                    margin: expanded ? '4px 14px' : '4px 12px',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Footer — only in expanded mode */}
        {expanded && (
          <div style={{
            padding: '12px 16px', marginTop: 'auto',
            borderTop: '1px solid var(--nav-border)',
            background: 'var(--nav-footer-bg)',
          }}>
            <div style={{
              fontSize: 10.5, color: 'var(--nav-text)',
              textAlign: 'center', letterSpacing: '0.03em',
            }}>
              DataGuard v3.0
            </div>
          </div>
        )}
      </nav>

      {/* ── Flyout panel (icon click when collapsed) ── */}
      <div
        ref={flyoutRef}
        style={{
          position: 'fixed',
          left: RAIL_W,
          top: TOP_H,
          bottom: 0,
          width: PANEL_W,
          background: 'var(--nav-flyout-bg)',
          borderRight: '1px solid var(--nav-border)',
          boxShadow: flyoutSection ? '6px 0 20px rgba(0,0,0,0.06)' : 'none',
          transform: flyoutSection ? 'translateX(0)' : `translateX(-${PANEL_W + 10}px)`,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 54,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {flyoutSectionData && (
          <>
            {/* Section heading */}
            <div style={{
              padding: '18px 20px 14px',
              borderBottom: '1px solid var(--nav-border)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--nav-text-active)', fontSize: 15, fontWeight: 700,
                letterSpacing: '-0.3px',
              }}>
                <span style={{ color: 'var(--nav-accent)', display: 'flex' }}>
                  <I d={flyoutSectionData.railIconD} size={16} />
                </span>
                {flyoutSectionData.label}
              </div>
            </div>

            {/* Sub-items */}
            <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
              {flyoutSectionData.items.map(item => {
                const isItemActive = pathname === item.href
                return (
                  <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', borderRadius: 8, marginBottom: 3,
                      background: isItemActive ? 'var(--nav-item-active-bg)' : 'transparent',
                      color: isItemActive ? 'var(--nav-accent)' : 'var(--nav-text)',
                      fontSize: 13, fontWeight: isItemActive ? 600 : 450,
                      transition: 'all 0.15s', cursor: 'pointer',
                      borderLeft: isItemActive ? '2px solid var(--nav-accent)' : '2px solid transparent',
                      paddingLeft: isItemActive ? '12px' : '14px',
                    }}>
                      <span style={{ display: 'flex', opacity: isItemActive ? 1 : 0.6, flexShrink: 0 }}>
                        <I d={item.iconD} size={16} />
                      </span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          background: isItemActive ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
                          color: isItemActive ? 'var(--nav-accent)' : 'var(--nav-text)',
                          padding: '2px 8px', borderRadius: 20,
                          fontSize: 10.5, fontWeight: 600, minWidth: 22, textAlign: 'center',
                        }}>{item.badge}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </nav>

            {/* Footer */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--nav-border)',
              background: 'var(--nav-footer-bg)',
            }}>
              <div style={{
                fontSize: 10.5, color: 'var(--nav-text)',
                textAlign: 'center', letterSpacing: '0.03em',
              }}>
                DataGuard v3.0
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
