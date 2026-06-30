# Oracle DW Seed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Oracle ERP connections (Financials and Manufacturing) with 12 tables, columns, DQ rules, and quality scores to the demo seed dataset.

**Architecture:** Single file change to `scripts/seed_all.py` — extend the five catalogue dictionaries (`CONNECTIONS`, `ASSETS`, `COLUMNS`, `RULES`, `BASE_SCORES`). The existing seeding functions already handle `host`, `port`, and `oracle` as `database_type` with no code changes required.

**Tech Stack:** Python, SQLAlchemy async, existing `seed_all.py` infrastructure.

## Global Constraints

- All table names for Oracle Financials use ALL_CAPS (Oracle convention), schema `FINANCE`, database `FINDB`
- All table names for Oracle Manufacturing use ALL_CAPS, schema `MFG`, database `MFGDB`
- `provider` field in ASSETS tuples must be `"oracle"` (matches `AssetSourceMeta.provider`)
- All subdomains referenced already exist in the base seed — do not add new subdomains
- Seed script is idempotent — safe to re-run; existing rows are skipped by name/key
- Do not modify any seeding function — only extend the catalogue dictionaries

---

### Task 1: Add Oracle connections and assets

**Files:**
- Modify: `scripts/seed_all.py` — `CONNECTIONS` list (line ~60) and `ASSETS` list (line ~89)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: two new connection entries keyed by `name`; 12 new asset tuples consumed by Task 2 via `asset_map[table]`

- [ ] **Step 1: Add Oracle connections to `CONNECTIONS`**

In `scripts/seed_all.py`, find the `CONNECTIONS` list (ends at `]` after the Redshift entry, around line 86). Append the two Oracle dicts **before** the closing `]`:

```python
    dict(name="Oracle Financials (ERP)", database_type="oracle",
         account="erp-prod.corp.internal", sf_user="fin_dg_user",
         host="erp-prod.corp.internal", port=1521,
         default_database="FINDB", default_schema="FINANCE",
         description="Oracle ERP Financial modules — GL, AP, AR, and budgeting",
         is_primary_target=False, last_test_status="success", environment="production"),
    dict(name="Oracle Manufacturing (ERP)", database_type="oracle",
         account="mfg-prod.corp.internal", sf_user="mfg_dg_user",
         host="mfg-prod.corp.internal", port=1521,
         default_database="MFGDB", default_schema="MFG",
         description="Oracle ERP Manufacturing modules — work orders, BOMs, production, and quality",
         is_primary_target=False, last_test_status="success", environment="production"),
```

- [ ] **Step 2: Add Oracle assets to `ASSETS`**

In `scripts/seed_all.py`, find the `ASSETS` list. Append 12 new tuples after the last Redshift entry (the `agg_revenue` line):

```python
    # Oracle Financials (ERP) — 6 tables
    ("Oracle Financials (ERP)","GL_ACCOUNTS","Finance","General Ledger","critical","Chart of accounts — all active GL account codes and types","oracle","FINDB","FINANCE"),
    ("Oracle Financials (ERP)","JOURNAL_ENTRIES","Finance","General Ledger","critical","General ledger journal entries for SOX-controlled periods","oracle","FINDB","FINANCE"),
    ("Oracle Financials (ERP)","AP_INVOICES","Finance","Accounts Payable","high","Vendor invoices received and pending payment","oracle","FINDB","FINANCE"),
    ("Oracle Financials (ERP)","AR_INVOICES","Finance","Accounts Receivable","high","Customer invoices issued and outstanding","oracle","FINDB","FINANCE"),
    ("Oracle Financials (ERP)","COST_CENTERS","Finance","Expenses","medium","Cost center master data for expense allocation","oracle","FINDB","FINANCE"),
    ("Oracle Financials (ERP)","BUDGET_LINES","Finance","Forecasting","high","Annual budget allocations and actuals by cost center and period","oracle","FINDB","FINANCE"),
    # Oracle Manufacturing (ERP) — 6 tables
    ("Oracle Manufacturing (ERP)","WORK_ORDERS","Operations","Supply Chain","high","Production work orders linking items to plant and schedule","oracle","MFGDB","MFG"),
    ("Oracle Manufacturing (ERP)","BOM_HEADERS","Operations","Supply Chain","medium","Bill of materials headers with revision and effectivity","oracle","MFGDB","MFG"),
    ("Oracle Manufacturing (ERP)","BOM_COMPONENTS","Operations","Supply Chain","medium","BOM component lines with quantities and units of measure","oracle","MFGDB","MFG"),
    ("Oracle Manufacturing (ERP)","PRODUCTION_RUNS","Operations","Fulfillment","high","Actual production execution records with output and defect counts","oracle","MFGDB","MFG"),
    ("Oracle Manufacturing (ERP)","QUALITY_INSPECTIONS","Operations","Fulfillment","high","QC inspection results per work order","oracle","MFGDB","MFG"),
    ("Oracle Manufacturing (ERP)","MACHINE_DOWNTIME","Operations","Logistics","medium","Equipment downtime events with reason codes and duration","oracle","MFGDB","MFG"),
```

