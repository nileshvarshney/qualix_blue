from __future__ import annotations

"""Seed required domains, subdomains, and bootstrap users for all 5 roles."""
import asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import Domain, Subdomain, User, ComplianceFramework, ComplianceRequirement, GovernancePolicy

# Requirements per framework: (req_code, req_name, description, dq_rule_types)
COMPLIANCE_REQUIREMENTS: dict[str, list[tuple]] = {
    "GDPR": [
        ("GDPR_5_1_d", "Data Accuracy",       "Personal data must be accurate and kept up to date.",                               "null_check,range_check,regex_check"),
        ("GDPR_5_1_c", "Data Minimisation",   "Personal data must be adequate, relevant, and limited to what is necessary.",       "volume_check"),
        ("GDPR_5_1_e", "Storage Limitation",  "Personal data must not be kept longer than necessary.",                             "freshness_check"),
        ("GDPR_5_1_f", "Integrity & Confidentiality","Personal data must be protected against unauthorised access or loss.",       "schema_drift_check"),
        ("GDPR_17",    "Right to Erasure",     "The ability to identify and delete all personal data for a given individual.",     "null_check,uniqueness_check"),
        ("GDPR_25",    "Data Protection by Design","Privacy measures built into data processing systems by default.",              "schema_drift_check,null_check"),
        ("GDPR_30",    "Records of Processing","Maintain records of all data processing activities.",                              "null_check,custom_sql_check"),
        ("GDPR_32",    "Security of Processing","Appropriate technical measures to ensure data security.",                         "regex_check,accepted_values_check"),
    ],
    "CCPA": [
        ("CCPA_1798_100", "Right to Know",         "Consumers can request disclosure of personal information collected.",         "null_check,uniqueness_check"),
        ("CCPA_1798_105", "Right to Delete",        "Consumers can request deletion of their personal information.",             "null_check"),
        ("CCPA_1798_110", "Right to Opt-Out",       "Consumers can opt out of the sale of personal information.",               "accepted_values_check"),
        ("CCPA_1798_115", "Right to Non-Discrim.",  "Businesses must not discriminate for exercising CCPA rights.",             "range_check,accepted_values_check"),
        ("CCPA_1798_120", "Data Accuracy",          "Personal information collected must be accurate and not misleading.",       "null_check,regex_check,range_check"),
        ("CCPA_1798_150", "Security Measures",      "Reasonable security measures to protect personal information.",            "schema_drift_check"),
    ],
    "HIPAA": [
        ("HIPAA_164_308", "Administrative Safeguards","Implement policies and procedures for PHI protection.",                   "null_check,custom_sql_check"),
        ("HIPAA_164_310", "Physical Safeguards",     "Physical access controls for systems containing PHI.",                    "schema_drift_check"),
        ("HIPAA_164_312", "Technical Safeguards",    "Technology controls to protect PHI and control access.",                  "regex_check,accepted_values_check"),
        ("HIPAA_164_514", "De-identification",        "PHI must be de-identified before use in non-treatment contexts.",        "null_check,regex_check"),
        ("HIPAA_164_502", "Minimum Necessary",        "Only the minimum necessary PHI should be used or disclosed.",            "volume_check,null_check"),
        ("HIPAA_164_530", "PHI Accuracy",             "Covered entities must ensure accuracy of PHI they maintain.",            "null_check,range_check,freshness_check"),
        ("HIPAA_164_312e","Audit Controls",           "Hardware and software activity in systems containing PHI must be audited.", "custom_sql_check"),
    ],
    "SOX": [
        ("SOX_302",  "CEO/CFO Certification",   "Senior executives must personally certify the accuracy of financial reports.",  "null_check,uniqueness_check,range_check"),
        ("SOX_404",  "Internal Controls",        "Management must assess and report on internal controls over financial reporting.", "custom_sql_check,business_rule_check"),
        ("SOX_802",  "Record Retention",         "Financial records and audit workpapers must be retained for 7 years.",         "freshness_check,null_check"),
        ("SOX_906",  "Corporate Responsibility", "Financial statements must fairly present the financial condition of the company.", "range_check,accepted_values_check"),
        ("SOX_GL",   "GL Completeness",          "All journal entries must be complete and accurately recorded.",                "null_check,uniqueness_check"),
        ("SOX_RECON","Reconciliation",           "Account balances must reconcile to supporting documentation.",                 "business_rule_check,range_check"),
        ("SOX_SEG",  "Segregation of Duties",    "Incompatible duties must be separated to prevent fraud.",                     "custom_sql_check"),
    ],
    "BCBS 239": [
        ("BCBS_P1",  "Data Accuracy & Integrity","Risk data must be accurate and reliable.",                                     "null_check,range_check,uniqueness_check"),
        ("BCBS_P2",  "Completeness",             "Banks must capture all material risk data across all material risk types.",    "null_check,volume_check"),
        ("BCBS_P3",  "Timeliness",               "Produce aggregate risk data in a timely manner.",                             "freshness_check"),
        ("BCBS_P4",  "Adaptability",             "Risk data aggregation capabilities must be adaptable to new requirements.",   "schema_drift_check"),
        ("BCBS_P5",  "Data Dictionary",           "A comprehensive dictionary of risk data must be maintained.",                "null_check,custom_sql_check"),
        ("BCBS_P6",  "Reconciliation",           "Risk data must be reconciled against other sources.",                         "business_rule_check,referential_integrity_check"),
    ],
    "ISO 27001": [
        ("ISO_A8",   "Asset Management",         "All information assets must be identified and have assigned owners.",          "null_check"),
        ("ISO_A9",   "Access Control",            "Access to information must be restricted based on business requirements.",   "accepted_values_check,null_check"),
        ("ISO_A10",  "Cryptography",              "Cryptographic controls must be applied to protect information.",             "regex_check"),
        ("ISO_A12",  "Operations Security",       "Operating procedures and responsibilities must be documented.",              "schema_drift_check,freshness_check"),
        ("ISO_A13",  "Communications Security",   "Information must be protected in networks.",                                 "null_check,regex_check"),
        ("ISO_A16",  "Incident Management",       "Security incidents must be reported and managed consistently.",              "null_check,custom_sql_check"),
        ("ISO_A17",  "Business Continuity",       "Information security continuity must be embedded in business continuity.",  "freshness_check,volume_check"),
        ("ISO_A18",  "Compliance",                "All legal, statutory, regulatory requirements must be identified.",         "custom_sql_check,accepted_values_check"),
    ],
    "SOC 2 Type II": [
        ("CC6.1",  "Logical Access Controls",     "Logical access controls restrict access to data based on least-privilege.", "null_check,accepted_values_check"),
        ("CC7.1",  "Anomaly Detection",            "Anomalies and security events are detected, analyzed, and resolved.",      "null_check,range_check,custom_sql_check"),
        ("A1.1",   "Availability Monitoring",      "System availability is monitored against service commitments.",            "freshness_check,volume_check"),
        ("PI1.1",  "Processing Integrity",         "Data processing is complete, valid, accurate, timely, and authorized.",    "null_check,range_check,uniqueness_check"),
        ("PI1.2",  "Processing Completeness",      "Inputs and system outputs are complete and accurate.",                     "null_check,volume_check"),
        ("C1.1",   "Confidentiality",              "Confidential information is protected during collection and processing.",   "regex_check,schema_drift_check"),
        ("P4.1",   "PII Accuracy",                 "Personal information is accurate and complete for its intended use.",      "null_check,regex_check,range_check"),
        ("P5.1",   "Data Retention",               "Personal data is retained only as long as necessary for its purpose.",    "freshness_check"),
    ],
    "ISO 27701": [
        ("27701_5.2",  "Privacy Governance",       "Roles and responsibilities for PII processing are defined and assigned.",  "null_check"),
        ("27701_6.2",  "PII Accuracy",              "PII is accurate, complete, and kept up to date.",                         "null_check,regex_check,range_check"),
        ("27701_6.3",  "Data Minimisation",         "Only the minimum necessary PII is collected and processed.",              "volume_check,null_check"),
        ("27701_6.4",  "Storage Limitation",        "PII is not retained beyond its stated purpose or legal obligation.",      "freshness_check"),
        ("27701_7.3",  "Privacy by Design",         "Privacy controls are built into data processing systems by default.",    "schema_drift_check,null_check"),
        ("27701_8.2",  "Data Subject Rights",       "Mechanisms exist to honor access, correction, and erasure requests.",    "null_check,uniqueness_check"),
        ("27701_8.5",  "PII Transfer Controls",     "PII transfers between organisations are governed by defined controls.",   "regex_check,accepted_values_check"),
    ],
    "NIST CSF": [
        ("ID.AM-1",  "Asset Inventory",            "Data assets and information are inventoried with assigned owners.",        "null_check,uniqueness_check"),
        ("ID.AM-5",  "Asset Prioritization",        "Resources are prioritized based on classification and business value.",   "accepted_values_check,null_check"),
        ("PR.DS-1",  "Data at Rest Protection",     "Data at rest is protected consistent with the risk strategy.",           "regex_check,schema_drift_check"),
        ("PR.DS-5",  "Data Leak Prevention",        "Protections against data leaks are implemented and monitored.",          "null_check,regex_check"),
        ("PR.DS-3",  "Asset Lifecycle Management",  "Assets are managed throughout transfer, removal, and disposal.",         "null_check,freshness_check"),
        ("DE.CM-7",  "Unauthorized Activity",       "Monitoring for unauthorized personnel, connections, and software.",      "custom_sql_check,null_check"),
        ("DE.AE-1",  "Baseline Establishment",      "A baseline of expected data flows and volumes is established.",          "volume_check,freshness_check"),
        ("RS.AN-1",  "Detection Investigation",     "Detection system notifications are investigated and documented.",        "null_check,custom_sql_check"),
    ],
    "NIST 800-53": [
        ("SI-7",   "Information Integrity",         "Detect unauthorized changes to software and information.",                "schema_drift_check,custom_sql_check"),
        ("SI-10",  "Input Validation",              "Information inputs are checked for accuracy, completeness, and validity.","null_check,regex_check,range_check,accepted_values_check"),
        ("SI-12",  "Information Retention",         "Information is managed and retained per applicable legal requirements.",  "freshness_check,volume_check"),
        ("SI-18",  "PII Quality Operations",        "Accuracy and completeness of PII is confirmed and corrected.",           "null_check,regex_check,range_check"),
        ("AU-9",   "Audit Log Protection",          "Audit information and audit tools are protected from unauthorized access.","null_check,freshness_check"),
        ("AC-4",   "Information Flow Enforcement",  "Approved authorizations for information flows between systems are enforced.","accepted_values_check,custom_sql_check"),
        ("SA-8",   "Security Engineering Principles","Security and privacy engineering principles applied in system design.", "schema_drift_check"),
        ("CM-8",   "Component Inventory",           "Information system components are inventoried with accuracy and currency.","null_check,uniqueness_check"),
    ],
    "CIS Controls": [
        ("CIS-3.1",   "Data Inventory",            "Establish and maintain a data inventory of sensitive and critical data.",  "null_check,uniqueness_check"),
        ("CIS-3.3",   "Data Classification",        "Configure data access controls based on data sensitivity classification.", "accepted_values_check,null_check"),
        ("CIS-3.4",   "Data Retention",             "Retain data only as long as required by defined retention schedules.",   "freshness_check"),
        ("CIS-3.7",   "Data Handling Procedures",   "Establish and maintain data handling procedures for sensitive data.",    "regex_check,null_check"),
        ("CIS-3.11",  "Sensitive Data Encryption",  "Encrypt sensitive data at rest on servers and endpoints.",               "regex_check"),
        ("CIS-8.2",   "Audit Log Collection",       "Collect audit logs from assets to detect anomalous activity.",           "null_check,freshness_check,custom_sql_check"),
        ("CIS-8.5",   "Centralized Log Management", "Collect audit logs centrally from all relevant assets.",                 "volume_check,null_check"),
        ("CIS-11.4",  "Data Recovery Testing",      "Test data recovery to ensure it meets defined recovery time objectives.", "freshness_check,business_rule_check"),
    ],
    "PCI DSS": [
        ("PCI_3.3",  "Sensitive Auth Data Storage", "Sensitive authentication data must not be stored after authorization.",  "null_check,regex_check"),
        ("PCI_3.4",  "PAN Protection",              "PAN must be rendered unreadable anywhere it is stored.",                 "regex_check"),
        ("PCI_4.2",  "Data in Transit",             "Strong cryptography used to safeguard PAN during transmission.",        "null_check,regex_check"),
        ("PCI_7.2",  "Access Control Systems",      "Access to system components and data is controlled via an access control system.", "accepted_values_check,null_check"),
        ("PCI_10.2", "Audit Logs",                  "Audit logs are implemented to reconstruct events and detect anomalies.", "null_check,freshness_check,custom_sql_check"),
        ("PCI_10.5", "Log Retention",               "Audit log history is retained for at least 12 months.",                 "freshness_check,volume_check"),
        ("PCI_8.6",  "Authentication Management",   "Interactive login for system/application accounts is managed.",         "null_check,accepted_values_check"),
        ("PCI_12.3", "Risk Analysis",               "Targeted risk analyses are performed at defined frequencies.",           "custom_sql_check,business_rule_check"),
    ],
    "HITRUST": [
        ("HITRUST_01", "Access Control",            "Users are uniquely identified and access is appropriately controlled.",  "null_check,accepted_values_check,uniqueness_check"),
        ("HITRUST_07", "Audit Logging",             "Audit records are created, protected, reviewed, and acted upon.",       "null_check,freshness_check,custom_sql_check"),
        ("HITRUST_09", "Information Security Mgmt", "A formal information security management program is in place.",         "schema_drift_check,null_check"),
        ("HITRUST_11", "PHI Privacy & Protection",  "PHI and PII handling meets applicable privacy and security requirements.", "null_check,regex_check,range_check"),
        ("HITRUST_13", "Data Integrity",            "Data integrity is maintained throughout the full processing lifecycle.", "null_check,range_check,business_rule_check"),
        ("HITRUST_14", "PHI De-identification",     "PHI is properly de-identified before use in non-treatment contexts.",   "null_check,regex_check"),
        ("HITRUST_15", "Record Retention",          "Records are retained per applicable regulatory timeframe requirements.", "freshness_check,null_check"),
        ("HITRUST_17", "Risk Management",           "A formal risk management program identifies and addresses data threats.", "custom_sql_check,business_rule_check"),
    ],
}

