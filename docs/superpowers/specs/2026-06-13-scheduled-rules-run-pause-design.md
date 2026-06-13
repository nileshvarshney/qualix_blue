# Scheduled Rules: Side Drawer with Per-Rule Run, Status, and Failure Detail

## Problem

On the Schedules page, clicking a table schedule row expands an inline panel
showing a "Scheduled Rules" list (`bundledRules`) and any last-run issues.
Today each rule only shows severity, name, and description, with a "Pause"
button. This is missing:

- Any way to run a single rule on demand.
- Last-run result, timestamp, duration, and next-run time per rule.
- Pausing a rule (`status='disabled'`) removes it from `bundled_rules`
  entirely (table-level query filters `DQRule.is_active == True`), so paused
  rules silently disappear with no way to unpause from this view.
- Failed rules show no detail about what failed.

Additionally, the inline expand panel is cramped. We're replacing it with a
right-side drawer (following the `RunDetailPanel` pattern already used on the
Run History page), giving each rule room for full detail.

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

### Frontend: types and mapping (`frontend/src/app/schedules/page.tsx`)

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

### Replace inline expand with a side drawer

Remove the existing inline expand panel (the `isExpanded` block rendering
"Scheduled Rules" and "Last Run Issues" under the row). Clicking a schedule
row instead sets `selectedId` state, which renders a new
`ScheduleDetailDrawer` component.

#### New component: `ScheduleDetailDrawer`

New file: `frontend/src/components/shared/ScheduleDetailDrawer.tsx`

- Props: `schedule: Schedule`, `onClose: () => void`, plus action callbacks
  `onRunSchedule`, `onToggleSchedule`, `onRunRule`, `onSetRuleStatus` (all
  delegate to the existing/new handlers in the page, which call
  `refreshSchedules()` on completion).
- No separate fetch needed — `scheduleList` already contains `bundledRules`
  and `issues` for every schedule, so the drawer just renders the passed-in
  `schedule` object. When `refreshSchedules()` updates `scheduleList`, the
  drawer re-renders with fresh data automatically (parent looks up
  `scheduleList.find(s => s.id === selectedId)` each render).
- Positioning matches `RunDetailPanel`: `position: fixed, top: 0, right: 0,
  bottom: 0, width: min(640px, 92vw)`, border-left, shadow, z-index above
  page content.
- Clicking a different schedule row while the drawer is open swaps
  `selectedId` directly — the drawer re-renders for the new schedule without
  closing.

#### Drawer header

- Table FQN (`schedule.tableFqn`), cron summary (`human`/`cron`), last run /
  next run / duration summary line.
- Schedule-level result badge (`lastRunStatus`).
- Actions: "▶ Run Now" (`onRunSchedule`), pause/resume icon
  (`onToggleSchedule`), close button (`onClose`).

#### Drawer body — "Scheduled Rules" section

Heading: `Scheduled Rules — {bundledRules.length}`.

Each rule renders as a two-line card:

- **Line 1**: severity badge, rule name, rule description (truncated), and
  right-aligned action buttons — "▶ Run" / "⏳" while running
  (`onRunRule`), and pause/unpause icon (`onSetRuleStatus`).
- **Line 2** (muted, small text): `Last run: {lastRunAt formatted}`, result
  badge (✓ passed / ✕ failed / ⚠ warning / nothing if never run), `Next run:
  {nextRun formatted or "—"}`, `Duration: {formatDuration(lastDurationMs)}`.
  For rules that have never run, show `Never run · Next run: {nextRun}`.

Paused rules (`status === 'disabled'`): card rendered with reduced opacity /
muted background, a "Paused" badge next to the severity badge, "Next run: —",
and the pause icon replaced with "▶" (unpause).

#### Failed-rule expand

For a rule whose `lastRunStatus === 'failed'`, the result badge on line 2
becomes `"✕ failed · {failedRowsCount} rows ▾"` and is clickable, toggling a
per-rule expanded state (`expandedRuleId`, local to the drawer). When
expanded, render a detail card below the card using the existing issue-card
two-column style (`Root Cause` / `Impact`):

- Root Cause: `aiExplanation` if present, else a generated sentence from
  `failedRowsCount`/`totalRowsScanned`/`failurePercentage`
  (e.g. "1,284 / 50,000 rows (2.6%) failed this rule's check."), else
  `errorMessage`, else "No additional detail available."
- Impact: `errorMessage` if `aiExplanation` was used for Root Cause, else
  omit the Impact column (single-column card).

#### Drawer body — "Last Run Issues" section

Below "Scheduled Rules", if `schedule.issues.length > 0`, render the existing
issue cards (currently rendered in the inline expand panel) unchanged.

### Actions

- **Run rule**: new `runRule(ruleId: string)` in the page:
  - Tracks in-flight state via `runningRuleId` (separate from schedule-level
    `runningId`).
  - `POST /api/rules/{ruleId}/run` (existing proxy →
    `/execute/rule/{rule_id}/sync`).
  - On completion (success or error), call `refreshSchedules()`.

- **Pause/Unpause rule**: generalize existing `pauseRule(ruleId)` to
  `setRuleStatus(ruleId: string, status: 'active' | 'disabled')`:
  - `PATCH /api/rules/{ruleId}/status` with `{ status }`.
  - Icon shows "⏸" when `status === 'active'` (pauses → sends `'disabled'`),
    "▶" when `'disabled'` (unpauses → sends `'active'`).
  - Tracked via existing `pausingRuleId` loading state.
  - On completion, `refreshSchedules()`.

### Page-level changes summary (`frontend/src/app/schedules/page.tsx`)

- Remove `expandedId`, `canExpand`, and the inline expand panel JSX.
- Add `selectedId: string | null` state; clicking a schedule row toggles it
  (click again or close button → `null`).
- When `selectedId` is set, render `<ScheduleDetailDrawer schedule={...} ... />`.
- Existing per-row "▶ Run" / pause icons in the list stay as-is (operate on
  the whole schedule), independent of the drawer.

## Out of scope

- No per-rule cron/schedule editing — rules inherit the parent schedule's
  cron; "Next Run" is read-only and derived from the schedule.
- No run-history list per rule (only the single latest run is shown inline).
  Linking to a fuller rule run-history view is a future enhancement.
- No changes to the schedule-level row/columns in the main list.
