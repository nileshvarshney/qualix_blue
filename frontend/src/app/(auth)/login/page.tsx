import LoginCard from '@/components/auth/LoginCard'
import StarFieldBg from '@/components/auth/StarFieldBg'
import { apiFetch } from '@/lib/apiFetch'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; reason?: string }>
}) {
  const { returnUrl = '/', reason } = await searchParams
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: '#0f1117',
      flexDirection: 'column',
      gap: 24,
    }}>
      {/* Subtle radial glow behind the card */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(255,110,50,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <StarFieldBg />

      <LoginCard returnUrl={returnUrl} reason={reason} />

      {/* Brand wordmark — below the card */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1 }}>
          <span style={{ fontSize: 34, fontWeight: 300, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.07em' }}>Qual</span>
          <span style={{ fontSize: 34, fontWeight: 800, color: '#FF9050', letterSpacing: '-0.01em', fontStyle: 'italic' }}>ix</span>
        </div>
        <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 400 }}>
          AI Data Quality &amp; Governance
        </div>
      </div>
    </div>
  )
}
