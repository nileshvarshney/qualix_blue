// src/lib/masking.ts
const MASK_PLACEHOLDER = '***'
const SENSITIVE_LEVELS = new Set(['PII', 'PHI', 'CONFIDENTIAL'])
const TRUSTED_ROLES = new Set(['admin', 'data_steward', 'data_owner'])

/**
 * Walks `data` looking for arrays of plain objects (row arrays).
 * For each column whose name appears in sensitivityMap with a sensitive level,
 * replaces the value with MASK_PLACEHOLDER if the user's role is not trusted.
 * Never mutates input — returns a deep copy of affected structures.
 */
export function maskSensitiveColumns(
  data: unknown,
  userRole: string,
  sensitivityMap: Record<string, string>,
): unknown {
  if (TRUSTED_ROLES.has(userRole)) return data
  if (!hasSensitiveColumns(sensitivityMap)) return data
  return walk(data, sensitivityMap)
}

function hasSensitiveColumns(map: Record<string, string>): boolean {
  return Object.values(map).some(v => SENSITIVE_LEVELS.has(v))
}

function walk(node: unknown, map: Record<string, string>): unknown {
  if (Array.isArray(node)) {
    return node.map(item => walk(item, map))
  }
  if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const sens = map[key]
      if (sens && SENSITIVE_LEVELS.has(sens)) {
        result[key] = MASK_PLACEHOLDER
      } else {
        result[key] = walk(value, map)
      }
    }
    return result
  }
  return node
}

export function extractUserRole(authHeader: string): string {
  if (!authHeader.startsWith('Bearer ')) return 'viewer'
  try {
    const payload = authHeader.slice(7).split('.')[1]
    const decoded = JSON.parse(atob(payload)) as Record<string, unknown>
    return String(decoded.role ?? decoded.user_role ?? 'viewer')
  } catch {
    return 'viewer'
  }
}
