import NodeNetworkBg from '@/components/auth/NodeNetworkBg'
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
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      gap: 28,
    }}>
      <NodeNetworkBg />

      <LoginCard returnUrl={returnUrl} />

      {/* ── Brand wordmark — sits below the card ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, gap: 0 }}>
          <span style={{
            fontSize: 36, fontWeight: 300,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: '0.07em',
          }}>Qual</span>
          <span style={{
            fontSize: 36, fontWeight: 800,
            color: '#FF9050',
            letterSpacing: '-0.01em',
            fontStyle: 'italic',
          }}>ix</span>
        </div>
        <div style={{
          fontSize: 22, color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          fontWeight: 400,
        }}>
          AI Data Quality &amp; Governance Platform
        </div>
      </div>
    </div>
  )
}
