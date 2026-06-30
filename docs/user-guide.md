# User Guide

## Who this guide is for

This guide is for anyone using the platform day-to-day — data engineers, analytics engineers, data quality owners, business analysts, and domain owners. It covers the UI from end to end.

---

## Signing In

Open the platform at [http://localhost:3000](http://localhost:3000).

If your admin has enabled authentication, you will see a sign-in form. You have two options:

- **Email + Password** — enter your credentials and click **Sign in**.
- **Sign in with Google** — click the Google button to authenticate via your Google Workspace account (requires admin to configure Google OAuth).

After signing in, your name and role appear at the bottom of the sidebar. Click the **arrow icon** to sign out.

The **Admin** section in the sidebar is only visible to users with the `admin` role.

---

## Navigation

The sidebar is divided into five sections:

| Section | Pages |
|---|---|
| **Dashboards** | Global Dashboard |
| **Data Quality** | Rules, Data Assets, Schedules, Execution Logs |
| **Operations** | Alerts, Audit Logs |
| **AI** | AI Assistant |
| **Admin** | Domain Management, User Management, Settings *(admin only)* |

### Command Palette (⌘K)

Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) from any page to open the command palette. Start typing to filter pages and actions, then use **↑↓** to navigate and **Enter** to open. Press **Escape** to close.

---

## Understanding Metrics

### Quality Score

The core metric shown throughout the platform. It answers: *"What percentage of data quality checks passed?"*

**How it is calculated:**

Start from 100 and subtract severity-weighted penalties for each failing rule:

| Failing rule severity | Points deducted |
|---|---|
| Critical | 25 |
| High | 15 |
| Medium | 7 |
| Low | 3 |

The score is clamped between 0 and 100.

**Example:** A table has 10 rules. 1 critical failure and 1 medium failure.
`100 - 25 - 7 = 68` → Quality score: **68%**

**Color coding used across all dashboards:**

| Score range | Color | Meaning |
|---|---|---|
| ≥ 95% | Green | Healthy |
| 85–94% | Yellow | Needs attention |
| < 85% | Red | Requires immediate action |

---

### Dashboard Stat Cards

#### Global Dashboard

| Metric | What it means |
|---|---|
| **Overall Quality Score** | Weighted aggregate score across every rule execution today |
| **14-Day Trend** | Sparkline of daily quality score over the last two weeks — look for drops |
| **Total Domains** | Number of business domains registered in the platform |
| **Tables Monitored** | Total registered Snowflake tables with at least one active rule |
| **Active Rules** | Rules with status `active` — currently executing on schedule |
| **Passed Today** | Rules that returned status `passed` in their most recent run today |
| **Failed Today** | Rules that returned status `failed` or `error` today |
| **Open Alerts** | Unresolved alerts across all domains |
| **Pass Rate Today** | `passed_today / (passed_today + failed_today) × 100` |

#### Domain / Subdomain Dashboard

| Metric | What it means |
|---|---|
| **Quality Score** | Weighted score for all rules within this domain/subdomain today |
| **Tables** | Registered tables in this domain/subdomain |
| **Active Rules** | Active rules within this scope |
| **Passed / Failed** | Today's rule execution summary for this scope |
| **Quality Trend** | 14-day sparkline for this domain/subdomain |

#### Table Dashboard

| Metric | What it means |
|---|---|
| **Quality Score** | Score across all rules for this table today |
| **Last Run** | Timestamp of the most recent rule execution on this table |
| **Total Rules** | All rules assigned to this table |
| **Passed** | Rules that passed in their last run |
| **Failed** | Rules that failed in their last run |
| **Warnings** | Rules with `warning` status (low-severity failures) |
| **Certification** | Certified / Warning / Failed / Uncertified — set by data owners |
| **30-Day Trend** | Daily quality score chart for this table |

---

### Run Metrics (Execution Logs)

Each execution row shows:

| Column | What it means |
|---|---|
| **Status** | `passed` / `failed` / `warning` / `error` / `skipped` |
| **Score** | Quality score for this single run |
| **Rows Scanned** | Total rows the rule SQL evaluated |
| **Failed Rows** | Rows that violated the rule |
| **Failure %** | `failed_rows / total_rows × 100` |
| **Δ (delta badge)** | ▲/▼ change vs. the same rule's previous run — green is improvement |
| **Duration** | How long the Snowflake query took to run |

**Run statuses:**

| Status | Meaning |
|---|---|
| `passed` | Zero failed rows |
| `failed` | One or more failed rows (high/critical severity) |
| `warning` | One or more failed rows (low severity) |
| `error` | SQL failed to execute (connection error, timeout, etc.) |
| `skipped` | Rule was inactive or skipped by the scheduler |

---

### Alert Metrics

