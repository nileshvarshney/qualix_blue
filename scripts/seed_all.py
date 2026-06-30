"""
Comprehensive demo seed — covers every screen in the app.
Optimised for Snowflake:
 - Non-JSON tables  → add_all() + one flush (fast, executemany)
 - JSON-column tables → one add() + flush per row (avoids parse_json() multi-row bug)
Idempotent — safe to re-run.
"""
from __future__ import annotations

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import (
    AlertDefinition, AnomalyDetection, AnomalyDetector,
    Asset, AssetMonitoringMetric, AssetOwner, AssetSourceMeta, AssetTag,
    ColumnMetadata, ContinuousMonitoringConfig, ConsentRecord,
    DataClassification, DataContract, DataProduct, DataProductAsset,
    DataSharingAgreement, DataSubjectRequest, Domain,
    DQAlert, DQDimensionScore, DQQualityScore, DQRule, DQRuleRun,
    GlossaryTerm, GlossaryTermAsset, GovernancePolicy,
    Issue, MaskingPolicy, Notification,
    OncallSchedule, Pipeline, PipelineRun, PipelineStep, PipelineStepRun,
    ProfilingResultPlaceholder,
    QualityIncident, RuleTemplate, ScanJob, ScanJobRun,
    SchemaBaseline, SLAConfig, SnowflakeConnection,
    Subdomain, Tag, Team, TeamMembership, User, VolumeBaseline,
)

_rng = random.Random(42)
def uid(): return str(uuid.uuid4())
def utcnow(): return datetime.now(timezone.utc).replace(tzinfo=None)
def days_ago(n): return utcnow() - timedelta(days=n)
def date_ago(n): return (utcnow() - timedelta(days=n)).date()
def jitter(b, s=3.0): return round(max(0, min(100, b + _rng.uniform(-s, s))), 2)

# Tables with VARIANT/JSON columns must flush one row at a time.
# Tables without JSON can batch with add_all() for speed.
async def af(db, obj):
    """Single-row add + flush (needed for JSON-column tables on Snowflake)."""
    db.add(obj)
    await db.flush()

async def batch(db, rows):
    """Batch-add rows and flush once — only safe for tables with no JSON columns."""
    if rows:
        db.add_all(rows)
        await db.flush()

DIMENSIONS = ["completeness", "accuracy", "validity", "consistency", "timeliness", "uniqueness"]

# ── catalogues ────────────────────────────────────────────────────────────────

CONNECTIONS = [
    dict(name="Supply Chain DB", database_type="snowflake",
         account="zfuftbi-keb04862", sf_user="nilesh", warehouse="COMPUTE_WH",
         role="ACCOUNTADMIN", default_database="SUPPLYCHAIN_DB", default_schema="SUPPLYCHAIN",
         description="Primary supply chain Snowflake database",
         is_primary_target=True, last_test_status="success", environment="production"),
    dict(name="Marketing Analytics (BigQuery)", database_type="bigquery",
         account="bigquery.googleapis.com",
         sf_user="svc-dataguard@analytics-prod-12345.iam.gserviceaccount.com",
         project="analytics-prod-12345", default_database="analytics-prod-12345",
         default_schema="marketing_analytics",
         description="Google BigQuery for marketing attribution and campaign analytics",
         is_primary_target=False, last_test_status="success", environment="production"),
    dict(name="Customer 360 (PostgreSQL)", database_type="postgresql",
         account="pg-prod.corp.internal", sf_user="dataguard_ro",
         host="pg-prod.corp.internal", port=5432,
         default_database="customer_360", default_schema="public",
         description="PostgreSQL customer data platform — subscriptions, payments, support",
         is_primary_target=False, last_test_status="success", environment="production"),
    dict(name="Enterprise DW (Redshift)", database_type="redshift",
         account="analytics-cluster.us-east-1.redshift.amazonaws.com",
         sf_user="dataguard_user",
         host="analytics-cluster.us-east-1.redshift.amazonaws.com", port=5439,
         default_database="data_warehouse", default_schema="public",
         description="Amazon Redshift enterprise data warehouse — star schema",
         is_primary_target=False, last_test_status="success", environment="production"),
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
]

# (conn, table, domain, subdomain, criticality, desc, provider, db_name, schema_name)
ASSETS = [
    ("Supply Chain DB","CUSTOMERS","Revenue","Sales","high","Master customer records","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","SALES_ORDERS","Revenue","Sales","high","All sales orders","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","RETURNS","Revenue","Sales","medium","Product return transactions","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","FINANCE_TRANSACTIONS","Finance","General Ledger","critical","GL financial records","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","PURCHASE_ORDERS","Operations","Supply Chain","high","Procurement purchase orders","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","PURCHASE_ORDER_ITEMS","Operations","Supply Chain","medium","PO line-items","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","CARRIERS","Operations","Logistics","medium","Shipping carrier master","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","SUPPLIERS","Operations","Supply Chain","medium","Supplier master data","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","WAREHOUSES","Operations","Fulfillment","medium","Warehouse locations","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","INVENTORY","Operations","Inventory","high","Inventory positions","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","PRODUCTS","Others","Product","medium","Product catalogue","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Supply Chain DB","PRODUCT_CATEGORIES","Others","Product","low","Product category hierarchy","snowflake","SUPPLYCHAIN_DB","SUPPLYCHAIN"),
    ("Marketing Analytics (BigQuery)","campaigns","Marketing","Campaign Management","high","Ad campaign definitions","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Marketing Analytics (BigQuery)","ad_spend","Marketing","Campaign Management","high","Daily ad spend by channel","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Marketing Analytics (BigQuery)","conversions","Marketing","Campaign Management","critical","Conversion events","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Marketing Analytics (BigQuery)","user_events","Marketing","Digital Analytics","high","Clickstream user behaviour events","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Marketing Analytics (BigQuery)","attribution_models","Marketing","Digital Analytics","medium","Multi-touch attribution outputs","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Marketing Analytics (BigQuery)","audience_segments","Marketing","Campaign Management","medium","Audience segment definitions","bigquery","analytics-prod-12345","marketing_analytics"),
    ("Customer 360 (PostgreSQL)","customers","Revenue","Sales","critical","Customer master with contact","postgresql","customer_360","public"),
    ("Customer 360 (PostgreSQL)","subscriptions","Revenue","Sales","high","Active and historical subscriptions","postgresql","customer_360","public"),
    ("Customer 360 (PostgreSQL)","payments","Finance","General Ledger","critical","Payment transactions and refunds","postgresql","customer_360","public"),
    ("Customer 360 (PostgreSQL)","support_tickets","HR","Employee Data","medium","Customer support tickets","postgresql","customer_360","public"),
    ("Customer 360 (PostgreSQL)","nps_scores","HR","Employee Data","low","Net promoter score responses","postgresql","customer_360","public"),
    ("Enterprise DW (Redshift)","fact_sales","Revenue","Sales","critical","Star-schema sales fact table","redshift","data_warehouse","public"),
    ("Enterprise DW (Redshift)","dim_customer","Revenue","Sales","high","Customer dimension — SCD Type 2","redshift","data_warehouse","public"),
    ("Enterprise DW (Redshift)","dim_product","Others","Product","high","Product dimension with hierarchy","redshift","data_warehouse","public"),
    ("Enterprise DW (Redshift)","dim_time","Others","Product","low","Calendar dimension","redshift","data_warehouse","public"),
    ("Enterprise DW (Redshift)","agg_revenue","Finance","General Ledger","critical","Pre-aggregated daily revenue","redshift","data_warehouse","public"),
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
]

COLUMNS = {
    "CUSTOMERS":[("CUSTOMER_ID","VARCHAR",True,False),("EMAIL","VARCHAR",False,False),("FULL_NAME","VARCHAR",False,False),("PHONE","VARCHAR",False,True),("SEGMENT","VARCHAR",False,True),("COUNTRY","VARCHAR",False,True),("CREATED_AT","TIMESTAMP",False,False)],
    "SALES_ORDERS":[("ORDER_ID","VARCHAR",True,False),("CUSTOMER_ID","VARCHAR",False,False),("ORDER_DATE","DATE",False,False),("STATUS","VARCHAR",False,False),("TOTAL_AMOUNT","FLOAT",False,True),("CURRENCY","VARCHAR",False,True)],
    "FINANCE_TRANSACTIONS":[("TXN_ID","VARCHAR",True,False),("ACCOUNT_CODE","VARCHAR",False,False),("TXN_DATE","DATE",False,False),("AMOUNT","FLOAT",False,False),("CURRENCY","VARCHAR",False,False),("LEDGER_TYPE","VARCHAR",False,False)],
    "PURCHASE_ORDERS":[("PO_ID","VARCHAR",True,False),("SUPPLIER_ID","VARCHAR",False,False),("PO_DATE","DATE",False,False),("STATUS","VARCHAR",False,False),("TOTAL_VALUE","FLOAT",False,True)],
    "INVENTORY":[("SKU","VARCHAR",True,False),("WAREHOUSE_ID","VARCHAR",False,False),("QUANTITY","INTEGER",False,False),("REORDER_POINT","INTEGER",False,True),("LAST_UPDATED","TIMESTAMP",False,False)],
    "PRODUCTS":[("PRODUCT_ID","VARCHAR",True,False),("PRODUCT_NAME","VARCHAR",False,False),("CATEGORY_ID","VARCHAR",False,True),("PRICE","FLOAT",False,True),("IS_ACTIVE","BOOLEAN",False,False)],
    "campaigns":[("campaign_id","STRING",True,False),("campaign_name","STRING",False,False),("channel","STRING",False,False),("budget","FLOAT64",False,True),("start_date","DATE",False,False),("status","STRING",False,False)],
    "conversions":[("conversion_id","STRING",True,False),("campaign_id","STRING",False,False),("user_id","STRING",False,False),("event_type","STRING",False,False),("value","FLOAT64",False,True),("converted_at","TIMESTAMP",False,False)],
    "user_events":[("event_id","STRING",True,False),("user_id","STRING",False,True),("session_id","STRING",False,True),("event_name","STRING",False,False),("page_url","STRING",False,True),("occurred_at","TIMESTAMP",False,False)],
    "customers":[("customer_id","SERIAL",True,False),("email","VARCHAR",False,False),("first_name","VARCHAR",False,False),("last_name","VARCHAR",False,False),("created_at","TIMESTAMP",False,False),("is_active","BOOLEAN",False,False),("country_code","CHAR",False,True)],
    "subscriptions":[("subscription_id","SERIAL",True,False),("customer_id","INTEGER",False,False),("plan","VARCHAR",False,False),("status","VARCHAR",False,False),("started_at","TIMESTAMP",False,False),("cancelled_at","TIMESTAMP",False,True),("mrr","NUMERIC",False,True)],
    "payments":[("payment_id","SERIAL",True,False),("customer_id","INTEGER",False,False),("amount","NUMERIC",False,False),("currency","CHAR",False,False),("status","VARCHAR",False,False),("paid_at","TIMESTAMP",False,True),("gateway","VARCHAR",False,True)],
    "support_tickets":[("ticket_id","SERIAL",True,False),("customer_id","INTEGER",False,False),("subject","VARCHAR",False,False),("status","VARCHAR",False,False),("priority","VARCHAR",False,False),("created_at","TIMESTAMP",False,False)],
    "fact_sales":[("sale_id","BIGINT",True,False),("customer_key","INTEGER",False,False),("product_key","INTEGER",False,False),("time_key","INTEGER",False,False),("quantity","INTEGER",False,False),("unit_price","DECIMAL",False,False),("net_revenue","DECIMAL",False,False)],
    "dim_customer":[("customer_key","INTEGER",True,False),("customer_id","VARCHAR",False,False),("email","VARCHAR",False,False),("segment","VARCHAR",False,True),("valid_from","DATE",False,False),("valid_to","DATE",False,True),("is_current","BOOLEAN",False,False)],
    "agg_revenue":[("agg_date","DATE",True,False),("segment","VARCHAR",True,False),("channel","VARCHAR",True,False),("gross_revenue","DECIMAL",False,False),("net_revenue","DECIMAL",False,False),("refunds","DECIMAL",False,True),("updated_at","TIMESTAMP",False,False)],
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
}

