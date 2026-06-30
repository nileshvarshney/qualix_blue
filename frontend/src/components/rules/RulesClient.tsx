'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Database, Layers, Table2 } from 'lucide-react'
import { Rule, RuleCategory, RuleType, RuleStatus, Connection, AssetTreeNode } from '@/lib/types'
import { categoryColors } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useRulesGrouping } from './useRulesGrouping'
import RuleFailedRecordsTab from './RuleFailedRecordsTab'
import { apiFetch } from '@/lib/apiFetch'

function getGroupIcon(icon: string) {
  const s = { flexShrink: 0 as const, color: 'var(--text-secondary)' }
  const sm = { flexShrink: 0 as const, color: 'var(--text-muted)' }
  if (icon === 'database') return <Database size={13} style={s} />
  if (icon === 'schema') return <Layers size={12} style={sm} />
  if (icon === 'table') return <Table2 size={12} style={sm} />
  return null
}

/* ── Categories ──────────────────────────────────────────────────── */

const CATEGORIES: { value: RuleCategory; label: string; icon: string }[] = [
  { value: 'completeness', label: 'Completeness', icon: '📦' },
  { value: 'accuracy', label: 'Accuracy', icon: '🎯' },
  { value: 'uniqueness', label: 'Uniqueness', icon: '🔑' },
  { value: 'validity', label: 'Validity', icon: '✅' },
  { value: 'timeliness', label: 'Timeliness', icon: '⏱' },
  { value: 'consistency', label: 'Consistency', icon: '🔗' },
]

/* ── Rule Types (expanded to match Data-Quality) ─────────────────── */

const RULE_TYPES: { value: RuleType; label: string; desc: string; category: RuleCategory }[] = [
  { value: 'null_check', label: 'Null Check', desc: 'Column must not have null values', category: 'completeness' },
  { value: 'uniqueness_check', label: 'Uniqueness Check', desc: 'Values must be unique across rows', category: 'uniqueness' },
  { value: 'duplicate_check', label: 'Duplicate Check', desc: 'Detect duplicate records', category: 'uniqueness' },
  { value: 'accepted_values_check', label: 'Accepted Values', desc: 'Values must be in allowed set', category: 'validity' },
  { value: 'range_check', label: 'Range Check', desc: 'Values within min/max range', category: 'validity' },
  { value: 'comparison_check', label: 'Value Comparison', desc: 'Column compared to a value (>, <, =, …)', category: 'validity' },
  { value: 'freshness_check', label: 'Freshness Check', desc: 'Data updated within time window', category: 'timeliness' },
  { value: 'volume_check', label: 'Volume Check', desc: 'Row count within expected bounds', category: 'completeness' },
  { value: 'schema_drift_check', label: 'Schema Drift', desc: 'Detect unexpected schema changes', category: 'consistency' },
  { value: 'referential_integrity_check', label: 'Referential Integrity', desc: 'FK references exist in target', category: 'consistency' },
  { value: 'regex_check', label: 'Regex Pattern', desc: 'Values match a regex pattern', category: 'validity' },
  { value: 'business_rule_check', label: 'Business Rule', desc: 'Custom business logic condition', category: 'accuracy' },
  { value: 'custom_sql_check', label: 'Custom SQL', desc: 'Custom SQL expression check', category: 'accuracy' },
  { value: 'semantic_consistency_check', label: 'Semantic Consistency', desc: 'Cross-column logical consistency', category: 'consistency' },
  { value: 'referential_sanity_check', label: 'Referential Sanity', desc: 'Validate referential data sanity', category: 'consistency' },
  { value: 'business_metric_check', label: 'Business Metric', desc: 'Aggregate metric within bounds', category: 'accuracy' },
  { value: 'distribution_consistency_check', label: 'Distribution Check', desc: 'Statistical distribution validation', category: 'consistency' },
  { value: 'llm_semantic_check', label: 'LLM Semantic', desc: 'AI-powered semantic validation', category: 'accuracy' },
]

/* ── Status config ────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<RuleStatus, { bg: string; color: string; label: string; border: string }> = {
  active:         { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)',    label: 'Active',         border: '#86efac' },
  draft:          { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Draft',        border: '#cbd5e1' },
  pending_review: { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',  label: 'Pending Review', border: '#fde68a' },
  disabled:       { bg: 'var(--status-warn-bg)',     color: 'var(--status-warn-text)',   label: 'Disabled',       border: '#fdba74' },
  archived:       { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)', label: 'Archived',       border: '#fca5a5' },
}

const SEVERITY_CONFIG = {
  critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)', label: '🔴 Critical' },
  high:     { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  label: '🟠 High' },
  medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  label: '🟡 Medium' },
  low:      { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    label: '🟢 Low' }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }
const scoreColor = (s: number) => s >= 90 ? 'var(--status-ok-text)' : s >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const fmtType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSql\b/g, 'SQL').replace(/\bLlm\b/g, 'LLM')

interface Props { initialRules: Rule[]; connections: Connection[] }

/* ── Main Component ──────────────────────────────────────────────── */

