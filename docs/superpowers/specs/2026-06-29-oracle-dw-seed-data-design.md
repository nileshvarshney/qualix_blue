# Oracle Data Warehouse Seed Data Design

**Date:** 2026-06-29  
**Status:** Approved

## Overview

Add two Oracle ERP connections — Finance/ERP and Manufacturing — to the demo seed data in `scripts/seed_all.py`. This extends the existing 4-connection demo (Snowflake, BigQuery, PostgreSQL, Redshift) to 6 connections, covering Finance and Manufacturing domains that Oracle dominates in enterprise environments.

## Approach

Extend the existing dictionary-based pattern in `scripts/seed_all.py` — add entries to `CONNECTIONS`, `ASSETS`, `COLUMNS`, `RULES`, and `BASE_SCORES`. No new files. Idempotent on re-run.

## Connections

### Connection 1: Oracle Financials (ERP)

| Field | Value |
|---|---|
| `connection_name` | `Oracle Financials (ERP)` |
| `database_type` | `oracle` |
| `host` | `erp-prod.corp.internal` |
| `port` | `1521` |
| `account` | `erp-prod.corp.internal` |
| `sf_user` | `fin_dg_user` |
| `default_database` | `FINDB` |
| `default_schema` | `FINANCE` |
| `description` | Oracle ERP Financial modules — GL, AP, AR, and budgeting |
| `environment` | `production` |
| `last_test_status` | `success` |
| `is_primary_target` | `False` |

### Connection 2: Oracle Manufacturing (ERP)

| Field | Value |
|---|---|
| `connection_name` | `Oracle Manufacturing (ERP)` |
| `database_type` | `oracle` |
| `host` | `mfg-prod.corp.internal` |
| `port` | `1521` |
| `account` | `mfg-prod.corp.internal` |
| `sf_user` | `mfg_dg_user` |
| `default_database` | `MFGDB` |
| `default_schema` | `MFG` |
| `description` | Oracle ERP Manufacturing modules — work orders, BOMs, production, and quality |
| `environment` | `production` |
| `last_test_status` | `success` |
| `is_primary_target` | `False` |

## Assets (12 tables total)

### Oracle Financials (ERP) — 6 tables

| Table | Domain | Subdomain | Criticality | Description |
|---|---|---|---|---|
| `GL_ACCOUNTS` | Finance | General Ledger | critical | Chart of accounts — all active GL account codes and types |
| `JOURNAL_ENTRIES` | Finance | General Ledger | critical | General ledger journal entries for SOX-controlled periods |
| `AP_INVOICES` | Finance | Accounts Payable | high | Vendor invoices received and pending payment |
| `AR_INVOICES` | Finance | Accounts Receivable | high | Customer invoices issued and outstanding |
| `COST_CENTERS` | Finance | Expenses | medium | Cost center master data for expense allocation |
| `BUDGET_LINES` | Finance | Forecasting | high | Annual budget allocations and actuals by cost center and period |

All subdomains (General Ledger, Accounts Payable, Accounts Receivable, Expenses, Forecasting) already exist under Finance in the base seed.

### Oracle Manufacturing (ERP) — 6 tables

| Table | Domain | Subdomain | Criticality | Description |
|---|---|---|---|---|
| `WORK_ORDERS` | Operations | Supply Chain | high | Production work orders linking items to plant and schedule |
| `BOM_HEADERS` | Operations | Supply Chain | medium | Bill of materials headers with revision and effectivity |
| `BOM_COMPONENTS` | Operations | Supply Chain | medium | BOM component lines with quantities and units of measure |
| `PRODUCTION_RUNS` | Operations | Fulfillment | high | Actual production execution records with output and defect counts |
| `QUALITY_INSPECTIONS` | Operations | Fulfillment | high | QC inspection results per work order |
| `MACHINE_DOWNTIME` | Operations | Logistics | medium | Equipment downtime events with reason codes and duration |

All subdomains (Supply Chain, Fulfillment, Logistics) already exist under Operations in the base seed.

## Columns

### GL_ACCOUNTS
`(ACCOUNT_ID, VARCHAR, PK)`, `(ACCOUNT_CODE, VARCHAR)`, `(ACCOUNT_NAME, VARCHAR)`, `(ACCOUNT_TYPE, VARCHAR)`, `(PARENT_ACCOUNT_ID, VARCHAR, nullable)`, `(IS_ACTIVE, VARCHAR)`

