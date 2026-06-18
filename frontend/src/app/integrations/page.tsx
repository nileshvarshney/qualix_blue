'use client'

export default function IntegrationsPage() {
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', padding: '24px' }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>Integrations</h1>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a', marginBottom: '20px' }}>Integrations</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' }}>
          {[
            { name: 'Slack', icon: '💬', desc: 'Send alerts to Slack channels', connected: false, channel: '' },
            { name: 'PagerDuty', icon: '🚨', desc: 'Escalate critical issues 24/7', connected: false, channel: '' },
            { name: 'Jira', icon: '📋', desc: 'Auto-create tickets for issues', connected: false, channel: '' },
            { name: 'dbt', icon: '🔧', desc: 'Sync dbt model metadata', connected: false, channel: '' },
            { name: 'GitHub Actions', icon: '⚙️', desc: 'Run checks in CI/CD pipelines', connected: false, channel: '' },
            { name: 'Grafana', icon: '📊', desc: 'Visualize quality metrics', connected: false, channel: '' },
          ].map(intg => (
            <div key={intg.name} style={{ background: '#fafaf9', borderRadius: '10px', padding: '16px', border: `1px solid ${intg.connected ? '#86efac' : '#ebe8df'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '22px' }}>{intg.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a' }}>{intg.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{intg.desc}</div>
                  </div>
                </div>
                <span style={{ background: intg.connected ? '#f0fdf4' : '#f8fafc', color: intg.connected ? '#16a34a' : '#94a3b8', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>
                  {intg.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              {intg.connected && <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#64748b' }}>→ {intg.channel}</div>}
              <button style={{ marginTop: '10px', width: '100%', padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0', background: '#fff', color: intg.connected ? '#dc2626' : '#2563eb', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                {intg.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
