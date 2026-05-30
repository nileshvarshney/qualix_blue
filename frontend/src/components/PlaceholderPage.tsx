interface Props {
  title: string
  icon: string
  description: string
  features?: string[]
}

export default function PlaceholderPage({ title, icon, description, features = [] }: Props) {
  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px', letterSpacing: '-0.4px' }}>{title}</h1>

      <div style={{
        background: '#fff', border: '1px solid #ebe8df', borderRadius: '14px',
        padding: '60px 40px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>{icon}</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '500px', margin: '0 auto 24px', lineHeight: '1.6' }}>{description}</div>

        {features.length > 0 && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '10px', textAlign: 'left', background: '#fafaf5', padding: '20px 28px', borderRadius: '10px', border: '1px solid #ebe8df', marginTop: '16px' }}>
            <div style={{ fontSize: '11.5px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Coming soon</div>
            {features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#475569' }}>
                <span style={{ color: '#2563eb' }}>✓</span> {f}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '24px', fontSize: '12.5px', color: '#94a3b8' }}>
          💬 Ask the AI Assistant in the bottom-right corner to help with this!
        </div>
      </div>
    </div>
  )
}
