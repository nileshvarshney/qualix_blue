# DQ Platform Golden Dataset

A comprehensive Snowflake SQL dataset for testing every feature of the DQ platform and for user training.

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `golden_dataset_part1_setup_and_source_tables.sql` | DB setup + source tables with realistic dirty data | ~340 |
| `golden_dataset_part2_platform_metadata.sql` | Domains, rules, runs, scores, alerts | ~430 |
| `golden_dataset_part3_advanced_features.sql` | Glossary, lineage, contracts, compliance, templates | ~450 |

## How to Run

Run in order on a Snowflake worksheet:

```sql
-- Step 1: Source tables
-- Paste and run Part 1

-- Step 2: Platform metadata
-- Paste and run Part 2

-- Step 3: Advanced features
-- Paste and run Part 3
```

Or use SnowSQL:
```bash
snowsql -a <account> -u <user> -d DQ_PLATFORM_DB -f golden_dataset_part1_setup_and_source_tables.sql
snowsql -a <account> -u <user> -d DQ_PLATFORM_DB -f golden_dataset_part2_platform_metadata.sql
snowsql -a <account> -u <user> -d DQ_PLATFORM_DB -f golden_dataset_part3_advanced_features.sql
```

---

## What Is Covered

### Part 1 – Source Tables (tables monitored by DQ rules)

| Table | Domain | Rows | Intentional DQ Issues |
|-------|--------|------|-----------------------|
| `CUSTOMERS` | Revenue | 10 | None (clean reference table) |
| `INVOICES` | Revenue | 20 | NULL invoice_id (×3), negative amount (×2), duplicate INV-009 (×2), invalid status REFUNDED (×1), future date 2099 (×1), orphan customer_id (×1) |
| `SUBSCRIPTIONS` | Revenue | 10 | Invalid status SUSPENDED (×1), end_date before start_date (×1) |
| `GL_JOURNAL_ENTRIES` | Finance | 15 | NULL journal_entry_id (×2), unbalanced debit≠credit (×4), zero amount (×1) |
| `ACCOUNTS_PAYABLE` | Finance | 10 | None (clean) |
| `ORDERS` | Operations | 10 | None (clean reference table) |
| `SHIPMENTS` | Operations | 11 | Ship_date before order_date (×2), orphan order_id (×1) |
| `INVENTORY` | Operations | 10 | Negative quantity (×3) |
| `EMPLOYEES` | HR | 14 | NULL employee_id (×1), duplicate EMP-001 (×1), salary=0 (×2), exit_date before joining_date (×1) |
| `PAYROLL` | HR | 10 | Negative net_pay (×1), missing record for active employee |
| `LEADS` | GTM | 15 | Invalid email format (×3), conversion_rate > 100 (×2) |
| `CAMPAIGNS` | GTM | 6 | end_date before start_date (×1) |
| `FORECAST_PLANNING` | Planning | 10 | NULL forecast_period (×2), out-of-range forecast value (×1) |
| `STALE_DATA_TABLE` | Others | 3 | All records > 24 hours stale (freshness check trigger) |

### Part 2 – Platform Metadata

| Object | Count | Notes |
|--------|-------|-------|
| Domains | 7 | All 7 CLAUDE.md domains |
| Subdomains | 31 | Full subdomain hierarchy |
| Data Assets | 14 | All source tables registered |
| DQ Rules | 31 | All 12 rule types covered |
| Schedules | 11 | Rule, table, domain levels |
| Rule Runs | 45 | 30-day history, mix of pass/fail |
| Quality Scores | 35 | Global, domain, and table-level |
| Alerts | 8 | open, acknowledged, resolved |
| Audit Logs | 10 | Rule creation, approval, certification |
| Run Samples | 12 | Failed record examples |

### Part 3 – Advanced Features

| Feature | Count |
|---------|-------|
| Glossary Terms | 10 |
| Term-Asset Links | 10 |
| Data Classifications | 10 (PII, SENSITIVE, RESTRICTED) |
| Column Metadata (profiling) | 8 |
| Data Products | 3 |
| Data Lineage records | 7 |
| Tags | 8 |
| Asset Tags | 15 |
| Custom Attributes | 10 |
| Data Contracts | 3 |
| Compliance Frameworks | 6 |
| Compliance Mappings | 8 |
| Governance Policies | 6 |
| SLA Configs | 7 |
| Asset Comments | 6 |
| Asset Ratings | 5 |
| Rule Templates | 10 |

---

## Rule Types Demonstrated

