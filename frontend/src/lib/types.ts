export type ConnectionType = 'postgresql' | 'mysql' | 'bigquery' | 'snowflake' | 'csv' | 'api' | 'mongodb' | 'redshift' | 'databricks' | 'sqlserver' | 'oracle' | 'db2' | 'saphana' | 'hive' | 'synapse' | 'teradata' | 'tableau' | 'powerbi' | 'looker' | 's3' | 'gcs' | 'azureblob' | 'kafka' | 'kinesis' | 'dbt' | 'fivetran' | 'airbyte'

export interface Connection {
  id: string
  name: string
  type: ConnectionType
  // Common fields
  host?: string
  port?: number
  database?: string
  username?: string
  schema?: string
  // Snowflake-specific
  account?: string
  warehouse?: string
  role?: string
  excludedDatabases?: string[]
  excludedSchemas?: Array<{ database: string; schema: string }>
  filterMode?: 'include' | 'exclude'
  includedDatabases?: string[]
  includedSchemas?: Array<{ database: string; schema: string }>
  // BigQuery-specific
  project?: string
  keyFile?: string
  // MongoDB / API
  connectionString?: string
  baseUrl?: string
  authType?: string
  delimiter?: string
  filePath?: string
  status: 'active' | 'inactive' | 'error'
  lastTested?: string
  createdAt: string
  [key: string]: unknown   // allow extra fields without TS errors
}

export type RuleCategory = 'completeness' | 'accuracy' | 'uniqueness' | 'validity' | 'timeliness' | 'consistency'
export type RuleType =
  | 'not_null' | 'unique' | 'range' | 'regex' | 'custom_sql' | 'freshness' | 'row_count' | 'referential'
  | 'null_check' | 'uniqueness_check' | 'duplicate_check' | 'accepted_values_check'
  | 'range_check' | 'freshness_check' | 'volume_check' | 'schema_drift_check'
  | 'referential_integrity_check' | 'regex_check' | 'business_rule_check' | 'custom_sql_check'
  | 'semantic_consistency_check' | 'referential_sanity_check' | 'business_metric_check'
  | 'distribution_consistency_check' | 'llm_semantic_check' | 'comparison_check'

export type RuleStatus = 'active' | 'draft' | 'pending_review' | 'disabled' | 'archived'

export interface Rule {
  id: string
  name: string
  description: string
  category: RuleCategory
  type: RuleType
  connectionId: string
  tableName: string
  columnName?: string
  parameters: Record<string, unknown>
  enabled: boolean
  status: RuleStatus
  severity: 'critical' | 'high' | 'medium' | 'low'
  scope: 'generic' | 'object-specific'
  assetId?: string
  domainId?: string
  subdomainId?: string
  createdAt: string
  createdBy?: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  lastRunAt?: string
  lastRunStatus?: 'passed' | 'failed' | 'warning' | 'error'
  lastRunScore?: number
}

export interface CheckResult {
  ruleId: string
  ruleName: string
  connectionName: string
  tableName: string
  columnName?: string
  status: 'passed' | 'failed' | 'warning'
  score: number
  recordsChecked: number
  recordsFailed: number
  executedAt: string
  duration: number
  details?: string
  ruleType?: RuleType
  ruleCategory?: RuleCategory
  severity?: 'critical' | 'high' | 'medium' | 'low'
  scope?: 'generic' | 'object-specific'
  sql?: string
}

export interface Report {
  id: string
  name: string
  overallScore: number
  totalChecks: number
  passed: number
  failed: number
  warnings: number
  executedAt: string
  results: CheckResult[]
  trend: { date: string; score: number }[]
}

export interface DimensionScores {
  completeness: number | null
  accuracy:     number | null
  uniqueness:   number | null
  validity:     number | null
  timeliness:   number | null
  consistency:  number | null
}

export type QualityDimension =
  | 'completeness'
  | 'validity'
  | 'uniqueness'
  | 'timeliness'
  | 'consistency'
  | 'integrity'

export interface QualityDimensionDetail {
  score: number | null
  source: 'rules' | 'profiling' | 'rollup' | 'none'
  total_rules: number
  passed_rules: number
  failed_rules: number
}

export interface AssetQualityScore {
  asset_id: string
  score_date: string | null
  overall_score: number | null
  dimensions: Record<QualityDimension, QualityDimensionDetail>
}

