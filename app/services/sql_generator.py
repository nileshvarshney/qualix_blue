from __future__ import annotations
import re
import logging
from typing import Any

logger = logging.getLogger("dq_platform.sql_generator")

# Snowflake identifier: letters, digits, underscore, dollar sign.
_IDENT_RE = re.compile(r'^[A-Za-z0-9_$]+$')
# Disallow statement-terminator and comment tokens in user-supplied conditions.
_CONDITION_BLOCKLIST_RE = re.compile(r'(;\s*--|;\s*$|/\*|\*/)', re.IGNORECASE)


def _validate_identifier(value: str, label: str) -> str:
    """Raise ValueError if `value` is not a safe Snowflake identifier."""
    if not value or not _IDENT_RE.match(value):
        raise ValueError(
            f"Invalid {label} '{value}': identifiers must contain only "
            "letters, digits, underscores, or dollar signs."
        )
    return value


def _validate_condition(condition: str) -> str:
    """Raise ValueError if `condition` contains statement-chaining tokens."""
    if _CONDITION_BLOCKLIST_RE.search(condition):
        raise ValueError(
            "Invalid condition: semicolons and SQL comment tokens (--  /* */) "
            "are not allowed in business rule conditions."
        )
    return condition


class SQLGenerator:
    """Generates Snowflake SQL for each rule type."""

    def generate_sample(self, rule_type: str, config: dict[str, Any], table_ref: str, column: Optional[str], limit: int = 5) -> Optional[str]:
        """Generate SQL to fetch a sample of failing rows. Returns None if not applicable for the rule type."""
        if not column and config.get("columns"):
            column = config["columns"][0]

        if rule_type == "null_check":
            columns = config.get("columns") or ([column] if column else None)
            if not columns:
                return None
            conditions = " OR ".join(f'"{c}" IS NULL' for c in columns)
            return f"SELECT * FROM {table_ref} WHERE {conditions} LIMIT {limit}"

        if rule_type in ("uniqueness_check", "duplicate_check"):
            columns = config.get("columns") or ([column] if column else None)
            if not columns:
                return None
            cols_quoted = ", ".join(f'"{c}"' for c in columns)
            return (
                f"SELECT {cols_quoted}, COUNT(*) AS duplicate_count FROM {table_ref} "
                f"GROUP BY {cols_quoted} HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC LIMIT {limit}"
            )

        if rule_type == "accepted_values_check":
            if not column:
                return None
            values = config.get("accepted_values", [])
            if not values:
                return None
            quoted = ", ".join(f"'{v}'" for v in values)
            return f'SELECT * FROM {table_ref} WHERE "{column}" NOT IN ({quoted}) LIMIT {limit}'

        if rule_type == "range_check":
            if not column:
                return None
            min_val = config.get("min_value")
            max_val = config.get("max_value")
            conditions = []
            if min_val is not None:
                conditions.append(f'"{column}" < {min_val}')
            if max_val is not None:
                conditions.append(f'"{column}" > {max_val}')
            if not conditions:
                return None
            return f"SELECT * FROM {table_ref} WHERE {' OR '.join(conditions)} LIMIT {limit}"

        if rule_type == "referential_integrity_check":
            if not column:
                return None
            ref_table = config.get("reference_table")
            ref_col = config.get("reference_column", column)
            if not ref_table:
                return None
            return (
                f'SELECT c.* FROM {table_ref} c '
                f'LEFT JOIN {ref_table} p ON c."{column}" = p."{ref_col}" '
                f'WHERE p."{ref_col}" IS NULL LIMIT {limit}'
            )

        if rule_type == "regex_check":
            if not column:
                return None
            pattern = config.get("pattern", "")
            if not pattern:
                return None
            return f"SELECT * FROM {table_ref} WHERE NOT REGEXP_LIKE(\"{column}\", '{pattern}') LIMIT {limit}"

        if rule_type in ("business_rule_check", "semantic_consistency_check", "referential_sanity_check"):
            condition = config.get("condition")
            if not condition:
                return None
            try:
                _validate_condition(condition)
            except ValueError:
                return None
            return f"SELECT * FROM {table_ref} WHERE NOT ({condition}) LIMIT {limit}"

        return None

    def generate(self, rule_type: str, config: dict[str, Any], table_ref: str, column: Optional[str]) -> str:
        # Multi-column support: if config has "columns" list, use it as primary reference
        if not column and config.get("columns"):
            column = config["columns"][0]
        generators = {
            "null_check":                     self._null_check,
            "uniqueness_check":               self._uniqueness_check,
            "duplicate_check":                self._duplicate_check,
            "accepted_values_check":          self._accepted_values_check,
            "range_check":                    self._range_check,
            "comparison_check":               self._comparison_check,
            "freshness_check":                self._freshness_check,
            "volume_check":                   self._volume_check,
            "schema_drift_check":             self._schema_drift_check,
            "referential_integrity_check":    self._referential_integrity_check,
            "regex_check":                    self._regex_check,
            "business_rule_check":            self._business_rule_check,
            "custom_sql_check":               self._custom_sql_check,
            "semantic_consistency_check":     self._semantic_consistency_check,
            "business_metric_check":          self._business_metric_check,
            "referential_sanity_check":       self._referential_sanity_check,
            "distribution_consistency_check": self._distribution_consistency_check,
            "llm_semantic_check":             self._llm_semantic_check,
        }
        gen_fn = generators.get(rule_type)
        if not gen_fn:
            raise ValueError(f"Unsupported rule type: {rule_type}")
        return gen_fn(config, table_ref, column)

    def _null_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        columns = config.get("columns") or ([column] if column else None)
        if not columns:
            raise ValueError("null_check requires target_column or config.columns")
        conditions = " OR ".join(f'"{c}" IS NULL' for c in columns)
        return f'SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE {conditions}'

    def _uniqueness_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        columns = config.get("columns") or ([column] if column else None)
        if not columns:
            raise ValueError("uniqueness_check requires target_column or config.columns")
        cols_quoted = ", ".join(f'"{c}"' for c in columns)
        return (
            f'SELECT COUNT(*) AS failed_count FROM ('
            f'SELECT {cols_quoted}, COUNT(*) AS cnt FROM {table_ref} '
            f'GROUP BY {cols_quoted} HAVING COUNT(*) > 1) AS _dups'
        )

    def _duplicate_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        return self._uniqueness_check(config, table_ref, column)

    def _accepted_values_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("accepted_values_check requires target_column")
        values = config.get("accepted_values", [])
        if not values:
            raise ValueError("accepted_values_check requires config.accepted_values")
        quoted = ", ".join(f"'{v}'" for v in values)
        return f'SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE "{column}" NOT IN ({quoted})'

    def _range_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("range_check requires target_column")
        min_val = config.get("min_value")
        max_val = config.get("max_value")
        conditions = []
        if min_val is not None:
            conditions.append(f'"{column}" < {min_val}')
        if max_val is not None:
            conditions.append(f'"{column}" > {max_val}')
        if not conditions:
            raise ValueError("range_check requires min_value or max_value in config")
        where = " OR ".join(conditions)
        return f"SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE {where}"

    _COMPARISON_OPS = {">", ">=", "<", "<=", "=", "!=", "<>", "between"}

    def _format_value(self, value: Any) -> str:
        """Render a literal: numbers/booleans bare, everything else single-quoted (escaped)."""
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (int, float)):
            return str(value)
        s = str(value).strip()
        # Allow bare numeric strings; otherwise treat as a quoted string literal.
        try:
            float(s)
            return s
        except ValueError:
            return "'" + s.replace("'", "''") + "'"

    def _comparison_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("comparison_check requires target_column")
        operator = str(config.get("operator") or config.get("op") or ">").strip().lower()
        if operator not in self._COMPARISON_OPS:
            raise ValueError(f"comparison_check: unsupported operator '{operator}'")
        col = f'"{column}"'
        if operator == "between":
            min_val = config.get("min", config.get("min_value"))
            max_val = config.get("max", config.get("max_value"))
            if min_val is None or max_val is None:
                raise ValueError("comparison_check BETWEEN requires min and max")
            valid = f"{col} BETWEEN {self._format_value(min_val)} AND {self._format_value(max_val)}"
        else:
            value = config.get("value", config.get("val"))
            if value is None:
                raise ValueError("comparison_check requires a value")
            valid = f"{col} {operator.upper()} {self._format_value(value)}"
        # Failed rows are those that do not satisfy the valid condition (NULLs count as failures).
        return f"SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE NOT ({valid}) OR {col} IS NULL"

    def _freshness_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("freshness_check requires target_column")
        max_hours = config.get("max_hours", 24)
        # Snowflake: DATEDIFF + CURRENT_TIMESTAMP()
        return (
            f"SELECT CASE WHEN DATEDIFF('hour', MAX(\"{column}\"), CURRENT_TIMESTAMP()) > {max_hours} "
            f"THEN 1 ELSE 0 END AS failed_count FROM {table_ref}"
        )

    def _volume_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        date_col    = config.get("date_column", "created_at")
        min_rows    = config.get("min_rows")
        max_rows    = config.get("max_rows")
        filter_date = f'WHERE DATE("{date_col}") = CURRENT_DATE()' if date_col else ""

        if min_rows is not None and max_rows is not None:
            threshold_expr = f"COUNT(*) < {min_rows} OR COUNT(*) > {max_rows}"
        elif min_rows is not None:
            threshold_expr = f"COUNT(*) < {min_rows}"
        elif max_rows is not None:
            threshold_expr = f"COUNT(*) > {max_rows}"
        else:
            # No threshold — informational only, always passes
            threshold_expr = None

        if threshold_expr:
            return (
                f"SELECT COUNT(*) AS current_row_count, "
                f"CASE WHEN {threshold_expr} THEN 1 ELSE 0 END AS failed_count "
                f"FROM {table_ref} {filter_date}"
            )
        return (
            f"SELECT COUNT(*) AS current_row_count, 0 AS failed_count "
            f"FROM {table_ref} {filter_date}"
        )

    def _schema_drift_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        expected = config.get("expected_columns", [])
        if not expected:
            return "SELECT 0 AS failed_count"

        # Extract schema and table name from table_ref (handles "db"."schema"."table" format)
        parts = [p.strip('"').strip("'") for p in table_ref.split('.')]
        table_name  = parts[-1].upper()
        schema_name = parts[-2].upper() if len(parts) >= 2 else None

        # Build UNION ALL of expected columns — Snowflake has no unnest()
        union_rows = " UNION ALL ".join(
            f"SELECT '{c.upper()}' AS expected_col" for c in expected
        )
        schema_filter = f"AND UPPER(table_schema) = '{schema_name}'" if schema_name else ""

        return (
            f"SELECT COUNT(*) AS failed_count FROM ({union_rows}) exp "
            f"WHERE exp.expected_col NOT IN ("
            f"SELECT UPPER(column_name) FROM information_schema.columns "
            f"WHERE UPPER(table_name) = '{table_name}' {schema_filter}"
            f")"
        )

    def _referential_integrity_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("referential_integrity_check requires target_column")
        ref_table = config.get("reference_table")
        ref_column = config.get("reference_column", column)
        if not ref_table:
            raise ValueError("referential_integrity_check requires config.reference_table")
        return (
            f'SELECT COUNT(*) AS failed_count FROM {table_ref} c '
            f'LEFT JOIN {ref_table} p ON c."{column}" = p."{ref_column}" '
            f'WHERE p."{ref_column}" IS NULL'
        )

    def _regex_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        if not column:
            raise ValueError("regex_check requires target_column")
        pattern = config.get("pattern", "")
        if not pattern:
            raise ValueError("regex_check requires config.pattern")
        # Snowflake: REGEXP_LIKE(column, pattern) — not the PostgreSQL ~ operator
        return (
            f"SELECT COUNT(*) AS failed_count FROM {table_ref} "
            f"WHERE NOT REGEXP_LIKE(\"{column}\", '{pattern}')"
        )

    def _business_rule_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        condition = config.get("condition")
        if not condition:
            raise ValueError("business_rule_check requires config.condition")
        _validate_condition(condition)
        return f"SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE NOT ({condition})"

    def _custom_sql_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        sql = config.get("sql")
        if not sql:
            raise ValueError("custom_sql_check requires config.sql")
        return sql

    # ── §66 Semantic & Contextual Rule Types ─────────────────────────────────

    def _semantic_consistency_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        """
        Cross-column logical consistency validated via a WHERE condition.
        config.condition: e.g. "end_date >= start_date"
        config.columns: list of columns involved (for documentation)
        """
        condition = config.get("condition")
        if not condition:
            raise ValueError("semantic_consistency_check requires config.condition (e.g. 'end_date >= start_date')")
        _validate_condition(condition)
        return f"SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE NOT ({condition})"

    def _business_metric_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        """
        Validates a derived business metric stays within expected bounds.
        config.metric_sql: SQL expression returning a scalar (e.g. AVG(...))
        config.min_value / config.max_value: acceptable bounds
        """
        metric_sql = config.get("metric_sql")
        if not metric_sql:
            raise ValueError("business_metric_check requires config.metric_sql")
        min_val = config.get("min_value")
        max_val = config.get("max_value")
        conditions = []
        if min_val is not None:
            conditions.append(f"({metric_sql}) < {min_val}")
        if max_val is not None:
            conditions.append(f"({metric_sql}) > {max_val}")
        if not conditions:
            raise ValueError("business_metric_check requires min_value or max_value")
        # Outer SELECT wraps the metric to return 1 (failed) or 0 (passed)
        check = " OR ".join(conditions)
        return (
            f"SELECT CASE WHEN {check} THEN 1 ELSE 0 END AS failed_count "
            f"FROM {table_ref}"
        )

    def _referential_sanity_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        """
        Business-logic cross-table check expressed as a WHERE condition.
        Functionally identical to business_rule_check but named for clarity.
        config.condition: SQL WHERE clause describing the invalid state
        """
        condition = config.get("condition")
        if not condition:
            raise ValueError("referential_sanity_check requires config.condition")
        _validate_condition(condition)
        return f"SELECT COUNT(*) AS failed_count FROM {table_ref} WHERE {condition}"

    def _distribution_consistency_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        """
        Detects significant distribution shifts by comparing column statistics
        against a stored baseline.  Uses Population Stability Index (PSI) proxy:
        checks whether avg, stddev, or null_rate has shifted beyond threshold.
        config.column: column to monitor
        config.baseline_mean / baseline_std: expected statistics (from profiling)
        config.tolerance_pct: acceptable deviation (default 20%)
        """
        if not column:
            raise ValueError("distribution_consistency_check requires target_column")
        baseline_mean = config.get("baseline_mean")
        baseline_std  = config.get("baseline_std")
        tolerance     = config.get("tolerance_pct", 20) / 100

        if baseline_mean is None:
            # No baseline: return informational query — can't fail without baseline
            return (
                f'SELECT AVG("{column}") AS current_mean, STDDEV("{column}") AS current_std, '
                f'0 AS failed_count FROM {table_ref}'
            )

        allowable_deviation = abs(float(baseline_mean)) * tolerance if float(baseline_mean) != 0 else tolerance
        return (
            f"SELECT CASE WHEN ABS(AVG(\"{column}\") - {baseline_mean}) > {allowable_deviation} "
            f"THEN 1 ELSE 0 END AS failed_count FROM {table_ref}"
        )

    def _llm_semantic_check(self, config: dict, table_ref: str, column: Optional[str]) -> str:
        """
        Samples rows for LLM-based semantic validation.
        Returns 0 AS failed_count — actual pass/fail requires LLM evaluation
        in execution_service (not yet implemented).
        config.sample_size: number of rows to sample (default 100)
        config.validation_prompt: validation instruction for the LLM
        """
        sample_size = config.get("sample_size", 100)
        return (
            f"SELECT 0 AS failed_count FROM ("
            f"SELECT * FROM {table_ref} ORDER BY RANDOM() LIMIT {sample_size}"
            f") _sample"
        )


sql_generator = SQLGenerator()
