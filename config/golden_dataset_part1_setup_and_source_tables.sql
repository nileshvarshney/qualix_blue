-- =============================================================================
-- DQ PLATFORM GOLDEN DATASET - PART 1: SETUP & SOURCE DATA TABLES
-- =============================================================================
-- Purpose : Create Snowflake source tables with realistic + intentionally dirty
--           data so every DQ rule type can be tested end-to-end.
-- Run on  : Snowflake (any edition)
-- Usage   : Run Part 1 first, then Part 2 (metadata), then Part 3 (advanced).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. DATABASE & SCHEMA SETUP
-- ---------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS DQ_PLATFORM_DB;
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.SOURCE_DATA;    -- monitored tables
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.METADATA_SCHEMA; -- platform rules/assets
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.RESULTS_SCHEMA;  -- run history / scores

USE DATABASE DQ_PLATFORM_DB;
USE SCHEMA SOURCE_DATA;

-- Optional warehouses (comment out if they already exist)
-- CREATE WAREHOUSE IF NOT EXISTS DQ_SMALL_WH     WAREHOUSE_SIZE='XSMALL' AUTO_SUSPEND=60 AUTO_RESUME=TRUE;
-- CREATE WAREHOUSE IF NOT EXISTS DQ_EXECUTION_WH WAREHOUSE_SIZE='SMALL'  AUTO_SUSPEND=60 AUTO_RESUME=TRUE;

