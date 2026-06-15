# Scheduled Rules Side Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Schedules page, replace the inline expand panel with a right-side drawer (`ScheduleDetailDrawer`) that shows per-rule run/pause controls, last-run result/timestamp/duration, next-run time, and click-to-expand failure detail — while keeping paused rules visible with an unpause option.

**Architecture:** Backend (`app/api/schedules.py`) enriches each `bundled_rules` entry in `/schedules/enriched` with the rule's `status` and its latest `DQRuleRun` stats, and stops excluding disabled rules from table-level schedules. Frontend extracts shared types/styles/helpers from `frontend/src/app/schedules/page.tsx` into `frontend/src/lib/schedules.ts`, adds a new `ScheduleDetailDrawer` component (same fixed-position pattern as `RunDetailPanel`), and wires it into the page in place of the inline expand panel, with new `runRule` and generalized `setRuleStatus` actions.

**Tech Stack:** FastAPI + SQLAlchemy async ORM (backend), Next.js App Router + React + TypeScript (frontend), pytest with `asyncio_mode = auto` (backend tests).

---

### Task 1: Backend — `_format_rule_run_info` helper

**Files:**
- Modify: `app/api/schedules.py` (add import + helper function near top of file, before `list_schedules_enriched`)
- Test: `tests/test_schedule_rule_run_info.py` (new file)

- [ ] **Step 1: Write the failing test**

Create `tests/test_schedule_rule_run_info.py`:

```python
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.api.schedules import _format_rule_run_info
from app.db.models import DQRuleRun


def _make_run(**overrides):
    run = MagicMock(spec=DQRuleRun)
    run.rule_id = overrides.get("rule_id", "rule-1")
    run.status = overrides.get("status", "passed")
    run.execution_start_time = overrides.get(
        "execution_start_time", datetime(2026, 6, 13, 2, 0, 0, tzinfo=timezone.utc)
    )
    run.execution_end_time = overrides.get(
        "execution_end_time", datetime(2026, 6, 13, 2, 0, 1, 400000, tzinfo=timezone.utc)
    )
    run.created_at = overrides.get("created_at", run.execution_end_time)
    run.failed_rows_count = overrides.get("failed_rows_count", 0)
    run.total_rows_scanned = overrides.get("total_rows_scanned", 50000)
    run.failure_percentage = overrides.get("failure_percentage", 0.0)
    run.error_message = overrides.get("error_message", None)
    run.ai_explanation = overrides.get("ai_explanation", None)
    return run


def test_active_rule_with_run_returns_full_info():
    run = _make_run()
    info = _format_rule_run_info(run, "active", "2026-06-14T02:00:00")

    assert info["status"] == "active"
    assert info["last_run_status"] == "passed"
    assert info["last_run_at"] == "2026-06-13T02:00:01.400000+00:00"
    assert info["last_duration_ms"] == 1400
    assert info["next_run"] == "2026-06-14T02:00:00"
    assert info["failed_rows_count"] == 0
    assert info["total_rows_scanned"] == 50000
    assert info["failure_percentage"] == 0.0
    assert info["error_message"] is None
    assert info["ai_explanation"] is None


def test_disabled_rule_has_no_next_run():
    run = _make_run()
    info = _format_rule_run_info(run, "disabled", "2026-06-14T02:00:00")

    assert info["status"] == "disabled"
    assert info["next_run"] is None


def test_rule_with_no_run_returns_nulls():
    info = _format_rule_run_info(None, "active", "2026-06-14T02:00:00")

    assert info["status"] == "active"
    assert info["last_run_status"] is None
    assert info["last_run_at"] is None
    assert info["last_duration_ms"] is None
    assert info["next_run"] == "2026-06-14T02:00:00"
    assert info["failed_rows_count"] is None
    assert info["total_rows_scanned"] is None
    assert info["failure_percentage"] is None
    assert info["error_message"] is None
    assert info["ai_explanation"] is None


def test_run_missing_end_time_has_no_duration():
    run = _make_run(execution_end_time=None)
    info = _format_rule_run_info(run, "active", None)

    assert info["last_duration_ms"] is None
    assert info["last_run_at"] == run.created_at.isoformat()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_schedule_rule_run_info.py -v`
Expected: FAIL with `ImportError: cannot import name '_format_rule_run_info' from 'app.api.schedules'`

- [ ] **Step 3: Write minimal implementation**

In `app/api/schedules.py`, add `DQRuleRun` to the model imports at the top of the file (currently `from app.db.models import DQSchedule, DQRule, Domain, Subdomain, Asset, SnowflakeConnection`):

```python
from app.db.models import DQSchedule, DQRule, DQRuleRun, Domain, Subdomain, Asset, SnowflakeConnection
```

Then add the helper function near the top of the file, after the imports and before the `_register` helper (or any other module-level helper already present):

```python
def _format_rule_run_info(run, rule_status: str, next_run_time: str | None) -> dict:
    """Build the per-rule run-status fields merged into each bundled_rules entry."""
    if run is None:
        return {
            "status": rule_status,
            "last_run_status": None,
            "last_run_at": None,
            "last_duration_ms": None,
            "next_run": next_run_time if rule_status == "active" else None,
            "failed_rows_count": None,
            "total_rows_scanned": None,
            "failure_percentage": None,
            "error_message": None,
            "ai_explanation": None,
        }

    last_run_at = run.execution_end_time or run.created_at
    last_duration_ms = None
    if run.execution_start_time and run.execution_end_time:
        delta = run.execution_end_time - run.execution_start_time
        last_duration_ms = round(delta.total_seconds() * 1000)

    return {
        "status": rule_status,
        "last_run_status": run.status,
        "last_run_at": last_run_at.isoformat() if last_run_at else None,
        "last_duration_ms": last_duration_ms,
        "next_run": next_run_time if rule_status == "active" else None,
        "failed_rows_count": run.failed_rows_count,
        "total_rows_scanned": run.total_rows_scanned,
        "failure_percentage": run.failure_percentage,
        "error_message": run.error_message,
        "ai_explanation": run.ai_explanation,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_schedule_rule_run_info.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
git add app/api/schedules.py tests/test_schedule_rule_run_info.py
git commit -m "feat(schedules): add _format_rule_run_info helper for per-rule run stats"
```

