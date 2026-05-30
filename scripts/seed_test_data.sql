-- ============================================================
-- Test Data: Business Glossary, Data Products, Data Contracts
-- Run in Snowflake against DQ_PLATFORM_DB.DQ_APP
-- Safe to re-run (uses INSERT INTO ... SELECT WHERE NOT EXISTS)
-- ============================================================

USE DATABASE DQ_PLATFORM_DB;
USE SCHEMA DQ_APP;


-- ============================================================
-- 1. BUSINESS GLOSSARY TERMS
-- ============================================================

-- Revenue Domain Terms
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Annual Recurring Revenue (ARR)',
    'The annualized value of all active subscription contracts. Calculated as MRR × 12. Excludes one-time fees, professional services, and usage-based charges that are non-recurring.',
    'A customer paying $5,000/month contributes $60,000 ARR. New logo ARR, expansion ARR, and churned ARR are tracked separately.',
    'ARR, Annualized Revenue, Subscription Revenue',
    d.domain_id,
    'revenue@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Annual Recurring Revenue (ARR)');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Monthly Recurring Revenue (MRR)',
    'The predictable revenue generated from active subscriptions in a single calendar month. Includes new business, expansion, and contraction; excludes churn. Foundation metric for ARR.',
    'New MRR: $50K from new logos. Expansion MRR: $20K from upsells. Churned MRR: -$10K. Net New MRR = $60K.',
    'MRR, Monthly Subscription Revenue',
    d.domain_id,
    'revenue@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Monthly Recurring Revenue (MRR)');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Customer Churn Rate',
    'The percentage of customers who cancel or do not renew their subscriptions in a given period. Calculated as: (Customers Lost / Customers at Start of Period) × 100.',
    'If 10 out of 200 customers cancel in a month, the monthly churn rate is 5%. Logo churn and revenue churn are tracked independently.',
    'Churn, Attrition Rate, Logo Churn, Customer Attrition',
    d.domain_id,
    'revenue@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Customer Churn Rate');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Customer Lifetime Value (CLV)',
    'The total revenue a business can reasonably expect from a single customer account over the entire duration of the relationship. Calculated as: Average Purchase Value × Purchase Frequency × Customer Lifespan.',
    'A customer paying $1,000/month with an average 3-year lifespan has a CLV of $36,000.',
    'CLV, LTV, Lifetime Value, Customer LTV',
    d.domain_id,
    'revenue@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Customer Lifetime Value (CLV)');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Net Revenue Retention (NRR)',
    'Measures revenue retained from existing customers including expansion revenue (upsells, cross-sells) minus contraction and churn. NRR > 100% means existing customers grow faster than they churn.',
    'Starting ARR of $1M from cohort. End ARR from same cohort = $1.1M (after expansions and churn). NRR = 110%.',
    'NRR, Net Dollar Retention, NDR, Net Revenue Retention Rate',
    d.domain_id,
    'revenue@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Net Revenue Retention (NRR)');

-- Finance Domain Terms
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'EBITDA',
    'Earnings Before Interest, Taxes, Depreciation, and Amortization. A proxy for operating cash flow and business profitability, commonly used to compare companies independently of financing and accounting decisions.',
    'Revenue $10M, COGS $4M, Operating Expenses $3M → EBIT $3M. Add back depreciation $0.5M → EBITDA $3.5M.',
    'EBITDA, Operating Earnings, Adjusted EBITDA',
    d.domain_id,
    'finance@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Finance'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'EBITDA');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Gross Margin',
    'The percentage of revenue remaining after deducting the cost of goods sold (COGS). Calculated as: (Revenue − COGS) / Revenue × 100. Indicates how efficiently a company produces its goods or services.',
    'Revenue $1M, COGS $400K → Gross Profit $600K → Gross Margin 60%.',
    'Gross Margin %, Gross Profit Margin, GM%',
    d.domain_id,
    'finance@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Finance'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Gross Margin');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Days Sales Outstanding (DSO)',
    'The average number of days it takes to collect payment after a sale. Lower DSO indicates faster collections and better cash flow. Calculated as: (Accounts Receivable / Total Credit Revenue) × Number of Days.',
    'AR balance $500K, monthly revenue $1M → DSO = (500K / 1M) × 30 = 15 days.',
    'DSO, Days Receivable, Receivable Days, Collection Period',
    d.domain_id,
    'finance@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Finance'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Days Sales Outstanding (DSO)');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Accounts Receivable Aging',
    'A report that categorizes outstanding invoices by the length of time they have been unpaid. Buckets: Current (0–30 days), 31–60 days, 61–90 days, 90+ days. Used to identify collection risk.',
    'AR Aging shows $200K current, $50K 31-60 days, $20K 61-90 days, $5K 90+ days.',
    'AR Aging, Receivables Aging, Aging Report',
    d.domain_id,
    'finance@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Finance'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Accounts Receivable Aging');

