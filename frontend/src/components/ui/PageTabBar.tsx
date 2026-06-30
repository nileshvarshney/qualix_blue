'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { apiFetch } from '@/lib/apiFetch'

export interface PageTab {
  href: string
  label: string
}

export default function PageTabBar({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname()

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '10px 16px',
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
