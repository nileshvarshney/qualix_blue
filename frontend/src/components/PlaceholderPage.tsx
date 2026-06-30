import { apiFetch } from '@/lib/apiFetch'
interface Props {
  title: string
  icon: string
  description: string
  features?: string[]
}

export default function PlaceholderPage({ title, icon, description, features = [] }: Props) {
  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        Workspace · <span style={{ color: 'var(--text-secondary)' }}>Analytics platform</span>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 24px', letterSpacing: '-0.4px' }}>{title}</h1>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '60px 40px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>{icon}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 24px', lineHeight: '1.6' }}>{description}</div>

        {features.length > 0 && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '10px', textAlign: 'left', background: 'var(--surface-muted)', padding: '20px 28px', borderRadius: '10px', border: '1px solid var(--border)', marginTop: '16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Coming soon</div>
            {features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--status-info-text)' }}>✓</span> {f}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '24px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
          💬 Ask the AI Assistant in the bottom-right corner to help with this!
        </div>
      </div>
    </div>
  )
}
