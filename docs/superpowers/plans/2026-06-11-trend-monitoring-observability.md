# Trend Monitoring & Observability UI (Module 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add historical trend charts (quality score, alert volume, anomaly activity) with click-to-drilldown to the existing Dashboard, Asset Detail panel, and Domains detail panel — reusing `_build_trend()`, `TrendChart`, and existing tab/slide-over UI patterns.

**Architecture:** Extend the existing `_build_trend()` helper in `app/api/dashboard.py` to also compute per-day alert and anomaly counts, add one new `/dashboard/day-detail` endpoint for drilldown data, add the missing Next.js proxy routes for `/dashboard/trend`, `/dashboard/history/domain/{id}`, `/dashboard/history/table/{id}`, and `/dashboard/day-detail`, then extend the shared `TrendChart` component with optional overlay markers + click handler, add a new `TrendDrilldownPanel`, and wire three new trend surfaces (Dashboard tab, Asset Detail tab, Domains slide-in panel) using these pieces.

**Tech Stack:** FastAPI + SQLAlchemy (async) backend, Next.js 15 / React 19 / TypeScript frontend, pytest + AsyncMock for backend tests.

---

## Spec Reference

Design doc: `docs/superpowers/specs/2026-06-11-trend-monitoring-observability-design.md`

---

### Task 1: Extend `_build_trend()` with `alert_count` and `anomaly_count`

