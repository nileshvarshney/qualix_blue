# Agentic Monitoring & Auto-Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous agent that, on every rule failure, classifies the failure, proposes a specific fix, and applies it (with one-click approval, or fully automatically for whitelisted rule types) — closing the loop with a re-run.

**Architecture:** Event-driven extension of the existing post-run pipeline (`app/services/post_run_service.py`). A new `app/services/remediation_service.py` classifies each failed rule, computes a concrete config change for "auto-fixable" rule types using only data already on `DQRule`/`DQRuleRun` (no new Snowflake queries), asks the existing LLM provider to phrase the action and a confidence label, persists a `RemediationProposal`, and — if the Observability page's config (now backed by `AppConfig`) allows it — immediately applies the fix and re-runs the rule via the existing `execute_rule()` function.

**Tech Stack:** FastAPI + SQLAlchemy async (existing `app/` backend), Next.js App Router proxy routes (existing `frontend/src/app/api/`), React (existing `IssueDetailPanel.tsx`), pytest + pytest-asyncio with `AsyncMock`/`MagicMock` (no real DB in tests — matches `tests/test_issues_api.py` and `tests/test_post_run_service.py`).

## Global Constraints

- Reuse the existing `AppConfig` key-value table for the 3 auto-remediation settings — do not create a new settings table.
- Auto-apply requires: `auto_remediation_enabled == "true"` AND `rule.rule_type` in the configured `auto_remediation_rule_types` list AND `rule.severity != "critical"`.
- An "auto-fixable" rule type with fewer than 3 prior `DQRuleRun` rows for that rule must be treated as `escalation_only` for that occurrence — never auto-tune off a single data point.
- All numeric config-field mutations must reassign the whole `rule_config` dict (`rule.rule_config = {**old, field: new}`) — `JSONVariant` has no mutable-dict change tracking, so in-place `rule.rule_config[field] = x` is silently lost.
- Escalation-only proposals never get an "Apply" button in the UI — only Acknowledge (implemented as the same reject endpoint, relabeled).
- Match existing code patterns exactly: tests call route/service functions directly with `AsyncMock`/`MagicMock` db and user dicts — no test client, no real database, no real LLM calls (patch `get_provider_from_db` or the service function).

---

### Task 1: `RemediationProposal` and `RemediationExecution` models + migration + config defaults

**Files:**
- Modify: `app/db/models.py` (add two new classes after `CorrelatedIncident`, around line 951)
- Create: `migrations/versions/0029_remediation_tables.py`
- Modify: `app/services/config_service.py:94` (append 3 new `CONFIG_DEFAULTS` entries to the `# Quality Thresholds` block)
- Test: `tests/test_remediation_models.py`

**Interfaces:**
- Produces: `RemediationProposal` (table `dq_remediation_proposals`) with columns `proposal_id, issue_id, rule_id, run_id, asset_id, rule_type, classification, proposed_action, config_field, old_value, new_value, confidence, status, decided_by, decided_at, rerun_run_id, created_at`.
- Produces: `RemediationExecution` (table `dq_remediation_executions`) with columns `execution_id, proposal_id, applied_field, applied_old_value, applied_new_value, triggered_by, rerun_status, rerun_run_id, error_message, created_at`.
- Produces: `AppConfig` rows with keys `auto_remediation_enabled`, `auto_remediation_threshold`, `auto_remediation_rule_types` (category `"quality"`).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_remediation_models.py
from app.db.models import RemediationProposal, RemediationExecution


def test_remediation_proposal_table_name():
    assert RemediationProposal.__tablename__ == "dq_remediation_proposals"


def test_remediation_proposal_columns():
    cols = {c.name for c in RemediationProposal.__table__.columns}
    expected = {
        "proposal_id", "issue_id", "rule_id", "run_id", "asset_id", "rule_type",
        "classification", "proposed_action", "config_field", "old_value", "new_value",
        "confidence", "status", "decided_by", "decided_at", "rerun_run_id", "created_at",
    }
    assert expected.issubset(cols)


def test_remediation_execution_table_name():
    assert RemediationExecution.__tablename__ == "dq_remediation_executions"


def test_remediation_execution_columns():
    cols = {c.name for c in RemediationExecution.__table__.columns}
    expected = {
        "execution_id", "proposal_id", "applied_field", "applied_old_value",
        "applied_new_value", "triggered_by", "rerun_status", "rerun_run_id",
        "error_message", "created_at",
    }
    assert expected.issubset(cols)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_remediation_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'RemediationProposal' from 'app.db.models'`

- [ ] **Step 3: Add the models**

In `app/db/models.py`, insert immediately after the `CorrelatedIncident` class (after line 951, before `class QualityCostConfig`):

```python
class RemediationProposal(Base):
    __tablename__ = "dq_remediation_proposals"

    proposal_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    issue_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_issues.issue_id"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=False)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rule_runs.run_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    classification: Mapped[str] = mapped_column(String(20), nullable=False)
    proposed_action: Mapped[str] = mapped_column(Text, nullable=False)
    config_field: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rerun_run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class RemediationExecution(Base):
    __tablename__ = "dq_remediation_executions"

    execution_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_remediation_proposals.proposal_id"), nullable=False, index=True)
    applied_field: Mapped[str] = mapped_column(String(50), nullable=False)
    applied_old_value: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    applied_new_value: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(200), nullable=False)
    rerun_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rerun_run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_remediation_models.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the migration**

Create `migrations/versions/0029_remediation_tables.py`:

```python
from __future__ import annotations

"""remediation: add dq_remediation_proposals, dq_remediation_executions"""

from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    try:
        bind.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "dq_remediation_proposals"):
        op.create_table(
            "dq_remediation_proposals",
            sa.Column("proposal_id", sa.String(36), primary_key=True),
            sa.Column("issue_id", sa.String(36), sa.ForeignKey("dq_issues.issue_id"), nullable=False),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("dq_rules.rule_id"), nullable=False),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("dq_rule_runs.run_id"), nullable=False),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("rule_type", sa.String(50), nullable=False),
            sa.Column("classification", sa.String(20), nullable=False),
            sa.Column("proposed_action", sa.Text(), nullable=False),
            sa.Column("config_field", sa.String(50), nullable=True),
            sa.Column("old_value", sa.String(50), nullable=True),
            sa.Column("new_value", sa.String(50), nullable=True),
            sa.Column("confidence", sa.String(20), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),
            sa.Column("decided_by", sa.String(200), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("rerun_run_id", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _table_exists(bind, "dq_remediation_executions"):
        op.create_table(
            "dq_remediation_executions",
            sa.Column("execution_id", sa.String(36), primary_key=True),
            sa.Column("proposal_id", sa.String(36), sa.ForeignKey("dq_remediation_proposals.proposal_id"), nullable=False),
            sa.Column("applied_field", sa.String(50), nullable=False),
            sa.Column("applied_old_value", sa.String(50), nullable=True),
            sa.Column("applied_new_value", sa.String(50), nullable=True),
            sa.Column("triggered_by", sa.String(200), nullable=False),
            sa.Column("rerun_status", sa.String(20), nullable=True),
            sa.Column("rerun_run_id", sa.String(36), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("dq_remediation_executions")
    op.drop_table("dq_remediation_proposals")
```

