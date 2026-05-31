from __future__ import annotations

"""
Automatic data quality rule creation triggered by discovery and column profiling.

Phase 1 (called from discovery_service.py):
  create_phase1_rules(asset, columns, db)
  -> schema-based rules using only column name/type/nullability

Phase 2 (called from columns.py after profiling commit):
  create_phase2_rules(asset, col_profiles, db)
  -> stats-driven rules + LLM business/accuracy rules
"""
import json
import logging
import re
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import AuditLog, ColumnMetadata, DataAsset, DQRule
from app.services.sql_generator import sql_generator

logger = logging.getLogger("dq_platform.auto_rules")

_FRESHNESS_TYPE_RE = re.compile(r"TIMESTAMP|DATE|TIME", re.IGNORECASE)
_FRESHNESS_NAME_RE = re.compile(r"created|updated|modified|loaded|_at$", re.IGNORECASE)
_PK_NAME_RE = re.compile(r"^id$|_id$|_key$|_pk$|_uuid$", re.IGNORECASE)
_NUMERIC_TYPE_RE = re.compile(r"NUMBER|INT|FLOAT|DECIMAL|DOUBLE|REAL|NUMERIC", re.IGNORECASE)


async def _build_dedup_set(asset_id: str, db: AsyncSession) -> set[tuple[str, Optional[str]]]:
    """Return set of (rule_type, target_column) for all rules on this asset (any status)."""
    result = await db.execute(
        select(DQRule.rule_type, DQRule.target_column).where(
            DQRule.asset_id == asset_id,
        )
    )
    return {(row.rule_type, row.target_column) for row in result}


def _table_ref(asset: DataAsset) -> str:
    db_prefix = f'"{asset.sf_database_name}".' if asset.sf_database_name else ""
    return f'{db_prefix}"{asset.sf_schema_name}"."{asset.sf_table_name}"'


def _make_rule(
    asset: DataAsset,
    rule_type: str,
    target_column: Optional[str],
    rule_config: dict,
    severity: str,
    tref: str,
) -> Optional[DQRule]:
    """Build a DQRule with generated SQL. Returns None if SQL generation fails."""
    try:
        rule_sql = sql_generator.generate(rule_type, rule_config, tref, target_column)
    except Exception as exc:
        logger.warning("Auto-rule SQL gen failed for %s/%s: %s", rule_type, target_column, exc)
        return None

    col_label = f" on {target_column}" if target_column else ""
    return DQRule(
        rule_id=str(uuid.uuid4()),
        rule_name=f"Auto: {rule_type}{col_label} [{asset.sf_table_name}]",
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset.asset_id,
        rule_type=rule_type,
        target_column=target_column,
        rule_config=rule_config,
        rule_sql=rule_sql,
        severity=severity,
        status="pending_review",
        is_active=False,
        created_by="auto_discovery",
    )


def _phase1_candidates(asset: DataAsset, columns: list[dict]) -> list[DQRule]:
    """Generate priority-ordered Phase 1 rule candidates (no DB access)."""
    tref = _table_ref(asset)
    col_names = [c["column_name"] for c in columns]
    candidates: list[DQRule] = []

    # Priority 1: schema_drift_check — always
    r = _make_rule(asset, "schema_drift_check", None,
                   {"expected_columns": col_names}, "high", tref)
    if r:
        candidates.append(r)

    # Priority 2: null_check — one multi-column rule for all NOT NULL columns
    not_null = [c["column_name"] for c in columns
                if c.get("is_nullable", "YES").upper() == "NO"]
    if not_null:
        r = _make_rule(asset, "null_check", None,
                       {"columns": not_null}, "high", tref)
        if r:
            candidates.append(r)

    # Priority 3: freshness_check — timestamp column with temporal naming
    fresh_col = next(
        (c["column_name"] for c in columns
         if _FRESHNESS_TYPE_RE.search(c.get("data_type", ""))
         and _FRESHNESS_NAME_RE.search(c["column_name"])),
        None,
    )
    if fresh_col:
        r = _make_rule(asset, "freshness_check", fresh_col,
                       {"max_hours": 48}, "medium", tref)
        if r:
            candidates.append(r)

    # Priority 4: uniqueness_check — PK-named column
    table_lower = asset.sf_table_name.lower()
    pk_col = next(
        (c["column_name"] for c in columns
         if _PK_NAME_RE.search(c["column_name"])
         or c["column_name"].lower() == f"{table_lower}_id"),
        None,
    )
    if pk_col:
        r = _make_rule(asset, "uniqueness_check", pk_col,
                       {"columns": [pk_col]}, "high", tref)
        if r:
            candidates.append(r)

    # Priority 5: volume_check — always, total row count (no date filter)
    r = _make_rule(asset, "volume_check", None,
                   {"min_rows": 1, "date_column": None}, "low", tref)
    if r:
        candidates.append(r)

    return candidates