DOMAINS = [
    {"domain_name": "Revenue",    "description": "Revenue and billing data quality",          "owner_name": "Revenue Team",  "owner_email": "revenue@example.com"},
    {"domain_name": "Finance",    "description": "Finance and accounting data quality",        "owner_name": "Finance Team",  "owner_email": "finance@example.com"},
    {"domain_name": "Operations", "description": "Operations and logistics data quality",      "owner_name": "Ops Team",      "owner_email": "ops@example.com"},
    {"domain_name": "Planning",   "description": "Demand and workforce planning data quality", "owner_name": "Planning Team", "owner_email": "planning@example.com"},
    {"domain_name": "GTM",        "description": "Go-to-market and marketing data quality",    "owner_name": "GTM Team",      "owner_email": "gtm@example.com"},
    {"domain_name": "HR",         "description": "Human resources data quality",               "owner_name": "HR Team",       "owner_email": "hr@example.com"},
    {"domain_name": "Others",     "description": "Miscellaneous and custom domain",            "owner_name": "Platform Team", "owner_email": "platform@example.com"},
]

SUBDOMAINS = {
    "Revenue":    ["Billing", "Sales", "Subscriptions", "Pricing", "Invoice Management"],
    "Finance":    ["General Ledger", "Accounts Payable", "Accounts Receivable", "Expenses", "Forecasting"],
    "Operations": ["Inventory", "Fulfillment", "Logistics", "Supply Chain"],
    "Planning":   ["Demand Planning", "Workforce Planning", "Capacity Planning", "Forecast Planning"],
    "GTM":        ["Leads", "Campaigns", "Marketing", "Sales Pipeline", "Customer Acquisition"],
    "HR":         ["Employees", "Payroll", "Hiring", "Attendance", "Benefits"],
    "Others":     ["Product", "Support", "Analytics", "Custom"],
}


