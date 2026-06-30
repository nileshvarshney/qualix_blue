from __future__ import annotations
import logging
import math
from typing import Optional

from sqlalchemy import select, desc
from app.services import config_service

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
        new_value = math.ceil(round(observed * 1.1, 6))
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
            RemediationProposal.status.in_(["pending", "auto_applied", "approved", "applied"]),
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
    from app.db.models import DQRule, Issue, RemediationExecution, gen_uuid, now as model_now

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
            # Any open-ish issue state can be auto-resolved here: a passing re-run is
            # objective proof the underlying problem is fixed, regardless of what
            # human-driven status (new/in_progress/confirmed/blocked) the issue was in.
            # Only "resolved" and "closed" are terminal and left alone.
            can_resolve = issue and issue.status not in ("resolved", "closed")
            if can_resolve:
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
