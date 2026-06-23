'use client'
import { type ReactNode, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'
import SectionTabBar from '@/components/ui/SectionTabBar'

// Must match src/app/* auth route segments — update when adding /register, /reset-password, etc.
const AUTH_ROUTES = ['/login']

export default function ShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isLoading } = useAuth()
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (isAuth) return <>{children}</>

  // Prevent protected content flashing while the cold-start token check runs
  if (isLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--background)',
      }}>
        <div style={{
          width: 32, height: 32,
          border: '3px solid #e2e8f0',
          borderTopColor: '#FF9050',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <>
      <Sidebar />
      <main style={{
        marginLeft: '72px',
        marginTop: '56px',
        height: 'calc(100vh - 56px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Suspense fallback={null}><SectionTabBar /></Suspense>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>
      </main>
      <AgentChat />
    </>
  )
}
