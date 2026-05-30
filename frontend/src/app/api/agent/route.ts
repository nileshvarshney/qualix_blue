import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { store } from '@/lib/store'
import { generateId } from '@/lib/utils'
import { Connection, Rule } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

const tools: Anthropic.Tool[] = [
  {
    name: 'list_connections',
    description: 'List all data source connections configured in the system',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'create_connection',
    description: 'Create a new data source connection',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Display name for the connection' },
        type: { type: 'string', enum: ['postgresql', 'mysql', 'bigquery', 'snowflake', 'csv', 'api', 'mongodb', 'redshift'], description: 'Database type' },
        host: { type: 'string', description: 'Database host (optional for cloud databases)' },
        port: { type: 'number', description: 'Database port' },
        database: { type: 'string', description: 'Database or project name' },
        username: { type: 'string', description: 'Database username' },
        schema: { type: 'string', description: 'Schema name' }
      },
      required: ['name', 'type']
    }
  },
  {
    name: 'list_rules',
    description: 'List all data quality rules. Can filter by category, connection, or status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Filter by category (completeness, accuracy, uniqueness, validity, timeliness, consistency)' },
        connectionId: { type: 'string', description: 'Filter by connection ID' },
        enabled: { type: 'boolean', description: 'Filter by enabled/disabled status' }
      },
      required: []
    }
  },
  {
    name: 'create_rule',
    description: 'Create a new data quality rule',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Rule name' },
        description: { type: 'string', description: 'What this rule checks' },
        category: { type: 'string', enum: ['completeness', 'accuracy', 'uniqueness', 'validity', 'timeliness', 'consistency'] },
        type: { type: 'string', enum: ['not_null', 'unique', 'range', 'regex', 'custom_sql', 'freshness', 'row_count', 'referential'] },
        connectionId: { type: 'string', description: 'Connection ID to apply this rule to' },
        tableName: { type: 'string', description: 'Table to check' },
        columnName: { type: 'string', description: 'Column to check (optional for table-level rules)' },
        parameters: { type: 'object', description: 'Rule parameters (e.g., min/max for range, pattern for regex, maxAgeHours for freshness)' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
      },
      required: ['name', 'category', 'type', 'connectionId', 'tableName', 'severity']
    }
  },
  {
    name: 'edit_rule',
    description: 'Edit an existing data quality rule. Use list_rules first to find the rule ID. Only include fields you want to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ruleId: { type: 'string', description: 'Rule ID to edit' },
        name: { type: 'string', description: 'New rule name' },
        description: { type: 'string', description: 'New description' },
        category: { type: 'string', enum: ['completeness', 'accuracy', 'uniqueness', 'validity', 'timeliness', 'consistency'] },
        type: { type: 'string', enum: ['not_null', 'unique', 'range', 'regex', 'custom_sql', 'freshness', 'row_count', 'referential'] },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        status: { type: 'string', enum: ['active', 'draft', 'pending_review', 'disabled', 'archived'] },
        tableName: { type: 'string', description: 'Target table' },
        columnName: { type: 'string', description: 'Target column' },
        parameters: { type: 'object', description: 'Rule parameters (min/max for range, pattern for regex, maxAgeHours for freshness, sql for custom_sql, etc.)' }
      },
      required: ['ruleId']
    }
  },
  {
    name: 'toggle_rule',
    description: 'Enable or disable a data quality rule',
    input_schema: {
      type: 'object' as const,
      properties: {
        ruleId: { type: 'string', description: 'Rule ID to toggle' },
        enabled: { type: 'boolean', description: 'Set to true to enable, false to disable' }
      },
      required: ['ruleId', 'enabled']
    }
  },
  {
    name: 'run_quality_check',
    description: 'Run data quality checks and generate a new report',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name for this quality check run' }
      },
      required: []
    }
  },
  {
    name: 'get_report',
    description: 'Get the latest data quality report with scores and check results',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_dashboard_stats',
    description: 'Get overall dashboard statistics including totals, scores, and trends',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'discover_warehouse_schema',
    description: 'Browse a connected warehouse to discover databases, schemas, and tables. Call with just connection_id to list databases; add database to list schemas; add database+schema to list tables with row counts. Use this first to find what tables exist before querying data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        connection_id: { type: 'string', description: 'Connection ID (use list_connections to find it)' },
        database: { type: 'string', description: 'Database name to browse schemas/tables in' },
        schema: { type: 'string', description: 'Schema name to list tables in (requires database)' }
      },
      required: ['connection_id']
    }
  },
  {
    name: 'get_table_columns',
    description: 'Get detailed column information for a specific table including column names, data types, nullability, and sample values. Use this to understand what data a table contains before writing a query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        connection_id: { type: 'string', description: 'Connection ID' },
        database: { type: 'string', description: 'Database name' },
        schema: { type: 'string', description: 'Schema name' },
        table: { type: 'string', description: 'Table name' }
      },
      required: ['connection_id', 'database', 'schema', 'table']
    }
  },
  {
    name: 'query_warehouse',
    description: 'Execute a SELECT SQL query against the connected warehouse and return results. Use this after discovering tables and columns to answer analytical questions like "top 20 sales by region" or "average order value per month". Only SELECT queries are allowed. Results are limited to 100 rows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        connection_id: { type: 'string', description: 'Connection ID' },
        sql: { type: 'string', description: 'The SELECT SQL query to execute' },
        limit: { type: 'number', description: 'Max rows to return (default 100, max 500)' }
      },
      required: ['connection_id', 'sql']
    }
  },
  {
    name: 'explain_columns',
    description: 'Explain what columns in a table mean, how they are derived (including view definitions), their data types, relationships, and statistical profile. Use this when the user asks how metrics are calculated or what a column represents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        connection_id: { type: 'string', description: 'Connection ID' },
        database: { type: 'string', description: 'Database name' },
        schema: { type: 'string', description: 'Schema name' },
        table: { type: 'string', description: 'Table name' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Specific columns to explain (optional, explains all if omitted)' }
      },
      required: ['connection_id', 'database', 'schema', 'table']
    }
  }
]