- [ ] **Step 3: Verify the CONNECTIONS and ASSETS lists are syntactically valid**

```bash
python -c "import ast, pathlib; ast.parse(pathlib.Path('scripts/seed_all.py').read_text()); print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_all.py
git commit -m "feat(seed): add Oracle Financials and Manufacturing connections and assets"
```

---

### Task 2: Add columns, rules, and quality scores

**Files:**
- Modify: `scripts/seed_all.py` — `COLUMNS` dict, `RULES` dict, `BASE_SCORES` dict

**Interfaces:**
- Consumes: `asset_map[table]` populated by Task 1's ASSETS entries
- Produces: column metadata, DQ rules, and base quality scores for all 12 Oracle tables

- [ ] **Step 1: Add Oracle columns to `COLUMNS`**

In `scripts/seed_all.py`, find the `COLUMNS` dict. Append 12 new entries after the last existing entry (`"agg_revenue": [...]`):

```python
    # Oracle Financials
    "GL_ACCOUNTS":[("ACCOUNT_ID","VARCHAR",True,False),("ACCOUNT_CODE","VARCHAR",False,False),("ACCOUNT_NAME","VARCHAR",False,False),("ACCOUNT_TYPE","VARCHAR",False,False),("PARENT_ACCOUNT_ID","VARCHAR",False,True),("IS_ACTIVE","VARCHAR",False,False)],
    "JOURNAL_ENTRIES":[("JOURNAL_ID","VARCHAR",True,False),("ACCOUNT_ID","VARCHAR",False,False),("ENTRY_DATE","DATE",False,False),("DEBIT_AMOUNT","NUMBER",False,False),("CREDIT_AMOUNT","NUMBER",False,False),("PERIOD","VARCHAR",False,False),("POSTED_BY","VARCHAR",False,True)],
    "AP_INVOICES":[("INVOICE_ID","VARCHAR",True,False),("VENDOR_ID","VARCHAR",False,False),("INVOICE_DATE","DATE",False,False),("DUE_DATE","DATE",False,True),("AMOUNT","NUMBER",False,False),("STATUS","VARCHAR",False,False),("CURRENCY","VARCHAR",False,False)],
    "AR_INVOICES":[("INVOICE_ID","VARCHAR",True,False),("CUSTOMER_ID","VARCHAR",False,False),("INVOICE_DATE","DATE",False,False),("DUE_DATE","DATE",False,True),("AMOUNT","NUMBER",False,False),("STATUS","VARCHAR",False,False),("CURRENCY","VARCHAR",False,False)],
    "COST_CENTERS":[("CC_ID","VARCHAR",True,False),("CC_CODE","VARCHAR",False,False),("CC_NAME","VARCHAR",False,False),("DEPARTMENT","VARCHAR",False,True),("OWNER_EMAIL","VARCHAR",False,True)],
    "BUDGET_LINES":[("BUDGET_ID","VARCHAR",True,False),("COST_CENTER_ID","VARCHAR",False,False),("FISCAL_YEAR","INTEGER",False,False),("PERIOD","VARCHAR",False,False),("BUDGET_AMOUNT","NUMBER",False,False),("ACTUAL_AMOUNT","NUMBER",False,True)],
    # Oracle Manufacturing
    "WORK_ORDERS":[("WO_ID","VARCHAR",True,False),("ITEM_ID","VARCHAR",False,False),("QUANTITY","NUMBER",False,False),("START_DATE","DATE",False,False),("END_DATE","DATE",False,True),("STATUS","VARCHAR",False,False),("PLANT_CODE","VARCHAR",False,False)],
    "BOM_HEADERS":[("BOM_ID","VARCHAR",True,False),("ITEM_ID","VARCHAR",False,False),("EFFECTIVE_DATE","DATE",False,False),("REVISION","VARCHAR",False,False),("IS_ACTIVE","VARCHAR",False,False)],
    "BOM_COMPONENTS":[("COMPONENT_ID","VARCHAR",True,False),("BOM_ID","VARCHAR",False,False),("ITEM_ID","VARCHAR",False,False),("QUANTITY","NUMBER",False,False),("UNIT_OF_MEASURE","VARCHAR",False,False)],
    "PRODUCTION_RUNS":[("RUN_ID","VARCHAR",True,False),("WO_ID","VARCHAR",False,False),("START_TIME","TIMESTAMP",False,False),("END_TIME","TIMESTAMP",False,True),("OUTPUT_QUANTITY","NUMBER",False,False),("DEFECT_COUNT","NUMBER",False,True),("MACHINE_ID","VARCHAR",False,False)],
    "QUALITY_INSPECTIONS":[("INSPECTION_ID","VARCHAR",True,False),("WO_ID","VARCHAR",False,False),("INSPECTION_DATE","DATE",False,False),("RESULT","VARCHAR",False,False),("INSPECTOR_ID","VARCHAR",False,True),("DEFECT_CODE","VARCHAR",False,True)],
    "MACHINE_DOWNTIME":[("DOWNTIME_ID","VARCHAR",True,False),("MACHINE_ID","VARCHAR",False,False),("START_TIME","TIMESTAMP",False,False),("END_TIME","TIMESTAMP",False,True),("REASON_CODE","VARCHAR",False,False),("DURATION_MINS","NUMBER",False,True)],
```

