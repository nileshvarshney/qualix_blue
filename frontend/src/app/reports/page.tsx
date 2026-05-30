'use client'
import { useState, useEffect } from 'react'
import ReportsClient from '@/components/reports/ReportsClient'
import PageTabBar from '@/components/ui/PageTabBar'
import type { Report } from '@/lib/types'
import { loadReports } from '@/lib/seedData'

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])

  useEffect(() => {
    loadReports().then(setReports)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <PageTabBar tabs={[
        { href: '/reports',   label: 'Reports' },
        { href: '/executive', label: 'Executive View' },
      ]} />
      <ReportsClient initialReports={reports} />
    </div>
  )
}
