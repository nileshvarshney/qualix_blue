import { Connection, Rule, Report } from './types'

/* ─── Edge-safe file store ─── */
// On Node.js (local dev / self-hosted): uses fs to read/write JSON files in data/
// On Cloudflare Workers (edge): falls back to bundled seed data (read-only mode)

let fs: typeof import('fs') | null = null
let path: typeof import('path') | null = null

try {
  // Dynamic require — only works in Node.js, silently fails on edge runtimes
  fs = require('fs')
  path = require('path')
} catch {
  // Running on edge (Cloudflare Workers) — fs not available
}

const isEdge = !fs || !path

// In-memory cache for edge runtime (seeded from bundled data)
const memoryStore: Record<string, unknown[]> = {}

const SEED_DATA: Record<string, unknown[]> = {
  'connections.json': [],
  'rules.json': [],
  'reports.json': [],
}

function getDataDir(): string {
  if (!path) return ''
  return path.join(process.cwd(), 'data')
}

function readJSON<T>(filename: string): T[] {
  if (isEdge) {
    // Edge runtime: return in-memory data or seed
    return (memoryStore[filename] ?? SEED_DATA[filename] ?? []) as T[]
  }
  try {
    const filepath = path!.join(getDataDir(), filename)
    if (!fs!.existsSync(filepath)) return []
    return JSON.parse(fs!.readFileSync(filepath, 'utf-8'))
  } catch {
    return []
  }
}

function writeJSON<T>(filename: string, data: T[]): void {
  if (isEdge) {
    // Edge runtime: write to in-memory store only
    memoryStore[filename] = data
    return
  }
  try {
    const filepath = path!.join(getDataDir(), filename)
    fs!.writeFileSync(filepath, JSON.stringify(data, null, 2))
  } catch {
    // Write failed — directory may not exist on read-only filesystem
    memoryStore[filename] = data
  }
}

export const store = {
  connections: {
    getAll: () => readJSON<Connection>('connections.json'),
    getById: (id: string) => readJSON<Connection>('connections.json').find(c => c.id === id),
    create: (conn: Connection) => {
      const all = readJSON<Connection>('connections.json')
      all.push(conn)
      writeJSON('connections.json', all)
      return conn
    },
    update: (id: string, updates: Partial<Connection>) => {
      const all = readJSON<Connection>('connections.json')
      const idx = all.findIndex(c => c.id === id)
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates }
        writeJSON('connections.json', all)
        return all[idx]
      }
      return null
    },
    delete: (id: string) => {
      const all = readJSON<Connection>('connections.json')
      const filtered = all.filter(c => c.id !== id)
      writeJSON('connections.json', filtered)
    }
  },
  rules: {
    getAll: () => readJSON<Rule>('rules.json'),
    getById: (id: string) => readJSON<Rule>('rules.json').find(r => r.id === id),
    create: (rule: Rule) => {
      const all = readJSON<Rule>('rules.json')
      all.push(rule)
      writeJSON('rules.json', all)
      return rule
    },
    update: (id: string, updates: Partial<Rule>) => {
      const all = readJSON<Rule>('rules.json')
      const idx = all.findIndex(r => r.id === id)
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates }
        writeJSON('rules.json', all)
        return all[idx]
      }
      return null
    },
    delete: (id: string) => {
      const all = readJSON<Rule>('rules.json')
      writeJSON('rules.json', all.filter(r => r.id !== id))
    }
  },
  reports: {
    getAll: () => readJSON<Report>('reports.json'),
    getLatest: () => {
      const all = readJSON<Report>('reports.json')
      return all.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())[0]
    },
    create: (report: Report) => {
      const all = readJSON<Report>('reports.json')
      all.push(report)
      writeJSON('reports.json', all)
      return report
    }
  }
}
