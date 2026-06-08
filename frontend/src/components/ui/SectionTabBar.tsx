'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = { href: string; label: string }
type Section = { key: string; tabs: Tab[] }

const SECTIONS: Section[] = [
  {
    key: 'quality',
    tabs: [
      { href: '/',               label: 'Overview' },
      { href: '/rules',          label: 'Rules' },
      { href: '/issues',         label: 'Issues' },
      { href: '/asset-registry', label: 'Asset Registry' },
      { href: '/anomalies',      label: 'Anomalies' },
      { href: '/schedules',      label: 'Schedules' },
      { href: '/execution-logs', label: 'Execution Logs' },
    ],
  },
  {
    key: 'govern',
    tabs: [
      { href: '/lineage',    label: 'Lineage' },
      { href: '/catalog',    label: 'Catalog' },
      { href: '/governance', label: 'Governance' },
      { href: '/glossary',   label: 'Glossary' },
      { href: '/contracts',  label: 'Contracts' },
      { href: '/slas',       label: 'SLAs' },
      { href: '/domains',    label: 'Domains' },
    ],
  },
  {
    key: 'alerts',
    tabs: [
      { href: '/alerts',     label: 'Alerts' },
      { href: '/incidents',  label: 'Incidents' },
      { href: '/audit-logs', label: 'Audit Logs' },
    ],
  },
  {
    key: 'explore',
    tabs: [
      { href: '/data-browser',  label: 'Data Browser' },
      { href: '/spot-check',    label: 'Spot Check' },
      { href: '/reports',       label: 'Reports' },
      { href: '/executive',     label: 'Executive View' },
      { href: '/data-products', label: 'Data Products' },
    ],
  },
  {
    key: 'settings',
    tabs: [
      { href: '/ai-assistant', label: 'AI Assistant' },
      { href: '/settings',     label: 'General' },
      { href: '/compliance',   label: 'Compliance' },
      { href: '/architecture', label: 'User Guide' },
    ],
  },
]

export default function SectionTabBar() {
  const pathname = usePathname()
  const section = SECTIONS.find(s => s.tabs.some(t => t.href === pathname))
  if (!section) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      paddingLeft: '24px',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {section.tabs.map(tab => {
        const isActive = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '11px 16px',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}>
              {tab.label}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