---

### Task 2: Backend — wire per-rule run info into `/schedules/enriched`

**Files:**
- Modify: `app/api/schedules.py` (the `list_schedules_enriched` bundled-rules block, around lines 240-267 and the `next_run_time` line around 293)
- Test: `tests/test_schedules_enriched_bundled_rules.py` (new file)

- [ ] **Step 1: Write the failing integration test**

Create `tests/test_schedules_enriched_bundled_rules.py`:

```python
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.schedules import list_schedules_enriched
from app.db.models import Asset, DQRule, DQRuleRun, DQSchedule


def _scalars_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _scalar_one_result(item):
    result = MagicMock()
    result.scalar_one_or_none.return_value = item
    return result


@pytest.mark.asyncio
async def test_table_level_schedule_includes_disabled_rule_with_run_info():
    schedule = MagicMock(spec=DQSchedule)
    schedule.schedule_id = "sch-1"
    schedule.schedule_name = "orders-daily"
    schedule.rule_id = None
    schedule.rule_ids = None
    schedule.asset_id = "asset-1"
    schedule.domain_id = None
    schedule.subdomain_id = None
    schedule.schedule_level = "table"
    schedule.frequency = "daily"
    schedule.cron_expression = "0 2 * * *"
    schedule.timezone = "UTC"
    schedule.run_at_hour = 2
    schedule.run_at_minute = 0
    schedule.is_active = True
    schedule.created_at = datetime(2026, 6, 1, tzinfo=timezone.utc)
    schedule.updated_at = datetime(2026, 6, 1, tzinfo=timezone.utc)

    asset = MagicMock(spec=Asset)
    asset.asset_id = "asset-1"
    asset.sf_database_name = "ANALYTICS"
    asset.sf_schema_name = "PUBLIC"
    asset.sf_table_name = "ORDERS"
    asset.connection_id = None

    rule_active = MagicMock(spec=DQRule)
    rule_active.rule_id = "rule-1"
    rule_active.rule_name = "order_id not null"
    rule_active.rule_description = "Ensures order_id has no missing values"
    rule_active.severity = "critical"
    rule_active.status = "active"

    rule_disabled = MagicMock(spec=DQRule)
    rule_disabled.rule_id = "rule-2"
    rule_disabled.rule_name = "discount check"
    rule_disabled.rule_description = "Discount must not exceed 100%"
    rule_disabled.severity = "medium"
    rule_disabled.status = "disabled"

    run_active = MagicMock(spec=DQRuleRun)
    run_active.rule_id = "rule-1"
    run_active.status = "passed"
    run_active.execution_start_time = datetime(2026, 6, 13, 2, 0, 0, tzinfo=timezone.utc)
    run_active.execution_end_time = datetime(2026, 6, 13, 2, 0, 1, 400000, tzinfo=timezone.utc)
    run_active.created_at = run_active.execution_end_time
    run_active.failed_rows_count = 0
    run_active.total_rows_scanned = 50000
    run_active.failure_percentage = 0.0
    run_active.error_message = None
    run_active.ai_explanation = None

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result([schedule]),       # select(DQSchedule)
        _scalar_one_result(asset),         # select(Asset)
        _scalars_result([rule_active, rule_disabled]),  # select(DQRule) bundled rules
        _scalar_one_result(run_active),    # select(DQRuleRun) for rule-1
        _scalar_one_result(None),          # select(DQRuleRun) for rule-2
    ]

    with patch("app.api.schedules.get_next_run", return_value="2026-06-14T02:00:00"):
        result = await list_schedules_enriched(limit=200, db=db)

    bundled = result[0]["bundled_rules"]
    assert len(bundled) == 2

    active_entry = next(r for r in bundled if r["rule_id"] == "rule-1")
    assert active_entry["status"] == "active"
    assert active_entry["last_run_status"] == "passed"
    assert active_entry["last_duration_ms"] == 1400
    assert active_entry["next_run"] == "2026-06-14T02:00:00"

    disabled_entry = next(r for r in bundled if r["rule_id"] == "rule-2")
    assert disabled_entry["status"] == "disabled"
    assert disabled_entry["last_run_status"] is None
    assert disabled_entry["next_run"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_schedules_enriched_bundled_rules.py -v`
Expected: FAIL — either an assertion error (disabled rule missing from `bundled_rules`, or missing `last_run_status`/`last_duration_ms`/`next_run` keys), because the current query filters `DQRule.is_active == True` and doesn't fetch `DQRuleRun`.

