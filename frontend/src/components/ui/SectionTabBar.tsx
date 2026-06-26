'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { NotificationBadge } from '@/components/nav/NotificationBadge'
import { apiFetch } from '@/lib/apiFetch'

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
    key: 'operations',
    tabs: [
      { href: '/command-center', label: 'Command Center' },
      { href: '/observability',  label: 'Observability' },
      { href: '/scan-jobs',      label: 'Scan Jobs' },
      { href: '/run-history',    label: 'Run History' },
      { href: '/pipelines',      label: 'Pipelines' },
      { href: '/alerts',         label: 'Alerts' },
      { href: '/incidents',      label: 'Incidents' },
      { href: '/cost',           label: 'Cost & Resources' },
      { href: '/audit-logs',     label: 'Audit Logs' },
    ],
  },
  {
    key: 'admin',
    tabs: [
      { href: '/users',              label: 'Users' },
      { href: '/teams',              label: 'Teams' },
      { href: '/roles',              label: 'Roles' },
      { href: '/connections',        label: 'Connections' },
      { href: '/security',           label: 'Security' },
      { href: '/notifications',      label: 'Notifications' },
      { href: '/integrations',       label: 'Integrations' },
      { href: '/api-keys',           label: 'API Keys' },
      { href: '/llm',                label: 'LLM / AI' },
      { href: '/workspace',          label: 'Workspace' },
      { href: '/under-development',  label: 'Under Development' },
    ],
  },
]

function tabMatches(tabHref: string, pathname: string): boolean {
  if (tabHref === '/') return pathname === '/'
  return pathname === tabHref || pathname.startsWith(tabHref + '/')
}

function contextualHref(tabHref: string, pathname: string, searchParams: ReturnType<typeof useSearchParams>): string {
  // FD-005: Lineage → Catalog passes current search query
  if (tabHref === '/catalog' && pathname.startsWith('/lineage')) {
    const q = searchParams.get('q')
    return q ? `/catalog?q=${encodeURIComponent(q)}` : tabHref
  }
  // FD-002: Rules → Execution Logs passes current table filter as search query
  if (tabHref === '/execution-logs' && pathname.startsWith('/rules')) {
    const table = searchParams.get('table')
    return table ? `/execution-logs?q=${encodeURIComponent(table)}` : tabHref
  }
  return tabHref
}

export default function SectionTabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
        const href = contextualHref(tab.href, pathname, searchParams)
        return (
          <Link key={tab.href} href={href} style={{ textDecoration: 'none' }}>
            <div style={{
              position: 'relative',
              padding: '11px 16px',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
              display: 'flex',
              alignItems: 'center',
            }}>
              {tab.label}
              {tab.href === '/stewardship' && <NotificationBadge />}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
