-- =============================================================================
-- DQ PLATFORM GOLDEN DATASET - PART 2: PLATFORM METADATA TABLES
-- =============================================================================
-- Purpose : Pre-populate the DQ platform's own metadata in Snowflake format.
--           Run AFTER Part 1 (source tables).
-- Covers  : domains, subdomains, data_assets, dq_rules (all 12 types),
--           dq_schedules, dq_rule_runs, dq_quality_scores, dq_alerts, audit_logs
-- =============================================================================

USE DATABASE DQ_PLATFORM_DB;
USE SCHEMA METADATA_SCHEMA;

-- =============================================================================
-- TABLE DEFINITIONS (Snowflake-native metadata store)
-- =============================================================================

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DOMAINS (
    domain_id    VARCHAR(36)   NOT NULL PRIMARY KEY,
    domain_name  VARCHAR(100)  NOT NULL UNIQUE,
    description  TEXT,
    owner_name   VARCHAR(200),
    owner_email  VARCHAR(200),
    is_active    BOOLEAN       DEFAULT TRUE,
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.SUBDOMAINS (
    subdomain_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
    domain_id      VARCHAR(36)  NOT NULL,
    subdomain_name VARCHAR(100) NOT NULL,
    description    TEXT,
    owner_name     VARCHAR(200),
    owner_email    VARCHAR(200),
    is_active      BOOLEAN      DEFAULT TRUE,
    created_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_ASSETS (
    asset_id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    domain_id           VARCHAR(36)  NOT NULL,
    subdomain_id        VARCHAR(36)  NOT NULL,
    sf_database_name    VARCHAR(200),
    sf_schema_name      VARCHAR(200) NOT NULL,
    sf_table_name       VARCHAR(200) NOT NULL,
    table_type          VARCHAR(50),
    table_description   TEXT,
    owner_name          VARCHAR(200),
    owner_email         VARCHAR(200),
    criticality         VARCHAR(20)  DEFAULT 'medium',  -- critical|high|medium|low
    certification_status VARCHAR(20) DEFAULT 'uncertified',
    is_active           BOOLEAN      DEFAULT TRUE,
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DQ_RULES (
    rule_id          VARCHAR(36)   NOT NULL PRIMARY KEY,
    rule_name        VARCHAR(200)  NOT NULL,
    rule_description TEXT,
    domain_id        VARCHAR(36)   NOT NULL,
    subdomain_id     VARCHAR(36)   NOT NULL,
    asset_id         VARCHAR(36)   NOT NULL,
    rule_type        VARCHAR(50)   NOT NULL,
    rule_category    VARCHAR(50),
    target_column    VARCHAR(200),
    rule_sql         TEXT,
    rule_config      VARIANT,
    severity         VARCHAR(20)   NOT NULL DEFAULT 'medium',
    status           VARCHAR(30)   DEFAULT 'active',
    is_active        BOOLEAN       DEFAULT TRUE,
    created_by       VARCHAR(200),
    approved_by      VARCHAR(200),
    created_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DQ_SCHEDULES (
    schedule_id    VARCHAR(36) NOT NULL PRIMARY KEY,
    rule_id        VARCHAR(36),
    asset_id       VARCHAR(36),
    domain_id      VARCHAR(36),
    schedule_level VARCHAR(20) NOT NULL,
    frequency      VARCHAR(20) NOT NULL,
    cron_expression VARCHAR(100),
    timezone       VARCHAR(50) DEFAULT 'America/Los_Angeles',
    run_at_hour    NUMBER(2),
    run_at_minute  NUMBER(2),
    is_active      BOOLEAN     DEFAULT TRUE,
    created_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

USE SCHEMA RESULTS_SCHEMA;

CREATE TABLE IF NOT EXISTS RESULTS_SCHEMA.DQ_RULE_RUNS (
    run_id                VARCHAR(36)  NOT NULL PRIMARY KEY,
    rule_id               VARCHAR(36)  NOT NULL,
    asset_id              VARCHAR(36)  NOT NULL,
    domain_id             VARCHAR(36)  NOT NULL,
    subdomain_id          VARCHAR(36)  NOT NULL,
    execution_start_time  TIMESTAMP_NTZ,
    execution_end_time    TIMESTAMP_NTZ,
    status                VARCHAR(20)  NOT NULL,   -- passed|failed|warning|error|skipped
    total_rows_scanned    NUMBER(12),
    failed_rows_count     NUMBER(12),
    passed_rows_count     NUMBER(12),
    failure_percentage    FLOAT,
    quality_score         FLOAT,
    error_message         TEXT,
    executed_sql          TEXT,
    ai_explanation        TEXT,
    created_at            TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RESULTS_SCHEMA.DQ_RULE_RUN_SAMPLES (
    sample_id    VARCHAR(36) NOT NULL PRIMARY KEY,
    run_id       VARCHAR(36) NOT NULL,
    rule_id      VARCHAR(36) NOT NULL,
    failed_record VARIANT,
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RESULTS_SCHEMA.DQ_QUALITY_SCORES (
    score_id      VARCHAR(36) NOT NULL PRIMARY KEY,
    score_date    DATE        NOT NULL,
    score_level   VARCHAR(20) NOT NULL,   -- table|subdomain|domain|global
    domain_id     VARCHAR(36),
    subdomain_id  VARCHAR(36),
    asset_id      VARCHAR(36),
    total_rules   NUMBER(8)   DEFAULT 0,
    passed_rules  NUMBER(8)   DEFAULT 0,
    failed_rules  NUMBER(8)   DEFAULT 0,
    warning_rules NUMBER(8)   DEFAULT 0,
    error_rules   NUMBER(8)   DEFAULT 0,
    quality_score FLOAT       DEFAULT 100.0,
    created_at    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RESULTS_SCHEMA.DQ_ALERTS (
    alert_id             VARCHAR(36) NOT NULL PRIMARY KEY,
    run_id               VARCHAR(36) NOT NULL,
    rule_id              VARCHAR(36) NOT NULL,
    domain_id            VARCHAR(36) NOT NULL,
    subdomain_id         VARCHAR(36) NOT NULL,
    asset_id             VARCHAR(36) NOT NULL,
    severity             VARCHAR(20) NOT NULL,
    alert_status         VARCHAR(20) DEFAULT 'open',
    alert_message        TEXT,
    notified_to          VARCHAR(500),
    notification_channel VARCHAR(50),
    notification_sent    BOOLEAN     DEFAULT FALSE,
    created_at           TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    resolved_at          TIMESTAMP_NTZ
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.AUDIT_LOGS (
    audit_id    VARCHAR(36) NOT NULL PRIMARY KEY,
    user_email  VARCHAR(200),
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   VARCHAR(36),
    old_value   VARIANT,
    new_value   VARIANT,
    created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- =============================================================================
-- DATA: DOMAINS
-- =============================================================================
USE SCHEMA METADATA_SCHEMA;

INSERT INTO METADATA_SCHEMA.DOMAINS VALUES
('dom-00000001','Revenue',    'Revenue and billing data quality',          'Revenue Team', 'revenue@example.com',   TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000002','Finance',    'Finance and accounting data quality',        'Finance Team', 'finance@example.com',   TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000003','Operations', 'Operations and logistics data quality',      'Ops Team',     'ops@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000004','Planning',   'Demand and workforce planning quality',      'Planning Team','planning@example.com',  TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000005','GTM',        'Go-to-market and marketing data quality',    'GTM Team',     'gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000006','HR',         'Human resources data quality',               'HR Team',      'hr@example.com',        TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('dom-00000007','Others',     'Miscellaneous and custom domain',            'Platform Team','platform@example.com',  TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00');

-- =============================================================================
-- DATA: SUBDOMAINS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.SUBDOMAINS VALUES
-- Revenue
('sub-rev-0001','dom-00000001','Billing',           'Billing and invoicing subdomain',   'Revenue Team','revenue@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-rev-0002','dom-00000001','Sales',             'Sales and pipeline subdomain',      'Revenue Team','revenue@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-rev-0003','dom-00000001','Subscriptions',     'Subscription management',           'Revenue Team','revenue@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-rev-0004','dom-00000001','Pricing',           'Pricing and discounts',             'Revenue Team','revenue@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-rev-0005','dom-00000001','Invoice Management','Invoice lifecycle management',      'Revenue Team','revenue@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- Finance
('sub-fin-0001','dom-00000002','General Ledger',    'GL journal entries and balancing',  'Finance Team','finance@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-fin-0002','dom-00000002','Accounts Payable',  'AP vendor invoices and payments',   'Finance Team','finance@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-fin-0003','dom-00000002','Accounts Receivable','AR customer collections',          'Finance Team','finance@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-fin-0004','dom-00000002','Expenses',          'Employee and corporate expenses',   'Finance Team','finance@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-fin-0005','dom-00000002','Forecasting',       'Financial forecasting and planning','Finance Team','finance@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- Operations
('sub-ops-0001','dom-00000003','Inventory',         'Stock and inventory management',    'Ops Team','ops@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-ops-0002','dom-00000003','Fulfillment',       'Order fulfillment and shipping',    'Ops Team','ops@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-ops-0003','dom-00000003','Logistics',         'Logistics and carrier management',  'Ops Team','ops@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-ops-0004','dom-00000003','Supply Chain',      'Supply chain data quality',         'Ops Team','ops@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- Planning
('sub-pln-0001','dom-00000004','Demand Planning',   'Demand forecasting accuracy',       'Planning Team','planning@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-pln-0002','dom-00000004','Workforce Planning','Headcount and hiring forecasts',    'Planning Team','planning@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-pln-0003','dom-00000004','Capacity Planning', 'System and resource capacity',      'Planning Team','planning@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-pln-0004','dom-00000004','Forecast Planning', 'Rolling forecast data quality',     'Planning Team','planning@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- GTM
('sub-gtm-0001','dom-00000005','Leads',             'Lead capture and scoring',          'GTM Team','gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-gtm-0002','dom-00000005','Campaigns',         'Campaign performance data',         'GTM Team','gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-gtm-0003','dom-00000005','Marketing',         'Marketing analytics',               'GTM Team','gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-gtm-0004','dom-00000005','Sales Pipeline',    'Opportunity and pipeline data',     'GTM Team','gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-gtm-0005','dom-00000005','Customer Acquisition','CAC and acquisition metrics',     'GTM Team','gtm@example.com',       TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- HR
('sub-hr-0001', 'dom-00000006','Employees',         'Employee master data quality',      'HR Team','hr@example.com',         TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-hr-0002', 'dom-00000006','Payroll',           'Payroll accuracy and completeness', 'HR Team','hr@example.com',         TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-hr-0003', 'dom-00000006','Hiring',            'Hiring pipeline data quality',      'HR Team','hr@example.com',         TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-hr-0004', 'dom-00000006','Attendance',        'Attendance and leave tracking',     'HR Team','hr@example.com',         TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-hr-0005', 'dom-00000006','Benefits',          'Benefits enrollment accuracy',      'HR Team','hr@example.com',         TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- Others
('sub-oth-0001','dom-00000007','Product',           'Product data quality',              'Platform Team','platform@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-oth-0002','dom-00000007','Support',           'Support ticket quality',            'Platform Team','platform@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-oth-0003','dom-00000007','Analytics',         'Analytics and reporting quality',   'Platform Team','platform@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
('sub-oth-0004','dom-00000007','Custom',            'Custom and ad-hoc rules',           'Platform Team','platform@example.com',TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00');

-- =============================================================================
-- DATA: DATA ASSETS (tables registered for DQ monitoring)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DATA_ASSETS VALUES
('ast-rev-0001','dom-00000001','sub-rev-0001','DQ_PLATFORM_DB','SOURCE_DATA','INVOICES',
 'TABLE','Customer invoices - billing core table','Revenue Data Owner','revenue.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-rev-0002','dom-00000001','sub-rev-0001','DQ_PLATFORM_DB','SOURCE_DATA','CUSTOMERS',
 'TABLE','Customer master reference table','Revenue Data Owner','revenue.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-rev-0003','dom-00000001','sub-rev-0003','DQ_PLATFORM_DB','SOURCE_DATA','SUBSCRIPTIONS',
 'TABLE','SaaS subscription records','Revenue Data Owner','revenue.data@example.com','high','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-fin-0001','dom-00000002','sub-fin-0001','DQ_PLATFORM_DB','SOURCE_DATA','GL_JOURNAL_ENTRIES',
 'TABLE','General ledger journal entries - SOX critical','Finance Data Owner','finance.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-fin-0002','dom-00000002','sub-fin-0002','DQ_PLATFORM_DB','SOURCE_DATA','ACCOUNTS_PAYABLE',
 'TABLE','Vendor accounts payable records','Finance Data Owner','finance.data@example.com','high','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-ops-0001','dom-00000003','sub-ops-0001','DQ_PLATFORM_DB','SOURCE_DATA','INVENTORY',
 'TABLE','Product inventory and stock levels','Ops Data Owner','ops.data@example.com','high','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-ops-0002','dom-00000003','sub-ops-0002','DQ_PLATFORM_DB','SOURCE_DATA','ORDERS',
 'TABLE','Customer orders master table','Ops Data Owner','ops.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-ops-0003','dom-00000003','sub-ops-0002','DQ_PLATFORM_DB','SOURCE_DATA','SHIPMENTS',
 'TABLE','Order shipments and fulfillment records','Ops Data Owner','ops.data@example.com','high','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-hr-0001', 'dom-00000006','sub-hr-0001','DQ_PLATFORM_DB','SOURCE_DATA','EMPLOYEES',
 'TABLE','Employee master data - PII critical','HR Data Owner','hr.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-hr-0002', 'dom-00000006','sub-hr-0002','DQ_PLATFORM_DB','SOURCE_DATA','PAYROLL',
 'TABLE','Employee payroll records - SOX/PII','HR Data Owner','hr.data@example.com','critical','certified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-gtm-0001','dom-00000005','sub-gtm-0001','DQ_PLATFORM_DB','SOURCE_DATA','LEADS',
 'TABLE','Marketing leads and prospect data','GTM Data Owner','gtm.data@example.com','medium','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-gtm-0002','dom-00000005','sub-gtm-0002','DQ_PLATFORM_DB','SOURCE_DATA','CAMPAIGNS',
 'TABLE','Marketing campaign performance','GTM Data Owner','gtm.data@example.com','medium','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-pln-0001','dom-00000004','sub-pln-0004','DQ_PLATFORM_DB','SOURCE_DATA','FORECAST_PLANNING',
 'TABLE','Rolling forecast and planning data','Planning Data Owner','planning.data@example.com','high','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00'),
('ast-oth-0001','dom-00000007','sub-oth-0002','DQ_PLATFORM_DB','SOURCE_DATA','STALE_DATA_TABLE',
 'TABLE','Freshness check demo table','Platform Team','platform@example.com','low','uncertified',TRUE,'2024-01-10 08:00:00','2024-01-10 08:00:00');

-- =============================================================================
-- DATA: DQ RULES  (all 12 rule types + semantic types, across all domains)
-- =============================================================================

INSERT INTO METADATA_SCHEMA.DQ_RULES VALUES
-- ── REVENUE: INVOICES ───────────────────────────────────────────────────────
('rul-rev-0001','invoice_id_not_null',
 'Invoice ID must not be null - every invoice requires a unique identifier',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'null_check',NULL,'invoice_id',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE invoice_id IS NULL',
 PARSE_JSON('{"columns":["invoice_id"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0002','invoice_id_unique',
 'Invoice IDs must be unique across all invoices',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'uniqueness_check',NULL,'invoice_id',
 'SELECT COUNT(*) AS failed_count FROM (SELECT invoice_id, COUNT(*) AS cnt FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES GROUP BY invoice_id HAVING COUNT(*) > 1)',
 PARSE_JSON('{"columns":["invoice_id"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0003','invoice_amount_positive',
 'Invoice amount must be greater than or equal to zero',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'range_check',NULL,'invoice_amount',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE invoice_amount < 0',
 PARSE_JSON('{"min_value":0}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0004','invoice_status_valid',
 'Invoice status must be one of: PAID, PENDING, FAILED, CANCELLED',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'accepted_values_check',NULL,'status',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE status NOT IN (''PAID'',''PENDING'',''FAILED'',''CANCELLED'')',
 PARSE_JSON('{"accepted_values":["PAID","PENDING","FAILED","CANCELLED"]}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0005','invoice_date_not_future',
 'Invoice date cannot be in the future',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'business_rule_check',NULL,'invoice_date',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE NOT (invoice_date <= CURRENT_DATE())',
 PARSE_JSON('{"condition":"invoice_date <= CURRENT_DATE()"}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0006','invoice_customer_exists',
 'Every invoice must reference a valid customer in the CUSTOMERS table',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'referential_integrity_check',NULL,'customer_id',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES c LEFT JOIN DQ_PLATFORM_DB.SOURCE_DATA.CUSTOMERS p ON c."customer_id" = p."customer_id" WHERE p."customer_id" IS NULL',
 PARSE_JSON('{"reference_table":"DQ_PLATFORM_DB.SOURCE_DATA.CUSTOMERS","reference_column":"customer_id"}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0007','invoice_table_freshness',
 'Invoice table must be updated within the last 24 hours',
 'dom-00000001','sub-rev-0001','ast-rev-0001',
 'freshness_check',NULL,'created_at',
 'SELECT CASE WHEN DATEDIFF(''hour'', MAX("created_at"), CURRENT_TIMESTAMP()) > 24 THEN 1 ELSE 0 END AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES',
 PARSE_JSON('{"max_hours":24}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── REVENUE: SUBSCRIPTIONS ──────────────────────────────────────────────────
('rul-rev-0008','subscription_status_valid',
 'Subscription status must be ACTIVE, PAUSED, CANCELLED, or EXPIRED',
 'dom-00000001','sub-rev-0003','ast-rev-0003',
 'accepted_values_check',NULL,'status',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.SUBSCRIPTIONS WHERE status NOT IN (''ACTIVE'',''PAUSED'',''CANCELLED'',''EXPIRED'')',
 PARSE_JSON('{"accepted_values":["ACTIVE","PAUSED","CANCELLED","EXPIRED"]}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-rev-0009','subscription_date_consistency',
 'Subscription end_date must be after start_date',
 'dom-00000001','sub-rev-0003','ast-rev-0003',
 'business_rule_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.SUBSCRIPTIONS WHERE NOT (end_date >= start_date)',
 PARSE_JSON('{"condition":"end_date >= start_date"}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── FINANCE: GL_JOURNAL_ENTRIES ─────────────────────────────────────────────
('rul-fin-0001','gl_entry_id_not_null',
 'GL journal entry ID must not be null',
 'dom-00000002','sub-fin-0001','ast-fin-0001',
 'null_check',NULL,'journal_entry_id',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.GL_JOURNAL_ENTRIES WHERE journal_entry_id IS NULL',
 PARSE_JSON('{"columns":["journal_entry_id"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-fin-0002','gl_debit_credit_balanced',
 'GL entries must be balanced: debit_amount must equal credit_amount',
 'dom-00000002','sub-fin-0001','ast-fin-0001',
 'business_rule_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.GL_JOURNAL_ENTRIES WHERE NOT (ABS(debit_amount - credit_amount) < 0.01)',
 PARSE_JSON('{"condition":"ABS(debit_amount - credit_amount) < 0.01"}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-fin-0003','gl_amount_not_zero',
 'GL entry amounts must not be zero',
 'dom-00000002','sub-fin-0001','ast-fin-0001',
 'range_check',NULL,'debit_amount',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.GL_JOURNAL_ENTRIES WHERE debit_amount = 0 AND credit_amount = 0',
 PARSE_JSON('{"min_value":0.01}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-fin-0004','gl_schema_columns_present',
 'GL table must have all required columns: journal_entry_id, entry_date, account_code, debit_amount, credit_amount',
 'dom-00000002','sub-fin-0001','ast-fin-0001',
 'schema_drift_check',NULL,NULL,
 NULL,
 PARSE_JSON('{"expected_columns":["journal_entry_id","entry_date","period","account_code","account_name","debit_amount","credit_amount","description","posted_by","is_posted"]}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-fin-0005','gl_freshness_monthly',
 'GL table must have entries for the current month',
 'dom-00000002','sub-fin-0001','ast-fin-0001',
 'freshness_check',NULL,'created_at',
 'SELECT CASE WHEN DATEDIFF(''hour'', MAX("created_at"), CURRENT_TIMESTAMP()) > 48 THEN 1 ELSE 0 END AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.GL_JOURNAL_ENTRIES',
 PARSE_JSON('{"max_hours":48}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── OPERATIONS: INVENTORY ───────────────────────────────────────────────────
('rul-ops-0001','inventory_quantity_not_negative',
 'Inventory quantity on hand must not be negative',
 'dom-00000003','sub-ops-0001','ast-ops-0001',
 'range_check',NULL,'quantity_on_hand',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVENTORY WHERE quantity_on_hand < 0',
 PARSE_JSON('{"min_value":0}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-ops-0002','inventory_sku_not_null',
 'Inventory SKU must not be null',
 'dom-00000003','sub-ops-0001','ast-ops-0001',
 'null_check',NULL,'sku',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVENTORY WHERE sku IS NULL',
 PARSE_JSON('{"columns":["sku"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── OPERATIONS: SHIPMENTS ───────────────────────────────────────────────────
('rul-ops-0003','shipment_date_after_order',
 'Shipment date must be on or after the related order date',
 'dom-00000003','sub-ops-0002','ast-ops-0003',
 'custom_sql_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.SHIPMENTS s JOIN DQ_PLATFORM_DB.SOURCE_DATA.ORDERS o ON s.order_id = o.order_id WHERE s.ship_date < o.order_date',
 PARSE_JSON('{"sql":"SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.SHIPMENTS s JOIN DQ_PLATFORM_DB.SOURCE_DATA.ORDERS o ON s.order_id = o.order_id WHERE s.ship_date < o.order_date"}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-ops-0004','shipment_order_exists',
 'Every shipment must reference a valid order in the ORDERS table',
 'dom-00000003','sub-ops-0002','ast-ops-0003',
 'referential_integrity_check',NULL,'order_id',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.SHIPMENTS c LEFT JOIN DQ_PLATFORM_DB.SOURCE_DATA.ORDERS p ON c."order_id" = p."order_id" WHERE p."order_id" IS NULL',
 PARSE_JSON('{"reference_table":"DQ_PLATFORM_DB.SOURCE_DATA.ORDERS","reference_column":"order_id"}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── HR: EMPLOYEES ───────────────────────────────────────────────────────────
('rul-hr-0001','employee_id_not_null',
 'Employee ID must not be null',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'null_check',NULL,'employee_id',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES WHERE employee_id IS NULL',
 PARSE_JSON('{"columns":["employee_id"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0002','employee_id_unique',
 'Employee IDs must be unique across all employees',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'uniqueness_check',NULL,'employee_id',
 'SELECT COUNT(*) AS failed_count FROM (SELECT employee_id, COUNT(*) AS cnt FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES GROUP BY employee_id HAVING COUNT(*) > 1)',
 PARSE_JSON('{"columns":["employee_id"]}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0003','employee_salary_positive',
 'Employee salary must be greater than zero',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'range_check',NULL,'salary',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES WHERE salary <= 0',
 PARSE_JSON('{"min_value":0.01}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0004','employee_exit_after_join',
 'Exit date must be after joining date for terminated employees',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'business_rule_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES WHERE NOT (exit_date IS NULL OR exit_date >= joining_date)',
 PARSE_JSON('{"condition":"exit_date IS NULL OR exit_date >= joining_date"}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0005','employee_email_format',
 'Employee email must follow valid email format',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'regex_check',NULL,'email',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES WHERE NOT REGEXP_LIKE("email", ''^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$'')',
 PARSE_JSON('{"pattern":"^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$"}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0006','employee_type_valid',
 'Employment type must be FULL_TIME, PART_TIME, or CONTRACTOR',
 'dom-00000006','sub-hr-0001','ast-hr-0001',
 'accepted_values_check',NULL,'employment_type',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES WHERE employment_type NOT IN (''FULL_TIME'',''PART_TIME'',''CONTRACTOR'')',
 PARSE_JSON('{"accepted_values":["FULL_TIME","PART_TIME","CONTRACTOR"]}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── HR: PAYROLL ─────────────────────────────────────────────────────────────
('rul-hr-0007','payroll_net_pay_positive',
 'Net pay amount must not be negative',
 'dom-00000006','sub-hr-0002','ast-hr-0002',
 'range_check',NULL,'net_pay',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.PAYROLL WHERE net_pay < 0',
 PARSE_JSON('{"min_value":0}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-hr-0008','payroll_active_emp_coverage',
 'Every active full-time employee must have a payroll record for the current month',
 'dom-00000006','sub-hr-0002','ast-hr-0002',
 'custom_sql_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES e WHERE e.employment_type = ''FULL_TIME'' AND e.status = ''ACTIVE'' AND e.salary > 0 AND NOT EXISTS (SELECT 1 FROM DQ_PLATFORM_DB.SOURCE_DATA.PAYROLL p WHERE p.employee_id = e.employee_id AND p.pay_period = TO_CHAR(DATEADD(month,-1,CURRENT_DATE()),''YYYY-MM''))',
 PARSE_JSON('{"sql":"SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.EMPLOYEES e WHERE e.employment_type = ''FULL_TIME'' AND e.status = ''ACTIVE'' AND e.salary > 0 AND NOT EXISTS (SELECT 1 FROM DQ_PLATFORM_DB.SOURCE_DATA.PAYROLL p WHERE p.employee_id = e.employee_id AND p.pay_period = TO_CHAR(DATEADD(month,-1,CURRENT_DATE()),''YYYY-MM''))"}'),
 'critical','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── GTM: LEADS ──────────────────────────────────────────────────────────────
('rul-gtm-0001','lead_email_format',
 'Lead email must follow valid RFC-compliant email format',
 'dom-00000005','sub-gtm-0001','ast-gtm-0001',
 'regex_check',NULL,'email',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.LEADS WHERE NOT REGEXP_LIKE("email", ''^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$'')',
 PARSE_JSON('{"pattern":"^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$"}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-gtm-0002','lead_conversion_rate_range',
 'Lead conversion rate must be between 0 and 100',
 'dom-00000005','sub-gtm-0001','ast-gtm-0001',
 'range_check',NULL,'conversion_rate',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.LEADS WHERE conversion_rate < 0 OR conversion_rate > 100',
 PARSE_JSON('{"min_value":0,"max_value":100}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-gtm-0003','lead_id_unique',
 'Lead IDs must be unique',
 'dom-00000005','sub-gtm-0001','ast-gtm-0001',
 'uniqueness_check',NULL,'lead_id',
 'SELECT COUNT(*) AS failed_count FROM (SELECT lead_id, COUNT(*) AS cnt FROM DQ_PLATFORM_DB.SOURCE_DATA.LEADS GROUP BY lead_id HAVING COUNT(*) > 1)',
 PARSE_JSON('{"columns":["lead_id"]}'),
 'low','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── GTM: CAMPAIGNS ──────────────────────────────────────────────────────────
('rul-gtm-0004','campaign_end_after_start',
 'Campaign end date must be after campaign start date',
 'dom-00000005','sub-gtm-0002','ast-gtm-0002',
 'business_rule_check',NULL,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.CAMPAIGNS WHERE NOT (end_date >= start_date)',
 PARSE_JSON('{"condition":"end_date >= start_date"}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── PLANNING: FORECAST ──────────────────────────────────────────────────────
('rul-pln-0001','forecast_period_not_null',
 'Forecast period (YYYY-MM) must not be null',
 'dom-00000004','sub-pln-0004','ast-pln-0001',
 'null_check',NULL,'forecast_period',
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.FORECAST_PLANNING WHERE forecast_period IS NULL',
 PARSE_JSON('{"columns":["forecast_period"]}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

('rul-pln-0002','forecast_volume_check',
 'Forecast table must have at least 5 records per month',
 'dom-00000004','sub-pln-0004','ast-pln-0001',
 'volume_check',NULL,NULL,
 'SELECT COUNT(*) AS current_row_count, CASE WHEN COUNT(*) < 5 THEN 1 ELSE 0 END AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.FORECAST_PLANNING WHERE DATE("created_at") = CURRENT_DATE()',
 PARSE_JSON('{"min_rows":5,"date_column":"created_at"}'),
 'medium','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00'),

-- ── FRESHNESS DEMO ──────────────────────────────────────────────────────────
('rul-oth-0001','stale_table_freshness_check',
 'Stale data table must be updated within 24 hours - demonstrates freshness rule type',
 'dom-00000007','sub-oth-0002','ast-oth-0001',
 'freshness_check',NULL,'updated_at',
 'SELECT CASE WHEN DATEDIFF(''hour'', MAX("updated_at"), CURRENT_TIMESTAMP()) > 24 THEN 1 ELSE 0 END AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.STALE_DATA_TABLE',
 PARSE_JSON('{"max_hours":24}'),
 'high','active',TRUE,'admin@example.com','admin@example.com','2024-01-15 08:00:00','2024-01-15 08:00:00');

-- =============================================================================
-- DATA: DQ SCHEDULES
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DQ_SCHEDULES VALUES
-- Revenue: hourly execution for critical rules
('sch-rev-0001','rul-rev-0001',NULL,NULL,'rule','hourly',NULL,'America/Los_Angeles',NULL,NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sch-rev-0002','rul-rev-0002',NULL,NULL,'rule','hourly',NULL,'America/Los_Angeles',NULL,NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sch-rev-0003','rul-rev-0003',NULL,NULL,'rule','hourly',NULL,'America/Los_Angeles',NULL,NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- Revenue: table-level daily schedule
('sch-rev-0010',NULL,'ast-rev-0001',NULL,'table','daily',NULL,'America/Los_Angeles',6,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- Finance: daily at 6 AM (SOX critical)
('sch-fin-0001','rul-fin-0001',NULL,NULL,'rule','daily',NULL,'America/Los_Angeles',6,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sch-fin-0002','rul-fin-0002',NULL,NULL,'rule','daily',NULL,'America/Los_Angeles',6,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- HR: daily
('sch-hr-0001', NULL,'ast-hr-0001', NULL,'table','daily',NULL,'America/Los_Angeles',7,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sch-hr-0002', NULL,'ast-hr-0002', NULL,'table','daily',NULL,'America/Los_Angeles',7,30,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- GTM: daily
('sch-gtm-0001',NULL,'ast-gtm-0001',NULL,'table','daily',NULL,'America/Los_Angeles',8,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- Ops: cron-based
('sch-ops-0001',NULL,'ast-ops-0001',NULL,'table','cron','0 */4 * * *','America/Los_Angeles',NULL,NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- Domain-level weekly schedule for Planning
('sch-pln-0001',NULL,NULL,'dom-00000004','domain','weekly',NULL,'America/Los_Angeles',6,0,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00');

-- =============================================================================
-- DATA: DQ RULE RUNS  (30 days of historical execution results)
-- Statuses: passed | failed | warning | error | skipped
-- =============================================================================
USE SCHEMA RESULTS_SCHEMA;

INSERT INTO RESULTS_SCHEMA.DQ_RULE_RUNS VALUES
-- ── invoice_id_not_null: failed (3 nulls found) ──────────────────────────
('run-rev-001-01','rul-rev-0001','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:00:00','2024-05-14 06:00:08','failed',
 20,3,17,15.0,85.0,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE invoice_id IS NULL',
 'The invoice_id_not_null rule found 3 records with NULL invoice_id. This violates the core principle that every invoice must have a unique identifier. Impact: these invoices cannot be referenced by downstream systems. Root cause: likely a data pipeline ingestion issue. Recommend investigating the ETL job that loads invoice data.',
 '2024-05-14 06:00:08'),
('run-rev-001-02','rul-rev-0001','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:00:00','2024-05-13 06:00:07','failed',
 18,3,15,16.67,83.33,NULL,NULL,NULL,'2024-05-13 06:00:07'),
('run-rev-001-03','rul-rev-0001','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-12 06:00:00','2024-05-12 06:00:06','passed',
 15,0,15,0.0,100.0,NULL,NULL,NULL,'2024-05-12 06:00:06'),
('run-rev-001-04','rul-rev-0001','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-11 06:00:00','2024-05-11 06:00:07','passed',
 15,0,15,0.0,100.0,NULL,NULL,NULL,'2024-05-11 06:00:07'),

-- ── invoice_id_unique: failed (duplicate INV-009) ──────────────────────
('run-rev-002-01','rul-rev-0002','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:01:00','2024-05-14 06:01:05','failed',
 20,1,19,5.0,95.0,NULL,
 'SELECT COUNT(*) AS failed_count FROM (SELECT invoice_id, COUNT(*) AS cnt FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES GROUP BY invoice_id HAVING COUNT(*) > 1)',
 'Invoice ID INV-009 appears 2 times. Duplicate invoice IDs can cause double-billing and revenue recognition errors.',
 '2024-05-14 06:01:05'),
('run-rev-002-02','rul-rev-0002','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:01:00','2024-05-13 06:01:05','failed',
 18,1,17,5.56,94.44,NULL,NULL,NULL,'2024-05-13 06:01:05'),
('run-rev-002-03','rul-rev-0002','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-12 06:01:00','2024-05-12 06:01:04','passed',
 15,0,15,0.0,100.0,NULL,NULL,NULL,'2024-05-12 06:01:04'),

-- ── invoice_amount_positive: failed ────────────────────────────────────
('run-rev-003-01','rul-rev-0003','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:02:00','2024-05-14 06:02:04','failed',
 20,2,18,10.0,90.0,NULL,
 'SELECT COUNT(*) AS failed_count FROM DQ_PLATFORM_DB.SOURCE_DATA.INVOICES WHERE invoice_amount < 0',
 '2 invoices have negative amounts (-450.00 and -1200.00). Negative invoice amounts indicate potential refund records incorrectly classified as invoices. Recommend separating refund transactions into a dedicated table.',
 '2024-05-14 06:02:04'),
('run-rev-003-02','rul-rev-0003','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:02:00','2024-05-13 06:02:03','failed',
 18,2,16,11.11,88.89,NULL,NULL,NULL,'2024-05-13 06:02:03'),
('run-rev-003-03','rul-rev-0003','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-12 06:02:00','2024-05-12 06:02:03','passed',
 15,0,15,0.0,100.0,NULL,NULL,NULL,'2024-05-12 06:02:03'),

-- ── invoice_status_valid: failed (REFUNDED not allowed) ──────────────
('run-rev-004-01','rul-rev-0004','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:03:00','2024-05-14 06:03:03','failed',
 20,1,19,5.0,95.0,NULL,NULL,NULL,'2024-05-14 06:03:03'),
('run-rev-004-02','rul-rev-0004','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:03:00','2024-05-13 06:03:02','passed',
 18,0,18,0.0,100.0,NULL,NULL,NULL,'2024-05-13 06:03:02'),

-- ── invoice_date_not_future: failed (INV-013 has 2099 date) ──────────
('run-rev-005-01','rul-rev-0005','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:04:00','2024-05-14 06:04:05','failed',
 20,1,19,5.0,95.0,NULL,NULL,NULL,'2024-05-14 06:04:05'),
('run-rev-005-02','rul-rev-0005','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:04:00','2024-05-13 06:04:04','failed',
 18,1,17,5.56,94.44,NULL,NULL,NULL,'2024-05-13 06:04:04'),

-- ── invoice_customer_exists: failed (CUST-999 orphan) ────────────────
('run-rev-006-01','rul-rev-0006','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:05:00','2024-05-14 06:05:08','failed',
 20,1,19,5.0,95.0,NULL,NULL,NULL,'2024-05-14 06:05:08'),
('run-rev-006-02','rul-rev-0006','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-13 06:05:00','2024-05-13 06:05:07','failed',
 18,1,17,5.56,94.44,NULL,NULL,NULL,'2024-05-13 06:05:07'),

-- ── invoice_table_freshness: passed ─────────────────────────────────
('run-rev-007-01','rul-rev-0007','ast-rev-0001','dom-00000001','sub-rev-0001',
 '2024-05-14 06:06:00','2024-05-14 06:06:02','passed',
 20,0,20,0.0,100.0,NULL,NULL,NULL,'2024-05-14 06:06:02'),

-- ── subscription_date_consistency: failed (end < start) ──────────────
('run-rev-009-01','rul-rev-0009','ast-rev-0003','dom-00000001','sub-rev-0003',
 '2024-05-14 06:10:00','2024-05-14 06:10:04','failed',
 10,1,9,10.0,90.0,NULL,NULL,NULL,'2024-05-14 06:10:04'),

-- ── GL: gl_entry_id_not_null: failed ─────────────────────────────────
('run-fin-001-01','rul-fin-0001','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-14 06:00:00','2024-05-14 06:00:05','failed',
 15,2,13,13.33,86.67,NULL,NULL,NULL,'2024-05-14 06:00:05'),
('run-fin-001-02','rul-fin-0001','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-13 06:00:00','2024-05-13 06:00:05','failed',
 13,2,11,15.38,84.62,NULL,NULL,NULL,'2024-05-13 06:00:05'),
('run-fin-001-03','rul-fin-0001','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-12 06:00:00','2024-05-12 06:00:05','passed',
 10,0,10,0.0,100.0,NULL,NULL,NULL,'2024-05-12 06:00:05'),

-- ── GL: gl_debit_credit_balanced: failed ─────────────────────────────
('run-fin-002-01','rul-fin-0002','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-14 06:01:00','2024-05-14 06:01:06','failed',
 15,4,11,26.67,73.33,NULL,NULL,NULL,'2024-05-14 06:01:06'),
('run-fin-002-02','rul-fin-0002','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-13 06:01:00','2024-05-13 06:01:05','failed',
 13,4,9,30.77,69.23,NULL,NULL,NULL,'2024-05-13 06:01:05'),
('run-fin-002-03','rul-fin-0002','ast-fin-0001','dom-00000002','sub-fin-0001',
 '2024-05-10 06:01:00','2024-05-10 06:01:04','passed',
 8,0,8,0.0,100.0,NULL,NULL,NULL,'2024-05-10 06:01:04'),

-- ── Inventory quantity_not_negative: failed ───────────────────────────
('run-ops-001-01','rul-ops-0001','ast-ops-0001','dom-00000003','sub-ops-0001',
 '2024-05-14 06:00:00','2024-05-14 06:00:03','failed',
 10,3,7,30.0,70.0,NULL,NULL,NULL,'2024-05-14 06:00:03'),
('run-ops-001-02','rul-ops-0001','ast-ops-0001','dom-00000003','sub-ops-0001',
 '2024-05-13 06:00:00','2024-05-13 06:00:03','failed',
 10,3,7,30.0,70.0,NULL,NULL,NULL,'2024-05-13 06:00:03'),

-- ── Shipments: date order check: failed ──────────────────────────────
('run-ops-003-01','rul-ops-0003','ast-ops-0003','dom-00000003','sub-ops-0002',
 '2024-05-14 06:05:00','2024-05-14 06:05:06','failed',
 11,2,9,18.18,81.82,NULL,NULL,NULL,'2024-05-14 06:05:06'),

-- ── Shipments: referential integrity: failed ──────────────────────────
('run-ops-004-01','rul-ops-0004','ast-ops-0003','dom-00000003','sub-ops-0002',
 '2024-05-14 06:06:00','2024-05-14 06:06:05','failed',
 11,1,10,9.09,90.91,NULL,NULL,NULL,'2024-05-14 06:06:05'),

-- ── HR: employee_id_not_null: failed ─────────────────────────────────
('run-hr-001-01','rul-hr-0001','ast-hr-0001','dom-00000006','sub-hr-0001',
 '2024-05-14 07:00:00','2024-05-14 07:00:04','failed',
 14,1,13,7.14,92.86,NULL,NULL,NULL,'2024-05-14 07:00:04'),

-- ── HR: employee_id_unique: failed ───────────────────────────────────
('run-hr-002-01','rul-hr-0002','ast-hr-0001','dom-00000006','sub-hr-0001',
 '2024-05-14 07:01:00','2024-05-14 07:01:04','failed',
 14,1,13,7.14,92.86,NULL,NULL,NULL,'2024-05-14 07:01:04'),

-- ── HR: employee_salary_positive: failed ─────────────────────────────
('run-hr-003-01','rul-hr-0003','ast-hr-0001','dom-00000006','sub-hr-0001',
 '2024-05-14 07:02:00','2024-05-14 07:02:04','failed',
 14,2,12,14.29,85.71,NULL,NULL,NULL,'2024-05-14 07:02:04'),

-- ── HR: exit_after_join: failed ──────────────────────────────────────
('run-hr-004-01','rul-hr-0004','ast-hr-0001','dom-00000006','sub-hr-0001',
 '2024-05-14 07:03:00','2024-05-14 07:03:04','failed',
 14,1,13,7.14,92.86,NULL,NULL,NULL,'2024-05-14 07:03:04'),

-- ── HR: employee_email_format: passed ────────────────────────────────
('run-hr-005-01','rul-hr-0005','ast-hr-0001','dom-00000006','sub-hr-0001',
 '2024-05-14 07:04:00','2024-05-14 07:04:03','passed',
 14,0,14,0.0,100.0,NULL,NULL,NULL,'2024-05-14 07:04:03'),

-- ── HR: payroll_net_pay_positive: failed ─────────────────────────────
('run-hr-007-01','rul-hr-0007','ast-hr-0002','dom-00000006','sub-hr-0002',
 '2024-05-14 07:30:00','2024-05-14 07:30:04','failed',
 10,1,9,10.0,90.0,NULL,NULL,NULL,'2024-05-14 07:30:04'),

-- ── GTM: lead_email_format: failed ───────────────────────────────────
('run-gtm-001-01','rul-gtm-0001','ast-gtm-0001','dom-00000005','sub-gtm-0001',
 '2024-05-14 08:00:00','2024-05-14 08:00:04','failed',
 15,3,12,20.0,80.0,NULL,NULL,NULL,'2024-05-14 08:00:04'),
('run-gtm-001-02','rul-gtm-0001','ast-gtm-0001','dom-00000005','sub-gtm-0001',
 '2024-05-13 08:00:00','2024-05-13 08:00:04','failed',
 12,3,9,25.0,75.0,NULL,NULL,NULL,'2024-05-13 08:00:04'),

-- ── GTM: conversion_rate_range: failed ───────────────────────────────
('run-gtm-002-01','rul-gtm-0002','ast-gtm-0001','dom-00000005','sub-gtm-0001',
 '2024-05-14 08:01:00','2024-05-14 08:01:03','failed',
 15,2,13,13.33,86.67,NULL,NULL,NULL,'2024-05-14 08:01:03'),

-- ── GTM: campaign end_after_start: failed ────────────────────────────
('run-gtm-004-01','rul-gtm-0004','ast-gtm-0002','dom-00000005','sub-gtm-0002',
 '2024-05-14 08:10:00','2024-05-14 08:10:03','failed',
 6,1,5,16.67,83.33,NULL,NULL,NULL,'2024-05-14 08:10:03'),

-- ── Planning: forecast_period_not_null: failed ────────────────────────
('run-pln-001-01','rul-pln-0001','ast-pln-0001','dom-00000004','sub-pln-0004',
 '2024-05-14 06:00:00','2024-05-14 06:00:04','failed',
 10,2,8,20.0,80.0,NULL,NULL,NULL,'2024-05-14 06:00:04'),

-- ── Stale data freshness: failed ─────────────────────────────────────
('run-oth-001-01','rul-oth-0001','ast-oth-0001','dom-00000007','sub-oth-0002',
 '2024-05-14 06:00:00','2024-05-14 06:00:02','failed',
 3,1,2,33.33,66.67,NULL,NULL,NULL,'2024-05-14 06:00:02');

-- =============================================================================
-- DATA: DQ RULE RUN SAMPLES (failed record examples)
-- =============================================================================
INSERT INTO RESULTS_SCHEMA.DQ_RULE_RUN_SAMPLES VALUES
-- Null invoice_ids
('samp-001','run-rev-001-01','rul-rev-0001',
 PARSE_JSON('{"customer_id":"CUST-004","invoice_date":"2024-03-25","invoice_amount":2100.00,"status":"PENDING","note":"invoice_id IS NULL"}'),
 '2024-05-14 06:00:08'),
('samp-002','run-rev-001-01','rul-rev-0001',
 PARSE_JSON('{"customer_id":"CUST-005","invoice_date":"2024-03-28","invoice_amount":5600.00,"status":"PAID","note":"invoice_id IS NULL"}'),
 '2024-05-14 06:00:08'),
('samp-003','run-rev-001-01','rul-rev-0001',
 PARSE_JSON('{"customer_id":"CUST-006","invoice_date":"2024-04-01","invoice_amount":9100.00,"status":"PENDING","note":"invoice_id IS NULL"}'),
 '2024-05-14 06:00:08'),
-- Duplicate invoice_id
('samp-004','run-rev-002-01','rul-rev-0002',
 PARSE_JSON('{"invoice_id":"INV-009","duplicate_count":2,"note":"invoice_id INV-009 appears 2 times"}'),
 '2024-05-14 06:01:05'),
-- Negative invoice amounts
('samp-005','run-rev-003-01','rul-rev-0003',
 PARSE_JSON('{"invoice_id":"INV-010","customer_id":"CUST-010","invoice_amount":-450.00,"status":"PENDING"}'),
 '2024-05-14 06:02:04'),
('samp-006','run-rev-003-01','rul-rev-0003',
 PARSE_JSON('{"invoice_id":"INV-011","customer_id":"CUST-001","invoice_amount":-1200.00,"status":"FAILED"}'),
 '2024-05-14 06:02:04'),
-- Invalid GL null IDs
('samp-007','run-fin-001-01','rul-fin-0001',
 PARSE_JSON('{"entry_date":"2024-05-05","account_code":"4100","debit_amount":0,"credit_amount":5000,"note":"journal_entry_id IS NULL"}'),
 '2024-05-14 06:00:05'),
-- Unbalanced GL entries
('samp-008','run-fin-002-01','rul-fin-0002',
 PARSE_JSON('{"journal_entry_id":"JE-007","debit_amount":85000.00,"credit_amount":0.00,"imbalance":85000.00}'),
 '2024-05-14 06:01:06'),
('samp-009','run-fin-002-01','rul-fin-0002',
 PARSE_JSON('{"journal_entry_id":"JE-009","debit_amount":12000.00,"credit_amount":13500.00,"imbalance":1500.00}'),
 '2024-05-14 06:01:06'),
-- Negative inventory
('samp-010','run-ops-001-01','rul-ops-0001',
 PARSE_JSON('{"sku":"SKU-006","product_name":"Training Credits - 100hr","quantity_on_hand":-5,"warehouse_id":"WH-CENTRAL"}'),
 '2024-05-14 06:00:03'),
-- Invalid lead emails
('samp-011','run-gtm-001-01','rul-gtm-0001',
 PARSE_JSON('{"lead_id":"LEAD-009","first_name":"Irene","last_name":"Taylor","email":"not-a-valid-email"}'),
 '2024-05-14 08:00:04'),
('samp-012','run-gtm-001-01','rul-gtm-0001',
 PARSE_JSON('{"lead_id":"LEAD-010","first_name":"Jack","last_name":"Anderson","email":"jack.anderson@"}'),
 '2024-05-14 08:00:04');

-- =============================================================================
-- DATA: DQ QUALITY SCORES  (30-day trend per domain and global)
-- =============================================================================
INSERT INTO RESULTS_SCHEMA.DQ_QUALITY_SCORES VALUES
-- Global scores (last 7 days)
('qs-global-14','2024-05-14','global',NULL,NULL,NULL,31,16,15,0,0,51.6,'2024-05-14 10:00:00'),
('qs-global-13','2024-05-13','global',NULL,NULL,NULL,31,17,14,0,0,54.8,'2024-05-13 10:00:00'),
('qs-global-12','2024-05-12','global',NULL,NULL,NULL,25,20,5,0,0,80.0,'2024-05-12 10:00:00'),
('qs-global-11','2024-05-11','global',NULL,NULL,NULL,20,18,2,0,0,90.0,'2024-05-11 10:00:00'),
('qs-global-10','2024-05-10','global',NULL,NULL,NULL,20,17,3,0,0,85.0,'2024-05-10 10:00:00'),
('qs-global-07','2024-05-07','global',NULL,NULL,NULL,15,14,1,0,0,93.3,'2024-05-07 10:00:00'),
('qs-global-01','2024-05-01','global',NULL,NULL,NULL,12,12,0,0,0,100.0,'2024-05-01 10:00:00'),
-- Domain: Revenue (last 7 days)
('qs-rev-14','2024-05-14','domain','dom-00000001',NULL,NULL,9,2,7,0,0,22.2,'2024-05-14 10:00:00'),
('qs-rev-13','2024-05-13','domain','dom-00000001',NULL,NULL,9,2,7,0,0,22.2,'2024-05-13 10:00:00'),
('qs-rev-12','2024-05-12','domain','dom-00000001',NULL,NULL,9,6,3,0,0,66.7,'2024-05-12 10:00:00'),
('qs-rev-07','2024-05-07','domain','dom-00000001',NULL,NULL,9,9,0,0,0,100.0,'2024-05-07 10:00:00'),
('qs-rev-01','2024-05-01','domain','dom-00000001',NULL,NULL,7,7,0,0,0,100.0,'2024-05-01 10:00:00'),
-- Domain: Finance
('qs-fin-14','2024-05-14','domain','dom-00000002',NULL,NULL,5,1,4,0,0,20.0,'2024-05-14 10:00:00'),
('qs-fin-13','2024-05-13','domain','dom-00000002',NULL,NULL,5,1,4,0,0,20.0,'2024-05-13 10:00:00'),
('qs-fin-12','2024-05-12','domain','dom-00000002',NULL,NULL,5,3,2,0,0,60.0,'2024-05-12 10:00:00'),
('qs-fin-07','2024-05-07','domain','dom-00000002',NULL,NULL,4,4,0,0,0,100.0,'2024-05-07 10:00:00'),
('qs-fin-01','2024-05-01','domain','dom-00000002',NULL,NULL,3,3,0,0,0,100.0,'2024-05-01 10:00:00'),
-- Domain: Operations
('qs-ops-14','2024-05-14','domain','dom-00000003',NULL,NULL,4,0,4,0,0,0.0,'2024-05-14 10:00:00'),
('qs-ops-13','2024-05-13','domain','dom-00000003',NULL,NULL,4,0,4,0,0,0.0,'2024-05-13 10:00:00'),
('qs-ops-12','2024-05-12','domain','dom-00000003',NULL,NULL,4,2,2,0,0,50.0,'2024-05-12 10:00:00'),
('qs-ops-07','2024-05-07','domain','dom-00000003',NULL,NULL,3,3,0,0,0,100.0,'2024-05-07 10:00:00'),
-- Domain: HR
('qs-hr-14','2024-05-14','domain','dom-00000006',NULL,NULL,8,2,6,0,0,25.0,'2024-05-14 10:00:00'),
('qs-hr-13','2024-05-13','domain','dom-00000006',NULL,NULL,6,3,3,0,0,50.0,'2024-05-13 10:00:00'),
('qs-hr-12','2024-05-12','domain','dom-00000006',NULL,NULL,6,5,1,0,0,83.3,'2024-05-12 10:00:00'),
('qs-hr-07','2024-05-07','domain','dom-00000006',NULL,NULL,5,5,0,0,0,100.0,'2024-05-07 10:00:00'),
-- Domain: GTM
('qs-gtm-14','2024-05-14','domain','dom-00000005',NULL,NULL,4,1,3,0,0,25.0,'2024-05-14 10:00:00'),
('qs-gtm-13','2024-05-13','domain','dom-00000005',NULL,NULL,4,2,2,0,0,50.0,'2024-05-13 10:00:00'),
('qs-gtm-07','2024-05-07','domain','dom-00000005',NULL,NULL,3,3,0,0,0,100.0,'2024-05-07 10:00:00'),
-- Table-level: INVOICES
('qs-inv-14','2024-05-14','table',NULL,NULL,'ast-rev-0001',7,1,6,0,0,14.3,'2024-05-14 10:00:00'),
('qs-inv-13','2024-05-13','table',NULL,NULL,'ast-rev-0001',7,1,6,0,0,14.3,'2024-05-13 10:00:00'),
('qs-inv-12','2024-05-12','table',NULL,NULL,'ast-rev-0001',7,4,3,0,0,57.1,'2024-05-12 10:00:00'),
('qs-inv-07','2024-05-07','table',NULL,NULL,'ast-rev-0001',7,7,0,0,0,100.0,'2024-05-07 10:00:00'),
-- Table-level: EMPLOYEES
('qs-emp-14','2024-05-14','table',NULL,NULL,'ast-hr-0001',6,1,5,0,0,16.7,'2024-05-14 10:00:00'),
('qs-emp-12','2024-05-12','table',NULL,NULL,'ast-hr-0001',6,5,1,0,0,83.3,'2024-05-12 10:00:00'),
-- Table-level: GL_JOURNAL_ENTRIES
('qs-gl-14','2024-05-14','table',NULL,NULL,'ast-fin-0001',5,0,5,0,0,0.0,'2024-05-14 10:00:00'),
('qs-gl-12','2024-05-12','table',NULL,NULL,'ast-fin-0001',5,3,2,0,0,60.0,'2024-05-12 10:00:00');

-- =============================================================================
-- DATA: DQ ALERTS (open alerts for critical and high severity failures)
-- =============================================================================
INSERT INTO RESULTS_SCHEMA.DQ_ALERTS VALUES
-- Critical: Revenue - null invoice_ids
('alrt-rev-001','run-rev-001-01','rul-rev-0001','dom-00000001','sub-rev-0001','ast-rev-0001',
 'critical','open',
 'CRITICAL: 3 invoice records have NULL invoice_id. This breaks billing reconciliation and prevents downstream revenue reporting.',
 'revenue@example.com,revenue.data@example.com','email',FALSE,'2024-05-14 06:00:08',NULL),

-- Critical: Revenue - duplicate invoice IDs
('alrt-rev-002','run-rev-002-01','rul-rev-0002','dom-00000001','sub-rev-0001','ast-rev-0001',
 'critical','acknowledged',
 'CRITICAL: Invoice ID INV-009 is duplicated. Risk of double-billing and incorrect revenue recognition.',
 'revenue@example.com','slack',TRUE,'2024-05-14 06:01:05',NULL),

-- Critical: Finance - GL unbalanced
('alrt-fin-001','run-fin-002-01','rul-fin-0002','dom-00000002','sub-fin-0001','ast-fin-0001',
 'critical','open',
 'CRITICAL: 4 GL journal entries are unbalanced (debit ≠ credit). SOX violation risk. Finance close may be impacted.',
 'finance@example.com,finance.data@example.com','email',TRUE,'2024-05-14 06:01:06',NULL),

-- Critical: Finance - null GL entry IDs
('alrt-fin-002','run-fin-001-01','rul-fin-0001','dom-00000002','sub-fin-0001','ast-fin-0001',
 'critical','open',
 'CRITICAL: 2 GL journal entries have NULL journal_entry_id. These cannot be audited or reconciled.',
 'finance@example.com','pagerduty',TRUE,'2024-05-14 06:00:05',NULL),

-- Critical: HR - salary is zero
('alrt-hr-001','run-hr-003-01','rul-hr-0003','dom-00000006','sub-hr-0001','ast-hr-0001',
 'critical','open',
 'CRITICAL: 2 active employees have salary = 0. This will result in incorrect payroll processing.',
 'hr@example.com,hr.data@example.com','email',TRUE,'2024-05-14 07:02:04',NULL),

-- High: Revenue - negative invoice amounts
('alrt-rev-003','run-rev-003-01','rul-rev-0003','dom-00000001','sub-rev-0001','ast-rev-0001',
 'high','open',
 'HIGH: 2 invoice records have negative amounts. Revenue reporting may be understated.',
 'revenue@example.com','slack',TRUE,'2024-05-14 06:02:04',NULL),

-- High: Revenue - invalid customer reference
('alrt-rev-004','run-rev-006-01','rul-rev-0006','dom-00000001','sub-rev-0001','ast-rev-0001',
 'critical','resolved',
 'CRITICAL: Invoice INV-014 references customer CUST-999 which does not exist in the customer master.',
 'revenue@example.com','email',TRUE,'2024-05-13 06:05:07','2024-05-13 14:30:00'),

-- High: Ops - negative inventory
('alrt-ops-001','run-ops-001-01','rul-ops-0001','dom-00000003','sub-ops-0001','ast-ops-0001',
 'high','open',
 'HIGH: 3 inventory items have negative quantity_on_hand. Warehouse count correction required.',
 'ops@example.com','slack',TRUE,'2024-05-14 06:00:03',NULL),

-- High: HR - exit before join date
('alrt-hr-002','run-hr-004-01','rul-hr-0004','dom-00000006','sub-hr-0001','ast-hr-0001',
 'high','open',
 'HIGH: Employee EMP-010 has exit_date (2024-01-01) before joining_date (2024-05-01). Data entry error.',
 'hr@example.com','email',TRUE,'2024-05-14 07:03:04',NULL);

-- =============================================================================
-- DATA: AUDIT LOGS (sample system actions)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.AUDIT_LOGS VALUES
('aud-001','admin@example.com','CREATE','domain','dom-00000001',NULL,
 PARSE_JSON('{"domain_name":"Revenue","owner_email":"revenue@example.com"}'),'2024-01-01 08:00:00'),
('aud-002','admin@example.com','CREATE','domain','dom-00000002',NULL,
 PARSE_JSON('{"domain_name":"Finance","owner_email":"finance@example.com"}'),'2024-01-01 08:01:00'),
('aud-003','admin@example.com','CREATE','data_asset','ast-rev-0001',NULL,
 PARSE_JSON('{"sf_table_name":"INVOICES","criticality":"critical"}'),'2024-01-10 08:05:00'),
('aud-004','admin@example.com','CREATE','rule','rul-rev-0001',NULL,
 PARSE_JSON('{"rule_name":"invoice_id_not_null","rule_type":"null_check","severity":"critical"}'),'2024-01-15 08:10:00'),
('aud-005','admin@example.com','APPROVE','rule','rul-rev-0001',
 PARSE_JSON('{"status":"pending_review"}'),
 PARSE_JSON('{"status":"active","approved_by":"admin@example.com"}'),'2024-01-15 09:00:00'),
('aud-006','domain.owner@example.com','UPDATE','rule','rul-rev-0003',
 PARSE_JSON('{"severity":"medium"}'),
 PARSE_JSON('{"severity":"high","reason":"Revenue impact assessment"}'),'2024-02-01 10:00:00'),
('aud-007','admin@example.com','CREATE','alert','alrt-fin-001',NULL,
 PARSE_JSON('{"severity":"critical","rule_id":"rul-fin-0002","message":"GL unbalanced"}'),(SELECT CURRENT_TIMESTAMP())),
('aud-008','finance@example.com','ACKNOWLEDGE','alert','alrt-rev-002',
 PARSE_JSON('{"alert_status":"open"}'),
 PARSE_JSON('{"alert_status":"acknowledged","acknowledged_by":"finance@example.com"}'),'2024-05-14 09:30:00'),
('aud-009','admin@example.com','CERTIFY','data_asset','ast-rev-0001',
 PARSE_JSON('{"certification_status":"uncertified"}'),
 PARSE_JSON('{"certification_status":"certified","certified_by":"admin@example.com"}'),'2024-02-15 14:00:00'),
('aud-010','admin@example.com','RESOLVE','alert','alrt-rev-004',
 PARSE_JSON('{"alert_status":"open"}'),
 PARSE_JSON('{"alert_status":"resolved","resolved_at":"2024-05-13T14:30:00"}'),'2024-05-13 14:30:00');