- [ ] **Step 6: Add the 3 AppConfig defaults**

In `app/services/config_service.py`, append to the end of the `# Quality Thresholds` block (after the `low_penalty` entry on line 93, before the closing `]` on line 94):

```python
    {"category": "quality", "key": "auto_remediation_enabled",    "value": "false", "is_secret": False, "description": "Allow well-understood recurring rule failures to be auto-remediated without human approval."},
    {"category": "quality", "key": "auto_remediation_threshold",  "value": "10",    "is_secret": False, "description": "Quality-score-drop %% that would trigger auto-remediation review (reserved for future use)."},
    {"category": "quality", "key": "auto_remediation_rule_types", "value": "[]",    "is_secret": False, "description": "JSON array of rule_types eligible for auto-remediation without approval, e.g. [\"freshness_check\"]."},
```

- [ ] **Step 7: Verify config defaults are well-formed**

Run: `python3 -c "import app.services.config_service as c; assert any(d['key']=='auto_remediation_rule_types' for d in c.CONFIG_DEFAULTS); print('ok')"`
Expected: prints `ok`

- [ ] **Step 8: Commit**

```bash
git add app/db/models.py migrations/versions/0029_remediation_tables.py app/services/config_service.py tests/test_remediation_models.py
git commit -m "feat(remediation): add RemediationProposal/Execution models and config defaults"
```

---

### Task 2: Classification and fix-computation functions

**Files:**
- Create: `app/services/remediation_service.py`
- Test: `tests/test_remediation_service_classify.py`

**Interfaces:**
- Consumes: `DQRule` (fields `rule_type: str`, `rule_config: Optional[dict]`), `DQRuleRun` (fields `total_rows_scanned: Optional[int]`) — both from `app.db.models`.
- Produces: `classify_and_compute(rule, run) -> tuple[str, Optional[tuple[str, str, str]]]` where the first element is `"auto_fixable"` or `"escalation_only"`, and the second (when not `None`) is `(config_field, old_value_str, new_value_str)`. Later tasks call this exact function.
- Produces: `ESCALATION_ONLY_TYPES: set[str]` and `MIN_HISTORY_RUNS: int = 3` module-level constants, used by Task 3.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_remediation_service_classify.py
from unittest.mock import MagicMock
from app.services.remediation_service import classify_and_compute


def _rule(rule_type, config=None):
    r = MagicMock()
    r.rule_type = rule_type
    r.rule_config = config or {}
    return r


def _run(total_rows_scanned=1000):
    run = MagicMock()
    run.total_rows_scanned = total_rows_scanned
    return run


def test_freshness_check_proposes_bumped_max_hours():
    rule = _rule("freshness_check", {"max_hours": 24})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("max_hours", "24", "30")


def test_volume_check_below_min_proposes_lower_min_rows():
    rule = _rule("volume_check", {"min_rows": 1000})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=800))
    assert classification == "auto_fixable"
    assert fix == ("min_rows", "1000", "720")


def test_volume_check_above_max_proposes_higher_max_rows():
    rule = _rule("volume_check", {"max_rows": 1000})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=1500))
    assert classification == "auto_fixable"
    assert fix == ("max_rows", "1000", "1650")


def test_volume_check_with_no_bounds_is_escalation_only():
    rule = _rule("volume_check", {})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=500))
    assert classification == "escalation_only"
    assert fix is None


def test_range_check_widens_max_value():
    rule = _rule("range_check", {"max_value": 100.0, "min_value": 0.0})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("max_value", "100.0", "105.0")


def test_range_check_with_only_min_value_widens_min_value():
    rule = _rule("range_check", {"min_value": 10.0})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("min_value", "10.0", "9.5")


def test_distribution_consistency_check_bumps_tolerance():
    rule = _rule("distribution_consistency_check", {"tolerance_pct": 20})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("tolerance_pct", "20", "30")


def test_null_check_is_always_escalation_only():
    rule = _rule("null_check", {"columns": ["email"]})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "escalation_only"
    assert fix is None


def test_schema_drift_check_is_always_escalation_only():
    rule = _rule("schema_drift_check", {"expected_columns": ["id"]})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "escalation_only"
    assert fix is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_remediation_service_classify.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.remediation_service'`

- [ ] **Step 3: Implement classification and fix computation**

Create `app/services/remediation_service.py`:

```python
from __future__ import annotations
import logging
import math
from typing import Optional

logger = logging.getLogger("dq_platform.remediation")

MIN_HISTORY_RUNS = 3

ESCALATION_ONLY_TYPES: set[str] = {
    "null_check", "uniqueness_check", "duplicate_check", "schema_drift_check",
    "referential_integrity_check", "referential_sanity_check", "business_rule_check",
    "business_metric_check", "custom_sql_check", "llm_semantic_check",
    "semantic_consistency_check", "accepted_values_check", "regex_check", "comparison_check",
}


def _fmt(value) -> str:
    return str(value)


def _compute_freshness_fix(rule) -> tuple[str, str, str]:
    config = rule.rule_config or {}
    current = config.get("max_hours", 24)
    new_value = math.ceil(current * 1.25)
    if new_value <= current:
        new_value = current + 1
    return "max_hours", _fmt(current), _fmt(new_value)


def _compute_volume_fix(rule, run) -> Optional[tuple[str, str, str]]:
    config = rule.rule_config or {}
    min_rows = config.get("min_rows")
    max_rows = config.get("max_rows")
    observed = run.total_rows_scanned or 0
    if min_rows is not None and observed < min_rows:
        new_value = max(0, math.floor(observed * 0.9))
        return "min_rows", _fmt(min_rows), _fmt(new_value)
    if max_rows is not None and observed > max_rows:
        new_value = math.ceil(observed * 1.1)
        return "max_rows", _fmt(max_rows), _fmt(new_value)
    return None


def _compute_range_fix(rule) -> Optional[tuple[str, str, str]]:
    config = rule.rule_config or {}
    max_val = config.get("max_value")
    min_val = config.get("min_value")
    # Tie-break: when both bounds are configured, widen the upper bound —
    # the more common "ceiling drift" case in practice.
    if max_val is not None:
        step = abs(float(max_val)) * 0.05 if max_val != 0 else 1
        return "max_value", _fmt(max_val), _fmt(round(float(max_val) + step, 4))
    if min_val is not None:
        step = abs(float(min_val)) * 0.05 if min_val != 0 else 1
        return "min_value", _fmt(min_val), _fmt(round(float(min_val) - step, 4))
    return None


def _compute_distribution_fix(rule) -> tuple[str, str, str]:
    config = rule.rule_config or {}
    current = config.get("tolerance_pct", 20)
    new_value = current + 10
    return "tolerance_pct", _fmt(current), _fmt(new_value)


def classify_and_compute(rule, run) -> tuple[str, Optional[tuple[str, str, str]]]:
    """Classify a failed rule and, for auto-fixable types, compute the concrete config change.

    Returns (classification, fix) where classification is "auto_fixable" or
    "escalation_only", and fix is (config_field, old_value_str, new_value_str) or None.
    """
    if rule.rule_type == "freshness_check":
        return "auto_fixable", _compute_freshness_fix(rule)
    if rule.rule_type == "volume_check":
        fix = _compute_volume_fix(rule, run)
        return ("auto_fixable", fix) if fix else ("escalation_only", None)
    if rule.rule_type == "range_check":
        fix = _compute_range_fix(rule)
        return ("auto_fixable", fix) if fix else ("escalation_only", None)
    if rule.rule_type == "distribution_consistency_check":
        return "auto_fixable", _compute_distribution_fix(rule)
    return "escalation_only", None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_remediation_service_classify.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/remediation_service.py tests/test_remediation_service_classify.py
git commit -m "feat(remediation): add failure classification and fix-computation logic"
```