- [ ] **Step 3: Read the current bundled-rules block to confirm exact text**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && grep -n "Resolve bundled rule summaries\|next_run_time\":" app/api/schedules.py`

- [ ] **Step 4: Replace the bundled-rules resolution block**

In `app/api/schedules.py`, find this block (inside `list_schedules_enriched`, after the connection/asset resolution and before building the output dict):

```python
        # Resolve bundled rule summaries
        rule_ids_list = _rule_ids_from_db(s.rule_ids)
        bundled_rules = []
        if s.schedule_level == "table" and s.asset_id:
            # Table-level schedules cover every active/approved rule for the asset,
            # not just the rules captured in rule_ids at creation time.
            rr = await db.execute(
                select(DQRule).where(DQRule.asset_id == s.asset_id, DQRule.is_active == True)
            )
            for bundled_rule in rr.scalars().all():
                bundled_rules.append({
                    "rule_id": bundled_rule.rule_id,
                    "rule_name": bundled_rule.rule_name,
                    "rule_description": bundled_rule.rule_description,
                    "severity": bundled_rule.severity,
                })
            rule_ids_list = [r["rule_id"] for r in bundled_rules]
        elif rule_ids_list:
            for rid in rule_ids_list:
                rr = await db.execute(select(DQRule).where(DQRule.rule_id == rid))
                bundled_rule = rr.scalar_one_or_none()
                if bundled_rule:
                    bundled_rules.append({
                        "rule_id": bundled_rule.rule_id,
                        "rule_name": bundled_rule.rule_name,
                        "rule_description": bundled_rule.rule_description,
                        "severity": bundled_rule.severity,
                    })
```

Replace it with:

```python
        # Resolve bundled rule summaries
        next_run_time = get_next_run(s.schedule_id)

        rule_ids_list = _rule_ids_from_db(s.rule_ids)
        bundled_rule_models = []
        if s.schedule_level == "table" and s.asset_id:
            # Table-level schedules cover every active/disabled rule for the asset,
            # not just the rules captured in rule_ids at creation time. Disabled
            # (paused) rules stay in the list so they remain visible/unpausable.
            rr = await db.execute(
                select(DQRule).where(
                    DQRule.asset_id == s.asset_id,
                    DQRule.status.in_(["active", "disabled"]),
                )
            )
            bundled_rule_models = list(rr.scalars().all())
            rule_ids_list = [r.rule_id for r in bundled_rule_models]
        elif rule_ids_list:
            for rid in rule_ids_list:
                rr = await db.execute(select(DQRule).where(DQRule.rule_id == rid))
                bundled_rule = rr.scalar_one_or_none()
                if bundled_rule:
                    bundled_rule_models.append(bundled_rule)

        bundled_rules = []
        for bundled_rule in bundled_rule_models:
            run_result = await db.execute(
                select(DQRuleRun)
                .where(DQRuleRun.rule_id == bundled_rule.rule_id)
                .order_by(DQRuleRun.created_at.desc())
                .limit(1)
            )
            latest_run = run_result.scalar_one_or_none()
            entry = {
                "rule_id": bundled_rule.rule_id,
                "rule_name": bundled_rule.rule_name,
                "rule_description": bundled_rule.rule_description,
                "severity": bundled_rule.severity,
            }
            entry.update(_format_rule_run_info(latest_run, bundled_rule.status, next_run_time))
            bundled_rules.append(entry)
```

- [ ] **Step 5: Remove the now-duplicate `next_run_time` computation in the output dict**

Find this line later in the same function (in the dict returned per schedule):

```python
            "next_run_time":  get_next_run(s.schedule_id),
```

Replace it with:

```python
            "next_run_time":  next_run_time,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_schedules_enriched_bundled_rules.py tests/test_schedule_rule_run_info.py -v`
Expected: PASS (5 tests total)

- [ ] **Step 7: Run the full schedules test suite to check for regressions**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/ -k schedule -v`
Expected: PASS (no regressions in other schedule-related tests)

- [ ] **Step 8: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
git add app/api/schedules.py tests/test_schedules_enriched_bundled_rules.py
git commit -m "feat(schedules): include disabled rules and per-rule run info in bundled_rules"
```

---

### Task 3: Frontend — extract shared types/styles into `frontend/src/lib/schedules.ts`

**Files:**
- Create: `frontend/src/lib/schedules.ts`
- Modify: `frontend/src/app/schedules/page.tsx` (remove the moved definitions, add the import)

- [ ] **Step 1: Create `frontend/src/lib/schedules.ts`**

```typescript
export type LastRunStatus = 'passed' | 'failed' | 'warning'
export type ScheduleStatus = 'active' | 'paused'

export interface RunIssue {
  rule: string
  severity: 'critical' | 'warning' | 'info'
  detail: string
  impact: string
  failedRows: string
}