### JOURNAL_ENTRIES
`(JOURNAL_ID, VARCHAR, PK)`, `(ACCOUNT_ID, VARCHAR)`, `(ENTRY_DATE, DATE)`, `(DEBIT_AMOUNT, NUMBER)`, `(CREDIT_AMOUNT, NUMBER)`, `(PERIOD, VARCHAR)`, `(POSTED_BY, VARCHAR, nullable)`

### AP_INVOICES
`(INVOICE_ID, VARCHAR, PK)`, `(VENDOR_ID, VARCHAR)`, `(INVOICE_DATE, DATE)`, `(DUE_DATE, DATE, nullable)`, `(AMOUNT, NUMBER)`, `(STATUS, VARCHAR)`, `(CURRENCY, VARCHAR)`

### AR_INVOICES
`(INVOICE_ID, VARCHAR, PK)`, `(CUSTOMER_ID, VARCHAR)`, `(INVOICE_DATE, DATE)`, `(DUE_DATE, DATE, nullable)`, `(AMOUNT, NUMBER)`, `(STATUS, VARCHAR)`, `(CURRENCY, VARCHAR)`

### COST_CENTERS
`(CC_ID, VARCHAR, PK)`, `(CC_CODE, VARCHAR)`, `(CC_NAME, VARCHAR)`, `(DEPARTMENT, VARCHAR, nullable)`, `(OWNER_EMAIL, VARCHAR, nullable)`

### BUDGET_LINES
`(BUDGET_ID, VARCHAR, PK)`, `(COST_CENTER_ID, VARCHAR)`, `(FISCAL_YEAR, INTEGER)`, `(PERIOD, VARCHAR)`, `(BUDGET_AMOUNT, NUMBER)`, `(ACTUAL_AMOUNT, NUMBER, nullable)`

### WORK_ORDERS
`(WO_ID, VARCHAR, PK)`, `(ITEM_ID, VARCHAR)`, `(QUANTITY, NUMBER)`, `(START_DATE, DATE)`, `(END_DATE, DATE, nullable)`, `(STATUS, VARCHAR)`, `(PLANT_CODE, VARCHAR)`

### BOM_HEADERS
`(BOM_ID, VARCHAR, PK)`, `(ITEM_ID, VARCHAR)`, `(EFFECTIVE_DATE, DATE)`, `(REVISION, VARCHAR)`, `(IS_ACTIVE, VARCHAR)`

### BOM_COMPONENTS
`(COMPONENT_ID, VARCHAR, PK)`, `(BOM_ID, VARCHAR)`, `(ITEM_ID, VARCHAR)`, `(QUANTITY, NUMBER)`, `(UNIT_OF_MEASURE, VARCHAR)`

### PRODUCTION_RUNS
`(RUN_ID, VARCHAR, PK)`, `(WO_ID, VARCHAR)`, `(START_TIME, TIMESTAMP)`, `(END_TIME, TIMESTAMP, nullable)`, `(OUTPUT_QUANTITY, NUMBER)`, `(DEFECT_COUNT, NUMBER, nullable)`, `(MACHINE_ID, VARCHAR)`

### QUALITY_INSPECTIONS
`(INSPECTION_ID, VARCHAR, PK)`, `(WO_ID, VARCHAR)`, `(INSPECTION_DATE, DATE)`, `(RESULT, VARCHAR)`, `(INSPECTOR_ID, VARCHAR, nullable)`, `(DEFECT_CODE, VARCHAR, nullable)`

### MACHINE_DOWNTIME
`(DOWNTIME_ID, VARCHAR, PK)`, `(MACHINE_ID, VARCHAR)`, `(START_TIME, TIMESTAMP)`, `(END_TIME, TIMESTAMP, nullable)`, `(REASON_CODE, VARCHAR)`, `(DURATION_MINS, NUMBER, nullable)`

## DQ Rules

### GL_ACCOUNTS
- Account Code Unique — `uniqueness_check` / ACCOUNT_CODE / critical / uniqueness
- Account Name Not Null — `null_check` / ACCOUNT_NAME / high / completeness
- Account Type Valid — `accepted_values_check` / ACCOUNT_TYPE / high / validity

