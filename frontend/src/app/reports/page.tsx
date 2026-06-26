'use client'
import { useState, useEffect } from 'react'
import ReportsClient from '@/components/reports/ReportsClient'
import type { Report } from '@/lib/types'
import { loadReports } from '@/lib/seedData'
import { apiFetch } from '@/lib/apiFetch'

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
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
    loadReports(activeConnectionId || undefined).then(setReports)
  }, [activeConnectionId])

  return <ReportsClient initialReports={reports} />
}