async def create_phase1_rules(
    asset: DataAsset, columns: list[dict], db: AsyncSession
) -> list[DQRule]:
    """Create Phase 1 schema-based rules after asset discovery.

    Deduplicates against existing rules. Respects auto_rules_max_per_table cap.
    Commits its own transaction. Returns [] if feature flag is off.
    """
    if not settings.auto_rules_enabled:
        return []

    existing = await _build_dedup_set(asset.asset_id, db)
    candidates = _phase1_candidates(asset, columns)

    created: list[DQRule] = []
    for rule in candidates:
        if len(created) >= settings.auto_rules_max_per_table:
            break
        key = (rule.rule_type, rule.target_column)
        if key in existing:
            continue
        db.add(rule)
        db.add(AuditLog(
            audit_id=str(uuid.uuid4()),
            user_email="auto_discovery",
            action="CREATE",
            entity_type="rule",
            entity_id=rule.rule_id,
            new_value={
                "rule_type": rule.rule_type,
                "asset_id": rule.asset_id,
                "source": "auto_discovery",
            },
        ))
        # Commit each rule individually — batching multiple rows via executemany
        # triggers a Snowflake connector bug (error 252001) when PARSE_JSON is
        # present in the INSERT … SELECT form used for VARIANT columns.
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        created.append(rule)
        existing.add(key)

    logger.info("Auto Phase 1: created %d rules for asset %s", len(created), asset.asset_id)
    return created


async def create_phase2_rules(
    asset: DataAsset, col_profiles: list[ColumnMetadata], db: AsyncSession
) -> list[DQRule]:
    """Create Phase 2 stats-driven + LLM rules after column profiling.

    Counts existing rules to respect the cap. Commits its own transaction.
    Returns [] if feature flag is off or cap already reached.
    """
    if not settings.auto_rules_enabled:
        return []

    existing = await _build_dedup_set(asset.asset_id, db)
    remaining = settings.auto_rules_max_per_table - len(existing)
    if remaining <= 0:
        return []

    tref = _table_ref(asset)
    candidates = _phase2_candidates(asset, col_profiles, tref)

    created: list[DQRule] = []
    for rule in candidates:
        if len(created) >= remaining:
            break
        key = (rule.rule_type, rule.target_column)
        if key in existing:
            continue
        db.add(rule)
        db.add(AuditLog(
            audit_id=str(uuid.uuid4()),
            user_email="auto_discovery",
            action="CREATE",
            entity_type="rule",
            entity_id=rule.rule_id,
            new_value={
                "rule_type": rule.rule_type,
                "asset_id": rule.asset_id,
                "source": "auto_discovery",
            },
        ))
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        created.append(rule)
        existing.add(key)

    llm_slots = remaining - len(created)
    if llm_slots > 0:
        llm_rules = await _create_llm_rules(asset, col_profiles, llm_slots, tref, db)
        for rule in llm_rules:
            key = (rule.rule_type, rule.target_column)
            if key not in existing and len(created) < remaining:
                db.add(rule)
                db.add(AuditLog(
                    audit_id=str(uuid.uuid4()),
                    user_email="auto_discovery",
                    action="CREATE",
                    entity_type="rule",
                    entity_id=rule.rule_id,
                    new_value={
                        "rule_type": rule.rule_type,
                        "asset_id": rule.asset_id,
                        "source": "auto_discovery_llm",
                    },
                ))
                try:
                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise
                created.append(rule)
                existing.add(key)

    logger.info("Auto Phase 2: created %d rules for asset %s", len(created), asset.asset_id)
    return created