-- Operations Domain Terms
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Inventory Turnover',
    'The number of times inventory is sold or used in a given time period. Calculated as: COGS / Average Inventory. Higher turnover indicates efficient inventory management.',
    'Annual COGS $2.4M, Average Inventory $400K → Inventory Turnover = 6 (sold and replaced every 2 months).',
    'Inventory Turns, Stock Turnover, Inventory Rotation',
    d.domain_id,
    'ops@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Operations'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Inventory Turnover');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Order Fill Rate',
    'The percentage of customer orders fulfilled completely from available stock without any backorders or stockouts. Calculated as: (Orders Shipped Complete / Total Orders) × 100.',
    '980 out of 1,000 orders shipped complete → Fill Rate = 98%.',
    'Fill Rate, Order Completion Rate, Service Level',
    d.domain_id,
    'ops@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Operations'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Order Fill Rate');

-- GTM Domain Terms
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Customer Acquisition Cost (CAC)',
    'The total cost of acquiring a new customer, including all sales and marketing expenses. Calculated as: Total Sales & Marketing Spend / Number of New Customers Acquired.',
    'Marketing spend $100K + Sales spend $150K = $250K total. 50 new customers. CAC = $5,000.',
    'CAC, Cost to Acquire, Acquisition Cost',
    d.domain_id,
    'gtm@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'GTM'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Customer Acquisition Cost (CAC)');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Lead Conversion Rate',
    'The percentage of leads that convert to the next stage in the sales funnel. Tracked at each stage: MQL→SQL, SQL→Opportunity, Opportunity→Closed Won.',
    '1,000 MQLs → 200 SQLs → 20% MQL-to-SQL conversion. 200 SQLs → 40 opportunities → 20% SQL-to-Opportunity conversion.',
    'Conversion Rate, Win Rate, Lead-to-Close Rate',
    d.domain_id,
    'gtm@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'GTM'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Lead Conversion Rate');

-- HR Domain Terms
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Employee Attrition Rate',
    'The rate at which employees leave an organization over a given period, either voluntarily or involuntarily. Calculated as: (Employees Left / Average Headcount) × 100.',
    'If 20 employees left during a quarter with an average headcount of 400, the quarterly attrition rate is 5% (20% annualized).',
    'Attrition Rate, Turnover Rate, Employee Churn, Staff Attrition',
    d.domain_id,
    'hr@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'HR'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Employee Attrition Rate');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Time to Fill',
    'The number of days from when a job requisition is opened to the date an offer is accepted. A key recruiting efficiency metric. Industry benchmark is typically 30–45 days.',
    'Req opened Jan 1, offer accepted Jan 28 → Time to Fill = 28 days.',
    'TTF, Days to Fill, Recruiting Cycle Time, Hiring Lead Time',
    d.domain_id,
    'hr@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'HR'
  AND NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Time to Fill');

-- Platform-wide / cross-domain Terms (no domain_id)
INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Data Quality Score',
    'A composite 0–100 score measuring the quality of a dataset based on rule pass rates. Calculated as: (Passing Rule Executions / Total Rule Executions) × 100. Scores below 80 trigger alerts.',
    'Table with 10 rules: 9 pass, 1 fail → Quality Score = 90%. Dashboard shows trend over 14 days.',
    'DQ Score, Quality Index, Data Health Score',
    NULL,
    'platform@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Data Quality Score');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Data Freshness',
    'A measure of how recently data was updated relative to its expected refresh cadence. A table is "stale" if its last updated timestamp exceeds the defined SLA window.',
    'A daily-refresh table is stale if no rows were inserted in the last 25 hours. Freshness SLA is configured per table.',
    'Data Staleness, Data Recency, Freshness SLA',
    NULL,
    'platform@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Data Freshness');