| Field | What it means |
|---|---|
| **Severity** | Inherited from the rule that failed |
| **Alert Status** | `open` → `acknowledged` → `resolved` / `ignored` |
| **Alert Message** | Summary of what failed: failed rows, failure rate |
| **Notification Channel** | How the alert was sent (Slack, email, etc.) |
| **Resolved At** | When the alert was closed (null if still open) |

---

## Dashboards

### Global Dashboard

Your starting point. Shows overall platform health. The **Export CSV** button downloads the last 30 days of rule runs.

### Domains Overview

A grid of domain cards and a horizontal bar chart comparing quality scores. Click any card to drill into the domain.

### Domain Detail

Shows quality score, trend, and the list of subdomains. Click any subdomain to drill in.

**Breadcrumb**: Home → Domains → *Domain Name*

### Subdomain Detail

Shows quality score and the list of registered tables with scores. Click any table to go to the Table Dashboard.

**Breadcrumb**: Home → Domains → *Domain* → *Subdomain Name*

### Table Dashboard

The most detailed view. Shows quality score, certification status, trend chart, and all rules for this table.

- Click any rule name to open the Rule Detail page.
- Click **Run All Rules** to execute every active rule immediately.

**Breadcrumb**: Home → Domains → *Subdomain* → *Schema.Table*

---

## Rules

### Rules List (`Data Quality → Rules`)

All rules across the platform, searchable and filterable.

**Filters:**

| Filter | What it does |
|---|---|
| Search box | Matches rule name, description, or table name |
| Domain | Filters by business domain |
| Subdomain | Appears after selecting a domain |
| Severity | Critical / High / Medium / Low |
| Status | Active / Draft / Pending Review / Disabled |

**Each rule row shows:**
- Rule name and description (click to open Rule Detail)
- Table (`schema.table_name`), domain, subdomain
- Rule type and severity badge
- Status toggle (click to change inline)
- Actions: **Run**, **Logs**, **Edit**, **Archive**, and **Review** (for pending rules)

### Running a Rule

Click **Run** in the rule row. The button is only enabled for `Active` rules. A spinner shows while execution runs in Snowflake. The result appears inline:

- Green **passed** with quality score
- Red **failed** with quality score
- Orange **error** with error message

### Bulk Actions

Select rules using the checkboxes (or **Select All**), then use the bulk toolbar:

- **Activate / Disable / Archive** — change status for all selected rules
- **Run All** — executes all selected rules; returns a `job_id` immediately. Poll `GET /rules/bulk/jobs/{job_id}` for progress.

### Editing a Rule

Click the **pencil (Edit)** button. A slide-out panel opens with all editable fields including rule-type-specific config (accepted values, min/max, pattern, etc.) and the generated SQL.

The previous state is automatically snapshotted into version history.

### Archiving a Rule

Click the **trash icon**. Archived rules stop executing but all history is preserved.

### Creating a Rule

Click **New Rule** and fill in:

