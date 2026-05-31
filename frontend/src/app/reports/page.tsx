'use client'
import { useState, useEffect } from 'react'
import ReportsClient from '@/components/reports/ReportsClient'
import type { Report } from '@/lib/types'
import { loadReports } from '@/lib/seedData'

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])

  useEffect(() => {
    loadReports().then(setReports)
  }, [])

  return <ReportsClient initialReports={reports} />
}
