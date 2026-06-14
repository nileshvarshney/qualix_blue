# Grouped Execution Logs

## Problem

The Execution Logs page (`frontend/src/app/execution-logs/page.tsx`) currently lists one row per individual `DQRuleRun` (a single rule's execution), grouped only by date. When a table/view has many rules, the log becomes a long flat list of per-rule rows that's hard to scan as "what happened when this table was checked."

## Goal

Display execution log entries grouped at the table/view level by job execution — i.e., one row represents a batch of rule checks run against a table/view at roughly the same time. If a table/view was checked twice (two separate job executions), it produces two rows.

## Data Source

No backend changes. Continue using `/api/execution-logs` → `/runs/enriched`, which returns one entry per `DQRuleRun` with `asset_id`/`sf_database_name`/`sf_schema_name`/`sf_table_name` (table/view identity), `execution_start_time`, `execution_end_time`, `rule_name`, `rule_type`, `status`, `quality_score`, `checked_rows`/`failed_rows`, `trigger_type`, `run_by`.

## Grouping Algorithm (client-side)

1. Map raw API rows to `ExecLog` records as today (no schema change to `ExecLog`).
2. Bucket `ExecLog` records by asset identity: `connection + dataset` (i.e., `sf_database_name.sf_schema_name.sf_table_name`, or `asset_id` if available).
3. Within each asset bucket, sort records by `ts` (execution_start_time) ascending.
4. Walk the sorted list and start a new group whenever the gap between the current record's `ts` and the previous record's `ts` exceeds **5 minutes**. Consecutive records within 5 minutes of each other belong to the same job-execution group.
5. Each resulting group becomes one `GroupedExecLog` row.

This is pure client-side derivation from the existing flat list — no new API fields required.

## GroupedExecLog Shape

```ts
interface GroupedExecLog {
  id: string                 // first member's id, used as React key
  dataset: string
  connection: string
  ts: string                 // earliest execution_start_time in the group
  status: RunStatus           // worst across members: failed > warning > passed
  score: number               // average quality_score across members (rounded)
  checked: number             // sum of checked across members
  failed: number               // sum of failed across members
  duration: string             // sum of member durations, formatted (e.g. "12.4s")
  trigger: string              // from first member
  runBy: string                // from first member
  rules: ExecLog[]             // member rule runs, in original order
}
```

- Status precedence for "worst": `failed` > `warning` > `passed`.
- Duration: each member's `duration_seconds` summed; format with the same `Xs` convention used today. If any member has no duration, treat as 0 for the sum.
- Score: arithmetic mean of member `score` values, rounded to nearest integer.

## Date Grouping (unchanged mechanism, new input)

The existing `dateGroup()` / `GROUP_ORDER` (Today / Yesterday / older dates) logic is unchanged, but now operates on `GroupedExecLog.ts` instead of per-rule `ExecLog.ts`.

## Row Layout

Column header changes from:

```
Timestamp | Rule · Type | Dataset | Status | Score | Checked / Failed | Duration | Trigger | ▾
```

to:

```
Timestamp | Table/View · Connection | Rules | Status | Score | Checked / Failed | Duration | Trigger | ▾
```

- "Rules" column shows a count badge, e.g. `5 rules` (singular `1 rule`).
- Grid template columns stay structurally similar (`GRID` constant adjusted only if needed for the new column content — same 9-column layout).

## Expanded View (two levels)

**Level 1 (group expand):** Clicking a grouped row toggles `expanded` (group id). When expanded, render a nested list of the group's `rules` (member `ExecLog[]`), each as a sub-row showing: `Rule · Type`, `Status`, `Score`, `Checked/Failed`, `Duration` — i.e. the same per-rule row content the page renders today, indented one level (reuse existing styling pattern: `marginLeft`, `borderLeft`).

**Level 2 (rule expand):** Clicking a member rule sub-row toggles a second expansion state (`expandedRule`, keyed by rule run id) showing the existing detail panel: Rule Type/Checked/Failed/Duration/Trigger/Run By strip, Failure Reason, Root Cause, Impact/Recommendation, Rule Query/Error Sample — unchanged content and styling from today's single-level expand, just nested one level deeper.

Only one group and one rule-within-group can be expanded at a time (single `expanded` + single `expandedRule` state, matching current single-expansion behavior).

## Stat Cards

`Total (24h)`, `Passed`, `Failed`, `Warnings`, `Avg Score` are computed over **all groups** (pre-filter, matching today's pattern where stat cards reflect `logs` not `filtered`):
- `Total` = number of groups
- `Passed`/`Failed`/`Warnings` = count of groups whose `status` equals that value
- `Avg Score` = mean of group `score` values

## Filtering & Search

- `statusFilter`: a group passes if `group.status === statusFilter`.
- `search`: a group passes if `group.dataset` matches, OR any `group.rules[i].rule` matches the search term (case-insensitive substring, as today).

## CSV Export

`exportExecCsv` continues to export one row per individual rule run (flattening `filtered` groups' `rules[]`), preserving today's level of detail (Date, Rule, Dataset, Status, Score, Rows Checked, Rows Failed, Duration per rule run). The date column uses each rule's own `ts`, not the group's.

## Out of Scope

- No backend/API changes.
- No new persisted "job run" identifier — grouping is a presentation-layer derivation.
- Date-range filters, pagination, and the existing 200-row API limit are unchanged.