**Files:**
- Modify: `app/api/dashboard.py:1-14` (imports), `app/api/dashboard.py:29-99` (`_build_trend`)
- Test: `tests/test_dashboard_trend.py` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_dashboard_trend.py`:

```python
"""Tests for _build_trend() alert/anomaly count enrichment and /dashboard/day-detail."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_build_trend_includes_zero_alert_and_anomaly_counts_when_none_exist():
    from app.api.dashboard import _build_trend

    db = AsyncMock()

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []
    empty_rows = MagicMock()
    empty_rows.all.return_value = []

    # Order of db.execute calls inside _build_trend: score query, raw-run
    # fallback query (missing_dates is non-empty since score_rows is empty),
    # alert count query, anomaly count query.
    db.execute = AsyncMock(side_effect=[empty_scalars, empty_scalars, empty_rows, empty_rows])

    trend = await _build_trend(db, days=2)

    assert len(trend) == 2
    for entry in trend:
        assert entry["alert_count"] == 0
        assert entry["anomaly_count"] == 0


@pytest.mark.asyncio
async def test_build_trend_counts_alerts_and_anomalies_for_their_date():
    from app.api.dashboard import _build_trend

    db = AsyncMock()
    today_dt = datetime.now(timezone.utc).replace(tzinfo=None)

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    alert_rows = MagicMock()
    alert_rows.all.return_value = [MagicMock(created_at=today_dt)]

    anomaly_rows = MagicMock()
    anomaly_rows.all.return_value = [MagicMock(detected_at=today_dt)]

    db.execute = AsyncMock(side_effect=[empty_scalars, empty_scalars, alert_rows, anomaly_rows])

    trend = await _build_trend(db, days=1)

    assert trend[0]["date"] == str(today_dt.date())
    assert trend[0]["alert_count"] == 1
    assert trend[0]["anomaly_count"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_dashboard_trend.py -v`
Expected: FAIL — `KeyError: 'alert_count'` (the trend dicts don't have these keys yet).

- [ ] **Step 3: Add `AnomalyDetection` import**

In `app/api/dashboard.py`, change line 12:

```python
from app.db.models import Domain, Subdomain, Asset, DQRule, DQRuleRun, DQAlert, DQQualityScore, AnomalyDetection
```

- [ ] **Step 4: Extend `_build_trend()` to compute and merge per-day alert/anomaly counts**

In `app/api/dashboard.py`, replace the body of `_build_trend` (currently lines 29-99) with:

```python
async def _build_trend(
    db: AsyncSession,
    days: int = 30,
    domain_id: Optional[str] = None,
    subdomain_id: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> list[dict]:
    """
    Build quality trend in a handful of queries instead of one per day.

    Strategy:
    1. Fetch all pre-aggregated DQQualityScore rows for the date range in one query.
    2. For any date missing a pre-aggregated row, fetch raw runs in a single IN-query
       and aggregate in Python.
    3. Fetch DQAlert rows in range, aggregate per-day counts in Python.
    4. Fetch AnomalyDetection rows in range, aggregate per-day counts in Python.
    """
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=days - 1)
    all_dates = [cutoff + timedelta(days=i) for i in range(days)]

    # ── Query 1: fetch all pre-aggregated scores in the range ──────────────
    sq = select(DQQualityScore).where(
        DQQualityScore.score_date >= cutoff,
        DQQualityScore.score_date <= today,
    )
    if asset_id:
        sq = sq.where(DQQualityScore.asset_id == asset_id, DQQualityScore.score_level == "table")
    elif subdomain_id:
        sq = sq.where(DQQualityScore.subdomain_id == subdomain_id, DQQualityScore.score_level == "subdomain")
    elif domain_id:
        sq = sq.where(DQQualityScore.domain_id == domain_id, DQQualityScore.score_level == "domain")
    else:
        sq = sq.where(DQQualityScore.score_level == "global")

    score_rows = (await db.execute(sq)).scalars().all()
    score_map = {r.score_date: r for r in score_rows}

    # ── Identify dates that need raw-run fallback ───────────────────────────
    missing_dates = [d for d in all_dates if d not in score_map]

    # ── Query 2 (optional): raw runs for all missing dates in one shot ──────
    raw_by_date: dict[date, list] = {}
    if missing_dates:
        rq = select(DQRuleRun).where(func.date(DQRuleRun.created_at).in_(missing_dates))
        if domain_id:
            rq = rq.where(DQRuleRun.domain_id == domain_id)
        if subdomain_id:
            rq = rq.where(DQRuleRun.subdomain_id == subdomain_id)
        if asset_id:
            rq = rq.where(DQRuleRun.asset_id == asset_id)
        raw_runs = (await db.execute(rq)).scalars().all()
        for r in raw_runs:
            raw_by_date.setdefault(r.created_at.date(), []).append(r)

    # ── Query 3: alerts in range, aggregated per day in Python ──────────────
    alq = select(DQAlert.created_at).where(
        func.date(DQAlert.created_at) >= cutoff,
        func.date(DQAlert.created_at) <= today,
    )
    if asset_id:
        alq = alq.where(DQAlert.asset_id == asset_id)
    elif subdomain_id:
        alq = alq.where(DQAlert.subdomain_id == subdomain_id)
    elif domain_id:
        alq = alq.where(DQAlert.domain_id == domain_id)
    alert_rows = (await db.execute(alq)).all()
    alert_count_map: dict[date, int] = {}
    for r in alert_rows:
        d = r.created_at.date()
        alert_count_map[d] = alert_count_map.get(d, 0) + 1

    # ── Query 4: anomalies in range, aggregated per day in Python ────────────
    anq = select(AnomalyDetection.detected_at)
    if asset_id:
        anq = anq.where(AnomalyDetection.asset_id == asset_id)
    elif subdomain_id or domain_id:
        anq = anq.join(Asset, AnomalyDetection.asset_id == Asset.asset_id)
        if subdomain_id:
            anq = anq.where(Asset.subdomain_id == subdomain_id)
        else:
            anq = anq.where(Asset.domain_id == domain_id)
    anq = anq.where(
        func.date(AnomalyDetection.detected_at) >= cutoff,
        func.date(AnomalyDetection.detected_at) <= today,
    )
    anomaly_rows = (await db.execute(anq)).all()
    anomaly_count_map: dict[date, int] = {}
    for r in anomaly_rows:
        d = r.detected_at.date()
        anomaly_count_map[d] = anomaly_count_map.get(d, 0) + 1

    # ── Assemble trend in chronological order ───────────────────────────────
    trend = []
    for d in all_dates:
        if d in score_map:
            agg = score_map[d]
            trend.append({
                "date": str(d), "score": agg.quality_score,
                "total": agg.total_rules, "passed": agg.passed_rules,
                "failed": agg.failed_rules,
                "alert_count": alert_count_map.get(d, 0),
                "anomaly_count": anomaly_count_map.get(d, 0),
            })
        else:
            runs = raw_by_date.get(d, [])
            total = len(runs)
            passed = sum(1 for r in runs if r.status == "passed")
            failed = sum(1 for r in runs if r.status in ("failed", "error"))
            score = round(passed / total * 100, 1) if total else None
            trend.append({
                "date": str(d), "score": score, "total": total, "passed": passed, "failed": failed,
                "alert_count": alert_count_map.get(d, 0),
                "anomaly_count": anomaly_count_map.get(d, 0),
            })
    return trend
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_dashboard_trend.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full dashboard test suite to check for regressions**

Run: `python -m pytest tests/ -k dashboard -v`
Expected: PASS (no existing dashboard tests should break since `alert_count`/`anomaly_count` are additive keys)

- [ ] **Step 7: Commit**

```bash
git add app/api/dashboard.py tests/test_dashboard_trend.py
git commit -m "feat(dashboard): add alert/anomaly counts to quality trend"
```

---

### Task 2: Add `GET /dashboard/day-detail` endpoint

**Files:**
- Modify: `app/api/dashboard.py` (add new route, near the other `/history/*` and `/trend` routes around line 730)
- Test: `tests/test_dashboard_trend.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_dashboard_trend.py`:

```python
@pytest.mark.asyncio
async def test_day_detail_rejects_invalid_date_format():
    from fastapi import HTTPException
    from app.api.dashboard import day_detail

    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await day_detail(date_str="not-a-date", db=db, user={})

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_day_detail_returns_empty_lists_when_no_data():
    from app.api.dashboard import day_detail

    db = AsyncMock()
    empty_all = MagicMock()
    empty_all.all.return_value = []
    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[empty_all, empty_scalars, empty_scalars])

    result = await day_detail(date_str="2026-06-10", db=db, user={})

    assert result["date"] == "2026-06-10"
    assert result["failed_runs"] == []
    assert result["alerts"] == []
    assert result["anomalies"] == []


@pytest.mark.asyncio
async def test_day_detail_includes_failed_run_details():
    from app.api.dashboard import day_detail

    db = AsyncMock()
    run_mock = MagicMock(run_id="run-1", rule_id="rule-1", asset_id="asset-1", status="failed", failed_rows_count=5)
    runs_result = MagicMock()
    runs_result.all.return_value = [(run_mock, "not_null_check", "customers")]

    empty_scalars = MagicMock()
    empty_scalars.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[runs_result, empty_scalars, empty_scalars])

    result = await day_detail(date_str="2026-06-10", db=db, user={})

    assert result["failed_runs"] == [{
        "run_id": "run-1", "rule_id": "rule-1", "rule_name": "not_null_check",
        "asset_id": "asset-1", "table_name": "customers",
        "status": "failed", "failed_rows_count": 5,
    }]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_dashboard_trend.py -v`
Expected: FAIL — `ImportError: cannot import name 'day_detail' from 'app.api.dashboard'`

- [ ] **Step 3: Implement the endpoint**

In `app/api/dashboard.py`, add this route after `global_trend` (after the function ending around line 739):

```python
@router.get("/day-detail")
async def day_detail(
    date_str: str = Query(..., alias="date"),
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return failed runs, alerts, and anomalies for a single date + scope, for trend drilldowns."""
    if domain_id:
        check_domain_access(user, domain_id)
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be in YYYY-MM-DD format")

    # ── Failed rule runs ──────────────────────────────────────────────────
    rq = (
        select(DQRuleRun, DQRule.rule_name, Asset.sf_table_name)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .join(Asset, DQRuleRun.asset_id == Asset.asset_id)
        .where(
            func.date(DQRuleRun.created_at) == target_date,
            DQRuleRun.status.in_(["failed", "error"]),
        )
    )
    if asset_id:
        rq = rq.where(DQRuleRun.asset_id == asset_id)
    elif subdomain_id:
        rq = rq.where(DQRuleRun.subdomain_id == subdomain_id)
    elif domain_id:
        rq = rq.where(DQRuleRun.domain_id == domain_id)
    rq = rq.order_by(desc(DQRuleRun.created_at)).limit(50)
    run_rows = (await db.execute(rq)).all()
    failed_runs = [
        {
            "run_id": run.run_id, "rule_id": run.rule_id, "rule_name": rule_name,
            "asset_id": run.asset_id, "table_name": table_name,
            "status": run.status, "failed_rows_count": run.failed_rows_count,
        }
        for run, rule_name, table_name in run_rows
    ]

    # ── Alerts ────────────────────────────────────────────────────────────
    aq = select(DQAlert).where(func.date(DQAlert.created_at) == target_date)
    if asset_id:
        aq = aq.where(DQAlert.asset_id == asset_id)
    elif subdomain_id:
        aq = aq.where(DQAlert.subdomain_id == subdomain_id)
    elif domain_id:
        aq = aq.where(DQAlert.domain_id == domain_id)
    aq = aq.order_by(desc(DQAlert.created_at)).limit(50)
    alert_rows = (await db.execute(aq)).scalars().all()
    alerts = [
        {
            "alert_id": a.alert_id, "severity": a.severity, "alert_type": a.alert_type,
            "alert_status": a.alert_status, "asset_id": a.asset_id, "rule_id": a.rule_id,
        }
        for a in alert_rows
    ]

    # ── Anomalies ─────────────────────────────────────────────────────────
    anq = select(AnomalyDetection).where(func.date(AnomalyDetection.detected_at) == target_date)
    if asset_id:
        anq = anq.where(AnomalyDetection.asset_id == asset_id)
    elif subdomain_id or domain_id:
        anq = anq.join(Asset, AnomalyDetection.asset_id == Asset.asset_id)
        if subdomain_id:
            anq = anq.where(Asset.subdomain_id == subdomain_id)
        else:
            anq = anq.where(Asset.domain_id == domain_id)
    anq = anq.order_by(desc(AnomalyDetection.detected_at)).limit(50)
    anomaly_rows = (await db.execute(anq)).scalars().all()
    anomalies = [
        {
            "detection_id": d.detection_id, "asset_id": d.asset_id, "anomaly_type": d.anomaly_type,
            "severity": d.severity, "confidence": d.confidence,
        }
        for d in anomaly_rows
    ]

    return {"date": date_str, "failed_runs": failed_runs, "alerts": alerts, "anomalies": anomalies}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_dashboard_trend.py -v`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard.py tests/test_dashboard_trend.py
git commit -m "feat(dashboard): add /dashboard/day-detail endpoint for trend drilldowns"
```

