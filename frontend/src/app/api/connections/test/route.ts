import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'

/** Safe update — silently ignores failures (e.g. on edge runtimes with no persistence) */
function safeUpdateStatus(id: string, status: string) {
  try { store.connections.update(id, { status, lastTested: new Date().toISOString() } as Record<string, unknown>) } catch { /* edge fallback */ }
}

interface TestResult {
  success: boolean
  status: 'active' | 'error' | 'inactive'
  steps: { label: string; status: 'ok' | 'fail' | 'skip'; detail: string }[]
  errorCode?: string
  errorMessage?: string
  suggestion?: string
  latencyMs?: number
}

// ── Snowflake ─────────────────────────────────────────────────────────────────
async function testSnowflake(conn: Record<string, unknown>): Promise<TestResult> {
  const steps: TestResult['steps'] = []
  const t0 = Date.now()

  // 1. Validate required fields
  const missing: string[] = []
  if (!conn.account)   missing.push('Account Identifier')
  if (!conn.warehouse) missing.push('Warehouse')
  if (!conn.database)  missing.push('Database')
  if (!conn.username)  missing.push('Username')

  if (missing.length > 0) {
    steps.push({ label: 'Field validation', status: 'fail', detail: `Missing: ${missing.join(', ')}` })
    return {
      success: false, status: 'error', steps,
      errorCode: 'MISSING_FIELDS',
      errorMessage: `Required fields are missing: ${missing.join(', ')}`,
      suggestion: 'Edit the connection and fill in all required fields.'
    }
  }
  steps.push({ label: 'Field validation', status: 'ok', detail: 'All required fields present' })

  // 2. Validate account identifier format
  const account = (conn.account as string).replace(/\.snowflakecomputing\.com$/i, '')
  const accountUrl = `https://${account}.snowflakecomputing.com`

  const badFormat = account.includes(' ') || account.length < 5
  if (badFormat) {
    steps.push({ label: 'Account format check', status: 'fail', detail: `"${account}" is not a valid Snowflake account identifier` })
    return {
      success: false, status: 'error', steps,
      errorCode: 'INVALID_ACCOUNT_FORMAT',
      errorMessage: `The account identifier "${account}" appears to be invalid.`,
      suggestion: 'Find your account in your Snowflake URL: https://<account>.snowflakecomputing.com'
    }
  }
  steps.push({ label: 'Account format check', status: 'ok', detail: `Identifier looks valid: ${account}` })

  // 3. DNS / reachability check — actually ping the Snowflake endpoint
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`${accountUrl}/`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'DataGuard-ConnectionTest/1.0' }
    })
    clearTimeout(timeout)
    const latencyMs = Date.now() - t0

    // Snowflake returns 403 or 200 for valid accounts, 404/connection error for invalid
    if (res.status === 403 || res.status === 200 || res.status === 302) {
      steps.push({ label: 'Account reachability', status: 'ok', detail: `Snowflake account reachable at ${accountUrl} (${latencyMs}ms)` })
    } else if (res.status === 404) {
      steps.push({ label: 'Account reachability', status: 'fail', detail: `HTTP 404 — account "${account}" not found` })
      return {
        success: false, status: 'error', steps,
        errorCode: 'ACCOUNT_NOT_FOUND',
        errorMessage: `No Snowflake account found at "${account}.snowflakecomputing.com".`,
        suggestion: 'Double-check your Account Identifier. It should match the subdomain in your Snowflake login URL.',
        latencyMs
      }
    } else {
      steps.push({ label: 'Account reachability', status: 'ok', detail: `HTTP ${res.status} — endpoint responding (${latencyMs}ms)` })
    }

    // 4. Credential check — attempt OAuth/token endpoint to verify credentials exist
    // We call the Snowflake login endpoint which will reject bad credentials clearly
    const loginRes = await fetch(`${accountUrl}/session/v1/login-request?requestId=dataguard-test&databaseName=${conn.database}&warehouse=${conn.warehouse}&roleName=${conn.role || ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        data: {
          ACCOUNT_NAME: account.toUpperCase(),
          LOGIN_NAME: conn.username,
          PASSWORD: conn.password || '',
          CLIENT_APP_ID: 'DataGuard',
          CLIENT_APP_VERSION: '1.0.0',
        }
      }),
      signal: AbortSignal.timeout(8000)
    })

    const loginBody = await loginRes.json().catch(() => ({}))

    if (loginRes.status === 200 && loginBody?.success === true) {
      steps.push({ label: 'Authentication', status: 'ok', detail: `Credentials verified for user "${conn.username}"` })
      steps.push({ label: 'Warehouse access', status: 'ok', detail: `Warehouse "${conn.warehouse}" accessible` })
      steps.push({ label: 'Database access', status: 'ok', detail: `Database "${conn.database}" accessible` })

      safeUpdateStatus(conn.id as string, 'active')
      return { success: true, status: 'active', steps, latencyMs: Date.now() - t0 }

    } else {
      // Parse the specific error from Snowflake
      const sfMessage: string = loginBody?.message || loginBody?.data?.MESSAGE || ''
      const sfCode: string    = loginBody?.code    || loginBody?.data?.CODE    || ''

      if (sfMessage.toLowerCase().includes('incorrect username or password') || sfCode === '390100') {
        steps.push({ label: 'Authentication', status: 'fail', detail: `Incorrect username or password for user "${conn.username}"` })
        safeUpdateStatus(conn.id as string, 'error')
        return {
          success: false, status: 'error', steps,
          errorCode: 'AUTH_FAILED',
          errorMessage: `Authentication failed for user "${conn.username}". Incorrect username or password.`,
          suggestion: 'Verify your Snowflake username and password. Note: usernames are case-sensitive.',
          latencyMs: Date.now() - t0
        }
      }

      if (sfMessage.toLowerCase().includes('does not exist') || sfMessage.toLowerCase().includes('not found')) {
        if (sfMessage.toLowerCase().includes('warehouse')) {
          steps.push({ label: 'Warehouse access', status: 'fail', detail: `Warehouse "${conn.warehouse}" does not exist or your role cannot access it` })
          safeUpdateStatus(conn.id as string, 'error')
          return {
            success: false, status: 'error', steps,
            errorCode: 'WAREHOUSE_NOT_FOUND',
            errorMessage: `Warehouse "${conn.warehouse}" not found or not accessible by role "${conn.role || 'PUBLIC'}"`,
            suggestion: `Check the warehouse name is correct (case-insensitive) and that your role ${conn.role ? `"${conn.role}"` : ''} has USAGE privilege on it.`,
            latencyMs: Date.now() - t0
          }
        }
        if (sfMessage.toLowerCase().includes('database')) {
          steps.push({ label: 'Authentication', status: 'ok', detail: `Credentials valid for "${conn.username}"` })
          steps.push({ label: 'Database access', status: 'fail', detail: `Database "${conn.database}" does not exist or role cannot access it` })
          safeUpdateStatus(conn.id as string, 'error')
          return {
            success: false, status: 'error', steps,
            errorCode: 'DATABASE_NOT_FOUND',
            errorMessage: `Database "${conn.database}" not found or not accessible.`,
            suggestion: `Ensure database "${conn.database}" exists and your role has USAGE privilege on it.`,
            latencyMs: Date.now() - t0
          }
        }
      }

      if (sfMessage.toLowerCase().includes('role') || sfCode === '390189') {
        steps.push({ label: 'Role check', status: 'fail', detail: `Role "${conn.role}" does not exist or is not granted to user "${conn.username}"` })
        safeUpdateStatus(conn.id as string, 'error')
        return {
          success: false, status: 'error', steps,
          errorCode: 'ROLE_NOT_GRANTED',
          errorMessage: `Role "${conn.role}" is not granted to user "${conn.username}".`,
          suggestion: 'Use a role that is already granted to your user, or leave the Role field empty to use the default role.',
          latencyMs: Date.now() - t0
        }
      }

      if (sfMessage.toLowerCase().includes('mfa') || sfMessage.toLowerCase().includes('multi-factor')) {
        steps.push({ label: 'Authentication', status: 'fail', detail: 'MFA is required — password-only auth is blocked for this user' })
        safeUpdateStatus(conn.id as string, 'error')
        return {
          success: false, status: 'error', steps,
          errorCode: 'MFA_REQUIRED',
          errorMessage: 'Multi-Factor Authentication (MFA) is enforced for this user.',
          suggestion: 'Use a service account with key-pair authentication, or disable MFA for this user in Snowflake.',
          latencyMs: Date.now() - t0
        }
      }

      // Generic auth error
      steps.push({ label: 'Authentication', status: 'fail', detail: sfMessage || `HTTP ${loginRes.status}` })
      safeUpdateStatus(conn.id as string, 'error')
      return {
        success: false, status: 'error', steps,
        errorCode: sfCode || 'AUTH_ERROR',
        errorMessage: sfMessage || `Login failed with HTTP ${loginRes.status}`,
        suggestion: 'Check your credentials and that your user account is not locked in Snowflake.',
        latencyMs: Date.now() - t0
      }
    }

  } catch (err: unknown) {
    const e = err as Error
    if (e.name === 'AbortError' || e.message?.includes('timeout')) {
      steps.push({ label: 'Account reachability', status: 'fail', detail: 'Request timed out after 8s' })
      safeUpdateStatus(conn.id as string, 'error')
      return {
        success: false, status: 'error', steps,
        errorCode: 'TIMEOUT',
        errorMessage: `Connection to "${account}.snowflakecomputing.com" timed out after 8 seconds.`,
        suggestion: 'Check that your account identifier is correct and your network can reach Snowflake. If behind a VPN/firewall, ensure Snowflake is not blocked.',
        latencyMs: Date.now() - t0
      }
    }

    const isNetworkError = e.message?.includes('ENOTFOUND') || e.message?.includes('ECONNREFUSED') || e.message?.includes('fetch failed')
    steps.push({ label: 'Account reachability', status: 'fail', detail: isNetworkError ? `Cannot reach ${accountUrl} — DNS or network error` : e.message })
    safeUpdateStatus(conn.id as string, 'error')
    return {
      success: false, status: 'error', steps,
      errorCode: isNetworkError ? 'NETWORK_ERROR' : 'CONNECTION_ERROR',
      errorMessage: isNetworkError
        ? `Cannot reach "${account}.snowflakecomputing.com". DNS lookup failed — the account identifier may be wrong.`
        : e.message,
      suggestion: isNetworkError
        ? 'Verify the account identifier matches your Snowflake URL exactly (e.g. xy12345.us-east-1).'
        : 'Check network connectivity and firewall rules.',
      latencyMs: Date.now() - t0
    }
  }
}

// ── Generic validator for other DB types ─────────────────────────────────────
async function testGeneric(conn: Record<string, unknown>, type: string): Promise<TestResult> {
  const steps: TestResult['steps'] = []

  const requiredByType: Record<string, string[]> = {
    postgresql: ['host', 'database'],
    mysql:      ['host', 'database'],
    redshift:   ['host', 'database', 'username'],
    bigquery:   ['project'],
    mongodb:    ['connectionString', 'database'],
    csv:        ['filePath'],
    api:        ['host'],
  }

  const required = requiredByType[type] || []
  const missing  = required.filter(k => !conn[k])

  if (missing.length > 0) {
    const labels: Record<string, string> = { host:'Host', database:'Database', username:'Username', project:'Project ID', connectionString:'Connection URI', filePath:'File Path' }
    steps.push({ label:'Field validation', status:'fail', detail:`Missing: ${missing.map(k => labels[k] || k).join(', ')}` })
    return {
      success: false, status: 'error', steps,
      errorCode: 'MISSING_FIELDS',
      errorMessage: `Required fields are missing: ${missing.map(k => labels[k] || k).join(', ')}`,
      suggestion: 'Edit the connection and fill in all required fields.'
    }
  }
  steps.push({ label:'Field validation', status:'ok', detail:'All required fields present' })

  // For CSV: check if it looks like a URL (can ping) or file path
  if (type === 'csv') {
    const fp = conn.filePath as string
    if (fp.startsWith('http')) {
      try {
        const res = await fetch(fp, { method:'HEAD', signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          steps.push({ label:'File reachability', status:'ok', detail:`URL is reachable (HTTP ${res.status})` })
          safeUpdateStatus(conn.id as string, 'active')
          return { success:true, status:'active', steps }
        } else {
          steps.push({ label:'File reachability', status:'fail', detail:`HTTP ${res.status} — file not accessible` })
          safeUpdateStatus(conn.id as string, 'error')
          return { success:false, status:'error', steps, errorCode:`HTTP_${res.status}`, errorMessage:`File URL returned HTTP ${res.status}`, suggestion:'Verify the file URL is publicly accessible.' }
        }
      } catch {
        steps.push({ label:'File reachability', status:'fail', detail:'Cannot reach URL' })
        safeUpdateStatus(conn.id as string, 'error')
        return { success:false, status:'error', steps, errorCode:'NETWORK_ERROR', errorMessage:'Cannot reach the provided URL.', suggestion:'Check the URL and network connectivity.' }
      }
    } else {
      steps.push({ label:'File path check', status:'ok', detail:`Local path accepted: ${fp}` })
      steps.push({ label:'Connection test', status:'ok', detail:'File path configuration saved (actual file access happens at query time)' })
      safeUpdateStatus(conn.id as string, 'active')
      return { success:true, status:'active', steps }
    }
  }

  // For API: ping the base URL
  if (type === 'api') {
    try {
      const res = await fetch(conn.host as string, { method:'GET', signal: AbortSignal.timeout(6000) })
      steps.push({ label:'API reachability', status:'ok', detail:`Endpoint responding (HTTP ${res.status})` })
      safeUpdateStatus(conn.id as string, 'active')
      return { success:true, status:'active', steps }
    } catch (e: unknown) {
      steps.push({ label:'API reachability', status:'fail', detail:(e as Error).message })
      safeUpdateStatus(conn.id as string, 'error')
      return { success:false, status:'error', steps, errorCode:'NETWORK_ERROR', errorMessage:`Cannot reach ${conn.host}`, suggestion:'Verify the Base URL is correct and accessible.' }
    }
  }

  // For DB types that need drivers (pg, mysql, etc.) — validate format and mark as needing driver
  steps.push({ label:'Credential format', status:'ok', detail:`${conn.username ? `User: ${conn.username}, ` : ''}Host: ${conn.host}, DB: ${conn.database}` })
  steps.push({ label:'Driver test', status:'skip', detail:`Full connection test for ${type.toUpperCase()} requires a database driver installed on the server.` })

  safeUpdateStatus(conn.id as string, 'inactive')
  return {
    success: false, status: 'inactive', steps,
    errorCode: 'DRIVER_NOT_INSTALLED',
    errorMessage: `Live ${type.toUpperCase()} connection testing is not yet set up on this server.`,
    suggestion: `Install the "${type === 'postgresql' ? 'pg' : type === 'mysql' ? 'mysql2' : type}-connector" package and add your server credentials to test a live ${type} connection.`
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connectionId, connectionData } = body

  // Try store first, fall back to client-provided data (for edge/Cloudflare deployments
  // where in-memory store is per-request and doesn't persist)
  let connection = store.connections.getById(connectionId)
  if (!connection && connectionData) {
    connection = connectionData
  }

  if (!connection) {
    return NextResponse.json({ success: false, errorMessage: 'Connection not found' }, { status: 404 })
  }

  const conn = connection as unknown as Record<string, unknown>
  // Ensure the ID is set for status updates
  conn.id = connectionId

  let result: TestResult
  if (connection.type === 'snowflake') {
    result = await testSnowflake(conn)
  } else {
    result = await testGeneric(conn, connection.type)
  }

  return NextResponse.json(result)
}