export interface BundledRule {
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

export interface Schedule {
  id: string; name: string; dataset: string; tableFqn: string; cron: string; human: string
  frequency: string; runAtHour: number | null; runAtMinute: number | null
  rules: number; lastRun: string; nextRun: string; status: ScheduleStatus
  lastRunStatus: LastRunStatus; lastDuration: string; connection: string
  owner: string; failedRules: number; checkedRows: string; failedRows: string
  issues: RunIssue[]; bundledRules: BundledRule[]
}

export const SEV_CFG = {
  critical: { color: '#dc2626', bg: '#fee2e2', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fef3c7', label: 'Warning'  },
  info:     { color: '#2563eb', bg: '#dbeafe', label: 'Info'     },
}

export const RUN_STYLE: Record<LastRunStatus, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  warning: { background: '#fef3c7', color: '#d97706' },
}

export const STATUS_STYLE: Record<ScheduleStatus, { background: string; color: string }> = {
  active: { background: '#f0fdf4', color: '#16a34a' },
  paused: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

export const RULE_SEV_CFG: Record<BundledRule['severity'], { color: string; bg: string }> = {
  critical: { color: '#dc2626', bg: '#fee2e2' },
  high:     { color: '#d97706', bg: '#fef3c7' },
  medium:   { color: '#2563eb', bg: '#dbeafe' },
  low:      { color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
}

function mapLastRunStatus(value: unknown): LastRunStatus | null {
  if (value === 'passed' || value === 'warning') return value
  if (value === 'failed' || value === 'error') return 'failed'
  return null
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const remSecs = Math.round(secs % 60)
  return `${mins}m ${remSecs}s`
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function mapSchedule(s: Record<string, unknown>, i: number): Schedule {
  const dataset = String(s.asset_name ?? s.dataset ?? '')
  const tableFqn = [s.asset_database, s.asset_schema, s.asset_name]
    .filter(v => typeof v === 'string' && v)
    .join('.') || dataset || '(unscoped)'
  return {
    id:            String(s.schedule_id ?? s.id ?? i),
    name:          String(s.schedule_name ?? s.name ?? ''),
    dataset,
    tableFqn,
    cron:          String(s.cron_expression ?? s.cron ?? ''),
    human:         String(s.human_readable ?? s.human ?? s.cron_expression ?? ''),
    frequency:     String(s.frequency ?? 'daily'),
    runAtHour:     s.run_at_hour === null || s.run_at_hour === undefined ? null : Number(s.run_at_hour),
    runAtMinute:   s.run_at_minute === null || s.run_at_minute === undefined ? null : Number(s.run_at_minute),
    rules:         Number(s.rule_count ?? s.rules ?? 0),
    lastRun:       String(s.last_run_at ?? s.lastRun ?? '—'),
    nextRun:       String(s.next_run_at ?? s.nextRun ?? '—'),
    status:        (s.is_active ? 'active' : 'paused') as ScheduleStatus,
    lastRunStatus: (['passed', 'failed', 'warning'] as const).includes(s.last_run_status as 'passed' | 'failed' | 'warning')
                     ? (s.last_run_status as 'passed' | 'failed' | 'warning')
                     : 'passed',
    lastDuration:  String(s.last_duration ?? s.lastDuration ?? '—'),
    connection:    String(s.connection_name ?? s.connection ?? '(no connection)'),
    owner:         String(s.owner ?? ''),
    failedRules:   Number(s.failed_rules ?? s.failedRules ?? 0),
    checkedRows:   String(s.checked_rows ?? s.checkedRows ?? '0'),
    failedRows:    String(s.failed_rows ?? s.failedRows ?? '0'),
    issues:        Array.isArray(s.issues) ? s.issues as RunIssue[] : [],
    bundledRules:  Array.isArray(s.bundled_rules) ? (s.bundled_rules as Record<string, unknown>[]).map(r => ({
                     ruleId: String(r.rule_id ?? ''),
                     ruleName: String(r.rule_name ?? ''),
                     ruleDescription: String(r.rule_description ?? ''),
                     severity: (r.severity ?? 'medium') as BundledRule['severity'],
                     status: (r.status === 'disabled' ? 'disabled' : 'active') as BundledRule['status'],
                     lastRunStatus: mapLastRunStatus(r.last_run_status),
                     lastRunAt: typeof r.last_run_at === 'string' ? r.last_run_at : null,
                     lastDurationMs: typeof r.last_duration_ms === 'number' ? r.last_duration_ms : null,
                     nextRun: typeof r.next_run === 'string' ? r.next_run : null,
                     failedRowsCount: typeof r.failed_rows_count === 'number' ? r.failed_rows_count : null,
                     totalRowsScanned: typeof r.total_rows_scanned === 'number' ? r.total_rows_scanned : null,
                     failurePercentage: typeof r.failure_percentage === 'number' ? r.failure_percentage : null,
                     errorMessage: typeof r.error_message === 'string' ? r.error_message : null,
                     aiExplanation: typeof r.ai_explanation === 'string' ? r.ai_explanation : null,
                   })) : [],
  }
}
```

- [ ] **Step 2: Remove the moved definitions from `frontend/src/app/schedules/page.tsx`**

In `frontend/src/app/schedules/page.tsx`, find this block at the top of the file (from `'use client'` through the end of the `RULE_SEV_CFG` constant, immediately before `export default function SchedulesPage() {`):

```typescript
'use client'
import { useState, useEffect } from 'react'

type LastRunStatus = 'passed' | 'failed' | 'warning'
type ScheduleStatus = 'active' | 'paused'
type FilterType = 'all' | 'active' | 'paused' | 'failed'

interface RunIssue {
  rule: string
  severity: 'critical' | 'warning' | 'info'
  detail: string
  impact: string
  failedRows: string
}

interface BundledRule {
  ruleId: string
  ruleName: string
  ruleDescription: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

interface Schedule {
  id: string; name: string; dataset: string; tableFqn: string; cron: string; human: string
  frequency: string; runAtHour: number | null; runAtMinute: number | null
  rules: number; lastRun: string; nextRun: string; status: ScheduleStatus
  lastRunStatus: LastRunStatus; lastDuration: string; connection: string
  owner: string; failedRules: number; checkedRows: string; failedRows: string
  issues: RunIssue[]; bundledRules: BundledRule[]
}

const SEV_CFG = {
  critical: { color: '#dc2626', bg: '#fee2e2', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fef3c7', label: 'Warning'  },
  info:     { color: '#2563eb', bg: '#dbeafe', label: 'Info'     },
}

const RUN_STYLE: Record<LastRunStatus, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  warning: { background: '#fef3c7', color: '#d97706' },
}

const STATUS_STYLE: Record<ScheduleStatus, { background: string; color: string }> = {
  active: { background: '#f0fdf4', color: '#16a34a' },
  paused: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

const GRID = '1fr 100px 80px 80px 90px 90px 110px auto'

const SCHED_FREQ_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', custom: 'Custom (cron)' }
const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildCronExpression(frequency: string, time: string, dayOfWeek: string, customCron: string): string {
  if (frequency === 'custom') return customCron
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr ?? 0)
  const minute = Number(minuteStr ?? 0)
  if (frequency === 'weekly') return `${minute} ${hour} * * ${dayOfWeek}`
  return `${minute} ${hour} * * *`
}

function mapSchedule(s: Record<string, unknown>, i: number): Schedule {
  const dataset = String(s.asset_name ?? s.dataset ?? '')
  const tableFqn = [s.asset_database, s.asset_schema, s.asset_name]
    .filter(v => typeof v === 'string' && v)
    .join('.') || dataset || '(unscoped)'
  return {
    id:            String(s.schedule_id ?? s.id ?? i),
    name:          String(s.schedule_name ?? s.name ?? ''),
    dataset,
    tableFqn,
    cron:          String(s.cron_expression ?? s.cron ?? ''),
    human:         String(s.human_readable ?? s.human ?? s.cron_expression ?? ''),
    frequency:     String(s.frequency ?? 'daily'),
    runAtHour:     s.run_at_hour === null || s.run_at_hour === undefined ? null : Number(s.run_at_hour),
    runAtMinute:   s.run_at_minute === null || s.run_at_minute === undefined ? null : Number(s.run_at_minute),
    rules:         Number(s.rule_count ?? s.rules ?? 0),
    lastRun:       String(s.last_run_at ?? s.lastRun ?? '—'),
    nextRun:       String(s.next_run_at ?? s.nextRun ?? '—'),
    status:        (s.is_active ? 'active' : 'paused') as ScheduleStatus,
    lastRunStatus: (['passed', 'failed', 'warning'] as const).includes(s.last_run_status as 'passed' | 'failed' | 'warning')
                     ? (s.last_run_status as 'passed' | 'failed' | 'warning')
                     : 'passed',
    lastDuration:  String(s.last_duration ?? s.lastDuration ?? '—'),
    connection:    String(s.connection_name ?? s.connection ?? '(no connection)'),
    owner:         String(s.owner ?? ''),
    failedRules:   Number(s.failed_rules ?? s.failedRules ?? 0),
    checkedRows:   String(s.checked_rows ?? s.checkedRows ?? '0'),
    failedRows:    String(s.failed_rows ?? s.failedRows ?? '0'),
    issues:        Array.isArray(s.issues) ? s.issues as RunIssue[] : [],
    bundledRules:  Array.isArray(s.bundled_rules) ? (s.bundled_rules as Record<string, unknown>[]).map(r => ({
                     ruleId: String(r.rule_id ?? ''),
                     ruleName: String(r.rule_name ?? ''),
                     ruleDescription: String(r.rule_description ?? ''),
                     severity: (r.severity ?? 'medium') as BundledRule['severity'],
                   })) : [],
  }
}

const RULE_SEV_CFG: Record<BundledRule['severity'], { color: string; bg: string }> = {
  critical: { color: '#dc2626', bg: '#fee2e2' },
  high:     { color: '#d97706', bg: '#fef3c7' },
  medium:   { color: '#2563eb', bg: '#dbeafe' },
  low:      { color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
}

```

Replace it with:

```typescript
'use client'
import { useState, useEffect } from 'react'
import { Schedule, RUN_STYLE, STATUS_STYLE, mapSchedule } from '@/lib/schedules'
import ScheduleDetailDrawer from '@/components/shared/ScheduleDetailDrawer'

type FilterType = 'all' | 'active' | 'paused' | 'failed'

const GRID = '1fr 100px 80px 80px 90px 90px 110px auto'

const SCHED_FREQ_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', custom: 'Custom (cron)' }
const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildCronExpression(frequency: string, time: string, dayOfWeek: string, customCron: string): string {
  if (frequency === 'custom') return customCron
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr ?? 0)
  const minute = Number(minuteStr ?? 0)
  if (frequency === 'weekly') return `${minute} ${hour} * * ${dayOfWeek}`
  return `${minute} ${hour} * * *`
}

```

Note: this leaves an unresolved reference to `ScheduleDetailDrawer` and the new `selectedId`/`runRule`/`setRuleStatus` wiring — that's expected, Task 4 creates the component and Task 5 finishes wiring. Type errors are expected until Task 5 completes; don't run `tsc` as a pass/fail gate until after Task 5.

- [ ] **Step 3: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
git add src/lib/schedules.ts src/app/schedules/page.tsx
git commit -m "refactor(schedules): extract shared types/styles/mapSchedule into lib/schedules.ts"
```

---

### Task 4: Frontend — `ScheduleDetailDrawer` component

**Files:**
- Create: `frontend/src/components/shared/ScheduleDetailDrawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'
import { useState } from 'react'
import {
  Schedule, BundledRule, SEV_CFG, RUN_STYLE, RULE_SEV_CFG,
  formatDuration, formatTimestamp,
} from '@/lib/schedules'

interface ScheduleDetailDrawerProps {
  schedule: Schedule
  onClose: () => void
  runningId: string | null
  onRunSchedule: (id: string) => void
  onToggleSchedule: (id: string) => void
  runningRuleId: string | null
  onRunRule: (ruleId: string) => void
  pausingRuleId: string | null
  onSetRuleStatus: (ruleId: string, status: 'active' | 'disabled') => void
}

function ruleFailureDetail(rule: BundledRule): { rootCause: string; impact: string | null } {
  if (rule.aiExplanation) {
    return { rootCause: rule.aiExplanation, impact: rule.errorMessage }
  }
  if (rule.failedRowsCount != null && rule.totalRowsScanned != null) {
    const pct = rule.failurePercentage != null
      ? rule.failurePercentage.toFixed(1)
      : ((rule.failedRowsCount / Math.max(rule.totalRowsScanned, 1)) * 100).toFixed(1)
    return {
      rootCause: `${rule.failedRowsCount.toLocaleString()} / ${rule.totalRowsScanned.toLocaleString()} rows (${pct}%) failed this rule's check.`,
      impact: rule.errorMessage,
    }
  }
  if (rule.errorMessage) return { rootCause: rule.errorMessage, impact: null }
  return { rootCause: 'No additional detail available.', impact: null }
}

export default function ScheduleDetailDrawer({
  schedule, onClose, runningId, onRunSchedule, onToggleSchedule,
  runningRuleId, onRunRule, pausingRuleId, onSetRuleStatus,
}: ScheduleDetailDrawerProps) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const rs = RUN_STYLE[schedule.lastRunStatus]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>{schedule.tableFqn}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {schedule.runAtHour !== null
              ? `Daily at ${String(schedule.runAtHour).padStart(2, '0')}:${String(schedule.runAtMinute ?? 0).padStart(2, '0')}`
              : schedule.cron}
            {' · '}last {schedule.lastRun} ({schedule.lastDuration}) · next {schedule.nextRun}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ ...rs, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
            {schedule.lastRunStatus === 'passed' ? '✓' : schedule.lastRunStatus === 'failed' ? '✕' : '⚠'} {schedule.lastRunStatus}
          </span>
          <button onClick={() => onToggleSchedule(schedule.id)}
            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
            {schedule.status === 'active' ? '⏸' : '▶'}
          </button>
          <button onClick={() => onRunSchedule(schedule.id)} disabled={runningId === schedule.id}
            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: runningId === schedule.id ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: runningId === schedule.id ? 'not-allowed' : 'pointer' }}>
            {runningId === schedule.id ? '⏳' : '▶ Run Now'}
          </button>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1 }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)', marginBottom: '8px' }}>
            Scheduled Rules — {schedule.bundledRules.length}
          </div>

          {schedule.bundledRules.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              No rules scheduled for this table
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {schedule.bundledRules.map(rule => {
              const rc = RULE_SEV_CFG[rule.severity]
              const isPaused = rule.status === 'disabled'
              const isRunning = runningRuleId === rule.ruleId
              const isPausing = pausingRuleId === rule.ruleId
              const isFailed = rule.lastRunStatus === 'failed'
              const isExpanded = expandedRuleId === rule.ruleId
              const resultBadge = rule.lastRunStatus ? RUN_STYLE[rule.lastRunStatus] : null

              return (
                <div key={rule.ruleId}>
                  <div style={{ background: isPaused ? 'var(--surface-muted)' : 'var(--surface)', border: `1px solid ${isFailed ? '#fecaca' : 'var(--border)'}`, borderRadius: '6px', padding: '8px 10px', opacity: isPaused ? 0.65 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: rc.bg, color: rc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                        {rule.severity}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{rule.ruleName}</span>
                      {isPaused && (
                        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700 }}>
                          Paused
                        </span>
                      )}
                      {rule.ruleDescription && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rule.ruleDescription}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}>
                        <button onClick={() => onRunRule(rule.ruleId)} disabled={isRunning}
                          title="Run this rule now"
                          style={{ padding: '2px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: isRunning ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: isRunning ? 'not-allowed' : 'pointer' }}>
                          {isRunning ? '⏳' : '▶ Run'}
                        </button>
                        <button onClick={() => onSetRuleStatus(rule.ruleId, isPaused ? 'active' : 'disabled')} disabled={isPausing}
                          title={isPaused ? 'Unpause this rule' : 'Pause this rule'}
                          style={{ padding: '2px 8px', borderRadius: '5px', border: isPaused ? '1px solid #bbf7d0' : '1px solid var(--border)', background: isPaused ? '#f0fdf4' : 'var(--surface)', color: isPaused ? '#16a34a' : 'var(--text-secondary)', fontSize: '10px', cursor: isPausing ? 'not-allowed' : 'pointer' }}>
                          {isPausing ? '⏳' : isPaused ? '▶' : '⏸'}
                        </button>
                      </div>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {!rule.lastRunAt && <span>Never run</span>}
                      {rule.lastRunAt && <span>Last run: {formatTimestamp(rule.lastRunAt)}</span>}
                      {resultBadge && (
                        isFailed ? (
                          <span onClick={() => setExpandedRuleId(isExpanded ? null : rule.ruleId)}
                            style={{ ...resultBadge, padding: '1px 6px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                            ✕ failed{rule.failedRowsCount != null ? ` · ${rule.failedRowsCount.toLocaleString()} rows` : ''} {isExpanded ? '▴' : '▾'}
                          </span>
                        ) : (
                          <span style={{ ...resultBadge, padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {rule.lastRunStatus === 'passed' ? '✓' : '⚠'} {rule.lastRunStatus}
                          </span>
                        )
                      )}
                      <span>Next run: {rule.nextRun ? formatTimestamp(rule.nextRun) : '—'}</span>
                      <span style={{ fontFamily: 'monospace' }}>Duration: {formatDuration(rule.lastDurationMs)}</span>
                    </div>
                  </div>

                  {isExpanded && isFailed && (() => {
                    const { rootCause, impact } = ruleFailureDetail(rule)
                    return (
                      <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: impact ? '1fr 1fr' : '1fr', gap: '8px' }}>
                        <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>
                          {rootCause}
                        </div>
                        {impact && (
                          <div style={{ background: '#fee2e288', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>
                            {impact}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>

        {schedule.issues.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)' }}>Last Run Issues</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{schedule.checkedRows} checked · {schedule.failedRows} failed · {schedule.lastDuration}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {schedule.issues.map((issue, j) => {
                const sc = SEV_CFG[issue.severity]
                return (
                  <div key={j} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}30`, borderLeft: `3px solid ${sc.color}`, borderRadius: '6px', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{sc.label}</span>
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{issue.rule}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: 'var(--status-error-text)', fontWeight: 600 }}>{issue.failedRows} rows</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>
                        {issue.detail}
                      </div>
                      <div style={{ background: `${sc.bg}88`, borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: sc.color, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>
                        {issue.impact}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
git add src/components/shared/ScheduleDetailDrawer.tsx
git commit -m "feat(schedules): add ScheduleDetailDrawer component"
```

---

### Task 5: Frontend — wire the drawer into the Schedules page

**Files:**
- Modify: `frontend/src/app/schedules/page.tsx`

- [ ] **Step 1: Update state declarations**

Find this block (the state declarations at the top of `SchedulesPage`):

```typescript
export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [runningId, setRunningId]       = useState<string | null>(null)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [pausingRuleId, setPausingRuleId] = useState<string | null>(null)
  const [editingId, setEditingId]       = useState<string | null>(null)
```

Replace it with:

```typescript
export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [runningId, setRunningId]       = useState<string | null>(null)
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [pausingRuleId, setPausingRuleId] = useState<string | null>(null)
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null)
  const [editingId, setEditingId]       = useState<string | null>(null)
```

- [ ] **Step 2: Generalize `pauseRule` into `setRuleStatus`, add `runRule`**

Find this function:

```typescript
  async function pauseRule(ruleId: string) {
    setPausingRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setPausingRuleId(null)
    }
  }
```

Replace it with:

```typescript
  async function setRuleStatus(ruleId: string, status: 'active' | 'disabled') {
    setPausingRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setPausingRuleId(null)
    }
  }

  async function runRule(ruleId: string) {
    setRunningRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/run`, { method: 'POST' })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setRunningRuleId(null)
    }
  }
```

- [ ] **Step 3: Update the schedule row rendering — replace `expandedId`/`canExpand` with `selectedId`**

Find this block (the start of the `sorted.map` row rendering):

```tsx
        {!loading && sorted.map(s => {
          const isExpanded = expandedId === s.id
          const rs         = RUN_STYLE[s.lastRunStatus]
          const ss         = STATUS_STYLE[s.status]
          const hasIssues  = s.issues.length > 0
          const hasRules   = s.bundledRules.length > 0
          const canExpand  = hasIssues || hasRules
          const isEditing  = editingId === s.id

          return (
            <div key={s.id}>
              {/* schedule row */}
              <div onClick={() => canExpand && setExpandedId(isExpanded ? null : s.id)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isExpanded ? 'var(--surface-muted)' : hasIssues && s.lastRunStatus !== 'passed' ? 'rgba(254,242,242,0.4)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: canExpand ? 'pointer' : 'default', minHeight: '30px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  {canExpand && (
                    <span style={{ color: hasIssues ? (s.lastRunStatus === 'failed' ? '#dc2626' : '#d97706') : 'var(--text-muted)', fontSize: '9px', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                  )}
```

Replace it with:

```tsx
        {!loading && sorted.map(s => {
          const isSelected = selectedId === s.id
          const rs         = RUN_STYLE[s.lastRunStatus]
          const ss         = STATUS_STYLE[s.status]
          const hasIssues  = s.issues.length > 0
          const isEditing  = editingId === s.id

          return (
            <div key={s.id}>
              {/* schedule row */}
              <div onClick={() => setSelectedId(isSelected ? null : s.id)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isSelected ? 'var(--surface-muted)' : hasIssues && s.lastRunStatus !== 'passed' ? 'rgba(254,242,242,0.4)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', minHeight: '30px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  <span style={{ color: hasIssues ? (s.lastRunStatus === 'failed' ? '#dc2626' : '#d97706') : 'var(--text-muted)', fontSize: '9px', flexShrink: 0, transform: isSelected ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
```

- [ ] **Step 4: Remove the inline expand panel and add the drawer**

Find this block (the end of the schedule row's action buttons, the inline expand panel, and the close of the `sorted.map`):

```tsx
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggle(s.id)}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                    {s.status === 'active' ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => runNow(s.id)} disabled={runningId === s.id}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: runningId === s.id ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: runningId === s.id ? 'not-allowed' : 'pointer' }}>
                    {runningId === s.id ? '⏳' : '▶ Run'}
                  </button>
                </div>
              </div>

              {/* expanded issues */}
              {isExpanded && (
                <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
                  {hasRules && (
                    <div style={{ marginBottom: hasIssues ? '14px' : 0 }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)', marginBottom: '8px' }}>
                        Scheduled Rules — {s.bundledRules.length}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {s.bundledRules.map(rule => {
                          const rc = RULE_SEV_CFG[rule.severity]
                          const isPausing = pausingRuleId === rule.ruleId
                          return (
                            <div key={rule.ruleId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                              <span style={{ background: rc.bg, color: rc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{rule.severity}</span>
                              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{rule.ruleName}</span>
                              {rule.ruleDescription && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{rule.ruleDescription}</span>
                              )}
                              <button onClick={() => pauseRule(rule.ruleId)} disabled={isPausing}
                                title="Pause this rule"
                                style={{ marginLeft: 'auto', flexShrink: 0, padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: isPausing ? 'not-allowed' : 'pointer' }}>
                                {isPausing ? '⏳' : '⏸ Pause'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {hasIssues && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)' }}>Last Run Issues — {s.tableFqn}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.checkedRows} checked · {s.failedRows} failed · {s.lastDuration}</span>
                  </div>
                  )}
                  {hasIssues && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {s.issues.map((issue, j) => {
                      const sc = SEV_CFG[issue.severity]
                      return (
                        <div key={j} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}30`, borderLeft: `3px solid ${sc.color}`, borderRadius: '6px', padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{sc.label}</span>
                            <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{issue.rule}</span>
                            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: 'var(--status-error-text)', fontWeight: 600 }}>{issue.failedRows} rows</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                              <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>{issue.detail}
                            </div>
                            <div style={{ background: `${sc.bg}88`, borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                              <span style={{ fontWeight: 700, color: sc.color, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{issue.impact}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                    <button onClick={() => runNow(s.id)} disabled={runningId === s.id}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
                      {runningId === s.id ? '⏳ Running…' : '▶ Re-run'}
                    </button>
                    <button onClick={() => setExpandedId(null)}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                      ▲ Collapse
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
```

Replace it with:

```tsx
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggle(s.id)}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                    {s.status === 'active' ? '⏸' : '▶'}
                  </button>
                  <button onClick={() => runNow(s.id)} disabled={runningId === s.id}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: runningId === s.id ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: runningId === s.id ? 'not-allowed' : 'pointer' }}>
                    {runningId === s.id ? '⏳' : '▶ Run'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {selectedId && (() => {
        const selected = scheduleList.find(sc => sc.id === selectedId)
        if (!selected) return null
        return (
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(640px, 92vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 900, display: 'flex' }}>
            <ScheduleDetailDrawer
              schedule={selected}
              onClose={() => setSelectedId(null)}
              runningId={runningId}
              onRunSchedule={runNow}
              onToggleSchedule={toggle}
              runningRuleId={runningRuleId}
              onRunRule={runRule}
              pausingRuleId={pausingRuleId}
              onSetRuleStatus={setRuleStatus}
            />
          </div>
        )
      })()}
```

- [ ] **Step 5: Add right padding to the page container when the drawer is open**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && grep -n "paddingRight\|padding: '24px'\|padding: \"24px\"" src/app/schedules/page.tsx | head -5`

Find the outermost page container `<div>` (the top-level wrapper returned from the component, holding the page title/filters/list). It will have a style object with a `padding` property (e.g. `padding: '24px'` or similar) and no `paddingRight` override. Add a `paddingRight` that expands when the drawer is open, following the same pattern as `frontend/src/app/run-history/page.tsx`:

```tsx
paddingRight: selectedId ? 'calc(min(640px, 92vw) + 24px)' : '24px',
```

Add this alongside the existing `padding` properties on that container's style object (if the container currently has `padding: '24px'`, replace it with explicit `paddingTop`/`paddingLeft`/`paddingBottom: '24px'` plus the conditional `paddingRight` above — keep all other style properties unchanged).

- [ ] **Step 6: Run lint and type-check**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run lint`
Expected: no errors (warnings about `<img>` etc. that pre-exist are fine; there should be no new errors related to `schedules/page.tsx`, `lib/schedules.ts`, or `ScheduleDetailDrawer.tsx`)

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 7: Build the frontend**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build`
Expected: build succeeds

- [ ] **Step 8: Manual verification**

Run: `cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run dev`

In a browser, navigate to `/schedules`:
- Click a table-level schedule row → drawer opens on the right, page content shifts left.
- Verify each rule in "Scheduled Rules" shows severity, name, description, "▶ Run" and pause/unpause icon, plus a second line with last run timestamp, result badge, next run, and duration.
- Click "▶ Run" on a rule → button shows "⏳" while in flight, then the row's last-run info refreshes.
- Click the pause icon on an active rule → rule becomes greyed out with a "Paused" badge, "Next run: —", and its action icon becomes "▶" (unpause). Click again to unpause and confirm it returns to normal.
- For a rule whose last run failed, click its "✕ failed · N rows ▾" badge → a Root Cause/Impact card expands below the rule; click again to collapse.
- Click the drawer's "✕" close button → drawer closes, page padding returns to normal.
- Click a different schedule row while the drawer is open → drawer content swaps to the new schedule without closing.

Stop the dev server (Ctrl+C) once verified.

- [ ] **Step 9: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
git add src/app/schedules/page.tsx
git commit -m "feat(schedules): replace inline expand with ScheduleDetailDrawer, add run/pause-rule actions"
```

---

## Self-Review

**Spec coverage:**
- Backend `status.in_(["active","disabled"])` filter + per-rule `DQRuleRun` lookup → Task 1 + 2.
- New `BundledRule` fields (`status`, `lastRunStatus`, `lastRunAt`, `lastDurationMs`, `nextRun`, `failedRowsCount`, `totalRowsScanned`, `failurePercentage`, `errorMessage`, `aiExplanation`) → Task 3 (`lib/schedules.ts`).
- `formatDuration` helper → Task 3.
- `ScheduleDetailDrawer` component (header, Scheduled Rules two-line cards, paused styling, failed-rule expand, Last Run Issues) → Task 4.
- `runRule` / `setRuleStatus` actions, `selectedId` state, removal of inline expand, drawer wiring, page padding → Task 5.

**Placeholder scan:** No TBD/TODO; all code blocks are complete and copy-pasteable.

**Type consistency:** `BundledRule`, `Schedule`, `RUN_STYLE`, `STATUS_STYLE`, `RULE_SEV_CFG`, `SEV_CFG`, `mapSchedule`, `formatDuration`, `formatTimestamp` are defined once in `lib/schedules.ts` (Task 3) and imported identically in `page.tsx` (Task 5) and `ScheduleDetailDrawer.tsx` (Task 4). `setRuleStatus(ruleId, status)` and `runRule(ruleId)` signatures match their usage in `ScheduleDetailDrawer` props (`onSetRuleStatus`, `onRunRule`).
