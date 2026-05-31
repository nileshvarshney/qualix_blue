'use client'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'
import SectionTabBar from '@/components/ui/SectionTabBar'

// Must match src/app/* auth route segments — update when adding /register, /reset-password, etc.
const AUTH_ROUTES = ['/login']

export default function ShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (isAuth) return <>{children}</>

  return (
    <>
      <Sidebar />
      <main style={{
        marginLeft: '72px',
        marginTop: '56px',
        minHeight: 'calc(100vh - 56px)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <SectionTabBar />
        {children}
      </main>
      <AgentChat />
    </>
  )
}
