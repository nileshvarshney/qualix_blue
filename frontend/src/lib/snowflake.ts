/**
 * Snowflake query helper — server-side only (Node.js runtime).
 * Uses snowflake-sdk with username/password auth.
 * On Cloudflare Workers (edge), all functions throw with a clear message.
 */
import { store } from './store'

type Row = Record<string, unknown>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdk: any = null
let _sdkLoaded = false

/** Lazily load snowflake-sdk — only resolves in Node.js, fails gracefully on edge */
async function getSdk() {
  if (_sdkLoaded) return _sdk
  _sdkLoaded = true
  try {
    // Dynamic require keeps the native module out of the Cloudflare/esbuild bundle
    _sdk = require(/* webpackIgnore: true */ 'snowflake-sdk')
    _sdk.configure({ logLevel: 'ERROR' })
  } catch {
    _sdk = null
  }
  return _sdk
}

/** Execute a SQL statement against the saved active Snowflake connection. */
export async function querySnowflake(sql: string, binds?: unknown[]): Promise<Row[]> {
  const sdk = await getSdk()
  if (!sdk) {
    throw new Error(
      'Snowflake SDK requires Node.js runtime. ' +
      'Live Snowflake queries are not available on edge deployments. ' +
      'The app will operate in demo mode with sample data.'
    )
  }

  const all = store.connections.getAll()
  const conn = all.find(c => c.type === 'snowflake' && c.status === 'active')
    ?? all.find(c => c.type === 'snowflake')

  if (!conn) throw new Error('No Snowflake connection configured. Add one in the Connections page.')

  const account = (conn.account as string ?? '').replace(/\.snowflakecomputing\.com$/i, '')

  const sfConn = sdk.createConnection({
    account,
    username:  conn.username ?? '',
    password:  conn.password as string ?? '',
    warehouse: conn.warehouse ?? '',
    database:  conn.database ?? '',
    schema:    conn.schema   ?? '',
    role:      conn.role     ?? '',
    application: 'DataGuard',
  })

  return new Promise((resolve, reject) => {
    sfConn.connect((err: Error | undefined, c: { execute: Function }) => {
      if (err) return reject(new Error(`Snowflake auth failed: ${err.message}`))

      c.execute({
        sqlText: sql,
        binds:   binds as unknown[],
        complete: (err2: Error | undefined, _stmt: unknown, rows: Row[]) => {
          if (typeof sfConn.destroy === 'function') sfConn.destroy(() => {})
          if (err2) return reject(new Error(`Query error: ${err2.message}`))
          resolve((rows ?? []) as Row[])
        }
      })
    })
  })
}

/** Return metadata + row count for every table / view in the schema. */
export async function getTableMetadata(): Promise<Row[]> {
  return querySnowflake(`
    SELECT
      t.TABLE_NAME,
      t.TABLE_TYPE,
      t.ROW_COUNT,
      t.BYTES,
      t.CREATED,
      t.LAST_ALTERED,
      t.COMMENT,
      t.TABLE_SCHEMA,
      t.TABLE_CATALOG
    FROM INFORMATION_SCHEMA.TABLES t
    WHERE t.TABLE_SCHEMA = CURRENT_SCHEMA()
      AND t.TABLE_TYPE IN ('BASE TABLE','VIEW')
    ORDER BY t.TABLE_TYPE DESC, t.TABLE_NAME
  `)
}

/** Return column-level metadata for a single table. */
export async function getColumnMetadata(tableName: string): Promise<Row[]> {
  return querySnowflake(`
    SELECT
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      CHARACTER_MAXIMUM_LENGTH,
      NUMERIC_PRECISION,
      ORDINAL_POSITION,
      COMMENT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = CURRENT_SCHEMA()
      AND TABLE_NAME   = ?
    ORDER BY ORDINAL_POSITION
  `, [tableName.toUpperCase()])
}

/** Preview first N rows of a table. */
export async function previewTable(tableName: string, limit = 50): Promise<Row[]> {
  return querySnowflake(`SELECT * FROM IDENTIFIER(?) LIMIT ?`, [tableName, limit])
}

/** Run a null-check quality rule against a column and return pass/fail + stats. */
export async function runNullCheck(tableName: string, columnName: string) {
  const rows = await querySnowflake(`
    SELECT
      COUNT(*)                                          AS total_rows,
      COUNT(CASE WHEN "${columnName}" IS NULL THEN 1 END) AS null_count,
      ROUND(COUNT(CASE WHEN "${columnName}" IS NULL THEN 1 END)
            / NULLIF(COUNT(*),0) * 100, 4)              AS null_pct
    FROM IDENTIFIER(?)
  `, [tableName])
  return rows[0]
}
