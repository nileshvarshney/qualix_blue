# Module 3: Quality Scoring + Scorecard UI

## Goal

Add a per-asset, per-dimension quality score (with history and rollups), and surface it
through a new "Quality" tab on the existing Asset Detail Panel plus a quality badge in
its header. Reuse existing chart/card patterns; do not introduce a competing dashboard.

## Background / Existing State

- **Global Dashboard** (`frontend/src/components/dashboard/Dashboard.tsx`) already has a
  "Six dimensions of quality" widget computed from *today's* rule runs via
  `GET /api/dashboard/dimensions`, using dimensions: completeness, accuracy, uniqueness,
  validity, timeliness, consistency. This widget and endpoint are **not changed** by this
  module — they remain a separate, pre-existing global KPI.
- **`DQQualityScore`** (table `dq_quality_scores`) already stores a penalty-based overall
  score per table/subdomain/domain/global, computed by
  `scoring_service.aggregate_quality_scores`. This is **not changed**.
- **Profiling** writes `Asset.latest_profile_score` (0–1 scale, `1 - avg_null_ratio`) and
  `Asset.latest_quality_status` after each profiling run.
- **`AssetDetailPanel.tsx`** has 3 tabs for table/view assets: Overview, Profiling, Rules.

## New Concept: Per-Asset Dimension Scores

A new, separate scoring model with 6 dimensions: **completeness, validity, uniqueness,
timeliness, consistency, integrity**. "Consistency" and "integrity" are placeholders in
the sense that they will show `null` until matching rule types exist and have run for an
asset — there is no special-casing, just normal "no data" handling.

### Dimension → rule_type mapping

| Dimension | rule_types |
|---|---|
| completeness | null_check, volume_check |
| validity | range_check, accepted_values_check, regex_check |
| uniqueness | uniqueness_check, duplicate_check |
| timeliness | freshness_check |
| consistency | referential_integrity_check, referential_sanity_check, semantic_consistency_check, distribution_consistency_check, schema_drift_check |
| integrity | business_rule_check, custom_sql_check, business_metric_check, llm_semantic_check |

This mirrors the existing `/api/dashboard/dimensions` mapping, renaming "accuracy" to
"integrity" for this model only. The global dashboard's "accuracy" dimension/label is
untouched.

### Completeness fallback

For the `completeness` dimension only: if the asset has no completeness-category rule
runs for the score date, fall back to `Asset.latest_profile_score * 100`
(`source = 'profiling'`). If neither rule runs nor a profile exist, the dimension is
`null` (`source = 'none'`).

### Overall score

`overall` = average of all non-null dimension scores for the entity. `null` if every
dimension is `null`.

### Rollups

Subdomain/domain/global level rows average the table-level scores per dimension within
scope, skipping nulls. Computed the same way as the existing `aggregate_quality_scores`
rollup (delete-then-insert for the target date).

## Data Model

New table `dq_dimension_scores`:

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
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="none")  # rules|profiling|none
    total_rules: Mapped[int] = mapped_column(Integer, default=0)
    passed_rules: Mapped[int] = mapped_column(Integer, default=0)
    failed_rules: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

A new Alembic migration creates this table.

## Backend Service Changes (`app/services/scoring_service.py`)

- `DIMENSION_RULE_TYPE_MAP`: constant dict per the table above.
- `calculate_dimension_scores_for_asset(db, asset, score_date) -> dict`: for each
  dimension, queries `DQRuleRun` joined `DQRule` for `asset_id` + matching `rule_type`s +
  `created_at` date == `score_date`; computes pass-rate score (or `null`/source='none' if
  no matching runs); applies completeness fallback to `Asset.latest_profile_score`.
  Computes `overall` as the average of non-null dimension scores.
- `aggregate_dimension_scores(db, run_date=None) -> None`: for the target date, finds
  all assets with rule runs and/or profiling data, computes table-level dimension scores
  via the function above, persists them (delete-then-insert for the date), then rolls up
  to subdomain/domain/global by averaging table-level scores per dimension (skipping
  nulls).

### Trigger points (additive calls alongside existing `aggregate_quality_scores`)

- `app/services/execution_service.py` (~line 413-414, after a rule execution batch)
- `app/services/scheduler_service.py` (~line 184-187, periodic aggregation job)
- `app/services/profiling_service.py` (after a profiling run completes, so completeness
  updates even for assets with zero rules)

## API Changes

New router `app/api/quality_scores.py`, mounted at `/api/quality-scores`:

- `GET /quality-scores/assets/{asset_id}`
  → `{ asset_id, score_date, overall_score, dimensions: { <dim>: { score, source, total_rules, passed_rules, failed_rules } } }`
  (latest available `score_date` for the asset; 6 dimensions + their stats)

- `GET /quality-scores/assets/{asset_id}/history?days=30`
  → `{ asset_id, history: [ { date, overall_score, dimensions: { <dim>: score|null } } ] }`

Domain/subdomain/global rollup rows exist in `dq_dimension_scores` for future use but no
new endpoints are required for this module's UI.

## UI Changes

### Shared component extraction (additive refactor, same render output)

Extract `ScorePill` and `TrendChart` from `frontend/src/components/dashboard/Dashboard.tsx`
into `frontend/src/components/shared/charts.tsx`. `Dashboard.tsx` imports them instead of
defining them locally — no visual or behavioral change to the existing dashboard.

### New component: `AssetQualityTab.tsx`

`frontend/src/components/asset-registry/AssetQualityTab.tsx`:

- Fetches `GET /api/quality-scores/assets/{assetId}` and
  `GET /api/quality-scores/assets/{assetId}/history?days=30`
- Renders:
  - Overall score via shared `ScorePill`
  - A 6-dimension grid (completeness/validity/uniqueness/timeliness/consistency/integrity),
    visually similar to Dashboard's "Six dimensions" cards, implemented locally in this
    component (Dashboard's existing widget is not modified or shared)
  - Score trend via shared `TrendChart`, fed by the history endpoint

### `AssetDetailPanel.tsx`

- `Tab` type gains `'quality'`; tab bar gains a 4th "Quality" tab (table/view assets only),
  rendering `<AssetQualityTab assetId={asset.asset_id} />` when active — same lazy-render
  pattern as Profiling/Rules tabs.
- Header gains a small `ScorePill`-based "Quality" badge next to the existing status
  badge, fed by a lightweight fetch of `GET /api/quality-scores/assets/{id}` (uses
  `overall_score` only).

## Navigation Placement

Asset Detail Panel (table/view assets): Overview | Profiling | Rules | **Quality** (new).
Header gains a quality score badge visible on all tabs.

## Files to Modify

- `app/db/models.py` — add `DQDimensionScore`
- `app/services/scoring_service.py` — add mapping + two new functions
- `app/services/execution_service.py` — call `aggregate_dimension_scores`
- `app/services/scheduler_service.py` — call `aggregate_dimension_scores`
- `app/services/profiling_service.py` — call `aggregate_dimension_scores`
- `app/main.py` (or wherever routers are registered) — mount new `quality_scores` router
- `frontend/src/components/dashboard/Dashboard.tsx` — import `ScorePill`/`TrendChart`
  from shared module instead of local definitions
- `frontend/src/components/asset-registry/AssetDetailPanel.tsx` — add Quality tab + header
  badge
- `frontend/src/lib/types.ts` — add types for asset quality score / history response

## Files to Create

- `migrations/<rev>_add_dq_dimension_scores.py`
- `app/api/quality_scores.py`
- `frontend/src/components/shared/charts.tsx`
- `frontend/src/components/asset-registry/AssetQualityTab.tsx`

## Files Explicitly Not Touched

- `Dashboard.tsx`'s "Six dimensions of quality" widget JSX/logic and labels
- `app/api/dashboard.py` `/dimensions` endpoint and its dimension_map (still includes
  "accuracy")
- `DQQualityScore` model and `aggregate_quality_scores` (existing overall-score model)
- "Datasets requiring attention" / "Top failing rules" widgets
- `AssetProfilingTab.tsx`, `AssetRulesTab.tsx`

## Regression Checklist

- Existing global Dashboard renders identically after `ScorePill`/`TrendChart` extraction
- Existing `/api/dashboard/dimensions` and `/api/dashboard/*` endpoints unchanged
- `aggregate_quality_scores` still runs and `dq_quality_scores` rows are unaffected
- Assets with zero rules and no profiling show `overall_score: null` / "—" gracefully in
  the new Quality tab and header badge (no crashes)
- Assets with only profiling data (no rules) show a completeness score with
  `source: 'profiling'`
- Non-leaf assets (no Quality tab) and leaf assets without `asset_id` quality data render
  without errors

## Final Visible UI Changes

- Asset Detail Panel for table/view assets gains a 4th "Quality" tab showing an overall
  score, a 6-dimension breakdown grid, and a score trend chart
- Asset Detail Panel header shows a small quality score badge
- No changes to the existing global Dashboard's appearance or behavior