COMPLIANCE_FRAMEWORKS = [
    {"framework_name": "GDPR",         "version": "2018",  "description": "EU General Data Protection Regulation"},
    {"framework_name": "CCPA",         "version": "2020",  "description": "California Consumer Privacy Act"},
    {"framework_name": "HIPAA",        "version": "1996",  "description": "Health Insurance Portability and Accountability Act"},
    {"framework_name": "SOX",          "version": "2002",  "description": "Sarbanes-Oxley Act"},
    {"framework_name": "BCBS 239",     "version": "2013",  "description": "BCBS Principles for Risk Data Aggregation"},
    {"framework_name": "ISO 27001",    "version": "2022",  "description": "Information Security Management"},
    {"framework_name": "SOC 2 Type II","version": "2017",  "description": "AICPA Trust Services Criteria — security, availability, processing integrity, confidentiality, privacy"},
    {"framework_name": "ISO 27701",    "version": "2019",  "description": "Privacy Information Management extension to ISO 27001"},
    {"framework_name": "NIST CSF",     "version": "2.0",   "description": "NIST Cybersecurity Framework for managing cybersecurity risk"},
    {"framework_name": "NIST 800-53",  "version": "Rev 5", "description": "NIST Security and Privacy Controls for Information Systems"},
    {"framework_name": "CIS Controls", "version": "v8",    "description": "Center for Internet Security Critical Security Controls"},
    {"framework_name": "PCI DSS",      "version": "v4.0",  "description": "Payment Card Industry Data Security Standard"},
    {"framework_name": "HITRUST",      "version": "r2",    "description": "HITRUST Common Security Framework for healthcare data"},
]

