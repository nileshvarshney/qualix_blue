# Data Quality Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix LLM semantic check SQL, add post-run AI enrichment with auto Issue creation, real-time anomaly detection, and predictive quality score forecasting with a confidence-band chart.

**Architecture:** A new `post_run_service.py` orchestrator fires via `asyncio.create_task()` after every `execute_rule()` call. It triggers the z-score anomaly detector, generates AI explanations, auto-creates Issues for failures, and enriches existing DQAlerts. A separate `forecast_service.py` provides moving-average forecasting exposed via a new `/quality-scores/assets/{id}/forecast` endpoint, consumed by an extended `TrendChart` in the frontend.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async, APScheduler, Alembic (migrations), Next.js 14 (App Router with `params: Promise<...>`), inline SVG for chart rendering, `statistics` stdlib module.

## Global Constraints

- All Python files must use `from __future__ import annotations` at the top.
- SQLAlchemy async sessions must use `AsyncSession`; never use sync sessions in async functions.
- Next.js route handler params are `Promise<{ paramName: string }>` — always `await params` before use.
- LLM provider is obtained via `ai_service.get_provider_from_db(None, db)` — pass `None` as provider_name to use DB settings.
- Alembic migration revisions: next is `"0024"`, `down_revision = "0023"`.
- `score_level` for asset-level scores in `dq_dimension_scores` is `"table"` (not `"asset"`).
- `DQRule` has no `assigned_team_id` field — always pass `None` for `Issue.assigned_team_id`.
- `run_zscore_detector()` returns `Optional[dict]` (not an ORM object); dict keys: `detection_id`, `asset_id`, `anomaly_type`, `observed_value`, `mean`, `std`, `z_score`, `confidence`.
- Error isolation: every orchestrator step must be wrapped in `try/except` with `logger.warning(...)`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/services/sql_generator.py` | Modify ~line 410 | Fix `_llm_semantic_check` to return actual rows |
| `app/db/models.py` | Modify ~line 880 | Add `ai_explanation` column to `AnomalyDetection` |
| `migrations/versions/0024_anomaly_ai_explanation.py` | Create | Alembic migration for the new column |
| `app/services/ai_service.py` | Modify | Add `explain_anomaly()` function |
| `app/services/forecast_service.py` | Create | Moving-average forecast with confidence bands |
| `app/api/quality_scores.py` | Modify | Add `GET /quality-scores/assets/{id}/forecast` |
| `app/services/post_run_service.py` | Create | Post-run orchestrator |
| `app/services/execution_service.py` | Modify ~lines 330, 341 | Fire post-run hook after every rule run |
| `frontend/src/lib/types.ts` | Modify | Add `ForecastResponse` type |
| `frontend/src/app/api/quality-scores/assets/[assetId]/forecast/route.ts` | Create | Next.js proxy for forecast endpoint |
| `frontend/src/components/shared/charts.tsx` | Modify | Extend `TrendChart` with forecast + confidence band |
| `frontend/src/components/asset-registry/AssetQualityTab.tsx` | Modify | Fetch forecast and pass to TrendChart |
| `tests/test_sql_generator.py` | Modify | Add test for fixed LLM semantic check SQL |
| `tests/test_forecast_service.py` | Create | Unit tests for forecast computation |
| `tests/test_post_run_service.py` | Create | Unit tests for orchestrator logic |

---

## Task 1: Fix LLM Semantic Check SQL

**Files:**
- Modify: `app/services/sql_generator.py` (~line 410)
- Modify: `tests/test_sql_generator.py`

**Interfaces:**
- Produces: `sql_generator.generate("llm_semantic_check", config, table_ref, column)` now returns `SELECT * FROM table ORDER BY RANDOM() LIMIT N` instead of a wrapped count query.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_sql_generator.py`:

```python
def test_llm_semantic_check_returns_actual_rows():
    """SQL must return actual rows, not a wrapped failed_count=0."""
    sql = gen.generate("llm_semantic_check", {"sample_size": 50}, TABLE, None)
    assert "SELECT *" in sql
    assert "LIMIT 50" in sql
    assert "failed_count" not in sql

def test_llm_semantic_check_default_sample_size():
    sql = gen.generate("llm_semantic_check", {}, TABLE, None)
    assert "LIMIT 100" in sql
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_sql_generator.py::test_llm_semantic_check_returns_actual_rows tests/test_sql_generator.py::test_llm_semantic_check_default_sample_size -v
```

Expected: FAIL — `assert "SELECT *" in sql` fails because current SQL is `SELECT 0 AS failed_count FROM (...) _sample`.

- [ ] **Step 3: Fix `_llm_semantic_check` in `sql_generator.py`**

Find the `_llm_semantic_check` method (~line 404) and replace its return statement:

```python
def _llm_semantic_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
    """
    Samples rows for LLM-based semantic validation.
    Returns actual data rows so _llm_semantic_validate() in execution_service
    can pass meaningful content to the LLM.
    config.sample_size: number of rows to sample (default 100)
    config.validation_prompt: validation instruction for the LLM
    """
    sample_size = config.get("sample_size", 100)
    return f"SELECT * FROM {table_ref} ORDER BY RANDOM() LIMIT {sample_size}"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_sql_generator.py -v
```