# (rule_name, rule_type, column, severity, dimension)
RULES = {
    "CUSTOMERS":[("Customer Email Not Null","null_check","EMAIL","critical","completeness"),("Email Format Valid","regex_check","EMAIL","high","validity"),("No Duplicate Customer IDs","uniqueness_check","CUSTOMER_ID","critical","uniqueness"),("Segment Valid Values","accepted_values_check","SEGMENT","medium","validity")],
    "SALES_ORDERS":[("Order Total Positive","range_check","TOTAL_AMOUNT","high","validity"),("Status Valid Values","accepted_values_check","STATUS","high","validity"),("No Orphan Orders","referential_integrity_check","CUSTOMER_ID","critical","consistency")],
    "RETURNS":[("Return Amount Not Negative","range_check","AMOUNT","high","validity"),("Return Date Freshness","freshness_check","RETURN_DATE","medium","timeliness")],
    "FINANCE_TRANSACTIONS":[("GL Amount Not Zero","range_check","AMOUNT","critical","validity"),("Currency Code Valid","regex_check","CURRENCY","high","validity"),("No Duplicate TXN IDs","uniqueness_check","TXN_ID","critical","uniqueness"),("TXN Date Freshness","freshness_check","TXN_DATE","high","timeliness")],
    "PURCHASE_ORDERS":[("PO Amount Positive","range_check","TOTAL_VALUE","high","validity"),("Status Valid","accepted_values_check","STATUS","medium","validity"),("Supplier Ref Valid","referential_integrity_check","SUPPLIER_ID","high","consistency")],
    "PURCHASE_ORDER_ITEMS":[("Item Quantity Positive","range_check","QUANTITY","high","validity"),("Unit Price Not Null","null_check","UNIT_PRICE","medium","completeness")],
    "INVENTORY":[("Quantity Not Negative","range_check","QUANTITY","high","validity"),("SKU Uniqueness","uniqueness_check","SKU","critical","uniqueness"),("Last Updated Freshness","freshness_check","LAST_UPDATED","medium","timeliness")],
    "PRODUCTS":[("Product Name Not Null","null_check","PRODUCT_NAME","high","completeness"),("Price Positive","range_check","PRICE","medium","validity")],
    "PRODUCT_CATEGORIES":[("Category Name Not Null","null_check","CATEGORY_NAME","medium","completeness")],
    "SUPPLIERS":[("Supplier Name Not Null","null_check","SUPPLIER_NAME","high","completeness"),("Email Format Valid","regex_check","EMAIL","medium","validity")],
    "CARRIERS":[("Carrier Code Unique","uniqueness_check","CARRIER_CODE","high","uniqueness")],
    "WAREHOUSES":[("Warehouse Name Not Null","null_check","WAREHOUSE_NAME","medium","completeness")],
    "campaigns":[("Budget Positive","range_check","budget","high","validity"),("Status Valid","accepted_values_check","status","medium","validity"),("Campaign Name Not Null","null_check","campaign_name","high","completeness")],
    "ad_spend":[("Spend Amount Positive","range_check","spend_amount","high","validity"),("Spend Date Freshness","freshness_check","spend_date","high","timeliness")],
    "conversions":[("Conversion Value Positive","range_check","value","high","validity"),("Campaign Ref Valid","referential_integrity_check","campaign_id","critical","consistency"),("Conversion Freshness","freshness_check","converted_at","high","timeliness")],
    "user_events":[("Event Name Not Null","null_check","event_name","high","completeness"),("No Duplicate Events","uniqueness_check","event_id","medium","uniqueness"),("Event Freshness","freshness_check","occurred_at","medium","timeliness")],
    "attribution_models":[("Attribution Value Not Null","null_check","attribution_value","medium","completeness")],
    "audience_segments":[("Segment Size Positive","range_check","segment_size","medium","validity"),("Segment Name Not Null","null_check","segment_name","medium","completeness")],
    "customers":[("Email Not Null","null_check","email","critical","completeness"),("Email Format","regex_check","email","high","validity"),("Customer ID Unique","uniqueness_check","customer_id","critical","uniqueness"),("Country Code Valid","regex_check","country_code","medium","validity")],
    "subscriptions":[("MRR Not Negative","range_check","mrr","high","validity"),("Status Valid","accepted_values_check","status","high","validity"),("Customer Ref Valid","referential_integrity_check","customer_id","critical","consistency")],
    "payments":[("Payment Amount Positive","range_check","amount","critical","validity"),("Currency Valid","regex_check","currency","high","validity"),("No Duplicate Payment IDs","uniqueness_check","payment_id","critical","uniqueness"),("Payment Freshness","freshness_check","paid_at","medium","timeliness")],
    "support_tickets":[("Subject Not Null","null_check","subject","medium","completeness"),("Status Valid","accepted_values_check","status","medium","validity")],
    "nps_scores":[("Score In Range","range_check","score","medium","validity"),("Respondent Not Null","null_check","respondent_email","medium","completeness")],
    "fact_sales":[("Net Revenue Not Negative","range_check","net_revenue","critical","validity"),("Quantity Positive","range_check","quantity","high","validity"),("Customer Key Not Null","null_check","customer_key","critical","completeness"),("Sales Freshness","freshness_check","time_key","high","timeliness")],
    "dim_customer":[("Email Not Null","null_check","email","high","completeness"),("SCD Validity","business_rule_check","valid_to","medium","validity"),("Is Current Not Null","null_check","is_current","high","completeness")],
    "dim_product":[("Product Name Not Null","null_check","product_name","high","completeness"),("Price Positive","range_check","price","medium","validity")],
    "dim_time":[("Date Not Null","null_check","full_date","low","completeness")],
    "agg_revenue":[("Revenue Not Negative","range_check","net_revenue","critical","validity"),("Agg Freshness","freshness_check","agg_date","critical","timeliness"),("No Duplicate Agg Keys","uniqueness_check","agg_date","high","uniqueness")],
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
}

BASE_SCORES = {
    "CUSTOMERS":96.5,"SALES_ORDERS":94.0,"RETURNS":91.0,"FINANCE_TRANSACTIONS":98.5,
    "PURCHASE_ORDERS":93.0,"PURCHASE_ORDER_ITEMS":89.5,"CARRIERS":97.0,"SUPPLIERS":92.0,
    "WAREHOUSES":99.0,"INVENTORY":88.0,"PRODUCTS":95.0,"PRODUCT_CATEGORIES":99.5,
    "campaigns":97.0,"ad_spend":96.0,"conversions":94.5,"user_events":91.0,
    "attribution_models":88.5,"audience_segments":93.0,
    "customers":98.0,"subscriptions":95.5,"payments":99.0,"support_tickets":87.0,"nps_scores":92.0,
    "fact_sales":97.5,"dim_customer":96.0,"dim_product":98.0,"dim_time":100.0,"agg_revenue":95.0,
    "GL_ACCOUNTS":98.0,"JOURNAL_ENTRIES":96.5,"AP_INVOICES":94.0,"AR_INVOICES":93.5,
    "COST_CENTERS":99.0,"BUDGET_LINES":91.0,
    "WORK_ORDERS":92.5,"BOM_HEADERS":97.0,"BOM_COMPONENTS":95.5,
    "PRODUCTION_RUNS":89.0,"QUALITY_INSPECTIONS":94.5,"MACHINE_DOWNTIME":96.0,
}

TAGS_CATALOGUE = [
    ("PII","#ef4444","Contains personally identifiable information"),
    ("Critical","#f97316","Business-critical data asset"),
    ("Finance","#8b5cf6","Financial / accounting data"),
    ("Marketing","#06b6d4","Marketing and campaign data"),
    ("Operational","#10b981","Operational supply chain data"),
    ("SCD Type 2","#6366f1","Slowly changing dimension — Type 2"),
    ("Star Schema","#f59e0b","Part of a star/snowflake schema"),
    ("Regulated","#dc2626","Subject to regulatory compliance"),
    ("AI Ready","#22c55e","Validated for AI/ML model training"),
    ("External","#64748b","Data sourced from an external system"),
]

TAG_ASSET_MAP = {
    "PII":["CUSTOMERS","customers","dim_customer","user_events"],
    "Critical":["FINANCE_TRANSACTIONS","payments","fact_sales","agg_revenue","conversions"],
    "Finance":["FINANCE_TRANSACTIONS","payments","fact_sales","agg_revenue"],
    "Marketing":["campaigns","ad_spend","conversions","user_events","attribution_models","audience_segments"],
    "Operational":["INVENTORY","PURCHASE_ORDERS","PURCHASE_ORDER_ITEMS","WAREHOUSES","SUPPLIERS","CARRIERS"],
    "SCD Type 2":["dim_customer"],
    "Star Schema":["fact_sales","dim_customer","dim_product","dim_time","agg_revenue"],
    "Regulated":["FINANCE_TRANSACTIONS","payments","customers","CUSTOMERS"],
    "AI Ready":["user_events","conversions","attribution_models"],
}

# ── multi-level lineage views ─────────────────────────────────────────────────
# Each entry is (name, conn, db, schema, provider, domain, subdomain, criticality, desc, cols, sql)
# cols: list of (col_name, data_type, is_pk, is_nullable)
# sql:  SELECT body — sqlglot parses it to extract upstream table refs → lineage edges