def _phase2_candidates(
    asset: DataAsset, col_profiles: list[ColumnMetadata], tref: str
) -> list[DQRule]:
    """Build priority-ordered Phase 2 heuristic rule candidates."""
    candidates: list[DQRule] = []

    for col in col_profiles:
        dt = col.data_type or ""
        is_numeric = bool(_NUMERIC_TYPE_RE.search(dt))

        # Priority 6: range_check — numeric columns with profiled min/max
        if is_numeric and col.min_value is not None and col.max_value is not None:
            try:
                min_v = float(col.min_value)
                max_v = float(col.max_value)
                r = _make_rule(asset, "range_check", col.column_name,
                               {"min_value": min_v - abs(min_v) * 0.1,
                                "max_value": max_v + abs(max_v) * 0.1},
                               "medium", tref)
                if r:
                    candidates.append(r)
            except (TypeError, ValueError):
                pass

        # Priority 7: accepted_values_check — low-cardinality columns
        if (col.cardinality_pct is not None and col.cardinality_pct < 5.0
                and col.unique_count is not None and col.unique_count <= 20
                and col.top_values):
            try:
                top = json.loads(col.top_values)
                vals = [str(item["value"]) for item in top if item.get("value") is not None]
                if vals:
                    r = _make_rule(asset, "accepted_values_check", col.column_name,
                                   {"accepted_values": vals}, "medium", tref)
                    if r:
                        candidates.append(r)
            except (json.JSONDecodeError, KeyError):
                pass

        # Priority 8: distribution_consistency_check — numeric with mean + stddev
        if is_numeric and col.avg_value is not None and col.std_dev is not None:
            r = _make_rule(asset, "distribution_consistency_check", col.column_name,
                           {"baseline_mean": col.avg_value, "baseline_std": col.std_dev,
                            "tolerance_pct": 20},
                           "low", tref)
            if r:
                candidates.append(r)

    return candidates


async def _create_llm_rules(
    asset: DataAsset,
    col_profiles: list[ColumnMetadata],
    n_rules: int,
    tref: str,
    db: AsyncSession,
) -> list[DQRule]:
    """Ask the LLM for business/accuracy rule suggestions. Returns [] on failure."""
    from app.services.ai_service import suggest_data_quality_rules  # avoid circular import

    _ALLOWED_LLM_TYPES = {
        "business_rule_check", "regex_check",
        "accepted_values_check", "semantic_consistency_check",
    }

    columns_with_samples = [
        {
            "column_name": col.column_name,
            "data_type": col.data_type or "unknown",
            "sample_values": json.loads(col.sample_values) if col.sample_values else [],
        }
        for col in col_profiles
    ]

    try:
        suggestions = await suggest_data_quality_rules(
            asset.sf_table_name, columns_with_samples, n_rules, None, db
        )
    except Exception as exc:
        logger.warning("LLM rule suggestion failed for asset %s: %s", asset.asset_id, exc)
        return []

    rules: list[DQRule] = []
    for s in suggestions[:n_rules]:
        rule_type = s.get("rule_type", "")
        if rule_type not in _ALLOWED_LLM_TYPES:
            continue
        target_column = s.get("target_column") or None
        rule_config = s.get("rule_config") or {}
        severity = s.get("severity", "medium")
        rule = _make_rule(asset, rule_type, target_column, rule_config, severity, tref)
        if rule:
            rule.rule_name = s.get("rule_name") or rule.rule_name
            rules.append(rule)

    return rules
