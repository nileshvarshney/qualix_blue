'use client'
import { useState, useEffect, Suspense } from 'react'
import RulesClient from '@/components/rules/RulesClient'
import type { Rule, Connection } from '@/lib/types'
import { loadRules, loadConnections } from '@/lib/seedData'

function RulesInner() {
  const [rules, setRules] = useState<Rule[]>([])
  const [connections, setConnections] = useState<Connection[]>([])

  useEffect(() => {
    async function load() {
      const [r, c] = await Promise.all([loadRules(), loadConnections()])
      setRules(r)
      setConnections(c)
    }
    load()
  }, [])

  return <RulesClient initialRules={rules} connections={connections} />
}

export default function RulesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <RulesInner />
    </Suspense>
  )
}
