# Quality Scoring + Scorecard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-asset, per-dimension quality score (completeness, validity, uniqueness, timeliness, consistency, integrity) with daily history and domain/subdomain/global rollups, and surface it via a new "Quality" tab + header badge on the existing Asset Detail Panel.

**Architecture:** New `dq_dimension_scores` table populated by a new `aggregate_dimension_scores` service function (mirrors the existing `aggregate_quality_scores` pattern), triggered after rule executions, the nightly scheduler job, and profiling runs. A new `/api/quality-scores` router exposes current scores and history. Frontend extracts `ScorePill`/`TrendChart` from `Dashboard.tsx` into a shared module, then reuses them in a new `AssetQualityTab` wired into `AssetDetailPanel`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Alembic, Next.js (App Router) + TypeScript + React 19.

---

## Task 1: `DQDimensionScore` model

**Files:**
- Modify: `app/db/models.py` (add new class after `DQQualityScore`, which ends at line 387)

- [ ] **Step 1: Add the model**

Insert after the `DQQualityScore` class (after line 387, before `class DQAlert`):

```python
class DQDimensionScore(Base):
    __tablename__ = "dq_dimension_scores"
    __table_args__ = (
        UniqueConstraint(
            "score_date", "score_level", "domain_id", "subdomain_id", "asset_id", "dimension",
            name="uq_dimension_score",
        ),
    )

    score_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    score_date: Mapped[date] = mapped_column(Date, nullable=False)
    score_level: Mapped[str] = mapped_column(String(20), nullable=False)  # table|subdomain|domain|global
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    dimension: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="none")  # rules|profiling|rollup|none
    total_rules: Mapped[int] = mapped_column(Integer, default=0)
    passed_rules: Mapped[int] = mapped_column(Integer, default=0)
    failed_rules: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

Check that `date` is imported at the top of `app/db/models.py` (it's already used by `DQQualityScore.score_date` and `ColumnProfileHistory`, so it should already be in the `from datetime import ...` import — verify, don't duplicate).

- [ ] **Step 2: Verify the module still imports cleanly**

Run: `python -c "from app.db.models import DQDimensionScore; print(DQDimensionScore.__tablename__)"`
Expected: `dq_dimension_scores`

- [ ] **Step 3: Commit**

```bash
git add app/db/models.py
git commit -m "feat(models): add DQDimensionScore for per-asset dimension quality scores"
```

---

## Task 2: Migration for `dq_dimension_scores`

**Files:**
- Create: `migrations/versions/0019_dimension_scores.py`

- [ ] **Step 1: Write the migration**

```python
"""quality scoring: add dq_dimension_scores table for per-asset dimension scores"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dq_dimension_scores",
        sa.Column("score_id", sa.String(36), primary_key=True),
        sa.Column("score_date", sa.Date(), nullable=False),
        sa.Column("score_level", sa.String(20), nullable=False),
        sa.Column("domain_id", sa.String(36), nullable=True),
        sa.Column("subdomain_id", sa.String(36), nullable=True),
        sa.Column("asset_id", sa.String(36), nullable=True),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="none"),
        sa.Column("total_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "score_date", "score_level", "domain_id", "subdomain_id", "asset_id", "dimension",
            name="uq_dimension_score",
        ),
    )
    op.create_index(
        "ix_dq_dimension_scores_asset_date",
        "dq_dimension_scores",
        ["asset_id", "score_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_dq_dimension_scores_asset_date", table_name="dq_dimension_scores")
    op.drop_table("dq_dimension_scores")
```

- [ ] **Step 2: Verify the migration applies**

Run: `alembic upgrade head`
Expected: completes without errors, ending at revision `0019`

Run: `alembic current`
Expected: output includes `0019`

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0019_dimension_scores.py
git commit -m "feat(db): add migration for dq_dimension_scores table"
```

---

## Task 3: Pure dimension-scoring functions (TDD)

**Files:**
- Modify: `app/services/scoring_service.py` (add constants + functions after `calculate_score_from_counts`, which ends at line 41)
- Test: `tests/test_scoring_service.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_scoring_service.py`:

```python
from app.services.scoring_service import (
    DIMENSION_RULE_TYPE_MAP,
    DIMENSIONS,
    score_dimension,
    calculate_dimension_scores_for_asset,
)


def test_dimension_map_covers_six_dimensions():
    assert set(DIMENSIONS) == {
        "completeness", "validity", "uniqueness", "timeliness", "consistency", "integrity",
    }
    assert set(DIMENSION_RULE_TYPE_MAP.keys()) == set(DIMENSIONS)


def test_score_dimension_all_pass():
    rows = [("null_check", "passed"), ("null_check", "passed")]
    result = score_dimension(rows, "completeness")
    assert result == {"score": 100.0, "source": "rules", "total": 2, "passed": 2, "failed": 0}


def test_score_dimension_mixed():
    rows = [("range_check", "passed"), ("range_check", "failed"), ("accepted_values_check", "passed")]
    result = score_dimension(rows, "validity")
    assert result["score"] == pytest.approx(66.67, rel=1e-2)
    assert result["source"] == "rules"
    assert result["total"] == 3
    assert result["passed"] == 2
    assert result["failed"] == 1


def test_score_dimension_no_matching_rules():
    rows = [("freshness_check", "passed")]
    result = score_dimension(rows, "uniqueness")
    assert result == {"score": None, "source": "none", "total": 0, "passed": 0, "failed": 0}


def test_score_dimension_ignores_other_dimensions_rule_types():
    rows = [("null_check", "passed"), ("freshness_check", "failed")]
    result = score_dimension(rows, "completeness")
    assert result["total"] == 1
    assert result["score"] == 100.0


def test_calculate_dimension_scores_completeness_from_rules():
    rows = [("null_check", "passed"), ("null_check", "failed")]
    result = calculate_dimension_scores_for_asset(rows, profile_score=0.5)
    assert result["completeness"]["score"] == 50.0
    assert result["completeness"]["source"] == "rules"


def test_calculate_dimension_scores_completeness_falls_back_to_profiling():
    rows = [("freshness_check", "passed")]
    result = calculate_dimension_scores_for_asset(rows, profile_score=0.8)
    assert result["completeness"]["score"] == 80.0
    assert result["completeness"]["source"] == "profiling"


def test_calculate_dimension_scores_completeness_none_when_no_data():
    result = calculate_dimension_scores_for_asset([], profile_score=None)
    assert result["completeness"]["score"] is None
    assert result["completeness"]["source"] == "none"


def test_calculate_dimension_scores_overall_is_average_of_non_null():
    rows = [
        ("null_check", "passed"),       # completeness 100
        ("range_check", "failed"),      # validity 0
    ]
    result = calculate_dimension_scores_for_asset(rows, profile_score=None)
    assert result["overall"]["score"] == 50.0
    assert result["overall"]["source"] == "computed"


def test_calculate_dimension_scores_overall_none_when_all_dimensions_empty():
    result = calculate_dimension_scores_for_asset([], profile_score=None)
    assert result["overall"]["score"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_scoring_service.py -v -k "dimension"`
Expected: FAIL with `ImportError: cannot import name 'DIMENSION_RULE_TYPE_MAP'`

- [ ] **Step 3: Write the implementation**

Insert into `app/services/scoring_service.py`, right after `calculate_score_from_counts` (after line 41, before `async def aggregate_quality_scores`):

```python
DIMENSION_RULE_TYPE_MAP: dict[str, list[str]] = {
    "completeness": ["null_check", "volume_check"],
    "validity": ["range_check", "accepted_values_check", "regex_check"],
    "uniqueness": ["uniqueness_check", "duplicate_check"],
    "timeliness": ["freshness_check"],
    "consistency": [
        "referential_integrity_check", "referential_sanity_check",
        "semantic_consistency_check", "distribution_consistency_check",
        "schema_drift_check",
    ],
    "integrity": [
        "business_rule_check", "custom_sql_check",
        "business_metric_check", "llm_semantic_check",
    ],
}

DIMENSIONS: list[str] = list(DIMENSION_RULE_TYPE_MAP.keys())


def score_dimension(rule_rows: list[tuple[str, str]], dimension: str) -> dict:
    """Compute a pass-rate score for one dimension from (rule_type, status) rows."""
    rule_types = DIMENSION_RULE_TYPE_MAP[dimension]
    relevant = [status for (rtype, status) in rule_rows if rtype in rule_types]
    total = len(relevant)
    if total == 0:
        return {"score": None, "source": "none", "total": 0, "passed": 0, "failed": 0}
    passed = sum(1 for s in relevant if s == "passed")
    failed = total - passed
    return {
        "score": round(passed / total * 100, 2),
        "source": "rules",
        "total": total,
        "passed": passed,
        "failed": failed,
    }


def calculate_dimension_scores_for_asset(
    rule_rows: list[tuple[str, str]],
    profile_score: Optional[float] = None,
) -> dict:
    """
    Compute all 6 dimension scores plus an overall score for one asset.

    rule_rows: list of (rule_type, status) for the asset on the target date.
    profile_score: Asset.latest_profile_score (0-1 scale), used as a fallback
        for the 'completeness' dimension when no completeness rules have run.
    """
    result: dict[str, dict] = {}
    for dimension in DIMENSIONS:
        scored = score_dimension(rule_rows, dimension)
        if dimension == "completeness" and scored["score"] is None and profile_score is not None:
            scored = {
                "score": round(profile_score * 100, 2),
                "source": "profiling",
                "total": 0, "passed": 0, "failed": 0,
            }
        result[dimension] = scored

    non_null = [v["score"] for v in result.values() if v["score"] is not None]
    overall_score = round(sum(non_null) / len(non_null), 2) if non_null else None
    result["overall"] = {
        "score": overall_score, "source": "computed",
        "total": 0, "passed": 0, "failed": 0,
    }
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_scoring_service.py -v -k "dimension"`
Expected: all `test_*dimension*` tests PASS

- [ ] **Step 5: Run full scoring test file to check for regressions**

Run: `pytest tests/test_scoring_service.py -v`
Expected: all tests (old + new) PASS

- [ ] **Step 6: Commit**

```bash
git add app/services/scoring_service.py tests/test_scoring_service.py
git commit -m "feat(scoring): add pure per-dimension quality score calculation"
```

---

## Task 4: `aggregate_dimension_scores` + wire into existing triggers

**Files:**
- Modify: `app/services/scoring_service.py` (add function after `aggregate_quality_scores`, which ends at line 135)
- Modify: `app/services/execution_service.py:407-416`
- Modify: `app/services/scheduler_service.py:179-188`
- Modify: `app/services/profiling_service.py` (end of `_profile_table`/profiling function, after line 221's `await db.commit()`)

- [ ] **Step 1: Add `aggregate_dimension_scores`**

Insert into `app/services/scoring_service.py`, right after `aggregate_quality_scores` ends (after line 135, before `async def check_sla_breaches`):

```python
async def aggregate_dimension_scores(db: AsyncSession, run_date: Optional[date] = None) -> None:
    """
    Compute and persist per-dimension quality scores in dq_dimension_scores for
    the target date, at table/subdomain/domain/global levels.
    """
    from app.db.models import DQRuleRun, DQRule, Asset, DQDimensionScore

    target_date = run_date or datetime.now(timezone.utc).replace(tzinfo=None).date()

    runs_result = await db.execute(
        select(DQRuleRun, DQRule)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(func.date(DQRuleRun.created_at) == target_date)
    )
    rows = runs_result.all()

    rule_rows_by_asset: dict[str, list[tuple[str, str]]] = {}
    asset_scope: dict[str, dict] = {}
    for run, rule in rows:
        rule_rows_by_asset.setdefault(run.asset_id, []).append((rule.rule_type, run.status))
        asset_scope[run.asset_id] = {"domain_id": run.domain_id, "subdomain_id": run.subdomain_id}

    asset_ids = set(rule_rows_by_asset.keys())

    profile_res = await db.execute(
        select(Asset.asset_id, Asset.latest_profile_score, Asset.domain_id, Asset.subdomain_id)
        .where(Asset.latest_profile_score.isnot(None))
    )
    profile_scores: dict[str, float] = {}
    for asset_id, profile_score, domain_id, subdomain_id in profile_res.all():
        profile_scores[asset_id] = profile_score
        asset_ids.add(asset_id)
        asset_scope.setdefault(asset_id, {"domain_id": domain_id, "subdomain_id": subdomain_id})

    if not asset_ids:
        return

    await db.execute(sa_delete(DQDimensionScore).where(DQDimensionScore.score_date == target_date))

    all_dims = DIMENSIONS + ["overall"]
    rollup_by_subdomain: dict[str, dict[str, list[float]]] = {}
    rollup_by_domain: dict[str, dict[str, list[float]]] = {}
    rollup_global: dict[str, list[float]] = {dim: [] for dim in all_dims}

    records: list[DQDimensionScore] = []
    now_ts = datetime.now(timezone.utc).replace(tzinfo=None)

    for asset_id in asset_ids:
        rule_rows = rule_rows_by_asset.get(asset_id, [])
        profile_score = profile_scores.get(asset_id)
        scores = calculate_dimension_scores_for_asset(rule_rows, profile_score)
        scope = asset_scope.get(asset_id, {})
        domain_id = scope.get("domain_id")
        subdomain_id = scope.get("subdomain_id")

        for dimension, data in scores.items():
            records.append(DQDimensionScore(
                score_id=str(uuid.uuid4()), score_date=target_date, score_level="table",
                asset_id=asset_id, domain_id=domain_id, subdomain_id=subdomain_id,
                dimension=dimension, score=data["score"], source=data["source"],
                total_rules=data["total"], passed_rules=data["passed"], failed_rules=data["failed"],
                created_at=now_ts,
            ))
            if data["score"] is None:
                continue
            if subdomain_id:
                rollup_by_subdomain.setdefault(subdomain_id, {d: [] for d in all_dims})[dimension].append(data["score"])
            if domain_id:
                rollup_by_domain.setdefault(domain_id, {d: [] for d in all_dims})[dimension].append(data["score"])
            rollup_global[dimension].append(data["score"])

    for subdomain_id, dims in rollup_by_subdomain.items():
        for dimension, values in dims.items():
            if not values:
                continue
            records.append(DQDimensionScore(
                score_id=str(uuid.uuid4()), score_date=target_date, score_level="subdomain",
                subdomain_id=subdomain_id, dimension=dimension,
                score=round(sum(values) / len(values), 2), source="rollup",
                created_at=now_ts,
            ))

    for domain_id, dims in rollup_by_domain.items():
        for dimension, values in dims.items():
            if not values:
                continue
            records.append(DQDimensionScore(
                score_id=str(uuid.uuid4()), score_date=target_date, score_level="domain",
                domain_id=domain_id, dimension=dimension,
                score=round(sum(values) / len(values), 2), source="rollup",
                created_at=now_ts,
            ))

    for dimension, values in rollup_global.items():
        if not values:
            continue
        records.append(DQDimensionScore(
            score_id=str(uuid.uuid4()), score_date=target_date, score_level="global",
            dimension=dimension, score=round(sum(values) / len(values), 2), source="rollup",
            created_at=now_ts,
        ))

    for record in records:
        db.add(record)
    await db.commit()
    logger.info(f"Aggregated {len(records)} dimension score records for {target_date}")
```

- [ ] **Step 2: Wire into `execution_service.py`**

Current code at `app/services/execution_service.py:407-416`:

```python
    if runs:
        try:
            from app.services.scoring_service import aggregate_quality_scores
            await aggregate_quality_scores(db)
        except Exception as e:
            logger.error(f"Quality score aggregation failed: {e}")

    return runs
```

Replace with:

```python
    if runs:
        try:
            from app.services.scoring_service import aggregate_quality_scores, aggregate_dimension_scores
            await aggregate_quality_scores(db)
            await aggregate_dimension_scores(db)
        except Exception as e:
            logger.error(f"Quality score aggregation failed: {e}")

    return runs
```

- [ ] **Step 3: Wire into `scheduler_service.py`**

Current code at `app/services/scheduler_service.py:179-188`:

```python
async def _nightly_aggregate():
    """Aggregate quality scores nightly so historical trends stay populated."""
    from app.db.database import AsyncSessionLocal
    from app.services.scoring_service import aggregate_quality_scores
    async with AsyncSessionLocal() as db:
        try:
            await aggregate_quality_scores(db)
            logger.info("Nightly quality score aggregation completed")
        except Exception as e:
            logger.error(f"Nightly aggregation failed: {e}")
```

Replace with:

```python
async def _nightly_aggregate():
    """Aggregate quality scores nightly so historical trends stay populated."""
    from app.db.database import AsyncSessionLocal
    from app.services.scoring_service import aggregate_quality_scores, aggregate_dimension_scores
    async with AsyncSessionLocal() as db:
        try:
            await aggregate_quality_scores(db)
            await aggregate_dimension_scores(db)
            logger.info("Nightly quality score aggregation completed")
        except Exception as e:
            logger.error(f"Nightly aggregation failed: {e}")
```

- [ ] **Step 4: Wire into `profiling_service.py`**

In `app/services/profiling_service.py`, the profiling function commits via `await db.commit()` at line 221, inside `async with AsyncSessionLocal() as db:`, just before the function's `return` statement (lines 223-227). Add the dimension aggregation call right after that commit, still inside the `async with` block:

```python
        await db.commit()

        try:
            from app.services.scoring_service import aggregate_dimension_scores
            await aggregate_dimension_scores(db)
        except Exception as e:
            logger.error(f"Dimension score aggregation failed: {e}")

    return {
        "columns_profiled": len(col_names),
        "row_count": total_rows,
        "profile_score": profile_score,
    }
```

Check that `logger` is defined in `app/services/profiling_service.py` (look near the top of the file for `logger = logging.getLogger(...)`); if it isn't, add `import logging` and `logger = logging.getLogger("dq_platform.profiling")` near the other module-level imports.

- [ ] **Step 5: Verify everything still imports and runs**

Run: `python -c "from app.services.scoring_service import aggregate_dimension_scores; from app.services import execution_service, scheduler_service, profiling_service; print('ok')"`
Expected: `ok`

Run: `pytest tests/test_scoring_service.py -v`
Expected: all tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add app/services/scoring_service.py app/services/execution_service.py app/services/scheduler_service.py app/services/profiling_service.py
git commit -m "feat(scoring): aggregate per-dimension scores after rule runs, profiling, and nightly"
```

---

## Task 5: `/api/quality-scores` router

**Files:**
- Create: `app/api/quality_scores.py`
- Modify: `app/main.py:18-35` (import list) and around line 175 (router registration)

- [ ] **Step 1: Write the router**

Create `app/api/quality_scores.py`:

```python
from __future__ import annotations
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.db.models import Asset, DQDimensionScore
from app.core.security import get_current_user, check_domain_access
from app.services.scoring_service import DIMENSIONS

router = APIRouter(prefix="/quality-scores", tags=["Quality Scores"])


def _empty_dimensions() -> dict:
    return {
        dim: {"score": None, "source": "none", "total_rules": 0, "passed_rules": 0, "failed_rules": 0}
        for dim in DIMENSIONS
    }


@router.get("/assets/{asset_id}")
async def get_asset_quality_score(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    asset = (await db.execute(select(Asset).where(Asset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    latest_date = (
        await db.execute(
            select(func.max(DQDimensionScore.score_date)).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
            )
        )
    ).scalar()

    if latest_date is None:
        return {
            "asset_id": asset_id,
            "score_date": None,
            "overall_score": None,
            "dimensions": _empty_dimensions(),
        }

    rows = (
        await db.execute(
            select(DQDimensionScore).where(
                DQDimensionScore.asset_id == asset_id,
                DQDimensionScore.score_level == "table",
                DQDimensionScore.score_date == latest_date,
            )
        )
    ).scalars().all()

    dimensions = _empty_dimensions()
    overall_score: Optional[float] = None
    for row in rows:
        if row.dimension == "overall":
            overall_score = row.score
        elif row.dimension in dimensions:
            dimensions[row.dimension] = {
                "score": row.score,
                "source": row.source,
                "total_rules": row.total_rules,
                "passed_rules": row.passed_rules,
                "failed_rules": row.failed_rules,
            }

    return {
        "asset_id": asset_id,
        "score_date": str(latest_date),
        "overall_score": overall_score,
        "dimensions": dimensions,
    }


@router.get("/assets/{asset_id}/history")
async def get_asset_quality_history(
    asset_id: str,
    days: int = Query(30, le=90),
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
                DQDimensionScore.score_date >= cutoff,
                DQDimensionScore.score_date <= today,
            )
        )
    ).scalars().all()

    by_date: dict[date, dict] = {}
    for row in rows:
        entry = by_date.setdefault(row.score_date, {"overall_score": None, "dimensions": {}})
        if row.dimension == "overall":
            entry["overall_score"] = row.score
        elif row.dimension in DIMENSIONS:
            entry["dimensions"][row.dimension] = row.score

    history = [
        {
            "date": str(d),
            "overall_score": entry["overall_score"],
            "dimensions": {dim: entry["dimensions"].get(dim) for dim in DIMENSIONS},
        }
        for d, entry in sorted(by_date.items())
    ]

    return {"asset_id": asset_id, "history": history}
```

- [ ] **Step 2: Register the router in `app/main.py`**

In the import block at `app/main.py:18-35`, add `quality_scores` to the list of imports from `app.api` (alongside `profile_results`, which is the last import on line 35):

```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    schema_drift,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
    # Metadata store
    metadata,
    scan_jobs,
    # Results storage
    scan_results,
    profile_results,
    quality_scores,
```

(Keep the trailing comma and whatever closing token follows on the next line — only add `quality_scores,` as a new line.)

Near line 175, where `app.include_router(profile_results.router)` (or the dashboard router) is registered, add:

```python
app.include_router(quality_scores.router)
```

Place it directly after `app.include_router(dashboard.router)` (line 175) for proximity to the other scoring-related router.

- [ ] **Step 3: Verify the app starts and the route is registered**

Run: `python -c "from app.main import app; print([r.path for r in app.routes if 'quality-scores' in r.path])"`
Expected: a list containing `/quality-scores/assets/{asset_id}` and `/quality-scores/assets/{asset_id}/history`

- [ ] **Step 4: Commit**

```bash
git add app/api/quality_scores.py app/main.py
git commit -m "feat(api): add /api/quality-scores endpoints for asset dimension scores"
```

---

## Task 6: Frontend types for quality scores

**Files:**
- Modify: `frontend/src/lib/types.ts` (add near `DimensionScores`, around line 109)

- [ ] **Step 1: Add the types**

Insert after the existing `DimensionScores` interface (around line 109-116 in `frontend/src/lib/types.ts`):

```typescript
export type QualityDimension =
  | 'completeness'
  | 'validity'
  | 'uniqueness'
  | 'timeliness'
  | 'consistency'
  | 'integrity'

export interface QualityDimensionDetail {
  score: number | null
  source: 'rules' | 'profiling' | 'rollup' | 'none'
  total_rules: number
  passed_rules: number
  failed_rules: number
}

export interface AssetQualityScore {
  asset_id: string
  score_date: string | null
  overall_score: number | null
  dimensions: Record<QualityDimension, QualityDimensionDetail>
}

export interface AssetQualityHistoryPoint {
  date: string
  overall_score: number | null
  dimensions: Record<QualityDimension, number | null>
}

export interface AssetQualityHistory {
  asset_id: string
  history: AssetQualityHistoryPoint[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors related to `types.ts`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(types): add AssetQualityScore/History types for quality scoring API"
```

---

## Task 7: Extract `ScorePill` and `TrendChart` into a shared module

**Files:**
- Create: `frontend/src/components/shared/charts.tsx`
- Modify: `frontend/src/components/dashboard/Dashboard.tsx:1-276`

- [ ] **Step 1: Create the shared module**

Create `frontend/src/components/shared/charts.tsx` with the exact current implementations of `ScorePill` (currently `Dashboard.tsx:186-190`) and `TrendChart` (currently `Dashboard.tsx:192-276`), made into named exports:

```tsx
'use client'
import { useState, useRef } from 'react'

export function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#ea8b3a' : '#dc2626'
  const bg = score >= 90 ? '#dcfce7' : score >= 80 ? '#fef3c7' : '#fee2e2'
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, color, padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, minWidth: '38px' }}>{score}</span>
}

export function TrendChart({ data }: { data: { date: string; score: number | null; failed: number }[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; score: number; date: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const validPts = data.filter(d => d.score !== null) as { date: string; score: number; failed: number }[]

  if (validPts.length === 0) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No runs yet — execute rules to see quality trend
      </div>
    )
  }

  const w = 600, h = 180, pad = { top: 20, right: 20, bottom: 30, left: 35 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom
  const scores = validPts.map(d => d.score)
  const min = Math.max(0, Math.floor(Math.min(...scores) / 5) * 5 - 5)
  const max = 100

  const pts = validPts.map((d, i) => ({
    x: pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW,
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closest = pts[0], minDist = Infinity
          pts.forEach(p => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closest = p } })
          if (minDist < 30) setTooltip({ x: (closest.x / w) * 100, y: (closest.y / h) * 100, score: closest.score, date: closest.date })
          else setTooltip(null)
        }}>
        <defs>
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[100, 95, 90, 85].map(v => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return <g key={v}><line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" /><text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text></g>
        })}
        {validPts.map((d, i) => {
          const barH = Math.max(2, d.failed * 2)
          return <rect key={i} x={pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW - 5} y={pad.top + chartH - barH} width="10" height={barH} fill="#ef4444" opacity="0.75" rx="2" />
        })}
        <path d={areaPath} fill="url(#ag2)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            style={{ transition: 'r 0.1s' }} />
        ))}
        {validPts.filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1).map((d) => {
          const idx = validPts.indexOf(d)
          return <text key={idx} x={pad.left + (idx / Math.max(validPts.length - 1, 1)) * chartW} y={h - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.date}</text>
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', left: `${tooltip.x}%`, top: `${tooltip.y}%`,
          transform: 'translate(-50%, -130%)', background: '#1e293b', color: '#fff',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10
        }}>
          <div>{tooltip.date}</div>
          <div style={{ color: '#60a5fa', fontSize: '16px' }}>{tooltip.score}%</div>
          <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1e293b' }} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `Dashboard.tsx` to import instead of define**

In `frontend/src/components/dashboard/Dashboard.tsx`:

1. Delete the local `ScorePill` function (lines 186-190) and the local `TrendChart` function (lines 192-276) entirely.
2. Add an import near the top of the file (after the existing `import { loadConnections } from '@/lib/seedData'` on line 7):

```tsx
import { ScorePill, TrendChart } from '@/components/shared/charts'
```

3. Remove the now-unused `useState`/`useRef` imports **only if** they become unused — check: `Dashboard`'s main component still uses `useState` (for `running`, `timeFilter`, etc.) and `useEffect`/`useRef` via `ConnectionSelector`. Since `useRef` was only used inside the deleted `TrendChart`, check whether `useRef` is used anywhere else in `Dashboard.tsx` after deletion; if not, remove `useRef` from the `import { useState, useRef, useEffect } from 'react'` line at the top.

- [ ] **Step 3: Verify the dashboard still builds and type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 4: Manually verify the dashboard renders unchanged**

Run: `cd frontend && npm run dev` (in background), then open the dashboard page in a browser and confirm:
- "Overall quality score" card still shows the score pill/value
- "Quality trend" chart still renders the line chart with tooltip on hover
- "Datasets requiring attention" table still shows `ScorePill` badges

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/charts.tsx frontend/src/components/dashboard/Dashboard.tsx
git commit -m "refactor(dashboard): extract ScorePill and TrendChart into shared charts module"
```

---

## Task 8: `AssetQualityTab` component

**Files:**
- Create: `frontend/src/components/asset-registry/AssetQualityTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import { AssetQualityScore, AssetQualityHistory, QualityDimension } from '@/lib/types'

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
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Score trend · last 30 days</div>
        <TrendChart data={trendData} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors related to `AssetQualityTab.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/asset-registry/AssetQualityTab.tsx
git commit -m "feat(asset-registry): add AssetQualityTab with score, dimensions, and trend"
```

---

## Task 9: Wire `AssetQualityTab` into `AssetDetailPanel`

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`

- [ ] **Step 1: Update imports and `Tab` type**

At the top of `frontend/src/components/asset-registry/AssetDetailPanel.tsx`:

1. Change line 2 from `import { useState } from 'react'` to `import { useState, useEffect } from 'react'`.
2. Add imports after line 6 (`import AssetRulesTab from './AssetRulesTab'`):

```tsx
import AssetQualityTab from './AssetQualityTab'
import { ScorePill } from '@/components/shared/charts'
import { AssetQualityScore } from '@/lib/types'
```

3. Change line 37 from:

```tsx
type Tab = 'overview' | 'profiling' | 'rules'
```

to:

```tsx
type Tab = 'overview' | 'profiling' | 'rules' | 'quality'
```

- [ ] **Step 2: Fetch the quality score for the header badge**

Immediately after the existing `const [activeTab, setActiveTab] = useState<Tab>('overview')` (line 70), add:

```tsx
  const [qualityScore, setQualityScore] = useState<number | null>(null)

  useEffect(() => {
    if (!asset) { setQualityScore(null); return }
    const leaf = asset.asset_type === 'table' || asset.asset_type === 'view'
    if (!leaf) { setQualityScore(null); return }
    fetch(`/api/quality-scores/assets/${asset.asset_id}`)
      .then(r => r.json())
      .then((d: AssetQualityScore) => setQualityScore(d.overall_score))
      .catch(() => setQualityScore(null))
  }, [asset])
```

This must be placed **before** the existing `if (!asset) { return (...) }` null check (line 72-78 in the current file), since hooks cannot be called conditionally.

- [ ] **Step 3: Add the header badge**

In the "Asset header" block (currently lines 89-97), the status badge is the last `<span>`. Add the quality badge right after it:

```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ background: typeBg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {asset.asset_type}
        </span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
        <span style={{ ...statusStyle, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: 'auto' }}>
          {asset.status}
        </span>
        {isLeaf && qualityScore !== null && <ScorePill score={Math.round(qualityScore)} />}
      </div>
```

(Only the new `{isLeaf && ...}` line is added; the rest of the block is unchanged.)

- [ ] **Step 4: Add the "Quality" tab button**

In the tab bar (currently lines 100-123), the tab list is `(['overview', 'profiling', 'rules'] as Tab[])`. Change it to:

```tsx
          {(['overview', 'profiling', 'rules', 'quality'] as Tab[]).map(tab => (
```

(Only the array literal changes — the rest of the `.map(...)` body is unchanged.)

- [ ] **Step 5: Render the Quality tab content**

After the existing Rules tab block (currently lines 180-182):

```tsx
      {/* Rules tab content */}
      {isLeaf && activeTab === 'rules' && (
        <AssetRulesTab assetId={asset.asset_id} />
      )}
```

Add:

```tsx
      {/* Quality tab content */}
      {isLeaf && activeTab === 'quality' && (
        <AssetQualityTab assetId={asset.asset_id} />
      )}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Manually verify in browser**

Run: `cd frontend && npm run dev` (in background)

Navigate to the asset registry, select a table/view asset, and confirm:
- A 4th "Quality" tab appears alongside Overview/Profiling/Rules
- Clicking it shows the overall score (or "—" if no data), the 6-dimension grid, and a trend chart
- If the asset has a quality score, a small pill badge appears in the header next to the status badge
- The Overview, Profiling, and Rules tabs still work exactly as before

Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailPanel.tsx
git commit -m "feat(asset-registry): add Quality tab and header badge to AssetDetailPanel"
```

---

## Final Verification

- [ ] **Run the full backend test suite**

Run: `pytest -v`
Expected: all tests pass (including the new dimension-score tests from Task 3)

- [ ] **Run the full frontend type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: both succeed with no errors

- [ ] **End-to-end smoke check**

With the backend running, execute a rule (or wait for the next profiling run) for an asset, then:
- `curl http://localhost:8000/api/quality-scores/assets/<asset_id>` should return non-empty `dimensions` and an `overall_score`
- `curl http://localhost:8000/api/quality-scores/assets/<asset_id>/history?days=7` should include at least one history entry for today
- The asset's Quality tab in the UI should reflect these values