export default function RulesClient({ initialRules, connections }: Props) {
  const [rules, setRules] = useState(initialRules)

  // Sync when parent provides new data (async load)
  useEffect(() => {
    if (initialRules.length > 0 && rules.length === 0) {
      setRules(initialRules)
    }
  }, [initialRules]) // eslint-disable-line react-hooks/exhaustive-deps

  const [showModal, setShowModal] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiGenError, setAiGenError] = useState<string | null>(null)
  const [editDrawer, setEditDrawer] = useState<Rule | null>(null)
  const [drawerTab, setDrawerTab] = useState<'config' | 'failed-records'>('config')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { status: string; score: number }>>({})
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filters — initialized from URL params so browser back restores them
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [activeCategory, setActiveCategory] = useState<RuleCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<RuleStatus | 'all'>(() => (searchParams.get('status') as RuleStatus | 'all') ?? 'all')
  const [severityFilter, setSeverityFilter] = useState<string>(() => searchParams.get('severity') ?? 'all')
  const [tableFilter, setTableFilter] = useState(() => searchParams.get('table') ?? '')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'generic' | 'object-specific'>('all')

  // Write-time schema validation state
  const [schemaValidPanel, setSchemaValidPanel] = useState(false)
  const [schemaValidConfig, setSchemaValidConfig] = useState({
    enabled: false, connectionId: '', action: 'reject' as 'reject' | 'quarantine' | 'warn', notifySlack: false, notifyEmail: false, emailRecipients: '',
  })
  const [schemaValidSaving, setSchemaValidSaving] = useState(false)
  const [schemaValidSaved, setSchemaValidSaved] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [groupMode, setGroupMode] = useState<'rule-type' | 'db-table'>('rule-type')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Create form
  const [form, setForm] = useState({
    name: '', description: '', category: 'completeness' as RuleCategory,
    type: 'null_check' as RuleType, connectionId: connections[0]?.id || '',
    tableName: '', columnName: '', severity: 'high' as Rule['severity'],
    status: 'active' as RuleStatus,
    scope: 'generic' as 'generic' | 'object-specific',
    paramMin: '', paramMax: '', paramPattern: '', paramAge: '', paramRows: '',
    paramAcceptedValues: '', paramCondition: '', paramExpectedColumns: '',
    paramMetricSql: '', paramSampleSize: '100', paramValidationPrompt: '',
    paramBaselineMean: '', paramBaselineStd: '', paramTolerancePct: '20',
    paramRefTable: '', paramRefColumn: '', paramDateColumn: '',
    paramOperator: '>', paramValue: '',
    customSql: '',
  })

  // Sync connectionId when connections load asynchronously
  useEffect(() => {
    if (connections.length > 0 && !form.connectionId) {
      setForm(f => ({ ...f, connectionId: connections[0].id }))
    }
  }, [connections])

  // Sync filter state to URL so browser back restores it
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (severityFilter !== 'all') params.set('severity', severityFilter)
    if (tableFilter) params.set('table', tableFilter)
    const qs = params.toString()
    router.replace(qs ? `/rules?${qs}` : '/rules', { scroll: false })
  }, [search, statusFilter, severityFilter, tableFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Asset registry lookup: assetId -> "database.schema.table" qualified name
  const [assetQualifiedNames, setAssetQualifiedNames] = useState<Record<string, string>>({})
  useEffect(() => {
    async function loadAssetNames() {
      try {
        const res = await apiFetch('/api/asset-registry/tree', { cache: 'no-store' })
        if (!res.ok) return
        const tree: AssetTreeNode[] = await res.json()
        const map: Record<string, string> = {}
        const walk = (nodes: AssetTreeNode[]) => {
          for (const n of nodes) {
            if (n.asset_type === 'table' && n.qualified_name) map[n.asset_id] = n.qualified_name
            if (n.children?.length) walk(n.children)
          }
        }
        walk(Array.isArray(tree) ? tree : [])
        setAssetQualifiedNames(map)
      } catch { /* ignore */ }
    }
    loadAssetNames()
  }, [])

  // Edit form
  const [editForm, setEditForm] = useState<typeof form | null>(null)

  // Table & Column dropdown data
  const [availableTables, setAvailableTables] = useState<string[]>([])
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [columnsLoading, setColumnsLoading] = useState(false)

  // Known schema fallback (for Cloudflare / when Snowflake SDK is unavailable)
  const KNOWN_COLUMNS: Record<string, string[]> = {
    CARRIERS: ['CARRIER_ID','CARRIER_NAME','CONTACT_NAME','PHONE','EMAIL','TRACKING_URL','CREATED_AT','UPDATED_AT'],
    CUSTOMERS: ['CUSTOMER_ID','FIRST_NAME','LAST_NAME','EMAIL','PHONE','ADDRESS','CITY','STATE','ZIP_CODE','COUNTRY','CUSTOMER_SEGMENT','CREDIT_LIMIT','CREATED_AT','UPDATED_AT'],
    FINANCE_TRANSACTIONS: ['TRANSACTION_ID','ORDER_ID','TRANSACTION_TYPE','AMOUNT','CURRENCY','PAYMENT_METHOD','TRANSACTION_DATE','STATUS','REFERENCE_NUMBER','NOTES','CREATED_AT','UPDATED_AT'],
    INVENTORY: ['INVENTORY_ID','PRODUCT_ID','WAREHOUSE_ID','QUANTITY_ON_HAND','REORDER_LEVEL','LAST_RESTOCK_DATE','CREATED_AT','UPDATED_AT'],
    PRODUCTS: ['PRODUCT_ID','PRODUCT_NAME','SKU','CATEGORY_ID','UNIT_PRICE','UNIT_COST','WEIGHT','DESCRIPTION','CREATED_AT','UPDATED_AT'],
    PRODUCT_CATEGORIES: ['CATEGORY_ID','CATEGORY_NAME','DESCRIPTION','PARENT_CATEGORY_ID','CREATED_AT'],
    PURCHASE_ORDERS: ['PO_ID','SUPPLIER_ID','ORDER_DATE','EXPECTED_DELIVERY','STATUS','TOTAL_AMOUNT','NOTES','CREATED_AT','UPDATED_AT'],
    PURCHASE_ORDER_ITEMS: ['PO_ITEM_ID','PO_ID','PRODUCT_ID','QUANTITY','UNIT_PRICE','TOTAL_PRICE'],
    RETURNS: ['RETURN_ID','ORDER_ID','CUSTOMER_ID','RETURN_DATE','REASON','STATUS','REFUND_AMOUNT','CREATED_AT'],
    SALES_ORDERS: ['ORDER_ID','ORDER_NUMBER','CUSTOMER_ID','ORDER_DATE','SHIPPED_DATE','DELIVERED_DATE','STATUS','SHIPPING_METHOD','WAREHOUSE_ID','TOTAL_AMOUNT','DISCOUNT_AMOUNT','TAX_AMOUNT','NET_AMOUNT','CREATED_AT','UPDATED_AT'],
    SUPPLIERS: ['SUPPLIER_ID','SUPPLIER_NAME','CONTACT_NAME','EMAIL','PHONE','ADDRESS','CITY','COUNTRY','RATING','CREATED_AT','UPDATED_AT'],
    WAREHOUSES: ['WAREHOUSE_ID','WAREHOUSE_NAME','LOCATION','CITY','STATE','COUNTRY','CAPACITY','MANAGER','CREATED_AT','UPDATED_AT'],
  }

  const fetchTables = useCallback(async () => {
    setTablesLoading(true)
    try {
      const res = await apiFetch('/api/snowflake/tables', { cache: 'no-store' })
      const data = await res.json()
      const tables = (data.tables || []).map((t: { name?: string; TABLE_NAME?: string }) => t.name || t.TABLE_NAME || '').filter(Boolean)
      setAvailableTables(tables.sort())
    } catch { setAvailableTables([]) }
    setTablesLoading(false)
  }, [])

  const fetchColumns = useCallback(async (table: string) => {
    if (!table || table === 'ALL_TABLES') { setAvailableColumns([]); return }
    setColumnsLoading(true)
    try {
      const res = await apiFetch(`/api/snowflake/columns?table=${encodeURIComponent(table)}`, { cache: 'no-store' })
      const data = await res.json()
      const cols = (data.columns || []).map((c: { name?: string; COLUMN_NAME?: string }) => c.name || c.COLUMN_NAME || '').filter(Boolean)
      setAvailableColumns(cols.sort())
    } catch { setAvailableColumns([]) }
    setColumnsLoading(false)
  }, [])

  // Fetch tables when modal opens
  useEffect(() => {
    if (showModal) fetchTables()
  }, [showModal, fetchTables])

  // Fetch columns when selected table changes (create form)
  useEffect(() => {
    if (showModal && form.tableName) fetchColumns(form.tableName)
    else setAvailableColumns([])
  }, [showModal, form.tableName, fetchColumns])

  // Fetch tables & columns when edit drawer opens
  useEffect(() => {
    if (editDrawer) {
      fetchTables()
      if (editDrawer.tableName) fetchColumns(editDrawer.tableName)
      setDrawerTab('config')
    }
  }, [editDrawer, fetchTables, fetchColumns])

  /* ── Derived data ─────────────────────────────────────────────── */

  const uniqueTables = useMemo(() => {
    const t = new Set(rules.map(r => r.tableName))
    return Array.from(t).sort()
  }, [rules])

  const filtered = useMemo(() => {
    let result = rules
    if (activeCategory !== 'all') result = result.filter(r => r.category === activeCategory)
    if (statusFilter !== 'all') result = result.filter(r => (r.status || (r.enabled ? 'active' : 'disabled')) === statusFilter)
    if (severityFilter !== 'all') result = result.filter(r => r.severity === severityFilter)
    if (tableFilter) result = result.filter(r => r.tableName === tableFilter)
    if (scopeFilter !== 'all') result = result.filter(r => (r.scope || 'generic') === scopeFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.tableName.toLowerCase().includes(q))
    }
    return result
  }, [rules, activeCategory, statusFilter, severityFilter, tableFilter, search, scopeFilter])

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = rules.filter(r => r.category === cat.value).length; return acc
  }, {} as Record<string, number>)

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, draft: 0, pending_review: 0, disabled: 0, archived: 0 }
    rules.forEach(r => { const s = r.status || (r.enabled ? 'active' : 'disabled'); counts[s] = (counts[s] || 0) + 1 })
    return counts
  }, [rules])

  const rows = useRulesGrouping(filtered, connections, groupMode, expandedGroups, testResults, assetQualifiedNames)

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))

  /* ── Actions ──────────────────────────────────────────────────── */

  async function updateRuleStatus(id: string, newStatus: RuleStatus) {
    await apiFetch(`/api/rules/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setRules(prev => prev.map(r => r.id === id
      ? { ...r, status: newStatus, enabled: newStatus === 'active' }
      : r
    ))
  }

  // Data stewards approval workflow
  async function approveRule(id: string) {
    const res = await apiFetch(`/api/rules/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === id ? { ...r, status: 'active', enabled: true } : r))
    }
  }

  async function rejectRule(id: string) {
    const reason = prompt('Reason for rejecting this rule?')
    if (reason === null) return
    const res = await apiFetch(`/api/rules/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: reason }),
    })
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === id ? { ...r, status: 'draft' } : r))
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return
    await apiFetch(`/api/rules?id=${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    router.refresh()
  }

  async function testRule(id: string) {
    setTesting(id)
    try {
      const res = await apiFetch(`/api/rules/${id}/run`, { method: 'POST' })
      if (res.ok) {
        const run = await res.json() as Record<string, unknown>
        const passed = run.status === 'passed'
        const score = typeof run.quality_score === 'number' ? Math.round(run.quality_score) : (passed ? 100 : 0)
        setTestResults(prev => ({ ...prev, [id]: { status: passed ? 'passed' : 'failed', score } }))
        setRules(prev => prev.map(r => r.id === id
          ? { ...r, lastRunAt: new Date().toISOString(), lastRunStatus: passed ? 'passed' : 'failed', lastRunScore: score }
          : r
        ))
      }
    } catch {
      // silently ignore — rule remains unchanged in UI
    }
    setTesting(null)
  }

  async function bulkAction(action: 'activate' | 'disable' | 'archive' | 'run' | 'delete') {
    if (selectedIds.size === 0) return
    if (action === 'delete' && !confirm(`Delete ${selectedIds.size} rules?`)) return
    setBulkLoading(true)
    const ids = Array.from(selectedIds)

    if (action === 'run') {
      for (const id of ids) await testRule(id)
    } else if (action === 'delete') {
      for (const id of ids) {
        await apiFetch(`/api/rules?id=${id}`, { method: 'DELETE' })
      }
      setRules(prev => prev.filter(r => !selectedIds.has(r.id)))
    } else {
      const statusMap = { activate: 'active', disable: 'disabled', archive: 'archived' } as const
      const newStatus = statusMap[action]
      for (const id of ids) await updateRuleStatus(id, newStatus)
    }

    setSelectedIds(new Set())
    setBulkLoading(false)
    router.refresh()
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(r => r.id)))
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  const isGeneric = form.scope === 'generic'
  const canSave = form.name && form.connectionId && (isGeneric || form.tableName)

  async function generateRuleFromPrompt() {
    if (!aiPrompt.trim()) return
    setAiGenerating(true)
    setAiGenError(null)
    try {
      const res = await apiFetch('/api/ai/generate-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiPrompt, connection_id: form.connectionId }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) throw new Error((data.detail as string) || (data.error as string) || 'Generation failed')

      setForm(f => ({
        ...f,
        name:        typeof data.name        === 'string' ? data.name        : f.name,
        description: typeof data.description === 'string' ? data.description : f.description,
        category:    typeof data.category    === 'string' ? data.category    as typeof f.category : f.category,
        type:        typeof data.rule_type   === 'string' ? data.rule_type   as typeof f.type    : (typeof data.type === 'string' ? data.type as typeof f.type : f.type),
        severity:    typeof data.severity    === 'string' ? data.severity    as typeof f.severity : f.severity,
        tableName:   typeof data.table_name  === 'string' ? data.table_name  : f.tableName,
        columnName:  typeof data.column_name === 'string' ? data.column_name : f.columnName,
        paramCondition: typeof data.condition === 'string' ? data.condition : f.paramCondition,
        customSql:   typeof data.sql         === 'string' ? data.sql         : f.customSql,
        scope:       typeof data.table_name === 'string' && data.table_name ? 'object-specific' : f.scope,
      }))
      setAiMode(false)
    } catch (e) {
      setAiGenError(e instanceof Error ? e.message : 'AI generation failed')
    } finally {
      setAiGenerating(false)
    }
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    const params: Record<string, unknown> = {}
    if (['range', 'range_check'].includes(form.type)) { if (form.paramMin) params.min = parseFloat(form.paramMin); if (form.paramMax) params.max = parseFloat(form.paramMax) }
    if (form.type === 'comparison_check') { params.operator = form.paramOperator; if (form.paramOperator === 'between') { if (form.paramMin) params.min = parseFloat(form.paramMin); if (form.paramMax) params.max = parseFloat(form.paramMax) } else { params.value = form.paramValue } }
    if (['regex', 'regex_check'].includes(form.type)) params.pattern = form.paramPattern
    if (['freshness', 'freshness_check'].includes(form.type)) params.maxAgeHours = parseInt(form.paramAge || '24')
    if (['row_count', 'volume_check'].includes(form.type)) { params.minRows = parseInt(form.paramRows || '0'); if (form.paramDateColumn) params.dateColumn = form.paramDateColumn }
    if (form.type === 'accepted_values_check') params.accepted_values = form.paramAcceptedValues.split(',').map(s => s.trim()).filter(Boolean)
    if (['business_rule_check', 'semantic_consistency_check', 'referential_sanity_check'].includes(form.type)) params.condition = form.paramCondition
    if (form.type === 'schema_drift_check') params.expected_columns = form.paramExpectedColumns.split(',').map(s => s.trim()).filter(Boolean)
    if (['referential', 'referential_integrity_check'].includes(form.type)) { params.reference_table = form.paramRefTable; params.reference_column = form.paramRefColumn }
    if (form.type === 'business_metric_check') { params.metric_sql = form.paramMetricSql; if (form.paramMin) params.min_value = parseFloat(form.paramMin); if (form.paramMax) params.max_value = parseFloat(form.paramMax) }
    if (form.type === 'distribution_consistency_check') { if (form.paramBaselineMean) params.baseline_mean = parseFloat(form.paramBaselineMean); if (form.paramBaselineStd) params.baseline_std = parseFloat(form.paramBaselineStd); params.tolerance_pct = parseInt(form.paramTolerancePct || '20') }
    if (form.type === 'llm_semantic_check') { params.sample_size = parseInt(form.paramSampleSize || '100'); params.validation_prompt = form.paramValidationPrompt }
    if (['custom_sql', 'custom_sql_check'].includes(form.type)) params.sql = form.customSql

    // For generic rules with no table, set to ALL_TABLES
    const tableName = form.tableName || (isGeneric ? 'ALL_TABLES' : '')

    try {
      const res = await apiFetch('/api/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, category: form.category, type: form.type, connectionId: form.connectionId, tableName, columnName: form.columnName || undefined, severity: form.severity, status: form.status, scope: form.scope, parameters: params })
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(String(data?.detail || data?.error || data?.message || `Error ${res.status}: failed to save rule`))
        setSaving(false)
        return
      }
      // New rules are always returned as pending_review (awaiting data stewards approval)
      setRules(prev => [...prev, data])
      setShowModal(false)
      setSaveError(null)
      setForm(f => ({ ...f, name: '', description: '', tableName: '', columnName: '', paramMin: '', paramMax: '', paramPattern: '', paramAge: '', paramRows: '', paramAcceptedValues: '', paramCondition: '', paramExpectedColumns: '', paramRefTable: '', paramRefColumn: '', paramValue: '', customSql: '', paramMetricSql: '', paramValidationPrompt: '' }))
      router.refresh()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error — could not save rule')
    }
    setSaving(false)
  }

  async function saveEdit() {
    if (!editDrawer || !editForm) return
    setSaving(true)
    const params: Record<string, unknown> = { ...editDrawer.parameters }
    if (['range', 'range_check'].includes(editForm.type)) { if (editForm.paramMin) params.min = parseFloat(editForm.paramMin); if (editForm.paramMax) params.max = parseFloat(editForm.paramMax) }
    if (editForm.type === 'comparison_check') { params.operator = editForm.paramOperator; if (editForm.paramOperator === 'between') { if (editForm.paramMin) params.min = parseFloat(editForm.paramMin); if (editForm.paramMax) params.max = parseFloat(editForm.paramMax); delete params.value } else { params.value = editForm.paramValue; delete params.min; delete params.max } }
    if (['regex', 'regex_check'].includes(editForm.type)) params.pattern = editForm.paramPattern
    if (['freshness', 'freshness_check'].includes(editForm.type)) params.maxAgeHours = parseInt(editForm.paramAge || '24')
    if (['row_count', 'volume_check'].includes(editForm.type)) { params.minRows = parseInt(editForm.paramRows || '0'); if (editForm.paramDateColumn) params.dateColumn = editForm.paramDateColumn }
    if (editForm.type === 'accepted_values_check') params.accepted_values = editForm.paramAcceptedValues.split(',').map(s => s.trim()).filter(Boolean)
    if (['business_rule_check', 'semantic_consistency_check', 'referential_sanity_check'].includes(editForm.type)) params.condition = editForm.paramCondition
    if (editForm.type === 'schema_drift_check') params.expected_columns = editForm.paramExpectedColumns.split(',').map(s => s.trim()).filter(Boolean)
    if (['referential', 'referential_integrity_check'].includes(editForm.type)) { params.reference_table = editForm.paramRefTable; params.reference_column = editForm.paramRefColumn }
    if (editForm.type === 'business_metric_check') { params.metric_sql = editForm.paramMetricSql; if (editForm.paramMin) params.min_value = parseFloat(editForm.paramMin); if (editForm.paramMax) params.max_value = parseFloat(editForm.paramMax) }
    if (editForm.type === 'distribution_consistency_check') { if (editForm.paramBaselineMean) params.baseline_mean = parseFloat(editForm.paramBaselineMean); if (editForm.paramBaselineStd) params.baseline_std = parseFloat(editForm.paramBaselineStd); params.tolerance_pct = parseInt(editForm.paramTolerancePct || '20') }
    if (editForm.type === 'llm_semantic_check') { params.sample_size = parseInt(editForm.paramSampleSize || '100'); params.validation_prompt = editForm.paramValidationPrompt }
    if (['custom_sql', 'custom_sql_check'].includes(editForm.type)) params.sql = editForm.customSql

    await apiFetch('/api/rules', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editDrawer.id, name: editForm.name, description: editForm.description,
        category: editForm.category, type: editForm.type, severity: editForm.severity,
        status: editForm.status, enabled: editForm.status === 'active',
        connectionId: editForm.connectionId, tableName: editForm.tableName,
        columnName: editForm.columnName || undefined,
        parameters: params,
      })
    })
    setRules(prev => prev.map(r => r.id === editDrawer.id ? {
      ...r, name: editForm.name, description: editForm.description,
      category: editForm.category, type: editForm.type, severity: editForm.severity,
      status: editForm.status, enabled: editForm.status === 'active',
      connectionId: editForm.connectionId, tableName: editForm.tableName,
      columnName: editForm.columnName || undefined,
      parameters: params,
    } : r))
    setEditDrawer(null)
    setEditForm(null)
    setSaving(false)
    router.refresh()
  }

  function openEdit(rule: Rule) {
    setEditDrawer(rule)
    setEditForm({
      name: rule.name, description: rule.description || '', category: rule.category,
      type: rule.type, connectionId: rule.connectionId, tableName: rule.tableName,
      columnName: rule.columnName || '', severity: rule.severity,
      scope: rule.scope || 'generic',
      status: rule.status || (rule.enabled ? 'active' : 'disabled'),
      paramMin: String(rule.parameters?.min ?? rule.parameters?.min_value ?? ''),
      paramMax: String(rule.parameters?.max ?? rule.parameters?.max_value ?? ''),
      paramPattern: String(rule.parameters?.pattern ?? ''),
      paramAge: String(rule.parameters?.maxAgeHours ?? ''),
      paramRows: String(rule.parameters?.minRows ?? ''),
      paramAcceptedValues: Array.isArray(rule.parameters?.accepted_values) ? (rule.parameters.accepted_values as string[]).join(', ') : '',
      paramCondition: String(rule.parameters?.condition ?? ''),
      paramExpectedColumns: Array.isArray(rule.parameters?.expected_columns) ? (rule.parameters.expected_columns as string[]).join(', ') : '',
      paramMetricSql: String(rule.parameters?.metric_sql ?? ''),
      paramSampleSize: String(rule.parameters?.sample_size ?? '100'),
      paramValidationPrompt: String(rule.parameters?.validation_prompt ?? ''),
      paramBaselineMean: String(rule.parameters?.baseline_mean ?? ''),
      paramBaselineStd: String(rule.parameters?.baseline_std ?? ''),
      paramTolerancePct: String(rule.parameters?.tolerance_pct ?? '20'),
      paramRefTable: String(rule.parameters?.reference_table ?? ''),
      paramRefColumn: String(rule.parameters?.reference_column ?? ''),
      paramDateColumn: String(rule.parameters?.dateColumn ?? ''),
      paramOperator: String(rule.parameters?.operator ?? '>'),
      paramValue: String(rule.parameters?.value ?? ''),
      customSql: String(rule.parameters?.sql ?? ''),
    })
  }

  /* ── Styles ───────────────────────────────────────────────────── */

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    fontSize: '13px', color: 'var(--foreground)', background: 'var(--surface-muted)', outline: 'none', ...style
  })

  const activeFilterCount = [activeCategory !== 'all', statusFilter !== 'all', severityFilter !== 'all', tableFilter !== '', scopeFilter !== 'all'].filter(Boolean).length

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Quality Rules</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {rules.filter(r => r.status === 'active' || r.enabled).length} active · {rules.length} total
          </div>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          background: 'var(--accent)', color: 'var(--accent-text)', border: 'none',
          padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer'
        }}>+ Add Rule</button>
      </div>

      {/* KPI stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', flexShrink: 0 }}>
        {[
          { label: 'Total',          value: rules.length,                    color: 'var(--foreground)'            },
          { label: 'Active',         value: statusCounts.active || 0,        color: 'var(--status-ok-text)'        },
          { label: 'Pending Review', value: statusCounts.pending_review || 0, color: 'var(--status-warn-text)'     },
          { label: 'Disabled',       value: statusCounts.disabled || 0,      color: '#ea580c'                      },
          { label: 'Archived',       value: statusCounts.archived || 0,      color: 'var(--status-error-text)'     },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '320px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '14px' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules..." style={{ ...inp(), paddingLeft: '32px' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as RuleStatus | 'all')} style={{ ...inp(), width: 'auto', minWidth: '140px' }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label} ({statusCounts[k] || 0})</option>)}
        </select>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ ...inp(), width: 'auto', minWidth: '130px' }}>
          <option value="all">All Severities</option>
          {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} style={{ ...inp(), width: 'auto', minWidth: '140px' }}>
          <option value="">All Tables</option>
          {uniqueTables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value as typeof scopeFilter)} style={{ ...inp(), width: 'auto', minWidth: '150px' }}>
          <option value="all">All Scopes</option>
          <option value="generic">🔧 DQ Rule</option>
          <option value="object-specific">🎯 Business Rule</option>
        </select>
        {activeFilterCount > 0 && (
          <button onClick={() => { setActiveCategory('all'); setStatusFilter('all'); setSeverityFilter('all'); setTableFilter(''); setScopeFilter('all'); setSearch('') }}
            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            ✕ Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Category Filter Chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => setActiveCategory('all')} style={{
          padding: '4px 10px', borderRadius: '20px', border: '1px solid', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
          background: activeCategory === 'all' ? 'var(--foreground)' : 'var(--surface)', color: activeCategory === 'all' ? 'var(--surface)' : 'var(--text-secondary)', borderColor: activeCategory === 'all' ? 'var(--foreground)' : 'var(--border)'
        }}>All ({rules.length})</button>
        {CATEGORIES.map(cat => (
          <button key={cat.value} onClick={() => setActiveCategory(cat.value)} style={{
            padding: '4px 10px', borderRadius: '20px', border: '1px solid', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
            background: activeCategory === cat.value ? categoryColors[cat.value] : 'var(--surface)',
            color: activeCategory === cat.value ? '#fff' : 'var(--text-secondary)',
            borderColor: activeCategory === cat.value ? categoryColors[cat.value] : 'var(--border)'
          }}>{cat.icon} {cat.label} ({categoryCounts[cat.value] || 0})</button>
        ))}
      </div>

      {/* Write-Time Schema Validation Config */}
      <div style={{ flexShrink: 0 }}>
        <button
          onClick={() => setSchemaValidPanel(o => !o)}
          style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '6px', border: `1px solid ${schemaValidPanel ? 'var(--accent)' : 'var(--border)'}`, background: schemaValidPanel ? 'var(--accent-bg)' : 'var(--surface)', color: schemaValidPanel ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: schemaValidPanel ? 700 : 400 }}>
          🛡️ Write-Time Schema Validation {schemaValidConfig.enabled ? <span style={{ color: 'var(--status-ok-text)' }}>(Active)</span> : '(Config)'}
        </button>
        {schemaValidPanel && (
          <div style={{ marginTop: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '4px' }}>Write-Time Schema Validation</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.55' }}>
              Intercept incoming data loads and reject those that violate registered schema definitions — before data reaches the target table. Requires pipeline integration.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 500, flex: 1 }}>Enable write-time interception</span>
              <button
                onClick={() => setSchemaValidConfig(c => ({ ...c, enabled: !c.enabled }))}
                style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', background: schemaValidConfig.enabled ? 'var(--status-ok-bg)' : 'var(--border)', color: schemaValidConfig.enabled ? 'var(--status-ok-text)' : 'var(--text-muted)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                {schemaValidConfig.enabled ? 'On' : 'Off'}
              </button>
            </div>
            {schemaValidConfig.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Action on violation</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['reject', 'quarantine', 'warn'] as const).map(action => (
                      <button key={action} onClick={() => setSchemaValidConfig(c => ({ ...c, action }))}
                        style={{ padding: '4px 10px', borderRadius: '5px', border: `1px solid ${schemaValidConfig.action === action ? 'var(--accent)' : 'var(--border)'}`, background: schemaValidConfig.action === action ? 'var(--accent-bg)' : 'transparent', color: schemaValidConfig.action === action ? 'var(--accent)' : 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontWeight: schemaValidConfig.action === action ? 700 : 400, textTransform: 'capitalize' }}>
                        {action === 'reject' ? '🚫 Reject' : action === 'quarantine' ? '🔒 Quarantine' : '⚠️ Warn only'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" checked={schemaValidConfig.notifySlack} onChange={e => setSchemaValidConfig(c => ({ ...c, notifySlack: e.target.checked }))} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Notify Slack on violation</span>
                  <input type="checkbox" checked={schemaValidConfig.notifyEmail} onChange={e => setSchemaValidConfig(c => ({ ...c, notifyEmail: e.target.checked }))} style={{ marginLeft: '12px' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Notify email</span>
                </div>
                {schemaValidConfig.notifyEmail && (
                  <input value={schemaValidConfig.emailRecipients} onChange={e => setSchemaValidConfig(c => ({ ...c, emailRecipients: e.target.value }))} placeholder="data-team@company.com, dq@company.com" style={{ ...inp(), fontSize: '12px' }} />
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                disabled={schemaValidSaving}
                onClick={async () => {
                  setSchemaValidSaving(true)
                  await apiFetch('/api/rules/schema-validation-config', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(schemaValidConfig),
                  }).catch(() => {})
                  setSchemaValidSaving(false)
                  setSchemaValidSaved(true)
                  setTimeout(() => setSchemaValidSaved(false), 2000)
                }}
                style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
                {schemaValidSaving ? 'Saving…' : schemaValidSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', background: 'var(--accent-bg)', borderRadius: '8px', border: '1px solid #bae6fd', flexShrink: 0 }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--status-info-text)' }}>{selectedIds.size} selected</span>
          <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
            {[
              { action: 'activate' as const, label: '✓ Activate', bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    border: '#86efac' },
              { action: 'disable' as const, label: '⏸ Disable', bg: 'var(--status-warn-bg)',   color: 'var(--status-warn-text)',   border: '#fdba74' },
              { action: 'archive' as const, label: '📦 Archive', bg: 'var(--status-error-bg)',  color: 'var(--status-error-text)',  border: '#fca5a5' },
              { action: 'run' as const, label: '▶ Run All', bg: 'var(--accent-bg)', color: 'var(--accent)', border: '#93c5fd' },
              { action: 'delete' as const, label: '🗑 Delete', bg: 'var(--status-error-bg)',    color: 'var(--status-error-text)',   border: '#fca5a5' },
            ].map(btn => (
              <button key={btn.action} onClick={() => bulkAction(btn.action)} disabled={bulkLoading}
                style={{ padding: '3px 9px', borderRadius: '6px', border: `1px solid ${btn.border}`, background: btn.bg, color: btn.color, fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: bulkLoading ? 0.5 : 1 }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules Table — Grouped by Type */}
      <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* View toggle + stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px 5px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '1px', background: 'var(--surface-muted)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
            {(['rule-type', 'db-table'] as const).map(mode => (
              <button key={mode} onClick={() => { setGroupMode(mode); setExpandedGroups(new Set()) }}
                style={{
                  padding: '3px 10px', borderRadius: '4px', border: 'none', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer',
                  background: groupMode === mode ? 'var(--surface)' : 'transparent',
                  color: groupMode === mode ? 'var(--foreground)' : 'var(--text-muted)',
                  boxShadow: groupMode === mode ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>
                {mode === 'rule-type' ? '⊞ Rule Type' : '🗂 DB / Table'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {filtered.length} rules · {rows.filter(r => r.kind === 'group' && r.level === 0).length} groups
          </span>
        </div>

        {/* Column header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)', flexShrink: 0 }}>
          <div style={{ width: '24px' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: '12px', height: '12px', cursor: 'pointer', accentColor: '#E8541A' }} />
          </div>
          {groupMode === 'rule-type' ? (
            <div style={{ flex: 1, fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Target</div>
          ) : (
            <>
              <div style={{ flex: 1, fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Name</div>
              <div style={{ width: '130px', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Rule Type</div>
            </>
          )}
          <div style={{ width: '86px', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Category</div>
          <div style={{ width: '64px', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Severity</div>
          <div style={{ width: '120px', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Status</div>
          <div style={{ width: '60px', fontSize: '9.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Last Run</div>
          <div style={{ width: '96px' }} />
        </div>

        {/* Flat rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(item => {
            if (item.kind === 'group') {
              const g = item
              const isExpanded = expandedGroups.has(g.key)
              const allGroupSel = g.rules.every(r => selectedIds.has(r.id))
              const someGroupSel = g.rules.some(r => selectedIds.has(r.id))
              const indent = g.level * 18

              function toggleGroup() {
                setExpandedGroups(prev => { const s = new Set(prev); if (s.has(g.key)) s.delete(g.key); else s.add(g.key); return s })
              }
              function toggleGroupSelect(e: React.MouseEvent) {
                e.stopPropagation()
                setSelectedIds(prev => { const s = new Set(prev); if (allGroupSel) g.rules.forEach(r => s.delete(r.id)); else g.rules.forEach(r => s.add(r.id)); return s })
              }

              const ruleTypeDef = groupMode === 'rule-type' ? RULE_TYPES.find(t => t.value === g.key) : null
              const cat = g.category ? CATEGORIES.find(c => c.value === g.category) : null
              const isLeaf = (groupMode === 'rule-type' && g.level === 0) || (groupMode === 'db-table' && g.level === 2)

              return (
                <div key={g.key} onClick={toggleGroup} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  height: '32px', paddingRight: '10px',
                  paddingLeft: `${10 + indent}px`,
                  borderBottom: '1px solid var(--border)',
                  background: g.level === 0 ? 'var(--surface-muted)' : g.level === 1 ? 'var(--surface)' : 'var(--background)',
                  cursor: 'pointer',
                  userSelect: 'none' as const,
                }}>
                  <div style={{ width: '24px', flexShrink: 0 }} onClick={toggleGroupSelect}>
                    {isLeaf ? (
                      <input type="checkbox" checked={allGroupSel}
                        ref={el => { if (el) el.indeterminate = someGroupSel && !allGroupSel }}
                        onChange={() => {}}
                        style={{ width: '12px', height: '12px', cursor: 'pointer', accentColor: '#E8541A' }} />
                    ) : <span />}
                  </div>

                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s', flexShrink: 0, width: '10px' }}>▶</span>
                  {getGroupIcon(g.icon)}
                  <span style={{
                    fontFamily: groupMode === 'db-table' ? 'monospace' : 'inherit',
                    fontWeight: g.level === 0 ? 700 : 600,
                    fontSize: g.level === 0 ? '12px' : g.level === 1 ? '11.5px' : '11px',
                    color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0,
                  }}>
                    {ruleTypeDef?.label || g.label}
                  </span>

                  <span style={{ padding: '1px 6px', borderRadius: '8px', background: 'var(--surface-muted)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, border: '1px solid var(--border)', flexShrink: 0 }}>
                    {g.stats.count}
                  </span>

                  {g.stats.passedCount > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--status-ok-text)', fontWeight: 600, flexShrink: 0 }}>✓{g.stats.passedCount}</span>
                  )}
                  {g.stats.failedCount > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--status-error-text)', fontWeight: 600, flexShrink: 0 }}>✗{g.stats.failedCount}</span>
                  )}

                  {groupMode === 'rule-type' && cat && (
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600, background: categoryColors[g.category!] + '18', color: categoryColors[g.category!], flexShrink: 0 }}>
                      {cat.label}
                    </span>
                  )}

                  <span style={{ fontSize: '10px', color: 'var(--status-ok-text)', fontWeight: 600, flexShrink: 0 }}>
                    {g.stats.activeCount}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/{g.stats.count}</span>
                  </span>

                  {isLeaf && (
                    <button onClick={e => { e.stopPropagation(); g.rules.filter(r => r.status === 'active').forEach(r => testRule(r.id)) }}
                      style={{ padding: '2px 7px', borderRadius: '5px', border: '1px solid var(--accent-bg)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '10px', cursor: 'pointer', flexShrink: 0 }}>
                      ▶
                    </button>
                  )}
                </div>
              )
            }

            // Rule row
            const { rule, depth } = item
            const sev = SEVERITY_CONFIG[rule.severity]
            const stat = STATUS_CONFIG[rule.status || (rule.enabled ? 'active' : 'disabled')]
            const isRunning = testing === rule.id
            const result = testResults[rule.id]
            const isPending = rule.status === 'pending_review'
            const canRun = rule.status === 'active'
            const ruleTypeDef = RULE_TYPES.find(t => t.value === rule.type)
            const indent = depth * 18

            return (
              <div key={rule.id} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                height: '30px', paddingRight: '10px',
                paddingLeft: `${10 + indent}px`,
                borderBottom: '1px solid var(--border)',
                background: selectedIds.has(rule.id) ? 'var(--accent-bg)' : 'transparent',
              }}>
                <div style={{ width: '24px', flexShrink: 0 }}>
                  <input type="checkbox" checked={selectedIds.has(rule.id)} onChange={() => toggleSelect(rule.id)}
                    style={{ width: '12px', height: '12px', cursor: 'pointer', accentColor: '#E8541A' }} />
                </div>

                {groupMode === 'rule-type' ? (
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    {(() => {
                      const connName = connections.find(c => c.id === rule.connectionId)?.name || 'Unknown'
                      const qualifiedName = rule.assetId ? assetQualifiedNames[rule.assetId] : undefined
                      const path = qualifiedName ? qualifiedName.split('.') : [connName, rule.tableName]
                      const tablePart = path[path.length - 1]
                      const dbPath = path.slice(0, -1).join('.')
                      const fullTitle = rule.tableName === 'ALL_TABLES'
                        ? `${connName} · All Tables`
                        : `${path.join('.')}${rule.columnName ? `.${rule.columnName}` : ''}`
                      return (
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                          title={fullTitle}>
                          {rule.tableName === 'ALL_TABLES' ? (
                            <>
                              <span style={{ color: 'var(--text-muted)' }}>{connName}</span>
                              <span style={{ color: 'var(--border)' }}> · </span>
                              <span style={{ color: 'var(--status-info-text)', fontWeight: 600, fontSize: '10px' }}>All Tables</span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: 'var(--text-muted)' }}>{dbPath}.</span>
                              {tablePart}
                              <span style={{ color: 'var(--brand-primary)' }}>{rule.columnName ? `.${rule.columnName}` : ''}</span>
                            </>
                          )}
                          {isPending && <span style={{ marginLeft: '5px', fontSize: '9px', color: 'var(--status-warn-text)', fontWeight: 600 }}>PENDING</span>}
                        </span>
                      )
                    })()}
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                        title={rule.name}>
                        {rule.name}
                        {isPending && <span style={{ marginLeft: '5px', fontSize: '9px', color: 'var(--status-warn-text)', fontWeight: 600 }}>PENDING</span>}
                      </span>
                    </div>

                    <div style={{ width: '130px', flexShrink: 0 }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-muted)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                        title={ruleTypeDef?.label || rule.type}>
                        {ruleTypeDef?.label || rule.type}
                      </span>
                    </div>
                  </>
                )}

                <div style={{ width: '86px', flexShrink: 0, overflow: 'hidden' }}>
                  <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600, background: categoryColors[rule.category] + '18', color: categoryColors[rule.category], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>
                    {CATEGORIES.find(c => c.value === rule.category)?.label}
                  </span>
                </div>

                <div style={{ width: '64px', flexShrink: 0, overflow: 'hidden' }}>
                  <span style={{ background: sev.bg, color: sev.color, padding: '1px 5px', borderRadius: '10px', fontSize: '9.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>{sev.label}</span>
                </div>

                <div style={{ width: '120px', flexShrink: 0 }}>
                  <StatusDropdown rule={rule} stat={stat} onUpdate={updateRuleStatus} />
                </div>

                <div style={{ width: '60px', flexShrink: 0 }}>
                  {isRunning ? (
                    <span style={{ fontSize: '9.5px', color: 'var(--accent)', fontWeight: 500 }}>⏳</span>
                  ) : result ? (
                    <span style={{ padding: '1px 5px', borderRadius: '10px', fontSize: '9.5px', fontWeight: 600, background: result.status === 'passed' ? 'var(--status-ok-bg)' : 'var(--status-error-bg)', color: result.status === 'passed' ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                      {result.status === 'passed' ? '✓' : '✗'} {result.score}%
                    </span>
                  ) : rule.lastRunStatus ? (
                    <span style={{ padding: '1px 5px', borderRadius: '10px', fontSize: '9.5px', fontWeight: 600, background: rule.lastRunStatus === 'passed' ? 'var(--status-ok-bg)' : 'var(--status-error-bg)', color: rule.lastRunStatus === 'passed' ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                      {rule.lastRunStatus === 'passed' ? '✓' : '✗'} {rule.lastRunScore}%
                    </span>
                  ) : (
                    <span style={{ fontSize: '9.5px', color: 'var(--border)' }}>—</span>
                  )}
                </div>

                <div style={{ width: '96px', flexShrink: 0, display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
                  {isPending && (
                    <>
                      <button onClick={() => approveRule(rule.id)} title="Approve"
                        style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #86efac', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => rejectRule(rule.id)} title="Reject"
                        style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>✕</button>
                    </>
                  )}
                  <button onClick={() => openEdit(rule)}
                    style={{ padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--status-info-bg)', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>✏</button>
                  <button onClick={() => canRun && testRule(rule.id)} disabled={isRunning || !canRun}
                    title={canRun ? 'Run' : 'Must be Active to run'}
                    style={{ padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--accent-bg)', background: canRun ? 'var(--accent-bg)' : 'var(--surface-muted)', color: canRun ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: canRun ? 'pointer' : 'not-allowed' }}>▶</button>
                  <button onClick={() => deleteRule(rule.id)}
                    style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--status-error-bg)', background: 'var(--surface)', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>📋</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '6px' }}>No rules found</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>
                {search || activeCategory !== 'all' || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first quality rule'}
              </div>
              <button onClick={() => setShowModal(true)} style={{ background: 'var(--brand-primary)', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>+ Add Rule</button>
            </div>
          )}
        </div>

        {/* Summary footer */}
        {filtered.length > 0 && (
          <div style={{ padding: '6px 12px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)', fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>Showing {filtered.length} rules · {rows.filter(r => r.kind === 'group' && r.level === 0).length} groups</span>
            <span>{rules.filter(r => r.status === 'active' || r.enabled).length} active · {rules.filter(r => r.status === 'pending_review').length} pending</span>
          </div>
        )}
      </div>

      {/* ── Create Rule Modal ─────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: '16px', padding: '24px', width: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>Add Quality Rule</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Define a new data quality check</div>
              </div>
              <button onClick={() => { setShowModal(false); setSaveError(null) }} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px' }}>✕</button>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'var(--surface-muted)', borderRadius: '8px', padding: '3px' }}>
              <button
                onClick={() => setAiMode(false)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: !aiMode ? 'var(--surface)' : 'transparent', color: !aiMode ? 'var(--foreground)' : 'var(--text-secondary)', boxShadow: !aiMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                🔧 Structured Form
              </button>
              <button
                onClick={() => { setAiMode(true); setAiGenError(null) }}
                style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: aiMode ? '#dbeafe' : 'transparent', color: aiMode ? '#1d4ed8' : 'var(--text-secondary)', boxShadow: aiMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                🤖 Describe in Plain Language
              </button>
            </div>

            {/* AI generation panel */}
            {aiMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #93c5fd', borderRadius: '10px', padding: '14px', marginBottom: '4px' }}>
                <div style={{ fontSize: '12.5px', color: '#1e40af', fontWeight: 600 }}>Describe your rule in plain English</div>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder={'e.g. "Check that the email column in the customers table is never null and matches a valid email format" or "Flag any orders where the total_amount is outside 0–100,000"'}
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '12.5px', color: 'var(--foreground)', background: '#fff', resize: 'vertical', boxSizing: 'border-box' as const, outline: 'none', lineHeight: '1.6' }}
                />
                {aiGenError && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{aiGenError}</div>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setAiMode(false)} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={generateRuleFromPrompt}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: aiGenerating || !aiPrompt.trim() ? 'var(--border)' : '#2563eb', color: aiGenerating || !aiPrompt.trim() ? 'var(--text-muted)' : '#fff', fontSize: '12px', fontWeight: 600, cursor: aiGenerating || !aiPrompt.trim() ? 'not-allowed' : 'pointer' }}
                  >
                    {aiGenerating ? '⏳ Generating…' : '✨ Generate Rule'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#3b82f6', lineHeight: '1.5' }}>
                  AI will pre-fill the rule name, type, category, and parameters. You can review and adjust before saving.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Rule Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Email Not Null" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this rule check?" style={inp()} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as RuleCategory }))} style={inp()}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Rule Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as RuleType }))} style={inp()}>
                    {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Scope selector */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Rule Scope *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, scope: 'generic', tableName: 'ALL_TABLES', columnName: '' }))} style={{
                    padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                    border: form.scope === 'generic' ? '2px solid var(--status-info-text)' : '1px solid var(--border)',
                    background: form.scope === 'generic' ? 'var(--accent-bg)' : 'var(--surface-muted)',
                  }}>
                    <div style={{ fontSize: '15px', marginBottom: '4px' }}>🔧</div>
                    <div style={{ fontSize: '12px', fontWeight: form.scope === 'generic' ? 700 : 500, color: form.scope === 'generic' ? 'var(--status-info-text)' : 'var(--text-secondary)' }}>DQ Rule</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Applies across all tables in the connection.</div>
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, scope: 'object-specific' }))} style={{
                    padding: '12px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                    border: form.scope === 'object-specific' ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: form.scope === 'object-specific' ? 'var(--surface-muted)' : 'var(--surface-muted)',
                  }}>
                    <div style={{ fontSize: '15px', marginBottom: '4px' }}>🎯</div>
                    <div style={{ fontSize: '12px', fontWeight: form.scope === 'object-specific' ? 700 : 500, color: form.scope === 'object-specific' ? 'var(--accent)' : 'var(--text-secondary)' }}>Business Rule</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Targets a specific table and/or column.</div>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Connection *</label>
                  <select value={form.connectionId} onChange={e => setForm(f => ({ ...f, connectionId: e.target.value }))} style={inp()}>
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {!isGeneric && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
                    Table *
                  </label>
                  <select value={form.tableName} onChange={e => { setForm(f => ({ ...f, tableName: e.target.value, columnName: '' })); setAvailableColumns([]) }}
                    style={inp()}>
                    <option value="">{tablesLoading ? 'Loading tables...' : '— Select Table —'}</option>
                    {availableTables.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Column</label>
                  <select value={form.columnName} onChange={e => setForm(f => ({ ...f, columnName: e.target.value }))}
                    disabled={!form.tableName || columnsLoading}
                    style={inp(!form.tableName ? { opacity: 0.6 } : {})}>
                    <option value="">{columnsLoading ? 'Loading columns...' : !form.tableName ? '— Select table first —' : '— Select Column —'}</option>
                    {availableColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              )}

              {isGeneric && availableTables.length > 0 && (
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
                    Tables Selected <span style={{ fontSize: '10px', color: 'var(--status-info-text)', marginLeft: '4px' }}>All {availableTables.length} tables</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px 12px', background: 'var(--accent-bg)', borderRadius: '8px', border: '1px solid #bae6fd', maxHeight: '120px', overflowY: 'auto' }}>
                    {availableTables.map(t => (
                      <span key={t} style={{ background: 'var(--accent-bg)', color: 'var(--status-info-text)', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, fontFamily: 'monospace' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Config Fields */}
              {renderConfigFields(form, (k, v) => setForm(f => ({ ...f, [k]: v })), inp)}

              {/* Severity */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Severity</label>
                <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as Rule['severity'] }))} style={inp()}>
                  {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Approval notice — new rules go to the data stewards review queue */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', background: 'var(--status-warn-bg)', border: '1px solid #fde68a', borderRadius: '8px' }}>
                <span style={{ fontSize: '14px' }}>🛡️</span>
                <div style={{ fontSize: '12px', color: 'var(--status-warn-text)', lineHeight: 1.4 }}>
                  This rule will be submitted to the <strong>Data Stewards</strong> group for review.
                  It stays <strong>Pending Review</strong> and cannot run until a steward approves it.
                </div>
              </div>

              {/* Custom SQL */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Custom SQL (blank = auto-generate)</label>
                <textarea value={form.customSql} onChange={e => setForm(f => ({ ...f, customSql: e.target.value }))} rows={4}
                  placeholder="SELECT COUNT(*) AS failed_count FROM ..."
                  style={{ ...inp(), fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' as const }} />
              </div>

              {/* Target preview */}
              {(form.tableName || form.connectionId) && (
                <div style={{ padding: '12px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Target</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {form.tableName ? (
                      <>
                        <span style={{ fontFamily: 'monospace' }}>{form.tableName}{form.columnName ? `.${form.columnName}` : ''}</span>
                        <span style={{ color: 'var(--text-muted)' }}> · {connections.find(c => c.id === form.connectionId)?.name || 'Unknown'}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontFamily: 'monospace', color: 'var(--status-info-text)' }}>All Tables</span>
                        <span style={{ color: 'var(--text-muted)' }}> · {connections.find(c => c.id === form.connectionId)?.name || 'Unknown'}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {saveError && (
                <div style={{ padding: '10px 14px', background: 'var(--status-error-bg)', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '12.5px', color: 'var(--status-error-text)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span>{saveError}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '6px' }}>
                <button onClick={() => { setShowModal(false); setSaveError(null) }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving || !canSave} style={{
                  flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  background: canSave ? 'var(--brand-primary)' : 'var(--border)',
                  color: canSave ? '#fff' : 'var(--text-muted)'
                }}>{saving ? '⏳ Saving...' : '+ Add Rule'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Drawer ───────────────────────────────────────────── */}
      {editDrawer && editForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} onClick={() => { setEditDrawer(null); setEditForm(null) }} />
          <div style={{ width: '480px', background: 'var(--surface)', height: '100%', boxShadow: '-8px 0 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '2px' }}>{editDrawer.id}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Edit Rule</div>
              </div>
              <button onClick={() => { setEditDrawer(null); setEditForm(null) }} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>✕</button>
            </div>

            {/* Drawer Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: '4px', flexShrink: 0 }}>
              {([['config', 'Configuration'], ['failed-records', 'Failed Records']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDrawerTab(key)}
                  style={{
                    padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--text-sm)', fontWeight: drawerTab === key ? 600 : 400,
                    color: drawerTab === key ? 'var(--foreground)' : 'var(--text-muted)',
                    borderBottom: drawerTab === key ? '2px solid var(--primary)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Drawer Body */}
            {drawerTab === 'failed-records' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
                <RuleFailedRecordsTab ruleId={editDrawer.id} />
              </div>
            )}
            {drawerTab === 'config' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Rule Name *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)} style={inp()} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)} rows={2} style={{ ...inp(), resize: 'vertical' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Rule Type</label>
                  <select value={editForm.type} onChange={e => setEditForm(f => f ? { ...f, type: e.target.value as RuleType } : f)} style={inp()}>
                    {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Category</label>
                  <select value={editForm.category} onChange={e => setEditForm(f => f ? { ...f, category: e.target.value as RuleCategory } : f)} style={inp()}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Config Fields */}
              {editForm && renderConfigFields(editForm, (k, v) => setEditForm(f => f ? { ...f, [k]: v } : f), inp)}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Severity</label>
                  <select value={editForm.severity} onChange={e => setEditForm(f => f ? { ...f, severity: e.target.value as Rule['severity'] } : f)} style={inp()}>
                    {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => f ? { ...f, status: e.target.value as RuleStatus } : f)} style={inp()}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* SQL Preview */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Custom SQL (blank = auto-generate)</label>
                <textarea value={editForm.customSql} onChange={e => setEditForm(f => f ? { ...f, customSql: e.target.value } : f)} rows={5}
                  placeholder="SELECT COUNT(*) AS failed_count FROM ..."
                  style={{ ...inp(), fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' as const }} />
              </div>

              {/* Target */}
              <div style={{ padding: '12px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target</div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
                  <select value={editForm.connectionId} onChange={e => setEditForm(f => f ? { ...f, connectionId: e.target.value } : f)} style={inp()}>
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Table</label>
                    <select value={editForm.tableName} onChange={e => { setEditForm(f => f ? { ...f, tableName: e.target.value, columnName: '' } : f); if (e.target.value) fetchColumns(e.target.value) }} style={inp()}>
                      <option value="">Select table</option>
                      {availableTables.map(t => <option key={t} value={t}>{t}</option>)}
                      {editForm.tableName && !availableTables.includes(editForm.tableName) && <option value={editForm.tableName}>{editForm.tableName}</option>}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Column</label>
                    <select value={editForm.columnName} onChange={e => setEditForm(f => f ? { ...f, columnName: e.target.value } : f)} style={inp()}>
                      <option value="">All columns</option>
                      {availableColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      {editForm.columnName && !availableColumns.includes(editForm.columnName) && <option value={editForm.columnName}>{editForm.columnName}</option>}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Drawer Footer */}
            {drawerTab === 'config' && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
              <button onClick={saveEdit} disabled={saving} style={{
                padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--brand-primary)', color: '#fff',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1
              }}>{saving ? '⏳ Saving...' : '✓ Save Changes'}</button>
              <button onClick={() => testRule(editDrawer.id)} disabled={testing === editDrawer.id}
                title="Run against connection"
                style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--accent-bg)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                {testing === editDrawer.id ? '⏳ Testing...' : '▶ Test Rule'}
              </button>
              <button onClick={() => { setEditDrawer(null); setEditForm(null) }} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Status Dropdown Component ───────────────────────────────────── */

function StatusDropdown({ rule, stat, onUpdate }: {
  rule: Rule; stat: { bg: string; color: string; label: string; border: string }
  onUpdate: (id: string, status: RuleStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const statuses: RuleStatus[] = ['active', 'draft', 'pending_review', 'disabled', 'archived']
  const currentStatus = rule.status || (rule.enabled ? 'active' : 'disabled')

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '20px',
        background: stat.bg, color: stat.color, border: `1px solid ${stat.border}`,
        fontSize: '10.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
      }}>
        {stat.label}
        <span style={{ fontSize: '8px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: '28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 30, width: '150px', padding: '4px 0' }}
          onMouseLeave={() => setOpen(false)}>
          {statuses.map(s => {
            const cfg = STATUS_CONFIG[s]
            return (
              <button key={s} onClick={() => { onUpdate(rule.id, s); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: currentStatus === s ? 'var(--surface-muted)' : 'var(--surface)', border: 'none', color: cfg.color }}>
                {currentStatus === s && <span style={{ color: 'var(--status-ok-text)', fontSize: '10px' }}>✓</span>}
                <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: 600 }}>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Dynamic Config Fields ───────────────────────────────────────── */

const COMPARISON_OPS: { value: string; label: string }[] = [
  { value: '>', label: 'greater than  ( > )' },
  { value: '>=', label: 'greater than or equal  ( ≥ )' },
  { value: '<', label: 'less than  ( < )' },
  { value: '<=', label: 'less than or equal  ( ≤ )' },
  { value: '=', label: 'equal to  ( = )' },
  { value: '!=', label: 'not equal to  ( ≠ )' },
  { value: 'between', label: 'between (inclusive)' },
]

function renderConfigFields(
  form: { type: string; paramMin: string; paramMax: string; paramPattern: string; paramAge: string; paramRows: string; paramAcceptedValues: string; paramCondition: string; paramExpectedColumns: string; paramRefTable: string; paramRefColumn: string; paramDateColumn: string; paramMetricSql: string; paramSampleSize: string; paramValidationPrompt: string; paramBaselineMean: string; paramBaselineStd: string; paramTolerancePct: string; paramOperator: string; paramValue: string; customSql: string },
  set: (key: string, value: string) => void,
  inp: (s?: React.CSSProperties) => React.CSSProperties
) {
  const lbl: React.CSSProperties = { fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }
  const wrap: React.CSSProperties = { padding: '12px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }
  const headStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }

  const t = form.type
  let fields: React.ReactNode = null

  if (['range', 'range_check'].includes(t)) {
    fields = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div><label style={lbl}>Min Value</label><input value={form.paramMin} onChange={e => set('paramMin', e.target.value)} placeholder="0" style={inp()} /></div>
        <div><label style={lbl}>Max Value</label><input value={form.paramMax} onChange={e => set('paramMax', e.target.value)} placeholder="100000" style={inp()} /></div>
      </div>
    )
  } else if (t === 'comparison_check') {
    fields = (
      <>
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Flag rows where the column does <strong>not</strong> satisfy this condition.</div>
        {form.paramOperator === 'between' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', alignItems: 'end' }}>
            <div>
              <label style={lbl}>Operator</label>
              <select value={form.paramOperator} onChange={e => set('paramOperator', e.target.value)} style={inp()}>
                {COMPARISON_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Min</label><input value={form.paramMin} onChange={e => set('paramMin', e.target.value)} placeholder="0" style={inp()} /></div>
            <div><label style={lbl}>Max</label><input value={form.paramMax} onChange={e => set('paramMax', e.target.value)} placeholder="1000" style={inp()} /></div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'end' }}>
            <div>
              <label style={lbl}>Operator</label>
              <select value={form.paramOperator} onChange={e => set('paramOperator', e.target.value)} style={inp()}>
                {COMPARISON_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Value</label><input value={form.paramValue} onChange={e => set('paramValue', e.target.value)} placeholder="1000" style={inp()} /></div>
          </div>
        )}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          e.g. NET_AMOUNT {form.paramOperator === 'between' ? `BETWEEN ${form.paramMin || '0'} AND ${form.paramMax || '1000'}` : `${form.paramOperator} ${form.paramValue || '1000'}`}
        </div>
      </>
    )
  } else if (['regex', 'regex_check'].includes(t)) {
    fields = <div><label style={lbl}>Regex Pattern</label><input value={form.paramPattern} onChange={e => set('paramPattern', e.target.value)} placeholder="^[a-zA-Z0-9._%+-]+@..." style={inp({ fontFamily: 'monospace', fontSize: '12px' })} /></div>
  } else if (['freshness', 'freshness_check'].includes(t)) {
    fields = <div><label style={lbl}>Max Age (hours)</label><input value={form.paramAge} onChange={e => set('paramAge', e.target.value)} placeholder="24" style={inp()} /></div>
  } else if (['row_count'].includes(t)) {
    fields = <div><label style={lbl}>Minimum Rows</label><input value={form.paramRows} onChange={e => set('paramRows', e.target.value)} placeholder="1000" style={inp()} /></div>
  } else if (t === 'volume_check') {
    fields = (
      <>
        <div><label style={lbl}>Date Column</label><input value={form.paramDateColumn} onChange={e => set('paramDateColumn', e.target.value)} placeholder="created_at" style={inp()} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label style={lbl}>Min Rows</label><input value={form.paramRows} onChange={e => set('paramRows', e.target.value)} placeholder="1000" style={inp()} /></div>
          <div><label style={lbl}>Max Rows</label><input value={form.paramMax} onChange={e => set('paramMax', e.target.value)} placeholder="100000" style={inp()} /></div>
        </div>
      </>
    )
  } else if (t === 'accepted_values_check') {
    fields = <div><label style={lbl}>Accepted Values (comma-separated)</label><input value={form.paramAcceptedValues} onChange={e => set('paramAcceptedValues', e.target.value)} placeholder="ACTIVE, INACTIVE, PENDING" style={inp()} /></div>
  } else if (['business_rule_check', 'semantic_consistency_check', 'referential_sanity_check'].includes(t)) {
    fields = <div><label style={lbl}>Condition</label><textarea value={form.paramCondition} onChange={e => set('paramCondition', e.target.value)} rows={2} placeholder="ship_date >= order_date" style={{ ...inp(), fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' as const }} /></div>
  } else if (t === 'schema_drift_check') {
    fields = <div><label style={lbl}>Expected Columns (comma-separated)</label><input value={form.paramExpectedColumns} onChange={e => set('paramExpectedColumns', e.target.value)} placeholder="id, name, email, created_at" style={inp()} /></div>
  } else if (['referential', 'referential_integrity_check'].includes(t)) {
    fields = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div><label style={lbl}>Ref Table</label><input value={form.paramRefTable} onChange={e => set('paramRefTable', e.target.value)} placeholder="schema.table" style={inp()} /></div>
        <div><label style={lbl}>Ref Column</label><input value={form.paramRefColumn} onChange={e => set('paramRefColumn', e.target.value)} placeholder="id" style={inp()} /></div>
      </div>
    )
  } else if (t === 'business_metric_check') {
    fields = (
      <>
        <div><label style={lbl}>Metric SQL</label><input value={form.paramMetricSql} onChange={e => set('paramMetricSql', e.target.value)} placeholder="AVG(order_amount)" style={inp({ fontFamily: 'monospace', fontSize: '12px' })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label style={lbl}>Min Value</label><input value={form.paramMin} onChange={e => set('paramMin', e.target.value)} placeholder="50" style={inp()} /></div>
          <div><label style={lbl}>Max Value</label><input value={form.paramMax} onChange={e => set('paramMax', e.target.value)} placeholder="10000" style={inp()} /></div>
        </div>
      </>
    )
  } else if (t === 'distribution_consistency_check') {
    fields = (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label style={lbl}>Baseline Mean</label><input value={form.paramBaselineMean} onChange={e => set('paramBaselineMean', e.target.value)} placeholder="100.0" style={inp()} /></div>
          <div><label style={lbl}>Baseline Std Dev</label><input value={form.paramBaselineStd} onChange={e => set('paramBaselineStd', e.target.value)} placeholder="15.0" style={inp()} /></div>
        </div>
        <div><label style={lbl}>Tolerance %</label><input value={form.paramTolerancePct} onChange={e => set('paramTolerancePct', e.target.value)} placeholder="20" style={inp()} /></div>
      </>
    )
  } else if (t === 'llm_semantic_check') {
    fields = (
      <>
        <div><label style={lbl}>Sample Size</label><input value={form.paramSampleSize} onChange={e => set('paramSampleSize', e.target.value)} placeholder="100" style={inp()} /></div>
        <div><label style={lbl}>Validation Prompt</label><textarea value={form.paramValidationPrompt} onChange={e => set('paramValidationPrompt', e.target.value)} rows={3} placeholder="Check that each row represents a valid customer record..." style={{ ...inp(), fontSize: '12px', resize: 'vertical' as const }} /></div>
      </>
    )
  } else if (['custom_sql', 'custom_sql_check'].includes(t)) {
    fields = <div><label style={lbl}>SQL Expression</label><textarea value={form.customSql} onChange={e => set('customSql', e.target.value)} rows={4} placeholder="SELECT COUNT(*) AS failed_count FROM ..." style={{ ...inp(), fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' as const }} /></div>
  }

  if (!fields) return null
  return <div style={wrap}><div style={headStyle}>Rule Configuration</div>{fields}</div>
}
