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

// ─────────────────────────── enriched assets (catalog + asset-registry) ─────

export const DEMO_ENRICHED_ASSETS = [
  // ── Snowflake Supply Chain ──────────────────────────────────────────────
  { asset_id: 'asset-001', sf_table_name: 'SALES_ORDERS',          sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'SALES_ORDERS',          physical_name: 'SALES_ORDERS',          status: 'active',  domain_id: 'dom-001', domain_name: 'Revenue',       subdomain_id: 'sub-001', subdomain_name: 'Order Management',   owner_name: 'Priya Sharma',   certification_status: 'certified',   criticality: 'high',     quality_score: 88,  is_active: true,  row_count: 2_410_832, column_count: 18, table_type: 'table', tag_names: ['Critical', 'Operational'], description: 'All customer sales orders including status, amounts, and fulfilment dates',      discovered_at: ago(180), last_seen_at: ago(0, 6) },
  { asset_id: 'asset-002', sf_table_name: 'CUSTOMERS',              sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'CUSTOMERS',             physical_name: 'CUSTOMERS',             status: 'active',  domain_id: 'dom-001', domain_name: 'Revenue',       subdomain_id: 'sub-002', subdomain_name: 'Customer Master',    owner_name: 'Priya Sharma',   certification_status: 'certified',   criticality: 'high',     quality_score: 91,  is_active: true,  row_count: 485_200,   column_count: 22, table_type: 'table', tag_names: ['PII', 'Critical'],         description: 'Master customer records including contact, account tier, and lifecycle status',  discovered_at: ago(180), last_seen_at: ago(0, 6) },
  { asset_id: 'asset-003', sf_table_name: 'SUPPLIERS',              sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'SUPPLIERS',             physical_name: 'SUPPLIERS',             status: 'active',  domain_id: 'dom-003', domain_name: 'Operations',    subdomain_id: 'sub-008', subdomain_name: 'Supplier Management',owner_name: 'James Okonkwo',  certification_status: 'uncertified', criticality: 'medium',   quality_score: 82,  is_active: true,  row_count: 3_740,     column_count: 14, table_type: 'table', tag_names: ['Operational'],             description: 'Supplier master data including contract terms, lead times, and performance ratings', discovered_at: ago(180), last_seen_at: ago(0, 6) },
  { asset_id: 'asset-004', sf_table_name: 'PRODUCTS',               sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'PRODUCTS',              physical_name: 'PRODUCTS',              status: 'active',  domain_id: 'dom-001', domain_name: 'Revenue',       subdomain_id: 'sub-003', subdomain_name: 'Product Catalog',    owner_name: 'Priya Sharma',   certification_status: 'certified',   criticality: 'medium',   quality_score: 94,  is_active: true,  row_count: 12_650,    column_count: 16, table_type: 'table', tag_names: ['Certified'],               description: 'Product catalogue with SKUs, categories, unit prices, and supplier linkage',    discovered_at: ago(180), last_seen_at: ago(0, 6) },
  { asset_id: 'asset-005', sf_table_name: 'INVENTORY',              sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'INVENTORY',             physical_name: 'INVENTORY',             status: 'active',  domain_id: 'dom-003', domain_name: 'Operations',    subdomain_id: 'sub-007', subdomain_name: 'Inventory Control',  owner_name: 'James Okonkwo',  certification_status: 'uncertified', criticality: 'critical', quality_score: 68,  is_active: true,  row_count: 69_400,    column_count: 12, table_type: 'table', tag_names: ['Critical', 'Operational'], description: 'Real-time inventory levels by warehouse location, SKU, and lot number',          discovered_at: ago(180), last_seen_at: ago(1, 2) },
  { asset_id: 'asset-006', sf_table_name: 'SHIPMENTS',              sf_schema_name: 'SUPPLYCHAIN', sf_database_name: 'SUPPLYCHAIN_DB', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',            asset_type: 'table', display_name: 'SHIPMENTS',             physical_name: 'SHIPMENTS',             status: 'active',  domain_id: 'dom-003', domain_name: 'Operations',    subdomain_id: 'sub-009', subdomain_name: 'Logistics',          owner_name: 'James Okonkwo',  certification_status: 'uncertified', criticality: 'medium',   quality_score: 85,  is_active: true,  row_count: 1_208_440, column_count: 15, table_type: 'table', tag_names: ['Operational'],             description: 'Outbound shipment records with carrier, tracking, and delivery confirmation',   discovered_at: ago(180), last_seen_at: ago(0, 6) },
  // ── BigQuery Marketing Analytics ────────────────────────────────────────
  { asset_id: 'asset-010', sf_table_name: 'campaigns',              sf_schema_name: 'marketing_analytics', sf_database_name: 'analytics-prod-12345', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_type: 'table', display_name: 'campaigns',          physical_name: 'campaigns',             status: 'active',  domain_id: 'dom-004', domain_name: 'Marketing',     subdomain_id: 'sub-010', subdomain_name: 'Campaign Analytics', owner_name: 'Sofia Delgado',  certification_status: 'certified',   criticality: 'high',     quality_score: 91,  is_active: true,  row_count: 8_430,     column_count: 19, table_type: 'table', tag_names: ['Marketing', 'Certified'],  description: 'All marketing campaigns across Google Ads, Facebook, and email channels',       discovered_at: ago(120), last_seen_at: ago(0, 8) },
  { asset_id: 'asset-011', sf_table_name: 'conversions',            sf_schema_name: 'marketing_analytics', sf_database_name: 'analytics-prod-12345', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_type: 'table', display_name: 'conversions',        physical_name: 'conversions',           status: 'active',  domain_id: 'dom-004', domain_name: 'Marketing',     subdomain_id: 'sub-012', subdomain_name: 'Attribution',        owner_name: 'Sofia Delgado',  certification_status: 'uncertified', criticality: 'high',     quality_score: 88,  is_active: true,  row_count: 624_180,   column_count: 11, table_type: 'table', tag_names: ['Marketing'],               description: 'Conversion events attributed to marketing campaigns with revenue value',         discovered_at: ago(120), last_seen_at: ago(0, 8) },
  { asset_id: 'asset-012', sf_table_name: 'leads',                  sf_schema_name: 'marketing_analytics', sf_database_name: 'analytics-prod-12345', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_type: 'table', display_name: 'leads',              physical_name: 'leads',                 status: 'active',  domain_id: 'dom-004', domain_name: 'Marketing',     subdomain_id: 'sub-011', subdomain_name: 'Lead Generation',    owner_name: 'Sofia Delgado',  certification_status: 'uncertified', criticality: 'medium',   quality_score: 85,  is_active: true,  row_count: 187_300,   column_count: 15, table_type: 'table', tag_names: ['PII', 'Marketing'],        description: 'Lead capture records from all inbound marketing channels',                       discovered_at: ago(120), last_seen_at: ago(0, 8) },
  { asset_id: 'asset-013', sf_table_name: 'ad_spend',               sf_schema_name: 'marketing_analytics', sf_database_name: 'analytics-prod-12345', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_type: 'table', display_name: 'ad_spend',           physical_name: 'ad_spend',              status: 'active',  domain_id: 'dom-004', domain_name: 'Marketing',     subdomain_id: 'sub-010', subdomain_name: 'Campaign Analytics', owner_name: 'Sofia Delgado',  certification_status: 'uncertified', criticality: 'high',     quality_score: 74,  is_active: true,  row_count: 92_800,    column_count: 9,  table_type: 'table', tag_names: ['Marketing', 'Finance'],    description: 'Daily ad spend breakdown by campaign, channel, and creative',                    discovered_at: ago(120), last_seen_at: ago(0, 8) },
  { asset_id: 'asset-014', sf_table_name: 'attribution',            sf_schema_name: 'marketing_analytics', sf_database_name: 'analytics-prod-12345', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_type: 'view',  display_name: 'attribution',        physical_name: 'attribution',           status: 'active',  domain_id: 'dom-004', domain_name: 'Marketing',     subdomain_id: 'sub-012', subdomain_name: 'Attribution',        owner_name: 'Sofia Delgado',  certification_status: 'deprecated',  criticality: 'medium',   quality_score: 77,  is_active: true,  row_count: 412_900,   column_count: 13, table_type: 'view',  tag_names: ['Marketing', 'Deprecated'], description: 'Multi-touch attribution view (deprecated — use conversions table instead)',      discovered_at: ago(120), last_seen_at: ago(0, 8) },
  // ── PostgreSQL Customer 360 ──────────────────────────────────────────────
  { asset_id: 'asset-023', sf_table_name: 'customers',              sf_schema_name: 'public',      sf_database_name: 'customer_360',         connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',      asset_type: 'table', display_name: 'customers',          physical_name: 'customers',             status: 'active',  domain_id: 'dom-005', domain_name: 'Customer',      subdomain_id: 'sub-013', subdomain_name: 'Customer Profile',   owner_name: 'Arun Patel',     certification_status: 'certified',   criticality: 'critical', quality_score: 85,  is_active: true,  row_count: 1_840_220, column_count: 24, table_type: 'table', tag_names: ['PII', 'GDPR', 'Critical'], description: 'Unified customer profile with demographics, preferences, and lifecycle stage',  discovered_at: ago(120), last_seen_at: ago(0, 1) },
  { asset_id: 'asset-024', sf_table_name: 'orders',                 sf_schema_name: 'public',      sf_database_name: 'customer_360',         connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',      asset_type: 'table', display_name: 'orders',             physical_name: 'orders',                status: 'active',  domain_id: 'dom-001', domain_name: 'Revenue',       subdomain_id: 'sub-001', subdomain_name: 'Order Management',   owner_name: 'Priya Sharma',   certification_status: 'certified',   criticality: 'high',     quality_score: 89,  is_active: true,  row_count: 3_621_400, column_count: 16, table_type: 'table', tag_names: ['Critical', 'Operational'], description: 'Customer order transactions linked to customer profiles',                        discovered_at: ago(120), last_seen_at: ago(0, 1) },
  { asset_id: 'asset-025', sf_table_name: 'interactions',           sf_schema_name: 'public',      sf_database_name: 'customer_360',         connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',      asset_type: 'table', display_name: 'interactions',       physical_name: 'interactions',          status: 'active',  domain_id: 'dom-005', domain_name: 'Customer',      subdomain_id: 'sub-014', subdomain_name: 'Customer Events',    owner_name: 'Arun Patel',     certification_status: 'uncertified', criticality: 'medium',   quality_score: 79,  is_active: true,  row_count: 8_920_000, column_count: 10, table_type: 'table', tag_names: ['PII'],                     description: 'Customer interaction events (calls, emails, chat) from CRM and support systems', discovered_at: ago(120), last_seen_at: ago(0, 1) },
  { asset_id: 'asset-026', sf_table_name: 'subscriptions',          sf_schema_name: 'public',      sf_database_name: 'customer_360',         connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',      asset_type: 'table', display_name: 'subscriptions',      physical_name: 'subscriptions',         status: 'active',  domain_id: 'dom-005', domain_name: 'Customer',      subdomain_id: 'sub-013', subdomain_name: 'Customer Profile',   owner_name: 'Arun Patel',     certification_status: 'uncertified', criticality: 'high',     quality_score: 83,  is_active: true,  row_count: 924_000,   column_count: 14, table_type: 'table', tag_names: ['PII', 'GDPR'],             description: 'Active and historical subscription records with plan, billing cycle, and status', discovered_at: ago(120), last_seen_at: ago(0, 1) },
  { asset_id: 'asset-027', sf_table_name: 'events',                 sf_schema_name: 'events',      sf_database_name: 'customer_360',         connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',      asset_type: 'table', display_name: 'events',             physical_name: 'events',                status: 'active',  domain_id: 'dom-005', domain_name: 'Customer',      subdomain_id: 'sub-014', subdomain_name: 'Customer Events',    owner_name: 'Arun Patel',     certification_status: 'uncertified', criticality: 'low',      quality_score: 76,  is_active: true,  row_count: 42_100_000,column_count: 8,  table_type: 'table', tag_names: [],                          description: 'Raw behavioural event stream from web and mobile applications',                 discovered_at: ago(120), last_seen_at: ago(0, 1) },
  // ── Redshift Enterprise DW ───────────────────────────────────────────────
  { asset_id: 'asset-029', sf_table_name: 'fact_sales',             sf_schema_name: 'public',      sf_database_name: 'data_warehouse',       connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',       asset_type: 'table', display_name: 'fact_sales',         physical_name: 'fact_sales',            status: 'active',  domain_id: 'dom-007', domain_name: 'Data Warehouse', subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics',    owner_name: 'David Park',     certification_status: 'certified',   criticality: 'critical', quality_score: 90,  is_active: true,  row_count: 18_200_000,column_count: 26, table_type: 'table', tag_names: ['Certified', 'Critical'],   description: 'Central sales fact table — grain is one row per order line item per day',       discovered_at: ago(150), last_seen_at: ago(0, 5) },
  { asset_id: 'asset-030', sf_table_name: 'dim_customer',           sf_schema_name: 'public',      sf_database_name: 'data_warehouse',       connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',       asset_type: 'table', display_name: 'dim_customer',       physical_name: 'dim_customer',          status: 'active',  domain_id: 'dom-007', domain_name: 'Data Warehouse', subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics',    owner_name: 'David Park',     certification_status: 'certified',   criticality: 'high',     quality_score: 87,  is_active: true,  row_count: 492_000,   column_count: 18, table_type: 'table', tag_names: ['Certified'],               description: 'Customer dimension with SCD Type 2 history and customer segmentation attributes', discovered_at: ago(150), last_seen_at: ago(0, 5) },
  { asset_id: 'asset-031', sf_table_name: 'dim_product',            sf_schema_name: 'public',      sf_database_name: 'data_warehouse',       connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',       asset_type: 'table', display_name: 'dim_product',        physical_name: 'dim_product',           status: 'active',  domain_id: 'dom-007', domain_name: 'Data Warehouse', subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics',    owner_name: 'David Park',     certification_status: 'certified',   criticality: 'medium',   quality_score: 92,  is_active: true,  row_count: 14_200,    column_count: 15, table_type: 'table', tag_names: ['Certified'],               description: 'Product dimension including hierarchy, category, and list price attributes',    discovered_at: ago(150), last_seen_at: ago(0, 5) },
  { asset_id: 'asset-032', sf_table_name: 'dim_time',               sf_schema_name: 'public',      sf_database_name: 'data_warehouse',       connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',       asset_type: 'table', display_name: 'dim_time',           physical_name: 'dim_time',              status: 'active',  domain_id: 'dom-007', domain_name: 'Data Warehouse', subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics',    owner_name: 'David Park',     certification_status: 'certified',   criticality: 'low',      quality_score: 99,  is_active: true,  row_count: 10_957,    column_count: 20, table_type: 'table', tag_names: ['Certified'],               description: 'Date dimension covering 30 years with fiscal calendar, holidays, and week attributes', discovered_at: ago(150), last_seen_at: ago(0, 5) },
  { asset_id: 'asset-028', sf_table_name: 'revenue_summary',        sf_schema_name: 'reporting',   sf_database_name: 'data_warehouse',       connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',       asset_type: 'view',  display_name: 'revenue_summary',    physical_name: 'revenue_summary',       status: 'active',  domain_id: 'dom-007', domain_name: 'Data Warehouse', subdomain_id: 'sub-017', subdomain_name: 'Sales Analytics',    owner_name: 'David Park',     certification_status: 'certified',   criticality: 'high',     quality_score: 88,  is_active: true,  row_count: 84_000,    column_count: 12, table_type: 'view',  tag_names: ['Certified'],               description: 'Pre-aggregated revenue summary by month, region, and channel for executive reporting', discovered_at: ago(150), last_seen_at: ago(0, 5) },
  // ── Oracle Financials ────────────────────────────────────────────────────
  { asset_id: 'asset-017', sf_table_name: 'GL_ACCOUNTS',            sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'GL_ACCOUNTS',        physical_name: 'GL_ACCOUNTS',           status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-004', subdomain_name: 'General Ledger',     owner_name: 'Michael Chen',   certification_status: 'certified',   criticality: 'critical', quality_score: 84,  is_active: true,  row_count: 24_800,    column_count: 12, table_type: 'table', tag_names: ['Finance', 'Critical'],     description: 'Chart of accounts — all GL account codes, types, and active status',            discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-018', sf_table_name: 'FINANCE_TRANSACTIONS',   sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'FINANCE_TRANSACTIONS', physical_name: 'FINANCE_TRANSACTIONS',  status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-004', subdomain_name: 'General Ledger',     owner_name: 'Michael Chen',   certification_status: 'certified',   criticality: 'critical', quality_score: 61,  is_active: true,  row_count: 8_420_000, column_count: 20, table_type: 'table', tag_names: ['Finance', 'Critical', 'SOX'], description: 'Journal entries and GL postings — source of record for all financial transactions', discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-019', sf_table_name: 'AP_INVOICES',            sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'AP_INVOICES',        physical_name: 'AP_INVOICES',           status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-005', subdomain_name: 'Accounts Payable',   owner_name: 'Michael Chen',   certification_status: 'certified',   criticality: 'high',     quality_score: 78,  is_active: true,  row_count: 1_240_000, column_count: 16, table_type: 'table', tag_names: ['Finance', 'SOX'],          description: 'Accounts payable invoices from all approved vendors',                            discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-020', sf_table_name: 'AR_TRANSACTIONS',        sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'AR_TRANSACTIONS',    physical_name: 'AR_TRANSACTIONS',       status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-006', subdomain_name: 'Accounts Receivable',owner_name: 'Michael Chen',   certification_status: 'certified',   criticality: 'high',     quality_score: 82,  is_active: true,  row_count: 680_000,   column_count: 14, table_type: 'table', tag_names: ['Finance', 'SOX'],          description: 'Accounts receivable transactions — customer invoices, payments, and credits',   discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-021', sf_table_name: 'COST_CENTERS',           sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'COST_CENTERS',       physical_name: 'COST_CENTERS',          status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-004', subdomain_name: 'General Ledger',     owner_name: 'Michael Chen',   certification_status: 'uncertified', criticality: 'medium',   quality_score: 88,  is_active: true,  row_count: 842,       column_count: 10, table_type: 'table', tag_names: ['Finance'],                 description: 'Cost centre hierarchy and budget allocation by department',                      discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-022', sf_table_name: 'BUDGET_LINES',           sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'BUDGET_LINES',       physical_name: 'BUDGET_LINES',          status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-004', subdomain_name: 'General Ledger',     owner_name: 'Michael Chen',   certification_status: 'uncertified', criticality: 'medium',   quality_score: 86,  is_active: true,  row_count: 18_200,    column_count: 11, table_type: 'table', tag_names: ['Finance'],                 description: 'Annual budget line items by cost centre and expense category',                   discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  { asset_id: 'asset-015', sf_table_name: 'FX_RATES',               sf_schema_name: 'FINANCE',     sf_database_name: 'FINDB',                connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',        asset_type: 'table', display_name: 'FX_RATES',           physical_name: 'FX_RATES',              status: 'active',  domain_id: 'dom-002', domain_name: 'Finance',       subdomain_id: 'sub-004', subdomain_name: 'General Ledger',     owner_name: 'Michael Chen',   certification_status: 'uncertified', criticality: 'high',     quality_score: 91,  is_active: true,  row_count: 12_400,    column_count: 6,  table_type: 'table', tag_names: ['Finance'],                 description: 'Daily FX rates from Reuters for multi-currency consolidation',                   discovered_at: ago(90),  last_seen_at: ago(1, 4) },
  // ── Oracle Manufacturing ─────────────────────────────────────────────────
  { asset_id: 'asset-033', sf_table_name: 'WORK_ORDERS',            sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'WORK_ORDERS',        physical_name: 'WORK_ORDERS',           status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-015', subdomain_name: 'Production Planning',owner_name: 'Elena Kowalski', certification_status: 'uncertified', criticality: 'high',     quality_score: 71,  is_active: true,  row_count: 384_200,   column_count: 18, table_type: 'table', tag_names: ['Operational'],             description: 'Manufacturing work orders with BOM, routing, and completion tracking',           discovered_at: ago(80),  last_seen_at: ago(0, 9) },
  { asset_id: 'asset-034', sf_table_name: 'BOM',                    sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'BOM',                physical_name: 'BOM',                   status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-015', subdomain_name: 'Production Planning',owner_name: 'Elena Kowalski', certification_status: 'certified',   criticality: 'medium',   quality_score: 88,  is_active: true,  row_count: 42_600,    column_count: 14, table_type: 'table', tag_names: ['Certified', 'Operational'], description: 'Bill of materials — components and quantities for each manufactured product',     discovered_at: ago(80),  last_seen_at: ago(0, 9) },
  { asset_id: 'asset-035', sf_table_name: 'QUALITY_INSPECTIONS',    sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'QUALITY_INSPECTIONS',physical_name: 'QUALITY_INSPECTIONS',   status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-016', subdomain_name: 'Quality Control',    owner_name: 'Elena Kowalski', certification_status: 'uncertified', criticality: 'high',     quality_score: 80,  is_active: true,  row_count: 128_400,   column_count: 13, table_type: 'table', tag_names: ['Operational'],             description: 'Quality inspection results per lot with defect codes and disposition',           discovered_at: ago(80),  last_seen_at: ago(0, 9) },
  { asset_id: 'asset-036', sf_table_name: 'PRODUCTION_SCHEDULES',   sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'PRODUCTION_SCHEDULES', physical_name: 'PRODUCTION_SCHEDULES',  status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-015', subdomain_name: 'Production Planning',owner_name: 'Elena Kowalski', certification_status: 'certified',   criticality: 'high',     quality_score: 86,  is_active: true,  row_count: 22_100,    column_count: 10, table_type: 'table', tag_names: ['Certified', 'Operational'], description: 'Daily and weekly production schedules by line and shift',                        discovered_at: ago(80),  last_seen_at: ago(0, 9) },
  { asset_id: 'asset-037', sf_table_name: 'EQUIPMENT_MAINTENANCE',  sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'EQUIPMENT_MAINTENANCE',physical_name: 'EQUIPMENT_MAINTENANCE', status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-015', subdomain_name: 'Production Planning',owner_name: 'Elena Kowalski', certification_status: 'uncertified', criticality: 'medium',   quality_score: 79,  is_active: true,  row_count: 84_600,    column_count: 12, table_type: 'table', tag_names: [],                          description: 'Preventive and corrective maintenance records for manufacturing equipment',      discovered_at: ago(80),  last_seen_at: ago(0, 9) },
  { asset_id: 'asset-038', sf_table_name: 'SHOP_FLOOR_EVENTS',      sf_schema_name: 'MFG',         sf_database_name: 'MFGDB',                connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)',     asset_type: 'table', display_name: 'SHOP_FLOOR_EVENTS',  physical_name: 'SHOP_FLOOR_EVENTS',     status: 'active',  domain_id: 'dom-006', domain_name: 'Manufacturing', subdomain_id: 'sub-015', subdomain_name: 'Production Planning',owner_name: 'Elena Kowalski', certification_status: 'uncertified', criticality: 'low',      quality_score: 74,  is_active: true,  row_count: 6_840_000, column_count: 8,  table_type: 'table', tag_names: [],                          description: 'Raw shop floor machine events from IoT sensors and SCADA systems',              discovered_at: ago(80),  last_seen_at: ago(0, 9) },
]

export const DEMO_ASSET_BY_ID: Record<string, (typeof DEMO_ENRICHED_ASSETS)[number]> =
  Object.fromEntries(DEMO_ENRICHED_ASSETS.map(a => [a.asset_id, a]))

// ─────────────────────────── quality scores per asset ───────────────────────

function qscore(
  assetId: string, overall: number,
  completeness: number, accuracy: number, uniqueness: number, validity: number, timeliness: number, consistency: number,
) {
  return {
    asset_id: assetId, score_date: new Date('2026-06-29').toISOString().slice(0, 10), overall_score: overall,
    dimensions: {
      completeness: { score: completeness, source: 'rules', total_rules: 4, passed_rules: Math.round(4*completeness/100), failed_rules: Math.round(4*(1-completeness/100)) },
      accuracy:     { score: accuracy,     source: 'rules', total_rules: 5, passed_rules: Math.round(5*accuracy/100),     failed_rules: Math.round(5*(1-accuracy/100)) },
      uniqueness:   { score: uniqueness,   source: 'rules', total_rules: 3, passed_rules: Math.round(3*uniqueness/100),   failed_rules: Math.round(3*(1-uniqueness/100)) },
      validity:     { score: validity,     source: 'rules', total_rules: 4, passed_rules: Math.round(4*validity/100),     failed_rules: Math.round(4*(1-validity/100)) },
      timeliness:   { score: timeliness,   source: 'rules', total_rules: 2, passed_rules: Math.round(2*timeliness/100),   failed_rules: Math.round(2*(1-timeliness/100)) },
      consistency:  { score: consistency,  source: 'rules', total_rules: 3, passed_rules: Math.round(3*consistency/100),  failed_rules: Math.round(3*(1-consistency/100)) },
    },
  }
}

export const DEMO_QUALITY_SCORE_MAP: Record<string, ReturnType<typeof qscore>> = {
  'asset-001': qscore('asset-001', 88, 93, 86, 97, 88, 72, 92),
  'asset-002': qscore('asset-002', 91, 96, 89, 99, 94, 80, 88),
  'asset-003': qscore('asset-003', 82, 88, 80, 91, 83, 78, 72),
  'asset-004': qscore('asset-004', 94, 98, 93, 99, 96, 88, 94),
  'asset-005': qscore('asset-005', 68, 71, 65, 82, 70, 42, 78),
  'asset-006': qscore('asset-006', 85, 90, 83, 94, 87, 76, 80),
  'asset-010': qscore('asset-010', 91, 94, 90, 98, 95, 84, 88),
  'asset-011': qscore('asset-011', 88, 92, 87, 96, 91, 79, 83),
  'asset-012': qscore('asset-012', 85, 91, 83, 94, 86, 77, 80),
  'asset-013': qscore('asset-013', 74, 78, 72, 88, 76, 58, 72),
  'asset-014': qscore('asset-014', 77, 80, 75, 90, 79, 64, 74),
  'asset-015': qscore('asset-015', 91, 97, 90, 99, 93, 82, 85),
  'asset-017': qscore('asset-017', 84, 90, 83, 96, 85, 70, 80),
  'asset-018': qscore('asset-018', 61, 65, 58, 72, 63, 42, 66),
  'asset-019': qscore('asset-019', 78, 83, 76, 90, 80, 65, 74),
  'asset-020': qscore('asset-020', 82, 87, 80, 93, 84, 70, 78),
  'asset-021': qscore('asset-021', 88, 92, 87, 97, 90, 79, 83),
  'asset-022': qscore('asset-022', 86, 90, 85, 96, 88, 76, 82),
  'asset-023': qscore('asset-023', 85, 88, 83, 92, 88, 80, 79),
  'asset-024': qscore('asset-024', 89, 93, 88, 97, 91, 82, 83),
  'asset-025': qscore('asset-025', 79, 84, 77, 90, 81, 72, 72),
  'asset-026': qscore('asset-026', 83, 88, 81, 93, 85, 74, 77),
  'asset-027': qscore('asset-027', 76, 80, 74, 88, 78, 66, 70),
  'asset-028': qscore('asset-028', 88, 92, 87, 96, 90, 80, 84),
  'asset-029': qscore('asset-029', 90, 94, 89, 98, 93, 84, 90),
  'asset-030': qscore('asset-030', 87, 92, 86, 97, 89, 78, 82),
  'asset-031': qscore('asset-031', 92, 97, 91, 99, 94, 86, 88),
  'asset-032': qscore('asset-032', 99, 100,99, 100,100,98, 98),
  'asset-033': qscore('asset-033', 71, 75, 68, 84, 73, 55, 71),
  'asset-034': qscore('asset-034', 88, 92, 87, 96, 90, 80, 83),
  'asset-035': qscore('asset-035', 80, 85, 78, 91, 82, 70, 74),
  'asset-036': qscore('asset-036', 86, 90, 85, 96, 88, 76, 81),
  'asset-037': qscore('asset-037', 79, 83, 77, 90, 81, 70, 73),
  'asset-038': qscore('asset-038', 74, 78, 72, 86, 76, 62, 70),
}

// ─────────────────────────── column profiles per asset ──────────────────────

type ColProfile = { column_name: string; data_type: string; null_count: number; null_pct: number; distinct_count: number; distinct_pct: number; min_val?: string; max_val?: string; mean_val?: number; std_dev?: number; sample_values?: string[] }

function cols(defs: ColProfile[]) { return defs }

export const DEMO_COLUMN_PROFILES_MAP: Record<string, ColProfile[]> = {
  'asset-001': cols([
    { column_name: 'ORDER_ID',       data_type: 'VARCHAR(36)',  null_count: 0,     null_pct: 0,    distinct_count: 2410832, distinct_pct: 100,  min_val: 'ORD-0000001', max_val: 'ORD-9999999', sample_values: ['ORD-4821034','ORD-4821035','ORD-4821036'] },
    { column_name: 'CUSTOMER_ID',    data_type: 'VARCHAR(20)',  null_count: 4,     null_pct: 0,    distinct_count: 482100,  distinct_pct: 20,   sample_values: ['CUST-00482','CUST-00891','CUST-01204'] },
    { column_name: 'ORDER_DATE',     data_type: 'DATE',         null_count: 0,     null_pct: 0,    distinct_count: 2400,    distinct_pct: 0.1,  min_val: '2020-01-01',  max_val: '2026-06-29' },
    { column_name: 'ORDER_AMOUNT',   data_type: 'DECIMAL(18,2)',null_count: 0,     null_pct: 0,    distinct_count: 1820000, distinct_pct: 75.5, min_val: '0.01',        max_val: '148250.00',  mean_val: 4100.23, std_dev: 3821.4 },
    { column_name: 'STATUS',         data_type: 'VARCHAR(20)',  null_count: 0,     null_pct: 0,    distinct_count: 6,       distinct_pct: 0,    sample_values: ['PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED','RETURNED'] },
    { column_name: 'PRODUCT_ID',     data_type: 'VARCHAR(20)',  null_count: 12,    null_pct: 0.0005, distinct_count: 12648, distinct_pct: 0.52, sample_values: ['PROD-0042','PROD-1824','PROD-0099'] },
  ]),
  'asset-023': cols([
    { column_name: 'customer_id',    data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 1840220, distinct_pct: 100, min_val: '1',          max_val: '1840220' },
    { column_name: 'email',          data_type: 'VARCHAR(255)', null_count: 0,     null_pct: 0,    distinct_count: 1840080, distinct_pct: 99.99, sample_values: ['alice@example.com','bob@corp.io','carol.smith@email.net'] },
    { column_name: 'phone',          data_type: 'VARCHAR(20)',  null_count: 132000,null_pct: 7.17, distinct_count: 1680000, distinct_pct: 91.3, sample_values: ['+1-555-0182','+44-20-7946-0958','+61-2-8015-0000'] },
    { column_name: 'first_name',     data_type: 'VARCHAR(100)', null_count: 0,     null_pct: 0,    distinct_count: 42800,   distinct_pct: 2.33, sample_values: ['Alice','Bob','Carol','David','Emma'] },
    { column_name: 'last_name',      data_type: 'VARCHAR(100)', null_count: 0,     null_pct: 0,    distinct_count: 128400,  distinct_pct: 6.98 },
    { column_name: 'account_status', data_type: 'VARCHAR(20)',  null_count: 0,     null_pct: 0,    distinct_count: 4,       distinct_pct: 0,    sample_values: ['active','inactive','suspended','pending'] },
    { column_name: 'created_at',     data_type: 'TIMESTAMP',    null_count: 0,     null_pct: 0,    distinct_count: 1839800, distinct_pct: 99.98, min_val: '2018-03-01', max_val: '2026-06-29' },
  ]),
  'asset-029': cols([
    { column_name: 'sales_key',      data_type: 'BIGINT',       null_count: 0,     null_pct: 0,    distinct_count: 18200000,distinct_pct: 100, min_val: '1',          max_val: '18200000' },
    { column_name: 'date_key',       data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 2400,    distinct_pct: 0.01, min_val: '20200101',   max_val: '20260629' },
    { column_name: 'customer_key',   data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 489000,  distinct_pct: 2.69 },
    { column_name: 'product_key',    data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 14200,   distinct_pct: 0.08 },
    { column_name: 'revenue',        data_type: 'DECIMAL(18,2)',null_count: 0,     null_pct: 0,    distinct_count: 8200000, distinct_pct: 45,  min_val: '0.00',       max_val: '48920.00', mean_val: 1842.50, std_dev: 1240.3 },
    { column_name: 'discount_pct',   data_type: 'DECIMAL(5,2)', null_count: 840000,null_pct: 4.62, distinct_count: 201,     distinct_pct: 0,   min_val: '0.00',       max_val: '75.00',    mean_val: 12.4 },
    { column_name: 'units_sold',     data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 8400,    distinct_pct: 0.05, min_val: '1',         max_val: '9999',     mean_val: 24.8 },
  ]),
  'asset-018': cols([
    { column_name: 'TRANSACTION_ID', data_type: 'VARCHAR(40)',  null_count: 0,     null_pct: 0,    distinct_count: 8420000, distinct_pct: 100 },
    { column_name: 'GL_ACCOUNT',     data_type: 'VARCHAR(20)',  null_count: 0,     null_pct: 0,    distinct_count: 24800,   distinct_pct: 0.29 },
    { column_name: 'TRANSACTION_DATE',data_type: 'DATE',        null_count: 0,     null_pct: 0,    distinct_count: 2800,    distinct_pct: 0.03, min_val: '2019-01-01',max_val: '2026-06-28' },
    { column_name: 'AMOUNT',         data_type: 'DECIMAL(20,4)',null_count: 0,     null_pct: 0,    distinct_count: 6200000, distinct_pct: 73.6, mean_val: 48420.28 },
    { column_name: 'CURRENCY',       data_type: 'CHAR(3)',      null_count: 0,     null_pct: 0,    distinct_count: 18,      distinct_pct: 0,    sample_values: ['USD','EUR','GBP','JPY','AUD'] },
    { column_name: 'POSTING_STATUS', data_type: 'VARCHAR(10)',  null_count: 0,     null_pct: 0,    distinct_count: 3,       distinct_pct: 0,    sample_values: ['POSTED','REVERSED','DRAFT'] },
  ]),
  'asset-033': cols([
    { column_name: 'WORK_ORDER_ID',  data_type: 'VARCHAR(30)',  null_count: 0,     null_pct: 0,    distinct_count: 384200,  distinct_pct: 100 },
    { column_name: 'BOM_ID',         data_type: 'VARCHAR(20)',  null_count: 840,   null_pct: 0.22, distinct_count: 4260,    distinct_pct: 1.11 },
    { column_name: 'START_DATE',     data_type: 'DATE',         null_count: 0,     null_pct: 0,    distinct_count: 1800,    distinct_pct: 0.47, min_val: '2021-01-04', max_val: '2026-06-28' },
    { column_name: 'COMPLETION_DATE',data_type: 'DATE',         null_count: 69200, null_pct: 18.01,distinct_count: 1820,    distinct_pct: 0.47, min_val: '2021-01-06', max_val: '2026-06-29' },
    { column_name: 'STATUS',         data_type: 'VARCHAR(20)',  null_count: 0,     null_pct: 0,    distinct_count: 5,       distinct_pct: 0,    sample_values: ['RELEASED','IN_PROGRESS','COMPLETE','ON_HOLD','CANCELLED'] },
    { column_name: 'QUANTITY',       data_type: 'INTEGER',      null_count: 0,     null_pct: 0,    distinct_count: 4800,    distinct_pct: 1.25, min_val: '1',         max_val: '50000',    mean_val: 842.4 },
  ]),
}

// ─────────────────────────── quality heatmap ────────────────────────────────

function heatDates(n: number) {
  const d = new Date('2026-06-29')
  return Array.from({ length: n }, (_, i) => {
    const dd = new Date(d); dd.setDate(dd.getDate() - (n - 1 - i))
    return dd.toISOString().slice(0, 10)
  })
}

export const DEMO_QUALITY_HEATMAP = {
  domains: ['Revenue', 'Finance', 'Operations', 'Marketing', 'Customer', 'Manufacturing', 'Data Warehouse'],
  dates: heatDates(14),
  matrix: [
    // Revenue
    [90, 89, 88, 88, 89, 87, 88, 89, 88, 88, 89, 87, 88, 88],
    // Finance
    [84, 83, 82, 81, 80, 79, 78, 77, 76, 73, 70, 67, 64, 61],
    // Operations
    [82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 68],
    // Marketing
    [88, 89, 90, 90, 91, 91, 91, 90, 89, 88, 88, 89, 91, 91],
    // Customer
    [85, 85, 84, 85, 86, 86, 85, 85, 85, 85, 84, 85, 85, 85],
    // Manufacturing
    [88, 87, 87, 86, 86, 85, 84, 84, 83, 82, 82, 80, 79, 78],
    // Data Warehouse
    [89, 90, 90, 91, 91, 90, 90, 90, 90, 90, 90, 90, 90, 90],
  ],
}

// ─────────────────────────── governance scorecards / approvals ──────────────

export const DEMO_GOVERNANCE_SCORECARDS = [
  { scorecard_id: 'sc-001', name: 'Revenue Domain Health',   domain_id: 'dom-001', total_assets: 8,  compliant_assets: 7,  coverage_pct: 87.5, quality_score: 88, policy_violations: 0, last_assessed_at: ago(1) },
  { scorecard_id: 'sc-002', name: 'Finance Domain Health',   domain_id: 'dom-002', total_assets: 7,  compliant_assets: 5,  coverage_pct: 71.4, quality_score: 79, policy_violations: 2, last_assessed_at: ago(1) },
  { scorecard_id: 'sc-003', name: 'Operations Domain Health',domain_id: 'dom-003', total_assets: 6,  compliant_assets: 4,  coverage_pct: 66.7, quality_score: 77, policy_violations: 1, last_assessed_at: ago(1) },
  { scorecard_id: 'sc-004', name: 'Marketing Domain Health', domain_id: 'dom-004', total_assets: 5,  compliant_assets: 5,  coverage_pct: 100,  quality_score: 91, policy_violations: 0, last_assessed_at: ago(1) },
  { scorecard_id: 'sc-005', name: 'Customer Domain Health',  domain_id: 'dom-005', total_assets: 5,  compliant_assets: 4,  coverage_pct: 80,   quality_score: 85, policy_violations: 1, last_assessed_at: ago(1) },
  { scorecard_id: 'sc-006', name: 'Manufacturing Health',    domain_id: 'dom-006', total_assets: 6,  compliant_assets: 4,  coverage_pct: 66.7, quality_score: 81, policy_violations: 1, last_assessed_at: ago(1) },
]

export const DEMO_GOVERNANCE_APPROVALS = [
  { approval_id: 'apr-001', entity_type: 'rule',        entity_id: 'rule-030', entity_name: 'Null: BOM.component_code',         requester: 'elena.kowalski@corp.com', status: 'pending',  created_at: ago(2),  notes: 'New rule to catch BOM completeness gaps' },
  { approval_id: 'apr-002', entity_type: 'policy',      entity_id: 'pol-005', entity_name: 'Cross-Border Data Transfer Policy', requester: 'admin@corp.com',          status: 'pending',  created_at: ago(3),  notes: 'Requires legal and DPO review before activation' },
  { approval_id: 'apr-003', entity_type: 'data_product',entity_id: 'dp-005',  entity_name: 'Supply Chain Dashboard Data',       requester: 'james.okonkwo@corp.com',  status: 'pending',  created_at: ago(5),  notes: 'Requesting promotion from draft to published' },
  { approval_id: 'apr-004', entity_type: 'rule',        entity_id: 'rule-003', entity_name: 'Freshness: INVENTORY',              requester: 'james.okonkwo@corp.com',  status: 'approved', created_at: ago(14), notes: 'Approved by Priya Sharma on 2026-06-15' },
  { approval_id: 'apr-005', entity_type: 'access',      entity_id: 'asset-018',entity_name: 'FINANCE_TRANSACTIONS access request',requester: 'viewer@corp.com',         status: 'rejected', created_at: ago(10), notes: 'Denied — viewer role does not have finance data access' },
]

// ─────────────────────────── comments ───────────────────────────────────────

export const DEMO_COMMENTS = [
  { comment_id: 'cmt-001', entity_type: 'issue',   entity_id: 'iss-001', content: 'Root cause confirmed: nightly maintenance DELETE ran without WHERE clause. Restore from 06:00 snapshot in progress.', author: 'james.okonkwo@corp.com', created_at: ago(0, 10), resolved: false },
  { comment_id: 'cmt-002', entity_type: 'issue',   entity_id: 'iss-001', content: 'Restore completed — 120,842 rows recovered. Running full validation now.', author: 'admin@corp.com', created_at: ago(0, 8), resolved: false },
  { comment_id: 'cmt-003', entity_type: 'issue',   entity_id: 'iss-002', content: 'Emails with missing TLD confirmed — pattern .*@.*[^.]{3,} catches them. 312 total. Source was the March bulk import file.', author: 'arun.patel@corp.com', created_at: ago(1, 12), resolved: false },
  { comment_id: 'cmt-004', entity_type: 'issue',   entity_id: 'iss-004', content: 'Oracle ETL job timed out due to long-running query in AR reconciliation view. DBA is adding covering index.', author: 'michael.chen@corp.com', created_at: ago(0, 20), resolved: false },
  { comment_id: 'cmt-005', entity_type: 'contract',entity_id: 'con-002', content: 'Finance team notified — upstream ETL will retry at 14:00 UTC. Escalated to engineering on-call.', author: 'michael.chen@corp.com', created_at: ago(1, 2), resolved: false },
  { comment_id: 'cmt-006', entity_type: 'asset',   entity_id: 'asset-030', content: 'Duplicate keys introduced in ETL migration PR #4412 — added unique constraint back and triggered full reload.', author: 'david.park@corp.com', created_at: ago(4, 6), resolved: true },
  { comment_id: 'cmt-007', entity_type: 'rule',    entity_id: 'rule-027', content: 'Quality inspection defect_rate threshold was set too low for Q2 ramp-up period. Temporarily adjusted to 10% pending board approval.', author: 'elena.kowalski@corp.com', created_at: ago(3), resolved: false },
  { comment_id: 'cmt-008', entity_type: 'issue',   entity_id: 'iss-005', content: 'Traced to Google Ads connector v2.3.1 — wrong currency on impression-level rows. Connector rolled back to v2.2.9.', author: 'sofia.delgado@corp.com', created_at: ago(2, 8), resolved: false },
]

// ─────────────────────────── stewardship tasks ──────────────────────────────

export const DEMO_STEWARDSHIP_TASKS = [
  { task_id: 'tsk-001', type: 'certification_review', title: 'Certify INVENTORY table for Operations domain', description: 'Verify data quality meets certification criteria after freshness incident', assignee: 'james.okonkwo@corp.com', status: 'open',        priority: 'high',   asset_id: 'asset-005', created_at: ago(2),  due_date: ago(-3) },
  { task_id: 'tsk-002', type: 'data_quality_fix',     title: 'Fix 312 invalid email addresses in customers', description: 'Correct or null-out RFC 5322-invalid emails identified by quality rule', assignee: 'arun.patel@corp.com',    status: 'in_progress', priority: 'high',   asset_id: 'asset-023', created_at: ago(2),  due_date: ago(-2) },
  { task_id: 'tsk-003', type: 'documentation',        title: 'Add business description to SHOP_FLOOR_EVENTS', description: 'Document field semantics and IoT sensor mapping for new team members', assignee: 'elena.kowalski@corp.com', status: 'open',        priority: 'low',    asset_id: 'asset-038', created_at: ago(7),  due_date: ago(-14) },
  { task_id: 'tsk-004', type: 'owner_assignment',     title: 'Assign data owner to attribution view',        description: 'Attribution view is deprecated but still has active consumers — assign owner to manage lifecycle', assignee: 'sofia.delgado@corp.com', status: 'open', priority: 'medium', asset_id: 'asset-014', created_at: ago(5),  due_date: ago(-7) },
  { task_id: 'tsk-005', type: 'compliance_review',    title: 'GDPR review: customers.phone data retention',  description: 'Verify phone data retention is within policy — 7-year window check required', assignee: 'admin@corp.com',          status: 'open',        priority: 'medium', asset_id: 'asset-023', created_at: ago(10), due_date: ago(-5) },
  { task_id: 'tsk-006', type: 'rule_approval',        title: 'Review and approve BOM completeness rule',     description: 'New null check on BOM.component_code pending approval before activation', assignee: 'michael.chen@corp.com',  status: 'open',        priority: 'medium', asset_id: 'asset-034', created_at: ago(2),  due_date: ago(-1) },
]

// ─────────────────────────── execution logs ─────────────────────────────────

export const DEMO_EXECUTION_LOGS = [
  { run_id: 'run-001', job_id: 'job-001', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',           asset_name: 'INVENTORY',             rule_name: 'Freshness: INVENTORY',              status: 'failed',  started_at: ago(0, 6),  ended_at: ago(0, 6),  duration_ms: 1820, rows_evaluated: 69400, rows_failed: 69400, error_message: 'Table not updated in 26h (threshold: 12h)' },
  { run_id: 'run-002', job_id: 'job-001', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',           asset_name: 'SALES_ORDERS',          rule_name: 'Volume: SALES_ORDERS (daily min)',  status: 'failed',  started_at: ago(0, 6),  ended_at: ago(0, 6),  duration_ms: 2140, rows_evaluated: 2410832, rows_failed: 1, error_message: '0 new rows in last 24h (min: 10)' },
  { run_id: 'run-003', job_id: 'job-001', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',           asset_name: 'SALES_ORDERS',          rule_name: 'Uniqueness: SALES_ORDERS.ORDER_ID', status: 'passed',  started_at: ago(0, 6),  ended_at: ago(0, 6),  duration_ms: 4820, rows_evaluated: 2410832, rows_failed: 0 },
  { run_id: 'run-004', job_id: 'job-001', connection_id: 'demo-conn-001', connection_name: 'Supply Chain DB',           asset_name: 'CUSTOMERS',             rule_name: 'Null: CUSTOMERS.CUSTOMER_NAME',     status: 'passed',  started_at: ago(0, 6),  ended_at: ago(0, 6),  duration_ms: 2910, rows_evaluated: 485200, rows_failed: 0 },
  { run_id: 'run-005', job_id: 'job-002', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_name: 'ad_spend',       rule_name: 'Range: ad_spend.cost_per_click',    status: 'failed',  started_at: ago(0, 8),  ended_at: ago(0, 8),  duration_ms: 3140, rows_evaluated: 92800, rows_failed: 24, error_message: '24 rows with CPC > $50 (max $487.32)' },
  { run_id: 'run-006', job_id: 'job-002', connection_id: 'demo-conn-002', connection_name: 'Marketing Analytics (BigQuery)', asset_name: 'campaigns',      rule_name: 'Uniqueness: campaigns.campaign_id', status: 'passed',  started_at: ago(0, 8),  ended_at: ago(0, 8),  duration_ms: 1240, rows_evaluated: 8430, rows_failed: 0 },
  { run_id: 'run-007', job_id: 'job-003', connection_id: 'demo-conn-003', connection_name: 'Customer 360 (PostgreSQL)',  asset_name: 'customers',             rule_name: 'Email Format: customers.email',     status: 'failed',  started_at: ago(0, 1),  ended_at: ago(0, 1),  duration_ms: 8420, rows_evaluated: 1840220, rows_failed: 312, error_message: '312 emails fail RFC 5322 validation' },
  { run_id: 'run-008', job_id: 'job-005', connection_id: 'demo-conn-005', connection_name: 'Oracle Financials (ERP)',    asset_name: 'FINANCE_TRANSACTIONS',  rule_name: 'Freshness: FINANCE_TRANSACTIONS',   status: 'error',   started_at: ago(1, 2),  ended_at: ago(1, 2),  duration_ms: 8000, rows_evaluated: 0, rows_failed: 0, error_message: 'ORA-12170: TNS:Connect timeout occurred' },
  { run_id: 'run-009', job_id: 'job-006', connection_id: 'demo-conn-006', connection_name: 'Oracle Manufacturing (ERP)', asset_name: 'WORK_ORDERS',           rule_name: 'Null: WORK_ORDERS.completion_date', status: 'failed',  started_at: ago(0, 9),  ended_at: ago(0, 9),  duration_ms: 5820, rows_evaluated: 384200, rows_failed: 69200, error_message: '18% null completion_date (threshold: 5%)' },
  { run_id: 'run-010', job_id: 'job-004', connection_id: 'demo-conn-004', connection_name: 'Enterprise DW (Redshift)',   asset_name: 'fact_sales',            rule_name: 'Null: fact_sales.revenue',          status: 'passed',  started_at: ago(0, 5),  ended_at: ago(0, 5),  duration_ms: 12840, rows_evaluated: 18200000, rows_failed: 0 },
]

// ─────────────────────────── monitoring — SLA predictions & correlated ───────

export const DEMO_SLA_PREDICTIONS = [
  { prediction_id: 'slap-001', asset_id: 'asset-018', asset_name: 'FINANCE_TRANSACTIONS', connection_id: 'demo-conn-005', predicted_breach: true,  confidence: 0.97, days_until_breach: 0,  current_freshness_hours: 28, sla_threshold_hours: 24, predicted_at: ago(0, 1) },
  { prediction_id: 'slap-002', asset_id: 'asset-005', asset_name: 'INVENTORY',            connection_id: 'demo-conn-001', predicted_breach: true,  confidence: 0.93, days_until_breach: 0,  current_freshness_hours: 26, sla_threshold_hours: 12, predicted_at: ago(0, 1) },
  { prediction_id: 'slap-003', asset_id: 'asset-001', asset_name: 'SALES_ORDERS',         connection_id: 'demo-conn-001', predicted_breach: true,  confidence: 0.78, days_until_breach: 1,  current_freshness_hours: 14, sla_threshold_hours: 12, predicted_at: ago(0, 1) },
  { prediction_id: 'slap-004', asset_id: 'asset-019', asset_name: 'AP_INVOICES',          connection_id: 'demo-conn-005', predicted_breach: true,  confidence: 0.65, days_until_breach: 2,  current_freshness_hours: 28, sla_threshold_hours: 24, predicted_at: ago(0, 1) },
  { prediction_id: 'slap-005', asset_id: 'asset-033', asset_name: 'WORK_ORDERS',          connection_id: 'demo-conn-006', predicted_breach: false, confidence: 0.71, days_until_breach: 4,  current_freshness_hours: 9,  sla_threshold_hours: 12, predicted_at: ago(0, 1) },
]

export const DEMO_CORRELATED_INCIDENTS = [
  { correlation_id: 'corr-001', primary_incident_id: 'inc-001', related_incidents: ['inc-004'], correlation_score: 0.92, root_cause: 'Oracle Financials ETL pipeline failure caused both FINANCE_TRANSACTIONS stale data and AP_INVOICES processing gap', status: 'open',     detected_at: ago(1) },
  { correlation_id: 'corr-002', primary_incident_id: 'inc-002', related_incidents: ['inc-007'], correlation_score: 0.78, root_cause: 'nightly maintenance script regression affected both INVENTORY volume and WORK_ORDERS completeness',               status: 'open',     detected_at: ago(1) },
  { correlation_id: 'corr-003', primary_incident_id: 'inc-003', related_incidents: [],          correlation_score: 0.55, root_cause: 'Google Ads connector currency mismatch — isolated to ad_spend table, no cross-domain impact',                   status: 'open',     detected_at: ago(3) },
  { correlation_id: 'corr-004', primary_incident_id: 'inc-004', related_incidents: ['inc-001'], correlation_score: 0.92, root_cause: 'Same Oracle ETL job failure as corr-001',                                                                       status: 'resolved', detected_at: ago(5) },
]

// ─────────────────────────── quality score history (per asset) ───────────────

function qhistory(assetId: string, baseline: number, days = 30) {
  const entries = []
  let score = baseline
  const base = new Date('2026-06-29')
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i)
    // Random walk ±2, clamped to [50, 100]
    score = Math.min(100, Math.max(50, score + (Math.random() > 0.5 ? 1 : -1) * Math.round(Math.random() * 2)))
    entries.push({ score_date: d.toISOString().slice(0, 10), overall_score: score })
  }
  return { asset_id: assetId, history: entries }
}

export const DEMO_QUALITY_HISTORY_MAP: Record<string, { asset_id: string; history: { score_date: string; overall_score: number }[] }> = {
  'asset-001': qhistory('asset-001', 88),
  'asset-002': qhistory('asset-002', 91),
  'asset-003': qhistory('asset-003', 82),
  'asset-004': qhistory('asset-004', 94),
  'asset-005': qhistory('asset-005', 68),
  'asset-010': qhistory('asset-010', 91),
  'asset-013': qhistory('asset-013', 74),
  'asset-017': qhistory('asset-017', 84),
  'asset-018': qhistory('asset-018', 61),
  'asset-019': qhistory('asset-019', 78),
  'asset-023': qhistory('asset-023', 85),
  'asset-024': qhistory('asset-024', 89),
  'asset-029': qhistory('asset-029', 90),
  'asset-033': qhistory('asset-033', 71),
  'asset-034': qhistory('asset-034', 88),
}

// ─────────────────────────── lineage ─────────────────────────────────────────

// Lineage — field names must match LineageNode/LineageEdge interfaces in lineage/page.tsx
export const DEMO_LINEAGE = {
  nodes: [
    { id: 'asset-001', label: 'SALES_ORDERS',    sub: 'SUPPLYCHAIN · SUPPLYCHAIN_DB',               type: 'source',    icon: '📦', schema: 'SUPPLYCHAIN',          database: 'SUPPLYCHAIN_DB',         tableType: 'table', rowCount: 2410832,  columnCount: 18, lastAltered: '2026-06-28', comment: 'All customer sales orders',         ownerName: 'Priya Sharma' },
    { id: 'asset-002', label: 'CUSTOMERS',        sub: 'SUPPLYCHAIN · SUPPLYCHAIN_DB',               type: 'source',    icon: '👤', schema: 'SUPPLYCHAIN',          database: 'SUPPLYCHAIN_DB',         tableType: 'table', rowCount: 485200,   columnCount: 22, lastAltered: '2026-06-28', comment: 'Master customer records',           ownerName: 'Priya Sharma' },
    { id: 'asset-004', label: 'PRODUCTS',         sub: 'SUPPLYCHAIN · SUPPLYCHAIN_DB',               type: 'source',    icon: '🏷️', schema: 'SUPPLYCHAIN',          database: 'SUPPLYCHAIN_DB',         tableType: 'table', rowCount: 12650,    columnCount: 16, lastAltered: '2026-06-28', comment: 'Product catalogue with SKUs',       ownerName: 'Priya Sharma' },
    { id: 'asset-010', label: 'campaigns',        sub: 'marketing_analytics · analytics-prod-12345', type: 'source',    icon: '📢', schema: 'marketing_analytics',  database: 'analytics-prod-12345',   tableType: 'table', rowCount: 8430,     columnCount: 19, lastAltered: '2026-06-29', comment: 'All marketing campaigns',           ownerName: 'Sofia Delgado' },
    { id: 'asset-013', label: 'ad_spend',         sub: 'marketing_analytics · analytics-prod-12345', type: 'raw',       icon: '💰', schema: 'marketing_analytics',  database: 'analytics-prod-12345',   tableType: 'table', rowCount: 92800,    columnCount: 9,  lastAltered: '2026-06-29', comment: 'Daily ad spend by channel',         ownerName: 'Sofia Delgado' },
    { id: 'asset-023', label: 'customers',        sub: 'public · customer_360',                      type: 'source',    icon: '👤', schema: 'public',               database: 'customer_360',           tableType: 'table', rowCount: 1840220,  columnCount: 24, lastAltered: '2026-06-29', comment: 'Unified customer profile',          ownerName: 'Arun Patel' },
    { id: 'asset-029', label: 'fact_sales',       sub: 'public · data_warehouse',                    type: 'transform', icon: '📊', schema: 'public',               database: 'data_warehouse',         tableType: 'table', rowCount: 18200000, columnCount: 26, lastAltered: '2026-06-29', comment: 'Central sales fact table',          ownerName: 'David Park' },
    { id: 'asset-030', label: 'dim_customer',     sub: 'public · data_warehouse',                    type: 'warehouse', icon: '🏛️', schema: 'public',               database: 'data_warehouse',         tableType: 'table', rowCount: 492000,   columnCount: 18, lastAltered: '2026-06-29', comment: 'Customer dimension SCD Type 2',     ownerName: 'David Park' },
    { id: 'asset-031', label: 'dim_product',      sub: 'public · data_warehouse',                    type: 'warehouse', icon: '🏛️', schema: 'public',               database: 'data_warehouse',         tableType: 'table', rowCount: 14200,    columnCount: 15, lastAltered: '2026-06-29', comment: 'Product dimension',                 ownerName: 'David Park' },
    { id: 'asset-028', label: 'revenue_summary',  sub: 'reporting · data_warehouse',                 type: 'output',    icon: '📈', schema: 'reporting',            database: 'data_warehouse',         tableType: 'view',  rowCount: 84000,    columnCount: 12, lastAltered: '2026-06-29', comment: 'Pre-aggregated executive summary',  ownerName: 'David Park' },
    { id: 'asset-011', label: 'conversions',      sub: 'marketing_analytics · analytics-prod-12345', type: 'output',    icon: '🎯', schema: 'marketing_analytics',  database: 'analytics-prod-12345',   tableType: 'table', rowCount: 624180,   columnCount: 11, lastAltered: '2026-06-29', comment: 'Conversions attributed to campaigns',ownerName: 'Sofia Delgado' },
  ],
  edges: [
    { from: 'asset-001', to: 'asset-029', relationship: 'ETL daily' },
    { from: 'asset-002', to: 'asset-030', relationship: 'ETL daily' },
    { from: 'asset-023', to: 'asset-030', relationship: 'merge' },
    { from: 'asset-004', to: 'asset-031', relationship: 'ETL daily' },
    { from: 'asset-029', to: 'asset-028', relationship: 'aggregated' },
    { from: 'asset-030', to: 'asset-028', relationship: 'dimension join' },
    { from: 'asset-010', to: 'asset-011', relationship: 'attribution model' },
    { from: 'asset-013', to: 'asset-011', relationship: 'cost attribution' },
  ],
  connection: { name: 'All Connections', database: 'Multiple', schema: 'Multiple', warehouse: 'COMPUTE_WH', status: 'active' },
  meta: { edgeMethods: { fk: 2, ddl: 4, heuristic: 2 }, totalTables: 11, totalEdges: 8 },
}

// ─────────────────────────── per-connection dashboard data ───────────────────

function connTrend(base: number, volatility: number, tag: string) {
  const days = [29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0]
  let s = base - 4
  return days.map(d => {
    s = Math.min(100, Math.max(50, s + (d % 3 === 0 ? volatility : -volatility + 1)))
    return trendDay(d, s, Math.max(0, Math.round((100 - s) * 0.12) + (tag === 'finance' ? 2 : 0)))
  })
}

export const DEMO_DASHBOARD_BY_CONN: Record<string, typeof DEMO_DASHBOARD> = {
  'demo-conn-001': {
    overallScore: 88, totalAssets: 6, totalRules: 28, openAlerts: 2, criticalAlerts: 1, mediumAlerts: 1,
    passed: 26, failed: 2,
    trend: connTrend(88, 1, 'supply'),
    dimensions: { completeness: 92, accuracy: 87, uniqueness: 97, validity: 89, timeliness: 74, consistency: 91 },
    failingRules: [
      { rule_name: 'Freshness: INVENTORY',    asset_name: 'SUPPLYCHAIN.INVENTORY',    detail: 'Last updated 26 h ago (threshold: 12 h)', severity: 'critical' },
      { rule_name: 'Volume: SALES_ORDERS',    asset_name: 'SUPPLYCHAIN.SALES_ORDERS', detail: '0 new rows in last 24 h (min: 10)',        severity: 'high' },
    ],
    atRiskTables: [
      { asset_name: 'SUPPLYCHAIN.INVENTORY',    domain_name: 'Operations', score: 68, score_delta: -5 },
      { asset_name: 'SUPPLYCHAIN.SALES_ORDERS', domain_name: 'Revenue',    score: 88, score_delta: -2 },
    ],
  },
  'demo-conn-002': {
    overallScore: 83, totalAssets: 5, totalRules: 18, openAlerts: 2, criticalAlerts: 0, mediumAlerts: 2,
    passed: 16, failed: 2,
    trend: connTrend(83, 2, 'marketing'),
    dimensions: { completeness: 90, accuracy: 86, uniqueness: 96, validity: 82, timeliness: 70, consistency: 80 },
    failingRules: [
      { rule_name: 'Range: ad_spend.cost_per_click', asset_name: 'marketing_analytics.ad_spend', detail: '24 rows with CPC > $50 (max $487.32)', severity: 'high' },
      { rule_name: 'Freshness: ad_spend',            asset_name: 'marketing_analytics.ad_spend', detail: 'Last updated 14 h ago (threshold: 8 h)',  severity: 'medium' },
    ],
    atRiskTables: [
      { asset_name: 'marketing_analytics.ad_spend',   domain_name: 'Marketing', score: 74, score_delta: -4 },
      { asset_name: 'marketing_analytics.attribution',domain_name: 'Marketing', score: 77, score_delta: -3 },
    ],
  },
  'demo-conn-003': {
    overallScore: 82, totalAssets: 5, totalRules: 22, openAlerts: 1, criticalAlerts: 0, mediumAlerts: 1,
    passed: 21, failed: 1,
    trend: connTrend(82, 1, 'customer'),
    dimensions: { completeness: 87, accuracy: 83, uniqueness: 94, validity: 85, timeliness: 78, consistency: 80 },
    failingRules: [
      { rule_name: 'Email Format: customers.email', asset_name: 'public.customers', detail: '312 emails fail RFC 5322 validation', severity: 'high' },
    ],
    atRiskTables: [
      { asset_name: 'public.customers',    domain_name: 'Customer', score: 85, score_delta: -2 },
      { asset_name: 'public.interactions', domain_name: 'Customer', score: 79, score_delta: -1 },
    ],
  },
  'demo-conn-004': {
    overallScore: 91, totalAssets: 5, totalRules: 24, openAlerts: 0, criticalAlerts: 0, mediumAlerts: 0,
    passed: 24, failed: 0,
    trend: connTrend(91, 1, 'dw'),
    dimensions: { completeness: 95, accuracy: 92, uniqueness: 99, validity: 93, timeliness: 86, consistency: 92 },
    failingRules: [],
    atRiskTables: [],
  },
  'demo-conn-005': {
    overallScore: 74, totalAssets: 7, totalRules: 32, openAlerts: 3, criticalAlerts: 2, mediumAlerts: 1,
    passed: 28, failed: 4,
    trend: connTrend(74, 3, 'finance'),
    dimensions: { completeness: 80, accuracy: 75, uniqueness: 93, validity: 78, timeliness: 52, consistency: 76 },
    failingRules: [
      { rule_name: 'Freshness: FINANCE_TRANSACTIONS',asset_name: 'FINANCE.FINANCE_TRANSACTIONS', detail: 'Last updated 28 h ago (threshold: 24 h)', severity: 'critical' },
      { rule_name: 'Freshness: AP_INVOICES',         asset_name: 'FINANCE.AP_INVOICES',          detail: 'Last updated 26 h ago (threshold: 24 h)', severity: 'critical' },
      { rule_name: 'Null: FINANCE_TRANSACTIONS.amount', asset_name: 'FINANCE.FINANCE_TRANSACTIONS', detail: '841 rows with null amount',             severity: 'high' },
    ],
    atRiskTables: [
      { asset_name: 'FINANCE.FINANCE_TRANSACTIONS', domain_name: 'Finance', score: 61, score_delta: -8 },
      { asset_name: 'FINANCE.AP_INVOICES',          domain_name: 'Finance', score: 78, score_delta: -4 },
    ],
  },
  'demo-conn-006': {
    overallScore: 80, totalAssets: 6, totalRules: 20, openAlerts: 2, criticalAlerts: 0, mediumAlerts: 2,
    passed: 18, failed: 2,
    trend: connTrend(80, 2, 'mfg'),
    dimensions: { completeness: 83, accuracy: 81, uniqueness: 92, validity: 82, timeliness: 68, consistency: 78 },
    failingRules: [
      { rule_name: 'Null: WORK_ORDERS.completion_date', asset_name: 'MFG.WORK_ORDERS',           detail: '18% null completion_date (threshold: 5%)', severity: 'high' },
      { rule_name: 'Defect Rate: QUALITY_INSPECTIONS',  asset_name: 'MFG.QUALITY_INSPECTIONS',   detail: 'Defect rate 8.4% exceeds 5% threshold',    severity: 'medium' },
    ],
    atRiskTables: [
      { asset_name: 'MFG.WORK_ORDERS',          domain_name: 'Manufacturing', score: 71, score_delta: -4 },
      { asset_name: 'MFG.SHOP_FLOOR_EVENTS',    domain_name: 'Manufacturing', score: 74, score_delta: -2 },
    ],
  },
}

// ─────────────────────────── audit logs ──────────────────────────────────────

export const DEMO_AUDIT_LOGS = [
  { log_id: 'aud-001', action: 'rule.created',         actor: 'priya.sharma@corp.com',      target_type: 'rule',        target_id: 'rule-030', target_name: 'Null: BOM.component_code',              connection_id: 'demo-conn-006', created_at: ago(2, 3),  ip_address: '10.0.1.42',  suspicious: false },
  { log_id: 'aud-002', action: 'rule.status_changed',  actor: 'james.okonkwo@corp.com',     target_type: 'rule',        target_id: 'rule-003', target_name: 'Freshness: INVENTORY',                  connection_id: 'demo-conn-001', created_at: ago(1, 10), ip_address: '10.0.1.18',  suspicious: false },
  { log_id: 'aud-003', action: 'asset.certified',      actor: 'priya.sharma@corp.com',      target_type: 'asset',       target_id: 'asset-004',target_name: 'PRODUCTS',                              connection_id: 'demo-conn-001', created_at: ago(3, 2),  ip_address: '10.0.1.42',  suspicious: false },
  { log_id: 'aud-004', action: 'policy.updated',       actor: 'admin@corp.com',             target_type: 'policy',      target_id: 'pol-001',  target_name: 'PII Data Access Policy',                connection_id: null,            created_at: ago(4, 8),  ip_address: '10.0.0.10',  suspicious: false },
  { log_id: 'aud-005', action: 'user.login',           actor: 'michael.chen@corp.com',      target_type: 'session',     target_id: 'sess-092', target_name: null,                                    connection_id: null,            created_at: ago(0, 18), ip_address: '192.168.2.11',suspicious: false },
  { log_id: 'aud-006', action: 'data.exported',        actor: 'viewer@corp.com',            target_type: 'asset',       target_id: 'asset-023',target_name: 'customers',                             connection_id: 'demo-conn-003', created_at: ago(0, 7),  ip_address: '203.0.113.55',suspicious: true,  suspicious_reason: 'export from off-network IP at unusual hour' },
  { log_id: 'aud-007', action: 'connection.test',      actor: 'david.park@corp.com',        target_type: 'connection',  target_id: 'demo-conn-004', target_name: 'Enterprise DW (Redshift)',          connection_id: 'demo-conn-004', created_at: ago(1, 6),  ip_address: '10.0.1.55',  suspicious: false },
  { log_id: 'aud-008', action: 'approval.rejected',    actor: 'admin@corp.com',             target_type: 'approval',    target_id: 'apr-005',  target_name: 'FINANCE_TRANSACTIONS access request',   connection_id: null,            created_at: ago(0, 14), ip_address: '10.0.0.10',  suspicious: false },
  { log_id: 'aud-009', action: 'issue.resolved',       actor: 'sofia.delgado@corp.com',     target_type: 'issue',       target_id: 'iss-003',  target_name: 'ad_spend CPC anomaly',                  connection_id: 'demo-conn-002', created_at: ago(1, 4),  ip_address: '10.0.1.20',  suspicious: false },
  { log_id: 'aud-010', action: 'rule.bulk_executed',   actor: 'system',                     target_type: 'scan_job',    target_id: 'job-001',  target_name: 'Daily Quality Scan — Supply Chain',     connection_id: 'demo-conn-001', created_at: ago(0, 6),  ip_address: null,         suspicious: false },
  { log_id: 'aud-011', action: 'user.password_reset',  actor: 'elena.kowalski@corp.com',    target_type: 'user',        target_id: 'usr-006',  target_name: 'Elena Kowalski',                        connection_id: null,            created_at: ago(5, 2),  ip_address: '10.0.1.60',  suspicious: false },
  { log_id: 'aud-012', action: 'data.exported',        actor: 'viewer@corp.com',            target_type: 'asset',       target_id: 'asset-018',target_name: 'FINANCE_TRANSACTIONS',                  connection_id: 'demo-conn-005', created_at: ago(0, 8),  ip_address: '203.0.113.55',suspicious: true,  suspicious_reason: 'second export of sensitive financial data within 2h from same anomalous IP' },
]

export const DEMO_AUDIT_COVERAGE = {
  coverage_pct: 78.4,
  covered_types: 7,
  total_governed_types: 9,
  uncovered_types: ['data_product_access', 'schema_change'],
  by_type: [
    { type: 'rule_execution',  coverage_pct: 100, rule_count: 32 },
    { type: 'asset_change',    coverage_pct: 95,  rule_count: 20 },
    { type: 'user_access',     coverage_pct: 88,  rule_count: 15 },
    { type: 'data_export',     coverage_pct: 72,  rule_count: 18 },
    { type: 'policy_change',   coverage_pct: 100, rule_count: 8  },
    { type: 'connection_test', coverage_pct: 100, rule_count: 6  },
    { type: 'approval_action', coverage_pct: 100, rule_count: 5  },
  ],
}

// ─────────────────────────── privacy ─────────────────────────────────────────

export const DEMO_PII_EXPOSURE = {
  unprotected_pii_tables: 3,
  risk_score: 42,
  assets: [
    { asset_id: 'asset-023', asset_name: 'customers',    connection_name: 'Customer 360 (PostgreSQL)', pii_columns: ['email', 'phone', 'first_name', 'last_name', 'address'], unprotected_columns: 2, masking_policy_applied: false, classification: 'PII' },
    { asset_id: 'asset-025', asset_name: 'interactions', connection_name: 'Customer 360 (PostgreSQL)', pii_columns: ['customer_email', 'agent_notes'], unprotected_columns: 2, masking_policy_applied: false, classification: 'PII' },
    { asset_id: 'asset-012', asset_name: 'leads',        connection_name: 'Marketing Analytics (BigQuery)', pii_columns: ['email', 'phone', 'name'], unprotected_columns: 3, masking_policy_applied: false, classification: 'PII' },
    { asset_id: 'asset-026', asset_name: 'subscriptions',connection_name: 'Customer 360 (PostgreSQL)', pii_columns: ['customer_email', 'payment_method_last4'], unprotected_columns: 1, masking_policy_applied: true, classification: 'PII' },
    { asset_id: 'asset-002', asset_name: 'CUSTOMERS',    connection_name: 'Supply Chain DB',            pii_columns: ['CONTACT_EMAIL', 'PHONE_NUMBER', 'BILLING_ADDRESS'], unprotected_columns: 0, masking_policy_applied: true, classification: 'PII' },
  ],
}

export const DEMO_MASKING_POLICIES = [
  { policy_id: 'msk-001', name: 'Mask Customer Email',     asset_id: 'asset-002', column_name: 'CONTACT_EMAIL',    masking_type: 'partial', pattern: '***@***.***', created_by: 'admin@corp.com', created_at: ago(60), is_active: true },
  { policy_id: 'msk-002', name: 'Mask Customer Phone',     asset_id: 'asset-002', column_name: 'PHONE_NUMBER',     masking_type: 'full',    pattern: 'XXXX-XXXX',   created_by: 'admin@corp.com', created_at: ago(60), is_active: true },
  { policy_id: 'msk-003', name: 'Mask Subscription Email', asset_id: 'asset-026', column_name: 'customer_email',   masking_type: 'partial', pattern: '***@***.***', created_by: 'arun.patel@corp.com', created_at: ago(30), is_active: true },
  { policy_id: 'msk-004', name: 'Mask Payment Last4',      asset_id: 'asset-026', column_name: 'payment_method_last4', masking_type: 'full', pattern: '****',       created_by: 'arun.patel@corp.com', created_at: ago(30), is_active: true },
]

export const DEMO_RESIDENCY = [
  { residency_id: 'res-001', asset_id: 'asset-023', asset_name: 'customers',     connection_name: 'Customer 360 (PostgreSQL)', region: 'us-east-1', data_sovereignty: 'US', compliant: true,  regulation: 'CCPA',  last_verified_at: ago(7)  },
  { residency_id: 'res-002', asset_id: 'asset-026', asset_name: 'subscriptions', connection_name: 'Customer 360 (PostgreSQL)', region: 'us-east-1', data_sovereignty: 'US', compliant: true,  regulation: 'CCPA',  last_verified_at: ago(7)  },
  { residency_id: 'res-003', asset_id: 'asset-012', asset_name: 'leads',         connection_name: 'Marketing Analytics (BigQuery)', region: 'eu-west-1', data_sovereignty: 'EU', compliant: true, regulation: 'GDPR', last_verified_at: ago(14) },
  { residency_id: 'res-004', asset_id: 'asset-023', asset_name: 'customers (EU)',connection_name: 'Customer 360 (PostgreSQL)', region: 'eu-west-1', data_sovereignty: 'EU', compliant: false, regulation: 'GDPR',  last_verified_at: ago(2),  violation: 'customer EU PII is replicated to us-east-1 without SCCs' },
]

// ─────────────────────────── alert routing rules & escalation policies ────────

export const DEMO_ALERT_ROUTING_RULES = [
  { rule_id: 'arr-001', name: 'Critical Finance Alerts → Michael Chen',   conditions: { domain: 'Finance', severity: 'critical' },  channels: ['email', 'pagerduty'], assignee: 'michael.chen@corp.com', is_active: true,  created_at: ago(60) },
  { rule_id: 'arr-002', name: 'PII Alerts → Privacy Team',                conditions: { tag: 'PII' },                               channels: ['email', 'slack'],     assignee: 'admin@corp.com',        is_active: true,  created_at: ago(45) },
  { rule_id: 'arr-003', name: 'Manufacturing Freshness → Elena',           conditions: { domain: 'Manufacturing', rule_type: 'freshness_check' }, channels: ['email'], assignee: 'elena.kowalski@corp.com', is_active: true, created_at: ago(30) },
  { rule_id: 'arr-004', name: 'Marketing Anomalies → Sofia',               conditions: { domain: 'Marketing', rule_type: 'anomaly' },channels: ['slack'],              assignee: 'sofia.delgado@corp.com', is_active: false, created_at: ago(20) },
  { rule_id: 'arr-005', name: 'SOX Assets → Compliance Team',              conditions: { tag: 'SOX' },                               channels: ['email'],              assignee: 'admin@corp.com',        is_active: true,  created_at: ago(90) },
]

export const DEMO_ESCALATION_POLICIES = [
  { policy_id: 'esc-001', name: 'Critical Data Outage',   steps: [{ level: 1, wait_minutes: 15, notify: 'on-call-data-eng@corp.com' }, { level: 2, wait_minutes: 30, notify: 'vp-engineering@corp.com' }], is_active: true,  created_at: ago(120) },
  { policy_id: 'esc-002', name: 'Finance Data SLA Breach',steps: [{ level: 1, wait_minutes: 10, notify: 'michael.chen@corp.com' }, { level: 2, wait_minutes: 30, notify: 'cfo-office@corp.com' }],          is_active: true,  created_at: ago(90)  },
  { policy_id: 'esc-003', name: 'Privacy Incident',       steps: [{ level: 1, wait_minutes: 5,  notify: 'dpo@corp.com' }, { level: 2, wait_minutes: 15, notify: 'legal@corp.com' }, { level: 3, wait_minutes: 60, notify: 'ceo@corp.com' }], is_active: true, created_at: ago(60) },
]
