import LoginCard from '@/components/auth/LoginCard'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>
}) {
  const { returnUrl = '/' } = await searchParams
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: '#0f1117',
    }}>
      {/* Subtle radial glow behind the card */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(255,110,50,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <LoginCard returnUrl={returnUrl} />

      {/* Floating brand badge — top-right */}
      <div style={{
        position: 'absolute', top: 20, right: 24, zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 10,
        padding: '8px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1 }}>
          <span style={{ fontSize: 17, fontWeight: 300, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.06em' }}>Qual</span>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#FF9050', letterSpacing: '-0.01em', fontStyle: 'italic' }}>ix</span>
        </div>
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>
          AI Data Quality &amp; Governance
        </div>
      </div>
    </div>
  )
}
