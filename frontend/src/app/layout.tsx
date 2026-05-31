import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AgentChat from '@/components/agent/AgentChat'
import SectionTabBar from '@/components/ui/SectionTabBar'

export const metadata: Metadata = {
  title: 'Qualix — AI Data Quality & Governance',
  description: 'AI-powered data quality monitoring, governance, and management',
}

const themeInitScript = `(function(){try{var t=localStorage.getItem('qualix-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body style={{ minHeight: '100vh', background: 'var(--background)' }}>
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
      </body>
    </html>
  )
}
