'use client'
import { useState, useEffect } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

interface Incident {
  id: string; title: string; asset: string; severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved'
  createdAt: string; resolvedAt: string | null
  description: string; owner: string; ttrMinutes: number | null
}

function sevStyle(s: string) {
  if (s === 'critical') return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
  if (s === 'high') return { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' }
  if (s === 'medium') return { bg: '#fef3c7', color: '#d97706', border: '#fde68a' }
  return { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' }
}

function statusStyle(s: string) {
  if (s === 'open') return { bg: '#fee2e2', color: '#dc2626' }
  if (s === 'investigating') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#dcfce7', color: '#16a34a' }
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/incidents')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setIncidents(items.map((inc: Record<string, unknown>, i: number) => ({
          id: String(inc.incident_id ?? inc.id ?? `INC-${i + 1}`),
          title: String(inc.title ?? inc.incident_title ?? inc.name ?? ''),
          asset: String(inc.asset_name ?? inc.asset ?? inc.sf_table_name ?? ''),
          severity: (inc.severity as Incident['severity']) ?? 'medium',
          status: (inc.status ?? inc.incident_status ?? 'open') as Incident['status'],
          createdAt: String(inc.created_at ?? inc.createdAt ?? ''),
          resolvedAt: inc.resolved_at ? String(inc.resolved_at) : (inc.resolvedAt ? String(inc.resolvedAt) : null),
          description: String(inc.description ?? inc.message ?? ''),
          owner: String(inc.owner ?? inc.domain_id ?? inc.assigned_to ?? ''),
          ttrMinutes: inc.ttr_minutes != null ? Number(inc.ttr_minutes) : (inc.ttrMinutes != null ? Number(inc.ttrMinutes) : null),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = incidents.filter(inc => filter === 'all' || inc.status === filter)

  const openCount = incidents.filter(i => i.status === 'open').length
  const investigatingCount = incidents.filter(i => i.status === 'investigating').length
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length
  const resolvedWithTTR = incidents.filter(i => i.ttrMinutes != null)
  const avgTTR = resolvedWithTTR.length > 0
    ? Math.round(resolvedWithTTR.reduce((s, i) => s + (i.ttrMinutes ?? 0), 0) / resolvedWithTTR.length)
    : null

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/alerts',     label: 'Alerts' },
        { href: '/incidents',  label: 'Incidents' },
        { href: '/audit-logs', label: 'Audit Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Incidents</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Incidents</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Track data quality incidents, investigate root causes, and measure resolution time</p>
        </div>
        <button style={{ background: '#E8541A', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Report Incident</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Open Incidents</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#dc2626', letterSpacing: '-1px' }}>{openCount}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Investigating</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#d97706', letterSpacing: '-1px' }}>{investigatingCount}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Resolved This Week</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#16a34a', letterSpacing: '-1px' }}>{resolvedCount}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Avg. Time to Resolve</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            {avgTTR != null ? (
              <>
                <span style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-1px' }}>{avgTTR}</span>
                <span style={{ fontSize: '14px', color: '#94a3b8' }}>min</span>
              </>
            ) : (
              <span style={{ fontSize: '32px', fontWeight: 700, color: '#94a3b8', letterSpacing: '-1px' }}>—</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['all', 'open', 'investigating', 'resolved'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '12.5px', fontWeight: 500, textTransform: 'capitalize',
            background: filter === f ? '#1a1a1a' : '#f8fafc', color: filter === f ? '#fff' : '#64748b',
          }}>
            {f} {f !== 'all' ? `(${f === 'open' ? openCount : f === 'investigating' ? investigatingCount : resolvedCount})` : ''}
          </button>
        ))}
      </div>

      {/* Incidents List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No incidents yet</div>
        ) : null}
        {!loading && filtered.map(inc => {
          const sev = sevStyle(inc.severity)
          const stat = statusStyle(inc.status)
          const isOpen = expanded === inc.id
          return (
            <div key={inc.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isOpen ? null : inc.id)} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', cursor: 'pointer',
                background: isOpen ? '#fafaf5' : '#fff',
              }}>
                <div style={{ width: '4px', alignSelf: 'stretch', background: sev.color, borderRadius: '2px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{inc.id}</span>
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#1a1a1a' }}>{inc.title}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {inc.asset}{inc.owner ? ` · ${inc.owner}` : ''}{inc.createdAt ? ` · ${new Date(inc.createdAt).toLocaleString()}` : ''}
                  </div>
                </div>
                <span style={{ background: sev.bg, color: sev.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0, border: `1px solid ${sev.border}` }}>{inc.severity}</span>
                <span style={{ background: stat.bg, color: stat.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>{inc.status}</span>
                <span style={{ color: '#94a3b8', fontSize: '14px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 20px 16px 38px', borderTop: '1px solid #f3f1ea' }}>
                  <div style={{ marginTop: '14px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>{inc.description}</div>
                  {inc.ttrMinutes != null && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
                      ✅ Resolved in {inc.ttrMinutes} minutes
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