INSERT INTO glossary_terms (term_id, term_name, definition, examples, synonyms, domain_id, owner_email, status, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Golden Record',
    'The single, authoritative, trusted version of a business entity (customer, product, account) that has been de-duplicated, standardized, and validated across all source systems.',
    'The golden customer record merges CRM, billing, and support data into one canonical profile with a master customer_id.',
    'Master Record, Single Source of Truth, Canonical Record, MDM Record',
    NULL,
    'platform@example.com',
    'active',
    'system',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
WHERE NOT EXISTS (SELECT 1 FROM glossary_terms WHERE term_name = 'Golden Record');


-- ============================================================
-- 2. DATA PRODUCTS
-- ============================================================

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Revenue Analytics Hub',
    'Unified revenue intelligence product combining ARR, MRR, churn, and expansion metrics from billing and CRM systems. The authoritative source for board-level revenue reporting and investor metrics.',
    d.domain_id,
    'revenue@example.com',
    'published',
    '2.1',
    'revenue,arr,mrr,churn,subscriptions,finance',
    '# Revenue Analytics Hub

## Overview
This data product is the single source of truth for all subscription revenue metrics.

## Included Datasets
- `BILLING.SUBSCRIPTIONS` — active subscription contracts
- `BILLING.INVOICES` — invoice and payment records
- `CRM.ACCOUNTS` — customer account master

## Key Metrics
| Metric | Definition | Refresh |
|--------|-----------|---------|
| ARR | Annualized recurring revenue | Daily |
| MRR | Monthly recurring revenue | Daily |
| Net Churn | Revenue lost from cancellations | Daily |
| NRR | Net revenue retention rate | Weekly |

## SLAs
- Data freshness: updated by 08:00 UTC daily
- Quality score target: ≥ 95%
- Incident response: < 2 hours

## Contacts
- Owner: Revenue Analytics Team (revenue@example.com)
- On-call: #revenue-data-alerts Slack channel',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'Revenue Analytics Hub');

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Customer 360',
    'Unified customer profile consolidating identity, account history, product usage, support interactions, and financial data. Powers personalization, customer success, and churn prediction models.',
    d.domain_id,
    'revenue@example.com',
    'published',
    '1.4',
    'customer,crm,identity,mdm,churn,product-usage',
    '# Customer 360

## Overview
Single unified view of every customer account, built from six source systems.

## Data Sources
- CRM (Salesforce) — account hierarchy and contacts
- Billing (Stripe) — subscription and payment history
- Product (Mixpanel) — feature adoption and usage events
- Support (Zendesk) — ticket history and CSAT scores
- Marketing (HubSpot) — campaign and lead attribution

## Update Cadence
- Core profile: daily batch at 06:00 UTC
- Usage signals: near-real-time (< 15 min lag)

## Quality Gates
- No duplicate customer_id (uniqueness check)
- Email format validation (regex check)
- Account owner populated (null check)
- Quality score target: ≥ 98%

## Consumers
Revenue Ops, Customer Success, Finance, Data Science',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Revenue'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'Customer 360');

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Financial Reporting Suite',
    'Curated financial datasets for GL, P&L, balance sheet, and cash flow reporting. SOX-compliant with full audit trail. Consumed by FP&A, external auditors, and the board reporting package.',
    d.domain_id,
    'finance@example.com',
    'published',
    '3.0',
    'finance,gl,sox,reporting,audit,compliance',
    '# Financial Reporting Suite

## Overview
SOX-compliant financial data product covering all statutory and management reporting.

## Datasets
- `FINANCE.GENERAL_LEDGER` — chart of accounts and journal entries
- `FINANCE.TRIAL_BALANCE` — period-end trial balance
- `FINANCE.BUDGET_ACTUALS` — budget vs actuals by cost center

## Compliance
- SOX 302 / 404 certified
- GDPR: no personal data
- Retention: 7 years per SOX 802

## Quality Requirements
- All journal entries balanced (business rule check)
- No null amounts on posted entries
- Period close within 3 business days of month end

## Access
Restricted to: Finance, Exec, Auditors',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Finance'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'Financial Reporting Suite');

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Supply Chain Intelligence',
    'End-to-end supply chain visibility product combining inventory positions, supplier data, fulfillment status, and demand forecasts. Drives reorder decisions and logistics optimization.',
    d.domain_id,
    'ops@example.com',
    'published',
    '1.2',
    'supply-chain,inventory,fulfillment,logistics,forecasting,operations',
    '# Supply Chain Intelligence

## Overview
Operational data product providing real-time and historical supply chain data.

