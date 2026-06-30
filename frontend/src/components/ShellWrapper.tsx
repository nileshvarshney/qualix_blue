'use client'
import { type ReactNode, Suspense, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'
import SectionTabBar from '@/components/ui/SectionTabBar'
import { apiFetch } from '@/lib/apiFetch'

// Must match src/app/* auth route segments — update when adding /register, /reset-password, etc.
const AUTH_ROUTES = ['/login']

const SPINNER = (
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

export default function ShellWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isLoading, isAuthenticated } = useAuth()
  const isAuth = AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isAuth) {
      const returnUrl = encodeURIComponent(pathname + window.location.search)
      const expired = sessionStorage.getItem('session_expired') === '1'
      if (expired) sessionStorage.removeItem('session_expired')
      const reason = expired ? '&reason=session_expired' : ''
      router.replace(`/login?returnUrl=${returnUrl}${reason}`)
    }
  }, [isLoading, isAuthenticated, isAuth, pathname, router])

  if (isAuth) return <>{children}</>

  // Prevent protected content flashing while the cold-start token check runs or during redirect
  if (isLoading || !isAuthenticated) return SPINNER

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
