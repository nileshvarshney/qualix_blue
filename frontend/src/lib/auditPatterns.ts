// src/lib/auditPatterns.ts
export type AuditEntry = {
  user?: string
  result?: string
  timestamp?: string
  action?: string
  _suspicious?: boolean
  _suspiciousReason?: string
  [key: string]: unknown
}

const FAILURE_THRESHOLD   = 3
const BULK_ACCESS_THRESHOLD = 5
const FAILURE_WINDOW_MS   = 60_000 // 1 minute
const OFF_HOURS_START_UTC = 6   // 06:00
const OFF_HOURS_END_UTC   = 22  // 22:00
const BULK_ACTIONS        = new Set(['read', 'export', 'download', 'query'])

export function detectSuspiciousActivity(entries: AuditEntry[]): AuditEntry[] {
  const flagged = new Map<number, { reason: string }>()

  // Pattern 1: repeated failures
  const failureMap = new Map<string, { idx: number; ts: number }[]>()
  entries.forEach((e, i) => {
    if ((e.result !== 'failed' && e.result !== 'failure') || !e.user) return
    const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0
    if (!failureMap.has(e.user)) failureMap.set(e.user, [])
    failureMap.get(e.user)!.push({ idx: i, ts })
  })
  for (const events of failureMap.values()) {
    // sliding window
    for (let i = 0; i < events.length; i++) {
      const window = events.filter(
        ev => ev.ts >= events[i].ts && ev.ts <= events[i].ts + FAILURE_WINDOW_MS
      )
      if (window.length >= FAILURE_THRESHOLD) {
        window.forEach(ev => flagged.set(ev.idx, { reason: 'repeated_failures' }))
      }
    }
  }

  // Pattern 2: off-hours access
  entries.forEach((e, i) => {
    if (!e.timestamp) return
    const hour = new Date(e.timestamp).getUTCHours()
    if (hour < OFF_HOURS_START_UTC || hour >= OFF_HOURS_END_UTC) {
      flagged.set(i, { reason: flagged.get(i)?.reason ?? 'off_hours_access' })
    }
  })

  // Pattern 3: bulk data access (same user, many reads/exports in batch)
  const bulkMap = new Map<string, number[]>()
  entries.forEach((e, i) => {
    if (!e.user || !e.action) return
    if (!BULK_ACTIONS.has((e.action as string).toLowerCase())) return
    if (!bulkMap.has(e.user)) bulkMap.set(e.user, [])
    bulkMap.get(e.user)!.push(i)
  })
  for (const idxs of bulkMap.values()) {
    if (idxs.length >= BULK_ACCESS_THRESHOLD) {
      idxs.forEach(i => flagged.set(i, { reason: flagged.get(i)?.reason ?? 'bulk_data_access' }))
    }
  }

  return entries.map((e, i) => {
    const flag = flagged.get(i)
    if (!flag) return e
    return { ...e, _suspicious: true, _suspiciousReason: flag.reason }
  })
}