const WAREHOUSE_TOOLS = new Set([
  'discover_warehouse_schema', 'get_table_columns', 'query_warehouse', 'explain_columns'
])

async function executeWarehouseTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  const backendPayload = { messages: [{ role: 'user', content: `__tool__:${toolName}:${JSON.stringify(input)}` }] }

  // Map tool calls to the appropriate backend REST endpoints
  if (toolName === 'discover_warehouse_schema') {
    const connId = input.connection_id as string
    const database = input.database as string | undefined
    const schema = input.schema as string | undefined
    let url: string
    if (database && schema) {
      url = `${BACKEND_URL}/connections/${connId}/tables?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}`
    } else if (database) {
      url = `${BACKEND_URL}/connections/${connId}/schemas?database=${encodeURIComponent(database)}`
    } else {
      url = `${BACKEND_URL}/connections/${connId}/databases`
    }
    const res = await fetch(url)
    return await res.json()
  }

  if (toolName === 'get_table_columns') {
    const connId = input.connection_id as string
    const database = input.database as string
    const schema = input.schema as string
    const table = input.table as string
    const colUrl = `${BACKEND_URL}/connections/${connId}/columns?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`
    const previewUrl = `${BACKEND_URL}/connections/${connId}/preview?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}&limit=5`
    const [colRes, previewRes] = await Promise.all([fetch(colUrl), fetch(previewUrl)])
    const cols = await colRes.json()
    const preview = await previewRes.json()
    return { ...cols, sample_data: preview.data }
  }

  if (toolName === 'query_warehouse') {
    const sql = (input.sql as string || '').trim()
    const sqlUpper = sql.toUpperCase()
    if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
      return { error: 'Only SELECT queries are allowed for safety.' }
    }
    const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|MERGE)\b/i
    if (blocked.test(sql)) {
      return { error: 'Query contains disallowed statements. Only SELECT/WITH queries are permitted.' }
    }
    const connId = input.connection_id as string
    const limit = Math.min((input.limit as number) || 100, 500)
    // Use the backend preview endpoint with a custom SQL query
    const res = await fetch(`${BACKEND_URL}/ai/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `Execute this SQL on connection ${connId}: ${sql}` }]
      })
    })
    if (!res.ok) {
      return { error: `Backend returned ${res.status}. Ensure the FastAPI backend is running at ${BACKEND_URL}` }
    }
    return await res.json()
  }

  if (toolName === 'explain_columns') {
    const connId = input.connection_id as string
    const database = input.database as string
    const schema = input.schema as string
    const table = input.table as string
    // Get columns + check if it's a view
    const colUrl = `${BACKEND_URL}/connections/${connId}/columns?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`
    const tableUrl = `${BACKEND_URL}/connections/${connId}/tables?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}`
    const [colRes, tableRes] = await Promise.all([fetch(colUrl), fetch(tableUrl)])
    const cols = await colRes.json()
    const tables = await tableRes.json()
    const tableInfo = (tables.tables || tables)?.find?.((t: { table_name?: string }) =>
      t.table_name?.toUpperCase() === table.toUpperCase()
    )
    return {
      ...cols,
      table_type: tableInfo?.table_type || 'BASE TABLE',
      view_definition: tableInfo?.view_definition || null,
      row_count: tableInfo?.row_count || null,
    }
  }

  return { error: `Unknown warehouse tool: ${toolName}` }
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  if (WAREHOUSE_TOOLS.has(toolName)) {
    return executeWarehouseTool(toolName, input)
  }
  switch (toolName) {
    case 'list_connections': {
      const connections = store.connections.getAll()
      return { connections, total: connections.length }
    }
    case 'create_connection': {
      const conn: Connection = {
        id: generateId('conn'),
        name: input.name as string,
        type: input.type as Connection['type'],
        host: input.host as string | undefined,
        port: input.port as number | undefined,
        database: input.database as string | undefined,
        username: input.username as string | undefined,
        schema: input.schema as string | undefined,
        status: 'inactive',
        createdAt: new Date().toISOString()
      }
      store.connections.create(conn)
      return { success: true, connection: conn, message: `Connection "${conn.name}" created successfully!` }
    }
    case 'list_rules': {
      let rules = store.rules.getAll()
      if (input.category) rules = rules.filter(r => r.category === input.category)
      if (input.connectionId) rules = rules.filter(r => r.connectionId === input.connectionId)
      if (input.enabled !== undefined) rules = rules.filter(r => r.enabled === input.enabled)
      const connections = store.connections.getAll()
      const enriched = rules.map(r => ({
        ...r,
        connectionName: connections.find(c => c.id === r.connectionId)?.name || 'Unknown'
      }))
      return { rules: enriched, total: enriched.length }
    }
    case 'create_rule': {
      const rule: Rule = {
        id: generateId('rule'),
        name: input.name as string,
        description: (input.description as string) || '',
        category: input.category as Rule['category'],
        type: input.type as Rule['type'],
        connectionId: input.connectionId as string,
        tableName: input.tableName as string,
        columnName: input.columnName as string | undefined,
        parameters: (input.parameters as Record<string, unknown>) || {},
        enabled: true,
        status: 'active' as const,
        severity: input.severity as Rule['severity'],
        scope: (input.scope as Rule['scope']) || 'generic',
        createdAt: new Date().toISOString()
      }
      store.rules.create(rule)
      return { success: true, rule, message: `Rule "${rule.name}" created successfully!` }
    }
    case 'edit_rule': {
      const ruleId = input.ruleId as string
      const existing = store.rules.getAll().find(r => r.id === ruleId)
      if (!existing) return { error: `Rule "${ruleId}" not found` }
      const updates: Record<string, unknown> = {}
      if (input.name) updates.name = input.name
      if (input.description !== undefined) updates.description = input.description
      if (input.category) updates.category = input.category
      if (input.type) updates.type = input.type
      if (input.severity) updates.severity = input.severity
      if (input.status) { updates.status = input.status; updates.enabled = input.status === 'active' }
      if (input.tableName) updates.tableName = input.tableName
      if (input.columnName !== undefined) updates.columnName = input.columnName
      if (input.parameters) updates.parameters = { ...existing.parameters, ...(input.parameters as Record<string, unknown>) }
      const updated = store.rules.update(ruleId, updates)
      if (!updated) return { error: 'Failed to update rule' }
      return { success: true, rule: updated, message: `Rule "${updated.name}" updated successfully!` }
    }
    case 'toggle_rule': {
      const updated = store.rules.update(input.ruleId as string, { enabled: input.enabled as boolean })
      if (!updated) return { error: 'Rule not found' }
      return { success: true, rule: updated, message: `Rule "${updated.name}" ${updated.enabled ? 'enabled' : 'disabled'}` }
    }
    case 'run_quality_check': {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name || `Quality Check - ${new Date().toLocaleDateString()}` })
      })
      const report = await res.json()
      return {
        success: true,
        summary: {
          score: report.overallScore,
          passed: report.passed,
          failed: report.failed,
          warnings: report.warnings,
          total: report.totalChecks
        },
        message: `Quality check completed! Overall score: ${report.overallScore}%`
      }
    }
    case 'get_report': {
      const latest = store.reports.getLatest()
      if (!latest) return { message: 'No reports found. Run a quality check first.' }
      return {
        report: {
          name: latest.name,
          overallScore: latest.overallScore,
          passed: latest.passed,
          failed: latest.failed,
          warnings: latest.warnings,
          total: latest.totalChecks,
          executedAt: latest.executedAt,
          topIssues: latest.results
            .filter(r => r.status !== 'passed')
            .sort((a, b) => a.score - b.score)
            .slice(0, 3)
        }
      }
    }
    case 'get_dashboard_stats': {
      const connections = store.connections.getAll()
      const rules = store.rules.getAll()
      const latest = store.reports.getLatest()
      return {
        totalConnections: connections.length,
        activeConnections: connections.filter(c => c.status === 'active').length,
        totalRules: rules.length,
        enabledRules: rules.filter(r => r.enabled).length,
        overallScore: latest?.overallScore || 0,
        lastRunAt: latest?.executedAt || null,
        rulesByCategory: Object.entries(
          rules.reduce((acc, r) => {
            acc[r.category] = (acc[r.category] || 0) + 1
            return acc
          }, {} as Record<string, number>)
        ).map(([cat, count]) => ({ category: cat, count }))
      }
    }
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      response: "⚠️ **API Key not configured.** Please add your `ANTHROPIC_API_KEY` to the `.env.local` file to enable the AI Agent.\n\nI can still show you around the app! Try the sidebar to explore Connections, Rules, and Reports.",
      toolsUsed: []
    })
  }

  const systemPrompt = `You are DataGuard AI, an expert Data Quality & Analytics assistant. You help users manage data quality AND query their connected warehouses directly.