- [ ] **Step 2: Add Oracle rules to `RULES`**

In `scripts/seed_all.py`, find the `RULES` dict. Append 12 new entries after the last existing entry (`"agg_revenue": [...]`):

```python
    # Oracle Financials
    "GL_ACCOUNTS":[("Account Code Unique","uniqueness_check","ACCOUNT_CODE","critical","uniqueness"),("Account Name Not Null","null_check","ACCOUNT_NAME","high","completeness"),("Account Type Valid","accepted_values_check","ACCOUNT_TYPE","high","validity")],
    "JOURNAL_ENTRIES":[("No Duplicate Journal IDs","uniqueness_check","JOURNAL_ID","critical","uniqueness"),("Debit Credit Balance","business_rule_check","DEBIT_AMOUNT","critical","accuracy"),("Amount Not Zero","range_check","DEBIT_AMOUNT","high","validity"),("Journal Date Freshness","freshness_check","ENTRY_DATE","high","timeliness")],
    "AP_INVOICES":[("Invoice Amount Positive","range_check","AMOUNT","critical","validity"),("AP Status Valid","accepted_values_check","STATUS","high","validity"),("Currency Valid","regex_check","CURRENCY","high","validity"),("Invoice Date Freshness","freshness_check","INVOICE_DATE","high","timeliness")],
    "AR_INVOICES":[("AR Amount Positive","range_check","AMOUNT","critical","validity"),("AR Status Valid","accepted_values_check","STATUS","high","validity"),("Customer Ref Valid","referential_integrity_check","CUSTOMER_ID","critical","consistency"),("AR Freshness","freshness_check","INVOICE_DATE","medium","timeliness")],
    "COST_CENTERS":[("CC Code Unique","uniqueness_check","CC_CODE","high","uniqueness"),("CC Name Not Null","null_check","CC_NAME","medium","completeness")],
    "BUDGET_LINES":[("Budget Amount Not Negative","range_check","BUDGET_AMOUNT","high","validity"),("Fiscal Year Valid","range_check","FISCAL_YEAR","medium","validity"),("Cost Center Ref Valid","referential_integrity_check","COST_CENTER_ID","high","consistency")],
    # Oracle Manufacturing
    "WORK_ORDERS":[("WO Status Valid","accepted_values_check","STATUS","high","validity"),("WO Quantity Positive","range_check","QUANTITY","high","validity"),("WO Date Freshness","freshness_check","START_DATE","medium","timeliness")],
    "BOM_HEADERS":[("BOM Item Not Null","null_check","ITEM_ID","high","completeness"),("BOM Revision Not Null","null_check","REVISION","medium","completeness")],
    "BOM_COMPONENTS":[("Component Quantity Positive","range_check","QUANTITY","high","validity"),("BOM Ref Valid","referential_integrity_check","BOM_ID","high","consistency"),("UOM Not Null","null_check","UNIT_OF_MEASURE","medium","completeness")],
    "PRODUCTION_RUNS":[("Output Quantity Positive","range_check","OUTPUT_QUANTITY","high","validity"),("WO Ref Valid","referential_integrity_check","WO_ID","high","consistency"),("Production Freshness","freshness_check","START_TIME","medium","timeliness")],
    "QUALITY_INSPECTIONS":[("Inspection Result Valid","accepted_values_check","RESULT","critical","validity"),("No Duplicate Inspections","uniqueness_check","INSPECTION_ID","high","uniqueness"),("Inspection Freshness","freshness_check","INSPECTION_DATE","medium","timeliness")],
    "MACHINE_DOWNTIME":[("Reason Code Not Null","null_check","REASON_CODE","high","completeness"),("Duration Not Negative","range_check","DURATION_MINS","medium","validity"),("Downtime Freshness","freshness_check","START_TIME","medium","timeliness")],
```