## Included Tables
- `OPS.INVENTORY_POSITIONS` — current stock levels by SKU and location
- `OPS.PURCHASE_ORDERS` — open and closed POs with supplier details
- `OPS.SHIPMENTS` — outbound shipment tracking and delivery status
- `OPS.DEMAND_FORECAST` — 13-week rolling demand plan

## Key KPIs
- Inventory Turnover
- Order Fill Rate
- On-Time-In-Full (OTIF) delivery rate
- Days of Supply (DOS)

## Refresh Schedule
- Inventory positions: every 4 hours
- Shipment status: every 30 minutes
- Demand forecast: weekly on Sunday 22:00 UTC',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'Operations'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'Supply Chain Intelligence');

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'Marketing Attribution',
    'Multi-touch attribution data product mapping marketing spend to pipeline and closed revenue. Covers paid search, social, email, events, and organic channels. Used for budget allocation decisions.',
    d.domain_id,
    'gtm@example.com',
    'draft',
    '0.9',
    'marketing,attribution,pipeline,campaigns,gtm,leads',
    '# Marketing Attribution (Beta)

## Status: Draft — not yet certified for board reporting

## Overview
This product implements a data-driven multi-touch attribution model across all GTM channels.

## Data Sources
- HubSpot: contact and campaign data
- Salesforce: opportunity and closed-won data
- Google Ads / LinkedIn Ads: spend and click data
- Marketo: email engagement

## Attribution Models Supported
1. Last Touch
2. First Touch
3. Linear (equal weight)
4. Time Decay (customizable half-life)

## Known Limitations
- LinkedIn Ads integration: 3-day data delay
- Offline events (tradeshows) require manual upload

## ETA for v1.0: Q3 2026',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'GTM'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'Marketing Attribution');

INSERT INTO data_products (product_id, product_name, description, domain_id, owner_email, status, version, tags, readme, created_by, created_at, updated_at)
SELECT
    UUID_STRING(),
    'People Analytics',
    'HR data product covering headcount, attrition, compensation benchmarking, hiring funnel, and engagement scores. Restricted to People team and Finance. GDPR-compliant with PII access controls.',
    d.domain_id,
    'hr@example.com',
    'published',
    '1.0',
    'hr,headcount,attrition,hiring,compensation,gdpr,pii',
    '# People Analytics

## Overview
Aggregated and anonymized people data for workforce planning and HR reporting.

## PII Classification
This product contains personal data under GDPR. Access is restricted and audited.
- Identifiable fields (name, email, salary): role-gated
- Aggregated metrics (department headcount, avg compensation): broader access

## Datasets
- `HR.EMPLOYEES` — current active employees
- `HR.ATTRITION_EVENTS` — historical departures with exit reason
- `HR.OPEN_REQUISITIONS` — active job openings and hiring stage
- `HR.COMPENSATION_BANDS` — salary bands by level and geo

## Refresh: Daily at 01:00 UTC
## Retention: 7 years per SOX / local labor law',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM domains d
WHERE d.domain_name = 'HR'
  AND NOT EXISTS (SELECT 1 FROM data_products WHERE product_name = 'People Analytics');


-- ============================================================
-- 3. DATA CONTRACTS
-- Linked to actual data_assets via subquery on sf_table_name.
-- Each INSERT is conditional on the asset existing.
-- ============================================================

-- Contract 1: Subscriptions table (Revenue/Billing)
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Subscriptions Table — Revenue Analytics SLA',
    '2.0',
    'Billing Engineering',
    'Revenue Analytics, FP&A, Customer Success',
    'active',
    95.0,
    2.0,
    25,
    'Subscriptions data must be updated by 07:00 UTC daily. Quality score must stay at or above 95%. Null rate for subscription_id, customer_id, and amount must not exceed 2%. Any schema change requires 30-day advance notice.',
    'alert',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE a.sf_table_name ILIKE '%SUBSCRIPTION%'
  AND NOT EXISTS (
      SELECT 1 FROM data_contracts dc
      JOIN data_assets a2 ON dc.asset_id = a2.asset_id
      WHERE a2.sf_table_name ILIKE '%SUBSCRIPTION%'
        AND dc.contract_name = 'Subscriptions Table — Revenue Analytics SLA'
  )
LIMIT 1;