PLATFORM TOOLS (manage rules, connections, reports):
- list_connections, create_connection → manage data source connections
- list_rules, create_rule, toggle_rule → manage quality rules
- run_quality_check, get_report, get_dashboard_stats → run checks and view results

WAREHOUSE QUERY TOOLS (query live data from connected warehouses):
When users ask analytical questions about their data (e.g., "top 20 sales by region", "show me revenue by month"):
1. Use list_connections to find the connection ID
2. Use discover_warehouse_schema to browse databases → schemas → tables
3. Use get_table_columns to see column names, types, and sample data
4. Use query_warehouse to execute a SQL query and return results
5. Use explain_columns to describe what columns mean and how they are derived

IMPORTANT WORKFLOW for data questions:
- First discover what tables exist, then inspect columns, then write and execute SQL
- Present query results in a clear markdown table
- Explain what the data shows
- If a table is a VIEW, explain_columns will show the SQL that derives the columns

Be conversational, helpful, and proactive. Format responses with markdown for readability.`

  // Agentic loop
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  let finalResponse = ''
  const toolsUsed: string[] = []
  let currentMessages = [...anthropicMessages]

  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages: currentMessages
    })

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name)
          const result = await executeTool(block.name, block.input as Record<string, unknown>)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          })
        }
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]
    } else {
      const textBlock = response.content.find(b => b.type === 'text')
      if (textBlock && textBlock.type === 'text') {
        finalResponse = textBlock.text
      }
      break
    }
  }

  return NextResponse.json({ response: finalResponse, toolsUsed })
}