VIEW_CATALOGUE = [
    # ════ Supply Chain DB (Snowflake) — 4-hop lineage depth ══════════════════
    # Level 1: two base-table joins
    (
        "VW_CUSTOMER_ORDERS","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Revenue","Sales","high",
        "Level-1 view: customers joined with their sales orders",
        [("CUSTOMER_ID","VARCHAR",False,False),("EMAIL","VARCHAR",False,False),
         ("FULL_NAME","VARCHAR",False,False),("SEGMENT","VARCHAR",False,False),
         ("COUNTRY","VARCHAR",False,False),("ORDER_ID","VARCHAR",False,False),
         ("ORDER_DATE","DATE",False,False),("ORDER_STATUS","VARCHAR",False,False),
         ("TOTAL_AMOUNT","FLOAT",False,False),("CURRENCY","VARCHAR",False,False)],
        ("SELECT c.CUSTOMER_ID, c.EMAIL, c.FULL_NAME, c.SEGMENT, c.COUNTRY,\n"
         "  o.ORDER_ID, o.ORDER_DATE, o.STATUS AS ORDER_STATUS,\n"
         "  o.TOTAL_AMOUNT, o.CURRENCY\n"
         "FROM CUSTOMERS c\n"
         "INNER JOIN SALES_ORDERS o ON c.CUSTOMER_ID = o.CUSTOMER_ID"),
    ),
    (
        "VW_SUPPLIER_PROCUREMENT","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Operations","Supply Chain","medium",
        "Level-1 view: suppliers with purchase orders and line items",
        [("SUPPLIER_ID","VARCHAR",False,False),("SUPPLIER_NAME","VARCHAR",False,False),
         ("PO_ID","VARCHAR",False,False),("PO_DATE","DATE",False,False),
         ("PO_STATUS","VARCHAR",False,False),("TOTAL_VALUE","FLOAT",False,False),
         ("LINE_QUANTITY","INTEGER",False,False),("UNIT_PRICE","FLOAT",False,False)],
        ("SELECT s.SUPPLIER_ID, s.SUPPLIER_NAME, p.PO_ID, p.PO_DATE,\n"
         "  p.STATUS AS PO_STATUS, p.TOTAL_VALUE,\n"
         "  pi.QUANTITY AS LINE_QUANTITY, pi.UNIT_PRICE\n"
         "FROM SUPPLIERS s\n"
         "INNER JOIN PURCHASE_ORDERS p ON s.SUPPLIER_ID = p.SUPPLIER_ID\n"
         "INNER JOIN PURCHASE_ORDER_ITEMS pi ON p.PO_ID = pi.PO_ID"),
    ),
    # Level 2: views that reference Level-1 views
    (
        "VW_FINANCIAL_RECONCILIATION","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Finance","General Ledger","critical",
        "Level-2 view: order revenue reconciled against GL transactions and returns",
        [("CUSTOMER_ID","VARCHAR",False,False),("FULL_NAME","VARCHAR",False,False),
         ("SEGMENT","VARCHAR",False,False),("ORDER_ID","VARCHAR",False,False),
         ("ORDER_DATE","DATE",False,False),("ORDER_AMOUNT","FLOAT",False,False),
         ("GL_AMOUNT","FLOAT",False,True),("LEDGER_TYPE","VARCHAR",False,True),
         ("RETURN_AMOUNT","FLOAT",False,True),("RETURN_DATE","DATE",False,True)],
        ("SELECT co.CUSTOMER_ID, co.FULL_NAME, co.SEGMENT, co.ORDER_ID, co.ORDER_DATE,\n"
         "  co.TOTAL_AMOUNT AS ORDER_AMOUNT,\n"
         "  ft.AMOUNT AS GL_AMOUNT, ft.LEDGER_TYPE,\n"
         "  r.AMOUNT AS RETURN_AMOUNT, r.RETURN_DATE\n"
         "FROM VW_CUSTOMER_ORDERS co\n"
         "LEFT JOIN FINANCE_TRANSACTIONS ft ON co.CUSTOMER_ID = ft.ACCOUNT_CODE\n"
         "LEFT JOIN RETURNS r ON co.ORDER_ID = r.ORDER_ID"),
    ),
    (
        "VW_SUPPLY_CHAIN_OPS","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Operations","Supply Chain","high",
        "Level-2 view: procurement enriched with live inventory and warehouse positions",
        [("SUPPLIER_ID","VARCHAR",False,False),("SUPPLIER_NAME","VARCHAR",False,False),
         ("PO_ID","VARCHAR",False,False),("PO_DATE","DATE",False,False),
         ("PO_VALUE","FLOAT",False,False),("LINE_QUANTITY","INTEGER",False,False),
         ("SKU","VARCHAR",False,False),("STOCK_QTY","INTEGER",False,False),
         ("REORDER_POINT","INTEGER",False,False),("WAREHOUSE_ID","VARCHAR",False,False)],
        ("SELECT sp.SUPPLIER_ID, sp.SUPPLIER_NAME, sp.PO_ID, sp.PO_DATE,\n"
         "  sp.TOTAL_VALUE AS PO_VALUE, sp.LINE_QUANTITY,\n"
         "  i.SKU, i.QUANTITY AS STOCK_QTY, i.REORDER_POINT, w.WAREHOUSE_ID\n"
         "FROM VW_SUPPLIER_PROCUREMENT sp\n"
         "LEFT JOIN INVENTORY i ON sp.SUPPLIER_ID = i.WAREHOUSE_ID\n"
         "LEFT JOIN WAREHOUSES w ON i.WAREHOUSE_ID = w.WAREHOUSE_ID"),
    ),
    # Level 3: aggregation view referencing a Level-2 view
    (
        "VW_REVENUE_ANALYTICS","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Finance","General Ledger","critical",
        "Level-3 view: revenue aggregated by segment and date with GL verification",
        [("SEGMENT","VARCHAR",False,False),("ORDER_DATE","DATE",False,False),
         ("ORDER_COUNT","INTEGER",False,False),("GROSS_REVENUE","FLOAT",False,False),
         ("TOTAL_RETURNS","FLOAT",False,False),("NET_REVENUE","FLOAT",False,False),
         ("GL_VERIFIED_REVENUE","FLOAT",False,False)],
        ("SELECT fr.SEGMENT, fr.ORDER_DATE,\n"
         "  COUNT(fr.ORDER_ID) AS ORDER_COUNT,\n"
         "  SUM(fr.ORDER_AMOUNT) AS GROSS_REVENUE,\n"
         "  SUM(COALESCE(fr.RETURN_AMOUNT, 0)) AS TOTAL_RETURNS,\n"
         "  SUM(fr.ORDER_AMOUNT) - SUM(COALESCE(fr.RETURN_AMOUNT, 0)) AS NET_REVENUE,\n"
         "  SUM(COALESCE(fr.GL_AMOUNT, 0)) AS GL_VERIFIED_REVENUE\n"
         "FROM VW_FINANCIAL_RECONCILIATION fr\n"
         "GROUP BY fr.SEGMENT, fr.ORDER_DATE"),
    ),
    # Level 4: final executive view joining two Level-3/2 views
    (
        "VW_EXECUTIVE_KPI","Supply Chain DB",
        "SUPPLYCHAIN_DB","SUPPLYCHAIN","snowflake",
        "Finance","General Ledger","critical",
        "Level-4 view: executive KPI combining revenue analytics with supply chain ops",
        [("REPORT_DATE","DATE",False,False),("SEGMENT","VARCHAR",False,False),
         ("NET_REVENUE","FLOAT",False,False),("ORDER_COUNT","INTEGER",False,False),
         ("GL_VERIFIED_REVENUE","FLOAT",False,False),("PO_ID","VARCHAR",False,True),
         ("PO_VALUE","FLOAT",False,True),("STOCK_QTY","INTEGER",False,True)],
        ("SELECT ra.SEGMENT, ra.ORDER_DATE AS REPORT_DATE,\n"
         "  ra.NET_REVENUE, ra.ORDER_COUNT, ra.GL_VERIFIED_REVENUE,\n"
         "  sc.PO_ID, sc.PO_VALUE, sc.STOCK_QTY\n"
         "FROM VW_REVENUE_ANALYTICS ra\n"
         "LEFT JOIN VW_SUPPLY_CHAIN_OPS sc ON ra.ORDER_DATE = sc.PO_DATE"),
    ),
    # ════ Marketing Analytics (BigQuery) — 3-hop lineage depth ════════════════
    (
        "vw_campaign_metrics","Marketing Analytics (BigQuery)",
        "analytics-prod-12345","marketing_analytics","bigquery",
        "Marketing","Campaign Management","high",
        "Level-1 view: campaign definitions with ad spend and conversion totals",
        [("campaign_id","STRING",False,False),("campaign_name","STRING",False,False),
         ("channel","STRING",False,False),("budget","FLOAT64",False,False),
         ("spend_amount","FLOAT64",False,True),("conversion_count","INTEGER",False,False),
         ("total_value","FLOAT64",False,True)],
        ("SELECT c.campaign_id, c.campaign_name, c.channel, c.budget, c.status,\n"
         "  s.spend_amount, s.spend_date,\n"
         "  COUNT(cv.conversion_id) AS conversion_count,\n"
         "  SUM(cv.value) AS total_value\n"
         "FROM campaigns c\n"
         "LEFT JOIN ad_spend s ON c.campaign_id = s.campaign_id\n"
         "LEFT JOIN conversions cv ON c.campaign_id = cv.campaign_id\n"
         "GROUP BY c.campaign_id, c.campaign_name, c.channel, c.budget,\n"
         "         c.status, s.spend_amount, s.spend_date"),
    ),
    (
        "vw_attribution_report","Marketing Analytics (BigQuery)",
        "analytics-prod-12345","marketing_analytics","bigquery",
        "Marketing","Digital Analytics","high",
        "Level-2 view: multi-touch attribution joining campaign metrics with user events",
        [("campaign_id","STRING",False,False),("channel","STRING",False,False),
         ("user_id","STRING",False,True),("event_name","STRING",False,False),
         ("attribution_value","FLOAT64",False,True),("roi","FLOAT64",False,True)],
        ("SELECT cm.campaign_id, cm.campaign_name, cm.channel,\n"
         "  ue.user_id, ue.event_name, ue.occurred_at,\n"
         "  am.attribution_value,\n"
         "  cm.total_value / NULLIF(cm.spend_amount, 0) AS roi\n"
         "FROM vw_campaign_metrics cm\n"
         "LEFT JOIN user_events ue ON cm.campaign_id = ue.session_id\n"
         "LEFT JOIN attribution_models am ON cm.campaign_id = am.campaign_id"),
    ),
    (
        "vw_marketing_executive","Marketing Analytics (BigQuery)",
        "analytics-prod-12345","marketing_analytics","bigquery",
        "Marketing","Campaign Management","high",
        "Level-3 view: executive marketing summary across channels and audience segments",
        [("channel","STRING",False,False),("segment_name","STRING",False,False),
         ("total_spend","FLOAT64",False,False),("total_conversions","INTEGER",False,False),
         ("avg_roi","FLOAT64",False,True)],
        ("SELECT ar.channel, seg.segment_name,\n"
         "  SUM(ar.spend_amount) AS total_spend,\n"
         "  COUNT(ar.user_id) AS total_conversions,\n"
         "  AVG(ar.roi) AS avg_roi\n"
         "FROM vw_attribution_report ar\n"
         "LEFT JOIN audience_segments seg ON ar.campaign_id = seg.campaign_id\n"
         "GROUP BY ar.channel, seg.segment_name"),
    ),
    # ════ Customer 360 (PostgreSQL) — 3-hop lineage depth ════════════════════
    (
        "vw_customer_revenue","Customer 360 (PostgreSQL)",
        "customer_360","public","postgresql",
        "Revenue","Sales","high",
        "Level-1 view: customer profiles enriched with subscription and payment history",
        [("customer_id","INTEGER",False,False),("email","VARCHAR",False,False),
         ("plan","VARCHAR",False,True),("sub_status","VARCHAR",False,True),
         ("mrr","NUMERIC",False,True),("total_paid","NUMERIC",False,True),
         ("is_active","BOOLEAN",False,False)],
        ("SELECT c.customer_id, c.email, c.first_name, c.last_name,\n"
         "  s.plan, s.status AS sub_status, s.mrr,\n"
         "  SUM(p.amount) AS total_paid, c.is_active\n"
         "FROM customers c\n"
         "LEFT JOIN subscriptions s ON c.customer_id = s.customer_id\n"
         "LEFT JOIN payments p ON c.customer_id = p.customer_id\n"
         "GROUP BY c.customer_id, c.email, c.first_name, c.last_name,\n"
         "         s.plan, s.status, s.mrr, c.is_active"),
    ),
    (
        "vw_customer_health","Customer 360 (PostgreSQL)",
        "customer_360","public","postgresql",
        "Revenue","Sales","high",
        "Level-2 view: customer health score combining revenue, support load and NPS",
        [("customer_id","INTEGER",False,False),("email","VARCHAR",False,False),
         ("mrr","NUMERIC",False,True),("open_tickets","INTEGER",False,False),
         ("avg_nps","FLOAT",False,True),("health_tier","VARCHAR",False,False)],
        ("SELECT cr.customer_id, cr.email, cr.plan, cr.mrr,\n"
         "  COUNT(st.ticket_id) AS open_tickets,\n"
         "  AVG(ns.score) AS avg_nps,\n"
         "  CASE WHEN cr.mrr > 500 AND COUNT(st.ticket_id) < 2 THEN 'healthy'\n"
         "       WHEN cr.mrr > 0 THEN 'at_risk'\n"
         "       ELSE 'churned' END AS health_tier\n"
         "FROM vw_customer_revenue cr\n"
         "LEFT JOIN support_tickets st ON cr.customer_id = st.customer_id\n"
         "LEFT JOIN nps_scores ns ON cr.customer_id = ns.customer_id\n"
         "GROUP BY cr.customer_id, cr.email, cr.plan, cr.mrr"),
    ),
    (
        "vw_retention_analysis","Customer 360 (PostgreSQL)",
        "customer_360","public","postgresql",
        "Revenue","Sales","medium",
        "Level-3 view: retention cohort analysis summarized by health tier",
        [("health_tier","VARCHAR",False,False),("customer_count","INTEGER",False,False),
         ("total_mrr","NUMERIC",False,False),("avg_nps","FLOAT",False,True),
         ("avg_open_tickets","FLOAT",False,True)],
        ("SELECT ch.health_tier,\n"
         "  COUNT(ch.customer_id) AS customer_count,\n"
         "  SUM(ch.mrr) AS total_mrr,\n"
         "  AVG(ch.avg_nps) AS avg_nps,\n"
         "  AVG(ch.open_tickets) AS avg_open_tickets\n"
         "FROM vw_customer_health ch\n"
         "GROUP BY ch.health_tier"),
    ),
    # ════ Enterprise DW (Redshift) — 3-hop lineage depth ══════════════════════
    (
        "vw_dw_sales_detail","Enterprise DW (Redshift)",
        "data_warehouse","public","redshift",
        "Revenue","Sales","high",
        "Level-1 view: granular sales data joining fact table with customer and product dimensions",
        [("sale_id","BIGINT",False,False),("email","VARCHAR",False,False),
         ("segment","VARCHAR",False,True),("product_name","VARCHAR",False,False),
         ("quantity","INTEGER",False,False),("unit_price","DECIMAL",False,False),
         ("net_revenue","DECIMAL",False,False)],
        ("SELECT fs.sale_id, dc.email, dc.segment, dp.product_name,\n"
         "  fs.quantity, fs.unit_price, fs.net_revenue\n"
         "FROM fact_sales fs\n"
         "INNER JOIN dim_customer dc ON fs.customer_key = dc.customer_key\n"
         "INNER JOIN dim_product dp ON fs.product_key = dp.product_key"),
    ),
    (
        "vw_dw_revenue_report","Enterprise DW (Redshift)",
        "data_warehouse","public","redshift",
        "Finance","General Ledger","critical",
        "Level-2 view: revenue reconciliation across detail and pre-aggregated sources",
        [("report_date","DATE",False,False),("segment","VARCHAR",False,False),
         ("channel","VARCHAR",False,True),("detail_revenue","DECIMAL",False,False),
         ("agg_net_revenue","DECIMAL",False,True),("variance","DECIMAL",False,True)],
        ("SELECT dt.full_date AS report_date, sd.segment, ar.channel,\n"
         "  SUM(sd.net_revenue) AS detail_revenue,\n"
         "  ar.net_revenue AS agg_net_revenue,\n"
         "  SUM(sd.net_revenue) - ar.net_revenue AS variance\n"
         "FROM vw_dw_sales_detail sd\n"
         "INNER JOIN dim_time dt ON sd.sale_id = dt.time_key\n"
         "LEFT JOIN agg_revenue ar ON dt.full_date = ar.agg_date AND sd.segment = ar.segment\n"
         "GROUP BY dt.full_date, sd.segment, ar.channel, ar.net_revenue"),
    ),
    (
        "vw_dw_executive_summary","Enterprise DW (Redshift)",
        "data_warehouse","public","redshift",
        "Finance","General Ledger","critical",
        "Level-3 view: executive C-suite revenue summary derived from the revenue report",
        [("report_date","DATE",False,False),("segment","VARCHAR",False,False),
         ("total_revenue","DECIMAL",False,False),("revenue_variance_pct","FLOAT",False,True),
         ("reconciled","INTEGER",False,False)],
        ("SELECT report_date, segment,\n"
         "  SUM(detail_revenue) AS total_revenue,\n"
         "  AVG(CASE WHEN agg_net_revenue > 0\n"
         "           THEN (detail_revenue - agg_net_revenue) / agg_net_revenue * 100\n"
         "           ELSE NULL END) AS revenue_variance_pct,\n"
         "  MIN(CASE WHEN ABS(variance) < 100 THEN 1 ELSE 0 END) AS reconciled\n"
         "FROM vw_dw_revenue_report\n"
         "GROUP BY report_date, segment"),
    ),
]


# ── step 2c: views with lineage SQL ────────────────────────────────────────────

async def seed_views_and_lineage(db, conn_map, domain_map, subdomain_map):
    existing = {r.sf_table_name.lower()
                for r in (await db.execute(
                    select(AssetSourceMeta).where(AssetSourceMeta.sf_table_type == "VIEW")
                )).scalars().all()}

    count = 0
    col_rows = []
    for (name, conn_name, db_name, schema_name, provider,
         dname, sname, crit, desc, cols, sql) in VIEW_CATALOGUE:
        if name.lower() in existing:
            continue
        conn = conn_map.get(conn_name)
        sub = await ensure_subdomain(db, domain_map, subdomain_map, dname, sname)
        domain = domain_map.get(dname)
        asset_id = uid()

        a = Asset(
            asset_id=asset_id,
            domain_id=domain.domain_id if domain else None,
            subdomain_id=sub.subdomain_id if sub else None,
            connection_id=conn.connection_id if conn else None,
            asset_type="view",
            physical_name=name,
            display_name=name.replace("_", " ").title(),
            qualified_name=f"{db_name}.{schema_name}.{name}",
            description=desc, criticality=crit,
            certification_status="certified", certified_by="admin@example.com",
            owner_name=f"{dname} Team",
            owner_email=f"{dname.lower().replace(' ','')}@example.com",
            status="active", is_active=True,
            created_at=days_ago(60), updated_at=utcnow(),
        )
        await af(db, a)  # flush before meta to satisfy FK

        await af(db, AssetSourceMeta(  # partition_info VARIANT — one at a time
            asset_id=asset_id, provider=provider,
            sf_account=conn.account if conn else None,
            sf_database_name=db_name, sf_schema_name=schema_name,
            sf_table_name=name, sf_table_type="VIEW",
            generic_database_name=db_name, generic_schema_name=schema_name,
            generic_object_name=name, generic_object_type="view",
            view_definition=sql,
            created_at=utcnow(), updated_at=utcnow(),
        ))

        for pos, (cn, ct, pk, nullable) in enumerate(cols, 1):
            col_rows.append(ColumnMetadata(
                col_id=uid(), asset_id=asset_id, column_name=cn, data_type=ct,
                is_primary_key=pk, is_nullable=nullable, ordinal_position=pos,
                updated_at=utcnow(),
            ))
        count += 1

    await batch(db, col_rows)  # no JSON
    print(f"  Views: {count} new ({len(col_rows)} columns)", flush=True)


# ── helpers ────────────────────────────────────────────────────────────────────

async def load_domains(db):
    return {d.domain_name: d for d in (await db.execute(select(Domain))).scalars().all()}

async def load_subdomains(db, domain_map):
    subs = (await db.execute(select(Subdomain))).scalars().all()
    return {(d.domain_name, s.subdomain_name): s
            for d in domain_map.values() for s in subs if s.domain_id == d.domain_id}

