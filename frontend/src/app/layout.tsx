import type { Metadata } from 'next'
import './globals.css'
import ShellWrapper from '@/components/ShellWrapper'

export const metadata: Metadata = {
  title: 'Qualix — AI Data Quality & Governance',
  description: 'AI-powered data quality monitoring, governance, and management',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
}

const themeInitScript = `(function(){try{var t=localStorage.getItem('qualix-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body style={{ minHeight: '100vh', background: 'var(--background)' }}>
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  )
}