---

### Task 3: `generate_proposal` and `apply_proposal`

**Files:**
- Modify: `app/services/remediation_service.py`
- Test: `tests/test_remediation_service.py`

**Interfaces:**
- Consumes: `classify_and_compute(rule, run)`, `MIN_HISTORY_RUNS` from Task 2; `app.services.config_service.get_value(key, db)`; `app.services.llm_providers.get_provider_from_db(provider_name, db)` (returns an object with `async def complete(prompt, system_prompt, max_tokens=...) -> str`); `app.services.ai_service._REMEDIATION_HINTS: dict[str, str]`; `app.db.models.{RemediationProposal, RemediationExecution, Issue, ISSUE_TRANSITIONS, DQRule, DQRuleRun, gen_uuid, now}`.
- Produces: `async def generate_proposal(issue, run, rule, db) -> Optional[RemediationProposal]` — called by Task 4 (`post_run_service`).
- Produces: `async def apply_proposal(proposal, triggered_by: str, db) -> RemediationProposal` — called by Task 6 (issues API approve endpoint) and internally by `generate_proposal` for the auto-apply path.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_remediation_service.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _rule(rule_id="rule-1", rule_type="freshness_check", config=None, severity="high"):
    r = MagicMock()
    r.rule_id = rule_id
    r.rule_type = rule_type
    r.rule_config = config or {"max_hours": 24}
    r.severity = severity
    r.rule_name = "Freshness check"
    r.version = 1
    return r


def _run(run_id="run-1", asset_id="asset-1", total_rows_scanned=1000, failed_rows_count=1, failure_percentage=0.1):
    run = MagicMock()
    run.run_id = run_id
    run.asset_id = asset_id
    run.total_rows_scanned = total_rows_scanned
    run.failed_rows_count = failed_rows_count
    run.failure_percentage = failure_percentage
    return run


def _issue(issue_id="iss-1", status="new"):
    i = MagicMock()
    i.issue_id = issue_id
    i.status = status
    return i


@pytest.mark.asyncio
async def test_generate_proposal_skips_if_open_proposal_exists():
    from app.services import remediation_service

    db = AsyncMock()
    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = MagicMock()  # an open proposal
    db.execute.return_value = existing_result

    result = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)
    assert result is None


@pytest.mark.asyncio
async def test_generate_proposal_falls_back_to_escalation_with_insufficient_history():
    from app.services import remediation_service

    db = AsyncMock()
    no_existing = MagicMock()
    no_existing.scalar_one_or_none.return_value = None
    history_result = MagicMock()
    history_result.scalars.return_value.all.return_value = [MagicMock()]  # only 1 prior run
    db.execute.side_effect = [no_existing, history_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.remediation_service._describe_fix", new_callable=AsyncMock, return_value=("Investigate.", "medium")):
        proposal = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)

    assert proposal.classification == "escalation_only"
    assert proposal.config_field is None


@pytest.mark.asyncio
async def test_generate_proposal_auto_applies_when_gate_passes():
    from app.services import remediation_service

    db = AsyncMock()
    no_existing = MagicMock()
    no_existing.scalar_one_or_none.return_value = None
    history_result = MagicMock()
    history_result.scalars.return_value.all.return_value = [MagicMock(), MagicMock(), MagicMock()]
    db.execute.side_effect = [no_existing, history_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.remediation_service._describe_fix", new_callable=AsyncMock, return_value=("Bump max_hours.", "high")), \
         patch("app.services.remediation_service._apply_gate_passes", new_callable=AsyncMock, return_value=True), \
         patch("app.services.remediation_service.apply_proposal", new_callable=AsyncMock) as mock_apply:
        proposal = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)

    assert proposal.classification == "auto_fixable"
    mock_apply.assert_called_once()
    _, kwargs = mock_apply.call_args
    assert mock_apply.call_args[0][1] == "system" or kwargs.get("triggered_by") == "system"


@pytest.mark.asyncio
async def test_apply_proposal_patches_config_and_reruns_then_resolves_issue():
    from app.services import remediation_service
    from app.db.models import ISSUE_TRANSITIONS

    proposal = MagicMock()
    proposal.proposal_id = "prop-1"
    proposal.issue_id = "iss-1"
    proposal.rule_id = "rule-1"
    proposal.classification = "auto_fixable"
    proposal.config_field = "max_hours"
    proposal.old_value = "24"
    proposal.new_value = "30"

    rule = _rule()
    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule

    issue = _issue(status="new")
    issue_result = MagicMock()
    issue_result.scalar_one_or_none.return_value = issue

    db = AsyncMock()
    db.execute.side_effect = [rule_result, issue_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    rerun = MagicMock()
    rerun.run_id = "run-2"
    rerun.status = "passed"

    with patch("app.services.execution_service.execute_rule", new_callable=AsyncMock, return_value=rerun):
        result = await remediation_service.apply_proposal(proposal, "system", db)

    assert rule.rule_config["max_hours"] == 30
    assert rule.version == 2
    assert result.status == "auto_applied"
    assert issue.status == "resolved"


@pytest.mark.asyncio
async def test_apply_proposal_marks_failed_on_exception():
    from app.services import remediation_service

    proposal = MagicMock()
    proposal.proposal_id = "prop-1"
    proposal.issue_id = "iss-1"
    proposal.rule_id = "rule-1"
    proposal.classification = "auto_fixable"
    proposal.config_field = "max_hours"
    proposal.old_value = "24"
    proposal.new_value = "30"

    rule = _rule()
    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule

    db = AsyncMock()
    db.execute.return_value = rule_result
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.execution_service.execute_rule", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        result = await remediation_service.apply_proposal(proposal, "system", db)

    assert result.status == "apply_failed"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_remediation_service.py -v`
Expected: FAIL with `AttributeError: module 'app.services.remediation_service' has no attribute 'generate_proposal'`

- [ ] **Step 3: Implement `generate_proposal` and `apply_proposal`**

Append to `app/services/remediation_service.py` (add imports at the top alongside the existing ones):

```python
from sqlalchemy import select, desc
from app.services import config_service

_SYS_PROPOSAL = (
    "You are a data reliability engineer. Given a failed data quality rule and either a "
    "computed fix or a note that no automatic fix exists, write ONE concise sentence "
    "describing the recommended action, and rate your confidence. "
    "Return ONLY valid JSON: {\"action\": \"...\", \"confidence\": \"high|medium|low\"}"
)


async def _recent_run_count(rule_id: str, db) -> int:
    from app.db.models import DQRuleRun

    res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(MIN_HISTORY_RUNS)
    )
    return len(res.scalars().all())