async def ensure_domain(db, domain_map, name):
    if name not in domain_map:
        d = Domain(domain_id=uid(), domain_name=name, description=f"{name} domain",
                   is_active=True, created_at=utcnow(), updated_at=utcnow())
        await af(db, d); domain_map[name] = d
    return domain_map[name]

async def ensure_subdomain(db, domain_map, subdomain_map, dname, sname):
    if (dname, sname) not in subdomain_map:
        d = await ensure_domain(db, domain_map, dname)
        s = Subdomain(subdomain_id=uid(), domain_id=d.domain_id, subdomain_name=sname,
                      description=sname, is_active=True, created_at=utcnow(), updated_at=utcnow())
        await af(db, s); subdomain_map[(dname, sname)] = s
    return subdomain_map[(dname, sname)]


# ── step 1: connections ────────────────────────────────────────────────────────

async def seed_connections(db):
    existing = {r.connection_name: r for r in (await db.execute(select(SnowflakeConnection))).scalars().all()}
    count = 0
    for spec in CONNECTIONS:
        if spec["name"] in existing: continue
        c = SnowflakeConnection(
            connection_id=uid(), connection_name=spec["name"], database_type=spec["database_type"],
            account=spec["account"], sf_user=spec["sf_user"],
            warehouse=spec.get("warehouse",""), role=spec.get("role"),
            default_database=spec.get("default_database"), default_schema=spec.get("default_schema"),
            host=spec.get("host"), port=spec.get("port"), project=spec.get("project"),
            description=spec["description"], is_active=True,
            is_primary_target=spec.get("is_primary_target", False), connection_type="named",
            last_test_status=spec.get("last_test_status"), environment=spec.get("environment"),
            created_at=utcnow(), updated_at=utcnow(),
        )
        await af(db, c)  # JSON columns — one at a time
        existing[spec["name"]] = c; count += 1
    print(f"  Connections: {len(existing)} total, {count} new", flush=True)
    return existing


# ── step 1b: source assets (one per connection — tree root nodes) ──────────────

async def seed_source_assets(db, conn_map):
    """Create one asset_type='source' per connection — required by /tree endpoint."""
    existing = {r.connection_id
                for r in (await db.execute(
                    select(Asset).where(Asset.asset_type == "source")
                )).scalars().all()}
    new_sources = []
    for conn in conn_map.values():
        if conn.connection_id in existing:
            continue
        new_sources.append(Asset(
            asset_id=uid(), connection_id=conn.connection_id,
            asset_type="source",
            physical_name=conn.connection_name,
            display_name=conn.connection_name,
            qualified_name=f"source:{conn.connection_id}",
            description=conn.description,
            status="active", is_active=True,
            created_at=days_ago(90), updated_at=utcnow(),
        ))
    await batch(db, new_sources)  # no JSON
    print(f"  Source assets: {len(new_sources)} new", flush=True)


# ── step 2: assets ─────────────────────────────────────────────────────────────

