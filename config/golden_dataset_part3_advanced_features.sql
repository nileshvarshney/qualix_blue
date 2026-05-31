-- =============================================================================
-- DQ PLATFORM GOLDEN DATASET - PART 3: ADVANCED FEATURES
-- =============================================================================
-- Purpose : Populate advanced governance, catalog, lineage, and compliance data.
--           Run AFTER Parts 1 and 2.
-- Covers  : glossary_terms, data_classifications, column_metadata,
--           data_products, data_lineage, compliance_mappings, tags,
--           custom_attributes, data_contracts, rule_templates, governance_policies,
--           asset_comments, asset_ratings, anomaly_detectors
-- =============================================================================

USE DATABASE DQ_PLATFORM_DB;
USE SCHEMA METADATA_SCHEMA;

-- =============================================================================
-- ADDITIONAL METADATA TABLES (advanced feature schemas)
-- =============================================================================

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.GLOSSARY_TERMS (
    term_id        VARCHAR(36)  NOT NULL PRIMARY KEY,
    term_name      VARCHAR(200) NOT NULL UNIQUE,
    definition     TEXT         NOT NULL,
    examples       TEXT,
    synonyms       TEXT,
    domain_id      VARCHAR(36),
    owner_email    VARCHAR(200),
    status         VARCHAR(20)  DEFAULT 'active',
    parent_term_id VARCHAR(36),
    created_by     VARCHAR(200),
    created_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.GLOSSARY_TERM_ASSETS (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    term_id     VARCHAR(36) NOT NULL,
    asset_id    VARCHAR(36) NOT NULL,
    column_name VARCHAR(200),
    created_by  VARCHAR(200),
    created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_CLASSIFICATIONS (
    classification_id VARCHAR(36) NOT NULL PRIMARY KEY,
    asset_id          VARCHAR(36) NOT NULL,
    column_name       VARCHAR(200),
    classification    VARCHAR(30) NOT NULL,  -- PII|SENSITIVE|CONFIDENTIAL|RESTRICTED|PUBLIC
    justification     TEXT,
    applied_by        VARCHAR(200),
    reviewed_at       TIMESTAMP_NTZ,
    created_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.COLUMN_METADATA (
    col_id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    asset_id         VARCHAR(36)  NOT NULL,
    column_name      VARCHAR(200) NOT NULL,
    data_type        VARCHAR(100),
    is_nullable      BOOLEAN,
    description      TEXT,
    sample_values    TEXT,
    is_primary_key   BOOLEAN DEFAULT FALSE,
    is_foreign_key   BOOLEAN DEFAULT FALSE,
    references_table VARCHAR(200),
    null_count       NUMBER(18),
    unique_count     NUMBER(18),
    min_value        TEXT,
    max_value        TEXT,
    avg_value        FLOAT,
    cardinality_pct  FLOAT,
    last_profiled_at TIMESTAMP_NTZ,
    updated_by       VARCHAR(200),
    updated_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE (asset_id, column_name)
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_PRODUCTS (
    product_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    description  TEXT,
    domain_id    VARCHAR(36),
    owner_email  VARCHAR(200),
    status       VARCHAR(20)  DEFAULT 'draft',  -- draft|published|deprecated
    tags         TEXT,
    readme       TEXT,
    version      VARCHAR(20)  DEFAULT '1.0',
    created_by   VARCHAR(200),
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_PRODUCT_ASSETS (
    id         VARCHAR(36) NOT NULL PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    asset_id   VARCHAR(36) NOT NULL,
    role       VARCHAR(50),   -- primary|supporting|output
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_LINEAGE (
    lineage_id          VARCHAR(36) NOT NULL PRIMARY KEY,
    upstream_asset_id   VARCHAR(36),
    downstream_asset_id VARCHAR(36),
    lineage_type        VARCHAR(30),
    downstream_name     VARCHAR(200),
    downstream_type     VARCHAR(50),   -- snowflake_table|dbt_model|looker_dashboard|custom
    transformation_sql  TEXT,
    description         TEXT,
    owner_email         VARCHAR(200),
    is_critical         BOOLEAN DEFAULT FALSE,
    created_by          VARCHAR(200),
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.TAGS (
    tag_id      VARCHAR(36)  NOT NULL PRIMARY KEY,
    tag_name    VARCHAR(100) NOT NULL UNIQUE,
    color       VARCHAR(7)   DEFAULT '#6366f1',
    description TEXT,
    created_by  VARCHAR(200),
    created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.ASSET_TAGS (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    tag_id      VARCHAR(36) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,   -- asset|rule|data_product
    entity_id   VARCHAR(36) NOT NULL,
    created_by  VARCHAR(200),
    created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE (tag_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.CUSTOM_ATTRIBUTES (
    attr_id     VARCHAR(36)  NOT NULL PRIMARY KEY,
    attr_key    VARCHAR(100) NOT NULL,
    attr_value  TEXT,
    entity_type VARCHAR(30)  NOT NULL,
    entity_id   VARCHAR(36)  NOT NULL,
    updated_by  VARCHAR(200),
    updated_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE (attr_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.DATA_CONTRACTS (
    contract_id         VARCHAR(36)  NOT NULL PRIMARY KEY,
    asset_id            VARCHAR(36)  NOT NULL,
    contract_name       VARCHAR(200) NOT NULL,
    version             VARCHAR(20)  DEFAULT '1.0',
    producer_team       VARCHAR(200),
    consumer_team       VARCHAR(200),
    status              VARCHAR(20)  DEFAULT 'draft',  -- draft|active|violated|deprecated
    schema_json         VARIANT,
    min_quality_score   FLOAT        DEFAULT 95.0,
    max_null_pct        FLOAT,
    max_staleness_hours NUMBER(5)    DEFAULT 24,
    sla_description     TEXT,
    breach_action       VARCHAR(50),
    effective_from      DATE,
    effective_until     DATE,
    created_by          VARCHAR(200),
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.COMPLIANCE_FRAMEWORKS (
    framework_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
    framework_name VARCHAR(100) NOT NULL UNIQUE,
    version        VARCHAR(20),
    description    TEXT,
    is_active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.COMPLIANCE_REQUIREMENTS (
    req_id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    framework_id    VARCHAR(36)  NOT NULL,
    req_code        VARCHAR(50),
    req_name        VARCHAR(200),
    req_description TEXT,
    dq_rule_types   TEXT
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.COMPLIANCE_MAPPINGS (
    mapping_id     VARCHAR(36) NOT NULL PRIMARY KEY,
    asset_id       VARCHAR(36) NOT NULL,
    framework_id   VARCHAR(36) NOT NULL,
    req_id         VARCHAR(36),
    rule_id        VARCHAR(36),
    status         VARCHAR(20) DEFAULT 'mapped',  -- mapped|gap|remediated
    evidence_note  TEXT,
    mapped_by      VARCHAR(200),
    created_at     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.ASSET_COMMENTS (
    comment_id   VARCHAR(36) NOT NULL PRIMARY KEY,
    entity_type  VARCHAR(30) NOT NULL,
    entity_id    VARCHAR(36) NOT NULL,
    parent_id    VARCHAR(36),
    body         TEXT        NOT NULL,
    comment_type VARCHAR(20) DEFAULT 'comment',  -- comment|question|issue|announcement
    is_resolved  BOOLEAN     DEFAULT FALSE,
    author_email VARCHAR(200),
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.ASSET_RATINGS (
    rating_id  VARCHAR(36)  NOT NULL PRIMARY KEY,
    asset_id   VARCHAR(36)  NOT NULL,
    rating     NUMBER(1)    NOT NULL,
    review     TEXT,
    user_email VARCHAR(200),
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE (asset_id, user_email)
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.RULE_TEMPLATES (
    template_id      VARCHAR(36)  NOT NULL PRIMARY KEY,
    template_name    VARCHAR(200) NOT NULL,
    description      TEXT,
    rule_type        VARCHAR(50)  NOT NULL,
    default_config   VARIANT,
    target_domains   TEXT,
    target_industries TEXT,
    tags             TEXT,
    author_email     VARCHAR(200),
    is_public        BOOLEAN DEFAULT FALSE,
    downloads        NUMBER(8) DEFAULT 0,
    rating           FLOAT    DEFAULT 0.0,
    created_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.GOVERNANCE_POLICIES (
    policy_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
    policy_name VARCHAR(200) NOT NULL,
    policy_type VARCHAR(50)  NOT NULL,
    description TEXT,
    severity    VARCHAR(20)  DEFAULT 'medium',
    is_active   BOOLEAN      DEFAULT TRUE,
    config      VARIANT,
    created_by  VARCHAR(200),
    created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS METADATA_SCHEMA.SLA_CONFIGS (
    sla_id                    VARCHAR(36) NOT NULL PRIMARY KEY,
    entity_type               VARCHAR(20) NOT NULL,
    entity_id                 VARCHAR(36) NOT NULL,
    min_quality_score         FLOAT       DEFAULT 95.0,
    max_failure_pct           FLOAT       DEFAULT 5.0,
    alert_on_breach           BOOLEAN     DEFAULT TRUE,
    notification_emails       TEXT,
    notification_slack_channel VARCHAR(200),
    is_active                 BOOLEAN     DEFAULT TRUE,
    created_at                TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    updated_at                TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- =============================================================================
-- DATA: BUSINESS GLOSSARY TERMS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.GLOSSARY_TERMS VALUES
('gls-001','Invoice',
 'A formal document issued by a seller to a buyer that lists the goods or services provided, quantities, and prices. Serves as the basis for revenue recognition.',
 'INV-001 with amount $12,500 for enterprise software licenses',
 'Bill, Receipt, Statement',
 'dom-00000001','revenue@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-002','Invoice Amount',
 'The total monetary value charged on an invoice before any adjustments. Must always be non-negative; refunds are tracked in a separate CREDITS table.',
 'invoice_amount = 12500.00 (USD)',
 'Billed Amount, Charge Amount',
 'dom-00000001','revenue@example.com','active','gls-001','admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-003','Quality Score',
 'A 0-100 score representing the percentage of data quality rules that passed for a given table, subdomain, or domain. Calculated as: 100 - (weighted_penalty_sum). Critical failures deduct 25 points each.',
 'A table with 10 rules where 8 pass and 2 fail (1 critical, 1 high) scores: 100 - 25 - 15 = 60',
 'DQ Score, Health Score, Data Health',
 NULL,'platform@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-004','Journal Entry',
 'A financial record in the General Ledger that documents a business transaction. Every journal entry must have equal debit and credit amounts (balanced entry principle).',
 'JE-001: Debit AR $100,000 / Credit Revenue $100,000',
 'GL Entry, Ledger Entry, Accounting Entry',
 'dom-00000002','finance@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-005','MRR',
 'Monthly Recurring Revenue - the predictable total revenue generated by all active subscriptions in a given month. A key SaaS metric that must be positive and tracked daily.',
 'SUB-001 with Enterprise plan at $8,500/month contributes $8,500 to MRR',
 'Monthly Recurring Revenue, Subscription Revenue',
 'dom-00000001','revenue@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-006','Employee ID',
 'A unique alphanumeric identifier assigned to each employee upon joining the company. Must never be null or duplicated. Format: EMP-NNN.',
 'EMP-001 = Sarah Chen, Finance Manager',
 'Staff ID, Worker ID, Personnel Number',
 'dom-00000006','hr@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-007','Lead Conversion Rate',
 'The percentage of leads that convert to paying customers. Must be between 0 and 100. Values above 100 indicate a data entry error.',
 'If 10 out of 20 qualified leads become customers, conversion rate = 50%',
 'Win Rate, Conversion Percentage',
 'dom-00000005','gtm@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-008','Data Contract',
 'A formal agreement between a data producer (team that owns the table) and data consumer (team that uses the data) specifying guaranteed schema, quality thresholds, and SLA.',
 'Revenue team guarantees: invoices table quality ≥ 95%, freshness ≤ 24h, invoice_id never null',
 'SLA Agreement, Quality SLA, Data SLA',
 NULL,'platform@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-009','PII',
 'Personally Identifiable Information - any data that can be used to identify an individual. Examples include name, email, phone number, employee ID, salary, SSN. Must be classified and protected.',
 'employee.email, employee.salary, customer.email, leads.first_name',
 'Personal Data, Personal Information, Sensitive Personal Data',
 NULL,'platform@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00'),

('gls-010','SLA Breach',
 'A quality threshold breach that occurs when a table or domain quality score falls below its configured minimum quality score (default 95%). Triggers automatic alerting.',
 'If Finance GL quality score drops to 73% (below 95% SLA), a breach alert is generated',
 'Quality Breach, Threshold Violation',
 NULL,'platform@example.com','active',NULL,'admin@example.com','2024-01-20 08:00:00','2024-01-20 08:00:00');

-- Link glossary terms to assets
INSERT INTO METADATA_SCHEMA.GLOSSARY_TERM_ASSETS VALUES
('gta-001','gls-001','ast-rev-0001',NULL,'admin@example.com','2024-01-20 08:00:00'),
('gta-002','gls-001','ast-rev-0001','invoice_id','admin@example.com','2024-01-20 08:00:00'),
('gta-003','gls-002','ast-rev-0001','invoice_amount','admin@example.com','2024-01-20 08:00:00'),
('gta-004','gls-004','ast-fin-0001',NULL,'admin@example.com','2024-01-20 08:00:00'),
('gta-005','gls-005','ast-rev-0003','mrr','admin@example.com','2024-01-20 08:00:00'),
('gta-006','gls-006','ast-hr-0001','employee_id','admin@example.com','2024-01-20 08:00:00'),
('gta-007','gls-007','ast-gtm-0001','conversion_rate','admin@example.com','2024-01-20 08:00:00'),
('gta-008','gls-009','ast-hr-0001','email','admin@example.com','2024-01-20 08:00:00'),
('gta-009','gls-009','ast-hr-0001','salary','admin@example.com','2024-01-20 08:00:00'),
('gta-010','gls-009','ast-gtm-0001','email','admin@example.com','2024-01-20 08:00:00');

-- =============================================================================
-- DATA: DATA CLASSIFICATIONS (PII and sensitivity tags)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DATA_CLASSIFICATIONS VALUES
-- EMPLOYEES table: multiple PII columns
('cls-001','ast-hr-0001','email','PII',
 'Employee email is PII - used for communication and identity verification',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
('cls-002','ast-hr-0001','salary','SENSITIVE',
 'Employee salary is sensitive financial data, restricted to HR and Finance leadership',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
('cls-003','ast-hr-0001','full_name','PII',
 'Employee full name is PII',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
('cls-004','ast-hr-0002','net_pay','SENSITIVE',
 'Payroll net pay amounts are sensitive financial data',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
-- CUSTOMERS table
('cls-005','ast-rev-0002','email','PII',
 'Customer email is PII and must be protected under GDPR and CCPA',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
('cls-006','ast-rev-0002','phone','PII',
 'Customer phone number is PII',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
-- LEADS table
('cls-007','ast-gtm-0001','email','PII',
 'Lead email is PII captured under GDPR consent requirements',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
('cls-008','ast-gtm-0001','first_name','PII',
 'Lead first name is PII',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
-- INVOICES: financial data
('cls-009','ast-rev-0001','invoice_amount','SENSITIVE',
 'Invoice amounts are sensitive financial data subject to SOX controls',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00'),
-- GL: restricted
('cls-010','ast-fin-0001',NULL,'RESTRICTED',
 'GL journal entries are restricted to Finance team only - SOX material',
 'admin@example.com','2024-02-01 09:00:00','2024-01-25 08:00:00');

-- =============================================================================
-- DATA: COLUMN METADATA (schema + profiling stats for INVOICES table)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.COLUMN_METADATA VALUES
('col-inv-001','ast-rev-0001','invoice_id','VARCHAR(36)',TRUE,
 'Unique identifier for each invoice. Must never be null.',
 '["INV-001","INV-002","INV-003"]',
 FALSE,FALSE,NULL,
 3,17,'INV-001','INV-020',NULL,85.0,'2024-05-14 06:00:00','admin@example.com','2024-05-14 06:00:00'),

('col-inv-002','ast-rev-0001','customer_id','VARCHAR(36)',FALSE,
 'Reference to the CUSTOMERS table. Every invoice must belong to a valid customer.',
 '["CUST-001","CUST-002","CUST-003"]',
 FALSE,TRUE,'SOURCE_DATA.CUSTOMERS',
 0,10,'CUST-001','CUST-010',NULL,52.6,'2024-05-14 06:00:00','admin@example.com','2024-05-14 06:00:00'),

('col-inv-003','ast-rev-0001','invoice_date','DATE',FALSE,
 'The date the invoice was issued. Must not be in the future.',
 '["2024-01-10","2024-02-01","2024-03-15"]',
 FALSE,FALSE,NULL,
 0,19,'2024-01-10','2099-12-31',NULL,100.0,'2024-05-14 06:00:00','admin@example.com','2024-05-14 06:00:00'),

('col-inv-004','ast-rev-0001','invoice_amount','NUMBER(15,2)',FALSE,
 'Total amount charged on the invoice in the specified currency. Must be >= 0.',
 '["-1200.00","3250.00","12500.00"]',
 FALSE,FALSE,NULL,
 0,19,-1200.00,99000.00,19073.68,90.5,'2024-05-14 06:00:00','admin@example.com','2024-05-14 06:00:00'),

('col-inv-005','ast-rev-0001','status','VARCHAR(20)',FALSE,
 'Current status of the invoice. Allowed values: PAID, PENDING, FAILED, CANCELLED.',
 '["PAID","PENDING","FAILED","CANCELLED"]',
 FALSE,FALSE,NULL,
 0,5,NULL,NULL,NULL,26.3,'2024-05-14 06:00:00','admin@example.com','2024-05-14 06:00:00'),

-- EMPLOYEES table profiling
('col-emp-001','ast-hr-0001','employee_id','VARCHAR(36)',TRUE,
 'Unique employee identifier. Format: EMP-NNN. Must never be null or duplicated.',
 '["EMP-001","EMP-002","EMP-003"]',
 TRUE,FALSE,NULL,
 1,12,'EMP-001','EMP-012',NULL,92.3,'2024-05-14 07:00:00','admin@example.com','2024-05-14 07:00:00'),

('col-emp-002','ast-hr-0001','salary','NUMBER(12,2)',FALSE,
 'Annual base salary in USD. Must be > 0 for all full-time and part-time employees.',
 '["0.00","72000.00","175000.00"]',
 FALSE,FALSE,NULL,
 0,11,0.00,175000.00,101000.00,84.6,'2024-05-14 07:00:00','admin@example.com','2024-05-14 07:00:00'),

('col-emp-003','ast-hr-0001','email','VARCHAR(200)',FALSE,
 'Work email address. Must follow valid RFC email format. PII - handle with care.',
 '["sarah.chen@example.com","mike.johnson@example.com"]',
 FALSE,FALSE,NULL,
 0,14,NULL,NULL,NULL,100.0,'2024-05-14 07:00:00','admin@example.com','2024-05-14 07:00:00');

-- =============================================================================
-- DATA: DATA PRODUCTS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DATA_PRODUCTS VALUES
('dp-001','Revenue 360',
 'A comprehensive view of all revenue-related data including invoices, subscriptions, and customer billing. Primary source of truth for revenue reporting and forecasting.',
 'dom-00000001','revenue@example.com','published',
 'revenue,billing,subscriptions,ARR,MRR',
 '# Revenue 360 Data Product

## Overview
The Revenue 360 data product provides a unified view of all revenue streams across billing, subscriptions, and one-time invoices.

## Tables Included
- **INVOICES** (primary): All customer invoices with payment status
- **SUBSCRIPTIONS** (primary): SaaS subscription records including MRR
- **CUSTOMERS** (supporting): Customer master reference data

## Quality SLA
- Quality score must be >= 95%
- Invoice table refreshed hourly
- Subscription table refreshed daily at 6AM PST

## Data Owner
Revenue Data Engineering Team - revenue@example.com',
 '2.1','admin@example.com','2024-02-01 10:00:00','2024-05-01 10:00:00'),

('dp-002','Finance Compliance Pack',
 'SOX-compliant financial data package including GL journal entries, AP, and AR. Used for monthly close reporting and audit evidence.',
 'dom-00000002','finance@example.com','published',
 'finance,SOX,GL,compliance,audit',
 '# Finance Compliance Data Product

## Purpose
Provides audited, SOX-compliant financial data for reporting and regulatory purposes.

## Quality Requirements
- GL entries must be 100% balanced (debit = credit)
- No null journal entry IDs
- Quality score >= 98%

## Data Owner
Finance Data Team - finance@example.com',
 '1.5','admin@example.com','2024-02-15 10:00:00','2024-04-15 10:00:00'),

('dp-003','HR People Analytics',
 'Employee and payroll data product for people analytics, headcount reporting, and HR dashboards. PII-protected with column masking policies.',
 'dom-00000006','hr@example.com','draft',
 'HR,people,payroll,PII,headcount',
 '# HR People Analytics

## Notice: PII Data
This data product contains PII. Access requires approval from HR leadership.

## Tables
- EMPLOYEES: Full employee master data
- PAYROLL: Monthly payroll records',
 '1.0','admin@example.com','2024-03-01 10:00:00','2024-03-01 10:00:00');

-- Link data products to assets
INSERT INTO METADATA_SCHEMA.DATA_PRODUCT_ASSETS VALUES
('dpa-001','dp-001','ast-rev-0001','primary','2024-02-01 10:00:00'),
('dpa-002','dp-001','ast-rev-0003','primary','2024-02-01 10:00:00'),
('dpa-003','dp-001','ast-rev-0002','supporting','2024-02-01 10:00:00'),
('dpa-004','dp-002','ast-fin-0001','primary','2024-02-15 10:00:00'),
('dpa-005','dp-002','ast-fin-0002','supporting','2024-02-15 10:00:00'),
('dpa-006','dp-003','ast-hr-0001','primary','2024-03-01 10:00:00'),
('dpa-007','dp-003','ast-hr-0002','primary','2024-03-01 10:00:00');

-- =============================================================================
-- DATA: DATA LINEAGE
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DATA_LINEAGE VALUES
-- Invoices → Subscriptions relationship
('lin-001','ast-rev-0002','ast-rev-0001','table_to_table',NULL,'snowflake_table',
 'INVOICES.customer_id REFERENCES CUSTOMERS.customer_id',
 'Customer master data feeds all invoice records',
 'revenue@example.com',TRUE,'admin@example.com','2024-02-01 10:00:00','2024-02-01 10:00:00'),

-- Invoices → Revenue Summary Dashboard
('lin-002','ast-rev-0001',NULL,'table_to_report',
 'Revenue Executive Dashboard','looker_dashboard',
 NULL,
 'Daily revenue KPIs including total billed, collected, and outstanding amounts',
 'revenue@example.com',TRUE,'admin@example.com','2024-02-01 10:00:00','2024-02-01 10:00:00'),

-- GL entries → Finance Close Report
('lin-003','ast-fin-0001',NULL,'table_to_report',
 'Monthly Finance Close Package','tableau_dashboard',
 NULL,
 'GL data is the primary source for the monthly finance close report used for board reporting',
 'finance@example.com',TRUE,'admin@example.com','2024-02-15 10:00:00','2024-02-15 10:00:00'),

-- Employees → Payroll (same domain lineage)
('lin-004','ast-hr-0001','ast-hr-0002','table_to_table',NULL,'snowflake_table',
 'PAYROLL.employee_id REFERENCES EMPLOYEES.employee_id',
 'Employee master data is the source for all payroll records',
 'hr@example.com',TRUE,'admin@example.com','2024-03-01 10:00:00','2024-03-01 10:00:00'),

-- Orders → Shipments
('lin-005','ast-ops-0002','ast-ops-0003','table_to_table',NULL,'snowflake_table',
 'SHIPMENTS.order_id REFERENCES ORDERS.order_id',
 'Every shipment must correspond to a valid order',
 'ops@example.com',FALSE,'admin@example.com','2024-03-01 10:00:00','2024-03-01 10:00:00'),

-- Invoices → AR report
('lin-006','ast-rev-0001',NULL,'table_to_report',
 'AR Aging Report','metabase',
 NULL,
 'Accounts receivable aging report uses invoice data to track outstanding payments',
 'finance@example.com',FALSE,'admin@example.com','2024-03-01 10:00:00','2024-03-01 10:00:00'),

-- Leads → CRM Pipeline (downstream outside platform)
('lin-007','ast-gtm-0001',NULL,'table_to_report',
 'Salesforce CRM Pipeline','custom',
 NULL,
 'Lead data is synced to Salesforce for sales team follow-up',
 'gtm@example.com',FALSE,'admin@example.com','2024-03-01 10:00:00','2024-03-01 10:00:00');

-- =============================================================================
-- DATA: TAGS & ASSET TAGS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.TAGS VALUES
('tag-001','SOX Critical',   '#ef4444','Tables subject to Sarbanes-Oxley financial reporting controls',     'admin@example.com','2024-01-20 08:00:00'),
('tag-002','PII',            '#f97316','Tables containing Personally Identifiable Information',              'admin@example.com','2024-01-20 08:00:00'),
('tag-003','GDPR',           '#8b5cf6','Tables subject to EU GDPR data privacy requirements',               'admin@example.com','2024-01-20 08:00:00'),
('tag-004','Revenue Critical','#22c55e','Tables directly impacting revenue recognition and billing',          'admin@example.com','2024-01-20 08:00:00'),
('tag-005','Needs Review',   '#f59e0b','Tables that require additional data quality review',                 'admin@example.com','2024-01-20 08:00:00'),
('tag-006','Golden Dataset', '#6366f1','Demo dataset used for training and testing the DQ platform',         'admin@example.com','2024-01-20 08:00:00'),
('tag-007','High Volume',    '#0ea5e9','Tables with high row counts requiring performance-optimized rules',   'admin@example.com','2024-01-20 08:00:00'),
('tag-008','Certified',      '#10b981','Tables that have passed certification review',                        'admin@example.com','2024-01-20 08:00:00');

INSERT INTO METADATA_SCHEMA.ASSET_TAGS VALUES
('at-001','tag-001','asset','ast-fin-0001','admin@example.com','2024-01-25 08:00:00'),
('at-002','tag-002','asset','ast-hr-0001', 'admin@example.com','2024-01-25 08:00:00'),
('at-003','tag-002','asset','ast-hr-0002', 'admin@example.com','2024-01-25 08:00:00'),
('at-004','tag-002','asset','ast-rev-0002','admin@example.com','2024-01-25 08:00:00'),
('at-005','tag-002','asset','ast-gtm-0001','admin@example.com','2024-01-25 08:00:00'),
('at-006','tag-003','asset','ast-hr-0001', 'admin@example.com','2024-01-25 08:00:00'),
('at-007','tag-003','asset','ast-gtm-0001','admin@example.com','2024-01-25 08:00:00'),
('at-008','tag-004','asset','ast-rev-0001','admin@example.com','2024-01-25 08:00:00'),
('at-009','tag-004','asset','ast-rev-0003','admin@example.com','2024-01-25 08:00:00'),
('at-010','tag-005','asset','ast-ops-0001','admin@example.com','2024-01-25 08:00:00'),
('at-011','tag-006','asset','ast-rev-0001','admin@example.com','2024-01-25 08:00:00'),
('at-012','tag-008','asset','ast-rev-0001','admin@example.com','2024-01-25 08:00:00'),
('at-013','tag-008','asset','ast-rev-0002','admin@example.com','2024-01-25 08:00:00'),
('at-014','tag-001','rule', 'rul-fin-0002','admin@example.com','2024-01-25 08:00:00'),
('at-015','tag-004','rule', 'rul-rev-0001','admin@example.com','2024-01-25 08:00:00');

-- =============================================================================
-- DATA: CUSTOM ATTRIBUTES
-- =============================================================================
INSERT INTO METADATA_SCHEMA.CUSTOM_ATTRIBUTES VALUES
('ca-001','data_steward',     'sarah.chen@example.com',   'asset','ast-fin-0001','admin@example.com','2024-02-01 08:00:00'),
('ca-002','retention_days',   '2555',                     'asset','ast-fin-0001','admin@example.com','2024-02-01 08:00:00'),
('ca-003','gdpr_relevant',    'true',                     'asset','ast-hr-0001', 'admin@example.com','2024-02-01 08:00:00'),
('ca-004','data_steward',     'emma.davis@example.com',   'asset','ast-hr-0001', 'admin@example.com','2024-02-01 08:00:00'),
('ca-005','sox_in_scope',     'true',                     'asset','ast-fin-0001','admin@example.com','2024-02-01 08:00:00'),
('ca-006','sox_in_scope',     'false',                    'asset','ast-gtm-0001','admin@example.com','2024-02-01 08:00:00'),
('ca-007','business_criticality','Revenue Tier 1',        'asset','ast-rev-0001','admin@example.com','2024-02-01 08:00:00'),
('ca-008','last_audit_date',  '2024-03-31',               'asset','ast-fin-0001','admin@example.com','2024-04-01 08:00:00'),
('ca-009','row_count_estimate','50000',                   'asset','ast-hr-0001', 'admin@example.com','2024-02-01 08:00:00'),
('ca-010','ingestion_pipeline','airflow_dag_invoice_load','asset','ast-rev-0001','admin@example.com','2024-02-01 08:00:00');

-- =============================================================================
-- DATA: DATA CONTRACTS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.DATA_CONTRACTS VALUES
('dc-001','ast-rev-0001','Invoice Data Contract v2.1',
 '2.1','Revenue Data Engineering','Finance Analytics Team',
 'active',
 PARSE_JSON('{"columns":[{"name":"invoice_id","type":"VARCHAR","nullable":false},{"name":"customer_id","type":"VARCHAR","nullable":false},{"name":"invoice_date","type":"DATE","nullable":false},{"name":"invoice_amount","type":"NUMBER","nullable":false},{"name":"status","type":"VARCHAR","nullable":false,"allowed_values":["PAID","PENDING","FAILED","CANCELLED"]}]}'),
 95.0,1.0,24,
 'Invoice table must maintain >= 95% quality score, be refreshed within 24 hours, and have no null invoice_ids.',
 'alert','2024-01-01','2025-12-31','admin@example.com','2024-01-15 09:00:00','2024-05-01 09:00:00'),

('dc-002','ast-fin-0001','GL Journal Entry Data Contract v1.0',
 '1.0','Finance Data Engineering','Finance Reporting Team',
 'violated',
 PARSE_JSON('{"columns":[{"name":"journal_entry_id","type":"VARCHAR","nullable":false},{"name":"debit_amount","type":"NUMBER","nullable":false},{"name":"credit_amount","type":"NUMBER","nullable":false}],"business_rules":["debit_amount = credit_amount for each entry"]}'),
 98.0,0.5,48,
 'GL entries must be 100% balanced. Zero tolerance for unbalanced entries. Quality score must be >= 98%.',
 'block','2024-01-01','2025-12-31','admin@example.com','2024-01-15 09:00:00','2024-05-14 09:00:00'),

('dc-003','ast-hr-0001','Employee Data Contract v1.0',
 '1.0','HR Data Engineering','People Analytics Team',
 'active',
 PARSE_JSON('{"columns":[{"name":"employee_id","type":"VARCHAR","nullable":false},{"name":"salary","type":"NUMBER","min_value":0.01},{"name":"employment_type","type":"VARCHAR","allowed_values":["FULL_TIME","PART_TIME","CONTRACTOR"]}]}'),
 92.0,5.0,24,
 'Employee data must have no null IDs, positive salaries, and valid employment types.',
 'notify','2024-01-01','2025-12-31','admin@example.com','2024-01-15 09:00:00','2024-01-15 09:00:00');

-- =============================================================================
-- DATA: COMPLIANCE FRAMEWORKS & REQUIREMENTS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.COMPLIANCE_FRAMEWORKS VALUES
('cf-001','GDPR',     '2018','EU General Data Protection Regulation',TRUE),
('cf-002','CCPA',     '2020','California Consumer Privacy Act',       TRUE),
('cf-003','HIPAA',    '1996','Health Insurance Portability and Accountability Act',FALSE),
('cf-004','SOX',      '2002','Sarbanes-Oxley Act',                   TRUE),
('cf-005','BCBS 239', '2013','BCBS Principles for Risk Data Aggregation',FALSE),
('cf-006','ISO 27001','2022','Information Security Management',       TRUE);

INSERT INTO METADATA_SCHEMA.COMPLIANCE_REQUIREMENTS VALUES
('cr-001','cf-001','GDPR_5_1_d','Data Accuracy',          'Personal data must be accurate and kept up to date',           'null_check,range_check,regex_check'),
('cr-002','cf-001','GDPR_5_1_e','Storage Limitation',     'Personal data not kept longer than necessary',                 'freshness_check'),
('cr-003','cf-001','GDPR_17',   'Right to Erasure',       'Ability to identify and delete all personal data',             'null_check,uniqueness_check'),
('cr-004','cf-004','SOX_302',   'CEO/CFO Certification',  'Executives certify accuracy of financial reports',             'null_check,uniqueness_check,range_check'),
('cr-005','cf-004','SOX_404',   'Internal Controls',      'Management assesses internal controls over financial reporting','custom_sql_check,business_rule_check'),
('cr-006','cf-004','SOX_GL',    'GL Completeness',        'All journal entries must be complete and accurately recorded',  'null_check,uniqueness_check'),
('cr-007','cf-006','ISO_A8',    'Asset Management',       'All information assets must be identified and have owners',     'null_check'),
('cr-008','cf-006','ISO_A9',    'Access Control',         'Access restricted based on business requirements',             'accepted_values_check,null_check');

-- Compliance mappings: which rules satisfy which requirements
INSERT INTO METADATA_SCHEMA.COMPLIANCE_MAPPINGS VALUES
('cm-001','ast-hr-0001','cf-001','cr-001','rul-hr-0005','mapped',
 'regex_check on employee.email ensures email accuracy under GDPR Art.5(1)(d)',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-002','ast-hr-0001','cf-001','cr-003','rul-hr-0001','mapped',
 'null_check on employee_id enables erasure tracking under GDPR Art.17',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-003','ast-gtm-0001','cf-001','cr-001','rul-gtm-0001','mapped',
 'regex_check on lead.email ensures accuracy under GDPR',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-004','ast-fin-0001','cf-004','cr-004','rul-fin-0001','mapped',
 'null_check on journal_entry_id supports SOX 302 financial data accuracy',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-005','ast-fin-0001','cf-004','cr-005','rul-fin-0002','mapped',
 'business_rule_check for debit=credit balance directly addresses SOX 404 internal controls',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-006','ast-fin-0001','cf-004','cr-006','rul-fin-0001','mapped',
 'null_check on journal_entry_id ensures GL completeness under SOX',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-007','ast-rev-0001','cf-004','cr-004','rul-rev-0001','mapped',
 'null_check on invoice_id supports revenue integrity under SOX 302',
 'admin@example.com','2024-02-01 10:00:00'),
('cm-008','ast-rev-0002','cf-001','cr-003','rul-rev-0006','gap',
 'No rule currently tests GDPR right-to-erasure path for customer data - gap identified',
 'admin@example.com','2024-02-01 10:00:00');

-- =============================================================================
-- DATA: GOVERNANCE POLICIES
-- =============================================================================
INSERT INTO METADATA_SCHEMA.GOVERNANCE_POLICIES VALUES
('gp-001','Owner Required',         'owner_required',        'Every table must have an assigned owner_email','medium',TRUE,NULL,'system','2024-01-01 08:00:00'),
('gp-002','Certification Required', 'certification_required','Tables in production for >30 days must be certified','low',TRUE,PARSE_JSON('{"days_threshold":30}'),'system','2024-01-01 08:00:00'),
('gp-003','No Rules Defined',       'no_rules_defined',      'Tables registered for >7 days with no active rules','high',TRUE,PARSE_JSON('{"days_threshold":7}'),'system','2024-01-01 08:00:00'),
('gp-004','Missing Description',    'stale_description',     'Tables with no description or description unchanged >90 days','low',TRUE,PARSE_JSON('{"days_threshold":90}'),'system','2024-01-01 08:00:00'),
('gp-005','No PII Classification',  'no_pii_classification', 'Tables with PII columns that have not been classified','critical',TRUE,NULL,'system','2024-01-01 08:00:00'),
('gp-006','SLA Breach',             'sla_breach',            'Quality score fell below the configured SLA threshold','high',TRUE,PARSE_JSON('{"default_threshold":95.0}'),'system','2024-01-01 08:00:00');

-- =============================================================================
-- DATA: SLA CONFIGS (per-entity quality thresholds)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.SLA_CONFIGS VALUES
-- Global baseline
('sla-global','global','global',95.0,5.0,TRUE,
 'platform@example.com',NULL,TRUE,'2024-01-01 08:00:00','2024-01-01 08:00:00'),
-- Domain-level SLAs
('sla-rev-dom','domain','dom-00000001',95.0,5.0,TRUE,
 'revenue@example.com','#revenue-dq-alerts',TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sla-fin-dom','domain','dom-00000002',98.0,2.0,TRUE,
 'finance@example.com','#finance-dq-alerts',TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sla-hr-dom', 'domain','dom-00000006',95.0,5.0,TRUE,
 'hr@example.com','#hr-dq-alerts',TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
-- Table-level SLAs (stricter for critical tables)
('sla-inv-tbl','table','ast-rev-0001',95.0,5.0,TRUE,
 'revenue@example.com,revenue.data@example.com',NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sla-gl-tbl', 'table','ast-fin-0001',98.0,2.0,TRUE,
 'finance@example.com,finance.data@example.com',NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00'),
('sla-emp-tbl','table','ast-hr-0001', 95.0,5.0,TRUE,
 'hr@example.com,hr.data@example.com',NULL,TRUE,'2024-01-15 08:00:00','2024-01-15 08:00:00');

-- =============================================================================
-- DATA: ASSET COMMENTS (discussion and knowledge sharing)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.ASSET_COMMENTS VALUES
-- Announcement on INVOICES table about upcoming schema change
('cmt-001','asset','ast-rev-0001',NULL,
 '⚠️ **Planned Schema Change**: The `invoice_amount` column will be split into `subtotal` and `tax_amount` columns on 2024-07-01. Please update any downstream rules or dashboards that reference `invoice_amount` directly.',
 'announcement',FALSE,'carlos.rivera@example.com','2024-05-10 09:00:00','2024-05-10 09:00:00'),

-- Question on GL table
('cmt-002','asset','ast-fin-0001',NULL,
 'Why are journal entries JE-007 and JE-008 unbalanced? This is causing the SOX compliance check to fail for April 2024.',
 'question',FALSE,'mike.johnson@example.com','2024-05-14 08:00:00','2024-05-14 08:00:00'),

-- Reply to question
('cmt-003','asset','ast-fin-0001','cmt-002',
 'The imbalance in JE-007/JE-008 was caused by a manual payroll adjustment that was entered in two separate batches. We are processing a correcting entry (JE-015) today. The payroll system integration was also reconfigured to prevent this.',
 'comment',TRUE,'sarah.chen@example.com','2024-05-14 10:30:00','2024-05-14 10:30:00'),

-- Issue filed on EMPLOYEES table
('cmt-004','asset','ast-hr-0001',NULL,
 '🐛 **Data Issue**: Found employee EMP-010 (Alex Kumar) with exit_date before joining_date. Exit date shows 2024-01-01 but joining date is 2024-05-01. This was an HRIS data entry error. Corrected exit date should be 2024-12-31.',
 'issue',FALSE,'emma.davis@example.com','2024-05-13 14:00:00','2024-05-13 14:00:00'),

-- Comment on LEADS table about email quality
('cmt-005','asset','ast-gtm-0001',NULL,
 'The 3 invalid email addresses (LEAD-009, LEAD-010, LEAD-011) came from a trade show lead import that did not validate email format at capture. We have updated the form validation. These leads should be marked as LOST.',
 'comment',FALSE,'carlos.rivera@example.com','2024-05-14 11:00:00','2024-05-14 11:00:00'),

-- General comment on INVOICES rule
('cmt-006','rule','rul-rev-0001',NULL,
 'This null check has been critical - it caught 3 invoices without IDs that would have caused billing reconciliation failures. Recommend increasing severity to CRITICAL and adding PagerDuty notification.',
 'comment',FALSE,'revenue.data@example.com','2024-05-14 12:00:00','2024-05-14 12:00:00');

-- =============================================================================
-- DATA: ASSET RATINGS
-- =============================================================================
INSERT INTO METADATA_SCHEMA.ASSET_RATINGS VALUES
('rat-001','ast-rev-0001',5,'Excellent invoice data quality when properly monitored. The DQ rules caught a billing issue before month-end close.','sarah.chen@example.com','2024-03-01 10:00:00'),
('rat-002','ast-rev-0001',4,'Good quality overall but the null invoice_id issue needs permanent fix.','mike.johnson@example.com','2024-04-01 10:00:00'),
('rat-003','ast-fin-0001',3,'GL data quality varies month to month. The debit/credit balance check is essential but not always passing.','finance.data@example.com','2024-04-15 10:00:00'),
('rat-004','ast-hr-0001', 4,'HR data is generally well maintained. The salary=0 and date inconsistency issues are edge cases.','hr.data@example.com','2024-04-20 10:00:00'),
('rat-005','ast-gtm-0001',3,'Lead email quality needs improvement. The conversion rate > 100 issue points to a CRM import bug.','gtm.data@example.com','2024-04-25 10:00:00');

-- =============================================================================
-- DATA: RULE TEMPLATES (marketplace templates for reuse)
-- =============================================================================
INSERT INTO METADATA_SCHEMA.RULE_TEMPLATES VALUES
('rt-001','Not Null Check - Primary Key',
 'Ensures a primary key or required identifier column is never null. Apply to any column that serves as a unique record identifier.',
 'null_check',
 PARSE_JSON('{"columns":["id_column"]}'),
 'Revenue,Finance,HR,Operations,GTM','All','null,primary_key,identifier',
 'platform@example.com',TRUE,142,4.8,'2024-01-01 08:00:00'),

('rt-002','Uniqueness Check - Business Key',
 'Ensures a business key column has no duplicates. Apply to invoice_id, employee_id, order_id, etc.',
 'uniqueness_check',
 PARSE_JSON('{"columns":["business_key_column"]}'),
 'Revenue,Finance,HR','All','unique,deduplicate,primary_key',
 'platform@example.com',TRUE,98,4.7,'2024-01-01 08:00:00'),

('rt-003','Email Format Validation',
 'Validates email address format using RFC-compliant regex. Apply to any email column in customer, employee, or lead tables.',
 'regex_check',
 PARSE_JSON('{"pattern":"^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$"}'),
 'HR,GTM,Revenue','All','email,PII,regex,format',
 'platform@example.com',TRUE,187,4.9,'2024-01-01 08:00:00'),

('rt-004','Positive Amount Check',
 'Ensures financial amounts are non-negative. Apply to invoice amounts, salaries, revenue figures.',
 'range_check',
 PARSE_JSON('{"min_value":0}'),
 'Revenue,Finance,HR','Finance,E-commerce','amount,positive,financial',
 'platform@example.com',TRUE,156,4.8,'2024-01-01 08:00:00'),

('rt-005','GL Debit/Credit Balance',
 'Ensures every GL journal entry is balanced: ABS(debit - credit) < 0.01. Critical for SOX compliance.',
 'business_rule_check',
 PARSE_JSON('{"condition":"ABS(debit_amount - credit_amount) < 0.01"}'),
 'Finance','Finance','GL,SOX,balance,debit,credit',
 'platform@example.com',TRUE,67,5.0,'2024-01-01 08:00:00'),

('rt-006','Date Range Validity',
 'Ensures start date is before end date. Apply to subscription, campaign, employee tenure periods.',
 'business_rule_check',
 PARSE_JSON('{"condition":"end_date >= start_date"}'),
 'Revenue,GTM,HR','All','date,range,temporal',
 'platform@example.com',TRUE,112,4.6,'2024-01-01 08:00:00'),

('rt-007','Table Freshness - 24 Hour',
 'Ensures the table has been updated within the last 24 hours. Critical for operational tables.',
 'freshness_check',
 PARSE_JSON('{"max_hours":24}'),
 'Revenue,Operations,HR','All','freshness,SLA,staleness',
 'platform@example.com',TRUE,203,4.7,'2024-01-01 08:00:00'),

('rt-008','Accepted Status Values',
 'Validates that a status column only contains defined values. Prevents uncategorized or invalid statuses.',
 'accepted_values_check',
 PARSE_JSON('{"accepted_values":["ACTIVE","INACTIVE","PENDING"]}'),
 'Revenue,HR,GTM','All','status,enum,accepted_values,domain',
 'platform@example.com',TRUE,134,4.6,'2024-01-01 08:00:00'),

('rt-009','Referential Integrity - Parent Table',
 'Ensures every foreign key value exists in the referenced parent table. Prevents orphan records.',
 'referential_integrity_check',
 PARSE_JSON('{"reference_table":"schema.parent_table","reference_column":"parent_id"}'),
 'All','All','referential,foreign_key,orphan,integrity',
 'platform@example.com',TRUE,89,4.8,'2024-01-01 08:00:00'),

('rt-010','Volume Check - Minimum Row Count',
 'Ensures the table has at least N rows loaded for the current date. Detects empty loads.',
 'volume_check',
 PARSE_JSON('{"min_rows":100,"date_column":"created_at"}'),
 'All','All','volume,row_count,empty_load',
 'platform@example.com',TRUE,78,4.5,'2024-01-01 08:00:00');

-- =============================================================================
-- PART 3: VERIFICATION QUERIES
-- =============================================================================

-- SELECT '=== METADATA TABLE COUNTS ===' AS verification_section;
-- SELECT 'DOMAINS',              COUNT(*) FROM METADATA_SCHEMA.DOMAINS;
-- SELECT 'SUBDOMAINS',           COUNT(*) FROM METADATA_SCHEMA.SUBDOMAINS;
-- SELECT 'DATA_ASSETS',          COUNT(*) FROM METADATA_SCHEMA.DATA_ASSETS;
-- SELECT 'DQ_RULES',             COUNT(*) FROM METADATA_SCHEMA.DQ_RULES;
-- SELECT 'DQ_SCHEDULES',         COUNT(*) FROM METADATA_SCHEMA.DQ_SCHEDULES;
-- SELECT 'DQ_RULE_RUNS',         COUNT(*) FROM RESULTS_SCHEMA.DQ_RULE_RUNS;
-- SELECT 'DQ_QUALITY_SCORES',    COUNT(*) FROM RESULTS_SCHEMA.DQ_QUALITY_SCORES;
-- SELECT 'DQ_ALERTS',            COUNT(*) FROM RESULTS_SCHEMA.DQ_ALERTS;
-- SELECT 'GLOSSARY_TERMS',       COUNT(*) FROM METADATA_SCHEMA.GLOSSARY_TERMS;
-- SELECT 'DATA_CLASSIFICATIONS',COUNT(*) FROM METADATA_SCHEMA.DATA_CLASSIFICATIONS;
-- SELECT 'DATA_PRODUCTS',        COUNT(*) FROM METADATA_SCHEMA.DATA_PRODUCTS;
-- SELECT 'DATA_LINEAGE',         COUNT(*) FROM METADATA_SCHEMA.DATA_LINEAGE;
-- SELECT 'RULE_TEMPLATES',       COUNT(*) FROM METADATA_SCHEMA.RULE_TEMPLATES;
-- SELECT 'COMPLIANCE_MAPPINGS',  COUNT(*) FROM METADATA_SCHEMA.COMPLIANCE_MAPPINGS;

-- SELECT '=== DOMAIN QUALITY SUMMARY ===' AS summary_section;
-- SELECT
--     d.domain_name,
--     COUNT(DISTINCT r.rule_id) AS total_rules,
--     SUM(CASE WHEN rr.status = 'passed' THEN 1 ELSE 0 END) AS rules_passed_today,
--     SUM(CASE WHEN rr.status = 'failed' THEN 1 ELSE 0 END) AS rules_failed_today,
--     ROUND(AVG(rr.quality_score),1) AS avg_quality_score
-- FROM METADATA_SCHEMA.DOMAINS d
-- JOIN METADATA_SCHEMA.DQ_RULES r ON r.domain_id = d.domain_id
-- LEFT JOIN RESULTS_SCHEMA.DQ_RULE_RUNS rr ON rr.rule_id = r.rule_id
--     AND DATE(rr.created_at) = CURRENT_DATE()
-- GROUP BY d.domain_name
-- ORDER BY avg_quality_score ASC;

-- SELECT '=== OPEN ALERTS ===' AS alerts_section;
-- SELECT
--     a.severity,
--     d.domain_name,
--     r.rule_name,
--     a.alert_message,
--     a.created_at
-- FROM RESULTS_SCHEMA.DQ_ALERTS a
-- JOIN METADATA_SCHEMA.DOMAINS d ON d.domain_id = a.domain_id
-- JOIN METADATA_SCHEMA.DQ_RULES r ON r.rule_id = a.rule_id
-- WHERE a.alert_status = 'open'
-- ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END;