Expected: All tests PASS (including the two new ones and existing ones).

- [ ] **Step 5: Commit**

```bash
git add app/services/sql_generator.py tests/test_sql_generator.py
git commit -m "fix(dq): llm_semantic_check SQL now returns actual sample rows for LLM validation"
```

---

## Task 2: Add `ai_explanation` to AnomalyDetection

**Files:**
- Modify: `app/db/models.py` (~line 880, inside `AnomalyDetection` class)
- Create: `migrations/versions/0024_anomaly_ai_explanation.py`

**Interfaces:**
- Produces: `AnomalyDetection.ai_explanation` — `Optional[str]` column, used by Task 6 (orchestrator) and returned by the anomaly API.

- [ ] **Step 1: Add the column to the ORM model**

In `app/db/models.py`, find the `AnomalyDetection` class. After the `is_acknowledged` line, add:

```python
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Create the Alembic migration**

Create `migrations/versions/0024_anomaly_ai_explanation.py`:

```python
"""anomaly_detections: add ai_explanation column for LLM-generated anomaly context"""

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "anomaly_detections",
        sa.Column("ai_explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("anomaly_detections", "ai_explanation")
```

- [ ] **Step 3: Run the migration**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
alembic upgrade head
```

Expected output ends with: `Running upgrade 0023 -> 0024, anomaly_detections: add ai_explanation column`.

- [ ] **Step 4: Verify column exists**

```bash
python -c "
import asyncio
from app.db.database import AsyncSessionLocal
from sqlalchemy import text
async def check():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text('PRAGMA table_info(anomaly_detections)'))
        cols = [row[1] for row in r.fetchall()]
        print('ai_explanation in cols:', 'ai_explanation' in cols)
asyncio.run(check())
"
```

Expected: `ai_explanation in cols: True`

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py migrations/versions/0024_anomaly_ai_explanation.py
git commit -m "feat(dq): add ai_explanation column to anomaly_detections"
```

---

## Task 3: Add `explain_anomaly()` to ai_service.py

**Files:**
- Modify: `app/services/ai_service.py` (add after `explain_failure` function ~line 450)

**Interfaces:**
- Consumes: `detection_info: dict` with keys `observed_value`, `mean`, `std`, `z_score`, `confidence`; `asset: Asset` ORM object; `provider_name: Optional[str]`; `db: AsyncSession`
- Produces: `explain_anomaly(detection_info, asset, provider_name, db) -> str` — 2–3 sentence plain-text explanation

- [ ] **Step 1: Add the function to `ai_service.py`**

Insert the following after the `explain_failure` function (after its closing line, ~line 450):

```python
async def explain_anomaly(
    detection_info: dict,
    asset: "Asset",
    provider_name: Optional[str],
    db: AsyncSession,
) -> str:
    """Generate a 2-3 sentence plain-text explanation for a quality score anomaly."""
    prompt = (
        f"Asset: {asset.sf_schema_name}.{asset.sf_table_name}\n"
        f"Anomaly: quality score dropped to {detection_info.get('observed_value', 'N/A')}\n"
        f"Expected range: {detection_info.get('mean', 'N/A')} ± {detection_info.get('std', 'N/A')}\n"
        f"Z-score: {detection_info.get('z_score', 'N/A')} (anomaly threshold: 2.5)\n"
        f"Confidence: {detection_info.get('confidence', 0):.0%}\n\n"
        "In 2-3 sentences, explain why the quality score may have deviated from normal "
        "and what the likely business impact is. Return plain text, no markdown, no bullet points."
    )
    _sys_anomaly = (
        "You are a data quality expert. Explain a quality score anomaly concisely. "
        "Focus on root cause hypothesis and business impact. Return plain text only."
    )
    provider = await get_provider_from_db(provider_name, db)
    return await provider.complete(prompt, _sys_anomaly, max_tokens=200)
```

- [ ] **Step 2: Verify import is not needed**

`get_provider_from_db`, `Optional`, `AsyncSession`, and `Asset` are already imported at the top of `ai_service.py`. Confirm:

```bash
grep -n "from app.db.models import\|from typing import\|AsyncSession" app/services/ai_service.py | head -10
```

If `Asset` is not in the models import line, add it.

- [ ] **Step 3: Smoke-test the function signature**

```bash
python -c "
import inspect
from app.services.ai_service import explain_anomaly
sig = inspect.signature(explain_anomaly)
print('params:', list(sig.parameters.keys()))
"
```

Expected: `params: ['detection_info', 'asset', 'provider_name', 'db']`

- [ ] **Step 4: Commit**

```bash
git add app/services/ai_service.py
git commit -m "feat(dq): add explain_anomaly() LLM function for anomaly context generation"
```

---

## Task 4: Create `forecast_service.py`

**Files:**
- Create: `app/services/forecast_service.py`
- Create: `tests/test_forecast_service.py`

**Interfaces:**
- Produces: `compute_forecast(scores, horizon=7, window=7) -> Optional[ForecastResult]`
  - Returns `None` if `len(scores) < 3`
  - `ForecastResult` has `.forecast`, `.upper_band`, `.lower_band` — each `list[float]` of length `horizon`, values clamped to `[0, 100]`

- [ ] **Step 1: Write the tests first**

Create `tests/test_forecast_service.py`:

```python
from app.services.forecast_service import compute_forecast


def test_returns_correct_horizon_length():
    scores = [80, 82, 79, 83, 85, 81, 84, 80, 82, 78]
    result = compute_forecast(scores, horizon=7, window=7)
    assert result is not None
    assert len(result.forecast) == 7
    assert len(result.upper_band) == 7
    assert len(result.lower_band) == 7


def test_insufficient_history_returns_none():
    assert compute_forecast([80, 85]) is None
    assert compute_forecast([80]) is None
    assert compute_forecast([]) is None


def test_three_points_is_minimum():
    result = compute_forecast([80, 85, 90], horizon=3)
    assert result is not None
    assert len(result.forecast) == 3


def test_all_values_clamped_0_to_100():
    scores = [100.0] * 10
    result = compute_forecast(scores, horizon=3)
    assert all(0.0 <= v <= 100.0 for v in result.forecast)
    assert all(0.0 <= v <= 100.0 for v in result.upper_band)
    assert all(0.0 <= v <= 100.0 for v in result.lower_band)


def test_upper_band_geq_forecast():
    scores = [70, 75, 80, 72, 68, 78, 82, 76, 71, 85]
    result = compute_forecast(scores, horizon=5)
    assert all(u >= f for f, u in zip(result.forecast, result.upper_band))


def test_lower_band_leq_forecast():
    scores = [70, 75, 80, 72, 68, 78, 82, 76, 71, 85]
    result = compute_forecast(scores, horizon=5)
    assert all(l <= f for f, l in zip(result.forecast, result.lower_band))


def test_constant_scores_zero_std_bands_equal_forecast():
    """When all values are identical, std=0, so bands equal the forecast."""
    scores = [75.0] * 10
    result = compute_forecast(scores, horizon=3)
    for f, u, lo in zip(result.forecast, result.upper_band, result.lower_band):
        assert f == u == lo


def test_forecast_values_are_rounded_to_2_decimals():
    scores = [80.333, 82.111, 79.777, 83.5, 85.25, 81.6, 84.1, 80.0, 82.9, 78.4]
    result = compute_forecast(scores, horizon=3)
    for v in result.forecast:
        assert round(v, 2) == v


def test_window_larger_than_history_uses_full_history():
    scores = [80, 82, 79]
    result = compute_forecast(scores, horizon=2, window=10)
    assert result is not None
    assert len(result.forecast) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_forecast_service.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.forecast_service'`

- [ ] **Step 3: Create `app/services/forecast_service.py`**

```python
from __future__ import annotations
import statistics
from dataclasses import dataclass
from typing import Optional


@dataclass
class ForecastResult:
    forecast: list[float]
    upper_band: list[float]
    lower_band: list[float]


def compute_forecast(
    scores: list[float],
    horizon: int = 7,
    window: int = 7,
) -> Optional[ForecastResult]:
    """
    Self-updating moving average forecast with 1.5-sigma confidence bands.

    Each projected point is fed back into the window so bands widen naturally
    over the forecast horizon.

    Returns None when fewer than 3 data points are provided.
    """
    if len(scores) < 3:
        return None

    effective_window = min(window, len(scores))
    projected = list(scores)
    forecast: list[float] = []
    upper_band: list[float] = []
    lower_band: list[float] = []

    for _ in range(horizon):
        window_vals = projected[-effective_window:]
        mean = sum(window_vals) / len(window_vals)
        std = statistics.stdev(window_vals) if len(window_vals) > 1 else 0.0

        forecast.append(round(max(0.0, min(100.0, mean)), 2))
        upper_band.append(round(max(0.0, min(100.0, mean + 1.5 * std)), 2))
        lower_band.append(round(max(0.0, min(100.0, mean - 1.5 * std)), 2))
        projected.append(mean)

    return ForecastResult(forecast=forecast, upper_band=upper_band, lower_band=lower_band)
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
pytest tests/test_forecast_service.py -v
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/forecast_service.py tests/test_forecast_service.py
git commit -m "feat(dq): add forecast_service with moving-average confidence band computation"
```

---

## Task 5: Add Forecast API Endpoint

**Files:**
- Modify: `app/api/quality_scores.py`

**Interfaces:**
- Consumes: `forecast_service.compute_forecast(scores, horizon) -> Optional[ForecastResult]`
- Produces: `GET /quality-scores/assets/{asset_id}/forecast?days=30&horizon=7` returns:
  ```json
  {
    "asset_id": "...",
    "history": [{"date": "2026-05-20", "score": 84.1}],
    "forecast": [{"date": "2026-06-20", "score": 81.3}],
    "upper_band": [{"date": "2026-06-20", "score": 87.0}],
    "lower_band": [{"date": "2026-06-20", "score": 75.6}],
    "insufficient_history": false
  }
  ```

- [ ] **Step 1: Add the endpoint to `app/api/quality_scores.py`**

Add the following after the existing `get_asset_quality_history` function (at the end of the file):

```python
@router.get("/assets/{asset_id}/forecast")
async def get_asset_quality_forecast(
    asset_id: str,
    days: int = Query(default=30, ge=7, le=90),
    horizon: int = Query(default=7, ge=1, le=14),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    today = datetime.now(timezone.utc).replace(tzinfo=None).date()
    cutoff = today - timedelta(days=days - 1)

    rows = (
        await db.execute(
            select(DQDimensionScore).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
                DQDimensionScore.dimension == "overall",
                DQDimensionScore.score_date >= cutoff,
                DQDimensionScore.score_date <= today,
            )
        )
    ).scalars().all()

    history = [
        {"date": str(r.score_date), "score": r.score}
        for r in sorted(rows, key=lambda r: r.score_date)
        if r.score is not None
    ]

    from app.services.forecast_service import compute_forecast
    fc = compute_forecast([h["score"] for h in history], horizon=horizon)

    if fc is None:
        return {
            "asset_id": asset_id,
            "history": history,
            "forecast": [],
            "upper_band": [],
            "lower_band": [],
            "insufficient_history": True,
        }

    forecast_dates = [str(today + timedelta(days=i + 1)) for i in range(horizon)]
    return {
        "asset_id": asset_id,
        "history": history,
        "forecast": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.forecast)],
        "upper_band": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.upper_band)],
        "lower_band": [{"date": d, "score": s} for d, s in zip(forecast_dates, fc.lower_band)],
        "insufficient_history": False,
    }
```

- [ ] **Step 2: Verify the endpoint is reachable**

Start the backend if not running:
```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
uvicorn app.main:app --reload --port 8000 &
sleep 3
curl -s "http://localhost:8000/quality-scores/assets/nonexistent/forecast" | python -m json.tool
```

Expected: `{"detail": "Asset not found"}` (404 response body) — proves the route is registered.

- [ ] **Step 3: Commit**

```bash
git add app/api/quality_scores.py
git commit -m "feat(dq): add /quality-scores/assets/{id}/forecast endpoint with moving-average projection"
```

---

## Task 6: Create Post-Run Orchestrator

**Files:**
- Create: `app/services/post_run_service.py`
- Create: `tests/test_post_run_service.py`

**Interfaces:**
- Produces: `async def handle(run_id: str, asset_id: str) -> None` — opens its own DB session internally; safe to call via `asyncio.create_task()`

- [ ] **Step 1: Write tests first**

Create `tests/test_post_run_service.py`:

```python
"""Tests for post_run_service orchestrator.
Uses mocks to avoid DB and LLM calls.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_handle_exits_gracefully_when_run_not_found():
    """Orchestrator should return silently if run_id doesn't exist."""
    mock_db = AsyncMock()
    mock_db.execute.return_value.scalar_one_or_none.return_value = None

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session:
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services.post_run_service import handle
        # Should not raise
        await handle("nonexistent-run-id", "some-asset-id")


@pytest.mark.asyncio
async def test_anomaly_detection_failure_does_not_prevent_issue_creation():
    """Step 1 failure (anomaly) must not block Step 4 (issue creation)."""
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_run = MagicMock()
    mock_run.run_id = "run-1"
    mock_run.rule_id = "rule-1"
    mock_run.asset_id = "asset-1"
    mock_run.domain_id = "domain-1"
    mock_run.subdomain_id = "sub-1"
    mock_run.status = "failed"
    mock_run.quality_score = 45.0

    mock_rule = MagicMock()
    mock_rule.rule_id = "rule-1"
    mock_rule.rule_name = "Null Check"
    mock_rule.severity = "high"

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-1"
    mock_asset.sf_table_name = "orders"
    mock_asset.sf_schema_name = "sales"

    added_objects = []

    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.add = lambda obj: added_objects.append(obj)

    call_count = [0]
    def mock_execute(query):
        call_count[0] += 1
        result = AsyncMock()
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_rule
        elif call_count[0] == 3:
            result.scalar_one_or_none.return_value = mock_asset
        else:
            result.scalar_one_or_none.return_value = None
        return result
    mock_db.execute = mock_execute

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session, \
         patch("app.services.post_run_service._trigger_anomaly_detection", side_effect=Exception("detector broke")), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock) as mock_issue, \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="AI explanation text"):
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()
        mock_issue.return_value = None

        from app.services import post_run_service
        import importlib
        importlib.reload(post_run_service)

        await post_run_service._run("run-1", "asset-1", mock_db)
        mock_issue.assert_called_once()
```

- [ ] **Step 2: Create `app/services/post_run_service.py`**

```python
from __future__ import annotations
import asyncio
import logging
import uuid
from typing import Optional

logger = logging.getLogger("dq_platform.post_run")


async def handle(run_id: str, asset_id: str) -> None:
    """
    Post-run orchestrator entry point. Opens its own DB session so it is
    fully independent of the rule execution session that called it.
    Call via asyncio.create_task() — do not await directly from execute_rule().
    """
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _run(run_id, asset_id, db)


async def _run(run_id: str, asset_id: str, db) -> None:
    from sqlalchemy import select
    from app.db.models import DQRule, DQRuleRun, Asset

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        logger.warning(f"post_run: run {run_id} not found — skipping")
        return

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        logger.warning(f"post_run: rule {run.rule_id} not found — skipping")
        return

    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        logger.warning(f"post_run: asset {asset_id} not found — skipping")
        return

    # ── Step 1: Trigger anomaly detection ─────────────────────────────────────
    detection_info: Optional[dict] = None
    try:
        detection_info = await _trigger_anomaly_detection(asset_id, db)
    except Exception as e:
        logger.warning(f"post_run: anomaly detection failed for asset {asset_id}: {e}")

    # ── Step 2: Generate AI explanation for failures or low-scoring runs ───────
    explanation: Optional[str] = None
    if run.status in ("failed", "error") or (run.quality_score is not None and run.quality_score < 70):
        try:
            from app.services import ai_service
            explanation = await ai_service.explain_failure(run_id, run.rule_id, None, db)
            run.ai_explanation = explanation
            await db.commit()
        except Exception as e:
            logger.warning(f"post_run: explain_failure failed for run {run_id}: {e}")

    # ── Step 3: Generate AI explanation for the anomaly ───────────────────────
    if detection_info is not None:
        try:
            from app.services import ai_service
            from app.db.models import AnomalyDetection
            anomaly_text = await ai_service.explain_anomaly(detection_info, asset, None, db)
            det_res = await db.execute(
                select(AnomalyDetection).where(
                    AnomalyDetection.detection_id == detection_info["detection_id"]
                )
            )
            detection_obj = det_res.scalar_one_or_none()
            if detection_obj:
                detection_obj.ai_explanation = anomaly_text
                await db.commit()
        except Exception as e:
            logger.warning(f"post_run: explain_anomaly failed for detection {detection_info.get('detection_id')}: {e}")

    # ── Step 4: Auto-create Issue for failures ────────────────────────────────
    if run.status == "failed":
        try:
            await _auto_create_issue(run, rule, asset, db)
        except Exception as e:
            logger.warning(f"post_run: issue creation failed for run {run_id}: {e}")

    # ── Step 5: Enrich existing DQAlert with AI explanation ──────────────────
    if explanation:
        try:
            await _enrich_alert(run_id, explanation, db)
        except Exception as e:
            logger.warning(f"post_run: alert enrichment failed for run {run_id}: {e}")


async def _trigger_anomaly_detection(asset_id: str, db) -> Optional[dict]:
    from sqlalchemy import select
    from app.db.models import AnomalyDetector
    from app.services.anomaly_service import run_zscore_detector

    det_res = await db.execute(
        select(AnomalyDetector).where(
            AnomalyDetector.asset_id == asset_id,
            AnomalyDetector.is_active == True,
        )
    )
    detector = det_res.scalar_one_or_none()

    if detector is None:
        detector = AnomalyDetector(
            detector_id=str(uuid.uuid4()),
            asset_id=asset_id,
            detector_type="zscore",
            config={"z_threshold": 2.5, "min_history": 7},
            is_active=True,
            created_by="system",
        )
        db.add(detector)
        await db.commit()
        await db.refresh(detector)

    return await run_zscore_detector(detector.detector_id, db)


async def _auto_create_issue(run, rule, asset, db) -> None:
    from sqlalchemy import select
    from app.db.models import Issue
    from app.services import ai_service

    existing = await db.execute(
        select(Issue).where(
            Issue.rule_id == rule.rule_id,
            Issue.status.not_in(["closed", "resolved"]),
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.debug(f"post_run: open issue exists for rule {rule.rule_id} — skipping creation")
        return

    description = f"Rule '{rule.rule_name}' failed. Manual investigation required."
    try:
        plan = await ai_service.generate_remediation_plan(run.asset_id, None, db)
        if plan.get("steps"):
            lines = [f"**AI Remediation Plan**\n\n{plan.get('summary', '')}"]
            for step in plan["steps"]:
                priority = step.get("priority", "").upper()
                action = step.get("action", "")
                owner = step.get("owner_role", "")
                effort = step.get("estimated_effort", "")
                lines.append(f"- [{priority}] {action} (owner: {owner}, effort: {effort})")
            description = "\n".join(lines)
    except Exception as e:
        logger.warning(f"post_run: generate_remediation_plan failed: {e}")

    issue = Issue(
        title=f"[Auto] {rule.rule_name} failed on {asset.sf_table_name}",
        description=description,
        issue_type="data_quality",
        status="new",
        severity=rule.severity,
        domain_id=run.domain_id,
        subdomain_id=run.subdomain_id,
        asset_id=run.asset_id,
        rule_id=run.rule_id,
        run_id=run.run_id,
        assigned_team_id=None,
        created_by="system",
    )
    db.add(issue)
    await db.commit()
    logger.info(f"post_run: auto-created issue for rule {rule.rule_id} on asset {asset.asset_id}")


async def _enrich_alert(run_id: str, explanation: str, db) -> None:
    from sqlalchemy import select
    from app.db.models import DQAlert

    alert_res = await db.execute(
        select(DQAlert).where(
            DQAlert.run_id == run_id,
            DQAlert.alert_status == "open",
        )
    )
    alert = alert_res.scalar_one_or_none()
    if alert:
        alert.alert_message = explanation[:500]
        await db.commit()
        logger.debug(f"post_run: enriched alert for run {run_id} with AI explanation")
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_post_run_service.py -v
```

Expected: Both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/post_run_service.py tests/test_post_run_service.py
git commit -m "feat(dq): add post_run_service orchestrator for AI enrichment, issue creation, anomaly detection"
```

---

## Task 7: Wire Post-Run Hook in execution_service.py

**Files:**
- Modify: `app/services/execution_service.py` (~lines 329–342)

**Interfaces:**
- Consumes: `post_run_service.handle(run_id, asset_id)` from Task 6
- Produces: Every `DQRuleRun` (success, failure, error) triggers the orchestrator via `asyncio.create_task()`

- [ ] **Step 1: Add the hook call after the successful run path**

In `app/services/execution_service.py`, find the successful execution block. After `logger.info(...)` and before the `from app.services.alert_service` import (~line 330), add the post-run hook call. The complete block from `run = DQRuleRun(...)` to the `return run` should look like:

```python
        run = DQRuleRun(
            run_id=_gen_id(),
            rule_id=rule_id,
            asset_id=asset.asset_id,
            domain_id=rule.domain_id,
            subdomain_id=rule.subdomain_id,
            execution_start_time=start,
            execution_end_time=end,
            status=status,
            total_rows_scanned=total_count,
            failed_rows_count=failed_count,
            passed_rows_count=passed_count,
            failure_percentage=round(failure_pct, 4),
            quality_score=quality_score,
            executed_sql=sql,
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        logger.info(f"Rule {rule_id} executed: status={status}, score={quality_score}")
        from app.services.alert_service import create_alert_if_needed
        await create_alert_if_needed(run, rule, db)
        from app.services.post_run_service import handle as _post_run_handle
        asyncio.create_task(_post_run_handle(run.run_id, run.asset_id))
        return run
```

- [ ] **Step 2: Add the hook call after the error path**

In the `except` block (~line 335), after `await create_alert_if_needed(run, rule, db)`, add:

```python
    except Exception as e:
        end = datetime.now(timezone.utc).replace(tzinfo=None)
        logger.error(f"Rule {rule_id} execution error: {e}")
        run = await _save_error_run(db, rule, asset, str(e), start, end, locals().get("sql"))
        from app.services.alert_service import create_alert_if_needed
        await create_alert_if_needed(run, rule, db)
        from app.services.post_run_service import handle as _post_run_handle
        asyncio.create_task(_post_run_handle(run.run_id, run.asset_id))
        return run
```

- [ ] **Step 3: Verify the import works**

```bash
python -c "from app.services.execution_service import execute_rule; print('import OK')"
```

Expected: `import OK`

- [ ] **Step 4: Run the existing rule engine tests**

```bash
pytest tests/test_rule_engine.py -v
```

Expected: All tests PASS (hook fires but doesn't affect test outcomes since it's fire-and-forget).

- [ ] **Step 5: Commit**

```bash
git add app/services/execution_service.py
git commit -m "feat(dq): fire post_run_service hook after every rule execution for real-time enrichment"
```

---

## Task 8: Frontend Forecast Types and Proxy Route

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/app/api/quality-scores/assets/[assetId]/forecast/route.ts`

**Interfaces:**
- Produces: `ForecastResponse` TypeScript type; `GET /api/quality-scores/assets/{assetId}/forecast?days=30&horizon=7` proxy endpoint

- [ ] **Step 1: Add `ForecastResponse` type to `frontend/src/lib/types.ts`**

Add after the `AssetQualityHistory` interface:

```typescript
export interface ForecastPoint {
  date: string
  score: number
}

export interface ForecastResponse {
  asset_id: string
  history: ForecastPoint[]
  forecast: ForecastPoint[]
  upper_band: ForecastPoint[]
  lower_band: ForecastPoint[]
  insufficient_history: boolean
}
```

- [ ] **Step 2: Create the proxy route directory and file**

```bash
mkdir -p /Users/laxmansrigiri/git_repo/DataGuard/frontend/src/app/api/quality-scores/assets/\[assetId\]/forecast
```

Create `frontend/src/app/api/quality-scores/assets/[assetId]/forecast/route.ts`:

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
    const days = req.nextUrl.searchParams.get('days') ?? '30'
    const horizon = req.nextUrl.searchParams.get('horizon') ?? '7'
    const res = await fetch(
      `${BACKEND}/quality-scores/assets/${assetId}/forecast?days=${days}&horizon=${horizon}`,
      { cache: 'no-store' }
    )
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors on the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/app/api/quality-scores/assets/\[assetId\]/forecast/route.ts
git commit -m "feat(dq): add ForecastResponse type and Next.js forecast proxy route"
```

---

## Task 9: Extend TrendChart with Forecast Visualization

**Files:**
- Modify: `frontend/src/components/shared/charts.tsx`

**Interfaces:**
- Consumes: `ForecastPoint` type from `@/lib/types`
- Produces: Updated `TrendChart` accepting optional `forecastData`, `upperBand`, `lowerBand` props. When present, renders dashed forecast line, shaded confidence band, and a vertical "today" divider.

- [ ] **Step 1: Update the TrendChart props and core computation in `charts.tsx`**

Replace the current `TrendChart` function signature and the `w, h, pad, chartW, chartH, min, max` section:

```typescript
import { TrendPoint, ForecastPoint } from '@/lib/types'

export function TrendChart({
  data,
  onPointClick,
  forecastData,
  upperBand,
  lowerBand,
}: {
  data: TrendPoint[]
  onPointClick?: (date: string) => void
  forecastData?: ForecastPoint[]
  upperBand?: ForecastPoint[]
  lowerBand?: ForecastPoint[]
}) {
```

Then update the `min` calculation to include forecast values so the y-axis accommodates the confidence band:

```typescript
  const w = 600, h = 240, pad = { top: 20, right: 20, bottom: 30, left: 35 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom

  const hasForecast = (forecastData?.length ?? 0) > 0
  const totalSlots = validPts.length + (hasForecast ? forecastData!.length : 0)

  const allScores = [
    ...validPts.map(d => d.score),
    ...(hasForecast ? forecastData!.map(d => d.score) : []),
    ...(lowerBand?.map(d => d.score) ?? []),
  ]
  const min = Math.max(0, Math.floor(Math.min(...allScores) / 5) * 5 - 5)
  const max = 100
  const gridLines = Array.from({ length: 5 }, (_, i) => Math.round((min + (max - min) * (i / 4)) * 10) / 10)

  // Use totalSlots for x positioning so historical + forecast share the same axis
  const xForN = (i: number) => pad.left + (i / Math.max(totalSlots - 1, 1)) * chartW

  const pts = validPts.map((d, i) => ({
    x: xForN(i),
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))
```

- [ ] **Step 2: Replace the existing `xFor` usages with `xForN`**

In the existing code, `xFor` is defined as:
```typescript
const xFor = (i: number) => pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW
```
Delete that line. Everywhere `xFor(i)` is used (alert triangles, anomaly diamonds, x-axis labels) replace with `xForN(i)`.

- [ ] **Step 3: Add forecast SVG elements before the closing `</svg>` tag**

After the existing `{validPts.filter(...).map(...)}` label section and before `</svg>`, add:

```typescript
        {/* Confidence band shaded area */}
        {hasForecast && upperBand?.length && lowerBand?.length && (() => {
          const uPts = upperBand.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((Math.min(d.score, 100) - min) / (max - min)) * chartH,
          }))
          const lPts = lowerBand.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((Math.max(d.score, min) - min) / (max - min)) * chartH,
          }))
          const topPath = uPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
          const bottomPath = [...lPts].reverse().map((p, i) => `${i === 0 ? 'L' : 'L'}${p.x},${p.y}`).join(' ')
          return <path d={`${topPath} ${bottomPath} Z`} fill="#3b82f6" fillOpacity="0.08" />
        })()}

        {/* Forecast dashed line */}
        {hasForecast && (() => {
          const fcPts = forecastData!.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
          }))
          // Connect last historical point to first forecast point
          const connectX = pts.length > 0 ? pts[pts.length - 1].x : xForN(validPts.length)
          const connectY = pts.length > 0 ? pts[pts.length - 1].y : fcPts[0]?.y ?? 0
          const fullPath = [
            `M${connectX},${connectY}`,
            ...fcPts.map(p => `L${p.x},${p.y}`)
          ].join(' ')
          return <path d={fullPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" strokeOpacity="0.6" />
        })()}

        {/* Today vertical divider */}
        {hasForecast && pts.length > 0 && (
          <>
            <line
              x1={pts[pts.length - 1].x} x2={pts[pts.length - 1].x}
              y1={pad.top} y2={pad.top + chartH}
              stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 2"
            />
            <text
              x={pts[pts.length - 1].x + 4} y={pad.top + 10}
              fontSize="9" fill="#9ca3af"
            >Today</text>
          </>
        )}