def _fallback_action(classification, fix, rule) -> str:
    if classification == "auto_fixable" and fix:
        field, old_value, new_value = fix
        return f"Adjust {field} on rule '{rule.rule_name}' from {old_value} to {new_value}."
    return f"Investigate failure on rule '{rule.rule_name}' — no automatic fix available."


async def _describe_fix(rule, run, classification, fix, db) -> tuple[str, str]:
    import json as _j
    from app.services.llm_providers import get_provider_from_db
    from app.services.ai_service import _REMEDIATION_HINTS

    if classification == "auto_fixable" and fix:
        field, old_value, new_value = fix
        context = (
            f"Rule '{rule.rule_name}' ({rule.rule_type}) failed on run {run.run_id} "
            f"({run.failed_rows_count}/{run.total_rows_scanned} rows failed, {run.failure_percentage}%%). "
            f"Computed fix: change {field} from {old_value} to {new_value}."
        )
    else:
        hint = _REMEDIATION_HINTS.get(rule.rule_type, "Review rule logic and source data.")
        context = (
            f"Rule '{rule.rule_name}' ({rule.rule_type}) failed on run {run.run_id} "
            f"({run.failed_rows_count}/{run.total_rows_scanned} rows failed, {run.failure_percentage}%%). "
            f"No safe automatic fix exists for this rule type. Hint: {hint}"
        )
    try:
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(context, _SYS_PROPOSAL, max_tokens=200)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        parsed = _j.loads(raw[start:end]) if start >= 0 else {}
        action = parsed.get("action") or _fallback_action(classification, fix, rule)
        confidence = parsed.get("confidence") if parsed.get("confidence") in ("high", "medium", "low") else "medium"
        return action, confidence
    except Exception as e:
        logger.warning(f"remediation: AI describe_fix failed: {e}")
        return _fallback_action(classification, fix, rule), "medium"


async def _apply_gate_passes(rule, db) -> bool:
    import json as _j

    if rule.severity == "critical":
        return False
    enabled = await config_service.get_value("auto_remediation_enabled", db)
    if enabled != "true":
        return False
    raw_types = await config_service.get_value("auto_remediation_rule_types", db)
    try:
        rule_types = _j.loads(raw_types) if raw_types else []
    except Exception:
        rule_types = []
    return rule.rule_type in rule_types


def _coerce_numeric(value: str):
    try:
        if "." in value:
            return float(value)
        return int(value)
    except (TypeError, ValueError):
        return value