-- =============================================================================
-- 1. REVENUE DOMAIN SOURCE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1  CUSTOMERS  (reference table – used by referential integrity checks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.CUSTOMERS (
    customer_id     VARCHAR(36)   NOT NULL,
    customer_name   VARCHAR(200)  NOT NULL,
    email           VARCHAR(200),
    phone           VARCHAR(30),
    country         VARCHAR(50),
    customer_type   VARCHAR(20),   -- ENTERPRISE | SMB | INDIVIDUAL
    is_active       BOOLEAN       DEFAULT TRUE,
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.CUSTOMERS VALUES
('CUST-001','Acme Corporation',       'billing@acme.com',        '+1-415-555-0101','US','ENTERPRISE',TRUE,'2023-01-15 08:00:00'),
('CUST-002','TechStart Inc',          'finance@techstart.io',    '+1-650-555-0102','US','SMB',TRUE,'2023-02-20 09:00:00'),
('CUST-003','Global Logistics Ltd',   'ar@globallogistics.com',  '+44-20-5550-0103','GB','ENTERPRISE',TRUE,'2023-03-10 10:00:00'),
('CUST-004','Sunrise Media Group',    'ap@sunrisemedia.com',     '+1-212-555-0104','US','ENTERPRISE',TRUE,'2023-04-05 11:00:00'),
('CUST-005','DataDriven Analytics',   'hello@datadriven.ai',     '+1-512-555-0105','US','SMB',TRUE,'2023-05-01 12:00:00'),
('CUST-006','Pacific Retail Co',      'payments@pacificretail.com','+1-206-555-0106','US','SMB',TRUE,'2023-06-15 08:30:00'),
('CUST-007','Nordic Healthcare AB',   'finance@nordichc.se',     '+46-8-5550-0107','SE','ENTERPRISE',TRUE,'2023-07-20 09:30:00'),
('CUST-008','FinServ Partners LLP',   'ops@finservpartners.com', '+1-312-555-0108','US','ENTERPRISE',TRUE,'2023-08-10 10:30:00'),
('CUST-009','CloudFirst Technologies','billing@cloudfirst.tech', '+1-408-555-0109','US','SMB',FALSE,'2023-09-05 11:30:00'),
('CUST-010','EduLearn Platform',      'accounts@edulearn.org',   '+1-617-555-0110','US','INDIVIDUAL',TRUE,'2023-10-01 12:30:00');

-- ---------------------------------------------------------------------------
-- 1.2  INVOICES  (main Revenue test table)
--       Intentional DQ issues:
--         * 3 records with NULL invoice_id        → null_check
--         * 2 records with invoice_amount < 0     → range_check
--         * duplicate invoice_id INV-009          → uniqueness_check
--         * status 'REFUNDED' not in allowed list → accepted_values_check
--         * invoice_date > CURRENT_DATE()         → business_rule_check
--         * customer_id 'CUST-999' not in CUSTOMERS → referential_integrity_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.INVOICES (
    invoice_id      VARCHAR(36),
    customer_id     VARCHAR(36),
    invoice_date    DATE,
    due_date        DATE,
    invoice_amount  NUMBER(15,2),
    paid_amount     NUMBER(15,2),
    currency        VARCHAR(3),
    status          VARCHAR(20),   -- PAID | PENDING | FAILED | CANCELLED
    payment_date    DATE,
    line_items_count NUMBER(5),
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.INVOICES VALUES
-- Clean records (status IN allowed list, amounts positive, IDs not null)
('INV-001','CUST-001','2024-01-10','2024-02-10',  12500.00, 12500.00,'USD','PAID',    '2024-01-28',5,'2024-01-10 08:00:00'),
('INV-002','CUST-002','2024-01-15','2024-02-15',   3250.00,  3250.00,'USD','PAID',    '2024-02-01',2,'2024-01-15 09:00:00'),
('INV-003','CUST-003','2024-01-20','2024-02-20',  47800.00,     0.00,'USD','PENDING', NULL,         8,'2024-01-20 10:00:00'),
('INV-004','CUST-004','2024-01-25','2024-02-25',   8900.00,  8900.00,'USD','PAID',    '2024-02-10',3,'2024-01-25 11:00:00'),
('INV-005','CUST-005','2024-02-01','2024-03-01',   1200.00,     0.00,'USD','PENDING', NULL,         1,'2024-02-01 12:00:00'),
('INV-006','CUST-006','2024-02-05','2024-03-05',  22750.00, 22750.00,'USD','PAID',    '2024-02-20',6,'2024-02-05 08:30:00'),
('INV-007','CUST-007','2024-02-10','2024-03-10',  65000.00,     0.00,'GBP','PENDING', NULL,         12,'2024-02-10 09:30:00'),
('INV-008','CUST-008','2024-02-15','2024-03-15',  18300.00, 18300.00,'USD','PAID',    '2024-03-01',4,'2024-02-15 10:30:00'),
-- DUPLICATE invoice_id (INV-009 appears twice) → uniqueness_check FAILS
('INV-009','CUST-009','2024-02-20','2024-03-20',   5500.00,  5500.00,'USD','PAID',    '2024-03-05',2,'2024-02-20 11:30:00'),
('INV-009','CUST-001','2024-02-21','2024-03-21',   6200.00,     0.00,'USD','PENDING', NULL,         3,'2024-02-21 12:30:00'),
-- NEGATIVE amount → range_check FAILS
('INV-010','CUST-010','2024-03-01','2024-04-01',  -450.00,     0.00,'USD','PENDING', NULL,         1,'2024-03-01 08:00:00'),
('INV-011','CUST-001','2024-03-05','2024-04-05',  -1200.00,    0.00,'USD','FAILED',  NULL,         2,'2024-03-05 09:00:00'),
-- INVALID STATUS ('REFUNDED' not in allowed list) → accepted_values_check FAILS
('INV-012','CUST-002','2024-03-10','2024-04-10',   3400.00,  3400.00,'USD','REFUNDED','2024-03-25',1,'2024-03-10 10:00:00'),
-- FUTURE invoice_date → business_rule_check FAILS
('INV-013','CUST-003','2099-12-31','2100-01-31',  99000.00,     0.00,'USD','PENDING', NULL,         1,'2024-03-15 11:00:00'),
-- ORPHAN customer_id (CUST-999 not in CUSTOMERS) → referential_integrity_check FAILS
('INV-014','CUST-999','2024-03-20','2024-04-20',   7800.00,  7800.00,'USD','PAID',    '2024-04-05',3,'2024-03-20 12:00:00'),
-- NULL invoice_id → null_check FAILS
(NULL,      'CUST-004','2024-03-25','2024-04-25',  2100.00,     0.00,'USD','PENDING', NULL,         1,'2024-03-25 08:30:00'),
(NULL,      'CUST-005','2024-03-28','2024-04-28',  5600.00,  5600.00,'USD','PAID',    '2024-04-12',2,'2024-03-28 09:30:00'),
(NULL,      'CUST-006','2024-04-01','2024-05-01',  9100.00,     0.00,'USD','PENDING', NULL,         4,'2024-04-01 10:30:00'),
-- More clean records to keep score realistic (~85-90% pass rate)
('INV-015','CUST-007','2024-04-05','2024-05-05',  34500.00, 34500.00,'GBP','PAID',   '2024-04-20',7,'2024-04-05 11:30:00'),
('INV-016','CUST-008','2024-04-10','2024-05-10',  11200.00, 11200.00,'USD','PAID',   '2024-04-25',3,'2024-04-10 12:30:00'),
('INV-017','CUST-009','2024-04-15','2024-05-15',   4800.00,     0.00,'USD','CANCELLED',NULL,        1,'2024-04-15 08:00:00'),
('INV-018','CUST-010','2024-04-20','2024-05-20',   2250.00,  2250.00,'USD','PAID',   '2024-05-05',2,'2024-04-20 09:00:00'),
('INV-019','CUST-001','2024-04-25','2024-05-25',  78900.00,     0.00,'USD','PENDING', NULL,        15,'2024-04-25 10:00:00'),
('INV-020','CUST-002','2024-04-30','2024-05-30',   6700.00,  6700.00,'USD','PAID',   '2024-05-15',3,'2024-04-30 11:00:00');

-- ---------------------------------------------------------------------------
-- 1.3  SUBSCRIPTIONS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.SUBSCRIPTIONS (
    subscription_id  VARCHAR(36)   NOT NULL,
    customer_id      VARCHAR(36),
    plan_name        VARCHAR(100),
    plan_tier        VARCHAR(20),   -- BASIC | PROFESSIONAL | ENTERPRISE
    status           VARCHAR(20),   -- ACTIVE | PAUSED | CANCELLED | EXPIRED
    mrr              NUMBER(12,2),
    start_date       DATE,
    end_date         DATE,
    renewal_date     DATE,
    seats            NUMBER(5),
    created_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.SUBSCRIPTIONS VALUES
('SUB-001','CUST-001','Enterprise Suite','ENTERPRISE','ACTIVE',  8500.00,'2023-01-01','2025-12-31','2025-01-01',250,'2023-01-01 08:00:00'),
('SUB-002','CUST-002','Pro Plan',        'PROFESSIONAL','ACTIVE', 299.00,'2023-03-01','2025-02-28','2025-03-01',10, '2023-03-01 09:00:00'),
('SUB-003','CUST-003','Enterprise Suite','ENTERPRISE','ACTIVE', 12000.00,'2022-07-01','2025-06-30','2025-07-01',500,'2022-07-01 10:00:00'),
('SUB-004','CUST-004','Pro Plan',        'PROFESSIONAL','PAUSED', 599.00,'2023-06-01','2025-05-31','2025-06-01',25, '2023-06-01 11:00:00'),
-- INVALID status → accepted_values_check fails if we check ACTIVE|PAUSED|CANCELLED|EXPIRED
('SUB-005','CUST-005','Basic Plan',      'BASIC','SUSPENDED',      99.00,'2024-01-01','2025-12-31','2025-01-01',3,  '2024-01-01 12:00:00'),
('SUB-006','CUST-006','Pro Plan',        'PROFESSIONAL','ACTIVE',  399.00,'2023-09-01','2025-08-31','2025-09-01',15, '2023-09-01 08:30:00'),
('SUB-007','CUST-007','Enterprise Suite','ENTERPRISE','CANCELLED',9000.00,'2021-01-01','2024-12-31','2025-01-01',400,'2021-01-01 09:30:00'),
('SUB-008','CUST-008','Enterprise Suite','ENTERPRISE','ACTIVE',  15000.00,'2020-06-01','2026-05-31','2026-06-01',750,'2020-06-01 10:30:00'),
-- end_date BEFORE start_date → semantic_consistency_check fails
('SUB-009','CUST-009','Pro Plan',        'PROFESSIONAL','EXPIRED', 299.00,'2024-12-31','2024-01-01',NULL,         10, '2024-01-15 11:30:00'),
('SUB-010','CUST-010','Basic Plan',      'BASIC','ACTIVE',          49.00,'2024-02-01','2025-01-31','2025-02-01',1,  '2024-02-01 12:30:00');

-- =============================================================================
-- 2. FINANCE DOMAIN SOURCE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1  GL_JOURNAL_ENTRIES
--       DQ issues:
--         * 3 entries where debit ≠ credit → business_rule_check
--         * 2 entries with null journal_entry_id → null_check
--         * 1 entry with zero amount → range_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.GL_JOURNAL_ENTRIES (
    journal_entry_id   VARCHAR(36),
    entry_date         DATE,
    period             VARCHAR(7),    -- YYYY-MM
    account_code       VARCHAR(20),
    account_name       VARCHAR(200),
    debit_amount       NUMBER(15,2),
    credit_amount      NUMBER(15,2),
    description        VARCHAR(500),
    posted_by          VARCHAR(100),
    is_posted          BOOLEAN,
    created_at         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.GL_JOURNAL_ENTRIES VALUES
-- Clean balanced entries
('JE-001','2024-01-31','2024-01','4000','Revenue',              0.00,    100000.00,'Monthly revenue recognition','sarah.chen@example.com',    TRUE, '2024-01-31 17:00:00'),
('JE-002','2024-01-31','2024-01','1200','Accounts Receivable',  100000.00,    0.00,'Monthly revenue recognition','sarah.chen@example.com',    TRUE, '2024-01-31 17:00:00'),
('JE-003','2024-02-28','2024-02','5100','Operating Expenses',   45000.00,     0.00,'Feb operating expenses',     'mike.johnson@example.com',  TRUE, '2024-02-28 17:00:00'),
('JE-004','2024-02-28','2024-02','1000','Cash',                     0.00, 45000.00,'Feb operating expenses',     'mike.johnson@example.com',  TRUE, '2024-02-28 17:00:00'),
('JE-005','2024-03-31','2024-03','4000','Revenue',                  0.00,125000.00,'Mar revenue recognition',    'sarah.chen@example.com',    TRUE, '2024-03-31 17:00:00'),
('JE-006','2024-03-31','2024-03','1200','Accounts Receivable',  125000.00,    0.00,'Mar revenue recognition',    'sarah.chen@example.com',    TRUE, '2024-03-31 17:00:00'),
-- UNBALANCED entries (debit ≠ credit) → business_rule_check FAILS
('JE-007','2024-04-30','2024-04','5200','Payroll Expense',       85000.00,    0.00,'Apr payroll - UNBALANCED',   'mike.johnson@example.com',  TRUE, '2024-04-30 17:00:00'),
('JE-008','2024-04-30','2024-04','2000','Accrued Liabilities',       0.00, 80000.00,'Apr payroll - UNBALANCED',  'mike.johnson@example.com',  TRUE, '2024-04-30 17:00:00'),
('JE-009','2024-04-30','2024-04','5300','Rent Expense',          12000.00,    0.00,'Apr rent - wrong credit',    'lisa.wang@example.com',     TRUE, '2024-04-30 16:00:00'),
('JE-010','2024-04-30','2024-04','1000','Cash',                      0.00, 13500.00,'Apr rent - wrong credit',   'lisa.wang@example.com',     TRUE, '2024-04-30 16:00:00'),
-- ZERO amount → range_check FAILS
('JE-011','2024-05-01','2024-05','9900','Suspense Account',          0.00,     0.00,'Zero entry - investigation','admin@example.com',         FALSE,'2024-05-01 09:00:00'),
-- NULL journal_entry_id → null_check FAILS
(NULL,     '2024-05-05','2024-05','4100','Other Income',             0.00,  5000.00,'Misc income posting',       'sarah.chen@example.com',    FALSE,'2024-05-05 10:00:00'),
(NULL,     '2024-05-05','2024-05','1000','Cash',                  5000.00,     0.00,'Misc income posting',       'sarah.chen@example.com',    FALSE,'2024-05-05 10:00:00'),
-- More clean entries
('JE-012','2024-05-31','2024-05','4000','Revenue',                   0.00,118000.00,'May revenue recognition',   'sarah.chen@example.com',    TRUE, '2024-05-31 17:00:00'),
('JE-013','2024-05-31','2024-05','1200','Accounts Receivable',   118000.00,    0.00,'May revenue recognition',   'sarah.chen@example.com',    TRUE, '2024-05-31 17:00:00');

-- ---------------------------------------------------------------------------
-- 2.2  ACCOUNTS_PAYABLE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.ACCOUNTS_PAYABLE (
    ap_id           VARCHAR(36)   NOT NULL,
    vendor_name     VARCHAR(200)  NOT NULL,
    invoice_ref     VARCHAR(100),
    invoice_date    DATE,
    due_date        DATE,
    amount          NUMBER(15,2),
    currency        VARCHAR(3),
    status          VARCHAR(20),   -- OPEN | PAID | OVERDUE | DISPUTED
    payment_date    DATE,
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.ACCOUNTS_PAYABLE VALUES
('AP-001','Salesforce Inc',      'SF-2024-001','2024-01-05','2024-02-05', 45000.00,'USD','PAID',    '2024-01-30','2024-01-05 08:00:00'),
('AP-002','AWS Cloud Services',  'AWS-JAN-24', '2024-01-10','2024-01-25',  8750.00,'USD','PAID',    '2024-01-24','2024-01-10 09:00:00'),
('AP-003','WeWork Office Space', 'WW-2024-01', '2024-01-01','2024-01-15', 12000.00,'USD','PAID',    '2024-01-14','2024-01-01 10:00:00'),
('AP-004','Google Workspace',    'GWS-JAN-24', '2024-01-15','2024-01-30',  2400.00,'USD','PAID',    '2024-01-29','2024-01-15 11:00:00'),
('AP-005','Legal Counsel LLP',   'LC-2024-Q1', '2024-02-01','2024-03-01', 18500.00,'USD','OVERDUE', NULL,        '2024-02-01 12:00:00'),
('AP-006','Marketing Agency Co', 'MAC-001',    '2024-02-10','2024-03-10', 32000.00,'USD','OPEN',    NULL,        '2024-02-10 08:30:00'),
('AP-007','Snowflake Inc',       'SNF-2024-Q1','2024-02-15','2024-03-15', 67000.00,'USD','PAID',    '2024-03-10','2024-02-15 09:30:00'),
('AP-008','Travel Corp',         'TC-FEB-24',  '2024-02-20','2024-03-05',  5400.00,'USD','PAID',    '2024-03-04','2024-02-20 10:30:00'),
('AP-009','HR Platform Inc',     'HRP-Q1-24',  '2024-03-01','2024-03-31', 14200.00,'USD','OPEN',    NULL,        '2024-03-01 11:30:00'),
('AP-010','Office Supplies Co',  'OSC-MAR-24', '2024-03-10','2024-03-25',   890.00,'USD','PAID',    '2024-03-23','2024-03-10 12:30:00');

-- =============================================================================
-- 3. OPERATIONS DOMAIN SOURCE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1  ORDERS  (master table for referential integrity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.ORDERS (
    order_id        VARCHAR(36)   NOT NULL,
    customer_id     VARCHAR(36),
    order_date      DATE,
    order_status    VARCHAR(20),   -- PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED
    total_amount    NUMBER(12,2),
    warehouse_id    VARCHAR(20),
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.ORDERS VALUES
('ORD-001','CUST-001','2024-01-05','DELIVERED',  25000.00,'WH-WEST', '2024-01-05 08:00:00'),
('ORD-002','CUST-002','2024-01-10','DELIVERED',   4500.00,'WH-EAST', '2024-01-10 09:00:00'),
('ORD-003','CUST-003','2024-01-15','DELIVERED',  87000.00,'WH-WEST', '2024-01-15 10:00:00'),
('ORD-004','CUST-004','2024-01-20','SHIPPED',    12000.00,'WH-CENTRAL','2024-01-20 11:00:00'),
('ORD-005','CUST-005','2024-02-01','PROCESSING',  2300.00,'WH-EAST', '2024-02-01 12:00:00'),
('ORD-006','CUST-006','2024-02-10','DELIVERED',  34000.00,'WH-WEST', '2024-02-10 08:30:00'),
('ORD-007','CUST-007','2024-02-15','SHIPPED',   120000.00,'WH-WEST', '2024-02-15 09:30:00'),
('ORD-008','CUST-008','2024-02-20','DELIVERED',  18500.00,'WH-EAST', '2024-02-20 10:30:00'),
('ORD-009','CUST-009','2024-03-01','PENDING',     6700.00,'WH-CENTRAL','2024-03-01 11:30:00'),
('ORD-010','CUST-010','2024-03-05','DELIVERED',   1200.00,'WH-EAST', '2024-03-05 12:30:00');

-- ---------------------------------------------------------------------------
-- 3.2  SHIPMENTS
--       DQ issues:
--         * 2 records where ship_date < order_date → business_rule_check
--         * 1 record with orphan order_id           → referential_integrity_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.SHIPMENTS (
    shipment_id     VARCHAR(36)   NOT NULL,
    order_id        VARCHAR(36),
    ship_date       DATE,
    delivery_date   DATE,
    carrier         VARCHAR(50),
    tracking_number VARCHAR(100),
    status          VARCHAR(20),   -- IN_TRANSIT | DELIVERED | RETURNED | LOST
    weight_kg       NUMBER(8,2),
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.SHIPMENTS VALUES
-- Clean records
('SHIP-001','ORD-001','2024-01-07','2024-01-10','FedEx', 'FX123456789','DELIVERED',  45.0,'2024-01-07 08:00:00'),
('SHIP-002','ORD-002','2024-01-12','2024-01-15','UPS',   'UP987654321','DELIVERED',   8.5,'2024-01-12 09:00:00'),
('SHIP-003','ORD-003','2024-01-17','2024-01-22','DHL',   'DH456789012','DELIVERED', 230.0,'2024-01-17 10:00:00'),
('SHIP-004','ORD-004','2024-01-22','2024-01-26','FedEx', 'FX234567890','IN_TRANSIT',  32.0,'2024-01-22 11:00:00'),
('SHIP-005','ORD-006','2024-02-12','2024-02-16','UPS',   'UP876543210','DELIVERED',   89.0,'2024-02-12 12:00:00'),
('SHIP-006','ORD-007','2024-02-17','2024-02-22','DHL',   'DH345678901','IN_TRANSIT', 410.0,'2024-02-17 08:30:00'),
('SHIP-007','ORD-008','2024-02-22','2024-02-26','FedEx', 'FX345678901','DELIVERED',   55.0,'2024-02-22 09:30:00'),
-- SHIP DATE BEFORE ORDER DATE → business_rule_check FAILS
('SHIP-008','ORD-009','2024-02-28','2024-03-05','UPS',   'UP765432109','IN_TRANSIT',  18.0,'2024-02-28 10:30:00'),
('SHIP-009','ORD-010','2024-03-02','2024-03-06','FedEx', 'FX456789012','DELIVERED',    3.5,'2024-03-02 11:30:00'),
-- ship_date (2024-01-01) < order_date (2024-03-05) because ORD-010 order_date=2024-03-05
('SHIP-010','ORD-005','2024-01-01','2024-01-05','DHL',   'DH234567890','DELIVERED',   7.2,'2024-01-01 12:30:00'),
-- ORPHAN order_id (ORD-999 not in ORDERS) → referential_integrity_check FAILS
('SHIP-011','ORD-999','2024-03-10','2024-03-14','FedEx', 'FX567890123','DELIVERED',  12.0,'2024-03-10 08:00:00');

-- ---------------------------------------------------------------------------
-- 3.3  INVENTORY
--       DQ issues:
--         * 3 records with quantity_on_hand < 0 → range_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.INVENTORY (
    sku             VARCHAR(50)   NOT NULL,
    product_name    VARCHAR(200),
    warehouse_id    VARCHAR(20),
    quantity_on_hand NUMBER(10),
    reorder_point   NUMBER(10),
    unit_cost       NUMBER(10,2),
    last_updated    TIMESTAMP_NTZ,
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.INVENTORY VALUES
('SKU-001','Enterprise License Pack',  'WH-WEST',   500,  50, 1200.00,'2024-05-10 06:00:00','2023-01-01 08:00:00'),
('SKU-002','Professional License',     'WH-EAST',   250,  25,  450.00,'2024-05-10 06:00:00','2023-01-01 09:00:00'),
('SKU-003','Basic License',            'WH-CENTRAL',1000, 100,  99.00,'2024-05-10 06:00:00','2023-01-01 10:00:00'),
('SKU-004','Support Package - Gold',   'WH-WEST',    75,  10, 2500.00,'2024-05-10 06:00:00','2023-01-01 11:00:00'),
('SKU-005','Support Package - Silver', 'WH-EAST',   120,  15,  900.00,'2024-05-10 06:00:00','2023-01-01 12:00:00'),
-- NEGATIVE QUANTITY → range_check FAILS
('SKU-006','Training Credits - 100hr', 'WH-CENTRAL', -5,  20,  500.00,'2024-05-10 06:00:00','2023-01-01 08:30:00'),
('SKU-007','Implementation Bundle',    'WH-WEST',   -12,   5, 8000.00,'2024-05-10 06:00:00','2023-01-01 09:30:00'),
('SKU-008','Data Migration Add-on',    'WH-EAST',    -3,   2, 3500.00,'2024-05-10 06:00:00','2023-01-01 10:30:00'),
('SKU-009','API Access - Enterprise',  'WH-CENTRAL', 300,  30, 750.00,'2024-05-10 06:00:00','2023-01-01 11:30:00'),
('SKU-010','Custom Integration',       'WH-WEST',    88,   8,15000.00,'2024-05-10 06:00:00','2023-01-01 12:30:00');

-- =============================================================================
-- 4. HR DOMAIN SOURCE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1  EMPLOYEES
--       DQ issues:
--         * 2 records with salary = 0    → range_check
--         * 1 record exit_date < joining_date → semantic_consistency_check
--         * 1 record with NULL employee_id  → null_check
--         * 1 duplicate employee_id         → uniqueness_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.EMPLOYEES (
    employee_id     VARCHAR(36),
    full_name       VARCHAR(200),
    email           VARCHAR(200),
    department      VARCHAR(100),
    job_title       VARCHAR(200),
    salary          NUMBER(12,2),
    employment_type VARCHAR(20),   -- FULL_TIME | PART_TIME | CONTRACTOR
    status          VARCHAR(20),   -- ACTIVE | INACTIVE | ON_LEAVE
    joining_date    DATE,
    exit_date       DATE,
    manager_id      VARCHAR(36),
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.EMPLOYEES VALUES
('EMP-001','Sarah Chen',    'sarah.chen@example.com',    'Finance',     'Finance Manager',          145000.00,'FULL_TIME','ACTIVE',   '2020-03-01',NULL,     NULL,     '2020-03-01 08:00:00'),
('EMP-002','Mike Johnson',  'mike.johnson@example.com',  'Finance',     'Senior Accountant',         98000.00,'FULL_TIME','ACTIVE',   '2021-06-15',NULL,     'EMP-001','2021-06-15 09:00:00'),
('EMP-003','Lisa Wang',     'lisa.wang@example.com',     'Engineering', 'Data Engineer',            125000.00,'FULL_TIME','ACTIVE',   '2019-09-01',NULL,     NULL,     '2019-09-01 10:00:00'),
('EMP-004','James Park',    'james.park@example.com',    'Sales',       'Account Executive',         85000.00,'FULL_TIME','ACTIVE',   '2022-01-10',NULL,     NULL,     '2022-01-10 11:00:00'),
('EMP-005','Emma Davis',    'emma.davis@example.com',    'HR',          'HR Business Partner',      110000.00,'FULL_TIME','ACTIVE',   '2021-03-15',NULL,     NULL,     '2021-03-15 12:00:00'),
('EMP-006','Carlos Rivera', 'carlos.rivera@example.com', 'Marketing',   'Marketing Director',       155000.00,'FULL_TIME','ACTIVE',   '2018-11-01',NULL,     NULL,     '2018-11-01 08:30:00'),
('EMP-007','Priya Patel',   'priya.patel@example.com',   'Engineering', 'Senior Data Engineer',     135000.00,'FULL_TIME','ACTIVE',   '2020-07-01',NULL,     'EMP-003','2020-07-01 09:30:00'),
-- SALARY = 0 → range_check FAILS
('EMP-008','Tom Wilson',    'tom.wilson@example.com',    'Operations',  'Ops Analyst',                  0.00,'CONTRACTOR','ACTIVE',  '2024-01-15',NULL,     'EMP-006','2024-01-15 10:30:00'),
('EMP-009','Nina Brown',    'nina.brown@example.com',    'Sales',       'Sales Development Rep',        0.00,'FULL_TIME','ACTIVE',   '2024-03-01',NULL,     'EMP-004','2024-03-01 11:30:00'),
-- EXIT DATE BEFORE JOINING DATE → semantic_consistency_check FAILS
('EMP-010','Alex Kumar',    'alex.kumar@example.com',    'Engineering', 'Junior Engineer',           72000.00,'FULL_TIME','INACTIVE', '2024-05-01','2024-01-01','EMP-007','2024-01-01 12:30:00'),
-- NULL employee_id → null_check FAILS
(NULL,      'Rachel Green',  'rachel.green@example.com',  'Finance',    'Financial Analyst',         88000.00,'FULL_TIME','ACTIVE',   '2023-08-01',NULL,     'EMP-001','2023-08-01 08:00:00'),
-- DUPLICATE employee_id → uniqueness_check FAILS
('EMP-001','Sarah Chen (dup)','sarah.chen2@example.com', 'Finance',     'Finance Manager',          145000.00,'FULL_TIME','ACTIVE',   '2020-03-01',NULL,     NULL,     '2024-05-01 08:00:00'),
-- More clean records
('EMP-011','Marcus Lee',    'marcus.lee@example.com',    'Sales',       'Enterprise Sales Director', 175000.00,'FULL_TIME','ACTIVE',  '2017-05-01',NULL,     NULL,     '2017-05-01 09:00:00'),
('EMP-012','Sofia Martinez','sofia.martinez@example.com','HR',          'Talent Acquisition Mgr',   105000.00,'FULL_TIME','ACTIVE',  '2022-09-01',NULL,     'EMP-005','2022-09-01 10:00:00');

-- ---------------------------------------------------------------------------
-- 4.2  PAYROLL
--       DQ issues:
--         * Payroll record missing for active employee EMP-008 (salary=0)
--         * 1 record with negative net_pay → range_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.PAYROLL (
    payroll_id      VARCHAR(36)   NOT NULL,
    employee_id     VARCHAR(36),
    pay_period      VARCHAR(7),    -- YYYY-MM
    gross_pay       NUMBER(12,2),
    deductions      NUMBER(12,2),
    net_pay         NUMBER(12,2),
    pay_date        DATE,
    pay_method      VARCHAR(20),   -- DIRECT_DEPOSIT | CHECK
    status          VARCHAR(20),   -- PROCESSED | PENDING | FAILED
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.PAYROLL VALUES
('PAY-001','EMP-001','2024-04',12083.33,2850.00,9233.33,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-002','EMP-002','2024-04', 8166.67,1920.00,6246.67,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-003','EMP-003','2024-04',10416.67,2450.00,7966.67,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-004','EMP-004','2024-04', 7083.33,1665.00,5418.33,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-005','EMP-005','2024-04', 9166.67,2155.00,7011.67,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-006','EMP-006','2024-04',12916.67,3040.00,9876.67,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-007','EMP-007','2024-04',11250.00,2645.00,8605.00,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
-- NEGATIVE net_pay → range_check FAILS
('PAY-008','EMP-009','2024-04',    0.00,  500.00, -500.00,'2024-04-30','DIRECT_DEPOSIT','FAILED',  '2024-04-30 09:00:00'),
('PAY-009','EMP-011','2024-04',14583.33,3430.00,11153.33,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00'),
('PAY-010','EMP-012','2024-04', 8750.00,2058.00, 6692.00,'2024-04-30','DIRECT_DEPOSIT','PROCESSED','2024-04-30 09:00:00');
-- NOTE: EMP-008 has no payroll record (intentional gap for custom_sql_check rule)

-- =============================================================================
-- 5. GTM DOMAIN SOURCE TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1  LEADS
--       DQ issues:
--         * 3 records with invalid email format → regex_check
--         * 2 records with conversion_rate > 100 → range_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.LEADS (
    lead_id          VARCHAR(36)   NOT NULL,
    first_name       VARCHAR(100),
    last_name        VARCHAR(100),
    email            VARCHAR(200),
    company          VARCHAR(200),
    lead_source      VARCHAR(50),   -- WEB | REFERRAL | EVENT | OUTBOUND | PARTNER
    lead_status      VARCHAR(30),   -- NEW | CONTACTED | QUALIFIED | CONVERTED | LOST
    conversion_rate  NUMBER(5,2),   -- 0-100
    lead_score       NUMBER(3),
    campaign_id      VARCHAR(36),
    created_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.LEADS VALUES
('LEAD-001','Alice','Thompson',  'alice.thompson@acme.com',    'Acme Corp',     'WEB',     'QUALIFIED',  65.00,82,'CAMP-001','2024-01-10 08:00:00'),
('LEAD-002','Bob',  'Martinez',  'bob.martinez@techco.io',     'TechCo',        'REFERRAL','CONTACTED',  30.00,45,'CAMP-002','2024-01-15 09:00:00'),
('LEAD-003','Carol','Johnson',   'carol.j@globalcorp.com',     'Global Corp',   'EVENT',   'CONVERTED',  90.00,95,'CAMP-001','2024-01-20 10:00:00'),
('LEAD-004','David','Lee',       'david.lee@startupxyz.com',   'StartupXYZ',    'WEB',     'NEW',         0.00,12,'CAMP-003','2024-01-25 11:00:00'),
('LEAD-005','Eve',  'Williams',  'eve.williams@enterprise.com','Enterprise Co', 'OUTBOUND','QUALIFIED',  55.00,78,'CAMP-002','2024-02-01 12:00:00'),
('LEAD-006','Frank','Brown',     'frank.b@partner.net',        'Partner Inc',   'PARTNER', 'CONTACTED',  25.00,38,'CAMP-001','2024-02-05 08:30:00'),
('LEAD-007','Grace','Davis',     'grace.davis@healthco.com',   'HealthCo',      'EVENT',   'QUALIFIED',  70.00,87,'CAMP-003','2024-02-10 09:30:00'),
('LEAD-008','Henry','Wilson',    'henry.w@retailgroup.com',    'Retail Group',  'WEB',     'CONVERTED',  88.00,93,'CAMP-002','2024-02-15 10:30:00'),
-- INVALID EMAIL FORMAT → regex_check FAILS
('LEAD-009','Irene','Taylor',    'not-a-valid-email',          'Unknown Corp',  'WEB',     'NEW',         0.00, 5,'CAMP-001','2024-02-20 11:30:00'),
('LEAD-010','Jack', 'Anderson',  'jack.anderson@',             'Another Corp',  'REFERRAL','NEW',         0.00, 8,'CAMP-003','2024-02-25 12:30:00'),
('LEAD-011','Karen','Thomas',    'karen@thomas@double.com',    'Double Domain', 'OUTBOUND','NEW',         0.00, 3,'CAMP-002','2024-03-01 08:00:00'),
-- CONVERSION RATE > 100 → range_check FAILS
('LEAD-012','Liam', 'Jackson',   'liam.jackson@bigtec.com',    'BigTec',        'EVENT',   'CONVERTED', 120.00,99,'CAMP-001','2024-03-05 09:00:00'),
('LEAD-013','Mia',  'White',     'mia.white@growthco.com',     'GrowthCo',      'PARTNER', 'QUALIFIED', 150.00,97,'CAMP-003','2024-03-10 10:00:00'),
-- More clean records
('LEAD-014','Noah', 'Harris',    'noah.harris@cloudco.com',    'CloudCo',       'WEB',     'QUALIFIED',  45.00,65,'CAMP-002','2024-03-15 11:00:00'),
('LEAD-015','Olivia','Martin',   'o.martin@platform.io',       'Platform IO',   'REFERRAL','CONTACTED',  20.00,32,'CAMP-001','2024-03-20 12:00:00');

-- ---------------------------------------------------------------------------
-- 5.2  CAMPAIGNS
--       DQ issues:
--         * 1 record where end_date < start_date → semantic_consistency_check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE SOURCE_DATA.CAMPAIGNS (
    campaign_id     VARCHAR(36)   NOT NULL,
    campaign_name   VARCHAR(200),
    campaign_type   VARCHAR(30),   -- EMAIL | DIGITAL | EVENT | OUTBOUND | CONTENT
    status          VARCHAR(20),   -- DRAFT | ACTIVE | PAUSED | COMPLETED
    start_date      DATE,
    end_date        DATE,
    budget          NUMBER(12,2),
    spend           NUMBER(12,2),
    impressions     NUMBER(12),
    clicks          NUMBER(10),
    conversions     NUMBER(8),
    owner_email     VARCHAR(200),
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.CAMPAIGNS VALUES
('CAMP-001','Q1 Enterprise Outreach','EMAIL',   'COMPLETED','2024-01-01','2024-03-31',50000.00,47800.00, 125000,8500,340,'carlos.rivera@example.com','2024-01-01 08:00:00'),
('CAMP-002','Spring Product Launch', 'DIGITAL', 'COMPLETED','2024-02-15','2024-04-15',75000.00,72300.00, 890000,45000,1200,'carlos.rivera@example.com','2024-02-01 09:00:00'),
('CAMP-003','Dreamforce 2024',       'EVENT',   'COMPLETED','2024-03-10','2024-03-12',30000.00,29500.00,  5000, 5000, 280,'carlos.rivera@example.com','2024-01-15 10:00:00'),
('CAMP-004','Q2 SMB Push',           'OUTBOUND','ACTIVE',   '2024-04-01','2024-06-30',40000.00,18200.00,     0,   0,  95,'carlos.rivera@example.com','2024-03-25 11:00:00'),
('CAMP-005','Thought Leadership Blog','CONTENT', 'ACTIVE',   '2024-01-01','2024-12-31',15000.00, 7800.00,320000,28000, 450,'carlos.rivera@example.com','2024-01-01 12:00:00'),
-- END DATE BEFORE START DATE → semantic_consistency_check FAILS
('CAMP-006','Misconfigured Campaign','EMAIL',   'DRAFT',    '2024-06-01','2024-03-01',10000.00,     0.00,     0,   0,   0,'carlos.rivera@example.com','2024-05-01 08:30:00');

-- =============================================================================
-- 6. PLANNING DOMAIN SOURCE TABLES
-- =============================================================================

CREATE OR REPLACE TABLE SOURCE_DATA.FORECAST_PLANNING (
    forecast_id      VARCHAR(36)   NOT NULL,
    forecast_period  VARCHAR(7),   -- YYYY-MM  (NULL here triggers null_check)
    forecast_version VARCHAR(20),
    domain_area      VARCHAR(50),
    forecast_value   NUMBER(15,2),
    actual_value     NUMBER(15,2),
    variance_pct     NUMBER(8,2),
    forecast_type    VARCHAR(30),  -- DEMAND | REVENUE | HEADCOUNT | CAPACITY
    is_approved      BOOLEAN,
    created_by       VARCHAR(100),
    created_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.FORECAST_PLANNING VALUES
('FC-001','2024-01','v1.0','Revenue',  1200000.00,1187500.00, -1.04,'REVENUE',  TRUE, 'planning_team@example.com','2024-01-01 08:00:00'),
('FC-002','2024-02','v1.0','Revenue',  1250000.00,1298000.00,  3.84,'REVENUE',  TRUE, 'planning_team@example.com','2024-02-01 08:00:00'),
('FC-003','2024-03','v1.0','Revenue',  1300000.00,1278000.00, -1.69,'REVENUE',  TRUE, 'planning_team@example.com','2024-03-01 08:00:00'),
('FC-004','2024-04','v1.0','Headcount',     250.00,     248.00, -0.80,'HEADCOUNT',TRUE,'planning_team@example.com','2024-04-01 08:00:00'),
('FC-005','2024-05','v1.1','Revenue',  1380000.00,       NULL, NULL,'REVENUE',  FALSE,'planning_team@example.com','2024-05-01 08:00:00'),
-- NULL forecast_period → null_check FAILS
('FC-006',NULL,     'v1.0','Revenue',   900000.00,       NULL, NULL,'REVENUE',  FALSE,'planning_team@example.com','2024-05-10 08:00:00'),
('FC-007',NULL,     'v1.0','Demand',   5000.00,          NULL, NULL,'DEMAND',   FALSE,'planning_team@example.com','2024-05-10 09:00:00'),
-- FORECAST VALUE outside expected range → range_check FAILS (if range is 0-10M)
('FC-008','2024-Q3','v2.0','Revenue', 99999999.00,       NULL, NULL,'REVENUE',  FALSE,'planning_team@example.com','2024-05-12 10:00:00'),
('FC-009','2024-06','v1.0','Capacity',      500.00,     NULL, NULL,'CAPACITY',  FALSE,'planning_team@example.com','2024-05-15 08:00:00'),
('FC-010','2024-07','v1.0','Revenue',  1450000.00,       NULL, NULL,'REVENUE',  FALSE,'planning_team@example.com','2024-05-15 09:00:00');

-- =============================================================================
-- 7. FRESHNESS TEST TABLE (for freshness_check rule demo)
-- =============================================================================
CREATE OR REPLACE TABLE SOURCE_DATA.DATA_FRESHNESS_TEST (
    record_id    NUMBER AUTOINCREMENT,
    event_type   VARCHAR(50),
    updated_at   TIMESTAMP_NTZ,
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Recent data (freshness OK)
INSERT INTO SOURCE_DATA.DATA_FRESHNESS_TEST (event_type, updated_at) VALUES
('REVENUE_SYNC',    DATEADD('hour',-2,CURRENT_TIMESTAMP())),
('INVENTORY_SYNC',  DATEADD('hour',-1,CURRENT_TIMESTAMP())),
('HR_SYNC',         DATEADD('hour',-3,CURRENT_TIMESTAMP()));

-- OLD data table to simulate SLA breach
CREATE OR REPLACE TABLE SOURCE_DATA.STALE_DATA_TABLE (
    record_id    NUMBER AUTOINCREMENT,
    event_type   VARCHAR(50),
    updated_at   TIMESTAMP_NTZ,
    created_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO SOURCE_DATA.STALE_DATA_TABLE (event_type, updated_at) VALUES
('DAILY_BATCH',  DATEADD('hour',-30, CURRENT_TIMESTAMP())),  -- 30 hrs stale → fails 24hr SLA
('FINANCE_SYNC', DATEADD('hour',-50, CURRENT_TIMESTAMP())),  -- 50 hrs stale
('GL_EXPORT',    DATEADD('hour',-26, CURRENT_TIMESTAMP()));   -- 26 hrs stale

-- =============================================================================
-- 8. VERIFICATION QUERIES (run these to confirm data loaded correctly)
-- =============================================================================

-- SELECT '=== ROW COUNTS ===' AS check_section;
-- SELECT 'CUSTOMERS',        COUNT(*) FROM SOURCE_DATA.CUSTOMERS;
-- SELECT 'INVOICES',         COUNT(*) FROM SOURCE_DATA.INVOICES;
-- SELECT 'SUBSCRIPTIONS',    COUNT(*) FROM SOURCE_DATA.SUBSCRIPTIONS;
-- SELECT 'GL_JOURNAL_ENTRIES',COUNT(*) FROM SOURCE_DATA.GL_JOURNAL_ENTRIES;
-- SELECT 'ACCOUNTS_PAYABLE', COUNT(*) FROM SOURCE_DATA.ACCOUNTS_PAYABLE;
-- SELECT 'ORDERS',           COUNT(*) FROM SOURCE_DATA.ORDERS;
-- SELECT 'SHIPMENTS',        COUNT(*) FROM SOURCE_DATA.SHIPMENTS;
-- SELECT 'INVENTORY',        COUNT(*) FROM SOURCE_DATA.INVENTORY;
-- SELECT 'EMPLOYEES',        COUNT(*) FROM SOURCE_DATA.EMPLOYEES;
-- SELECT 'PAYROLL',          COUNT(*) FROM SOURCE_DATA.PAYROLL;
-- SELECT 'LEADS',            COUNT(*) FROM SOURCE_DATA.LEADS;
-- SELECT 'CAMPAIGNS',        COUNT(*) FROM SOURCE_DATA.CAMPAIGNS;
-- SELECT 'FORECAST_PLANNING',COUNT(*) FROM SOURCE_DATA.FORECAST_PLANNING;

-- SELECT '=== DQ ISSUES PREVIEW ===' AS check_section;
-- SELECT 'Null invoice_ids',   COUNT(*) FROM SOURCE_DATA.INVOICES         WHERE invoice_id IS NULL;
-- SELECT 'Negative amounts',   COUNT(*) FROM SOURCE_DATA.INVOICES         WHERE invoice_amount < 0;
-- SELECT 'Duplicate inv IDs',  COUNT(*) FROM SOURCE_DATA.INVOICES         GROUP BY invoice_id HAVING COUNT(*)>1;
-- SELECT 'Invalid status',     COUNT(*) FROM SOURCE_DATA.INVOICES         WHERE status NOT IN ('PAID','PENDING','FAILED','CANCELLED');
-- SELECT 'Negative inventory', COUNT(*) FROM SOURCE_DATA.INVENTORY        WHERE quantity_on_hand < 0;
-- SELECT 'Unbalanced GL',      COUNT(*) FROM SOURCE_DATA.GL_JOURNAL_ENTRIES WHERE ABS(debit_amount - credit_amount) > 0.01;
-- SELECT 'Invalid emails',     COUNT(*) FROM SOURCE_DATA.LEADS            WHERE NOT REGEXP_LIKE(email,'^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$');
-- SELECT 'Bad salary',         COUNT(*) FROM SOURCE_DATA.EMPLOYEES        WHERE salary <= 0;
-- SELECT 'Bad exit date',      COUNT(*) FROM SOURCE_DATA.EMPLOYEES        WHERE exit_date IS NOT NULL AND exit_date < joining_date;
-- SELECT 'Orphan shipments',   COUNT(*) FROM SOURCE_DATA.SHIPMENTS s LEFT JOIN SOURCE_DATA.ORDERS o ON s.order_id=o.order_id WHERE o.order_id IS NULL;