---

### Task 3: Add Next.js proxy routes for trend/day-detail endpoints

**Files:**
- Create: `frontend/src/app/api/dashboard/trend/route.ts`
- Create: `frontend/src/app/api/dashboard/history/domain/[domainId]/route.ts`
- Create: `frontend/src/app/api/dashboard/history/table/[assetId]/route.ts`
- Create: `frontend/src/app/api/dashboard/day-detail/route.ts`
- Modify: `frontend/src/app/api/dashboard/route.ts` (pass through `alert_count`/`anomaly_count` in the `trend` mapping)

No backend logic here — these are thin proxies following the existing pattern in `frontend/src/app/api/quality-scores/assets/[assetId]/history/route.ts`. No automated tests (this codebase has no frontend test suite); verified manually in Task 10.

- [ ] **Step 1: Create `frontend/src/app/api/dashboard/trend/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const days = req.nextUrl.searchParams.get('days')
    const url = days ? `${BACKEND}/dashboard/trend?days=${days}` : `${BACKEND}/dashboard/trend`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `frontend/src/app/api/dashboard/history/domain/[domainId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domainId: string }> }
) {
  const { domainId } = await params
  try {
    const days = req.nextUrl.searchParams.get('days')
    const url = days
      ? `${BACKEND}/dashboard/history/domain/${domainId}?days=${days}`
      : `${BACKEND}/dashboard/history/domain/${domainId}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `frontend/src/app/api/dashboard/history/table/[assetId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  try {
    const days = req.nextUrl.searchParams.get('days')
    const url = days
      ? `${BACKEND}/dashboard/history/table/${assetId}?days=${days}`
      : `${BACKEND}/dashboard/history/table/${assetId}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create `frontend/src/app/api/dashboard/day-detail/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const qs = req.nextUrl.searchParams.toString()
    const url = `${BACKEND}/dashboard/day-detail${qs ? `?${qs}` : ''}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Update the `trend` mapping in `frontend/src/app/api/dashboard/route.ts`**

In `frontend/src/app/api/dashboard/route.ts`, find this block:

```typescript
    const trend = ((global.quality_trend ?? []) as Record<string, unknown>[]).map(t => ({
      date:   t.date as string,
      score:  t.score as number | null,
      failed: t.failed as number,
    }))
```

Replace it with:

```typescript
    const trend = ((global.quality_trend ?? []) as Record<string, unknown>[]).map(t => ({
      date:   t.date as string,
      score:  t.score as number | null,
      failed: t.failed as number,
      alert_count:   t.alert_count as number | undefined,
      anomaly_count: t.anomaly_count as number | undefined,
    }))
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/dashboard
git commit -m "feat(dashboard): add proxy routes for trend, history, and day-detail endpoints"
```

---

### Task 4: Add shared trend/drilldown types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Append new shared types**

Add to the end of `frontend/src/lib/types.ts`:

```typescript
export interface TrendPoint {
  date: string
  score: number | null
  failed: number
  alert_count?: number
  anomaly_count?: number
}

export interface TrendScope {
  domainId?: string
  subdomainId?: string
  assetId?: string
}

export interface DayDetailFailedRun {
  run_id: string
  rule_id: string
  rule_name: string
  asset_id: string
  table_name: string
  status: string
  failed_rows_count: number | null
}

export interface DayDetailAlert {
  alert_id: string
  severity: string
  alert_type: string
  alert_status: string
  asset_id: string
  rule_id: string | null
}

export interface DayDetailAnomaly {
  detection_id: string
  asset_id: string
  anomaly_type: string | null
  severity: string | null
  confidence: number | null
}

export interface DayDetail {
  date: string
  failed_runs: DayDetailFailedRun[]
  alerts: DayDetailAlert[]
  anomalies: DayDetailAnomaly[]
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (additive types only)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(dashboard): add TrendPoint/TrendScope/DayDetail types"
```

---

### Task 5: Extend `TrendChart` with alert/anomaly markers and click-to-drilldown

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

- [ ] **Step 1: Update the `TrendChart` function signature and import the shared type**

In `frontend/src/components/shared/charts.tsx`, add the import at the top of the file:

```typescript
import { TrendPoint } from '@/lib/types'
```

Replace the function signature line:

```typescript
export function TrendChart({ data }: { data: { date: string; score: number | null; failed: number }[] }) {
```

with:

```typescript
export function TrendChart({ data, onPointClick }: { data: TrendPoint[]; onPointClick?: (date: string) => void }) {
```

- [ ] **Step 2: Update the `validPts` type cast**

Replace:

```typescript
  const validPts = data.filter(d => d.score !== null) as { date: string; score: number; failed: number }[]
```

with:

```typescript
  const validPts = data.filter(d => d.score !== null) as (TrendPoint & { score: number })[]
```

- [ ] **Step 3: Add `hasAlerts`/`hasAnomalies` flags and a helper for marker x-positions**

After the line that computes `pts` (the `const pts = validPts.map(...)` block, just before `const linePath = ...`), add:

```typescript
  const hasAlerts = validPts.some(d => (d.alert_count ?? 0) > 0)
  const hasAnomalies = validPts.some(d => (d.anomaly_count ?? 0) > 0)
  const xFor = (i: number) => pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW
```

- [ ] **Step 4: Add `onClick` to the existing point circles**

Find the `{pts.map((p, i) => (` block that renders `<circle ... />` and update it to add `onClick` and a pointer cursor:

Replace:

```typescript
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            style={{ transition: 'r 0.1s' }} />
        ))}
```

with:

```typescript
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            onClick={() => onPointClick?.(p.date)}
            style={{ transition: 'r 0.1s', cursor: onPointClick ? 'pointer' : 'default' }} />
        ))}
```

- [ ] **Step 5: Add alert and anomaly marker glyphs**

Immediately after the circles block from Step 4 (still inside the `<svg>`, before the date-label `{validPts.filter(...)}` block), add:

```typescript
        {hasAlerts && validPts.map((d, i) => (d.alert_count ?? 0) > 0 ? (
          <polygon key={`alert-${i}`}
            points={`${xFor(i)},${pad.top - 10} ${xFor(i) - 4},${pad.top - 4} ${xFor(i) + 4},${pad.top - 4}`}
            fill="#8b5cf6"
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
        {hasAnomalies && validPts.map((d, i) => (d.anomaly_count ?? 0) > 0 ? (
          <rect key={`anomaly-${i}`}
            x={xFor(i) - 3} y={pad.top - 18} width="6" height="6" fill="#f97316"
            transform={`rotate(45 ${xFor(i)} ${pad.top - 15})`}
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
```

- [ ] **Step 6: Add a small legend row below the chart for the new markers**

Find the closing `</svg>` tag and the `{tooltip && (...)}` block immediately after it. After that `{tooltip && (...)}` block (but still inside the outer `<div style={{ position: 'relative' }}>`), add:

```typescript
      {(hasAlerts || hasAnomalies) && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', justifyContent: 'flex-end' }}>
          {hasAlerts && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#8b5cf6' }}>▲</span> Alerts</span>}
          {hasAnomalies && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#f97316' }}>◆</span> Anomalies</span>}
        </div>
      )}
```

- [ ] **Step 7: Verify the project still type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. Existing callers (`Dashboard.tsx`, `AssetQualityTab.tsx`) pass `{date, score, failed}` objects which satisfy `TrendPoint` (alert_count/anomaly_count are optional), and don't pass `onPointClick`, so behavior is unchanged for them.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(charts): add alert/anomaly markers and click-to-drilldown to TrendChart"
```

---

### Task 6: Create `TrendDrilldownPanel`

**Files:**
- Create: `frontend/src/components/shared/TrendDrilldownPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendScope, DayDetail } from '@/lib/types'

const rowLink: React.CSSProperties = {
  display: 'block', padding: '6px 10px', fontSize: '12px', color: 'var(--foreground)',
  textDecoration: 'none', borderBottom: '1px solid var(--surface-muted)',
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
    high:     { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)' },
    medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)' },
    low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  }
  const c = colors[severity] ?? colors.low
  return <span style={{ background: c.bg, color: c.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginLeft: '6px' }}>{severity}</span>
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        {title}
      </div>
      {count === 0
        ? <div style={{ padding: '10px', fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{empty}</div>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
    </div>
  )
}

export default function TrendDrilldownPanel({ date, scope, onClose }: {
  date: string | null
  scope: TrendScope
  onClose: () => void
}) {
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!date) { setDetail(null); return }
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (scope.assetId) params.set('asset_id', scope.assetId)
    else if (scope.subdomainId) params.set('subdomain_id', scope.subdomainId)
    else if (scope.domainId) params.set('domain_id', scope.domainId)
    fetch(`/api/dashboard/day-detail?${params.toString()}`)
      .then(r => r.json())
      .then((d: DayDetail) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [date, scope.assetId, scope.subdomainId, scope.domainId])

  if (!date) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', flex: 1, color: 'var(--foreground)' }}>{date}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '20px' }}>Loading…</div>}
          {!loading && detail && (
            <>
              <Section title={`Failed Runs (${detail.failed_runs.length})`} count={detail.failed_runs.length} empty="No failed runs on this date.">
                {detail.failed_runs.map(r => (
                  <Link key={r.run_id} href={`/rule-runs/${r.run_id}`} style={rowLink}>
                    <span style={{ fontWeight: 600 }}>{r.rule_name}</span>
                    <span style={{ color: 'var(--text-muted)' }}> · {r.table_name}</span>
                    {r.failed_rows_count != null && <span style={{ color: 'var(--status-error-text)' }}> · {r.failed_rows_count} failed rows</span>}
                  </Link>
                ))}
              </Section>
              <Section title={`Alerts (${detail.alerts.length})`} count={detail.alerts.length} empty="No alerts on this date.">
                {detail.alerts.map(a => (
                  <Link key={a.alert_id} href="/alerts" style={rowLink}>
                    {a.alert_type}
                    <SeverityBadge severity={a.severity} />
                    <span style={{ color: 'var(--text-muted)' }}> · {a.alert_status}</span>
                  </Link>
                ))}
              </Section>
              <Section title={`Anomalies (${detail.anomalies.length})`} count={detail.anomalies.length} empty="No anomalies on this date.">
                {detail.anomalies.map(d => (
                  <Link key={d.detection_id} href="/anomalies" style={rowLink}>
                    <span style={{ fontWeight: 600 }}>{d.anomaly_type ?? 'anomaly'}</span>
                    {d.severity && <SeverityBadge severity={d.severity} />}
                    {d.confidence != null && <span style={{ color: 'var(--text-muted)' }}> · {Math.round(d.confidence * 100)}% confidence</span>}
                  </Link>
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/TrendDrilldownPanel.tsx
git commit -m "feat(dashboard): add TrendDrilldownPanel for trend chart drilldowns"
```

---

### Task 7: Add "Trends & Monitoring" tab to the Dashboard

**Files:**
- Create: `frontend/src/components/dashboard/DashboardTrendsTab.tsx`
- Modify: `frontend/src/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Create `DashboardTrendsTab`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'

const TIME_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
]

interface DomainOption { domain_id: string; domain_name: string }

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px',
  borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer',
}

export default function DashboardTrendsTab() {
  const [daysLabel, setDaysLabel] = useState('Last 30 days')
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [domainId, setDomainId] = useState('')
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  const days = TIME_OPTIONS.find(o => o.label === daysLabel)?.days ?? 30

  useEffect(() => {
    fetch('/api/domains-list')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data)) return
        setDomains(
          data
            .map(d => ({ domain_id: String(d.domain_id ?? ''), domain_name: String(d.domain_name ?? d.name ?? '') }))
            .filter(d => d.domain_id)
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = domainId
      ? `/api/dashboard/history/domain/${domainId}?days=${days}`
      : `/api/dashboard/trend?days=${days}`
    fetch(url)
      .then(r => r.json())
      .then((data: { trend?: TrendPoint[]; history?: TrendPoint[] }) => setTrend(data.trend ?? data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [days, domainId])

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Quality, alert &amp; anomaly trends</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <select value={domainId} onChange={e => setDomainId(e.target.value)} style={selectStyle}>
            <option value="">All domains</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
          </select>
          <select value={daysLabel} onChange={e => setDaysLabel(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Quality trend · {daysLabel}</div>
          <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Failed runs</span></div>
          </div>
        </div>
        {loading
          ? <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
          : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Click any point on the chart to see that day&apos;s failed runs, alerts, and anomalies.
        </div>
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={domainId ? { domainId } : {}} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Add a tab bar to `Dashboard.tsx` and wrap the existing view**

In `frontend/src/components/dashboard/Dashboard.tsx`:

1. Add the import near the other imports:

```typescript
import DashboardTrendsTab from './DashboardTrendsTab'
```

2. Add new state alongside the existing `useState` calls (near `const [activeMetric, setActiveMetric] = useState<string | null>(null)`):

```typescript
  const [activeView, setActiveView] = useState<'overview' | 'trends'>('overview')
```

3. Find the top-bar block:

```tsx
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Data quality overview</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {stats.totalAssets} datasets · {stats.totalRules} rules · {stats.openAlerts} open issues
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <Dropdown label="time" options={TIME_OPTIONS} value={timeFilter} onChange={setTimeFilter} />
          <Dropdown label="domain" options={DOMAIN_OPTIONS} value={domainFilter} onChange={setDomainFilter} />
          <button onClick={runCheck} disabled={running} style={{
            background: 'var(--accent)', border: 'none', padding: '5px 12px',
            borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--accent-text)', cursor: running ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: running ? 0.6 : 1
          }}>{running ? '⏳…' : '+ Run'}</button>
        </div>
      </div>
```

Immediately after this `</div>` (still before the `{/* KPI Cards */}` comment), add a tab bar:

```tsx
      {/* view tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
        {(['overview', 'trends'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: '6px 14px', fontSize: '12px',
              fontWeight: activeView === view ? 600 : 400,
              color: activeView === view ? 'var(--foreground)' : 'var(--text-muted)',
              background: 'transparent', border: 'none',
              borderBottom: activeView === view ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: '-1px',
            }}
          >
            {view === 'overview' ? 'Overview' : 'Trends & Monitoring'}
          </button>
        ))}
      </div>
```

4. Wrap the rest of the existing body (from `{/* KPI Cards */}` through the end of the "Live results if available" block, i.e. everything that currently follows up to the final closing `</div>` of the component) in `{activeView === 'overview' && (<>...</>)}`, and add the trends tab as a sibling. Concretely:

   - Before the `{/* KPI Cards */}` comment, add: `{activeView === 'overview' && (<>`
   - After the closing of the "Live results if available" block (the `)}` that closes `{stats.recentChecks.length > 0 && (...)}`), add: `</>)}` followed by `{activeView === 'trends' && <DashboardTrendsTab />}`

   The resulting structure around those sections looks like:

```tsx
      {activeView === 'overview' && (<>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
        {/* ... unchanged ... */}
      </div>

      {/* ... all other existing sections, unchanged ... */}

      {/* Live results if available */}
      {stats.recentChecks.length > 0 && (
        <div style={{ ...card, marginTop: '10px' }}>
          {/* ... unchanged ... */}
        </div>
      )}
      </>)}
      {activeView === 'trends' && <DashboardTrendsTab />}
    </div>
  )
}
```

- [ ] **Step 3: Run the dev server and verify the Dashboard renders both tabs**

Run: `cd frontend && npm run dev` (or use the project's `run` skill)
Navigate to `/` and confirm:
- "Overview" tab shows the unchanged existing dashboard
- "Trends & Monitoring" tab shows the new chart, domain/time selectors, and loads without errors

- [ ] **Step 4: Run type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard
git commit -m "feat(dashboard): add Trends & Monitoring tab with drilldown"
```

---

### Task 8: Add "Trends" tab to Asset Detail panel

**Files:**
- Create: `frontend/src/components/asset-registry/AssetTrendsTab.tsx`
- Modify: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`

- [ ] **Step 1: Create `AssetTrendsTab`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'

const DAY_OPTIONS = [30, 60, 90]

export default function AssetTrendsTab({ assetId }: { assetId: string }) {
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/history/table/${assetId}?days=${days}`)
      .then(r => r.json())
      .then((data: { history?: TrendPoint[] }) => setTrend(data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [assetId, days])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Quality, alert &amp; anomaly trend</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DAY_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: days === d ? 'var(--accent-bg)' : 'var(--surface)',
              color: days === d ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: days === d ? 600 : 400,
            }}>{d}d</button>
          ))}
        </div>
      </div>
      {loading
        ? <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
        : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Click any point on the chart to see that day&apos;s failed runs, alerts, and anomalies for this asset.
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={{ assetId }} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Wire the new tab into `AssetDetailPanel.tsx`**

1. Add the import near the other tab-component imports:

```typescript
import AssetTrendsTab from './AssetTrendsTab'
```

2. Update the `Tab` type (currently `type Tab = 'overview' | 'profiling' | 'rules' | 'quality' | 'alerts'`):

```typescript
type Tab = 'overview' | 'profiling' | 'rules' | 'quality' | 'alerts' | 'trends'
```

3. Update the tab bar array (currently `(['overview', 'profiling', 'rules', 'quality', 'alerts'] as Tab[])`):

```typescript
          {(['overview', 'profiling', 'rules', 'quality', 'alerts', 'trends'] as Tab[]).map(tab => (
```

4. After the "Alerts tab content" block:

```tsx
      {/* Alerts tab content */}
      {isLeaf && activeTab === 'alerts' && (
        <AssetAlertsTab assetId={asset.asset_id} />
      )}
```

add:

```tsx
      {/* Trends tab content */}
      {isLeaf && activeTab === 'trends' && (
        <AssetTrendsTab assetId={asset.asset_id} />
      )}
```

- [ ] **Step 3: Run the dev server and verify**

Navigate to Asset Registry, select a table/view asset, click the new "Trends" tab, confirm the chart loads and clicking a point opens the drilldown panel scoped to that asset.

- [ ] **Step 4: Run type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/asset-registry
git commit -m "feat(asset-registry): add Trends tab to Asset Detail panel"
```

---

### Task 9: Add "Health Trends" panel to Domains detail slide-in

**Files:**
- Create: `frontend/src/components/domains/DomainHealthTrends.tsx`
- Modify: `frontend/src/app/domains/page.tsx`

- [ ] **Step 1: Create `DomainHealthTrends`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'

export default function DomainHealthTrends({ domainId }: { domainId: string }) {
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/history/domain/${domainId}?days=30`)
      .then(r => r.json())
      .then((data: { history?: TrendPoint[] }) => setTrend(data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [domainId])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Health Trends (30d)
      </div>
      <div style={{ padding: '10px' }}>
        {loading
          ? <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
          : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={{ domainId }} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the Domains slide-in panel**

In `frontend/src/app/domains/page.tsx`:

1. Add the import near the top:

```typescript
import DomainHealthTrends from '@/components/domains/DomainHealthTrends'
```

2. Find the "Quick links" block inside the slide-in panel:

```tsx
              {/* Quick links */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <Link href="/issues" style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid var(--status-error-bg)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '11px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Issues</Link>
                <Link href="/rules" style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', fontSize: '11px', fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>View Rules</Link>
              </div>
```

Add the new panel immediately after this block, still inside the same wrapping `<div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>`:

```tsx
              {/* Health Trends */}
              <DomainHealthTrends domainId={selected.id} />
```

- [ ] **Step 3: Run the dev server and verify**

Navigate to `/domains`, click a domain row to open the slide-in panel, confirm the "Health Trends" section loads a chart below "Quick links" and clicking a point opens the drilldown panel scoped to that domain.

- [ ] **Step 4: Run type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/domains frontend/src/app/domains/page.tsx
git commit -m "feat(domains): add Health Trends panel to domain detail slide-in"
```

---

### Task 10: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the backend test suite**

Run: `python -m pytest tests/ -v`
Expected: all tests pass, including the 5 new tests in `tests/test_dashboard_trend.py`

- [ ] **Step 2: Run frontend type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors, build succeeds

- [ ] **Step 3: Manual UI walkthrough**

Using the `run` skill (or `npm run dev` + browser), verify:
- Dashboard "Overview" tab is visually unchanged from before this change
- Dashboard "Trends & Monitoring" tab renders a chart, domain/time filters work, clicking a chart point opens the drilldown panel with failed runs/alerts/anomalies (or correct empty states)
- AssetQualityTab's existing trend chart (in Asset Detail "quality" tab) still renders correctly (no alert/anomaly markers expected there since that history doesn't carry those fields)
- Asset Detail "Trends" tab renders a per-asset chart with day-range buttons and drilldown
- Domains page slide-in panel shows "Health Trends" with drilldown

- [ ] **Step 4: Commit any final fixups**

If the manual walkthrough surfaces issues, fix them and commit:

```bash
git add -A
git commit -m "fix(dashboard): address trend/drilldown UI issues from manual review"
```
