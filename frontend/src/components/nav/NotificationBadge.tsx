// src/components/nav/NotificationBadge.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const POLL_MS = 60_000

async function fetchPendingCount(): Promise<number> {
  try {
    const [tasks, approvals] = await Promise.allSettled([
      apiFetch('/api/stewardship/tasks').then(r => r.json()),
      apiFetch('/api/governance/approvals?status=pending').then(r => r.json()),
    ])

    let count = 0

    if (tasks.status === 'fulfilled') {
      const list = Array.isArray(tasks.value) ? tasks.value : []
      count += list.filter((t: Record<string, unknown>) => t.status !== 'completed').length
    }
    if (approvals.status === 'fulfilled') {
      const list = Array.isArray(approvals.value) ? approvals.value : []
      count += list.length
    }

    return count
  } catch {
    return 0
  }
}

export function NotificationBadge() {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function refresh() {
      const n = await fetchPendingCount()
      if (mountedRef.current) setCount(n)
    }

    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  if (count === 0) return null

  return (
    <span style={{
      position: 'absolute', top: '-4px', right: '-4px',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#dc2626', color: '#fff',
      fontSize: '8px', fontWeight: 800, lineHeight: 1,
      width: '14px', height: '14px', borderRadius: '50%',
      flexShrink: 0,
    }}>
      {count > 9 ? '9+' : count}
    </span>
  )
}
