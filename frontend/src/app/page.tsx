'use client'
import { useState, useEffect } from 'react'
import Dashboard from '@/components/dashboard/Dashboard'
import type { DashboardStats } from '@/lib/types'

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

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY)

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Partial<DashboardStats>) => setStats({ ...EMPTY, ...data }))
      .catch(err => console.error('Dashboard fetch failed:', err))
  }, [])

  return <Dashboard stats={stats} />
}
