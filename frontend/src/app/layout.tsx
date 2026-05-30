import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'

export const metadata: Metadata = {
  title: 'DataGuard - Data Quality Platform',
  description: 'AI-powered data quality monitoring and management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ minHeight: '100vh', background: 'var(--background)' }}>
        <Sidebar />
        <main style={{
          marginLeft: '72px',   /* icon rail width */
          marginTop: '56px',    /* top bar height */
          minHeight: 'calc(100vh - 56px)',
          overflow: 'auto',
        }}>
          {children}
        </main>
        <AgentChat />
      </body>
    </html>
  )
}
