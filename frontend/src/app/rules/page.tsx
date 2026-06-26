'use client'
import { useState, useEffect, Suspense } from 'react'
import RulesClient from '@/components/rules/RulesClient'
import type { Rule, Connection } from '@/lib/types'
import { loadConnections } from '@/lib/seedData'
import { apiFetch } from '@/lib/apiFetch'

function RulesInner() {
  const [rules, setRules] = useState<Rule[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
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
    async function load() {
      const params = new URLSearchParams()
      if (activeConnectionId) params.set('connection_id', activeConnectionId)
      const rulesUrl = `/api/rules${params.toString() ? '?' + params.toString() : ''}`
      const [rulesRes, c] = await Promise.all([
        apiFetch(rulesUrl, { cache: 'no-store' }),
        loadConnections(),
      ])
      const rulesData = rulesRes.ok ? await rulesRes.json() : []
      setRules(Array.isArray(rulesData) ? rulesData : (rulesData.rules ?? []))
      setConnections(c)
    }
    load()
  }, [activeConnectionId])

  return <RulesClient initialRules={rules} connections={connections} />
}

export default function RulesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <RulesInner />
    </Suspense>
  )
}
