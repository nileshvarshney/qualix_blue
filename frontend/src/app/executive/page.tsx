'use client'
import { useState } from 'react'
import Link from 'next/link'
import PageTabBar from '@/components/ui/PageTabBar'

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

const domainScores = [
  { name: 'Finance', score: 96, trend: '+1.4', assets: 24, icon: '💰' },
  { name: 'Data Platform', score: 98, trend: '+0.8', assets: 18, icon: '📊' },
  { name: 'Sales', score: 94, trend: '+2.1', assets: 31, icon: '🛒' },
  { name: 'Supply Chain', score: 91, trend: '-0.3', assets: 15, icon: '🚚' },
  { name: 'Marketing', score: 87, trend: '+3.2', assets: 22, icon: '📣' },
  { name: 'Engineering', score: 89, trend: '+1.1', assets: 32, icon: '⚙️' },
]

const weeklyTrend = [
  { week: 'W18', score: 91.2 }, { week: 'W19', score: 92.1 }, { week: 'W20', score: 93.5 },
  { week: 'W21', score: 94.2 },
]

const topIncidents = [
  { title: 'Null spike in orders_fact', severity: 'critical', status: 'open', domain: 'Finance' },
  { title: 'SLA breach on sessions refresh', severity: 'high', status: 'investigating', domain: 'Marketing' },
  { title: 'Schema drift in crm.users_dim', severity: 'medium', status: 'investigating', domain: 'Sales' },
]

function scoreColor(s: number) { return s >= 90 ? '#16a34a' : s >= 80 ? '#ea8b3a' : '#dc2626' }
function scoreBg(s: number) { return s >= 90 ? '#dcfce7' : s >= 80 ? '#fef3c7' : '#fee2e2' }

export default function ExecutivePage() {
  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/reports',   label: 'Reports' },
        { href: '/executive', label: 'Executive View' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Executive</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Executive Dashboard</h1>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px' }}>Organization-wide data quality and governance at a glance</p>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Overall Quality', value: '94.2%', change: '▲ 1.4', color: '#16a34a' },
          { label: 'Governance Score', value: '87.5%', change: '▲ 2.1', color: '#16a34a' },
          { label: 'SLA Adherence', value: '98.6%', change: '▲ 0.3', color: '#16a34a' },
          { label: 'Active Incidents', value: '3', change: '▼ 2', color: '#16a34a' },
          { label: 'Data Products', value: '6', change: '3 certified', color: '#2563eb' },
        ].map((kpi, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>{kpi.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-1px' }}>{kpi.value}</div>
            <div style={{ fontSize: '11.5px', color: kpi.color, fontWeight: 600, marginTop: '4px' }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '20px' }}>
        {/* Domain Scores */}
        <div style={card}>
          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Quality by Domain</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {domainScores.map(d => (
              <div key={d.name} style={{ border: '1px solid #ebe8df', borderRadius: '10px', padding: '14px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#f0f9ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#ebe8df'; e.currentTarget.style.background = '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span>{d.icon}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1a1a1a' }}>{d.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: scoreColor(d.score) }}>{d.score}<span style={{ fontSize: '13px' }}>%</span></span>
                  <span style={{ fontSize: '11px', color: d.trend.startsWith('+') ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{d.trend}</span>
                </div>
                <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.score}%`, background: scoreColor(d.score) }} />
                </div>
                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '6px' }}>{d.assets} assets</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Weekly Trend */}
          <div style={card}>
            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '12px' }}>Weekly Trend</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '80px' }}>
              {weeklyTrend.map(w => {
                const h = ((w.score - 88) / 12) * 80
                return (
                  <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>{w.score}</span>
                    <div style={{ width: '100%', height: `${h}px`, background: 'linear-gradient(to top, #3b82f6, #93c5fd)', borderRadius: '4px 4px 0 0' }} />
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>{w.week}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active Incidents */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1a1a1a' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '11.5px', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topIncidents.map((inc, i) => {
                const sevColor = inc.severity === 'critical' ? '#dc2626' : inc.severity === 'high' ? '#ea580c' : '#d97706'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #f3f1ea' }}>
                    <div style={{ width: '3px', alignSelf: 'stretch', background: sevColor, borderRadius: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1a1a1a' }}>{inc.title}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{inc.domain} · {inc.status}</div>
                    </div>
                    <span style={{ fontSize: '10px', color: sevColor, fontWeight: 600, textTransform: 'uppercase' }}>{inc.severity}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
