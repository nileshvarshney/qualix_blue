'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Dashboard from '@/components/dashboard/Dashboard'
import { useInterval } from '@/hooks/useInterval'
import type { DashboardStats } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const EMPTY: DashboardStats = {
  overallScore:      null,
  totalAssets:       0,
  totalRules:        0,
  openAlerts:        0,
  criticalAlerts:    0,
  mediumAlerts:      0,
  passed:            0,
  failed:            0,
  trend:             [],
  dimensions:        { completeness: null, accuracy: null, uniqueness: null, validity: null, timeliness: null, consistency: null },
  failingRules:      [],
  atRiskTables:      [],
  activeConnections: 0,
  recentChecks:      [],
}

interface CorrelatedIncident {
  incident_id: string
  asset_count: number
  severity: string
}

export default function HomePage() {
  const [stats, setStats]         = useState<DashboardStats>(EMPTY)
  const [statsLoading, setStatsLoading] = useState(true)
  const [incidents, setIncidents] = useState<CorrelatedIncident[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = localStorage.getItem('qualix-active-conn')
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    const url = activeConnectionId
      ? `/api/dashboard?connection_id=${activeConnectionId}`
      : '/api/dashboard'
    apiFetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Partial<DashboardStats>) => setStats({ ...EMPTY, ...data }))
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [activeConnectionId])

  const loadIncidents = useCallback(() => {
    fetch('/api/monitoring/correlated-incidents', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: CorrelatedIncident[]) => {
        setIncidents(Array.isArray(d) ? d : [])
        if (Array.isArray(d) && d.length > 0) setDismissed(false)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadIncidents() }, [loadIncidents])
  useInterval(loadIncidents, 60_000)

  const showBanner = incidents.length > 0 && !dismissed
  const highSeverity = incidents.some(i => i.severity === 'high' || i.severity === 'critical')
  const totalTables = incidents.reduce((s, i) => s + i.asset_count, 0)

  return (
    <>
      {showBanner && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: highSeverity ? 'var(--status-error-bg)' : 'var(--status-warn-bg)',
          borderBottom: `1px solid ${highSeverity ? '#fca5a5' : '#fde68a'}`,
          padding: '8px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)' }}>
            ⚡ {totalTables} tables degraded simultaneously — possible upstream failure detected
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <Link href="/observability" style={{
              fontSize: '12px', fontWeight: 700,
              color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)',
              textDecoration: 'underline',
            }}>
              View Observability →
            </Link>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '14px', color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)',
                lineHeight: 1, padding: '0 2px',
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <Dashboard stats={stats} loading={statsLoading} activeConnectionId={activeConnectionId} />
    </>
  )
}