1. **Rule Name** — machine-friendly ID, e.g. `invoice_id_not_null`
2. **Description** — plain English shown to stakeholders
3. **Domain → Subdomain → Table** — classify the rule in the hierarchy
4. **Rule Type** — see [Rule Types](#rule-types) below
5. **Target Column** — the column to check (not needed for volume, freshness, custom SQL)
6. **Severity** — Critical / High / Medium / Low
7. **Custom SQL** — leave blank to auto-generate; override if needed

### Rule Detail Page

Click any rule name.

**Header**: rule name, status badge, version badge (e.g. `v3`). If `pending_review`, a yellow approval panel appears.

**Tabs:**

| Tab | What it shows |
|---|---|
| Details | Type, target column, severity, SQL, ownership |
| Run History | Every execution — status, score, rows, failed rows, timestamp |
| Version History | Snapshots before each change; Restore button per version |

### Rule Cloning

On the Rule Detail page, click **Clone** to duplicate the rule. The clone is created as `draft` and opens for editing.

---

## Rule Approval Workflow

Rules from AI generation or YAML import start as `pending_review` — they don't execute until approved.

### Approving (admin / domain_owner only)

Filter the Rules list by **Status = Pending Review**, click **Review**, then click **Approve** on the detail page.

### Rejecting

Click **Reject** on the detail page. Type a rejection reason. The rule returns to `draft` with the reason shown in a red banner.

### Rule Statuses

| Status | Meaning | Executes? |
|---|---|---|
| `draft` | Not ready; may be rejected | No |
| `pending_review` | Awaiting approval | No |
| `approved` | Approved but not yet activated | No |
| `active` | Running on schedule | Yes |
| `disabled` | Temporarily paused | No |
| `archived` | Permanently retired | No |

---

## Rule Types

| Type | What it checks | Key config |
|---|---|---|
| `null_check` | No NULLs in column | — |
| `uniqueness_check` | All values unique | — |
| `duplicate_check` | Same as uniqueness_check | — |
| `accepted_values_check` | Value in an approved list | `accepted_values: [...]` |
| `range_check` | Numeric within min/max | `min_value`, `max_value` |
| `freshness_check` | Table updated within N hours | `max_hours` (default 24) |
| `volume_check` | Row count within thresholds | `min_rows`, `max_rows`, `date_column` — if no thresholds set, compares against 7-run historical average ± 30% |
| `schema_drift_check` | Expected columns exist | `expected_columns: [...]` |
| `referential_integrity_check` | FK values exist in parent | `reference_table`, `reference_column` |
| `regex_check` | Values match a pattern | `pattern` (regex string) |
| `business_rule_check` | Custom WHERE condition | `condition` |
| `custom_sql_check` | Custom SQL returning `failed_count` | `sql` |

---

## Data Assets

### Data Assets Page

All registered Snowflake tables. Columns: table path, connection, domain/subdomain, owner, criticality, certification badge.

### Registering a Table

Click **Register Table**.

- **Browse Snowflake tab** — cascade through connection → database → schema → table; preview shows row count. Click **Use This Table**.
- **Enter Manually tab** — type schema and table name directly.

Fill in domain, subdomain, criticality, description, and owner fields. Click **Register Table**.

### Certification Statuses

| Status | Meaning | Color |
|---|---|---|
| Certified | Meets all quality standards | Green |
| Warning | Known issues; use with caution | Yellow |
| Failed | Critical quality problems | Red |
| Uncertified | Not yet reviewed (default) | Gray |

---

## Schedules

Schedules control when rules run automatically. Priority (most specific wins):

```
Rule schedule > Table schedule > Subdomain schedule > Domain schedule > Global schedule
```

**Frequencies**: `hourly`, `daily`, `weekly`, `monthly`, `cron`, `on_demand`

From the Schedules page: pause, resume, delete, or trigger **Run Now**.

---

## Execution Logs

Open **Data Quality → Execution Logs**.

Every rule execution across the platform. Click a row to expand the full details including executed SQL, sample failed records, AI explanation, and execution time.

**Export CSV** downloads the currently filtered log (last 30 days by default).

---

## Alerts

Open **Operations → Alerts**.

Alerts fire when Critical, High, or Medium severity rules fail. Deduplicated within a 4-hour window.

**Tab filters**: All / Open / Acknowledged / Resolved / Ignored

**Actions per alert**: Acknowledge, Resolve, Ignore, open Table, open Rule, View Logs.

**Export CSV** downloads filtered alerts.

---

## AI Assistant

Open **AI → AI Assistant**.

Chat with the AI about data quality. Conversation history persists within your browser session (cleared when you close the tab; click **Clear history** to reset manually).

**Example questions:**

```
Why did Revenue quality score drop today?
Which Finance tables failed yesterday?
Suggest rules for the HR payroll table.
Explain the failure on invoices.invoice_amount_positive.
Generate SQL to check for duplicate invoice IDs.
```

---

## Audit Logs

Open **Operations → Audit Logs** (all roles except `viewer`).

Every create, update, approve, reject, rollback, and certification action is recorded. Filter by entity type, action, or user email.

**Export CSV** downloads the last 30 days of audit events.

---

## Settings

Visible to all roles; writable only by `admin`.

| Tab | Contents |
|---|---|
| General | App name, alert recipients, Slack webhook |
| Database | Test DB connectivity |
| Snowflake | Add/edit/test connections; browse databases, schemas, tables |
| LLM / AI | Active provider, API keys, test LLM |
| Scheduler | Default timezone |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **⌘K** / **Ctrl+K** | Open command palette |
| **↑ / ↓** | Navigate command palette items |
| **Enter** | Open selected item |
| **Escape** | Close command palette / dialogs |

---

## Tips & Common Workflows

### Setting up a new domain

1. Go to **Admin → Domain Management** → **New Domain**.
2. Add subdomains with **Add Subdomain**.
3. Go to **Data Assets → Register Table** to register Snowflake tables.
4. Go to **Rules → New Rule** to create checks for each table.

### Getting rules from AI

1. Open **AI → AI Assistant**.
2. Ask: *"Suggest rules for Revenue Billing invoices table"*.
3. Review the suggestions in **Rules** → filter Status = Pending Review.
4. Approve or reject each rule.

### Investigating a quality drop

1. **Global Dashboard** → trend chart shows when the drop started.
2. Click the affected domain → compare subdomain scores.
3. Click the lowest subdomain → find the failing table.
4. Click the table → see which rules failed.
5. Click a failing rule → **Run History** tab → expand the failing run for sample records.
6. Ask the AI: *"Explain the failure on [rule_name]"*.

### Setting up hourly monitoring

1. Go to **Schedules → New Schedule**.
2. Select level **Table**, pick the asset, set **Frequency = hourly**.
3. Save. All active rules for that table run every hour.