async def seed_assets(db, conn_map, domain_map, subdomain_map):
    existing_rows = (await db.execute(
        select(Asset, AssetSourceMeta)
        .join(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
    )).all()
    existing = {(r.AssetSourceMeta.sf_database_name, r.AssetSourceMeta.sf_table_name): r.Asset
                for r in existing_rows}

    asset_map: dict[str, Asset] = {}
    new_assets, new_metas, new_owners = [], [], []
    count = 0
    for (conn_name, table, dname, sname, crit, desc, provider, db_name, schema_name) in ASSETS:
        key = (db_name, table)
        if key in existing: asset_map[table] = existing[key]; continue
        conn = conn_map.get(conn_name)
        sub = await ensure_subdomain(db, domain_map, subdomain_map, dname, sname)
        domain = domain_map[dname]
        asset_id = uid()
        a = Asset(
            asset_id=asset_id, domain_id=domain.domain_id, subdomain_id=sub.subdomain_id,
            connection_id=conn.connection_id if conn else None,
            description=desc, criticality=crit, certification_status="certified",
            certified_by="admin@example.com", owner_name=f"{dname} Team",
            owner_email=f"{dname.lower().replace(' ','')}@example.com",
            asset_type="table", physical_name=table,
            display_name=table.replace("_"," ").title(),
            qualified_name=f"{db_name}.{schema_name}.{table}",
            status="active", is_active=True, created_at=days_ago(90), updated_at=utcnow(),
        )
        new_assets.append(a)
        new_metas.append(AssetSourceMeta(
            asset_id=asset_id, provider=provider,
            sf_account=conn.account if conn else None,
            sf_database_name=db_name, sf_schema_name=schema_name, sf_table_name=table,
            sf_table_type="TABLE", generic_database_name=db_name,
            generic_schema_name=schema_name, generic_object_name=table,
            generic_object_type="table", created_at=utcnow(), updated_at=utcnow(),
        ))
        new_owners.append(AssetOwner(
            owner_id=uid(), asset_id=asset_id, owner_type="owner",
            name=f"{dname} Team",
            email=f"{dname.lower().replace(' ','')}@example.com",
            created_at=utcnow(),
        ))
        asset_map[table] = a; count += 1

    await batch(db, new_assets)                   # no JSON
    for m in new_metas: await af(db, m)          # partition_info VARIANT
    await batch(db, new_owners)                   # no JSON
    print(f"  Assets: {len(asset_map)} total, {count} new", flush=True)
    return asset_map


# ── step 3: column metadata ────────────────────────────────────────────────────

async def seed_columns(db, asset_map):
    existing = {(r.asset_id, r.column_name)
                for r in (await db.execute(select(ColumnMetadata))).scalars().all()}
    rows = []
    for table, cols in COLUMNS.items():
        asset = asset_map.get(table)
        if not asset: continue
        for pos, (cn, ct, pk, nullable) in enumerate(cols, 1):
            if (asset.asset_id, cn) in existing: continue
            rows.append(ColumnMetadata(
                col_id=uid(), asset_id=asset.asset_id, column_name=cn, data_type=ct,
                is_primary_key=pk, is_nullable=nullable, ordinal_position=pos,
                null_count=_rng.randint(0,100) if nullable else 0,
                unique_count=_rng.randint(1000,50000),
                last_profiled_at=days_ago(_rng.randint(1,7)), updated_at=utcnow(),
            ))
    await batch(db, rows)  # no JSON
    print(f"  Column metadata: {len(rows)} new", flush=True)


# ── step 3b: profiling results ─────────────────────────────────────────────────

_NUMERIC_TYPES = ("INT","BIGINT","NUMERIC","FLOAT","DECIMAL","NUMBER","MONEY","DOUBLE")
_DATE_TYPES    = ("DATE","TIME","TIMESTAMP","DATETIME")
_BOOL_TYPES    = ("BOOL","BOOLEAN")

def _top_vals(col_name: str, row_count: int) -> dict:
    key = col_name.upper()
    if any(k in key for k in ("STATUS","SEGMENT","TYPE","CHANNEL","CURRENCY","COUNTRY","TIER")):
        opts = ["ACTIVE","PENDING","CLOSED","COMPLETE","PREMIUM","STANDARD"][:4]
        return {v: _rng.randint(row_count//10, row_count//4) for v in opts}
    return {}


async def seed_profiling_results(db, asset_map, conn_map):
    existing = (await db.execute(
        select(ProfilingResultPlaceholder).limit(1)
    )).scalar_one_or_none()
    if existing:
        print("  Profiling: already seeded", flush=True)
        return

    # One recent successful ScanJobRun per connection to anchor results to
    run_map: dict[str, str] = {}  # connection_id → run_id
    for conn in conn_map.values():
        res = await db.execute(
            select(ScanJobRun)
            .join(ScanJob, ScanJobRun.job_id == ScanJob.job_id)
            .where(ScanJob.connection_id == conn.connection_id, ScanJobRun.status == "success")
            .order_by(ScanJobRun.started_at.desc())
            .limit(1)
        )
        run = res.scalar_one_or_none()
        if run:
            run_map[conn.connection_id] = run.run_id

    count = 0
    for table_name, asset in asset_map.items():
        if not asset.connection_id or asset.connection_id not in run_map:
            continue
        run_id = run_map[asset.connection_id]

        col_res = await db.execute(
            select(ColumnMetadata).where(ColumnMetadata.asset_id == asset.asset_id)
        )
        cols = col_res.scalars().all()
        if not cols:
            continue

        row_count = _rng.randint(12_000, 4_000_000)
        null_ratios = []

        for col in cols:
            dt = (col.data_type or "").upper()
            is_pk = bool(col.is_primary_key)
            is_nullable = bool(col.is_nullable)

            null_ratio = 0.0 if is_pk else (
                _rng.uniform(0.0, 0.05) if not is_nullable else _rng.uniform(0.01, 0.12)
            )
            null_ratios.append(null_ratio)
            null_count = int(null_ratio * row_count)

            if any(t in dt for t in _NUMERIC_TYPES):
                min_val   = str(_rng.randint(0, 10))
                max_val   = str(_rng.randint(50_000, 10_000_000))
                avg_val   = _rng.uniform(500, 100_000)
                std_dev   = avg_val * _rng.uniform(0.15, 0.45)
                dist_cnt  = _rng.randint(200, min(row_count, 500_000))
                top_vals  = {}
            elif any(t in dt for t in _DATE_TYPES):
                min_val   = "2021-01-01"
                max_val   = "2026-06-25"
                avg_val   = None
                std_dev   = None
                dist_cnt  = _rng.randint(365, 1800)
                top_vals  = {}
            elif any(t in dt for t in _BOOL_TYPES):
                min_val   = "False"
                max_val   = "True"
                avg_val   = None
                std_dev   = None
                dist_cnt  = 2
                top_vals  = {"True": int(row_count * 0.83), "False": int(row_count * 0.17)}
            else:
                min_val   = None
                max_val   = None
                avg_val   = None
                std_dev   = None
                dist_cnt  = _rng.randint(5, min(row_count // 5, 80_000))
                top_vals  = _top_vals(col.column_name, row_count)

            dist_ratio = round(min(1.0, dist_cnt / max(row_count, 1)), 4)

            await af(db, ProfilingResultPlaceholder(
                run_id=run_id,
                asset_id=asset.asset_id,
                column_name=col.column_name,
                null_count=null_count,
                null_ratio=round(null_ratio, 4),
                distinct_count=dist_cnt,
                distinct_ratio=dist_ratio,
                min_value=min_val,
                max_value=max_val,
                avg_value=round(avg_val, 2) if avg_val is not None else None,
                std_dev=round(std_dev, 2) if std_dev is not None else None,
                top_values=top_vals,
                pattern_frequency={},
                data_type=col.data_type,
                row_count=row_count,
                is_placeholder=False,
                profiled_at=utcnow() - timedelta(hours=_rng.randint(1, 48)),
            ))
            count += 1

        # Update asset-level profile score
        avg_null = sum(null_ratios) / len(null_ratios) if null_ratios else 0.0
        profile_score = round(1.0 - avg_null, 4)
        asset.latest_profile_score = profile_score
        asset.latest_quality_status = (
            "good" if profile_score >= 0.9 else
            "warning" if profile_score >= 0.7 else "poor"
        )
        db.add(asset)

    await db.flush()
    print(f"  Profiling: {count} column results seeded", flush=True)


# ── step 4: DQ rules ───────────────────────────────────────────────────────────

async def seed_rules(db, asset_map, domain_map, subdomain_map):
    existing = {(r.asset_id, r.rule_name)
                for r in (await db.execute(select(DQRule))).scalars().all()}
    existing_rules = (await db.execute(select(DQRule))).scalars().all()
    aid_to_table = {a.asset_id: t for t, a in asset_map.items()}
    rules_by_table: dict[str, list[DQRule]] = {}
    for r in existing_rules:
        t = aid_to_table.get(r.asset_id)
        if t: rules_by_table.setdefault(t, []).append(r)

    count = 0
    for (conn_name, table, dname, sname, *_) in ASSETS:
        asset = asset_map.get(table)
        if not asset or table not in RULES: continue
        sub = subdomain_map.get((dname, sname))
        domain = domain_map.get(dname)
        if not domain or not sub: continue
        rules_by_table.setdefault(table, [])
        for (rname, rtype, col, sev, _dim) in RULES[table]:
            if (asset.asset_id, rname) in existing: continue
            rule = DQRule(
                rule_id=uid(), rule_name=rname,
                rule_description=f"Automated {rtype} on {col}",
                domain_id=domain.domain_id, subdomain_id=sub.subdomain_id,
                asset_id=asset.asset_id, rule_type=rtype, target_column=col,
                rule_config={}, severity=sev, status="active", is_active=True,
                created_by="admin@example.com", created_at=days_ago(60), updated_at=utcnow(),
            )
            await af(db, rule)  # JSON column: rule_config
            rules_by_table[table].append(rule); count += 1

    total = sum(len(v) for v in rules_by_table.values())
    print(f"  Rules: {total} total, {count} new", flush=True)
    return rules_by_table


# ── step 5: rule runs (14 days) ────────────────────────────────────────────────

async def seed_rule_runs(db, asset_map, rules_by_table, domain_map, subdomain_map):
    existing = {(r.rule_id, r.created_at.date())
                for r in (await db.execute(select(DQRuleRun.rule_id, DQRuleRun.created_at))).all()}
    rows = []
    for (conn_name, table, dname, sname, *_) in ASSETS:
        asset = asset_map.get(table)
        rules = rules_by_table.get(table, [])
        if not asset or not rules: continue
        domain = domain_map.get(dname); sub = subdomain_map.get((dname, sname))
        if not domain or not sub: continue
        base = BASE_SCORES.get(table, 95.0)
        for day in range(14, 0, -1):
            run_dt = days_ago(day)
            for rule in rules:
                if (rule.rule_id, run_dt.date()) in existing: continue
                score = jitter(base, 4.0)
                total = _rng.randint(5000, 100000)
                fail_pct = round(max(0, 100-score), 2)
                failed = int(total * fail_pct / 100)
                status = "passed" if fail_pct < 5 else ("failed" if fail_pct > 15 else "warning")
                rows.append(DQRuleRun(
                    run_id=uid(), rule_id=rule.rule_id,
                    asset_id=asset.asset_id, domain_id=domain.domain_id,
                    subdomain_id=sub.subdomain_id,
                    execution_start_time=run_dt,
                    execution_end_time=run_dt + timedelta(seconds=_rng.randint(5,120)),
                    status=status, total_rows_scanned=total,
                    failed_rows_count=failed, passed_rows_count=total-failed,
                    failure_percentage=fail_pct, quality_score=score, created_at=run_dt,
                ))
    await batch(db, rows)  # no JSON — use executemany
    print(f"  Rule runs: {len(rows)} new", flush=True)


# ── step 6: quality & dimension scores (30 days) ───────────────────────────────

async def seed_scores(db, asset_map, domain_map, subdomain_map):
    existing_q = {(r.score_date, r.score_level, r.asset_id)
                  for r in (await db.execute(select(DQQualityScore))).scalars().all()}
    existing_d = {(r.score_date, r.score_level, r.asset_id, r.dimension)
                  for r in (await db.execute(select(DQDimensionScore))).scalars().all()}

    rows_q, rows_d = [], []
    for day in range(30, 0, -1):
        score_date = date_ago(day)
        domain_scores: dict[str, list[float]] = {}
        for (conn_name, table, dname, sname, *_) in ASSETS:
            asset = asset_map.get(table)
            domain = domain_map.get(dname); sub = subdomain_map.get((dname, sname))
            if not asset or not domain or not sub: continue
            score = jitter(BASE_SCORES.get(table, 95.0), 2.0)
            domain_scores.setdefault(domain.domain_id, []).append(score)
            n = len(RULES.get(table, [])); failed = max(0, round(n*(100-score)/100))
            if (score_date, "table", asset.asset_id) not in existing_q:
                rows_q.append(DQQualityScore(
                    score_id=uid(), score_date=score_date, score_level="table",
                    domain_id=domain.domain_id, subdomain_id=sub.subdomain_id,
                    asset_id=asset.asset_id, total_rules=n, passed_rules=n-failed,
                    failed_rules=failed, quality_score=score, created_at=utcnow(),
                ))
            for dim in DIMENSIONS + ["overall"]:
                dim_score = score if dim == "overall" else jitter(score, 5.0)
                if (score_date, "table", asset.asset_id, dim) not in existing_d:
                    rows_d.append(DQDimensionScore(
                        score_id=uid(), score_date=score_date, score_level="table",
                        domain_id=domain.domain_id, subdomain_id=sub.subdomain_id,
                        asset_id=asset.asset_id, dimension=dim,
                        score=dim_score, source="rules",
                        total_rules=1, passed_rules=1, failed_rules=0, created_at=utcnow(),
                    ))

        for domain_id, scores in domain_scores.items():
            avg = round(sum(scores)/len(scores), 2)
            if (score_date, "domain", None) not in existing_q:
                rows_q.append(DQQualityScore(
                    score_id=uid(), score_date=score_date, score_level="domain",
                    domain_id=domain_id, quality_score=avg,
                    total_rules=len(scores), passed_rules=len(scores), failed_rules=0,
                    created_at=utcnow(),
                ))
        all_s = [s for v in domain_scores.values() for s in v]
        if all_s and (score_date, "global", None) not in existing_q:
            rows_q.append(DQQualityScore(
                score_id=uid(), score_date=score_date, score_level="global",
                quality_score=round(sum(all_s)/len(all_s), 2),
                total_rules=len(all_s), passed_rules=len(all_s), failed_rules=0,
                created_at=utcnow(),
            ))

    await batch(db, rows_q)  # no JSON
    await batch(db, rows_d)  # no JSON
    print(f"  Quality scores: {len(rows_q)} new, Dimension scores: {len(rows_d)} new", flush=True)


# ── step 7: alerts ─────────────────────────────────────────────────────────────

async def seed_alerts(db, asset_map, domain_map, subdomain_map):
    SPECS = [
        ("FINANCE_TRANSACTIONS","critical","open","GL amount null check failed — 142 records with NULL amount"),
        ("payments","critical","open","Payment amount exceeded expected range — possible duplicate charges"),
        ("fact_sales","critical","resolved","Net revenue negative values in 38 rows — corrected upstream"),
        ("CUSTOMERS","high","open","Email format validation failed — 67 records with malformed emails"),
        ("conversions","high","open","Referential integrity broken — 23 conversions missing campaign_id"),
        ("INVENTORY","high","resolved","Inventory quantity negative for 5 SKUs — stock correction applied"),
        ("subscriptions","medium","open","Invalid subscription status PENDING_CANCEL in 12 rows"),
        ("user_events","medium","resolved","Event timestamp stale for 26 hours — freshness breach"),
        ("agg_revenue","high","open","Revenue aggregation stale — agg_date not updated for 2 days"),
        ("dim_customer","medium","resolved","SCD Type 2 overlapping valid_from/valid_to in 8 records"),
        ("PURCHASE_ORDERS","medium","open","Purchase order supplier reference invalid for 4 POs"),
        ("customers","high","open","Duplicate customer emails detected — 18 records"),
    ]
    existing_msgs = {r.alert_message for r in (await db.execute(select(DQAlert))).scalars().all()}
    rows = []
    for (table, sev, status, msg) in SPECS:
        if msg in existing_msgs: continue
        asset = asset_map.get(table)
        if not asset: continue
        dname, sname = next((d, s) for (_, t, d, s, *_) in ASSETS if t == table)
        domain = domain_map.get(dname); sub = subdomain_map.get((dname, sname))
        if not domain or not sub: continue
        rows.append(DQAlert(
            alert_id=uid(), domain_id=domain.domain_id, subdomain_id=sub.subdomain_id,
            asset_id=asset.asset_id, alert_type="rule_failure", severity=sev,
            alert_status=status, alert_message=msg, notification_sent=True,
            notification_channel="slack", created_at=days_ago(_rng.randint(1,10)),
            resolved_at=days_ago(_rng.randint(0,2)) if status=="resolved" else None,
        ))
    await batch(db, rows)  # no JSON
    print(f"  Alerts: {len(rows)} new", flush=True)


# ── step 8: alert definitions ──────────────────────────────────────────────────

async def seed_alert_definitions(db, asset_map, domain_map):
    existing = {r.name for r in (await db.execute(select(AlertDefinition))).scalars().all()}
    SPECS = [
        ("Global Rule Failure Alert","rule_failure",None,None,"critical",240,
         [{"channel":"slack","address":"#data-quality-alerts"},{"channel":"email","address":"dq@example.com"}],
         "Fire on any critical rule failure across all assets"),
        ("Finance Score Drop","score_drop","FINANCE_TRANSACTIONS","Finance",None,90.0,
         [{"channel":"slack","address":"#finance-data"},{"channel":"pagerduty","address":"pd-finance"}],
         "Alert when Finance Transactions quality drops below 90%"),
        ("Revenue Freshness Breach","freshness_breach","SALES_ORDERS","Revenue",None,24.0,
         [{"channel":"email","address":"revenue@example.com"}],
         "Alert when sales orders data is stale beyond 24 hours"),
        ("Marketing Anomaly Alert","anomaly","conversions","Marketing","high",None,
         [{"channel":"slack","address":"#marketing-data"}],
         "Alert on any anomaly in conversion data"),
        ("Customer PII Score Drop","score_drop","CUSTOMERS","Revenue",None,95.0,
         [{"channel":"email","address":"steward@example.com"},{"channel":"slack","address":"#pii-monitoring"}],
         "Alert when customer master quality drops below 95%"),
        ("DW Aggregation Freshness","freshness_breach","agg_revenue","Finance",None,48.0,
         [{"channel":"pagerduty","address":"pd-dw-oncall"}],
         "Page on-call if DW revenue aggregation is stale beyond 48h"),
    ]
    count = 0
    for (name, trigger, table, dname, sev, threshold, channels, desc) in SPECS:
        if name in existing: continue
        asset = asset_map.get(table) if table else None
        domain = domain_map.get(dname) if dname else None
        await af(db, AlertDefinition(  # JSON: notification_channels
            definition_id=uid(), name=name, description=desc,
            trigger_type=trigger, threshold_value=threshold,
            asset_id=asset.asset_id if asset else None,
            domain_id=domain.domain_id if domain else None,
            severity_override=sev, cooldown_minutes=240,
            notification_channels=channels, is_active=True,
            triggered_count=_rng.randint(1,20),
            last_fired_at=days_ago(_rng.randint(0,5)),
            created_by="admin@example.com", created_at=days_ago(30), updated_at=utcnow(),
        ))
        count += 1
    print(f"  Alert definitions: {count} new", flush=True)


# ── step 9: issues ─────────────────────────────────────────────────────────────

async def seed_issues(db, asset_map, domain_map):
    existing = {r.title for r in (await db.execute(select(Issue))).scalars().all()}
    SPECS = [
        ("FINANCE_TRANSACTIONS","critical","in_progress","NULL GL Amounts Causing Revenue Discrepancy","Finance","GL amounts are null in 142 records impacting month-end close."),
        ("payments","critical","confirmed","Duplicate Payment Charges Detected","Finance","Payment processor sent duplicate webhooks causing 8 customers to be double-charged."),
        ("CUSTOMERS","high","new","Email Format Violations in Customer Master","Revenue","67 customer records have malformed emails from legacy CRM migration."),
        ("conversions","high","in_progress","Campaign Attribution Gap — Missing Conversion Links","Marketing","23 conversion events cannot be attributed to a campaign."),
        ("INVENTORY","high","resolved","Negative Inventory Quantities for 5 SKUs","Operations","Race condition in WMS caused negative quantities. Corrected."),
        ("subscriptions","medium","new","Invalid Subscription Status Values","Revenue","12 records contain status PENDING_CANCEL not in approved enum."),
        ("agg_revenue","high","confirmed","Revenue Aggregation Staleness — 2 Day Delay","Finance","Daily revenue aggregation job has not run for 2 days."),
        ("dim_customer","medium","resolved","SCD Type 2 Overlapping Date Ranges","Revenue","8 customer dimension records had overlapping date ranges. Corrected."),
        ("user_events","low","new","Clickstream Events Missing Page URL","Marketing","~3% of user events have NULL page_url."),
        ("fact_sales","medium","in_progress","Negative Net Revenue in Sales Fact Table","Revenue","38 rows have negative net_revenue. Under investigation."),
        ("customers","high","new","Duplicate Customer Emails in PostgreSQL","Revenue","18 customer records share email addresses."),
        ("support_tickets","low","new","Support Ticket Status Missing for Closed Cases","HR","142 support tickets have NULL status after migration."),
    ]
    rows = []
    for (table, sev, status, title, dname, desc) in SPECS:
        if title in existing: continue
        asset = asset_map.get(table); domain = domain_map.get(dname)
        rows.append(Issue(
            issue_id=uid(), title=title, description=desc, issue_type="rule_failure",
            status=status, severity=sev,
            domain_id=domain.domain_id if domain else None,
            asset_id=asset.asset_id if asset else None,
            assigned_to="data.owner@example.com", created_by="admin@example.com",
            created_at=days_ago(_rng.randint(1,14)), updated_at=utcnow(),
            resolved_at=days_ago(1) if status=="resolved" else None,
        ))
    await batch(db, rows)  # no JSON
    print(f"  Issues: {len(rows)} new", flush=True)


# ── step 10: data contracts ────────────────────────────────────────────────────

async def seed_contracts(db, asset_map):
    existing = {r.contract_name for r in (await db.execute(select(DataContract))).scalars().all()}
    SPECS = [
        ("FINANCE_TRANSACTIONS","GL Finance Contract v2.0","Finance Engineering","Accounting Team",99.0,2,"Finance records must meet 99% quality threshold for month-end close SLA."),
        ("payments","Payments Data Contract v1.5","Payments Platform","Finance BI",99.5,1,"Payment data must be complete and accurate within 1 hour of processing."),
        ("fact_sales","Sales Fact DW Contract v3.0","Data Engineering","Revenue Analytics",97.0,4,"Daily sales fact refresh must complete by 06:00 AM with ≥97% quality."),
        ("CUSTOMERS","Customer Master Contract v1.0","CRM Team","All Consumers",95.0,24,"Customer master data must be fresh and valid for downstream personalization."),
        ("conversions","Marketing Conversions Contract","Marketing Eng","BI & Analytics",94.0,6,"Conversion events must be attributable and fresh for campaign reporting."),
        ("agg_revenue","Revenue Agg Contract v1.2","Data Engineering","Finance & Exec",98.0,2,"Revenue aggregates must be refreshed daily and validated before dashboards."),
        ("customers","Customer 360 Contract v1.0","Customer Platform","Marketing & Sales",96.0,12,"Customer 360 data must be complete and deduplicated for activation."),
        ("dim_customer","Customer Dimension Contract","Data Engineering","Reporting",95.0,24,"SCD Type 2 customer dimension must be consistent and current record accurate."),
    ]
    rows = []
    for (table, name, producer, consumer, min_q, stale, sla) in SPECS:
        if name in existing: continue
        asset = asset_map.get(table)
        if not asset: continue
        rows.append(DataContract(
            contract_id=uid(), asset_id=asset.asset_id, contract_name=name, version="1.0",
            producer_team=producer, consumer_team=consumer, status="active",
            min_quality_score=min_q, max_staleness_hours=stale, sla_description=sla,
            breach_action="alert", created_by="admin@example.com",
            created_at=days_ago(30), updated_at=utcnow(),
        ))
    for r in rows: await af(db, r)  # schema_json VARIANT
    print(f"  Data contracts: {len(rows)} new", flush=True)


# ── step 11: tags ──────────────────────────────────────────────────────────────

async def seed_tags(db, asset_map):
    existing_tags = {r.tag_name: r for r in (await db.execute(select(Tag))).scalars().all()}
    new_tags = []
    for (name, color, desc) in TAGS_CATALOGUE:
        if name not in existing_tags:
            t = Tag(tag_id=uid(), tag_name=name, color=color, description=desc,
                    created_by="admin@example.com", created_at=utcnow())
            new_tags.append(t); existing_tags[name] = t
    await batch(db, new_tags)  # no JSON

    existing_links = {(r.tag_id, r.entity_id)
                      for r in (await db.execute(select(AssetTag))).scalars().all()}
    rows = []
    for (tname, tables) in TAG_ASSET_MAP.items():
        tag = existing_tags.get(tname)
        if not tag: continue
        for table in tables:
            asset = asset_map.get(table)
            if not asset or (tag.tag_id, asset.asset_id) in existing_links: continue
            rows.append(AssetTag(id=uid(), tag_id=tag.tag_id, entity_type="asset",
                                 entity_id=asset.asset_id, created_by="admin@example.com",
                                 created_at=utcnow()))
    await batch(db, rows)  # no JSON
    print(f"  Tags: {len(existing_tags)} total, {len(rows)} new links", flush=True)


# ── step 12: schema baselines ──────────────────────────────────────────────────

async def seed_schema_baselines(db, asset_map):
    existing = {r.asset_id for r in (await db.execute(select(SchemaBaseline))).scalars().all()}
    count = 0
    for table, cols in COLUMNS.items():
        asset = asset_map.get(table)
        if not asset or asset.asset_id in existing: continue
        await af(db, SchemaBaseline(  # JSON: columns_snapshot
            baseline_id=uid(), asset_id=asset.asset_id, status="active",
            columns_snapshot=[{"name":c,"type":t,"is_pk":pk,"nullable":null} for c,t,pk,null in cols],
            approved_by="admin@example.com", approved_at=days_ago(30), created_at=days_ago(30),
        ))
        count += 1
    print(f"  Schema baselines: {count} new", flush=True)


# ── step 13: scan jobs ─────────────────────────────────────────────────────────

async def seed_scan_jobs(db, conn_map):
    existing = {r.job_name for r in (await db.execute(select(ScanJob))).scalars().all()}
    SPECS = [
        ("Supply Chain Nightly Discovery","discovery","Supply Chain DB","0 2 * * *"),
        ("Supply Chain Profiling","profiling","Supply Chain DB","0 3 * * *"),
        ("BigQuery Marketing Sync","discovery","Marketing Analytics (BigQuery)","0 4 * * *"),
        ("Customer 360 Discovery","discovery","Customer 360 (PostgreSQL)","0 1 * * *"),
        ("Redshift DW Profiling","profiling","Enterprise DW (Redshift)","0 5 * * *"),
        ("Supply Chain Schema Drift","schema_drift","Supply Chain DB","0 6 * * *"),
        ("Full Platform Quality Scan","dq_rules_execution","Supply Chain DB","0 0 * * *"),
    ]
    job_map: dict[str, ScanJob] = {}
    for (jname, jtype, conn_name, cron) in SPECS:
        if jname in existing: continue
        conn = conn_map.get(conn_name)
        job = ScanJob(
            job_id=uid(), connection_id=conn.connection_id if conn else None,
            job_name=jname, job_type=jtype, is_active=True,
            schedule_frequency="scheduled", cron_expr=cron, timezone="America/Los_Angeles",
            max_retries=2, timeout_seconds=600,
            last_run_at=days_ago(_rng.randint(0,2)),
            last_run_status=_rng.choice(["success","success","success","warning"]),
            created_by="admin@example.com", created_at=days_ago(30), updated_at=utcnow(),
        )
        await af(db, job)  # JSON: parameters
        job_map[jname] = job

    run_rows = []
    for job in job_map.values():
        for day in range(7, 0, -1):
            started = days_ago(day)
            status = _rng.choice(["success","success","success","success","failed","warning"])
            dur = _rng.uniform(30, 300)
            run_rows.append(ScanJobRun(
                run_id=uid(), job_id=job.job_id, status=status,
                trigger_type="scheduled", triggered_by="scheduler",
                started_at=started, ended_at=started+timedelta(seconds=dur),
                duration_seconds=dur, assets_scanned=_rng.randint(5,20),
                errors_count=0 if status=="success" else _rng.randint(1,5),
                created_at=started,
            ))
    for r in run_rows: await af(db, r)  # result_summary + parameters VARIANT
    print(f"  Scan jobs: {len(job_map)} new, {len(run_rows)} runs", flush=True)


# ── step 14: anomaly detectors ─────────────────────────────────────────────────

async def seed_anomalies(db, asset_map):
    existing_det = {r.asset_id for r in (await db.execute(select(AnomalyDetector))).scalars().all()}
    ANOMALY_ASSETS = ["FINANCE_TRANSACTIONS","SALES_ORDERS","payments","fact_sales",
                      "conversions","user_events","INVENTORY","agg_revenue"]
    detector_map: dict[str, AnomalyDetector] = {}
    for table in ANOMALY_ASSETS:
        asset = asset_map.get(table)
        if not asset or asset.asset_id in existing_det: continue
        det = AnomalyDetector(
            detector_id=uid(), asset_id=asset.asset_id,
            column_name=COLUMNS.get(table, [("value","FLOAT",False,False)])[0][0],
            detector_type="zscore", is_active=True, last_trained_at=days_ago(7),
            created_by="admin@example.com", created_at=days_ago(14),
            config={"threshold": 3.0, "window_days": 30},
        )
        await af(db, det)  # JSON: config
        detector_map[table] = det

    DETECTION_SPECS = [
        ("FINANCE_TRANSACTIONS","volume","critical","Unusual spike in GL transaction volume — 3.2x normal",False),
        ("SALES_ORDERS","freshness","high","Sales orders not refreshed for 18 hours",False),
        ("payments","distribution","critical","Payment amount distribution shifted — p95 increased 40%",False),
        ("fact_sales","volume","high","Sales fact row count dropped 62% vs 7-day average",True),
        ("conversions","distribution","high","Conversion value distribution anomaly — spike in high-value events",False),
        ("user_events","volume","medium","User event volume 45% below baseline for 6 hours",True),
        ("INVENTORY","distribution","high","Inventory quantity bimodal distribution — expected unimodal",False),
        ("agg_revenue","freshness","critical","Revenue aggregation stale — last update 52 hours ago",False),
    ]
    existing_detect = {r.asset_id for r in (await db.execute(select(AnomalyDetection))).scalars().all()}
    rows = []
    for (table, atype, sev, explanation, ack) in DETECTION_SPECS:
        asset = asset_map.get(table); det = detector_map.get(table)
        if not asset or not det or asset.asset_id in existing_detect: continue
        col = COLUMNS.get(table, [("value","FLOAT",False,False)])[0][0]
        rows.append(AnomalyDetection(
            detection_id=uid(), detector_id=det.detector_id, asset_id=asset.asset_id,
            column_name=col, anomaly_type=atype, severity=sev,
            observed_value=str(_rng.uniform(100,99999)),
            expected_range=f"[{_rng.uniform(100,500):.1f}, {_rng.uniform(1000,5000):.1f}]",
            confidence=round(_rng.uniform(0.85,0.99),3),
            detected_at=days_ago(_rng.randint(0,3)),
            is_acknowledged=ack, ai_explanation=explanation,
        ))
    await batch(db, rows)  # no JSON
    print(f"  Anomaly detectors: {len(detector_map)} new, detections: {len(rows)} new", flush=True)


# ── step 15: quality incidents ─────────────────────────────────────────────────

async def seed_quality_incidents(db, asset_map):
    existing = {r.title for r in (await db.execute(select(QualityIncident))).scalars().all()}
    SPECS = [
        ("FINANCE_TRANSACTIONS","critical","open","Finance GL Data Outage — Month-End Close Blocked",
         {"cause":"ETL failure","impact":"Month-end close blocked","affected_records":142}, 45, None),
        ("payments","critical","resolved","Duplicate Payment Processing Incident",
         {"cause":"Webhook retry storm","impact":"8 customers double-charged"}, 12, 180),
        ("fact_sales","high","resolved","Sales Fact Negative Revenue Anomaly",
         {"cause":"Credit memo calculation bug","impact":"Revenue reports understated"}, 30, 240),
        ("agg_revenue","high","open","Revenue Aggregation Pipeline Stalled",
         {"cause":"Redshift performance degradation","impact":"Executive dashboards stale"}, 90, None),
        ("conversions","medium","open","Marketing Attribution Data Gap",
         {"cause":"Tracking pixel 404","impact":"Campaign ROI reports incomplete"}, 20, None),
    ]
    count = 0
    for (table, sev, status, title, rca, ttd, ttr) in SPECS:
        if title in existing: continue
        asset = asset_map.get(table)
        await af(db, QualityIncident(  # JSON: rca_report, timeline
            incident_id=uid(), title=title,
            asset_id=asset.asset_id if asset else None,
            severity=sev, status=status, rca_report=rca,
            ttd_minutes=ttd, ttr_minutes=ttr,
            resolved_by="admin@example.com" if status=="resolved" else None,
            created_at=days_ago(_rng.randint(1,10)),
            resolved_at=days_ago(1) if status=="resolved" else None,
        ))
        count += 1
    print(f"  Quality incidents: {count} new", flush=True)


# ── step 16: SLA configs ───────────────────────────────────────────────────────

async def seed_slas(db, asset_map):
    existing = {(r.entity_type, r.entity_id)
                for r in (await db.execute(select(SLAConfig))).scalars().all()}
    SPECS = [
        ("FINANCE_TRANSACTIONS",99.0,1.0),("payments",99.5,0.5),("fact_sales",97.0,3.0),
        ("CUSTOMERS",95.0,5.0),("conversions",94.0,6.0),("agg_revenue",98.0,2.0),
        ("SALES_ORDERS",93.0,7.0),("customers",96.0,4.0),
    ]
    rows = []
    for (table, min_q, max_fail) in SPECS:
        asset = asset_map.get(table)
        if not asset or ("asset", asset.asset_id) in existing: continue
        rows.append(SLAConfig(
            sla_id=uid(), entity_type="asset", entity_id=asset.asset_id,
            min_quality_score=min_q, max_failure_pct=max_fail,
            alert_on_breach=True, notification_emails="data-team@example.com",
            notification_slack_channel="#data-quality-alerts",
            is_active=True, created_at=days_ago(30), updated_at=utcnow(),
        ))
    await batch(db, rows)  # no JSON
    print(f"  SLA configs: {len(rows)} new", flush=True)


# ── step 17: teams ─────────────────────────────────────────────────────────────

async def seed_teams(db):
    existing = {r.team_name: r for r in (await db.execute(select(Team))).scalars().all()}
    TEAMS = [
        ("Data Engineering","Builds and maintains the data platform and DQ infrastructure"),
        ("Finance Analytics","Owns financial data assets and GL reporting quality"),
        ("Revenue Analytics","Sales, CRM and revenue metric ownership"),
        ("Marketing Data","Campaign analytics, attribution and audience data"),
        ("Platform On-Call","24/7 on-call rotation for critical data platform incidents"),
        ("Governance Council","Data governance policy, stewardship and compliance oversight"),
    ]
    team_map, new_teams = {}, []
    for (name, desc) in TEAMS:
        if name in existing: team_map[name] = existing[name]; continue
        t = Team(team_id=uid(), team_name=name, description=desc, is_active=True,
                 created_by="admin@example.com", created_at=utcnow(), updated_at=utcnow())
        new_teams.append(t); team_map[name] = t
    await batch(db, new_teams)  # no JSON

    users = (await db.execute(select(User))).scalars().all()
    existing_memberships = {(r.team_id, r.user_id)
                            for r in (await db.execute(select(TeamMembership))).scalars().all()}
    mem_rows = []
    admin = next((u for u in users if u.role == "admin"), None)
    viewer = next((u for u in users if u.role == "viewer"), None)
    for team in team_map.values():
        for (user, role) in [(admin, "lead"), (viewer, "member")]:
            if user and (team.team_id, user.user_id) not in existing_memberships:
                mem_rows.append(TeamMembership(
                    membership_id=uid(), team_id=team.team_id, user_id=user.user_id,
                    role_in_team=role, created_by="admin@example.com", created_at=utcnow(),
                ))
    await batch(db, mem_rows)  # no JSON
    print(f"  Teams: {len(new_teams)} new, {len(mem_rows)} memberships", flush=True)


# ── step 18: pipelines ─────────────────────────────────────────────────────────

async def seed_pipelines(db, conn_map):
    existing = {r.name for r in (await db.execute(select(Pipeline))).scalars().all()}
    PIPE_SPECS = [
        ("Supply Chain Nightly DQ Pipeline","0 2 * * *",
         [("Extract & Profile","extract",1),("Run DQ Rules","dq_check",2),("Aggregate Scores","score_rollup",3),("Send Alerts","notify",4)]),
        ("Marketing Attribution Pipeline","0 6 * * *",
         [("Sync BigQuery","sync",1),("Validate Conversions","dq_check",2),("Build Attribution","transform",3)]),
        ("Finance Month-End Validation","0 20 L * *",
         [("GL Completeness Check","dq_check",1),("SOX Validation","dq_check",2),("Generate Report","report",3),("Notify Finance","notify",4)]),
        ("Customer 360 Daily Sync","0 1 * * *",
         [("PostgreSQL Extract","extract",1),("Dedup Customers","transform",2),("Quality Validation","dq_check",3)]),
        ("DW Refresh Pipeline","0 3 * * *",
         [("Redshift Sync","sync",1),("Fact Table Load","load",2),("Dimension Update","load",3),("Aggregate Revenue","transform",4),("Quality Gate","dq_check",5)]),
    ]
    conn = list(conn_map.values())[0]
    run_rows, step_run_rows = [], []
    for (pname, cron, steps_spec) in PIPE_SPECS:
        if pname in existing: continue
        pipe = Pipeline(
            pipeline_id=uid(), name=pname, trigger_type="scheduled", cron_expr=cron,
            connection_ids=[conn.connection_id], is_active=True, timeout_seconds=3600,
            created_by="admin@example.com", created_at=days_ago(30), updated_at=utcnow(),
        )
        await af(db, pipe)  # JSON: connection_ids

        step_ids = []
        for (sname, stype, order) in steps_spec:
            s = PipelineStep(
                step_id=uid(), pipeline_id=pipe.pipeline_id, name=sname,
                step_type=stype, step_order=order, timeout_seconds=600,
                created_at=days_ago(30), updated_at=utcnow(),
            )
            await af(db, s)  # JSON: step_config, depends_on
            step_ids.append((s.step_id, sname))

        for day in range(7, 0, -1):
            status = _rng.choice(["success","success","success","failed","success"])
            started = days_ago(day)
            run = PipelineRun(
                run_id=uid(), pipeline_id=pipe.pipeline_id, status=status,
                triggered_by="scheduler", trigger_type="scheduled",
                started_at=started, finished_at=started+timedelta(seconds=_rng.randint(60,600)),
                created_at=started,
            )
            run_rows.append(run)
            for (sid, sname) in step_ids:
                step_status = "success" if status=="success" else _rng.choice(["success","failed"])
                step_run_rows.append(PipelineStepRun(
                    step_run_id=uid(), run_id=run.run_id, step_id=sid, step_name=sname,
                    status=step_status, attempt=1, started_at=started,
                    finished_at=started+timedelta(seconds=_rng.randint(5,120)),
                    created_at=started,
                ))

    await batch(db, run_rows)                           # no JSON
    for r in step_run_rows: await af(db, r)            # output_summary VARIANT
    print(f"  Pipelines: {len(PIPE_SPECS)} specs, {len(run_rows)} runs, {len(step_run_rows)} step runs", flush=True)


# ── step 19: data products ─────────────────────────────────────────────────────

async def seed_data_products(db, asset_map, domain_map):
    existing = {r.product_name for r in (await db.execute(select(DataProduct))).scalars().all()}
    SPECS = [
        ("Revenue Analytics Product","Revenue","published",["SALES_ORDERS","RETURNS","FINANCE_TRANSACTIONS"],
         "Unified revenue analytics combining sales, returns and GL data."),
        ("Customer Intelligence Product","Revenue","published",["CUSTOMERS","customers","dim_customer"],
         "360-degree customer view combining supply chain, CRM and DW records."),
        ("Marketing Attribution Product","Marketing","published",["campaigns","conversions","user_events","attribution_models"],
         "End-to-end marketing attribution from ad spend to conversion."),
        ("Supply Chain Ops Product","Operations","published",["INVENTORY","PURCHASE_ORDERS","SUPPLIERS","WAREHOUSES"],
         "Operational supply chain for inventory, procurement and logistics analytics."),
        ("Enterprise DW Product","Finance","draft",["fact_sales","dim_customer","dim_product","agg_revenue"],
         "Redshift star-schema product for executive reporting."),
    ]
    prod_rows, link_rows = [], []
    for (pname, dname, status, tables, desc) in SPECS:
        if pname in existing: continue
        domain = domain_map.get(dname)
        prod_id = uid()
        prod_rows.append(DataProduct(
            product_id=prod_id, product_name=pname, description=desc,
            domain_id=domain.domain_id if domain else None,
            owner_email="admin@example.com", status=status, version="1.0",
            created_by="admin@example.com", created_at=days_ago(20), updated_at=utcnow(),
        ))
        for table in tables:
            asset = asset_map.get(table)
            if asset:
                link_rows.append(DataProductAsset(id=uid(), product_id=prod_id,
                                                   asset_id=asset.asset_id, role="source",
                                                   created_at=days_ago(20)))
    await batch(db, prod_rows)   # no JSON
    await batch(db, link_rows)   # no JSON
    print(f"  Data products: {len(prod_rows)} new, {len(link_rows)} asset links", flush=True)


# ── step 20: governance policies ──────────────────────────────────────────────

async def seed_governance(db):
    existing = {r.policy_name for r in (await db.execute(select(GovernancePolicy))).scalars().all()}
    SPECS = [
        ("PII Data Handling Policy","data_retention","All PII tables must have masking policies. Retention ≤7 years. Access restricted."),
        ("Financial Data Quality SLA","quality_standard","Finance assets must maintain ≥99% quality. Any breach triggers immediate incident."),
        ("Data Retention Policy","data_retention","All operational data retained 7 years per SOX. PII anonymised after 3 years."),
        ("Data Access Control Policy","access_control","RBAC enforced on all assets. Least privilege. Quarterly access reviews."),
        ("AI/ML Data Governance Policy","ai_governance","Datasets for AI/ML must be certified and bias-tested before production use."),
        ("Cross-Domain Data Sharing Policy","data_sharing","Cross-domain sharing requires a signed DSA with defined quality SLAs."),
    ]
    count = 0
    for (pname, ptype, desc) in SPECS:
        if pname in existing: continue
        await af(db, GovernancePolicy(  # JSON: config
            policy_id=uid(), policy_name=pname, policy_type=ptype, status="active",
            description=desc, severity="high", is_active=True,
            created_by="admin@example.com", created_at=days_ago(90),
        ))
        count += 1
    print(f"  Governance policies: {count} new", flush=True)


# ── step 21: on-call schedules ─────────────────────────────────────────────────

async def seed_oncall(db, domain_map):
    existing = {r.oncall_email for r in (await db.execute(select(OncallSchedule))).scalars().all()}
    SPECS = [
        ("admin@example.com","#data-platform-oncall","pd-key-platform",None),
        ("domain.owner@example.com","#finance-data-oncall","pd-key-finance","Finance"),
        ("data.owner@example.com","#revenue-oncall","pd-key-revenue","Revenue"),
        ("auditor@example.com","#governance-oncall",None,"Operations"),
    ]
    rows = []
    for (email, slack, pd_key, dname) in SPECS:
        if email in existing: continue
        domain = domain_map.get(dname) if dname else None
        rows.append(OncallSchedule(
            schedule_id=uid(), domain_id=domain.domain_id if domain else None,
            oncall_email=email, oncall_slack=slack, pagerduty_key=pd_key,
            effective_from=days_ago(30), effective_until=days_ago(-30),
            timezone="America/Los_Angeles", created_at=utcnow(),
        ))
    await batch(db, rows)  # no JSON
    print(f"  On-call schedules: {len(rows)} new", flush=True)


# ── step 22: privacy ───────────────────────────────────────────────────────────

async def seed_privacy(db, asset_map):
    existing_mask = {(r.asset_id, r.column_name)
                     for r in (await db.execute(select(MaskingPolicy))).scalars().all()}
    MASK_SPECS = [
        ("CUSTOMERS","EMAIL","email_mask","analyst,viewer","admin,domain_owner"),
        ("CUSTOMERS","PHONE","partial_mask","analyst,viewer","admin,domain_owner"),
        ("customers","email","email_mask","analyst,viewer","admin,domain_owner"),
        ("dim_customer","email","email_mask","analyst,viewer","admin,domain_owner"),
        ("payments","amount","range_mask","viewer","admin,domain_owner,data_owner"),
        ("support_tickets","subject","null_mask","viewer","admin,domain_owner"),
    ]
    mask_rows = []
    for (table, col, mtype, restricted, unmasked) in MASK_SPECS:
        asset = asset_map.get(table)
        if not asset or (asset.asset_id, col) in existing_mask: continue
        mask_rows.append(MaskingPolicy(
            policy_id=uid(), asset_id=asset.asset_id, column_name=col,
            masking_type=mtype, applies_to_roles=restricted, unmasked_roles=unmasked,
            created_by="admin@example.com", created_at=days_ago(30),
        ))
    await batch(db, mask_rows)  # no JSON

    existing_dsr = {r.subject_email for r in (await db.execute(select(DataSubjectRequest))).scalars().all()}
    DSR_SPECS = [
        ("alice.smith@gmail.com","access","completed","GDPR access request — provided data inventory"),
        ("bob.jones@outlook.com","erasure","in_progress","GDPR Article 17 erasure request"),
        ("carol.white@yahoo.com","portability","pending","Data portability request — export CSV"),
        ("dave.brown@proton.me","access","completed","CCPA access request"),
        ("eve.davis@icloud.com","erasure","completed","GDPR erasure — account deleted"),
    ]
    dsr_rows = []
    for (email, rtype, status, desc) in DSR_SPECS:
        if email in existing_dsr: continue
        dsr_rows.append(DataSubjectRequest(
            dsr_id=uid(), subject_email=email, request_type=rtype, status=status,
            description=desc, assigned_to="admin@example.com", requested_by=email,
            created_at=days_ago(_rng.randint(1,30)),
            completed_at=days_ago(_rng.randint(0,5)) if status=="completed" else None,
        ))
    await batch(db, dsr_rows)  # no JSON

    existing_consent = {r for r in (await db.execute(select(ConsentRecord.asset_id))).scalars().all() if r}
    consent_rows = []
    for table in ["CUSTOMERS","customers","user_events","subscriptions"]:
        asset = asset_map.get(table)
        if not asset or asset.asset_id in existing_consent: continue
        consent_rows.append(ConsentRecord(
            consent_id=uid(), asset_id=asset.asset_id, purpose="analytics",
            legal_basis="legitimate_interest", opt_in=True, recorded_by="admin@example.com",
            created_at=days_ago(365),
        ))
    await batch(db, consent_rows)  # no JSON
    print(f"  Privacy: {len(mask_rows)} masks, {len(dsr_rows)} DSRs, {len(consent_rows)} consent", flush=True)


# ── step 23: data classifications ─────────────────────────────────────────────

async def seed_classifications(db, asset_map):
    existing = {(r.asset_id, r.column_name)
                for r in (await db.execute(select(DataClassification))).scalars().all()}
    SPECS = [
        ("CUSTOMERS","EMAIL","PII","high","Email address — direct identifier"),
        ("CUSTOMERS","PHONE","PII","medium","Phone number"),
        ("CUSTOMERS","FULL_NAME","PII","medium","Customer full name"),
        ("customers","email","PII","high","Email address"),
        ("customers","first_name","PII","low","First name — quasi-identifier"),
        ("payments","amount","FINANCIAL","high","Payment amount — sensitive financial data"),
        ("dim_customer","email","PII","high","Email — SCD dimension"),
        ("user_events","user_id","PII","medium","User identifier linkable to PII"),
        ("FINANCE_TRANSACTIONS","AMOUNT","FINANCIAL","critical","GL transaction amount"),
        ("nps_scores","respondent_email","PII","medium","Survey respondent email"),
    ]
    rows = []
    for (table, col, cls_type, sens, desc) in SPECS:
        asset = asset_map.get(table)
        if not asset or (asset.asset_id, col) in existing: continue
        rows.append(DataClassification(
            classification_id=uid(), asset_id=asset.asset_id, column_name=col,
            classification=cls_type, justification=f"{sens.title()} sensitivity — {desc}",
            applied_by="admin@example.com", reviewed_at=days_ago(30), created_at=days_ago(30),
        ))
    await batch(db, rows)  # no JSON
    print(f"  Data classifications: {len(rows)} new", flush=True)


# ── step 24: glossary ──────────────────────────────────────────────────────────

async def seed_glossary(db, asset_map, domain_map):
    existing = {r.term_name for r in (await db.execute(select(GlossaryTerm))).scalars().all()}
    TERMS = [
        ("Net Revenue","Finance","Revenue after discounts, returns and refunds.","finance@example.com"),
        ("Customer Lifetime Value","Revenue","Predicted total revenue from a customer over their entire relationship.","revenue@example.com"),
        ("Conversion Rate","Marketing","Percentage of users who complete a desired action.","marketing@example.com"),
        ("Attribution Model","Marketing","Method for assigning credit to marketing touchpoints.","marketing@example.com"),
        ("SCD Type 2","Others","Slowly Changing Dimension Type 2 — tracks history by adding rows with validity dates.","admin@example.com"),
        ("Data Quality Score","Others","Weighted composite score (0–100) measuring 6 DQ dimensions.","admin@example.com"),
        ("GDPR","Others","General Data Protection Regulation — EU personal data protection law.","admin@example.com"),
        ("MRR","Revenue","Monthly Recurring Revenue — predictable revenue from active subscriptions.","finance@example.com"),
        ("Churn Rate","Revenue","Percentage of customers who cancel subscriptions in a given period.","revenue@example.com"),
        ("Cost Per Acquisition","Marketing","Total marketing spend divided by new customers acquired.","marketing@example.com"),
        ("Purchase Order","Operations","Formal document issued by a buyer to a supplier.","operations@example.com"),
        ("SKU","Operations","Stock Keeping Unit — unique identifier for a product variant.","operations@example.com"),
        ("SOX Compliance","Finance","Sarbanes-Oxley Act compliance requirements for financial reporting.","finance@example.com"),
        ("Data Steward","Others","Person responsible for data quality and governance for a data domain.","admin@example.com"),
        ("Anomaly Detection","Others","Automated identification of unusual patterns in data metrics.","admin@example.com"),
    ]
    term_map: dict[str, GlossaryTerm] = {}
    new_terms = []
    for (term, dname, def_text, owner) in TERMS:
        if term in existing: continue
        domain = domain_map.get(dname)
        t = GlossaryTerm(
            term_id=uid(), term_name=term, definition=def_text,
            domain_id=domain.domain_id if domain else None,
            owner_email=owner, status="active",
            created_by="admin@example.com", created_at=days_ago(30), updated_at=utcnow(),
        )
        new_terms.append(t); term_map[term] = t
    await batch(db, new_terms)  # no JSON

    TERM_ASSET_MAP = {
        "Net Revenue": ["fact_sales","agg_revenue","FINANCE_TRANSACTIONS"],
        "Conversion Rate": ["conversions","attribution_models"],
        "Attribution Model": ["attribution_models"],
        "MRR": ["subscriptions"],
        "Churn Rate": ["subscriptions","customers"],
        "Purchase Order": ["PURCHASE_ORDERS","PURCHASE_ORDER_ITEMS"],
        "SKU": ["INVENTORY","PRODUCTS"],
    }
    existing_links = {(r.term_id, r.asset_id)
                      for r in (await db.execute(select(GlossaryTermAsset))).scalars().all()}
    link_rows = []
    for (tname, tables) in TERM_ASSET_MAP.items():
        term = term_map.get(tname)
        if not term: continue
        for table in tables:
            asset = asset_map.get(table)
            if not asset or (term.term_id, asset.asset_id) in existing_links: continue
            link_rows.append(GlossaryTermAsset(
                id=uid(), term_id=term.term_id, asset_id=asset.asset_id,
                created_by="admin@example.com", created_at=utcnow(),
            ))
    await batch(db, link_rows)  # no JSON
    print(f"  Glossary: {len(new_terms)} terms, {len(link_rows)} links", flush=True)


# ── step 25: notifications ─────────────────────────────────────────────────────

async def seed_notifications(db):
    count = len((await db.execute(select(Notification))).scalars().all())
    if count >= 10: print("  Notifications: already seeded", flush=True); return
    SPECS = [
        ("admin@example.com","alert","Critical alert: GL amount null check failed","Critical: GL amount null check failed on FINANCE_TRANSACTIONS",False),
        ("admin@example.com","alert","Critical alert: Duplicate payment charges","Critical: Duplicate payment charges detected — 8 customers affected",False),
        ("admin@example.com","info","Data contract breach: Revenue Agg SLA","Data contract breach: Revenue Agg freshness SLA violated",False),
        ("domain.owner@example.com","alert","High alert: Email format violations","High: Email format violations in Customer Master (67 records)",False),
        ("domain.owner@example.com","info","Quality score improved: SALES_ORDERS","Quality score improved: SALES_ORDERS now at 94.2%",True),
        ("data.owner@example.com","alert","Medium alert: Invalid subscription status","Medium: Invalid subscription status values detected",False),
        ("data.owner@example.com","info","Scan job completed","Scan job completed: Supply Chain Nightly Discovery (28 assets)",True),
        ("viewer@example.com","info","New data contract published","New data contract published: Payments Data Contract v1.5",True),
        ("auditor@example.com","alert","Compliance alert: SOX GL rule failed","Compliance: SOX GL Completeness rule failed on FINANCE_TRANSACTIONS",False),
        ("admin@example.com","info","New connection added","New connection added: Enterprise DW (Redshift)",True),
        ("admin@example.com","alert","High alert: Revenue pipeline stalled","High: Revenue aggregation pipeline stalled — 2-day delay",False),
        ("domain.owner@example.com","info","Issue resolved: Negative inventory","Issue resolved: Negative inventory quantities corrected",True),
    ]
    rows = [Notification(
        notification_id=uid(), user_email=email, type=ntype, title=title, body=body,
        is_read=is_read, created_at=days_ago(_rng.randint(0,7)),
    ) for (email, ntype, title, body, is_read) in SPECS]
    await batch(db, rows)  # no JSON
    print(f"  Notifications: {len(rows)} new", flush=True)


# ── step 26: rule templates ────────────────────────────────────────────────────

async def seed_rule_templates(db):
    existing = {r.template_name for r in (await db.execute(select(RuleTemplate))).scalars().all()}
    SPECS = [
        ("Email Format Check","regex_check","Validates email addresses match RFC 5322 pattern",{"pattern":"^[^@]+@[^@]+\\.[^@]+$"},"validity"),
        ("Not Null Completeness","null_check","Checks that a required column contains no NULL values",{},"completeness"),
        ("Positive Amount Check","range_check","Validates that numeric amounts are non-negative",{"min":0},"validity"),
        ("Uniqueness Check","uniqueness_check","Ensures a column or combination has no duplicate values",{},"uniqueness"),
        ("Freshness < 24h","freshness_check","Validates data was updated within the last 24 hours",{"max_age_hours":24},"timeliness"),
        ("Referential Integrity","referential_integrity_check","Verifies all foreign key values exist in the reference table",{},"consistency"),
        ("Accepted Values","accepted_values_check","Validates a column only contains values from a defined list",{"values":[]},"validity"),
        ("Row Count In Range","volume_check","Validates table row count is within expected bounds",{"min_rows":1000,"max_rows":10000000},"completeness"),
        ("ISO Currency Code","regex_check","Validates currency codes match ISO 4217 3-letter format",{"pattern":"^[A-Z]{3}$"},"validity"),
        ("Date Not Future","range_check","Validates that a date column does not contain future dates",{"max_days_ahead":0},"validity"),
    ]
    count = 0
    for (name, rtype, desc, config, dim) in SPECS:
        if name in existing: continue
        await af(db, RuleTemplate(  # JSON: default_config
            template_id=uid(), template_name=name, rule_type=rtype, description=desc,
            default_config=config, tags=dim, author_email="admin@example.com",
            is_public=True, downloads=_rng.randint(5,50), rating=round(_rng.uniform(3.5,5.0),1),
            created_at=days_ago(60),
        ))
        count += 1
    print(f"  Rule templates: {count} new", flush=True)


# ── step 27: observability ─────────────────────────────────────────────────────

async def seed_observability(db, asset_map, conn_map):
    existing_metrics = {(r.asset_id, r.metric_date)
                        for r in (await db.execute(select(AssetMonitoringMetric))).scalars().all()}
    OBS_ASSETS = ["FINANCE_TRANSACTIONS","SALES_ORDERS","payments","fact_sales","conversions","INVENTORY"]
    metric_rows = []
    for table in OBS_ASSETS:
        asset = asset_map.get(table)
        if not asset: continue
        base_rows = _rng.randint(50000, 2000000)
        for day in range(14, 0, -1):
            md = date_ago(day)
            if (asset.asset_id, md) in existing_metrics: continue
            metric_rows.append(AssetMonitoringMetric(
                metric_id=uid(), asset_id=asset.asset_id, metric_date=md,
                row_count=int(base_rows * jitter(100,5) / 100),
                freshness_hours=round(_rng.uniform(0.5, 4.0), 2),
                null_rate_avg=round(_rng.uniform(0.0, 0.05), 4),
                created_at=utcnow(),
            ))
    await batch(db, metric_rows)  # no JSON

    existing_cm = {r.connection_id for r in (await db.execute(select(ContinuousMonitoringConfig))).scalars().all()}
    cm_rows = [ContinuousMonitoringConfig(
        config_id=uid(), connection_id=conn.connection_id, interval_minutes=15,
        is_enabled=True, freshness_enabled=True, volume_enabled=True,
        schema_drift_enabled=True, distribution_enabled=True,
        last_run_at=days_ago(0), created_at=days_ago(30), updated_at=utcnow(),
    ) for conn in conn_map.values() if conn.connection_id not in existing_cm]
    await batch(db, cm_rows)  # no JSON

    existing_vb = {r.asset_id for r in (await db.execute(select(VolumeBaseline))).scalars().all()}
    vb_count = 0
    for table in OBS_ASSETS:
        asset = asset_map.get(table)
        if not asset or asset.asset_id in existing_vb: continue
        base = _rng.randint(50000, 2000000)
        readings = [{"ts": str(date_ago(i)), "count": int(base*jitter(100,3)/100)} for i in range(14,0,-1)]
        await af(db, VolumeBaseline(asset_id=asset.asset_id, readings=readings, updated_at=utcnow()))
        vb_count += 1
    print(f"  Observability: {len(metric_rows)} metrics, {len(cm_rows)} monitoring configs, {vb_count} vol baselines", flush=True)


# ── step 28: data sharing agreements ──────────────────────────────────────────

async def seed_sharing_agreements(db, asset_map, domain_map):
    existing = {r.asset_id for r in (await db.execute(select(DataSharingAgreement))).scalars().all()}
    SPECS = [
        ("fact_sales","Revenue","Finance",97.0,4),
        ("agg_revenue","Finance","Revenue",98.0,2),
        ("CUSTOMERS","Revenue","Marketing",95.0,24),
        ("conversions","Marketing","Revenue",94.0,6),
        ("payments","Finance","Revenue",99.0,1),
    ]
    rows = []
    for (table, producer_d, consumer_d, quality_sla, fresh_sla) in SPECS:
        asset = asset_map.get(table)
        if not asset or asset.asset_id in existing: continue
        pd_d = domain_map.get(producer_d); cd_d = domain_map.get(consumer_d)
        if not pd_d or not cd_d: continue
        rows.append(DataSharingAgreement(
            agreement_id=uid(), producer_domain_id=pd_d.domain_id,
            consumer_domain_id=cd_d.domain_id, asset_id=asset.asset_id,
            quality_sla=quality_sla, freshness_sla=fresh_sla, breach_action="alert",
            status="active", signed_by_producer="admin@example.com",
            signed_by_consumer="domain.owner@example.com",
            effective_from=days_ago(30), created_at=days_ago(30),
        ))
    await batch(db, rows)  # no JSON
    print(f"  Data sharing agreements: {len(rows)} new", flush=True)


# ── main ───────────────────────────────────────────────────────────────────────

async def main():
    await asyncio.to_thread(create_tables)
    async with AsyncSessionLocal() as db:
        # Setup domains/subdomains
        domain_map = await load_domains(db)
        subdomain_map = await load_subdomains(db, domain_map)
        for dname in ["Marketing","HR","Operations","Others"]:
            await ensure_domain(db, domain_map, dname)
        for (dname, sname) in [("Marketing","Campaign Management"),("Marketing","Digital Analytics"),("HR","Employee Data")]:
            await ensure_subdomain(db, domain_map, subdomain_map, dname, sname)
        domain_map = await load_domains(db)
        subdomain_map = await load_subdomains(db, domain_map)
        print(f"  {len(domain_map)} domains, {len(subdomain_map)} subdomains", flush=True)

        print("\n── Step 1:  Connections ──────────────────────────────────────────", flush=True)
        conn_map = await seed_connections(db)
        print("\n── Step 1b: Source assets (tree root nodes) ─────────────────────", flush=True)
        await seed_source_assets(db, conn_map)
        print("\n── Step 2:  Assets ──────────────────────────────────────────────", flush=True)
        asset_map = await seed_assets(db, conn_map, domain_map, subdomain_map)
        print("\n── Step 2c: Views with multi-level lineage SQL ───────────────────", flush=True)
        await seed_views_and_lineage(db, conn_map, domain_map, subdomain_map)
        print("\n── Step 3:  Column metadata ─────────────────────────────────────", flush=True)
        await seed_columns(db, asset_map)
        print("\n── Step 3b: Profiling results ───────────────────────────────────", flush=True)
        await seed_profiling_results(db, asset_map, conn_map)
        print("\n── Step 4:  DQ Rules ────────────────────────────────────────────", flush=True)
        rules_by_table = await seed_rules(db, asset_map, domain_map, subdomain_map)
        print("\n── Step 5:  Rule runs (14 days) ─────────────────────────────────", flush=True)
        await seed_rule_runs(db, asset_map, rules_by_table, domain_map, subdomain_map)
        print("\n── Step 6:  Quality & dimension scores (30 days) ────────────────", flush=True)
        await seed_scores(db, asset_map, domain_map, subdomain_map)
        print("\n── Step 7:  Alerts ──────────────────────────────────────────────", flush=True)
        await seed_alerts(db, asset_map, domain_map, subdomain_map)
        print("\n── Step 8:  Alert definitions ───────────────────────────────────", flush=True)
        await seed_alert_definitions(db, asset_map, domain_map)
        print("\n── Step 9:  Issues ──────────────────────────────────────────────", flush=True)
        await seed_issues(db, asset_map, domain_map)
        print("\n── Step 10: Data contracts ──────────────────────────────────────", flush=True)
        await seed_contracts(db, asset_map)
        print("\n── Step 11: Tags ────────────────────────────────────────────────", flush=True)
        await seed_tags(db, asset_map)
        print("\n── Step 12: Schema baselines ────────────────────────────────────", flush=True)
        await seed_schema_baselines(db, asset_map)
        print("\n── Step 13: Scan jobs ───────────────────────────────────────────", flush=True)
        await seed_scan_jobs(db, conn_map)
        print("\n── Step 14: Anomaly detectors & detections ──────────────────────", flush=True)
        await seed_anomalies(db, asset_map)
        print("\n── Step 15: Quality incidents ───────────────────────────────────", flush=True)
        await seed_quality_incidents(db, asset_map)
        print("\n── Step 16: SLA configs ─────────────────────────────────────────", flush=True)
        await seed_slas(db, asset_map)
        print("\n── Step 17: Teams & memberships ─────────────────────────────────", flush=True)
        await seed_teams(db)
        print("\n── Step 18: Pipelines ───────────────────────────────────────────", flush=True)
        await seed_pipelines(db, conn_map)
        print("\n── Step 19: Data products ───────────────────────────────────────", flush=True)
        await seed_data_products(db, asset_map, domain_map)
        print("\n── Step 20: Governance policies ─────────────────────────────────", flush=True)
        await seed_governance(db)
        print("\n── Step 21: On-call schedules ───────────────────────────────────", flush=True)
        await seed_oncall(db, domain_map)
        print("\n── Step 22: Privacy (masking, DSRs, consent) ────────────────────", flush=True)
        await seed_privacy(db, asset_map)
        print("\n── Step 23: Data classifications ────────────────────────────────", flush=True)
        await seed_classifications(db, asset_map)
        print("\n── Step 24: Glossary terms ──────────────────────────────────────", flush=True)
        await seed_glossary(db, asset_map, domain_map)
        print("\n── Step 25: Notifications ───────────────────────────────────────", flush=True)
        await seed_notifications(db)
        print("\n── Step 26: Rule templates ──────────────────────────────────────", flush=True)
        await seed_rule_templates(db)
        print("\n── Step 27: Observability metrics ───────────────────────────────", flush=True)
        await seed_observability(db, asset_map, conn_map)
        print("\n── Step 28: Data sharing agreements ─────────────────────────────", flush=True)
        await seed_sharing_agreements(db, asset_map, domain_map)

        await db.commit()
        print("\n✓ Full demo seed complete.", flush=True)
        total_rules = sum(len(v) for v in rules_by_table.values())
        print(f"  {len(conn_map)} connections · {len(asset_map)} assets · {total_rules} rules", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
