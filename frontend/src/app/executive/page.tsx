'use client'
import Link from 'next/link'

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

export default function ExecutivePage() {
  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Executive</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Executive Dashboard</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px' }}>Organization-wide data quality and governance at a glance</p>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Overall Quality' },
          { label: 'Governance Score' },
          { label: 'SLA Adherence' },
          { label: 'Active Incidents' },
          { label: 'Data Products' },
        ].map((kpi, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>{kpi.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#94a3b8', letterSpacing: '-1px' }}>—</div>
            <div style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 500, marginTop: '4px' }}>No data yet</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '20px' }}>
        {/* Domain Scores */}
        <div style={card}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Quality by Domain</div>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No domain quality data yet
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Weekly Trend */}
          <div style={card}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '12px' }}>Weekly Trend</div>
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
              No trend data yet
            </div>
          </div>

          {/* Active Incidents */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '11.5px', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
              No incidents yet
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