async def generate_proposal(issue, run, rule, db):
    from app.db.models import RemediationProposal, gen_uuid, now as model_now

    existing = await db.execute(
        select(RemediationProposal).where(
            RemediationProposal.rule_id == rule.rule_id,
            RemediationProposal.asset_id == run.asset_id,
            RemediationProposal.status.in_(["pending", "auto_applied", "approved"]),
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None

    classification, fix = classify_and_compute(rule, run)
    if classification == "auto_fixable":
        history_count = await _recent_run_count(rule.rule_id, db)
        if history_count < MIN_HISTORY_RUNS:
            classification, fix = "escalation_only", None

    proposed_action, confidence = await _describe_fix(rule, run, classification, fix, db)

    proposal = RemediationProposal(
        proposal_id=gen_uuid(),
        issue_id=issue.issue_id,
        rule_id=rule.rule_id,
        run_id=run.run_id,
        asset_id=run.asset_id,
        rule_type=rule.rule_type,
        classification=classification,
        proposed_action=proposed_action,
        config_field=fix[0] if fix else None,
        old_value=fix[1] if fix else None,
        new_value=fix[2] if fix else None,
        confidence=confidence,
        status="pending",
        created_at=model_now(),
    )
    db.add(proposal)
    await db.commit()
    await db.refresh(proposal)

    if classification == "auto_fixable" and await _apply_gate_passes(rule, db):
        await apply_proposal(proposal, "system", db)

    return proposal


async def apply_proposal(proposal, triggered_by: str, db):
    from app.db.models import DQRule, Issue, ISSUE_TRANSITIONS, RemediationExecution, gen_uuid, now as model_now

    if proposal.classification != "auto_fixable" or not proposal.config_field:
        raise ValueError("Only auto_fixable proposals with a computed fix can be applied")

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == proposal.rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise ValueError(f"Rule {proposal.rule_id} not found")

    execution = RemediationExecution(
        execution_id=gen_uuid(),
        proposal_id=proposal.proposal_id,
        applied_field=proposal.config_field,
        applied_old_value=proposal.old_value,
        applied_new_value=proposal.new_value,
        triggered_by=triggered_by,
        created_at=model_now(),
    )
    db.add(execution)

    try:
        rule.rule_config = {**(rule.rule_config or {}), proposal.config_field: _coerce_numeric(proposal.new_value)}
        rule.version = (rule.version or 1) + 1
        await db.commit()

        from app.services.execution_service import execute_rule
        rerun = await execute_rule(rule.rule_id, db, user_email=triggered_by)

        execution.rerun_run_id = rerun.run_id
        execution.rerun_status = rerun.status
        proposal.rerun_run_id = rerun.run_id
        proposal.status = "auto_applied" if triggered_by == "system" else "applied"
        proposal.decided_by = triggered_by
        proposal.decided_at = model_now()

        if rerun.status == "passed":
            issue_res = await db.execute(select(Issue).where(Issue.issue_id == proposal.issue_id))
            issue = issue_res.scalar_one_or_none()
            if issue and "resolved" in ISSUE_TRANSITIONS.get(issue.status, set()):
                issue.status = "resolved"
                issue.resolved_at = model_now()
                issue.updated_at = model_now()
                issue.resolution_note = (
                    f"Auto-remediation applied: {proposal.config_field} "
                    f"{proposal.old_value} -> {proposal.new_value}. Re-run passed."
                )

        await db.commit()
        await db.refresh(proposal)
        return proposal

    except Exception as e:
        execution.error_message = str(e)
        proposal.status = "apply_failed"
        await db.commit()
        await db.refresh(proposal)
        logger.warning(f"remediation: apply_proposal failed for {proposal.proposal_id}: {e}")
        return proposal
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_remediation_service.py tests/test_remediation_service_classify.py -v`
Expected: PASS (14 tests total)

- [ ] **Step 5: Commit**

```bash
git add app/services/remediation_service.py tests/test_remediation_service.py
git commit -m "feat(remediation): add generate_proposal and apply_proposal orchestration"
```

---

### Task 4: Wire `post_run_service` to generate proposals on failure

**Files:**
- Modify: `app/services/post_run_service.py:79-84` (Step 4 block) and `app/services/post_run_service.py:123-170` (`_auto_create_issue`)
- Modify: `tests/test_post_run_service.py` (the existing `mock_issue.assert_called_once()` test needs `_auto_create_issue` to keep returning something truthy-safe; add new tests)

**Interfaces:**
- Consumes: `app.services.remediation_service.generate_proposal(issue, run, rule, db)` from Task 3.
- Produces: `_auto_create_issue(run, rule, asset, db) -> Optional[Issue]` (changed return type — was `None`, now returns the relevant `Issue`, whether pre-existing or newly created).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_post_run_service.py`:

```python
@pytest.mark.asyncio
async def test_failed_run_triggers_remediation_proposal_generation():
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
    mock_rule.rule_name = "Freshness Check"
    mock_rule.severity = "high"

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-1"
    mock_asset.sf_table_name = "orders"
    mock_asset.sf_schema_name = "sales"

    mock_issue = MagicMock()
    mock_issue.issue_id = "iss-1"

    mock_db = AsyncMock()

    call_count = [0]
    async def mock_execute(query):
        call_count[0] += 1
        result = MagicMock()
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
         patch("app.services.post_run_service._trigger_anomaly_detection", new_callable=AsyncMock, return_value=None), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock, return_value=mock_issue) as mock_create_issue, \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="AI explanation text"), \
         patch("app.services.remediation_service.generate_proposal", new_callable=AsyncMock) as mock_generate_proposal:
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services import post_run_service
        await post_run_service._run("run-1", "asset-1", mock_db)

        mock_create_issue.assert_called_once()
        mock_generate_proposal.assert_called_once_with(mock_issue, mock_run, mock_rule, mock_db)


@pytest.mark.asyncio
async def test_remediation_proposal_failure_does_not_raise():
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_run = MagicMock(run_id="run-1", rule_id="rule-1", asset_id="asset-1",
                          domain_id="d", subdomain_id="s", status="failed", quality_score=40.0)
    mock_rule = MagicMock(rule_id="rule-1", rule_name="R", severity="high")
    mock_asset = MagicMock(asset_id="asset-1", sf_table_name="t", sf_schema_name="s")
    mock_issue = MagicMock(issue_id="iss-1")
    mock_db = AsyncMock()

    call_count = [0]
    async def mock_execute(query):
        call_count[0] += 1
        result = MagicMock()
        results = [mock_run, mock_rule, mock_asset]
        result.scalar_one_or_none.return_value = results[call_count[0] - 1] if call_count[0] <= 3 else None
        return result
    mock_db.execute = mock_execute

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session, \
         patch("app.services.post_run_service._trigger_anomaly_detection", new_callable=AsyncMock, return_value=None), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock, return_value=mock_issue), \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="x"), \
         patch("app.services.remediation_service.generate_proposal", new_callable=AsyncMock, side_effect=Exception("ai down")):
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services import post_run_service
        # Should not raise even though generate_proposal blew up.
        await post_run_service._run("run-1", "asset-1", mock_db)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_post_run_service.py -v -k remediation`
Expected: FAIL — `mock_generate_proposal.assert_called_once_with(...)` raises `AssertionError: Expected 'generate_proposal' to have been called once. Called 0 times.`

- [ ] **Step 3: Wire the call**

In `app/services/post_run_service.py`, replace the Step 4 block (lines 79-84):

```python
    # ── Step 4: Auto-create Issue for failures ────────────────────────────────
    if run.status == "failed":
        try:
            await _auto_create_issue(run, rule, asset, db)
        except Exception as e:
            logger.warning(f"post_run: issue creation failed for run {run_id}: {e}")
```

with:

```python
    # ── Step 4: Auto-create Issue for failures, then propose a remediation ───
    if run.status == "failed":
        issue = None
        try:
            issue = await _auto_create_issue(run, rule, asset, db)
        except Exception as e:
            logger.warning(f"post_run: issue creation failed for run {run_id}: {e}")
        if issue is not None:
            try:
                from app.services import remediation_service
                await remediation_service.generate_proposal(issue, run, rule, db)
            except Exception as e:
                logger.warning(f"post_run: remediation proposal generation failed for run {run_id}: {e}")
```

Then update `_auto_create_issue` (lines 123-170) to return the `Issue` in both the dedup path and the creation path:

```python
async def _auto_create_issue(run, rule, asset, db):
    from sqlalchemy import select
    from app.db.models import Issue
    from app.services import ai_service

    existing = await db.execute(
        select(Issue).where(
            Issue.rule_id == rule.rule_id,
            Issue.asset_id == run.asset_id,
            Issue.status.not_in(["closed", "resolved"]),
        )
    )
    existing_issue = existing.scalar_one_or_none()
    if existing_issue is not None:
        logger.debug(f"post_run: open issue exists for rule {rule.rule_id} — skipping creation")
        return existing_issue

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
    await db.refresh(issue)
    logger.info(f"post_run: auto-created issue for rule {rule.rule_id} on asset {asset.asset_id}")
    return issue
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_post_run_service.py -v`
Expected: PASS (all tests in the file, including the 2 pre-existing ones — `mock_issue.assert_called_once()` still holds since `_auto_create_issue` is still called exactly once)

- [ ] **Step 5: Commit**

```bash
git add app/services/post_run_service.py tests/test_post_run_service.py
git commit -m "feat(remediation): generate a remediation proposal after every auto-created issue"
```

---

### Task 5: Backend `/rules/auto-remediate-config` endpoints

**Files:**
- Modify: `app/api/rules.py` (append at end of file)
- Test: `tests/test_auto_remediate_config_api.py`

**Interfaces:**
- Consumes: `app.services.config_service.{get_value, set_value}`.
- Produces: `GET /rules/auto-remediate-config` and `POST /rules/auto-remediate-config`, both returning `{"enabled": bool, "threshold": int, "rule_types": list[str], "last_updated": str|None}` — consumed by the existing (currently-mocked) frontend proxy at `frontend/src/app/api/rules/auto-remediate-config/route.ts`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_auto_remediate_config_api.py
from unittest.mock import AsyncMock, patch
import pytest

ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


@pytest.mark.asyncio
async def test_get_auto_remediate_config_returns_defaults():
    from app.api.rules import get_auto_remediate_config

    db = AsyncMock()
    with patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "false",
            "auto_remediation_threshold": "10",
            "auto_remediation_rule_types": "[]",
        }[key]
        out = await get_auto_remediate_config(db=db, user=ADMIN)

    assert out == {"enabled": False, "threshold": 10, "rule_types": [], "last_updated": None}


@pytest.mark.asyncio
async def test_post_auto_remediate_config_writes_three_keys():
    from app.api.rules import update_auto_remediate_config, AutoRemediateConfigRequest

    db = AsyncMock()
    body = AutoRemediateConfigRequest(enabled=True, threshold=15, rule_types=["freshness_check", "volume_check"])

    with patch("app.services.config_service.set_value", new_callable=AsyncMock) as mock_set, \
         patch("app.services.config_service.get_value", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = lambda key, db: {
            "auto_remediation_enabled": "true",
            "auto_remediation_threshold": "15",
            "auto_remediation_rule_types": '["freshness_check", "volume_check"]',
        }[key]
        out = await update_auto_remediate_config(body, db=db, user=ADMIN)

    assert mock_set.call_count == 3
    written_keys = {call.args[0] for call in mock_set.call_args_list}
    assert written_keys == {"auto_remediation_enabled", "auto_remediation_threshold", "auto_remediation_rule_types"}
    assert out["enabled"] is True
    assert out["rule_types"] == ["freshness_check", "volume_check"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_auto_remediate_config_api.py -v`
Expected: FAIL with `ImportError: cannot import name 'get_auto_remediate_config' from 'app.api.rules'`

- [ ] **Step 3: Implement the endpoints**

Append to the end of `app/api/rules.py`:

```python
class AutoRemediateConfigRequest(BaseModel):
    enabled: bool
    threshold: int
    rule_types: list[str]


@router.get("/auto-remediate-config")
async def get_auto_remediate_config(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.services import config_service
    import json as _j

    enabled = await config_service.get_value("auto_remediation_enabled", db)
    threshold = await config_service.get_value("auto_remediation_threshold", db)
    rule_types_raw = await config_service.get_value("auto_remediation_rule_types", db)
    try:
        rule_types = _j.loads(rule_types_raw) if rule_types_raw else []
    except Exception:
        rule_types = []

    return {
        "enabled": enabled == "true",
        "threshold": int(threshold) if threshold else 0,
        "rule_types": rule_types,
        "last_updated": None,
    }


@router.post("/auto-remediate-config")
async def update_auto_remediate_config(
    body: AutoRemediateConfigRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.services import config_service
    import json as _j

    await config_service.set_value("auto_remediation_enabled", "true" if body.enabled else "false", user.get("email"), db)
    await config_service.set_value("auto_remediation_threshold", str(body.threshold), user.get("email"), db)
    await config_service.set_value("auto_remediation_rule_types", _j.dumps(body.rule_types), user.get("email"), db)

    return await get_auto_remediate_config(db=db, user=user)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_auto_remediate_config_api.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/rules.py tests/test_auto_remediate_config_api.py
git commit -m "feat(remediation): add backend auto-remediate-config endpoints"
```

---

### Task 6: Backend remediation-proposal endpoints on Issues

**Files:**
- Modify: `app/api/issues.py` (append at end of file)
- Test: `tests/test_issues_remediation_api.py`

**Interfaces:**
- Consumes: `app.services.remediation_service.apply_proposal(proposal, triggered_by, db)` from Task 3; `app.db.models.RemediationProposal`.
- Produces: `GET /issues/{issue_id}/remediation-proposal`, `POST /issues/{issue_id}/remediation-proposal/{proposal_id}/approve`, `POST /issues/{issue_id}/remediation-proposal/{proposal_id}/reject` — consumed by Task 7's frontend proxies.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_issues_remediation_api.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException

ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


def _proposal(**overrides):
    p = MagicMock()
    p.proposal_id = overrides.get("proposal_id", "prop-1")
    p.issue_id = overrides.get("issue_id", "iss-1")
    p.rule_id = overrides.get("rule_id", "rule-1")
    p.run_id = overrides.get("run_id", "run-1")
    p.asset_id = overrides.get("asset_id", "asset-1")
    p.rule_type = overrides.get("rule_type", "freshness_check")
    p.classification = overrides.get("classification", "auto_fixable")
    p.proposed_action = overrides.get("proposed_action", "Bump max_hours from 24 to 30.")
    p.config_field = overrides.get("config_field", "max_hours")
    p.old_value = overrides.get("old_value", "24")
    p.new_value = overrides.get("new_value", "30")
    p.confidence = overrides.get("confidence", "high")
    p.status = overrides.get("status", "pending")
    p.decided_by = overrides.get("decided_by")
    p.decided_at = overrides.get("decided_at")
    p.rerun_run_id = overrides.get("rerun_run_id")
    p.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-21T00:00:00"))
    return p


@pytest.mark.asyncio
async def test_get_remediation_proposal_returns_latest():
    from app.api.issues import get_remediation_proposal

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = _proposal()
    db.execute.return_value = result

    out = await get_remediation_proposal("iss-1", db=db, user=ADMIN)
    assert out["proposal_id"] == "prop-1"
    assert out["status"] == "pending"


@pytest.mark.asyncio
async def test_get_remediation_proposal_returns_none_when_absent():
    from app.api.issues import get_remediation_proposal

    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    out = await get_remediation_proposal("iss-1", db=db, user=ADMIN)
    assert out is None


@pytest.mark.asyncio
async def test_approve_remediation_proposal_calls_apply_proposal():
    from app.api.issues import approve_remediation_proposal

    proposal = _proposal(status="pending")
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = proposal
    db.execute.return_value = result

    applied = _proposal(status="applied")
    with patch("app.services.remediation_service.apply_proposal", new_callable=AsyncMock, return_value=applied) as mock_apply:
        out = await approve_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)

    mock_apply.assert_called_once_with(proposal, "admin@example.com", db)
    assert out["status"] == "applied"


@pytest.mark.asyncio
async def test_approve_remediation_proposal_rejects_non_pending():
    from app.api.issues import approve_remediation_proposal

    proposal = _proposal(status="rejected")
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = proposal
    db.execute.return_value = result

    with pytest.raises(HTTPException) as exc_info:
        await approve_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reject_remediation_proposal_sets_status():
    from app.api.issues import reject_remediation_proposal

    proposal = _proposal(status="pending")
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = proposal
    db.commit = AsyncMock()
    db.execute.return_value = result

    out = await reject_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)
    assert proposal.status == "rejected"
    assert proposal.decided_by == "admin@example.com"
    assert out["status"] == "rejected"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_issues_remediation_api.py -v`
Expected: FAIL with `ImportError: cannot import name 'get_remediation_proposal' from 'app.api.issues'`

- [ ] **Step 3: Implement the endpoints**

Append to the end of `app/api/issues.py`:

```python
def _fmt_proposal(p) -> dict:
    return {
        "proposal_id": p.proposal_id,
        "issue_id": p.issue_id,
        "rule_id": p.rule_id,
        "run_id": p.run_id,
        "asset_id": p.asset_id,
        "rule_type": p.rule_type,
        "classification": p.classification,
        "proposed_action": p.proposed_action,
        "config_field": p.config_field,
        "old_value": p.old_value,
        "new_value": p.new_value,
        "confidence": p.confidence,
        "status": p.status,
        "decided_by": p.decided_by,
        "decided_at": p.decided_at.isoformat() if p.decided_at else None,
        "rerun_run_id": p.rerun_run_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/{issue_id}/remediation-proposal")
async def get_remediation_proposal(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from app.db.models import RemediationProposal

    result = await db.execute(
        select(RemediationProposal)
        .where(RemediationProposal.issue_id == issue_id)
        .order_by(desc(RemediationProposal.created_at))
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        return None
    return _fmt_proposal(proposal)


@router.post("/{issue_id}/remediation-proposal/{proposal_id}/approve")
async def approve_remediation_proposal(
    issue_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import RemediationProposal
    from app.services import remediation_service

    result = await db.execute(
        select(RemediationProposal).where(
            RemediationProposal.proposal_id == proposal_id, RemediationProposal.issue_id == issue_id
        )
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(404, "Remediation proposal not found")
    if proposal.status != "pending":
        raise HTTPException(400, f"Cannot approve a proposal with status '{proposal.status}'")
    if proposal.classification != "auto_fixable":
        raise HTTPException(400, "Escalation-only proposals cannot be applied — acknowledge them instead")

    updated = await remediation_service.apply_proposal(proposal, user.get("email"), db)
    return _fmt_proposal(updated)


@router.post("/{issue_id}/remediation-proposal/{proposal_id}/reject")
async def reject_remediation_proposal(
    issue_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import RemediationProposal

    result = await db.execute(
        select(RemediationProposal).where(
            RemediationProposal.proposal_id == proposal_id, RemediationProposal.issue_id == issue_id
        )
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(404, "Remediation proposal not found")
    if proposal.status != "pending":
        raise HTTPException(400, f"Cannot reject a proposal with status '{proposal.status}'")

    proposal.status = "rejected"
    proposal.decided_by = user.get("email")
    proposal.decided_at = model_now()
    await db.commit()
    await db.refresh(proposal)
    return _fmt_proposal(proposal)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_issues_remediation_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/issues.py tests/test_issues_remediation_api.py
git commit -m "feat(remediation): add remediation-proposal get/approve/reject endpoints"
```

---

### Task 7: Frontend Next.js proxy routes

**Files:**
- Create: `frontend/src/app/api/issues/[id]/remediation-proposal/route.ts`
- Create: `frontend/src/app/api/issues/[id]/remediation-proposal/[proposalId]/approve/route.ts`
- Create: `frontend/src/app/api/issues/[id]/remediation-proposal/[proposalId]/reject/route.ts`

**Interfaces:**
- Consumes: backend endpoints from Task 6.
- Produces: `GET /api/issues/{id}/remediation-proposal`, `POST /api/issues/{id}/remediation-proposal/{proposalId}/approve`, `POST /api/issues/{id}/remediation-proposal/{proposalId}/reject` — consumed by Task 8's `ProposedRemediationSection`.

This task has no backend logic to unit test — it is a pass-through proxy, matching the existing pattern exactly (see `frontend/src/app/api/issues/[id]/audit/route.ts` and `frontend/src/app/api/issues/[id]/transition/route.ts`). Verification is a manual `curl` check in Step 2.

- [ ] **Step 1: Create the proxy routes**

`frontend/src/app/api/issues/[id]/remediation-proposal/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = req.headers.get('Authorization')
    const res = await fetch(`${BACKEND}/issues/${id}/remediation-proposal`, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    const data = await res.json().catch(() => null)
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(null, { status: 500 })
  }
}
```

`frontend/src/app/api/issues/[id]/remediation-proposal/[proposalId]/approve/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const { id, proposalId } = await params
  try {
    const auth = req.headers.get('Authorization')
    const res = await fetch(`${BACKEND}/issues/${id}/remediation-proposal/${proposalId}/approve`, {
      method: 'POST',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

`frontend/src/app/api/issues/[id]/remediation-proposal/[proposalId]/reject/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const { id, proposalId } = await params
  try {
    const auth = req.headers.get('Authorization')
    const res = await fetch(`${BACKEND}/issues/${id}/remediation-proposal/${proposalId}/reject`, {
      method: 'POST',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify routes compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new type errors introduced by the 3 new files

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/issues/[id]/remediation-proposal
git commit -m "feat(remediation): add frontend proxy routes for remediation proposals"
```

---

### Task 8: `ProposedRemediationSection` in `IssueDetailPanel`

**Files:**
- Modify: `frontend/src/components/issues/IssueDetailPanel.tsx`

**Interfaces:**
- Consumes: the 3 proxy routes from Task 7.
- Produces: a section rendered between the existing `AiRcaSection` (line 403) and `CostImpactSection` (line 406), visible whenever `issue.run_id` is set.

No backend logic here — this is a UI component. Verification is manual (Step 3), matching how this codebase's other AI-panel components (`AiRcaSection`, `CostImpactSection` in the same file) were built without component-level tests.

- [ ] **Step 1: Add the `ProposedRemediationSection` component**

In `frontend/src/components/issues/IssueDetailPanel.tsx`, insert immediately after the `AiRcaSection` function (after line 148, before the `interface CostEstimate` block):

```typescript
interface RemediationProposal {
  proposal_id: string
  issue_id: string
  rule_id: string
  run_id: string
  asset_id: string
  rule_type: string
  classification: 'auto_fixable' | 'escalation_only'
  proposed_action: string
  config_field: string | null
  old_value: string | null
  new_value: string | null
  confidence: 'high' | 'medium' | 'low' | null
  status: 'pending' | 'auto_applied' | 'approved' | 'rejected' | 'applied' | 'apply_failed'
  decided_by: string | null
  decided_at: string | null
  rerun_run_id: string | null
  created_at: string | null
}

const CONFIDENCE_LABEL: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }

function ProposedRemediationSection({ issueId }: { issueId: string }) {
  const [proposal, setProposal] = useState<RemediationProposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/issues/${issueId}/remediation-proposal`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setProposal(d as RemediationProposal | null))
      .catch(() => setProposal(null))
      .finally(() => setLoading(false))
  }, [issueId])

  async function decide(action: 'approve' | 'reject') {
    if (!proposal) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/issues/${issueId}/remediation-proposal/${proposal.proposal_id}/${action}`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed to ${action} (${res.status})`)
      const updated = await res.json()
      setProposal(updated as RemediationProposal)
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action} remediation`)
    } finally {
      setBusy(false)
    }
  }

  const panelStyle: CSSProperties = {
    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '1px solid #86efac',
    borderRadius: '8px',
    padding: '12px 14px',
  }

  if (loading) return null
  if (!proposal) return null

  const isPending = proposal.status === 'pending'
  const isEscalation = proposal.classification === 'escalation_only'

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🛠️</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Proposed Remediation
          </span>
        </div>
        {proposal.confidence && (
          <span style={{ fontSize: '10px', color: '#15803d', background: '#bbf7d0', padding: '2px 8px', borderRadius: '10px' }}>
            {CONFIDENCE_LABEL[proposal.confidence] ?? proposal.confidence}
          </span>
        )}
      </div>

      <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#14532d', lineHeight: '1.6' }}>{proposal.proposed_action}</p>

      {proposal.config_field && (
        <div style={{ fontSize: '11.5px', color: '#166534', marginBottom: '8px' }}>
          <code>{proposal.config_field}</code>: {proposal.old_value} → {proposal.new_value}
        </div>
      )}

      {err && <div style={{ fontSize: '12px', color: 'var(--status-error-text)', marginBottom: '8px' }}>{err}</div>}

      {isPending && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isEscalation && (
            <button
              onClick={() => decide('approve')}
              disabled={busy}
              style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Applying…' : 'Apply Fix'}
            </button>
          )}
          <button
            onClick={() => decide('reject')}
            disabled={busy}
            style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid #86efac', background: 'transparent', color: '#15803d', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {isEscalation ? 'Acknowledge' : 'Reject'}
          </button>
        </div>
      )}

      {!isPending && (
        <div style={{ fontSize: '11.5px', color: '#166534' }}>
          {proposal.status === 'auto_applied' && 'Auto-applied by the platform.'}
          {proposal.status === 'applied' && `Applied by ${proposal.decided_by ?? 'a user'}.`}
          {proposal.status === 'rejected' && `${isEscalation ? 'Acknowledged' : 'Rejected'} by ${proposal.decided_by ?? 'a user'}.`}
          {proposal.status === 'apply_failed' && 'Apply attempt failed — see audit log.'}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render the section**

In the same file, replace:

```typescript
        {issue.run_id && !editing && (
          <AiRcaSection runId={issue.run_id} />
        )}
```

with:

```typescript
        {issue.run_id && !editing && (
          <AiRcaSection runId={issue.run_id} />
        )}

        {issue.run_id && !editing && (
          <ProposedRemediationSection issueId={issue.issue_id} />
        )}
```

- [ ] **Step 3: Manual verification**

Run: `cd frontend && npm run dev` (or the project's existing dev script), open an issue with `rule_id`/`run_id` set in the Issues page detail panel, and confirm the panel renders without errors when no proposal exists (`null` response → section renders nothing) and that `npx tsc --noEmit` reports no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/issues/IssueDetailPanel.tsx
git commit -m "feat(remediation): show proposed remediation with approve/reject in IssueDetailPanel"
```

---

### Task 9: Update the roadmap status on the Settings page

**Files:**
- Modify: `frontend/src/app/settings/page.tsx:629-633`

**Interfaces:** None — this is a copy-only change reflecting the now-built feature, matching the convention used by every other `Implemented` entry in the same list (e.g. lines 605-609, 610-615).

- [ ] **Step 1: Update the feature entry**

Replace lines 629-633:

```typescript
                    {
                      name: 'Agentic Monitoring & Auto-Remediation',
                      where: 'Issues page & Schedules',
                      status: 'Not built',
                      desc: 'Today when a scheduled rule fails, a human must open the Issues page, investigate manually, and decide what to do. An autonomous agent should handle the first-response loop automatically: detect the failure from the execution log, classify it as a known pattern (e.g. late load, threshold drift, upstream schema change), propose a specific fix (e.g. "adjust null threshold from 5% to 8% based on the last 30 days of data"), and — with one-click human approval — apply the change and trigger a re-run. For well-understood recurring issues, fully automated remediation (no approval required) should be configurable.',
                    },
```

with:

```typescript
                    {
                      name: 'Agentic Monitoring & Auto-Remediation',
                      where: 'Issues page & Observability page',
                      status: 'Implemented — auto-detection, AI-proposed fixes, approve/reject UI, and configurable auto-apply',
                      desc: 'When a scheduled rule fails, the post-run pipeline now classifies the failure (auto-fixable — freshness, volume, range, and distribution-consistency checks with a tunable parameter — vs. escalation-only for everything else), computes a concrete proposed fix from recent run history, and asks the AI provider to phrase the action with a confidence label. The proposal appears on the Issue detail panel with Apply Fix / Reject (or Acknowledge for escalation-only issues). The Observability page\'s Auto-Remediation panel — enable, rule-type whitelist — is now wired to a real backend: when enabled and the rule type is whitelisted (and severity is not critical), the fix is applied and the rule re-run automatically, resolving the issue if it passes.',
                    },
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "docs(roadmap): mark Agentic Monitoring & Auto-Remediation as implemented"
```

---

## Self-Review

**Spec coverage:**
- Detection via post-run pipeline → Task 4.
- Classification (auto-fixable vs escalation-only) → Task 2.
- Proposed fix computation from run history, insufficient-history fallback → Task 2 + Task 3 (`_recent_run_count` gate in `generate_proposal`).
- AI phrasing + confidence → Task 3 (`_describe_fix`).
- Persistence (`RemediationProposal`, `RemediationExecution`) → Task 1.
- Approval gate (enabled + rule_types + severity != critical) → Task 3 (`_apply_gate_passes`).
- Apply = patch config + bump version + re-run + resolve issue → Task 3 (`apply_proposal`).
- `/rules/auto-remediate-config` real backend → Task 5.
- Issue panel proposal endpoints → Task 6.
- Frontend proxies → Task 7.
- Issue detail panel UI (approve/reject/acknowledge, all status states) → Task 8.
- Roadmap status update → Task 9.
- Out-of-scope items (continuous structural monitoring, multi-step plans, editing proposals) — intentionally not built; no task needed.

**Type consistency check:** `classify_and_compute(rule, run) -> tuple[str, Optional[tuple[str, str, str]]]` (Task 2) is consumed identically in Task 3's `generate_proposal`. `apply_proposal(proposal, triggered_by, db)` (Task 3) is called the same way in Task 3's own auto-apply branch and in Task 6's `approve_remediation_proposal`. The `RemediationProposal` field names match across Task 1 (model), Task 3 (construction), Task 6 (`_fmt_proposal`), and Task 8 (TypeScript interface).

**No placeholders:** all steps contain complete code; no "TBD"/"similar to Task N" references.
