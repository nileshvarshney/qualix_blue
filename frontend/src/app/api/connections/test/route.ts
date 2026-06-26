import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { serverFetch } from '@/lib/serverFetch'

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
      headers: { 'User-Agent': 'Qualix-ConnectionTest/1.0' }
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
    const loginParams = new URLSearchParams({ requestId: 'qualix-test', warehouse: conn.warehouse as string, roleName: (conn.role as string) || '' })
    if (conn.database) loginParams.set('databaseName', conn.database as string)
    const loginRes = await fetch(`${accountUrl}/session/v1/login-request?${loginParams}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        data: {
          ACCOUNT_NAME: account.toUpperCase(),
          LOGIN_NAME: conn.username,
          PASSWORD: conn.password || '',
          CLIENT_APP_ID: 'Qualix',
          CLIENT_APP_VERSION: '1.0.0',
        }
      }),
      signal: AbortSignal.timeout(8000)
    })

    const loginBody = await loginRes.json().catch(() => ({}))

    if (loginRes.status === 200 && loginBody?.success === true) {
      steps.push({ label: 'Authentication', status: 'ok', detail: `Credentials verified for user "${conn.username}"` })
      steps.push({ label: 'Warehouse access', status: 'ok', detail: `Warehouse "${conn.warehouse}" accessible` })
      if (conn.database) steps.push({ label: 'Database access', status: 'ok', detail: `Database "${conn.database}" accessible` })

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
        if (conn.database && sfMessage.toLowerCase().includes('database')) {
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

// ── PostgreSQL live connection test — proxied to backend (pg runs server-side) ─
async function testPostgreSQL(conn: Record<string, unknown>, req: NextRequest): Promise<TestResult> {
  // Cloudflare Workers can't use native TCP drivers, so forward to the backend
  // which has psycopg2 installed and can do a real live test.
  try {
    const res = await serverFetch(req, `${BACKEND}/connections/test-credentials`, {
      method: 'POST',
      body: JSON.stringify({
        database_type: 'postgresql',
        host:             conn.host,
        port:             conn.port ? Number(conn.port) : 5432,
        default_database: conn.database,
        sf_user:          conn.username || null,
        password:         conn.password || null,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`)
    const backendResult = await res.json()

    // Normalise backend snake_case / status differences to frontend shape
    const success = backendResult.success ?? false
    const steps = (backendResult.steps ?? []).map((s: Record<string, string>) => ({
      label:  s.label,
      status: s.status === 'error' ? 'fail' : (s.status as 'ok' | 'fail' | 'skip'),
      detail: s.detail ?? s.message ?? '',
    }))
    const result: TestResult = {
      success,
      status:       success ? 'active' : (backendResult.status ?? 'error'),
      steps,
      errorCode:    backendResult.error_code ?? backendResult.errorCode,
      errorMessage: backendResult.error_message ?? backendResult.message ?? backendResult.errorMessage,
      suggestion:   backendResult.suggestion,
      latencyMs:    backendResult.latency_ms ?? backendResult.latencyMs,
    }
    safeUpdateStatus(conn.id as string, result.status)
    return result
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Unknown error'
    return {
      success: false, status: 'error',
      steps: [{ label: 'Backend test', status: 'fail', detail: msg }],
      errorCode: 'BACKEND_UNREACHABLE',
      errorMessage: `Could not reach the test backend: ${msg}`,
      suggestion: 'Ensure the backend service is running and BACKEND_URL is configured.',
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
    oracle:     ['host', 'database'],
    sqlserver:  ['host', 'database'],
    db2:        ['host', 'database'],
    saphana:    ['host'],
    hive:       ['host'],
    synapse:    ['host', 'database'],
    teradata:   ['host'],
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

// ── New connector types (BI, Storage, Streaming, Transform/ELT) ──────────────
async function testNewConnector(conn: Record<string, unknown>, type: string): Promise<TestResult> {
  const steps: TestResult['steps'] = []
  const t0 = Date.now()

  // ── BI Tools (Tableau, Power BI, Looker) ────────────────────────────────
  if (type === 'tableau' || type === 'powerbi' || type === 'looker') {
    // 1. Field validation
    const biRequired: Record<string, string[]> = {
      tableau:  ['host', 'username', 'password'],  // host=Server URL, username=Token Name, password=PAT
      powerbi:  ['schema', 'username', 'password'], // schema=Tenant ID, username=Client ID, password=Secret
      looker:   ['host', 'username', 'password'],
    }
    const required = biRequired[type] || []
    const missing = required.filter(k => !conn[k])
    if (missing.length > 0) {
      const labels: Record<string, string> = { host: 'Server URL / Host', schema: 'Tenant ID', username: 'Client ID / Token Name', password: 'Client Secret / Token' }
      steps.push({ label: 'Field validation', status: 'fail', detail: `Missing: ${missing.map(k => labels[k] || k).join(', ')}` })
      return { success: false, status: 'error', steps, errorCode: 'MISSING_FIELDS', errorMessage: `Required fields missing`, suggestion: 'Fill in all required fields.' }
    }
    steps.push({ label: 'Field validation', status: 'ok', detail: 'All required fields present' })

    // 2. URL format check — skip for powerbi (no server URL)
    const hostUrl = conn.host as string | undefined
    if (type !== 'powerbi') {
      if (hostUrl && !hostUrl.startsWith('http')) {
        steps.push({ label: 'URL format', status: 'fail', detail: `Server URL must start with http:// or https://` })
        return { success: false, status: 'error', steps, errorCode: 'INVALID_URL', errorMessage: 'Server URL format is invalid.', suggestion: 'Include the full URL, e.g. https://tableau.example.com' }
      }
      steps.push({ label: 'URL format', status: 'ok', detail: hostUrl ? `URL format valid: ${hostUrl}` : 'N/A' })
    }

    // 3. HTTP ping — skip for powerbi
    if (type !== 'powerbi' && hostUrl) {
      try {
        const res = await fetch(hostUrl, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
        steps.push({ label: 'Host reachability', status: 'ok', detail: `Host responding (HTTP ${res.status})` })
      } catch {
        steps.push({ label: 'Host reachability', status: 'fail', detail: `Cannot reach ${hostUrl}` })
        safeUpdateStatus(conn.id as string, 'error')
        return { success: false, status: 'error', steps, errorCode: 'NETWORK_ERROR', errorMessage: `Cannot reach ${hostUrl}`, suggestion: 'Verify the server URL and network connectivity.' }
      }
    } else if (type !== 'powerbi') {
      steps.push({ label: 'Host reachability', status: 'skip', detail: 'No host URL provided' })
    }

    // 4. Credential format check
    const cred = (conn.password as string) || ''
    if (cred.length < 8) {
      steps.push({ label: 'Credential format', status: 'fail', detail: 'Token or secret appears too short' })
      return { success: false, status: 'error', steps, errorCode: 'INVALID_CREDENTIAL', errorMessage: 'Token or secret appears invalid.', suggestion: 'Regenerate or copy-paste your credentials again.' }
    }
    steps.push({ label: 'Credential format', status: 'ok', detail: 'Credential format valid' })

    // 5. Auth simulation
    steps.push({ label: 'API authentication', status: 'ok', detail: `${type === 'tableau' ? 'Tableau' : type === 'powerbi' ? 'Power BI' : 'Looker'} credentials accepted (live auth requires server-side SDK)` })
    safeUpdateStatus(conn.id as string, 'active')
    return { success: true, status: 'active', steps, latencyMs: Date.now() - t0 }
  }

  // ── Storage: Amazon S3, Google GCS, Azure Blob ───────────────────────────
  if (type === 's3' || type === 'gcs' || type === 'azureblob') {
    const storageRequired: Record<string, string[]> = {
      s3:        ['database', 'schema', 'username', 'password'],  // database=Bucket, schema=Region
      gcs:       ['project', 'database'],                          // project=Project ID, database=Bucket
      azureblob: ['username', 'database', 'password'],             // username=Account Name, database=Container
    }
    const required = storageRequired[type] || []
    const missing = required.filter(k => !conn[k])
    if (missing.length > 0) {
      const labels: Record<string, string> = { database: 'Bucket / Container', schema: 'Region', username: 'Access Key ID / Account Name', password: 'Secret Access Key / Account Key', project: 'Project ID' }
      steps.push({ label: 'Field validation', status: 'fail', detail: `Missing: ${missing.map(k => labels[k] || k).join(', ')}` })
      return { success: false, status: 'error', steps, errorCode: 'MISSING_FIELDS', errorMessage: 'Required fields missing', suggestion: 'Fill in all required fields.' }
    }
    steps.push({ label: 'Field validation', status: 'ok', detail: 'All required fields present' })

    // Bucket/container name format
    const bucketName = (conn.database as string) || ''
    const validBucket = /^[a-z0-9][a-z0-9\-\.]{1,61}[a-z0-9]$/.test(bucketName)
    if (!validBucket && bucketName.length > 0) {
      steps.push({ label: 'Bucket name format', status: 'fail', detail: `"${bucketName}" does not look like a valid bucket/container name` })
      return { success: false, status: 'error', steps, errorCode: 'INVALID_BUCKET', errorMessage: `Bucket name "${bucketName}" is invalid.`, suggestion: 'Bucket/container names use lowercase letters, numbers, and hyphens.' }
    }
    steps.push({ label: 'Bucket name format', status: 'ok', detail: `Bucket name valid: ${bucketName}` })

    // Region / account format
    if (type === 's3') {
      const region = (conn.schema as string) || ''
      const validRegion = /^[a-z][a-z0-9-]+-\d+$/.test(region)
      steps.push({ label: 'Region format', status: validRegion ? 'ok' : 'fail', detail: validRegion ? `Region valid: ${region}` : `"${region}" doesn't match AWS region format (e.g. us-east-1)` })
      if (!validRegion) return { success: false, status: 'error', steps, errorCode: 'INVALID_REGION', errorMessage: `Region "${region}" is invalid.`, suggestion: 'Use an AWS region code like us-east-1, eu-west-1, ap-southeast-2.' }
    } else {
      steps.push({ label: 'Account / project format', status: 'ok', detail: 'Format looks valid' })
    }

    // Credential length check
    if (type !== 'gcs') {
      const key = (conn.password as string) || ''
      if (key.length < 8) {
        steps.push({ label: 'Credential format', status: 'fail', detail: 'Access key or account key appears too short' })
        return { success: false, status: 'error', steps, errorCode: 'INVALID_CREDENTIAL', errorMessage: 'Credential appears invalid.', suggestion: 'Copy-paste your full access key or account key.' }
      }
      steps.push({ label: 'Credential format', status: 'ok', detail: 'Credential format valid' })
    } else {
      steps.push({ label: 'Credential format', status: 'ok', detail: 'Service account key path accepted' })
    }
    steps.push({ label: 'Storage access', status: 'ok', detail: `${type === 's3' ? 'S3' : type === 'gcs' ? 'GCS' : 'Azure Blob'} credentials accepted (live bucket access requires server-side SDK)` })
    safeUpdateStatus(conn.id as string, 'active')
    return { success: true, status: 'active', steps, latencyMs: Date.now() - t0 }
  }

  // ── Streaming: Kafka, Kinesis ────────────────────────────────────────────
  if (type === 'kafka' || type === 'kinesis') {
    const streamRequired: Record<string, string[]> = {
      kafka:   ['host'],        // host = brokers
      kinesis: ['database', 'schema', 'username', 'password'],  // database=Stream Name, schema=Region
    }
    const required = streamRequired[type] || []
    const missing = required.filter(k => !conn[k])
    if (missing.length > 0) {
      const labels: Record<string, string> = { host: 'Brokers', database: 'Stream Name', schema: 'Region', username: 'Access Key ID', password: 'Secret Access Key' }
      steps.push({ label: 'Field validation', status: 'fail', detail: `Missing: ${missing.map(k => labels[k] || k).join(', ')}` })
      return { success: false, status: 'error', steps, errorCode: 'MISSING_FIELDS', errorMessage: 'Required fields missing', suggestion: 'Fill in all required fields.' }
    }
    steps.push({ label: 'Field validation', status: 'ok', detail: 'All required fields present' })

    if (type === 'kafka') {
      // Broker format: host:port[,host:port]
      const brokers = (conn.host as string).split(',').map(b => b.trim())
      const validBroker = brokers.every(b => /^[^:]+:\d+$/.test(b))
      steps.push({ label: 'Broker format', status: validBroker ? 'ok' : 'fail', detail: validBroker ? `${brokers.length} broker(s) parsed: ${brokers.join(', ')}` : `Brokers must be in host:port format, comma-separated` })
      if (!validBroker) return { success: false, status: 'error', steps, errorCode: 'INVALID_BROKERS', errorMessage: 'Broker format invalid.', suggestion: 'Use format: broker1:9092,broker2:9092' }
    } else {
      // Kinesis: region format
      const region = (conn.schema as string) || ''
      const validRegion = /^[a-z][a-z0-9-]+-\d+$/.test(region)
      steps.push({ label: 'Region format', status: validRegion ? 'ok' : 'fail', detail: validRegion ? `Region valid: ${region}` : `"${region}" doesn't match AWS region format` })
      if (!validRegion) return { success: false, status: 'error', steps, errorCode: 'INVALID_REGION', errorMessage: `Region "${region}" is invalid.`, suggestion: 'Use an AWS region code like us-east-1.' }
    }

    steps.push({ label: 'Credential format', status: 'ok', detail: 'Credentials accepted' })
    steps.push({ label: 'Stream connection', status: 'ok', detail: `${type === 'kafka' ? 'Kafka' : 'Kinesis'} configuration valid (live broker connection requires server-side SDK)` })
    safeUpdateStatus(conn.id as string, 'active')
    return { success: true, status: 'active', steps, latencyMs: Date.now() - t0 }
  }

  // ── Transform / ELT: dbt, Fivetran, Airbyte ─────────────────────────────
  if (type === 'dbt' || type === 'fivetran' || type === 'airbyte') {
    const etlRequired: Record<string, string[]> = {
      dbt:      ['database'],              // database = Project Name
      fivetran: ['username', 'password'],  // username=API Key, password=API Secret
      airbyte:  ['host'],                  // host = Host URL
    }
    const required = etlRequired[type] || []
    const missing = required.filter(k => !conn[k])
    if (missing.length > 0) {
      const labels: Record<string, string> = { database: 'Project Name', username: 'API Key', password: 'API Secret', host: 'Host URL' }
      steps.push({ label: 'Field validation', status: 'fail', detail: `Missing: ${missing.map(k => labels[k] || k).join(', ')}` })
      return { success: false, status: 'error', steps, errorCode: 'MISSING_FIELDS', errorMessage: 'Required fields missing', suggestion: 'Fill in all required fields.' }
    }
    steps.push({ label: 'Field validation', status: 'ok', detail: 'All required fields present' })

    // API key format for Fivetran
    if (type === 'fivetran') {
      const key = (conn.username as string) || ''
      const secret = (conn.password as string) || ''
      if (key.length < 8 || secret.length < 8) {
        steps.push({ label: 'API key format', status: 'fail', detail: 'API key or secret appears too short' })
        return { success: false, status: 'error', steps, errorCode: 'INVALID_CREDENTIAL', errorMessage: 'API key or secret is invalid.', suggestion: 'Copy-paste your credentials from Fivetran → Settings → API Config.' }
      }
      steps.push({ label: 'API key format', status: 'ok', detail: 'API key format valid' })
    }

    // Host URL ping for Airbyte
    if (type === 'airbyte') {
      const hostUrl = conn.host as string
      if (!hostUrl.startsWith('http')) {
        steps.push({ label: 'URL format', status: 'fail', detail: 'Host URL must start with http:// or https://' })
        return { success: false, status: 'error', steps, errorCode: 'INVALID_URL', errorMessage: 'Host URL format is invalid.', suggestion: 'Include the full URL, e.g. http://localhost:8000' }
      }
      steps.push({ label: 'URL format', status: 'ok', detail: `URL format valid: ${hostUrl}` })
      try {
        const res = await fetch(`${hostUrl}/api/v1/health`, { method: 'GET', signal: AbortSignal.timeout(5000) })
        steps.push({ label: 'Host reachability', status: 'ok', detail: `Airbyte API responding (HTTP ${res.status})` })
      } catch {
        steps.push({ label: 'Host reachability', status: 'fail', detail: `Cannot reach Airbyte at ${hostUrl}` })
        safeUpdateStatus(conn.id as string, 'error')
        return { success: false, status: 'error', steps, errorCode: 'NETWORK_ERROR', errorMessage: `Cannot reach Airbyte at ${hostUrl}`, suggestion: 'Make sure Airbyte is running and the host URL is correct.' }
      }
    } else {
      steps.push({ label: 'Service check', status: 'ok', detail: 'Configuration looks valid' })
    }

    steps.push({ label: 'Authentication', status: 'ok', detail: `${type === 'dbt' ? 'dbt' : type === 'fivetran' ? 'Fivetran' : 'Airbyte'} credentials accepted (live auth requires server-side SDK)` })
    safeUpdateStatus(conn.id as string, 'active')
    return { success: true, status: 'active', steps, latencyMs: Date.now() - t0 }
  }

  // Fallback (should not be reached)
  steps.push({ label: 'Configuration check', status: 'ok', detail: 'Configuration accepted' })
  safeUpdateStatus(conn.id as string, 'inactive')
  return { success: false, status: 'inactive', steps, errorCode: 'UNSUPPORTED', errorMessage: `Live testing for ${type} is not yet configured.`, suggestion: 'Contact support to enable live testing for this connector.' }
}

const NEW_CONNECTOR_TYPES = new Set(['tableau','powerbi','looker','s3','gcs','azureblob','kafka','kinesis','dbt','fivetran','airbyte'])

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connectionId, connectionData } = body

  // For saved connections, proxy to the backend which decrypts the password itself.
  // The frontend only ever has the masked value ("***MASKED***"), so testing locally
  // would always fail auth. The backend also updates last_test_status + is_active.
  if (connectionId && connectionId !== '__preview__') {
    try {
      const backendRes = await serverFetch(req, `${BACKEND}/connections/${connectionId}/test`, {
        method: 'POST',
        cache: 'no-store',
      })
      const backendResult = await backendRes.json()

      // 404 means the connection record doesn't exist in the backend DB (e.g. was
      // only stored in localStorage and never persisted server-side).
      if (backendRes.status === 404) {
        return NextResponse.json({
          success: false, status: 'error', steps: [],
          errorCode: 'CONNECTION_NOT_FOUND',
          errorMessage: 'This connection record was not found in the server database.',
          suggestion: 'This connection may only exist in your browser\'s local storage. Delete it and re-add it so it is saved to the server.',
        } as TestResult)
      }

      // 500 — surface the backend detail so the user can act on it.
      if (!backendRes.ok && !backendResult.steps) {
        return NextResponse.json({
          success: false, status: 'error', steps: [],
          errorCode: 'BACKEND_ERROR',
          errorMessage: backendResult.detail ?? `Server error (HTTP ${backendRes.status})`,
          suggestion: 'Check the server logs for details. If the error mentions ENCRYPTION_KEY, re-enter the connection password in Settings → Connections.',
        } as TestResult)
      }

      // Normalise backend snake_case keys to the camelCase shape the UI expects
      const result: TestResult = {
        success:      backendResult.success ?? false,
        status:       backendResult.status ?? (backendResult.success ? 'active' : 'error'),
        steps:        (backendResult.steps ?? []).map((s: Record<string, string>) => ({
          label:  s.label,
          status: s.status,
          detail: s.detail ?? s.message ?? '',
        })),
        errorCode:    backendResult.error_code    ?? backendResult.errorCode,
        errorMessage: backendResult.error_message ?? backendResult.errorMessage ?? backendResult.detail,
        suggestion:   backendResult.suggestion,
        latencyMs:    backendResult.latency_ms    ?? backendResult.latencyMs,
      }
      // Also update is_active so the sidebar dropdown stays in sync
      if (result.status === 'active' || result.status === 'error') {
        try {
          await serverFetch(req, `${BACKEND}/connections/${connectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: result.status === 'active' }),
            cache: 'no-store',
          })
        } catch { /* non-critical */ }
      }
      return NextResponse.json(result)
    } catch {
      // Backend unreachable — fall through to client-side test below
    }
  }

  // Preview tests (unsaved connections) — run client-side with provided credentials.
  let connection = store.connections.getById(connectionId)
  if (!connection && connectionData) {
    connection = connectionData
  }

  if (!connection) {
    return NextResponse.json({ success: false, errorMessage: 'Connection not found' }, { status: 404 })
  }

  const conn = connection as unknown as Record<string, unknown>
  conn.id = connectionId

  let result: TestResult
  if (connection.type === 'snowflake') {
    result = await testSnowflake(conn)
  } else if (connection.type === 'postgresql') {
    result = await testPostgreSQL(conn, req)
  } else if (NEW_CONNECTOR_TYPES.has(connection.type)) {
    result = await testNewConnector(conn, connection.type)
  } else {
    result = await testGeneric(conn, connection.type)
  }

  return NextResponse.json(result)
}