| Rule Type | Rule ID(s) | Source Table |
|-----------|------------|--------------|
| `null_check` | rul-rev-0001, rul-fin-0001, rul-ops-0002, rul-hr-0001, rul-pln-0001 | INVOICES, GL, INVENTORY, EMPLOYEES, FORECAST |
| `uniqueness_check` | rul-rev-0002, rul-hr-0002, rul-gtm-0003 | INVOICES, EMPLOYEES, LEADS |
| `duplicate_check` | (same as uniqueness_check) | — |
| `range_check` | rul-rev-0003, rul-fin-0003, rul-ops-0001, rul-hr-0003, rul-hr-0007, rul-gtm-0002 | INVOICES, GL, INVENTORY, EMPLOYEES, PAYROLL, LEADS |
| `accepted_values_check` | rul-rev-0004, rul-rev-0008, rul-hr-0006 | INVOICES, SUBSCRIPTIONS, EMPLOYEES |
| `freshness_check` | rul-rev-0007, rul-fin-0005, rul-oth-0001 | INVOICES, GL, STALE_DATA_TABLE |
| `volume_check` | rul-pln-0002 | FORECAST_PLANNING |
| `schema_drift_check` | rul-fin-0004 | GL_JOURNAL_ENTRIES |
| `referential_integrity_check` | rul-rev-0006, rul-ops-0004 | INVOICES→CUSTOMERS, SHIPMENTS→ORDERS |
| `regex_check` | rul-hr-0005, rul-gtm-0001 | EMPLOYEES, LEADS |
| `business_rule_check` | rul-rev-0005, rul-rev-0009, rul-fin-0002, rul-hr-0004, rul-gtm-0004 | INVOICES, SUBSCRIPTIONS, GL, EMPLOYEES, CAMPAIGNS |
| `custom_sql_check` | rul-ops-0003, rul-hr-0008 | SHIPMENTS, EMPLOYEES×PAYROLL |

---

## Expected Test Results (Run Against This Dataset)

After running all rules, you should see these failures:

| Domain | Expected Failing Rules | Expected Quality Score |
|--------|----------------------|----------------------|
| Revenue | 5–6 (null ID, duplicate, negative amount, bad status, future date, orphan customer) | ~22–30% |
| Finance | 4 (null GL ID, unbalanced entries, zero amount, freshness) | ~20–40% |
| Operations | 4 (negative inventory, ship date, orphan shipment, volume) | ~0–25% |
| HR | 6 (null emp ID, duplicate, salary=0, exit<join, payroll gap) | ~17–25% |
| GTM | 3 (invalid emails, rate>100, campaign date) | ~25–50% |
| Planning | 2 (null period, out-of-range forecast) | ~60–80% |

---

## Training Scenarios

### Scenario 1: Revenue Billing Investigation
1. Go to Dashboard → Revenue → Billing
2. Click on INVOICES table
3. Observe 5 failing rules and quality score ~22%
4. Open alert for `invoice_id_not_null` (critical)
5. View sample failed records (3 null IDs)
6. Ask AI to explain the failure
7. Use AI to suggest a fix

### Scenario 2: Finance SOX Compliance
1. Go to Dashboard → Finance → General Ledger
2. Click on GL_JOURNAL_ENTRIES table
3. Observe `gl_debit_credit_balanced` is failing
4. View compliance mapping → SOX 404
5. Check the data contract (status: violated)
6. Acknowledge the open alert

### Scenario 3: HR Data Governance
1. Go to Dashboard → HR → Employees
2. Observe PII classifications on email and salary columns
3. Check the data contract for EMPLOYEES
4. View open alert for salary=0
5. Read comments on the table (issue filed for exit date)
6. Check governance scorecard

### Scenario 4: Rule Creation (AI-Assisted)
1. Go to Rules → Create New Rule
2. Select domain: GTM, table: LEADS
3. In natural language box, type: "Lead email must be valid"
4. Watch AI auto-populate: rule_type=regex_check, column=email, pattern
5. Review and save as pending_review
6. Approve the rule

### Scenario 5: Data Catalog Exploration
1. Go to Catalog and search "invoice"
2. Find INVOICES table, view profiling stats
3. Check glossary terms linked to the table
4. See PII classification on invoice_amount
5. Explore lineage: upstream (CUSTOMERS) and downstream (Revenue Dashboard)

### Scenario 6: Data Contract Violation
1. Go to Contracts
2. Find "GL Journal Entry Data Contract v1.0" (status: violated)
3. See breach reason: quality score 73% < required 98%
4. View the contributing failing rules
5. Mark as investigating

---

## Reset / Cleanup

To reset and re-run from scratch:
```sql
DROP SCHEMA IF EXISTS DQ_PLATFORM_DB.SOURCE_DATA CASCADE;
DROP SCHEMA IF EXISTS DQ_PLATFORM_DB.METADATA_SCHEMA CASCADE;
DROP SCHEMA IF EXISTS DQ_PLATFORM_DB.RESULTS_SCHEMA CASCADE;
-- Then re-run Parts 1, 2, and 3
```