### JOURNAL_ENTRIES
- No Duplicate Journal IDs — `uniqueness_check` / JOURNAL_ID / critical / uniqueness
- Debit Credit Balance — `business_rule_check` / DEBIT_AMOUNT / critical / accuracy
- Amount Not Zero — `range_check` / DEBIT_AMOUNT / high / validity
- Journal Date Freshness — `freshness_check` / ENTRY_DATE / high / timeliness

### AP_INVOICES
- Invoice Amount Positive — `range_check` / AMOUNT / critical / validity
- AP Status Valid — `accepted_values_check` / STATUS / high / validity
- Currency Valid — `regex_check` / CURRENCY / high / validity
- Invoice Date Freshness — `freshness_check` / INVOICE_DATE / high / timeliness

### AR_INVOICES
- AR Amount Positive — `range_check` / AMOUNT / critical / validity
- AR Status Valid — `accepted_values_check` / STATUS / high / validity
- Customer Ref Valid — `referential_integrity_check` / CUSTOMER_ID / critical / consistency
- AR Freshness — `freshness_check` / INVOICE_DATE / medium / timeliness

### COST_CENTERS
- CC Code Unique — `uniqueness_check` / CC_CODE / high / uniqueness
- CC Name Not Null — `null_check` / CC_NAME / medium / completeness

### BUDGET_LINES
- Budget Amount Not Negative — `range_check` / BUDGET_AMOUNT / high / validity
- Fiscal Year Valid — `range_check` / FISCAL_YEAR / medium / validity
- Cost Center Ref Valid — `referential_integrity_check` / COST_CENTER_ID / high / consistency

### WORK_ORDERS
- WO Status Valid — `accepted_values_check` / STATUS / high / validity
- WO Quantity Positive — `range_check` / QUANTITY / high / validity
- WO Date Freshness — `freshness_check` / START_DATE / medium / timeliness

### BOM_HEADERS
- BOM Item Not Null — `null_check` / ITEM_ID / high / completeness
- BOM Revision Not Null — `null_check` / REVISION / medium / completeness

### BOM_COMPONENTS
- Component Quantity Positive — `range_check` / QUANTITY / high / validity
- BOM Ref Valid — `referential_integrity_check` / BOM_ID / high / consistency
- UOM Not Null — `null_check` / UNIT_OF_MEASURE / medium / completeness

### PRODUCTION_RUNS
- Output Quantity Positive — `range_check` / OUTPUT_QUANTITY / high / validity
- WO Ref Valid — `referential_integrity_check` / WO_ID / high / consistency
- Production Freshness — `freshness_check` / START_TIME / medium / timeliness

### QUALITY_INSPECTIONS
- Inspection Result Valid — `accepted_values_check` / RESULT / critical / validity
- No Duplicate Inspections — `uniqueness_check` / INSPECTION_ID / high / uniqueness
- Inspection Freshness — `freshness_check` / INSPECTION_DATE / medium / timeliness

### MACHINE_DOWNTIME
- Reason Code Not Null — `null_check` / REASON_CODE / high / completeness
- Duration Not Negative — `range_check` / DURATION_MINS / medium / validity
- Downtime Freshness — `freshness_check` / START_TIME / medium / timeliness

## Quality Base Scores

| Table | Base Score |
|---|---|
| GL_ACCOUNTS | 98.0 |
| JOURNAL_ENTRIES | 96.5 |
| AP_INVOICES | 94.0 |
| AR_INVOICES | 93.5 |
| COST_CENTERS | 99.0 |
| BUDGET_LINES | 91.0 |
| WORK_ORDERS | 92.5 |
| BOM_HEADERS | 97.0 |
| BOM_COMPONENTS | 95.5 |
| PRODUCTION_RUNS | 89.0 |
| QUALITY_INSPECTIONS | 94.5 |
| MACHINE_DOWNTIME | 96.0 |

## Implementation Scope

Single file change: `scripts/seed_all.py`

Dictionaries to extend:
1. `CONNECTIONS` — 2 new entries
2. `ASSETS` — 12 new tuples
3. `COLUMNS` — 12 new table entries
4. `RULES` — 12 new table entries
5. `BASE_SCORES` — 12 new entries

The `seed_connections` function already handles `host` and `port` fields via `**spec` unpacking. The `seed_assets` function uses the `provider` field from `ASSETS` tuples and maps it to `AssetSourceMeta.provider`. No changes needed to the seeding functions themselves.
