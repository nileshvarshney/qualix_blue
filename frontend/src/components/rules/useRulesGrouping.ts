// frontend/src/components/rules/useRulesGrouping.ts
import { useMemo } from 'react'
import { Rule, Connection, RuleCategory } from '@/lib/types'

export type GroupStats = {
  count: number
  activeCount: number
  passedCount: number
  failedCount: number
}

export type GroupRow = {
  kind: 'group'
  key: string
  label: string
  level: number       // 0 = top-level, 1 = mid, 2 = leaf
  icon: string
  category?: RuleCategory
  rules: Rule[]       // all rules under this group (for select-all / run-all)
  stats: GroupStats
}

export type RuleRow = {
  kind: 'rule'
  rule: Rule
  depth: number       // visual indent level (parent.level + 1)
}

export type RowItem = GroupRow | RuleRow

function computeStats(
  rules: Rule[],
  testResults: Record<string, { status: string; score: number }>
): GroupStats {
  return {
    count: rules.length,
    activeCount: rules.filter(r => r.status === 'active' || r.enabled).length,
    passedCount: rules.filter(r =>
      r.lastRunStatus === 'passed' || testResults[r.id]?.status === 'passed'
    ).length,
    failedCount: rules.filter(r =>
      r.lastRunStatus === 'failed' || testResults[r.id]?.status === 'failed'
    ).length,
  }
}

export function useRulesGrouping(
  rules: Rule[],
  connections: Connection[],
  groupMode: 'rule-type' | 'db-table',
  expandedGroups: Set<string>,
  testResults: Record<string, { status: string; score: number }>,
  assetQualifiedNames: Record<string, string> = {}
): RowItem[] {
  return useMemo(() => {
    const connMap = new Map(connections.map(c => [c.id, c]))

    // ── Rule Type mode: single level grouped by r.type ──────────────
    if (groupMode === 'rule-type') {
      const map = new Map<string, Rule[]>()
      for (const r of rules) {
        if (!map.has(r.type)) map.set(r.type, [])
        map.get(r.type)!.push(r)
      }
      const sorted = Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
      const rows: RowItem[] = []
      for (const [type, typeRules] of sorted) {
        rows.push({
          kind: 'group',
          key: type,
          label: type,
          level: 0,
          icon: '',
          category: typeRules[0]?.category,
          rules: typeRules,
          stats: computeStats(typeRules, testResults),
        })
        if (!expandedGroups.has(type)) continue
        for (const rule of typeRules) {
          rows.push({ kind: 'rule', rule, depth: 1 })
        }
      }
      return rows
    }

    // ── DB-Table mode: database → schema → table ─────────────────────
    type TableMap = Map<string, Rule[]>
    type SchemaMap = Map<string, TableMap>
    type DbMap = Map<string, SchemaMap>
    const tree: DbMap = new Map()

    for (const r of rules) {
      const conn = connMap.get(r.connectionId)
      const qualifiedName = r.assetId ? assetQualifiedNames[r.assetId] : undefined
      const qualifiedParts = qualifiedName ? qualifiedName.split('.') : []
      const db = qualifiedParts.length >= 3 ? qualifiedParts[qualifiedParts.length - 3] : conn?.database
      const schema = qualifiedParts.length >= 2 ? qualifiedParts[qualifiedParts.length - 2] : conn?.schema
      if (!db || !schema) continue
      const table = r.tableName === 'ALL_TABLES' ? '(All Tables)' : (r.tableName || '(No Table)')
      if (!tree.has(db)) tree.set(db, new Map())
      const dbMap = tree.get(db)!
      if (!dbMap.has(schema)) dbMap.set(schema, new Map())
      const schemaMap = dbMap.get(schema)!
      if (!schemaMap.has(table)) schemaMap.set(table, [])
      schemaMap.get(table)!.push(r)
    }

    const rows: RowItem[] = []
    for (const [db, schemas] of Array.from(tree.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const dbRules = Array.from(schemas.values()).flatMap(s => Array.from(s.values()).flat())
      const dbKey = `db::${db}`
      rows.push({
        kind: 'group', key: dbKey, label: db, level: 0, icon: 'database',
        rules: dbRules, stats: computeStats(dbRules, testResults),
      })
      if (!expandedGroups.has(dbKey)) continue

      for (const [schema, tables] of Array.from(schemas.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const schemaRules = Array.from(tables.values()).flat()
        const schemaKey = `${dbKey}::${schema}`
        rows.push({
          kind: 'group', key: schemaKey, label: schema, level: 1, icon: 'schema',
          rules: schemaRules, stats: computeStats(schemaRules, testResults),
        })
        if (!expandedGroups.has(schemaKey)) continue

        for (const [table, tableRules] of Array.from(tables.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          const tableKey = `${schemaKey}::${table}`
          rows.push({
            kind: 'group', key: tableKey, label: table, level: 2, icon: 'table',
            rules: tableRules, stats: computeStats(tableRules, testResults),
          })
          if (!expandedGroups.has(tableKey)) continue

          for (const rule of tableRules) {
            rows.push({ kind: 'rule', rule, depth: 3 })
          }
        }
      }
    }
    return rows
  }, [rules, connections, groupMode, expandedGroups, testResults, assetQualifiedNames])
}
