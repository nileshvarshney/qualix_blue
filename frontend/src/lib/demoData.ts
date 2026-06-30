/**
 * Demo data used when the backend (Snowflake) is unavailable.
 * All routes that proxy to the backend should fall back to this.
 */

export const DEMO_CONNECTIONS = [
  {
    id: 'demo-conn-001',
    name: 'Supply Chain DB',
    type: 'snowflake',
    account: 'zfuftbi-keb04862',
    username: 'nilesh',
    warehouse: 'COMPUTE_WH',
    role: 'ACCOUNTADMIN',
    database: 'SUPPLYCHAIN_DB',
    schema: 'SUPPLYCHAIN',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-conn-002',
    name: 'Marketing Analytics (BigQuery)',
    type: 'bigquery',
    account: 'bigquery.googleapis.com',
    username: 'svc-dataguard@analytics-prod-12345.iam.gserviceaccount.com',
    database: 'analytics-prod-12345',
    schema: 'marketing_analytics',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-conn-003',
    name: 'Customer 360 (PostgreSQL)',
    type: 'postgresql',
    host: 'pg-prod.corp.internal',
    port: 5432,
    username: 'dataguard_ro',
    database: 'customer_360',
    schema: 'public',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-conn-004',
    name: 'Enterprise DW (Redshift)',
    type: 'redshift',
    host: 'analytics-cluster.us-east-1.redshift.amazonaws.com',
    port: 5439,
    username: 'dataguard_user',
    database: 'data_warehouse',
    schema: 'public',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-conn-005',
    name: 'Oracle Financials (ERP)',
    type: 'oracle',
    host: 'erp-prod.corp.internal',
    port: 1521,
    username: 'fin_dg_user',
    database: 'FINDB',
    schema: 'FINANCE',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'demo-conn-006',
    name: 'Oracle Manufacturing (ERP)',
    type: 'oracle',
    host: 'mfg-prod.corp.internal',
    port: 1521,
    username: 'mfg_dg_user',
    database: 'MFGDB',
    schema: 'MFG',
    status: 'active',
    lastTested: '2026-06-29T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
]

function trendDay(daysAgo: number, score: number, failed: number) {
  const d = new Date('2026-06-29')
  d.setDate(d.getDate() - daysAgo)
  return { date: d.toISOString().slice(0, 10), score, failed, alert_count: Math.floor(failed * 0.6), anomaly_count: Math.floor(failed * 0.2) }
}

export const DEMO_DASHBOARD = {
  overallScore: 87,
  totalAssets: 38,
  totalRules: 124,
  openAlerts: 7,
  criticalAlerts: 2,
  mediumAlerts: 3,
  passed: 117,
  failed: 7,
  trend: [
    trendDay(29, 81, 14), trendDay(28, 83, 11), trendDay(27, 82, 12),
    trendDay(26, 85, 9),  trendDay(25, 84, 10), trendDay(24, 86, 8),
    trendDay(23, 85, 9),  trendDay(22, 87, 7),  trendDay(21, 86, 8),
    trendDay(20, 88, 6),  trendDay(19, 87, 7),  trendDay(18, 86, 8),
    trendDay(17, 89, 5),  trendDay(16, 88, 6),  trendDay(15, 87, 7),
    trendDay(14, 90, 4),  trendDay(13, 89, 5),  trendDay(12, 88, 6),
    trendDay(11, 87, 7),  trendDay(10, 86, 8),  trendDay(9,  88, 6),
    trendDay(8,  89, 5),  trendDay(7,  87, 7),  trendDay(6,  88, 6),
    trendDay(5,  89, 5),  trendDay(4,  88, 6),  trendDay(3,  87, 7),
    trendDay(2,  88, 6),  trendDay(1,  87, 7),  trendDay(0,  87, 7),
  ],
  dimensions: {
    completeness: 92,
    accuracy: 88,
    uniqueness: 95,
    validity: 84,
    timeliness: 79,
    consistency: 86,
  },
  failingRules: [
    { rule_name: 'Freshness: FINANCE_TRANSACTIONS', asset_name: 'SUPPLYCHAIN.FINANCE_TRANSACTIONS', detail: 'Last updated 26 hours ago (threshold: 24 h)', severity: 'critical' },
    { rule_name: 'Freshness: INVENTORY', asset_name: 'SUPPLYCHAIN.INVENTORY', detail: 'Last updated 13 hours ago (threshold: 12 h)', severity: 'critical' },
    { rule_name: 'Volume: SALES_ORDERS', asset_name: 'SUPPLYCHAIN.SALES_ORDERS', detail: '0 new rows in last 24 h (min: 10)', severity: 'high' },
    { rule_name: 'Email Format Validation', asset_name: 'public.customers', detail: '312 emails with invalid format', severity: 'high' },
    { rule_name: 'FK: SALES_ORDERS → CUSTOMERS', asset_name: 'SUPPLYCHAIN.SALES_ORDERS', detail: '4 orphaned order records', severity: 'high' },
  ],
  atRiskTables: [
    { asset_name: 'SUPPLYCHAIN.FINANCE_TRANSACTIONS', domain_name: 'Finance', score: 61, score_delta: -8 },
    { asset_name: 'SUPPLYCHAIN.INVENTORY',            domain_name: 'Operations', score: 68, score_delta: -5 },
    { asset_name: 'public.customers',                 domain_name: 'Revenue',    score: 74, score_delta: -3 },
    { asset_name: 'marketing_analytics.conversions',  domain_name: 'Marketing',  score: 77, score_delta: -4 },
  ],
}

export const DEMO_TREND = DEMO_DASHBOARD.trend

// ─────────────────────────── helpers ────────────────────────────────────────

function ago(days: number, hours = 0): string {
  const d = new Date('2026-06-29T12:00:00Z')
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

// ─────────────────────────── domains / subdomains ───────────────────────────

export const DEMO_DOMAINS = [
  { domain_id: 'dom-001', domain_name: 'Revenue', description: 'Sales, orders, and revenue operations', owner_name: 'Priya Sharma', owner_email: 'priya.sharma@corp.com', asset_count: 8, rule_count: 32, quality_score: 88, created_at: ago(180) },
  { domain_id: 'dom-002', domain_name: 'Finance', description: 'GL, AP/AR, budgeting and FX data', owner_name: 'Michael Chen', owner_email: 'michael.chen@corp.com', asset_count: 6, rule_count: 28, quality_score: 82, created_at: ago(180) },
  { domain_id: 'dom-003', domain_name: 'Operations', description: 'Inventory, supply chain, and logistics', owner_name: 'James Okonkwo', owner_email: 'james.okonkwo@corp.com', asset_count: 7, rule_count: 25, quality_score: 79, created_at: ago(180) },
  { domain_id: 'dom-004', domain_name: 'Marketing', description: 'Campaigns, attribution, and lead data', owner_name: 'Sofia Delgado', owner_email: 'sofia.delgado@corp.com', asset_count: 5, rule_count: 18, quality_score: 91, created_at: ago(180) },
  { domain_id: 'dom-005', domain_name: 'Customer', description: 'Customer 360, interactions and subscriptions', owner_name: 'Arun Patel', owner_email: 'arun.patel@corp.com', asset_count: 5, rule_count: 21, quality_score: 85, created_at: ago(180) },
  { domain_id: 'dom-006', domain_name: 'Manufacturing', description: 'Work orders, BOM, quality inspections', owner_name: 'Elena Kowalski', owner_email: 'elena.kowalski@corp.com', asset_count: 4, rule_count: 14, quality_score: 87, created_at: ago(180) },
  { domain_id: 'dom-007', domain_name: 'Data Warehouse', description: 'Enterprise DW facts and dimensions', owner_name: 'David Park', owner_email: 'david.park@corp.com', asset_count: 3, rule_count: 12, quality_score: 90, created_at: ago(180) },
]

export const DEMO_SUBDOMAINS = [
  { subdomain_id: 'sub-001', subdomain_name: 'Order Management', description: 'Sales orders and fulfilment', domain_id: 'dom-001', domain_name: 'Revenue', created_at: ago(150) },
  { subdomain_id: 'sub-002', subdomain_name: 'Customer Master', description: 'Core customer records', domain_id: 'dom-001', domain_name: 'Revenue', created_at: ago(150) },
  { subdomain_id: 'sub-003', subdomain_name: 'Product Catalog', description: 'Products and pricing', domain_id: 'dom-001', domain_name: 'Revenue', created_at: ago(150) },
  { subdomain_id: 'sub-004', subdomain_name: 'General Ledger', description: 'GL accounts and journal entries', domain_id: 'dom-002', domain_name: 'Finance', created_at: ago(150) },
  { subdomain_id: 'sub-005', subdomain_name: 'Accounts Payable', description: 'Vendor invoices and payments', domain_id: 'dom-002', domain_name: 'Finance', created_at: ago(150) },
  { subdomain_id: 'sub-006', subdomain_name: 'Accounts Receivable', description: 'Customer invoicing and collections', domain_id: 'dom-002', domain_name: 'Finance', created_at: ago(150) },
  { subdomain_id: 'sub-007', subdomain_name: 'Inventory Control', description: 'Stock levels and movements', domain_id: 'dom-003', domain_name: 'Operations', created_at: ago(150) },
  { subdomain_id: 'sub-008', subdomain_name: 'Supplier Management', description: 'Vendor and procurement data', domain_id: 'dom-003', domain_name: 'Operations', created_at: ago(150) },
  { subdomain_id: 'sub-009', subdomain_name: 'Logistics', description: 'Shipment and delivery tracking', domain_id: 'dom-003', domain_name: 'Operations', created_at: ago(150) },
  { subdomain_id: 'sub-010', subdomain_name: 'Campaign Analytics', description: 'Marketing campaign performance', domain_id: 'dom-004', domain_name: 'Marketing', created_at: ago(150) },
  { subdomain_id: 'sub-011', subdomain_name: 'Lead Generation', description: 'Lead capture and scoring', domain_id: 'dom-004', domain_name: 'Marketing', created_at: ago(150) },
  { subdomain_id: 'sub-012', subdomain_name: 'Attribution', description: 'Multi-touch attribution models', domain_id: 'dom-004', domain_name: 'Marketing', created_at: ago(150) },
  { subdomain_id: 'sub-013', subdomain_name: 'Customer Profile', description: 'Unified customer profiles', domain_id: 'dom-005', domain_name: 'Customer', created_at: ago(150) },
  { subdomain_id: 'sub-014', subdomain_name: 'Customer Events', description: 'Behavioural events and interactions', domain_id: 'dom-005', domain_name: 'Customer', created_at: ago(150) },
  { subdomain_id: 'sub-015', subdomain_name: 'Production Planning', description: 'Work orders and schedules', domain_id: 'dom-006', domain_name: 'Manufacturing', created_at: ago(150) },
  { subdomain_id: 'sub-016', subdomain_name: 'Quality Control', description: 'Inspection results and defect tracking', domain_id: 'dom-006', domain_name: 'Manufacturing', created_at: ago(150) },
  { subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics', description: 'Revenue KPIs and sales trends', domain_id: 'dom-007', domain_name: 'Data Warehouse', created_at: ago(150) },
]

export const DEMO_DASHBOARD_DOMAINS = [
  { domain_id: 'dom-001', domain_name: 'Revenue',       score: 88, asset_count: 8,  rule_count: 32, alert_count: 2, score_delta: +2 },
  { domain_id: 'dom-002', domain_name: 'Finance',        score: 82, asset_count: 6,  rule_count: 28, alert_count: 3, score_delta: -4 },
  { domain_id: 'dom-003', domain_name: 'Operations',     score: 79, asset_count: 7,  rule_count: 25, alert_count: 4, score_delta: -6 },
  { domain_id: 'dom-004', domain_name: 'Marketing',      score: 91, asset_count: 5,  rule_count: 18, alert_count: 1, score_delta: +3 },
  { domain_id: 'dom-005', domain_name: 'Customer',       score: 85, asset_count: 5,  rule_count: 21, alert_count: 2, score_delta: +1 },
  { domain_id: 'dom-006', domain_name: 'Manufacturing',  score: 87, asset_count: 4,  rule_count: 14, alert_count: 1, score_delta:  0 },
  { domain_id: 'dom-007', domain_name: 'Data Warehouse', score: 90, asset_count: 3,  rule_count: 12, alert_count: 0, score_delta: +1 },
]

// ─────────────────────────── users & teams ──────────────────────────────────

export const DEMO_USERS = [
  { user_id: 'user-001', email: 'admin@corp.com',        full_name: 'Alex Admin',       role: 'admin',        is_active: true, created_at: ago(365) },
  { user_id: 'user-002', email: 'priya.sharma@corp.com', full_name: 'Priya Sharma',     role: 'domain_owner', is_active: true, created_at: ago(300) },
  { user_id: 'user-003', email: 'arun.patel@corp.com',   full_name: 'Arun Patel',       role: 'data_owner',   is_active: true, created_at: ago(280) },
  { user_id: 'user-004', email: 'michael.chen@corp.com', full_name: 'Michael Chen',     role: 'data_owner',   is_active: true, created_at: ago(260) },
  { user_id: 'user-005', email: 'viewer@corp.com',       full_name: 'Rachel Viewer',    role: 'viewer',       is_active: true, created_at: ago(240) },
  { user_id: 'user-006', email: 'auditor@corp.com',      full_name: 'Sam Auditor',      role: 'auditor',      is_active: true, created_at: ago(220) },
  { user_id: 'user-007', email: 'sofia.delgado@corp.com',full_name: 'Sofia Delgado',    role: 'domain_owner', is_active: true, created_at: ago(200) },
  { user_id: 'user-008', email: 'elena.kowalski@corp.com',full_name: 'Elena Kowalski',  role: 'data_owner',   is_active: true, created_at: ago(190) },
]

export const DEMO_TEAMS = [
  { team_id: 'team-001', team_name: 'Revenue Analytics', description: 'Owns revenue and order data quality', owner_id: 'user-002', member_count: 4, created_at: ago(180) },
  { team_id: 'team-002', team_name: 'Finance Data',       description: 'Manages GL and AP/AR data assets',   owner_id: 'user-004', member_count: 3, created_at: ago(180) },
  { team_id: 'team-003', team_name: 'Supply Chain Ops',   description: 'Inventory and supplier data stewardship', owner_id: 'user-003', member_count: 5, created_at: ago(180) },
  { team_id: 'team-004', team_name: 'Growth Marketing',   description: 'Campaign and attribution data',      owner_id: 'user-007', member_count: 4, created_at: ago(180) },
  { team_id: 'team-005', team_name: 'Customer Platform',  description: 'Customer 360 data quality',          owner_id: 'user-003', member_count: 6, created_at: ago(180) },
  { team_id: 'team-006', team_name: 'Platform Engineering', description: 'DW, pipelines and infra data',     owner_id: 'user-001', member_count: 3, created_at: ago(180) },
]

// ─────────────────────────── tags ───────────────────────────────────────────

export const DEMO_TAGS = [
  { tag_id: 'tag-001', tag_name: 'PII',         color: '#EF4444', description: 'Personally identifiable information', created_at: ago(180) },
  { tag_id: 'tag-002', tag_name: 'Critical',     color: '#DC2626', description: 'Business-critical data asset',        created_at: ago(180) },
  { tag_id: 'tag-003', tag_name: 'Finance',      color: '#2563EB', description: 'Financial data asset',               created_at: ago(180) },
  { tag_id: 'tag-004', tag_name: 'Marketing',    color: '#7C3AED', description: 'Marketing analytics data',           created_at: ago(180) },
  { tag_id: 'tag-005', tag_name: 'Operational',  color: '#059669', description: 'Operational/transactional data',     created_at: ago(180) },
  { tag_id: 'tag-006', tag_name: 'Certified',    color: '#0891B2', description: 'Certified data product',             created_at: ago(180) },
  { tag_id: 'tag-007', tag_name: 'GDPR',         color: '#D97706', description: 'Subject to GDPR regulations',        created_at: ago(180) },
  { tag_id: 'tag-008', tag_name: 'HIPAA',        color: '#BE185D', description: 'Subject to HIPAA regulations',       created_at: ago(180) },
  { tag_id: 'tag-009', tag_name: 'Deprecated',   color: '#6B7280', description: 'Scheduled for decommission',         created_at: ago(180) },
  { tag_id: 'tag-010', tag_name: 'Experimental', color: '#F59E0B', description: 'Not yet production-ready',           created_at: ago(180) },
]

// ─────────────────────────── alerts ─────────────────────────────────────────

export const DEMO_ALERTS = [
  { alert_id: 'alt-001', run_id: 'run-021', rule_id: 'rule-003', domain_id: 'dom-003', subdomain_id: 'sub-007', asset_id: 'asset-005', alert_type: 'freshness', severity: 'critical', alert_status: 'open', alert_message: 'Table INVENTORY not updated in 26 hours (threshold: 24 h)', notification_channel: 'slack', created_at: ago(1, 2), resolved_at: null, rule_name: 'Freshness: INVENTORY', rule_description: 'INVENTORY must refresh every 12 hours', rule_type: 'freshness_check', sf_database_name: 'SUPPLYCHAIN_DB', sf_schema_name: 'SUPPLYCHAIN', sf_table_name: 'INVENTORY', asset_name: 'INVENTORY', domain_name: 'Operations', subdomain_name: 'Inventory Control' },
  { alert_id: 'alt-002', run_id: 'run-022', rule_id: 'rule-001', domain_id: 'dom-002', subdomain_id: 'sub-004', asset_id: 'asset-018', alert_type: 'freshness', severity: 'critical', alert_status: 'open', alert_message: 'Table FINANCE_TRANSACTIONS not updated in 28 hours (threshold: 24 h)', notification_channel: 'email', created_at: ago(1, 4), resolved_at: null, rule_name: 'Freshness: FINANCE_TRANSACTIONS', rule_description: 'FINANCE_TRANSACTIONS must refresh daily', rule_type: 'freshness_check', sf_database_name: 'FINDB', sf_schema_name: 'FINANCE', sf_table_name: 'FINANCE_TRANSACTIONS', asset_name: 'FINANCE_TRANSACTIONS', domain_name: 'Finance', subdomain_name: 'General Ledger' },
  { alert_id: 'alt-003', run_id: 'run-023', rule_id: 'rule-010', domain_id: 'dom-001', subdomain_id: 'sub-001', asset_id: 'asset-001', alert_type: 'volume', severity: 'high', alert_status: 'open', alert_message: '0 new rows in SALES_ORDERS in last 24 hours (min: 10)', notification_channel: 'slack', created_at: ago(0, 8), resolved_at: null, rule_name: 'Volume: SALES_ORDERS', rule_description: 'SALES_ORDERS must have at least 10 new rows per day', rule_type: 'volume_check', sf_database_name: 'SUPPLYCHAIN_DB', sf_schema_name: 'SUPPLYCHAIN', sf_table_name: 'SALES_ORDERS', asset_name: 'SALES_ORDERS', domain_name: 'Revenue', subdomain_name: 'Order Management' },
  { alert_id: 'alt-004', run_id: 'run-024', rule_id: 'rule-021', domain_id: 'dom-005', subdomain_id: 'sub-013', asset_id: 'asset-023', alert_type: 'validity', severity: 'high', alert_status: 'open', alert_message: '312 email addresses in customers table fail regex validation', notification_channel: 'email', created_at: ago(2), resolved_at: null, rule_name: 'Email Format Validation', rule_description: 'customer.email must match RFC 5322 pattern', rule_type: 'regex_check', sf_database_name: 'customer_360', sf_schema_name: 'public', sf_table_name: 'customers', asset_name: 'customers', domain_name: 'Customer', subdomain_name: 'Customer Profile' },
  { alert_id: 'alt-005', run_id: 'run-025', rule_id: 'rule-012', domain_id: 'dom-001', subdomain_id: 'sub-001', asset_id: 'asset-001', alert_type: 'consistency', severity: 'high', alert_status: 'open', alert_message: '4 SALES_ORDERS rows reference non-existent CUSTOMER_ID values', notification_channel: 'slack', created_at: ago(1), resolved_at: null, rule_name: 'FK: SALES_ORDERS → CUSTOMERS', rule_description: 'Every SALES_ORDER must have a valid CUSTOMER_ID', rule_type: 'referential_integrity_check', sf_database_name: 'SUPPLYCHAIN_DB', sf_schema_name: 'SUPPLYCHAIN', sf_table_name: 'SALES_ORDERS', asset_name: 'SALES_ORDERS', domain_name: 'Revenue', subdomain_name: 'Order Management' },
  { alert_id: 'alt-006', run_id: 'run-026', rule_id: 'rule-030', domain_id: 'dom-004', subdomain_id: 'sub-010', asset_id: 'asset-028', alert_type: 'accuracy', severity: 'medium', alert_status: 'acknowledged', alert_message: 'ad_spend.cost_per_click values > $500 detected (anomaly threshold: $50)', notification_channel: 'slack', created_at: ago(3), resolved_at: null, rule_name: 'CPC Anomaly: ad_spend', rule_description: 'cost_per_click should not exceed $50', rule_type: 'range_check', sf_database_name: 'analytics-prod-12345', sf_schema_name: 'marketing_analytics', sf_table_name: 'ad_spend', asset_name: 'ad_spend', domain_name: 'Marketing', subdomain_name: 'Campaign Analytics' },
  { alert_id: 'alt-007', run_id: 'run-027', rule_id: 'rule-041', domain_id: 'dom-006', subdomain_id: 'sub-015', asset_id: 'asset-033', alert_type: 'completeness', severity: 'medium', alert_status: 'open', alert_message: '18% of WORK_ORDERS missing completion_date (threshold: 5%)', notification_channel: 'email', created_at: ago(1, 6), resolved_at: null, rule_name: 'Completeness: WORK_ORDERS.completion_date', rule_description: 'No more than 5% of WORK_ORDERS may have null completion_date', rule_type: 'null_check', sf_database_name: 'MFGDB', sf_schema_name: 'MFG', sf_table_name: 'WORK_ORDERS', asset_name: 'WORK_ORDERS', domain_name: 'Manufacturing', subdomain_name: 'Production Planning' },
  { alert_id: 'alt-008', run_id: 'run-018', rule_id: 'rule-035', domain_id: 'dom-007', subdomain_id: 'sub-017', asset_id: 'asset-030', alert_type: 'uniqueness', severity: 'low', alert_status: 'resolved', alert_message: '23 duplicate customer_key values in dim_customer (resolved)', notification_channel: 'slack', created_at: ago(5), resolved_at: ago(4), rule_name: 'Uniqueness: dim_customer.customer_key', rule_description: 'customer_key must be unique in dim_customer', rule_type: 'uniqueness_check', sf_database_name: 'data_warehouse', sf_schema_name: 'public', sf_table_name: 'dim_customer', asset_name: 'dim_customer', domain_name: 'Data Warehouse', subdomain_name: 'Sales Analytics' },
  { alert_id: 'alt-009', run_id: 'run-019', rule_id: 'rule-022', domain_id: 'dom-005', subdomain_id: 'sub-013', asset_id: 'asset-023', alert_type: 'completeness', severity: 'medium', alert_status: 'resolved', alert_message: '7.2% null phone numbers in customers (threshold: 5%)', notification_channel: 'email', created_at: ago(6), resolved_at: ago(5), rule_name: 'Completeness: customers.phone', rule_description: 'customers.phone null rate must be < 5%', rule_type: 'null_check', sf_database_name: 'customer_360', sf_schema_name: 'public', sf_table_name: 'customers', asset_name: 'customers', domain_name: 'Customer', subdomain_name: 'Customer Profile' },
  { alert_id: 'alt-010', run_id: 'run-020', rule_id: 'rule-015', domain_id: 'dom-002', subdomain_id: 'sub-005', asset_id: 'asset-019', alert_type: 'validity', severity: 'high', alert_status: 'resolved', alert_message: '9 AP_INVOICES with negative amount values', notification_channel: 'slack', created_at: ago(7), resolved_at: ago(6), rule_name: 'AP_INVOICES: no negative amounts', rule_description: 'AP_INVOICES.invoice_amount must be >= 0', rule_type: 'range_check', sf_database_name: 'FINDB', sf_schema_name: 'FINANCE', sf_table_name: 'AP_INVOICES', asset_name: 'AP_INVOICES', domain_name: 'Finance', subdomain_name: 'Accounts Payable' },
]

export const DEMO_ALERT_DEFINITIONS = [
  { definition_id: 'adef-001', name: 'Freshness: FINANCE_TRANSACTIONS', condition_type: 'freshness', threshold: 24, enabled: true, notification_channels: ['email', 'slack'], connection_id: 'demo-conn-005', asset_id: 'asset-018', created_at: ago(90) },
  { definition_id: 'adef-002', name: 'Volume Drop: SALES_ORDERS',      condition_type: 'volume',    threshold: 10, enabled: true, notification_channels: ['slack'],           connection_id: 'demo-conn-001', asset_id: 'asset-001', created_at: ago(90) },
  { definition_id: 'adef-003', name: 'Null Rate: customers.email',      condition_type: 'null_rate', threshold: 2,  enabled: true, notification_channels: ['email'],           connection_id: 'demo-conn-003', asset_id: 'asset-023', created_at: ago(90) },
  { definition_id: 'adef-004', name: 'Uniqueness: dim_customer.key',    condition_type: 'uniqueness',threshold: 0,  enabled: true, notification_channels: ['slack'],           connection_id: 'demo-conn-004', asset_id: 'asset-030', created_at: ago(90) },
  { definition_id: 'adef-005', name: 'CPC Range: ad_spend',             condition_type: 'range',     threshold: 50, enabled: true, notification_channels: ['slack'],           connection_id: 'demo-conn-002', asset_id: 'asset-028', created_at: ago(90) },
  { definition_id: 'adef-006', name: 'Completeness: WORK_ORDERS',       condition_type: 'null_rate', threshold: 5,  enabled: true, notification_channels: ['email'],           connection_id: 'demo-conn-006', asset_id: 'asset-033', created_at: ago(90) },
]

// ─────────────────────────── rules (already mapped to Rule type) ─────────────

export const DEMO_RULES = [
  // Snowflake Supply Chain (demo-conn-001)
  { id: 'rule-001', name: 'Freshness: SALES_ORDERS',           description: 'SALES_ORDERS must be refreshed within 12 h',  category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-001', tableName: 'SALES_ORDERS',           columnName: undefined, parameters: { hours: 12 },              enabled: true,  status: 'active', severity: 'critical', scope: 'generic', assetId: 'asset-001', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(120) },
  { id: 'rule-002', name: 'Uniqueness: SALES_ORDERS.ORDER_ID', description: 'ORDER_ID must be unique',                      category: 'uniqueness',    type: 'uniqueness_check',             connectionId: 'demo-conn-001', tableName: 'SALES_ORDERS',           columnName: 'ORDER_ID',           parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-001', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(120) },
  { id: 'rule-003', name: 'Freshness: INVENTORY',              description: 'INVENTORY must be refreshed within 12 h',      category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-001', tableName: 'INVENTORY',              columnName: undefined, parameters: { hours: 12 },              enabled: true,  status: 'active', severity: 'critical', scope: 'generic', assetId: 'asset-005', domainId: 'dom-003', subdomainId: 'sub-007', createdAt: ago(120) },
  { id: 'rule-004', name: 'Null: INVENTORY.QUANTITY_ON_HAND',  description: 'QUANTITY_ON_HAND must not be null',            category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-001', tableName: 'INVENTORY',              columnName: 'QUANTITY_ON_HAND',   parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-005', domainId: 'dom-003', subdomainId: 'sub-007', createdAt: ago(120) },
  { id: 'rule-005', name: 'Range: PRODUCTS.UNIT_PRICE',        description: 'UNIT_PRICE must be between 0.01 and 100000',   category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-001', tableName: 'PRODUCTS',               columnName: 'UNIT_PRICE',         parameters: { min: 0.01, max: 100000 }, enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-004', domainId: 'dom-001', subdomainId: 'sub-003', createdAt: ago(120) },
  { id: 'rule-006', name: 'Null: CUSTOMERS.CUSTOMER_NAME',     description: 'CUSTOMER_NAME must not be null',               category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-001', tableName: 'CUSTOMERS',              columnName: 'CUSTOMER_NAME',      parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-002', domainId: 'dom-001', subdomainId: 'sub-002', createdAt: ago(120) },
  { id: 'rule-007', name: 'FK: SALES_ORDERS → CUSTOMERS',      description: 'Every order must have a valid CUSTOMER_ID',   category: 'consistency',   type: 'referential_integrity_check',  connectionId: 'demo-conn-001', tableName: 'SALES_ORDERS',           columnName: 'CUSTOMER_ID',        parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-001', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(120) },
  { id: 'rule-008', name: 'Volume: SALES_ORDERS (daily min)',   description: 'At least 10 new SALES_ORDERS per day',         category: 'completeness',  type: 'volume_check',                 connectionId: 'demo-conn-001', tableName: 'SALES_ORDERS',           columnName: undefined, parameters: { min_rows: 10 },            enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-001', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(120) },
  // BigQuery Marketing (demo-conn-002)
  { id: 'rule-009', name: 'Freshness: campaigns',              description: 'campaigns table must refresh within 24 h',     category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-002', tableName: 'campaigns',              columnName: undefined, parameters: { hours: 24 },              enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-010', domainId: 'dom-004', subdomainId: 'sub-010', createdAt: ago(100) },
  { id: 'rule-010', name: 'Range: conversions.conversion_value', description: 'conversion_value must be >= 0',              category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-002', tableName: 'conversions',            columnName: 'conversion_value',   parameters: { min: 0 },                 enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-011', domainId: 'dom-004', subdomainId: 'sub-012', createdAt: ago(100) },
  { id: 'rule-011', name: 'Null: leads.email',                  description: 'leads.email must not be null',                category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-002', tableName: 'leads',                  columnName: 'email',              parameters: {},                          enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-012', domainId: 'dom-004', subdomainId: 'sub-011', createdAt: ago(100) },
  { id: 'rule-012', name: 'Range: ad_spend.cost_per_click',     description: 'CPC must be between $0 and $50',              category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-002', tableName: 'ad_spend',               columnName: 'cost_per_click',     parameters: { min: 0, max: 50 },        enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-013', domainId: 'dom-004', subdomainId: 'sub-010', createdAt: ago(100) },
  { id: 'rule-013', name: 'Uniqueness: campaigns.campaign_id',  description: 'campaign_id must be unique',                  category: 'uniqueness',    type: 'uniqueness_check',             connectionId: 'demo-conn-002', tableName: 'campaigns',              columnName: 'campaign_id',        parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-010', domainId: 'dom-004', subdomainId: 'sub-010', createdAt: ago(100) },
  // PostgreSQL Customer 360 (demo-conn-003)
  { id: 'rule-014', name: 'Email Format: customers.email',      description: 'customers.email must match RFC 5322',         category: 'validity',      type: 'regex_check',                  connectionId: 'demo-conn-003', tableName: 'customers',              columnName: 'email',              parameters: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }, enabled: true, status: 'active', severity: 'high', scope: 'generic', assetId: 'asset-023', domainId: 'dom-005', subdomainId: 'sub-013', createdAt: ago(110) },
  { id: 'rule-015', name: 'Null: orders.order_date',            description: 'orders.order_date must not be null',          category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-003', tableName: 'orders',                 columnName: 'order_date',         parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-024', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(110) },
  { id: 'rule-016', name: 'Volume: orders (daily)',              description: 'At least 5 new orders per day',               category: 'completeness',  type: 'volume_check',                 connectionId: 'demo-conn-003', tableName: 'orders',                 columnName: undefined, parameters: { min_rows: 5 },             enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-024', domainId: 'dom-001', subdomainId: 'sub-001', createdAt: ago(110) },
  { id: 'rule-017', name: 'FK: subscriptions → customers',      description: 'subscription.customer_id must reference customers', category: 'consistency', type: 'referential_integrity_check', connectionId: 'demo-conn-003', tableName: 'subscriptions',         columnName: 'customer_id',        parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-026', domainId: 'dom-005', subdomainId: 'sub-013', createdAt: ago(110) },
  // Redshift Enterprise DW (demo-conn-004)
  { id: 'rule-018', name: 'Uniqueness: dim_customer.customer_key', description: 'customer_key must be unique in dim_customer', category: 'uniqueness',  type: 'uniqueness_check',             connectionId: 'demo-conn-004', tableName: 'dim_customer',           columnName: 'customer_key',       parameters: {},                          enabled: true,  status: 'active', severity: 'critical', scope: 'generic', assetId: 'asset-030', domainId: 'dom-005', subdomainId: 'sub-013', createdAt: ago(115) },
  { id: 'rule-019', name: 'Freshness: fact_sales',               description: 'fact_sales must refresh within 24 h',         category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-004', tableName: 'fact_sales',             columnName: undefined, parameters: { hours: 24 },              enabled: true,  status: 'active', severity: 'critical', scope: 'generic', assetId: 'asset-029', domainId: 'dom-007', subdomainId: 'sub-017', createdAt: ago(115) },
  { id: 'rule-020', name: 'Null: fact_sales.revenue',            description: 'revenue must not be null in fact_sales',      category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-004', tableName: 'fact_sales',             columnName: 'revenue',            parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-029', domainId: 'dom-007', subdomainId: 'sub-017', createdAt: ago(115) },
  { id: 'rule-021', name: 'Range: fact_sales.discount_pct',      description: 'discount_pct must be between 0 and 100',      category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-004', tableName: 'fact_sales',             columnName: 'discount_pct',       parameters: { min: 0, max: 100 },       enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-029', domainId: 'dom-007', subdomainId: 'sub-017', createdAt: ago(115) },
  // Oracle Financials (demo-conn-005)
  { id: 'rule-022', name: 'Freshness: FINANCE_TRANSACTIONS',     description: 'FINANCE_TRANSACTIONS must refresh daily',     category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-005', tableName: 'FINANCE_TRANSACTIONS',   columnName: undefined, parameters: { hours: 24 },              enabled: true,  status: 'active', severity: 'critical', scope: 'generic', assetId: 'asset-018', domainId: 'dom-002', subdomainId: 'sub-004', createdAt: ago(90) },
  { id: 'rule-023', name: 'Range: AP_INVOICES.invoice_amount',   description: 'invoice_amount must be >= 0',                 category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-005', tableName: 'AP_INVOICES',            columnName: 'invoice_amount',     parameters: { min: 0 },                 enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-019', domainId: 'dom-002', subdomainId: 'sub-005', createdAt: ago(90) },
  { id: 'rule-024', name: 'Null: GL_ACCOUNTS.account_code',      description: 'account_code must not be null',               category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-005', tableName: 'GL_ACCOUNTS',            columnName: 'account_code',       parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-017', domainId: 'dom-002', subdomainId: 'sub-004', createdAt: ago(90) },
  { id: 'rule-025', name: 'Uniqueness: GL_ACCOUNTS.account_id',  description: 'account_id must be unique',                   category: 'uniqueness',    type: 'uniqueness_check',             connectionId: 'demo-conn-005', tableName: 'GL_ACCOUNTS',            columnName: 'account_id',         parameters: {},                          enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-017', domainId: 'dom-002', subdomainId: 'sub-004', createdAt: ago(90) },
  // Oracle Manufacturing (demo-conn-006)
  { id: 'rule-026', name: 'Null: WORK_ORDERS.completion_date',   description: 'No more than 5% null completion_date',        category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-006', tableName: 'WORK_ORDERS',            columnName: 'completion_date',    parameters: { max_null_pct: 5 },        enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-033', domainId: 'dom-006', subdomainId: 'sub-015', createdAt: ago(80) },
  { id: 'rule-027', name: 'Range: QUALITY_INSPECTIONS.score',    description: 'Quality inspection score must be 0-100',      category: 'validity',      type: 'range_check',                  connectionId: 'demo-conn-006', tableName: 'QUALITY_INSPECTIONS',    columnName: 'score',              parameters: { min: 0, max: 100 },       enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-035', domainId: 'dom-006', subdomainId: 'sub-016', createdAt: ago(80) },
  { id: 'rule-028', name: 'FK: WORK_ORDERS → BOM',               description: 'WORK_ORDER must reference a valid BOM item',  category: 'consistency',   type: 'referential_integrity_check',  connectionId: 'demo-conn-006', tableName: 'WORK_ORDERS',            columnName: 'bom_id',             parameters: {},                          enabled: true,  status: 'active', severity: 'medium',   scope: 'generic', assetId: 'asset-033', domainId: 'dom-006', subdomainId: 'sub-015', createdAt: ago(80) },
  { id: 'rule-029', name: 'Freshness: PRODUCTION_SCHEDULES',     description: 'PRODUCTION_SCHEDULES must refresh within 8 h',category: 'timeliness',    type: 'freshness_check',              connectionId: 'demo-conn-006', tableName: 'PRODUCTION_SCHEDULES',   columnName: undefined, parameters: { hours: 8 },               enabled: true,  status: 'active', severity: 'high',     scope: 'generic', assetId: 'asset-034', domainId: 'dom-006', subdomainId: 'sub-015', createdAt: ago(80) },
  { id: 'rule-030', name: 'Null: BOM.component_code',            description: 'BOM component_code must not be null',         category: 'completeness',  type: 'null_check',                   connectionId: 'demo-conn-006', tableName: 'BOM',                    columnName: 'component_code',     parameters: {},                          enabled: true,  status: 'draft',  severity: 'medium',   scope: 'generic', assetId: 'asset-034', domainId: 'dom-006', subdomainId: 'sub-015', createdAt: ago(14) },
]

// ─────────────────────────── anomalies ──────────────────────────────────────

export const DEMO_ANOMALIES = [
  { anomaly_id: 'anom-001', connection_id: 'demo-conn-001', asset_id: 'asset-001', table_name: 'SALES_ORDERS',         column_name: 'ORDER_AMOUNT',   anomaly_type: 'statistical_outlier', severity: 'high',   detected_at: ago(1),   description: 'ORDER_AMOUNT spike: 3.8σ above 30-day mean ($14,200 vs avg $4,100)', status: 'open' },
  { anomaly_id: 'anom-002', connection_id: 'demo-conn-001', asset_id: 'asset-005', table_name: 'INVENTORY',           column_name: 'QUANTITY_ON_HAND',anomaly_type: 'volume_anomaly',      severity: 'critical',detected_at: ago(1, 4),description: 'INVENTORY row count dropped 42% overnight (expected: ~120k, actual: ~69k)', status: 'open' },
  { anomaly_id: 'anom-003', connection_id: 'demo-conn-002', asset_id: 'asset-013', table_name: 'ad_spend',            column_name: 'cost_per_click',  anomaly_type: 'statistical_outlier', severity: 'high',   detected_at: ago(3),   description: 'CPC values up to $487 detected — 9.7σ above 30-day mean ($7.80)', status: 'open' },
  { anomaly_id: 'anom-004', connection_id: 'demo-conn-003', asset_id: 'asset-024', table_name: 'orders',              column_name: 'total_amount',    anomaly_type: 'distribution_shift',  severity: 'medium', detected_at: ago(2),   description: 'order total_amount distribution shifted left vs last 7-day window', status: 'acknowledged' },
  { anomaly_id: 'anom-005', connection_id: 'demo-conn-004', asset_id: 'asset-029', table_name: 'fact_sales',          column_name: 'revenue',         anomaly_type: 'schema_drift',        severity: 'medium', detected_at: ago(4),   description: 'New nullable column discount_code added to fact_sales without notification', status: 'resolved' },
  { anomaly_id: 'anom-006', connection_id: 'demo-conn-005', asset_id: 'asset-018', table_name: 'FINANCE_TRANSACTIONS',column_name: 'transaction_amount',anomaly_type:'freshness_anomaly',   severity: 'critical',detected_at: ago(1, 2),description: 'FINANCE_TRANSACTIONS last_updated is 28 hours ago (expected: ≤ 24 h)', status: 'open' },
  { anomaly_id: 'anom-007', connection_id: 'demo-conn-006', asset_id: 'asset-035', table_name: 'QUALITY_INSPECTIONS', column_name: 'defect_rate',     anomaly_type: 'statistical_outlier', severity: 'high',   detected_at: ago(0, 6),description: 'defect_rate at 8.3% — 2.9σ above 60-day mean (2.1%)', status: 'open' },
]

// ─────────────────────────── issues ─────────────────────────────────────────

export const DEMO_ISSUES = [
  { issue_id: 'iss-001', title: 'Stale INVENTORY data blocking replenishment decisions', description: 'INVENTORY not refreshing within SLA; 3 purchase orders may be miscalculated.', status: 'open',       priority: 'critical', assigned_to: 'james.okonkwo@corp.com', asset_id: 'asset-005', connection_id: 'demo-conn-001', created_at: ago(1),  updated_at: ago(0, 2) },
  { issue_id: 'iss-002', title: 'Invalid email addresses in customers table',            description: '312 customers have emails that fail RFC 5322 validation, breaking downstream CRM sync.', status: 'in_progress', priority: 'high', assigned_to: 'arun.patel@corp.com', asset_id: 'asset-023', connection_id: 'demo-conn-003', created_at: ago(2),  updated_at: ago(1) },
  { issue_id: 'iss-003', title: 'Orphaned SALES_ORDERS referencing deleted customers',  description: '4 orders reference CUSTOMER_ID values that no longer exist in the CUSTOMERS table.', status: 'open', priority: 'high', assigned_to: 'priya.sharma@corp.com', asset_id: 'asset-001', connection_id: 'demo-conn-001', created_at: ago(1), updated_at: ago(1) },
  { issue_id: 'iss-004', title: 'FINANCE_TRANSACTIONS freshness SLA breach',            description: 'Finance daily batch failed; transactions table is 28 h stale, violating SOX data freshness controls.', status: 'open', priority: 'critical', assigned_to: 'michael.chen@corp.com', asset_id: 'asset-018', connection_id: 'demo-conn-005', created_at: ago(1, 4), updated_at: ago(0, 4) },
  { issue_id: 'iss-005', title: 'CPC anomaly in ad_spend — potential billing error',    description: 'cost_per_click values up to $487 detected; likely data pipeline bug from ad platform API.', status: 'in_progress', priority: 'high', assigned_to: 'sofia.delgado@corp.com', asset_id: 'asset-013', connection_id: 'demo-conn-002', created_at: ago(3), updated_at: ago(2) },
  { issue_id: 'iss-006', title: 'Duplicate customer_key in dim_customer',               description: '23 duplicate surrogate keys found in dim_customer after recent ETL change.', status: 'resolved', priority: 'high', assigned_to: 'david.park@corp.com', asset_id: 'asset-030', connection_id: 'demo-conn-004', created_at: ago(5), updated_at: ago(4) },
  { issue_id: 'iss-007', title: 'WORK_ORDERS missing completion_date (18%)',            description: 'Completion date column is not being populated for a subset of work orders since the v3.2 manufacturing system upgrade.', status: 'open', priority: 'medium', assigned_to: 'elena.kowalski@corp.com', asset_id: 'asset-033', connection_id: 'demo-conn-006', created_at: ago(1, 6), updated_at: ago(0, 8) },
  { issue_id: 'iss-008', title: 'AP_INVOICES negative amounts — data entry error',      description: '9 invoice records have negative amounts, indicating a data entry or system bug in the AP module.', status: 'resolved', priority: 'high', assigned_to: 'michael.chen@corp.com', asset_id: 'asset-019', connection_id: 'demo-conn-005', created_at: ago(7), updated_at: ago(6) },
]

// ─────────────────────────── contracts / SLAs ───────────────────────────────

export const DEMO_CONTRACTS = [
  { contract_id: 'con-001', contract_name: 'SALES_ORDERS Data Contract',      owner: 'priya.sharma@corp.com', consumer: 'Finance Team',           connection_id: 'demo-conn-001', asset_id: 'asset-001', status: 'active',  version: '2.1', sla_hours: 12, description: 'SALES_ORDERS must be fresh within 12 h and maintain >99% completeness', created_at: ago(90), updated_at: ago(30) },
  { contract_id: 'con-002', contract_name: 'FINANCE_TRANSACTIONS SLA',        owner: 'michael.chen@corp.com', consumer: 'CFO Office',             connection_id: 'demo-conn-005', asset_id: 'asset-018', status: 'breached',version: '1.3', sla_hours: 24, description: 'Finance transactions must be available by 06:00 UTC daily for SOX reporting', created_at: ago(180), updated_at: ago(1) },
  { contract_id: 'con-003', contract_name: 'Customer 360 Data Contract',      owner: 'arun.patel@corp.com',   consumer: 'CRM Platform',           connection_id: 'demo-conn-003', asset_id: 'asset-023', status: 'active',  version: '3.0', sla_hours: 6,  description: 'customers table must maintain <1% null emails and sync within 6 h', created_at: ago(120), updated_at: ago(14) },
  { contract_id: 'con-004', contract_name: 'Marketing Attribution Contract',  owner: 'sofia.delgado@corp.com',consumer: 'Growth Team',            connection_id: 'demo-conn-002', asset_id: 'asset-011', status: 'active',  version: '1.0', sla_hours: 48, description: 'Attribution data refreshed within 48 h post campaign period close', created_at: ago(60), updated_at: ago(7) },
  { contract_id: 'con-005', contract_name: 'Enterprise DW fact_sales SLA',   owner: 'david.park@corp.com',   consumer: 'Executive Reporting',    connection_id: 'demo-conn-004', asset_id: 'asset-029', status: 'active',  version: '2.0', sla_hours: 24, description: 'fact_sales must be fully loaded by 07:00 UTC for daily executive dashboards', created_at: ago(150), updated_at: ago(21) },
  { contract_id: 'con-006', contract_name: 'Inventory Data SLA',             owner: 'james.okonkwo@corp.com',consumer: 'Supply Chain Planning',  connection_id: 'demo-conn-001', asset_id: 'asset-005', status: 'at_risk', version: '1.5', sla_hours: 12, description: 'INVENTORY data must be current within 12 h to support replenishment algorithms', created_at: ago(100), updated_at: ago(1) },
]

// ─────────────────────────── scan jobs / run history ────────────────────────

export const DEMO_SCAN_JOBS = [
  { job_id: 'job-001', job_name: 'Supply Chain Daily Scan',       connection_id: 'demo-conn-001', schedule: '0 6 * * *',  status: 'active',   last_run_at: ago(0, 6),  next_run_at: ago(-18), rule_count: 32, asset_count: 6,  description: 'Daily rule evaluation for Supply Chain assets', created_at: ago(180) },
  { job_id: 'job-002', job_name: 'Marketing Analytics Scan',      connection_id: 'demo-conn-002', schedule: '0 4 * * *',  status: 'active',   last_run_at: ago(0, 8),  next_run_at: ago(-16), rule_count: 18, asset_count: 5,  description: 'Daily scan for BigQuery marketing data quality', created_at: ago(180) },
  { job_id: 'job-003', job_name: 'Customer 360 Hourly Check',     connection_id: 'demo-conn-003', schedule: '0 * * * *',  status: 'active',   last_run_at: ago(0, 1),  next_run_at: ago(-1),  rule_count: 21, asset_count: 5,  description: 'Hourly freshness and completeness checks', created_at: ago(120) },
  { job_id: 'job-004', job_name: 'Enterprise DW Quality Scan',    connection_id: 'demo-conn-004', schedule: '30 7 * * *', status: 'active',   last_run_at: ago(0, 5),  next_run_at: ago(-19), rule_count: 12, asset_count: 3,  description: 'Daily DW fact and dimension quality check', created_at: ago(150) },
  { job_id: 'job-005', job_name: 'Oracle Financials Daily Scan',  connection_id: 'demo-conn-005', schedule: '0 5 * * *',  status: 'failed',   last_run_at: ago(1, 2),  next_run_at: ago(-7),  rule_count: 28, asset_count: 6,  description: 'Daily Oracle Financials quality and freshness scan', created_at: ago(90) },
  { job_id: 'job-006', job_name: 'Manufacturing Quality Scan',    connection_id: 'demo-conn-006', schedule: '0 3 * * *',  status: 'active',   last_run_at: ago(0, 9),  next_run_at: ago(-15), rule_count: 14, asset_count: 4,  description: 'Daily manufacturing data quality scan', created_at: ago(80) },
  { job_id: 'job-007', job_name: 'Weekly Full Profiling Run',     connection_id: 'demo-conn-001', schedule: '0 1 * * 0',  status: 'active',   last_run_at: ago(6),     next_run_at: ago(-1),  rule_count: 80, asset_count: 38, description: 'Full cross-connection profiling every Sunday', created_at: ago(180) },
]

export const DEMO_RUN_HISTORY = [
  { run_id: 'run-001', job_id: 'job-001', connection_id: 'demo-conn-001', status: 'success', started_at: ago(0, 6),  completed_at: ago(0, 5),  rules_run: 32, rules_passed: 30, rules_failed: 2,  assets_scanned: 6,  duration_seconds: 187 },
  { run_id: 'run-002', job_id: 'job-002', connection_id: 'demo-conn-002', status: 'success', started_at: ago(0, 8),  completed_at: ago(0, 7),  rules_run: 18, rules_passed: 17, rules_failed: 1,  assets_scanned: 5,  duration_seconds: 142 },
  { run_id: 'run-003', job_id: 'job-003', connection_id: 'demo-conn-003', status: 'success', started_at: ago(0, 1),  completed_at: ago(0, 1),  rules_run: 21, rules_passed: 19, rules_failed: 2,  assets_scanned: 5,  duration_seconds: 95 },
  { run_id: 'run-004', job_id: 'job-004', connection_id: 'demo-conn-004', status: 'success', started_at: ago(0, 5),  completed_at: ago(0, 4),  rules_run: 12, rules_passed: 12, rules_failed: 0,  assets_scanned: 3,  duration_seconds: 118 },
  { run_id: 'run-005', job_id: 'job-005', connection_id: 'demo-conn-005', status: 'failed',  started_at: ago(1, 2),  completed_at: ago(1, 2),  rules_run: 0,  rules_passed: 0,  rules_failed: 0,  assets_scanned: 0,  duration_seconds: 8,   error_message: 'Connection timeout after 8s — ORA-12170' },
  { run_id: 'run-006', job_id: 'job-006', connection_id: 'demo-conn-006', status: 'success', started_at: ago(0, 9),  completed_at: ago(0, 8),  rules_run: 14, rules_passed: 12, rules_failed: 2,  assets_scanned: 4,  duration_seconds: 204 },
  { run_id: 'run-007', job_id: 'job-001', connection_id: 'demo-conn-001', status: 'success', started_at: ago(1, 6),  completed_at: ago(1, 5),  rules_run: 32, rules_passed: 29, rules_failed: 3,  assets_scanned: 6,  duration_seconds: 195 },
  { run_id: 'run-008', job_id: 'job-002', connection_id: 'demo-conn-002', status: 'success', started_at: ago(1, 8),  completed_at: ago(1, 7),  rules_run: 18, rules_passed: 18, rules_failed: 0,  assets_scanned: 5,  duration_seconds: 139 },
  { run_id: 'run-009', job_id: 'job-005', connection_id: 'demo-conn-005', status: 'success', started_at: ago(2, 2),  completed_at: ago(2, 1),  rules_run: 28, rules_passed: 25, rules_failed: 3,  assets_scanned: 6,  duration_seconds: 321 },
  { run_id: 'run-010', job_id: 'job-007', connection_id: 'demo-conn-001', status: 'success', started_at: ago(6),     completed_at: ago(6),     rules_run: 80, rules_passed: 73, rules_failed: 7,  assets_scanned: 38, duration_seconds: 1842 },
]

// ─────────────────────────── schedules ──────────────────────────────────────

export const DEMO_SCHEDULES = [
  { schedule_id: 'sch-001', schedule_name: 'Supply Chain — 6 AM Daily', connection_id: 'demo-conn-001', job_id: 'job-001', cron_expression: '0 6 * * *', enabled: true,  last_run_status: 'success', last_run_at: ago(0, 6), created_at: ago(180) },
  { schedule_id: 'sch-002', schedule_name: 'Marketing — 4 AM Daily',    connection_id: 'demo-conn-002', job_id: 'job-002', cron_expression: '0 4 * * *', enabled: true,  last_run_status: 'success', last_run_at: ago(0, 8), created_at: ago(180) },
  { schedule_id: 'sch-003', schedule_name: 'Customer 360 — Hourly',     connection_id: 'demo-conn-003', job_id: 'job-003', cron_expression: '0 * * * *', enabled: true,  last_run_status: 'success', last_run_at: ago(0, 1), created_at: ago(120) },
  { schedule_id: 'sch-004', schedule_name: 'Enterprise DW — 7:30 AM',   connection_id: 'demo-conn-004', job_id: 'job-004', cron_expression: '30 7 * * *',enabled: true,  last_run_status: 'success', last_run_at: ago(0, 5), created_at: ago(150) },
  { schedule_id: 'sch-005', schedule_name: 'Oracle Financials — 5 AM',  connection_id: 'demo-conn-005', job_id: 'job-005', cron_expression: '0 5 * * *', enabled: false, last_run_status: 'failed',  last_run_at: ago(1, 2), created_at: ago(90) },
  { schedule_id: 'sch-006', schedule_name: 'Manufacturing — 3 AM Daily',connection_id: 'demo-conn-006', job_id: 'job-006', cron_expression: '0 3 * * *', enabled: true,  last_run_status: 'success', last_run_at: ago(0, 9), created_at: ago(80) },
  { schedule_id: 'sch-007', schedule_name: 'Weekly Full Profile — Sun',  connection_id: 'demo-conn-001', job_id: 'job-007', cron_expression: '0 1 * * 0', enabled: true,  last_run_status: 'success', last_run_at: ago(6),    created_at: ago(180) },
]

// ─────────────────────────── compliance frameworks ──────────────────────────

export const DEMO_COMPLIANCE_FRAMEWORKS = [
  { framework_id: 'fw-001', framework_name: 'GDPR',           description: 'General Data Protection Regulation (EU 2016/679)', controls_count: 24, mapped_rules: 18, compliance_score: 82, last_assessed_at: ago(7),  status: 'in_progress' },
  { framework_id: 'fw-002', framework_name: 'CCPA',           description: 'California Consumer Privacy Act',                   controls_count: 12, mapped_rules: 10, compliance_score: 88, last_assessed_at: ago(14), status: 'compliant' },
  { framework_id: 'fw-003', framework_name: 'HIPAA',          description: 'Health Insurance Portability and Accountability Act', controls_count: 18, mapped_rules: 8,  compliance_score: 74, last_assessed_at: ago(21), status: 'at_risk' },
  { framework_id: 'fw-004', framework_name: 'SOX',            description: 'Sarbanes-Oxley Act — financial data controls',      controls_count: 20, mapped_rules: 14, compliance_score: 79, last_assessed_at: ago(3),  status: 'in_progress' },
  { framework_id: 'fw-005', framework_name: 'BCBS 239',       description: 'Principles for effective risk data aggregation',    controls_count: 14, mapped_rules: 12, compliance_score: 85, last_assessed_at: ago(30), status: 'compliant' },
  { framework_id: 'fw-006', framework_name: 'ISO 27001',      description: 'Information security management systems',           controls_count: 30, mapped_rules: 21, compliance_score: 91, last_assessed_at: ago(10), status: 'compliant' },
  { framework_id: 'fw-007', framework_name: 'SOC 2 Type II',  description: 'Service Organization Control 2 Type II',            controls_count: 16, mapped_rules: 13, compliance_score: 87, last_assessed_at: ago(45), status: 'compliant' },
  { framework_id: 'fw-008', framework_name: 'ISO 27701',      description: 'Privacy information management extension to ISO 27001', controls_count: 22, mapped_rules: 15, compliance_score: 80, last_assessed_at: ago(60), status: 'in_progress' },
  { framework_id: 'fw-009', framework_name: 'NIST CSF',       description: 'NIST Cybersecurity Framework',                      controls_count: 28, mapped_rules: 20, compliance_score: 83, last_assessed_at: ago(20), status: 'in_progress' },
  { framework_id: 'fw-010', framework_name: 'PCI DSS',        description: 'Payment Card Industry Data Security Standard',      controls_count: 26, mapped_rules: 16, compliance_score: 76, last_assessed_at: ago(15), status: 'at_risk' },
  { framework_id: 'fw-011', framework_name: 'HITRUST CSF',    description: 'HITRUST Common Security Framework',                 controls_count: 19, mapped_rules: 11, compliance_score: 71, last_assessed_at: ago(90), status: 'at_risk' },
  { framework_id: 'fw-012', framework_name: 'CIS Controls',   description: 'Center for Internet Security Critical Controls',    controls_count: 18, mapped_rules: 9,  compliance_score: 89, last_assessed_at: ago(25), status: 'compliant' },
  { framework_id: 'fw-013', framework_name: 'NIST 800-53',    description: 'Security and Privacy Controls for Information Systems', controls_count: 35, mapped_rules: 22, compliance_score: 84, last_assessed_at: ago(35), status: 'in_progress' },
]

// ─────────────────────────── governance policies & violations ───────────────

export const DEMO_GOVERNANCE_POLICIES = [
  { policy_id: 'pol-001', policy_name: 'PII Data Masking Policy',           description: 'All PII columns must be masked in non-production environments', status: 'active',  version: '1.2', owner: 'admin@corp.com',         entity_types: ['column'], created_at: ago(180), updated_at: ago(30) },
  { policy_id: 'pol-002', policy_name: 'Data Retention Policy',             description: 'Customer data must not be retained beyond 7 years post contract end', status: 'active', version: '2.0', owner: 'arun.patel@corp.com', entity_types: ['table'], created_at: ago(180), updated_at: ago(60) },
  { policy_id: 'pol-003', policy_name: 'Financial Data Access Policy',      description: 'Finance tables require explicit domain-owner approval for access', status: 'active',  version: '1.0', owner: 'michael.chen@corp.com',  entity_types: ['table', 'column'], created_at: ago(120), updated_at: ago(14) },
  { policy_id: 'pol-004', policy_name: 'Data Quality SLA Policy',           description: 'All production assets must have at least one freshness rule and one completeness rule', status: 'active', version: '1.1', owner: 'admin@corp.com', entity_types: ['table'], created_at: ago(90), updated_at: ago(7) },
  { policy_id: 'pol-005', policy_name: 'Cross-Border Data Transfer Policy', description: 'EU personal data must not be transferred outside the EEA without explicit consent', status: 'draft',   version: '0.9', owner: 'admin@corp.com',         entity_types: ['table'], created_at: ago(14), updated_at: ago(2) },
  { policy_id: 'pol-006', policy_name: 'Data Product Ownership Policy',     description: 'Every published data product must have a named owner and a data contract', status: 'active',  version: '1.0', owner: 'priya.sharma@corp.com',  entity_types: ['data_product'], created_at: ago(60), updated_at: ago(5) },
]

export const DEMO_GOVERNANCE_VIOLATIONS = [
  { violation_id: 'vio-001', policy_id: 'pol-001', policy_name: 'PII Data Masking Policy',      entity_type: 'column', entity_id: 'asset-023.email',   description: 'customers.email exposed unmasked in staging environment', severity: 'high',   status: 'open',     detected_at: ago(3), resolved_at: null },
  { violation_id: 'vio-002', policy_id: 'pol-004', policy_name: 'Data Quality SLA Policy',      entity_type: 'table',  entity_id: 'asset-030',          description: 'dim_customer missing completeness rule — policy requires at least one', severity: 'medium', status: 'open',     detected_at: ago(5), resolved_at: null },
  { violation_id: 'vio-003', policy_id: 'pol-003', policy_name: 'Financial Data Access Policy', entity_type: 'table',  entity_id: 'asset-019',          description: 'AP_INVOICES accessed by service account without domain-owner approval', severity: 'high',   status: 'in_review',detected_at: ago(7), resolved_at: null },
  { violation_id: 'vio-004', policy_id: 'pol-002', policy_name: 'Data Retention Policy',        entity_type: 'table',  entity_id: 'asset-026',          description: 'subscriptions table contains records older than 7-year retention window', severity: 'medium', status: 'open',     detected_at: ago(10), resolved_at: null },
  { violation_id: 'vio-005', policy_id: 'pol-006', policy_name: 'Data Product Ownership Policy',entity_type: 'data_product', entity_id: 'dp-003',       description: 'Customer Insights data product has no named owner', severity: 'medium', status: 'resolved', detected_at: ago(14), resolved_at: ago(12) },
]

// ─────────────────────────── data products ──────────────────────────────────

export const DEMO_DATA_PRODUCTS = [
  { data_product_id: 'dp-001', name: 'Revenue Analytics Product',   description: 'Certified revenue and order metrics for executive reporting', owner: 'priya.sharma@corp.com', status: 'published',  quality_score: 91, asset_ids: ['asset-001', 'asset-002', 'asset-029'], tags: ['Certified', 'Critical'], created_at: ago(90), updated_at: ago(7) },
  { data_product_id: 'dp-002', name: 'Marketing Attribution Suite', description: 'Multi-touch attribution and campaign ROI data product', owner: 'sofia.delgado@corp.com', status: 'published',  quality_score: 88, asset_ids: ['asset-011', 'asset-013'], tags: ['Marketing', 'Certified'], created_at: ago(60), updated_at: ago(14) },
  { data_product_id: 'dp-003', name: 'Customer 360 Profile',        description: 'Unified customer profile with purchase history and preferences', owner: 'arun.patel@corp.com', status: 'published', quality_score: 84, asset_ids: ['asset-023', 'asset-024', 'asset-026'], tags: ['PII', 'GDPR', 'Certified'], created_at: ago(120), updated_at: ago(21) },
  { data_product_id: 'dp-004', name: 'Finance Reporting Package',   description: 'GL, AP/AR and budget data for regulatory and management reporting', owner: 'michael.chen@corp.com', status: 'published', quality_score: 79, asset_ids: ['asset-017', 'asset-018', 'asset-019'], tags: ['Finance', 'Critical', 'SOX'], created_at: ago(150), updated_at: ago(1) },
  { data_product_id: 'dp-005', name: 'Supply Chain Dashboard Data', description: 'Inventory, orders and supplier metrics for operations planning', owner: 'james.okonkwo@corp.com', status: 'draft', quality_score: 73, asset_ids: ['asset-005', 'asset-006', 'asset-001'], tags: ['Operational'], created_at: ago(30), updated_at: ago(3) },
]

// ─────────────────────────── glossary ───────────────────────────────────────

export const DEMO_GLOSSARY = [
  { term_id: 'gls-001', term_name: 'Customer Lifetime Value', definition: 'Total net revenue from a customer over the entire relationship period, typically calculated as CLV = ARPU × Gross Margin × Average Customer Lifespan.', domain_id: 'dom-001', domain_name: 'Revenue', synonyms: 'CLV, LTV', status: 'approved', owner: 'priya.sharma@corp.com', created_at: ago(120) },
  { term_id: 'gls-002', term_name: 'Average Revenue Per User', definition: 'Total revenue divided by number of active users in a given period. ARPU = Revenue / Active Users.', domain_id: 'dom-001', domain_name: 'Revenue', synonyms: 'ARPU', status: 'approved', owner: 'priya.sharma@corp.com', created_at: ago(120) },
  { term_id: 'gls-003', term_name: 'Days Sales Outstanding', definition: 'Average number of days taken to collect payment after a sale. DSO = (AR Balance / Total Credit Sales) × Days.', domain_id: 'dom-002', domain_name: 'Finance', synonyms: 'DSO, debtor days', status: 'approved', owner: 'michael.chen@corp.com', created_at: ago(100) },
  { term_id: 'gls-004', term_name: 'Inventory Turnover', definition: 'Number of times inventory is sold and replaced over a period. Turnover = COGS / Average Inventory Value.', domain_id: 'dom-003', domain_name: 'Operations', synonyms: 'stock turnover', status: 'approved', owner: 'james.okonkwo@corp.com', created_at: ago(100) },
  { term_id: 'gls-005', term_name: 'Cost Per Acquisition', definition: 'Total marketing spend divided by the number of new customers acquired in a period. CPA = Spend / New Customers.', domain_id: 'dom-004', domain_name: 'Marketing', synonyms: 'CPA, cost per lead', status: 'approved', owner: 'sofia.delgado@corp.com', created_at: ago(90) },
  { term_id: 'gls-006', term_name: 'Net Promoter Score', definition: 'Customer loyalty metric derived from responses to "How likely are you to recommend us?" NPS = % Promoters − % Detractors.', domain_id: 'dom-005', domain_name: 'Customer', synonyms: 'NPS', status: 'approved', owner: 'arun.patel@corp.com', created_at: ago(90) },
  { term_id: 'gls-007', term_name: 'Personally Identifiable Information', definition: 'Any data that could potentially identify a specific individual, including name, email, phone number, SSN, IP address, and biometric data.', domain_id: 'dom-005', domain_name: 'Customer', synonyms: 'PII, personal data', status: 'approved', owner: 'admin@corp.com', created_at: ago(180) },
  { term_id: 'gls-008', term_name: 'Churn Rate', definition: 'Percentage of subscribers who discontinue their subscription in a given time period. Churn = Lost Customers / Customers at Start of Period.', domain_id: 'dom-001', domain_name: 'Revenue', synonyms: 'attrition rate', status: 'approved', owner: 'priya.sharma@corp.com', created_at: ago(80) },
  { term_id: 'gls-009', term_name: 'First-Party Data', definition: 'Data collected directly from customers and prospects through owned channels (website, app, CRM) with explicit consent.', domain_id: 'dom-005', domain_name: 'Customer', synonyms: '1P data', status: 'approved', owner: 'arun.patel@corp.com', created_at: ago(70) },
  { term_id: 'gls-010', term_name: 'Return on Ad Spend', definition: 'Revenue generated per dollar of advertising spend. ROAS = Revenue from Ads / Cost of Ads.', domain_id: 'dom-004', domain_name: 'Marketing', synonyms: 'ROAS', status: 'approved', owner: 'sofia.delgado@corp.com', created_at: ago(70) },
  { term_id: 'gls-011', term_name: 'General Ledger Account', definition: 'A complete record of all financial transactions within an organisation, used to prepare financial statements. Each account tracks debits and credits.', domain_id: 'dom-002', domain_name: 'Finance', synonyms: 'GL account, chart of accounts entry', status: 'approved', owner: 'michael.chen@corp.com', created_at: ago(60) },
  { term_id: 'gls-012', term_name: 'Work Order', definition: 'An authorisation to perform work or provide services, detailing the job, materials required, instructions, and estimated cost.', domain_id: 'dom-006', domain_name: 'Manufacturing', synonyms: 'WO, job order', status: 'approved', owner: 'elena.kowalski@corp.com', created_at: ago(60) },
  { term_id: 'gls-013', term_name: 'Bill of Materials', definition: 'A comprehensive list of raw materials, components, and assemblies required to manufacture a product, with quantities.', domain_id: 'dom-006', domain_name: 'Manufacturing', synonyms: 'BOM', status: 'approved', owner: 'elena.kowalski@corp.com', created_at: ago(60) },
  { term_id: 'gls-014', term_name: 'Data Contract', definition: 'A formal agreement between a data producer and consumer that specifies schema, SLAs, quality expectations, and ownership.', domain_id: 'dom-007', domain_name: 'Data Warehouse', synonyms: 'data SLA', status: 'approved', owner: 'david.park@corp.com', created_at: ago(45) },
  { term_id: 'gls-015', term_name: 'Surrogate Key', definition: 'A system-generated unique identifier assigned to a record in a data warehouse dimension table, independent of the source system natural key.', domain_id: 'dom-007', domain_name: 'Data Warehouse', synonyms: 'synthetic key, DW key', status: 'draft', owner: 'david.park@corp.com', created_at: ago(14) },
]

// ─────────────────────────── incidents ──────────────────────────────────────

export const DEMO_INCIDENTS = [
  { incident_id: 'inc-001', title: 'Finance batch pipeline failure — FINANCE_TRANSACTIONS stale 28h', description: 'Oracle Financials ETL job failed to connect due to ORA-12170 timeout. FINANCE_TRANSACTIONS table is 28 hours stale, breaching SOX daily freshness requirement.', status: 'open',          severity: 'critical', affected_assets: ['asset-018'], connection_id: 'demo-conn-005', opened_at: ago(1, 4), resolved_at: null,   assigned_to: 'michael.chen@corp.com' },
  { incident_id: 'inc-002', title: 'INVENTORY volume drop — 42% fewer rows overnight',               description: 'INVENTORY table row count dropped from ~120k to ~69k overnight. Root cause: DELETE statement ran without WHERE clause in nightly maintenance script.', status: 'investigating',   severity: 'critical', affected_assets: ['asset-005'], connection_id: 'demo-conn-001', opened_at: ago(1),    resolved_at: null,   assigned_to: 'james.okonkwo@corp.com' },
  { incident_id: 'inc-003', title: 'Marketing ad_spend CPC anomaly — potential billing error',       description: 'CPC values up to $487 detected in ad_spend table. Likely caused by incorrect currency conversion in the Google Ads data connector (USD vs. GBP mismatch).', status: 'in_progress',   severity: 'high',     affected_assets: ['asset-013'], connection_id: 'demo-conn-002', opened_at: ago(3),    resolved_at: null,   assigned_to: 'sofia.delgado@corp.com' },
  { incident_id: 'inc-004', title: 'dim_customer duplicate surrogate keys — ETL regression',         description: '23 duplicate customer_key values introduced in dim_customer after a schema migration that removed the UNIQUE constraint. ETL rerun required.', status: 'resolved',       severity: 'high',     affected_assets: ['asset-030'], connection_id: 'demo-conn-004', opened_at: ago(5),    resolved_at: ago(4), assigned_to: 'david.park@corp.com' },
  { incident_id: 'inc-005', title: 'Customer email validation — 312 records failing CRM sync',       description: 'Invalid email addresses (missing TLD or malformed) blocking 312 customer records from syncing to Salesforce CRM. Source: manual import from external file.', status: 'in_progress',   severity: 'high',     affected_assets: ['asset-023'], connection_id: 'demo-conn-003', opened_at: ago(2),    resolved_at: null,   assigned_to: 'arun.patel@corp.com' },
]

// ─────────────────────────── pipelines ──────────────────────────────────────

export const DEMO_PIPELINES = [
  { pipeline_id: 'pipe-001', pipeline_name: 'Supply Chain ETL',           description: 'Ingests Snowflake supply chain data to data warehouse',        status: 'active',  connection_id: 'demo-conn-001', schedule: '0 5 * * *',  last_run_status: 'success', last_run_at: ago(0, 7),  step_count: 6, created_at: ago(180) },
  { pipeline_id: 'pipe-002', pipeline_name: 'Marketing Analytics Ingest', description: 'Pulls Google Ads, Facebook and CRM data into BigQuery',       status: 'active',  connection_id: 'demo-conn-002', schedule: '0 3 * * *',  last_run_status: 'success', last_run_at: ago(0, 9),  step_count: 8, created_at: ago(120) },
  { pipeline_id: 'pipe-003', pipeline_name: 'Finance Oracle ETL',         description: 'Extracts GL, AP, AR from Oracle ERP into staging',            status: 'failing', connection_id: 'demo-conn-005', schedule: '0 4 * * *',  last_run_status: 'failed',  last_run_at: ago(1, 2),  step_count: 5, created_at: ago(90) },
  { pipeline_id: 'pipe-004', pipeline_name: 'Customer 360 Merge',         description: 'Merges customer events, orders and profiles into C360 tables',status: 'active',  connection_id: 'demo-conn-003', schedule: '30 * * * *', last_run_status: 'success', last_run_at: ago(0, 1),  step_count: 10, created_at: ago(120) },
  { pipeline_id: 'pipe-005', pipeline_name: 'DW Dimensional Load',        description: 'Loads fact_sales and dimension tables from staging',          status: 'active',  connection_id: 'demo-conn-004', schedule: '0 7 * * *',  last_run_status: 'success', last_run_at: ago(0, 5),  step_count: 7, created_at: ago(150) },
]

// ─────────────────────────── notifications ──────────────────────────────────

export const DEMO_NOTIFICATIONS = [
  { notification_id: 'ntf-001', user_id: 'user-001', title: 'Critical: FINANCE_TRANSACTIONS stale 28h',  message: 'Alert alt-002 fired — FINANCE_TRANSACTIONS has not been updated for 28 hours, breaching SOX daily freshness SLA.', type: 'alert',     is_read: false, created_at: ago(1, 4) },
  { notification_id: 'ntf-002', user_id: 'user-001', title: 'Critical: INVENTORY volume anomaly',         message: 'INVENTORY row count dropped 42% overnight. Active incident inc-002 opened.', type: 'incident',  is_read: false, created_at: ago(1) },
  { notification_id: 'ntf-003', user_id: 'user-001', title: 'Rule failed: SALES_ORDERS volume check',     message: '0 new SALES_ORDERS in the last 24 hours — minimum threshold of 10 rows violated.', type: 'alert',     is_read: false, created_at: ago(0, 8) },
  { notification_id: 'ntf-004', user_id: 'user-001', title: 'Issue assigned: Invalid customer emails',    message: '312 customer records have invalid email addresses. Issue iss-002 assigned to Arun Patel.', type: 'issue',     is_read: true,  created_at: ago(2) },
  { notification_id: 'ntf-005', user_id: 'user-001', title: 'Governance violation: PII column unmasked',  message: 'customers.email is exposed unmasked in the staging environment, violating the PII Masking Policy.', type: 'governance',is_read: false, created_at: ago(3) },
  { notification_id: 'ntf-006', user_id: 'user-001', title: 'Incident resolved: dim_customer duplicates', message: 'Incident inc-004 resolved — duplicate surrogate keys removed and ETL constraint re-applied.', type: 'incident',  is_read: true,  created_at: ago(4) },
  { notification_id: 'ntf-007', user_id: 'user-001', title: 'Compliance: SOX assessment due in 3 days',   message: 'SOX compliance framework assessment is due by 2026-07-02. 6 controls still require evidence upload.', type: 'compliance',is_read: true,  created_at: ago(4) },
  { notification_id: 'ntf-008', user_id: 'user-001', title: 'Data contract breach: FINANCE_TRANSACTIONS', message: 'Contract con-002 (FINANCE_TRANSACTIONS SLA) is in BREACHED state. Notify CFO Office.', type: 'contract',  is_read: false, created_at: ago(1, 2) },
  { notification_id: 'ntf-009', user_id: 'user-001', title: 'Scan job failed: Oracle Financials',         message: 'job-005 (Oracle Financials Daily Scan) failed due to connection timeout. Next retry: 2026-06-30 05:00 UTC.', type: 'scan',      is_read: true,  created_at: ago(1, 2) },
  { notification_id: 'ntf-010', user_id: 'user-001', title: 'Rule approved: Null check on BOM',           message: 'Rule rule-030 (Null: BOM.component_code) has been approved and is now active.', type: 'rule',      is_read: true,  created_at: ago(7) },
]

// ─────────────────────────── observability — freshness board ────────────────

export const DEMO_FRESHNESS_BOARD = [
  { asset_id: 'asset-001', asset_name: 'SALES_ORDERS',          schema_name: 'SUPPLYCHAIN', connection_id: 'demo-conn-001', last_updated_at: ago(0, 14), expected_refresh_hours: 12, status: 'stale',   hours_since_update: 14, freshness_score: 52 },
  { asset_id: 'asset-002', asset_name: 'CUSTOMERS',             schema_name: 'SUPPLYCHAIN', connection_id: 'demo-conn-001', last_updated_at: ago(0, 5),  expected_refresh_hours: 24, status: 'fresh',   hours_since_update: 5,  freshness_score: 98 },
  { asset_id: 'asset-005', asset_name: 'INVENTORY',             schema_name: 'SUPPLYCHAIN', connection_id: 'demo-conn-001', last_updated_at: ago(1, 2),  expected_refresh_hours: 12, status: 'stale',   hours_since_update: 26, freshness_score: 0  },
  { asset_id: 'asset-010', asset_name: 'campaigns',             schema_name: 'marketing_analytics', connection_id: 'demo-conn-002', last_updated_at: ago(0, 6), expected_refresh_hours: 24, status: 'fresh', hours_since_update: 6, freshness_score: 95 },
  { asset_id: 'asset-011', asset_name: 'conversions',           schema_name: 'marketing_analytics', connection_id: 'demo-conn-002', last_updated_at: ago(0, 8), expected_refresh_hours: 24, status: 'fresh', hours_since_update: 8, freshness_score: 92 },
  { asset_id: 'asset-013', asset_name: 'ad_spend',              schema_name: 'marketing_analytics', connection_id: 'demo-conn-002', last_updated_at: ago(0, 8), expected_refresh_hours: 24, status: 'fresh', hours_since_update: 8, freshness_score: 92 },
  { asset_id: 'asset-023', asset_name: 'customers',             schema_name: 'public',      connection_id: 'demo-conn-003', last_updated_at: ago(0, 1),  expected_refresh_hours: 6,  status: 'fresh',   hours_since_update: 1,  freshness_score: 99 },
  { asset_id: 'asset-024', asset_name: 'orders',                schema_name: 'public',      connection_id: 'demo-conn-003', last_updated_at: ago(0, 1),  expected_refresh_hours: 6,  status: 'fresh',   hours_since_update: 1,  freshness_score: 99 },
  { asset_id: 'asset-029', asset_name: 'fact_sales',            schema_name: 'public',      connection_id: 'demo-conn-004', last_updated_at: ago(0, 5),  expected_refresh_hours: 24, status: 'fresh',   hours_since_update: 5,  freshness_score: 97 },
  { asset_id: 'asset-030', asset_name: 'dim_customer',          schema_name: 'public',      connection_id: 'demo-conn-004', last_updated_at: ago(0, 5),  expected_refresh_hours: 24, status: 'fresh',   hours_since_update: 5,  freshness_score: 97 },
  { asset_id: 'asset-018', asset_name: 'FINANCE_TRANSACTIONS',  schema_name: 'FINANCE',     connection_id: 'demo-conn-005', last_updated_at: ago(1, 4),  expected_refresh_hours: 24, status: 'stale',   hours_since_update: 28, freshness_score: 0  },
  { asset_id: 'asset-019', asset_name: 'AP_INVOICES',           schema_name: 'FINANCE',     connection_id: 'demo-conn-005', last_updated_at: ago(1, 4),  expected_refresh_hours: 24, status: 'stale',   hours_since_update: 28, freshness_score: 0  },
  { asset_id: 'asset-033', asset_name: 'WORK_ORDERS',           schema_name: 'MFG',         connection_id: 'demo-conn-006', last_updated_at: ago(0, 9),  expected_refresh_hours: 12, status: 'fresh',   hours_since_update: 9,  freshness_score: 87 },
  { asset_id: 'asset-035', asset_name: 'QUALITY_INSPECTIONS',   schema_name: 'MFG',         connection_id: 'demo-conn-006', last_updated_at: ago(0, 9),  expected_refresh_hours: 12, status: 'fresh',   hours_since_update: 9,  freshness_score: 87 },
]

// ─────────────────────────── privacy — DSR & consent ────────────────────────

export const DEMO_PRIVACY_DSR = [
  { dsr_id: 'dsr-001', request_type: 'access',    subject_email: 'jane.doe@example.com',    status: 'completed', submitted_at: ago(14), completed_at: ago(10), affected_assets: ['asset-023', 'asset-024'], notes: 'Customer requested full data export. Delivered via encrypted link.' },
  { dsr_id: 'dsr-002', request_type: 'deletion',  subject_email: 'john.smith@example.com',  status: 'in_progress',submitted_at: ago(7),  completed_at: null,    affected_assets: ['asset-023', 'asset-026'], notes: 'Deletion in progress — subscriptions table deprovision pending.' },
  { dsr_id: 'dsr-003', request_type: 'rectification', subject_email: 'alice.wong@example.com', status: 'pending', submitted_at: ago(3), completed_at: null,    affected_assets: ['asset-023'], notes: 'Customer requests correction of incorrect address field.' },
  { dsr_id: 'dsr-004', request_type: 'portability', subject_email: 'bob.martin@example.com', status: 'completed', submitted_at: ago(21), completed_at: ago(18), affected_assets: ['asset-023', 'asset-024', 'asset-026'], notes: 'Full GDPR data portability export completed in CSV format.' },
  { dsr_id: 'dsr-005', request_type: 'objection', subject_email: 'carol.lee@example.com',    status: 'pending',   submitted_at: ago(1),  completed_at: null,    affected_assets: ['asset-023'], notes: 'Subject objects to marketing profiling — pending domain owner review.' },
]

export const DEMO_PRIVACY_CONSENT = [
  { consent_id: 'cns-001', subject_email: 'jane.doe@example.com',    asset_id: 'asset-023', consent_type: 'marketing',    granted: true,  granted_at: ago(180), withdrawn_at: null,   lawful_basis: 'consent' },
  { consent_id: 'cns-002', subject_email: 'jane.doe@example.com',    asset_id: 'asset-023', consent_type: 'analytics',    granted: true,  granted_at: ago(180), withdrawn_at: null,   lawful_basis: 'consent' },
  { consent_id: 'cns-003', subject_email: 'john.smith@example.com',  asset_id: 'asset-023', consent_type: 'marketing',    granted: false, granted_at: ago(90),  withdrawn_at: ago(7), lawful_basis: 'consent' },
  { consent_id: 'cns-004', subject_email: 'alice.wong@example.com',  asset_id: 'asset-023', consent_type: 'third_party',  granted: false, granted_at: null,     withdrawn_at: null,   lawful_basis: 'legitimate_interest' },
  { consent_id: 'cns-005', subject_email: 'bob.martin@example.com',  asset_id: 'asset-023', consent_type: 'marketing',    granted: true,  granted_at: ago(60),  withdrawn_at: null,   lawful_basis: 'consent' },
  { consent_id: 'cns-006', subject_email: 'carol.lee@example.com',   asset_id: 'asset-023', consent_type: 'analytics',    granted: true,  granted_at: ago(45),  withdrawn_at: null,   lawful_basis: 'consent' },
]