- [ ] **Step 3: Add Oracle base scores to `BASE_SCORES`**

In `scripts/seed_all.py`, find the `BASE_SCORES` dict. Append the 12 Oracle scores before the closing `}`:

```python
    "GL_ACCOUNTS":98.0,"JOURNAL_ENTRIES":96.5,"AP_INVOICES":94.0,"AR_INVOICES":93.5,
    "COST_CENTERS":99.0,"BUDGET_LINES":91.0,
    "WORK_ORDERS":92.5,"BOM_HEADERS":97.0,"BOM_COMPONENTS":95.5,
    "PRODUCTION_RUNS":89.0,"QUALITY_INSPECTIONS":94.5,"MACHINE_DOWNTIME":96.0,
```

- [ ] **Step 4: Verify syntax**

```bash
python -c "import ast, pathlib; ast.parse(pathlib.Path('scripts/seed_all.py').read_text()); print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Dry-run import check**

```bash
python -c "
import sys; sys.path.insert(0, '.')
# parse the catalogue constants without hitting the DB
exec(open('scripts/seed_all.py').read().split('async def seed_connections')[0])
oracle_conns = [c for c in CONNECTIONS if c['database_type'] == 'oracle']
oracle_assets = [a for a in ASSETS if 'Oracle' in a[0]]
print(f'Oracle connections: {len(oracle_conns)}')
print(f'Oracle assets: {len(oracle_assets)}')
oracle_tables = [a[1] for a in oracle_assets]
missing_cols = [t for t in oracle_tables if t not in COLUMNS]
missing_rules = [t for t in oracle_tables if t not in RULES]
missing_scores = [t for t in oracle_tables if t not in BASE_SCORES]
print(f'Tables missing columns: {missing_cols}')
print(f'Tables missing rules: {missing_rules}')
print(f'Tables missing scores: {missing_scores}')
"
```

Expected output:
```
Oracle connections: 2
Oracle assets: 12
Tables missing columns: []
Tables missing rules: []
Tables missing scores: []
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed_all.py
git commit -m "feat(seed): add Oracle Financials and Manufacturing columns, rules, and scores"
```