export interface AssetQualityHistoryPoint {
  date: string
  overall_score: number | null
  dimensions: Record<QualityDimension, number | null>
}

export interface AssetQualityHistory {
  asset_id: string
  history: AssetQualityHistoryPoint[]
}

export interface ForecastPoint {
  date: string
  score: number
}

export interface ForecastResponse {
  asset_id: string
  history: ForecastPoint[]
  forecast: ForecastPoint[]
  upper_band: ForecastPoint[]
  lower_band: ForecastPoint[]
  insufficient_history: boolean
}

export interface FailingRule {
  rule_name:  string
  asset_name: string
  detail:     string
  severity:   string
}

export interface AtRiskTable {
  asset_name:  string
  domain_name: string
  score:       number
  score_delta: number | null
}

export interface DashboardStats {
  overallScore:      number | null
  totalAssets:       number
  totalRules:        number
  openAlerts:        number
  criticalAlerts:    number
  mediumAlerts:      number
  passed:            number
  failed:            number
  trend:             { date: string; score: number | null; failed: number }[]
  dimensions:        DimensionScores
  failingRules:      FailingRule[]
  atRiskTables:      AtRiskTable[]
  activeConnections: number
  recentChecks:      CheckResult[]
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolsUsed?: string[]
}

export type AssetType =
  | 'source' | 'database' | 'schema' | 'table'
  | 'column' | 'file' | 'dataset' | 'logical_dataset';

export type AssetStatus = 'active' | 'missing' | 'deprecated' | 'scan_failed' | 'disabled';

export interface Asset {
  asset_id: string;
  asset_type: AssetType;
  physical_name: string | null;
  display_name: string | null;
  qualified_name: string | null;
  path: string | null;
  status: AssetStatus;
  parent_asset_id: string | null;
  connection_id: string | null;
  owner_user_id: string | null;
  owner_team_id: string | null;
  steward_user_id: string | null;
  domain: string | null;
  sensitivity: string | null;
  discovered_at: string | null;
  last_seen_at: string | null;
  criticality: string | null;
  description: string | null;
}

export interface AssetTreeNode extends Asset {
  children: AssetTreeNode[];
}

export interface TrendPoint {
  date: string
  score: number | null
  failed: number
  alert_count?: number
  anomaly_count?: number
}

export interface TrendScope {
  domainId?: string
  subdomainId?: string
  assetId?: string
}

export interface DayDetailFailedRun {
  run_id: string
  rule_id: string
  rule_name: string
  asset_id: string
  table_name: string
  status: string
  failed_rows_count: number | null
}

export interface DayDetailAlert {
  alert_id: string
  severity: string
  alert_type: string
  alert_status: string
  asset_id: string
  rule_id: string | null
}

export interface DayDetailAnomaly {
  detection_id: string
  asset_id: string
  anomaly_type: string | null
  severity: string | null
  confidence: number | null
}

export interface DayDetail {
  date: string
  failed_runs: DayDetailFailedRun[]
  alerts: DayDetailAlert[]
  anomalies: DayDetailAnomaly[]
}

export type IssueType = 'rule_failure' | 'alert' | 'failed_run' | 'manual'
export type IssueStatus = 'new' | 'confirmed' | 'in_progress' | 'blocked' | 'resolved' | 'closed' | 'reopened'
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface Issue {
  issue_id: string
  title: string
  description: string | null
  issue_type: IssueType
  status: IssueStatus
  severity: IssueSeverity
  domain_id: string | null
  subdomain_id: string | null
  asset_id: string | null
  source_id: string | null
  rule_id: string | null
  run_id: string | null
  alert_id: string | null
  assigned_team_id: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
  reopen_count: number
  resolution_note: string | null
  asset_name?: string | null
  connection_name?: string | null
  sf_database_name?: string | null
  sf_schema_name?: string | null
  sf_table_name?: string | null
  sf_table_type?: string | null
  rule_name?: string | null
  assigned_team_name?: string | null
}

export interface IssueAuditEntry {
  audit_id: string
  user_email: string | null
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export const ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new:         ['confirmed', 'closed'],
  confirmed:   ['in_progress', 'closed'],
  in_progress: ['blocked', 'resolved', 'confirmed'],
  blocked:     ['in_progress'],
  resolved:    ['closed', 'reopened'],
  closed:      ['reopened'],
  reopened:    ['confirmed', 'in_progress'],
}
