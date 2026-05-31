'use client'
import { useState, useEffect } from 'react'
import RulesClient from '@/components/rules/RulesClient'
import type { Rule, Connection } from '@/lib/types'
import { loadRules, loadConnections } from '@/lib/seedData'

export default function RulesPage() {
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