GOVERNANCE_POLICIES = [
    {"policy_name": "Owner Required",        "policy_type": "owner_required",        "severity": "medium"},
    {"policy_name": "Certification Required", "policy_type": "certification_required", "severity": "low"},
    {"policy_name": "No Rules Defined",      "policy_type": "no_rules_defined",       "severity": "high"},
    {"policy_name": "Missing Description",   "policy_type": "stale_description",      "severity": "low"},
]


async def seed_compliance_frameworks(db: AsyncSession):
    """Seed compliance frameworks, requirements, and governance policies if not present (idempotent)."""
    from sqlalchemy import select

    for fw in COMPLIANCE_FRAMEWORKS:
        existing_res = await db.execute(
            select(ComplianceFramework).where(ComplianceFramework.framework_name == fw["framework_name"])
        )
        existing = existing_res.scalar_one_or_none()
        if not existing:
            framework = ComplianceFramework(
                framework_id=str(uuid.uuid4()),
                framework_name=fw["framework_name"],
                version=fw["version"],
                description=fw["description"],
                is_active=True,
            )
            db.add(framework)
            await db.flush()
            existing = framework
            print(f"  Seeded compliance framework: {fw['framework_name']}")

        # Seed requirements for this framework if none exist yet
        req_count_res = await db.execute(
            select(ComplianceRequirement).where(ComplianceRequirement.framework_id == existing.framework_id).limit(1)
        )
        if not req_count_res.scalar_one_or_none():
            reqs = COMPLIANCE_REQUIREMENTS.get(fw["framework_name"], [])
            for req_code, req_name, req_desc, rule_types in reqs:
                db.add(ComplianceRequirement(
                    req_id=str(uuid.uuid4()),
                    framework_id=existing.framework_id,
                    req_code=req_code,
                    req_name=req_name,
                    req_description=req_desc,
                    dq_rule_types=rule_types,
                ))
            if reqs:
                print(f"    Seeded {len(reqs)} requirements for {fw['framework_name']}")

    for pol in GOVERNANCE_POLICIES:
        existing = await db.execute(
            select(GovernancePolicy).where(GovernancePolicy.policy_type == pol["policy_type"])
        )
        if not existing.scalar_one_or_none():
            policy = GovernancePolicy(
                policy_id=str(uuid.uuid4()),
                policy_name=pol["policy_name"],
                policy_type=pol["policy_type"],
                severity=pol["severity"],
                is_active=True,
                created_by="system",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(policy)
            print(f"  Seeded governance policy: {pol['policy_name']}")

    await db.flush()


async def seed(db: AsyncSession):
    from sqlalchemy import select, func
    from app.core.security import hash_password

    # ── Step 1: Seed domains (needed before users so domain_owner gets a real domain_id) ──
    count_domains = (await db.execute(select(func.count()).select_from(Domain))).scalar() or 0
    domain_map: dict[str, Domain] = {}
    seeding_fresh = count_domains == 0

    if seeding_fresh:
        for d in DOMAINS:
            domain = Domain(
                domain_id=str(uuid.uuid4()),
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
                **d,
            )
            db.add(domain)
            domain_map[d["domain_name"]] = domain
        await db.flush()
        print(f"Seeded {len(DOMAINS)} domains.")
    else:
        result = await db.execute(select(Domain))
        for dom in result.scalars().all():
            domain_map[dom.domain_name] = dom

    revenue_domain_id = domain_map["Revenue"].domain_id if "Revenue" in domain_map else None

    # ── Step 2: Seed default users for all 5 roles (idempotent per email) ──────
    #
    # Role capabilities (from Admin Guide):
    #   admin        — full access: users, domains, rules, config, approve/reject
    #   domain_owner — manage rules/schedules in their assigned domain; approve/reject
    #   data_owner   — create/edit rules for assigned tables
    #   viewer       — read-only: dashboards, alerts, run history, AI assistant
    #   auditor      — viewer + audit logs
    #
    DEFAULT_USERS = [
        {
            "email":     "admin@example.com",
            "password":  "admin123",
            "full_name": "System Admin",
            "role":      "admin",
            "domain_id": None,
        },
        {
            "email":     "domain.owner@example.com",
            "password":  "domain123",
            "full_name": "Revenue Domain Owner",
            "role":      "domain_owner",
            "domain_id": revenue_domain_id,   # scoped to Revenue domain
        },
        {
            "email":     "data.owner@example.com",
            "password":  "data123",
            "full_name": "Billing Data Owner",
            "role":      "data_owner",
            "domain_id": None,
        },
        {
            "email":     "viewer@example.com",
            "password":  "viewer123",
            "full_name": "Dashboard Viewer",
            "role":      "viewer",
            "domain_id": None,
        },
        {
            "email":     "auditor@example.com",
            "password":  "auditor123",
            "full_name": "Compliance Auditor",
            "role":      "auditor",
            "domain_id": None,
        },
    ]

    for u in DEFAULT_USERS:
        existing = await db.execute(select(User).where(User.email == u["email"]))
        if existing.scalar_one_or_none():
            continue
        user = User(
            user_id=str(uuid.uuid4()),
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            full_name=u["full_name"],
            role=u["role"],
            domain_id=u["domain_id"],
            is_active=True,
            is_verified=True,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(user)
        print(f"  Created user: {u['email']}  password: {u['password']}  role: {u['role']}")

    await db.flush()

    # ── Step 3: Seed subdomains (first run only) ─────────────────────────────────
    if not seeding_fresh:
        print("Domains already exist — skipping subdomain seed.")
        await db.commit()
        # Still seed compliance frameworks and policies on every run (idempotent)
        await seed_compliance_frameworks(db)
        await db.commit()
        return

    for domain_name, subs in SUBDOMAINS.items():
        domain = domain_map[domain_name]
        for sub_name in subs:
            sub = Subdomain(
                subdomain_id=str(uuid.uuid4()),
                domain_id=domain.domain_id,
                subdomain_name=sub_name,
                description=f"{sub_name} subdomain",
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(sub)
    await db.flush()

    await db.commit()
    print("Seeding complete: domains, subdomains, and all 5 role users created.")

    # Seed compliance frameworks and governance policies (always idempotent)
    await seed_compliance_frameworks(db)
    await db.commit()


async def main():
    await asyncio.to_thread(create_tables)
    async with AsyncSessionLocal() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
