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
      { href: '/asset-registry', label: 'Asset Registry' },
      { href: '/rules',          label: 'Rules' },
      { href: '/schedules',      label: 'Schedules' },
      { href: '/execution-logs', label: 'Execution Logs' },
      { href: '/anomalies',      label: 'Anomalies' },
      { href: '/issues',         label: 'Issues' },
    ],
  },
  {
    key: 'govern',
    tabs: [
      { href: '/catalog',       label: 'Catalog' },
      { href: '/lineage',       label: 'Lineage' },
      { href: '/domains',       label: 'Domains' },
      { href: '/glossary',      label: 'Glossary' },
      { href: '/governance',    label: 'Governance' },
      { href: '/stewardship',   label: 'Stewardship' },
      { href: '/contracts',     label: 'Contracts' },
      { href: '/data-products', label: 'Data Products' },
      { href: '/slas',          label: 'SLAs' },
      { href: '/compliance',    label: 'Compliance' },
      { href: '/privacy',       label: 'Privacy' },
    ],
  },
  {
    key: 'explore',
    tabs: [
      { href: '/data-browser', label: 'Data Browser' },
      { href: '/spot-check',   label: 'Spot Check' },
      { href: '/reports',      label: 'Reports' },
      { href: '/executive',    label: 'Executive View' },
    ],
  },
  {
    key: 'settings',
    tabs: [
      { href: '/settings',     label: 'General' },
      { href: '/architecture', label: 'User Guide' },
    ],
  },
  {
    key: 'operations',
    tabs: [
      { href: '/observability', label: 'Observability' },
      { href: '/scan-jobs',     label: 'Scan Jobs' },
      { href: '/run-history',   label: 'Run History' },
      { href: '/alerts',        label: 'Alerts' },
      { href: '/incidents',     label: 'Incidents' },
      { href: '/audit-logs',    label: 'Audit Logs' },
    ],
  },
  {
    key: 'admin',
    tabs: [
      { href: '/users',         label: 'Users' },
      { href: '/teams',         label: 'Teams' },
      { href: '/roles',         label: 'Roles' },
      { href: '/connections',   label: 'Connections' },
      { href: '/security',      label: 'Security' },
      { href: '/notifications', label: 'Notifications' },
      { href: '/integrations',  label: 'Integrations' },
      { href: '/api-keys',      label: 'API Keys' },
      { href: '/llm',           label: 'LLM / AI' },
    ],
  },
]

function tabMatches(tabHref: string, pathname: string): boolean {
  if (tabHref === '/') return pathname === '/'
  return pathname === tabHref || pathname.startsWith(tabHref + '/')
}

export default function SectionTabBar() {
  const pathname = usePathname()
  const section = SECTIONS.find(s => s.tabs.some(t => tabMatches(t.href, pathname)))
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
        const isActive = tabMatches(tab.href, pathname)
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