```

- [ ] **Step 4: Add forecast legend entry**

Find the existing legend block:
```typescript
      {(hasAlerts || hasAnomalies) && (
```

Replace with:
```typescript
      {(hasAlerts || hasAnomalies || hasForecast) && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', justifyContent: 'flex-end' }}>
          {hasAlerts && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#8b5cf6' }}>▲</span> Alerts</span>}
          {hasAnomalies && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#f97316' }}>◆</span> Anomalies</span>}
          {hasForecast && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#3b82f6', opacity: 0.6 }}>- -</span> Forecast</span>}
        </div>
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shared/charts.tsx
git commit -m "feat(dq): extend TrendChart with dashed forecast line, confidence band, and today marker"
```

---

## Task 10: Wire AssetQualityTab to Fetch and Display Forecast

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetQualityTab.tsx`

**Interfaces:**
- Consumes: `ForecastResponse` from `@/lib/types`; `/api/quality-scores/assets/{assetId}/forecast` proxy from Task 8; updated `TrendChart` from Task 9

- [ ] **Step 1: Update `AssetQualityTab.tsx`**

Replace the entire file content with the following (changes: add `ForecastResponse` import, add `forecast` state, add second `useEffect`, pass forecast props to `TrendChart`, add insufficient-history fallback):

```typescript
'use client'
import { useState, useEffect } from 'react'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import { AssetQualityScore, AssetQualityHistory, QualityDimension, ForecastResponse } from '@/lib/types'

const DIMENSIONS: QualityDimension[] = [
  'completeness', 'validity', 'uniqueness', 'timeliness', 'consistency', 'integrity',
]

const DIMENSION_LABELS: Record<QualityDimension, string> = {
  completeness: 'Completeness',
  validity: 'Validity',
  uniqueness: 'Uniqueness',
  timeliness: 'Timeliness',
  consistency: 'Consistency',
  integrity: 'Integrity',
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--border)' }

export default function AssetQualityTab({ assetId }: { assetId: string }) {
  const [score, setScore] = useState<AssetQualityScore | null>(null)
  const [history, setHistory] = useState<AssetQualityHistory | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/quality-scores/assets/${assetId}`).then(r => r.json()),
      fetch(`/api/quality-scores/assets/${assetId}/history?days=30`).then(r => r.json()),
    ])
      .then(([s, h]: [AssetQualityScore, AssetQualityHistory]) => {
        setScore(s)
        setHistory(h)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [assetId])

  useEffect(() => {
    fetch(`/api/quality-scores/assets/${assetId}/forecast?days=30&horizon=7`)
      .then(r => r.json())
      .then((f: ForecastResponse) => setForecast(f))
      .catch(() => {/* forecast is optional — silently ignore errors */})
  }, [assetId])

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading quality score…
      </div>
    )
  }

  if (!score) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Unable to load quality score
      </div>
    )
  }

  const trendData = (history?.history ?? []).map(h => ({ date: h.date, score: h.overall_score, failed: 0 }))
  const hasForecast = forecast && !forecast.insufficient_history && forecast.forecast.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={card}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Overall quality score</div>
        {score.overall_score !== null ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>
              {score.overall_score.toFixed(1)}
            </span>
            <ScorePill score={Math.round(score.overall_score)} />
          </div>
        ) : (
          <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-1.5px', lineHeight: 1 }}>—</span>
        )}
        {score.score_date && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>As of {score.score_date}</div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Quality dimensions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {DIMENSIONS.map(dim => {
            const detail = score.dimensions[dim]
            const val = detail?.score ?? null
            const color = val === null ? '#9ca3af' : val >= 90 ? '#16a34a' : val >= 75 ? '#ea8b3a' : '#dc2626'
            return (
              <div key={dim} style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>{DIMENSION_LABELS[dim]}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.5px', marginBottom: '6px' }}>
                  {val !== null ? <>{val}<span style={{ fontSize: '12px' }}>%</span></> : '—'}
                </div>
                <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val ?? 0}%`, background: color, transition: 'width 0.5s' }} />
                </div>
                {detail?.source === 'profiling' && (
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>from profiling</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>
          Score trend · last 30 days{hasForecast ? ' + 7-day forecast' : ''}
        </div>
        {forecast?.insufficient_history && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Not enough history to forecast — run more quality checks to enable predictions.
          </div>
        )}
        <TrendChart
          data={trendData}
          forecastData={hasForecast ? forecast.forecast : undefined}
          upperBand={hasForecast ? forecast.upper_band : undefined}
          lowerBand={hasForecast ? forecast.lower_band : undefined}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Start the dev server and verify visually**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npm run dev &
sleep 5
```

Open `http://localhost:3000` and navigate to an asset with quality history. The trend chart should show:
- Solid blue line for historical data
- Dashed blue line for 7-day forecast (if ≥3 days of history)
- Shaded blue band for confidence interval
- "Today" label at the history/forecast boundary
- "Not enough history to forecast" message for assets with < 3 days history

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/asset-registry/AssetQualityTab.tsx
git commit -m "feat(dq): AssetQualityTab now fetches and displays 7-day quality score forecast with confidence band"
```

---

## Self-Review: Spec Coverage Check

| Spec requirement | Covered by task |
|---|---|
| AI-generated root cause, business impact, recommendations in Issues | Task 6 (orchestrator calls `explain_failure` + stores in `DQRuleRun.ai_explanation`; `_auto_create_issue` uses `generate_remediation_plan` as Issue description) |
| AI text in Alerts | Task 6 (`_enrich_alert` updates `DQAlert.alert_message`) |
| AI text in Anomalies | Tasks 3+6 (`explain_anomaly` + stored to `AnomalyDetection.ai_explanation`) |
| Predictive quality scoring with confidence band | Tasks 4+5+8+9+10 |
| Automated Issue creation with AI plan | Task 6 (`_auto_create_issue`) |
| Notification via DQAlert | Task 6 (`_enrich_alert` enriches alert created by existing `create_alert_if_needed`) |
| Real-time detection (post-execution hook) | Task 7 (fire-and-forget `asyncio.create_task`) |
| Auto-create anomaly detector if none exists | Task 6 (`_trigger_anomaly_detection`) |
| LLM semantic check fix | Task 1 |
| DB migration for `ai_explanation` column | Task 2 |
| Frontend proxy route | Task 8 |
| "Not enough history" fallback | Task 5 (API), Task 10 (UI) |
| Today marker / history-forecast divider | Task 9 |
