'use client'
import Link from 'next/link'

export default function ExecutivePage() {
  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Executive Dashboard</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Quality —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Governance —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>SLA —</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>— incidents</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>— products</span>
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '10px', flex: 1, minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Quality by Domain</div>
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No domain quality data yet</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Weekly Trend</div>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No trend data yet</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px dashed var(--border)', fontSize: '11px' }}>No incidents yet</div>
          </div>
        </div>
      </div>
    </div>
  )
}
