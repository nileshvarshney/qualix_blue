# Scheduled Rules: Per-Rule Run, Status, and Failure Detail

## Problem

On the Schedules page, expanding a table schedule shows a "Scheduled Rules"
list (`bundledRules`). Today each rule only shows severity, name, and
description, with a "Pause" button. This is missing:

- Any way to run a single rule on demand.
- Last-run result, timestamp, duration, and next-run time per rule.
- Pausing a rule (`status='disabled'`) removes it from `bundled_rules`
  entirely (table-level query filters `DQRule.is_active == True`), so paused
  rules silently disappear with no way to unpause from this view.
- Failed rules show no detail about what failed.

## Design

### Backend: `app/api/schedules.py` `/schedules/enriched`

In `list_schedules_enriched`, for the table-level bundled-rules branch
(currently `DQRule.where(asset_id == ..., is_active == True)`), change the
filter to `DQRule.status.in_(["active", "disabled"])` so disabled (paused)
rules remain in the list while draft/pending_review/archived rules stay
excluded.

For every bundled rule, in both the table-level and explicit `rule_ids`
branches, fetch its latest run:

```python
latest = await db.execute(
    select(DQRuleRun)
    .where(DQRuleRun.rule_id == bundled_rule.rule_id)
    .order_by(DQRuleRun.created_at.desc())
    .limit(1)
)
run = latest.scalar_one_or_none()
```

Add to each `bundled_rules` entry:

- `status`: `bundled_rule.status` (`"active"` | `"disabled"`)
- `last_run_status`: `run.status` or `None`
- `last_run_at`: `run.execution_end_time` (fallback `run.created_at`)
  isoformat, or `None`
- `last_duration_ms`: `(execution_end_time - execution_start_time)` in ms if
  both set, else `None`
- `next_run`: the schedule's own `next_run_time` (already computed via
  `get_next_run(s.schedule_id)`) if `bundled_rule.status == "active"`, else
  `None`
- `failed_rows_count`, `total_rows_scanned`, `failure_percentage`,
  `error_message`, `ai_explanation` from `run` (all `None` if no run exists)

### Frontend: `frontend/src/app/schedules/page.tsx`

#### Types

Extend `BundledRule`:

```ts
interface BundledRule {
  ruleId: string
  ruleName: string
  ruleDescription: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'active' | 'disabled'
  lastRunStatus: LastRunStatus | null
  lastRunAt: string | null
  lastDurationMs: number | null
  nextRun: string | null
  failedRowsCount: number | null
  totalRowsScanned: number | null
  failurePercentage: number | null
  errorMessage: string | null
  aiExplanation: string | null
}
```

Update `mapSchedule`'s `bundledRules` mapping to read these new fields from
the enriched response (snake_case → camelCase, same pattern as existing
fields).

Add a `formatDuration(ms: number | null): string` helper: `null` → `"—"`,
`< 1000` → `"850ms"`, `< 60000` → `"1.4s"`, else `"1m 23s"`.

#### Rule row layout

Each bundled rule renders as a row using the **same grid** as the schedule
row (`GRID = '1fr 100px 80px 80px 90px 90px 110px auto'`) with the same
`gap`/padding, so it aligns under the existing column header:

| Column | Content |
|---|---|
| Schedule · Cron | severity badge + rule name + description |
| Last Run | `lastRunAt` formatted, or "—" |
| Result | badge: ✓ passed / ✕ failed / ⚠ warning / "—" if never run. For failed rules, badge text becomes `"✕ failed · {failedRowsCount} rows ▾"` and is clickable. |
| Next Run | `nextRun` formatted, or "—" for paused/never-scheduled |
| Duration | `formatDuration(lastDurationMs)` |
| Rules | "—" (column doesn't apply to a single rule) |
| Status | "active" or "paused" badge (muted style for paused) |
| Actions | pause/unpause icon button + Run button |

Paused rules (`status === 'disabled'`): row rendered with reduced opacity /
muted background (matching `STATUS_STYLE.paused`), Status badge shows
"paused", Next Run shows "—".

#### Failed-rule expand

Clicking the Result badge of a failed rule (only) toggles a per-rule expanded
state (`expandedRuleId`, separate from the schedule's `expandedId`). When
expanded, render a detail card below the row using the existing issue-card
two-column style (`Root Cause` / `Impact`):

- Root Cause: `aiExplanation` if present, else a generated sentence from
  `failedRowsCount`/`totalRowsScanned`/`failurePercentage`
  (e.g. "1,284 / 50,000 rows (2.6%) failed this rule's check."), else
  `errorMessage`, else "No additional detail available."
- Impact: `errorMessage` if `aiExplanation` was used for Root Cause, else
  omit the Impact column (single-column card).

#### Actions

- **Run**: new `runRule(ruleId: string)`:
  - Tracks in-flight state via `runningRuleId` (separate from schedule-level
    `runningId`).
  - `POST /api/rules/{ruleId}/run` (existing proxy →
    `/execute/rule/{rule_id}/sync`).
  - Button shows "▶ Run" normally, "⏳" while in flight (icon-only, matching
    the pause/unpause icon button size).
  - On completion (success or error), call `refreshSchedules()` to pick up
    updated last-run data.

- **Pause/Unpause**: generalize existing `pauseRule(ruleId)` to
  `setRuleStatus(ruleId: string, status: 'active' | 'disabled')`:
  - `PATCH /api/rules/{ruleId}/status` with `{ status }`.
  - Button shows "⏸" when `status === 'active'` (pauses → sends
    `'disabled'`), "▶" when `'disabled'` (unpauses → sends `'active'`).
  - Tracked via existing `pausingRuleId` loading state.
  - On completion, `refreshSchedules()`.

## Out of scope

- No per-rule cron/schedule editing — rules inherit the parent schedule's
  cron; "Next Run" is read-only and derived from the schedule.
- No run-history list per rule (only the single latest run is shown inline).
  Linking to a fuller rule run-history view is a future enhancement.
- No changes to the schedule-level row/columns themselves.