-- Contract 2: Orders / Invoices table (Revenue/Billing)
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Invoice Data — Finance Reporting Contract',
    '1.2',
    'Billing Engineering',
    'Finance, External Audit, Tax',
    'active',
    99.0,
    0.5,
    2,
    'Invoice records must be available within 2 hours of creation. Quality score must remain ≥ 99% at all times. Zero tolerance for null invoice_id or amount. Critical for SOX 302 certification.',
    'page_oncall',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE a.sf_table_name ILIKE '%INVOICE%' OR a.sf_table_name ILIKE '%ORDER%'
  AND NOT EXISTS (
      SELECT 1 FROM data_contracts dc
      WHERE dc.contract_name = 'Invoice Data — Finance Reporting Contract'
  )
LIMIT 1;

-- Contract 3: Customers / Accounts table
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Customer Master — CRM to Warehouse Contract',
    '1.0',
    'CRM Engineering (Salesforce)',
    'Revenue Ops, Customer Success, Data Science',
    'active',
    97.0,
    1.0,
    24,
    'Customer records must sync from CRM within 24 hours. Duplicate customer_id is a critical violation. Email field must be RFC-5322 compliant. Account owner must be populated for all active accounts.',
    'alert',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE a.sf_table_name ILIKE '%CUSTOMER%' OR a.sf_table_name ILIKE '%ACCOUNT%'
  AND NOT EXISTS (
      SELECT 1 FROM data_contracts dc
      WHERE dc.contract_name = 'Customer Master — CRM to Warehouse Contract'
  )
LIMIT 1;

-- Contract 4: Employees table (HR)
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Employee Master — HR to Finance Contract',
    '1.1',
    'HRIS Engineering (Workday)',
    'Finance, Payroll, People Analytics',
    'active',
    99.5,
    0.0,
    26,
    'Employee data must sync daily from HRIS by 02:00 UTC. Null tolerance is zero for employee_id, department_code, and employment_status. PII fields must be encrypted at rest. Compliant with GDPR Article 32.',
    'page_oncall',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE a.sf_table_name ILIKE '%EMPLOYEE%'
  AND NOT EXISTS (
      SELECT 1 FROM data_contracts dc
      WHERE dc.contract_name = 'Employee Master — HR to Finance Contract'
  )
LIMIT 1;

-- Contract 5: Inventory / Products table (Operations)
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Inventory Positions — Supply Chain Contract',
    '1.0',
    'WMS Engineering',
    'Supply Chain, Procurement, Finance',
    'active',
    95.0,
    3.0,
    4,
    'Inventory position data must refresh every 4 hours from WMS. On-hand quantity must never be negative. SKU code must match the product master. Staleness beyond 4 hours triggers a P2 incident.',
    'alert',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE a.sf_table_name ILIKE '%INVENTORY%' OR a.sf_table_name ILIKE '%PRODUCT%' OR a.sf_table_name ILIKE '%STOCK%'
  AND NOT EXISTS (
      SELECT 1 FROM data_contracts dc
      WHERE dc.contract_name = 'Inventory Positions — Supply Chain Contract'
  )
LIMIT 1;

-- Contract 6: Fallback — if no matching assets exist above, create a contract
-- on whatever the first registered asset is, so the page is never empty.
INSERT INTO data_contracts (
    contract_id, asset_id, contract_name, version,
    producer_team, consumer_team, status,
    min_quality_score, max_null_pct, max_staleness_hours,
    sla_description, breach_action,
    effective_from, effective_until,
    created_by, created_at, updated_at
)
SELECT
    UUID_STRING(),
    a.asset_id,
    'Platform Data Quality Baseline Contract',
    '1.0',
    'Data Platform Team',
    'All Consumers',
    'active',
    90.0,
    5.0,
    48,
    'All platform-registered tables must maintain a minimum quality score of 90%. Data must not be stale beyond 48 hours. This is the baseline contract applied to all datasets lacking a specific SLA.',
    'alert',
    '2025-01-01',
    '2025-12-31',
    'admin@example.com',
    CURRENT_TIMESTAMP(),
    CURRENT_TIMESTAMP()
FROM data_assets a
WHERE NOT EXISTS (SELECT 1 FROM data_contracts)
LIMIT 1;


-- ============================================================
-- Verify row counts
-- ============================================================
SELECT 'glossary_terms'  AS tbl, COUNT(*) AS rows FROM glossary_terms
UNION ALL
SELECT 'data_products',           COUNT(*) FROM data_products
UNION ALL
SELECT 'data_product_assets',     COUNT(*) FROM data_product_assets
UNION ALL
SELECT 'data_contracts',          COUNT(*) FROM data_contracts
ORDER BY tbl;
