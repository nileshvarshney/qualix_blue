from __future__ import annotations
from typing import Optional
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import DQRule, DataAsset, DQRuleRun, DQRuleRunSample, SnowflakeConnection
from app.services.sql_generator import sql_generator
from app.services.scoring_service import calculate_rule_quality_score
import uuid
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger("dq_platform.execution")

_EXECUTION_SEMAPHORE: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    """Return (or lazily create) the per-process concurrency limiter."""
    global _EXECUTION_SEMAPHORE
    if _EXECUTION_SEMAPHORE is None:
        from app.core.config import settings
        max_concurrent = getattr(settings, "snowflake_pool_max_size", 5)
        _EXECUTION_SEMAPHORE = asyncio.Semaphore(max_concurrent)
    return _EXECUTION_SEMAPHORE


class SnowflakeTransientError(Exception):
    """Raised for retryable Snowflake errors (network, timeout, etc.)."""


def _is_transient(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ["connection", "timeout", "network", "temporarily unavailable", "retry"])


def _gen_id() -> str:
    return str(uuid.uuid4())


def _build_table_ref(asset: DataAsset) -> str:
    parts = []
    if asset.sf_database_name:
        parts.append(f'"{asset.sf_database_name}"')
    parts.append(f'"{asset.sf_schema_name}"')
    parts.append(f'"{asset.sf_table_name}"')
    return ".".join(parts)


# ── Dynamic Snowflake executor (pooled) ──────────────────────────────────────

class _DynamicExecutor:
    """
    Wraps a SnowflakeConnection DB record into a pooled executor.

    Each unique (account, user, warehouse, role, database, schema) combination
    shares one SnowflakeConnectionPool so connections are reused across rule
    executions rather than opened and closed for every query.
    """

    def __init__(self, conn: SnowflakeConnection, database_override: Optional[str] = None):
        self._conn = conn
        self._database = database_override or conn.default_database or None

    def _build_connect_kwargs(self) -> dict:
        from app.core.encryption import decrypt
        kwargs: dict = dict(
            account=self._conn.account,
            user=self._conn.sf_user,
            password=decrypt(self._conn.password) or "",
            warehouse=self._conn.warehouse,
        )
        if self._conn.role:
            kwargs["role"] = self._conn.role
        if self._database:
            kwargs["database"] = self._database
        if self._conn.default_schema:
            kwargs["schema"] = self._conn.default_schema
        return kwargs

    def _get_pool(self):
        from app.core.config import settings
        from app.db.snowflake_pool import get_or_create_pool
        return get_or_create_pool(
            self._build_connect_kwargs(),
            min_size=settings.snowflake_pool_min_size,
            max_size=settings.snowflake_pool_max_size,
            acquire_timeout=settings.snowflake_pool_acquire_timeout,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type(SnowflakeTransientError),
        reraise=True,
    )
    def execute_query(self, sql: str) -> list[dict]:
        """Synchronous execution — uses a pooled connection."""
        from app.core.config import settings
        try:
            return self._get_pool().execute_query(sql, session_timeout=settings.execution_timeout_seconds)
        except Exception as e:
            if _is_transient(e):
                logger.warning(f"Transient Snowflake error (will retry): {e}")
                raise SnowflakeTransientError(str(e)) from e
            raise

    async def aexecute_query(self, sql: str) -> list[dict]:
        """Async execution — runs the blocking pool call in a thread."""
        from app.core.config import settings
        try:
            return await self._get_pool().aexecute_query(sql, session_timeout=settings.execution_timeout_seconds)
        except Exception as e:
            if _is_transient(e):
                logger.warning(f"Transient Snowflake error: {e}")
                raise SnowflakeTransientError(str(e)) from e
            raise

    def get_table_row_count(self, database: str, schema: str, table: str) -> int:
        db_prefix = f'"{database}".' if database else ""
        sql = f'SELECT COUNT(*) AS cnt FROM {db_prefix}"{schema}"."{table}"'
        rows = self.execute_query(sql)
        return int(rows[0]["cnt"]) if rows else 0

    async def aget_table_row_count(self, database: str, schema: str, table: str) -> int:
        db_prefix = f'"{database}".' if database else ""
        sql = f'SELECT COUNT(*) AS cnt FROM {db_prefix}"{schema}"."{table}"'
        rows = await self.aexecute_query(sql)
        return int(rows[0]["cnt"]) if rows else 0


async def _resolve_executor(asset: DataAsset, db: AsyncSession, database: Optional[str] = None):
    """
    Returns a Snowflake executor by looking up:
      1. The connection saved on the asset (connection_id)
      2. Any single active connection in the DB
      3. The env-var-based global client (legacy)
    Raises RuntimeError with a clear message if nothing is configured.
    """
    conn_record: Optional[SnowflakeConnection] = None

    if asset.connection_id:
        res = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.connection_id == asset.connection_id)
        )
        conn_record = res.scalar_one_or_none()
        if conn_record:
            logger.debug(f"Using asset connection '{conn_record.connection_name}' for {asset.sf_table_name}")

    if not conn_record:
        res = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.is_active == True).limit(2)
        )
        active = res.scalars().all()
        if len(active) == 1:
            conn_record = active[0]
            logger.debug(f"Auto-selected only active connection '{conn_record.connection_name}'")
        elif len(active) > 1:
            raise RuntimeError(
                f"Multiple Snowflake connections exist but asset '{asset.sf_table_name}' has no connection assigned. "
                "Edit the asset and set a connection, or go to Data Assets → Register Table and re-register it using Browse Snowflake."
            )

    if not conn_record:
        # Fallback: look for the designated primary target connection
        primary_res = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
        )
        conn_record = primary_res.scalar_one_or_none()
        if conn_record:
            logger.debug(f"Using primary target connection '{conn_record.connection_name}'")

    if not conn_record:
        raise RuntimeError(
            "No Snowflake target connection configured. "
            "Go to Settings → Target Database and add a connection."
        )

    if not conn_record.password:
        raise RuntimeError(
            f"Snowflake connection '{conn_record.connection_name}' has no password saved. "
            "Edit the connection in Settings → Snowflake and add a password."
        )

    return _DynamicExecutor(conn_record, database_override=database)


# ── Rule execution ─────────────────────────────────────────────────────────────

async def _llm_semantic_validate(
    rule: "DQRule",
    sample_rows: list[dict],
    db: "AsyncSession",
) -> int:
    """Call LLM to count how many sampled rows fail an llm_semantic_check rule."""
    if not sample_rows:
        return 0
    config = rule.rule_config or {}
    validation_prompt = config.get(
        "validation_prompt",
        f"Check if each row violates: {rule.rule_description or rule.rule_name}"
    )
    rows_text = "\n".join(str(r) for r in sample_rows[:20])
    prompt = (
        f"Validation rule: {validation_prompt}\n\n"
        f"Rows to check ({len(sample_rows)} rows):\n{rows_text}\n\n"
        f"Return ONLY a JSON object: {{\"failed_count\": <integer>, \"reason\": \"<brief explanation>\"}}"
    )
    sys_semantic = (
        "You are a data quality validator. Given rows of data and a validation rule, "
        "count how many rows FAIL the rule. Return only valid JSON."
    )
    try:
        from app.services.llm_providers import get_provider_from_db
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as llm_db:
            provider = await get_provider_from_db(None, llm_db)
        import json as _j
        raw = await provider.complete(prompt, sys_semantic, max_tokens=200)
        start = raw.find("{"); end = raw.rfind("}") + 1
        result = _j.loads(raw[start:end]) if start >= 0 else {}
        return int(result.get("failed_count", 0))
    except Exception as e:
        logger.warning(f"LLM semantic validation failed for rule {rule.rule_id}: {e}")
        return 0


async def execute_rule(rule_id: str, db: AsyncSession, user_email: str = "system") -> DQRuleRun:
    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise ValueError(f"Rule {rule_id} not found")
    if not rule.is_active:
        raise ValueError(f"Rule {rule_id} is not active")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == rule.asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise ValueError(f"Asset {rule.asset_id} not found")

    table_ref = _build_table_ref(asset)
    config = rule.rule_config or {}

    # Generate SQL
    try:
        sql = rule.rule_sql or sql_generator.generate(rule.rule_type, config, table_ref, rule.target_column)
    except Exception as e:
        logger.error(f"SQL generation failed for rule {rule_id}: {e}")
        return await _save_error_run(db, rule, asset, f"SQL generation error: {e}")

    # Resolve executor — pass asset database so the session has the right context
    try:
        executor = await _resolve_executor(asset, db, database=asset.sf_database_name or None)
    except RuntimeError as e:
        logger.warning(f"Rule {rule_id} — no Snowflake connection: {e}")
        return await _save_error_run(db, rule, asset, str(e), sql=sql)

    start = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        # Use async execution so the event loop is not blocked during Snowflake I/O.
        # _DynamicExecutor.aexecute_query runs the blocking connector call in a thread.
        if hasattr(executor, "aexecute_query"):
            rows = await executor.aexecute_query(sql)
        else:
            rows = await asyncio.to_thread(executor.execute_query, sql)
        end = datetime.now(timezone.utc).replace(tzinfo=None)

        failed_count = 0
        total_count = 0
        current_row_count = None

        if rows:
            row = rows[0]
            if "failed_count" in row:
                failed_count = int(row["failed_count"] or 0)
            if "total_count" in row:
                total_count = int(row["total_count"] or 0)
            elif "current_row_count" in row:
                current_row_count = int(row["current_row_count"] or 0)
                total_count = current_row_count

        if total_count == 0:
            if hasattr(executor, "aget_table_row_count"):
                total_count = await executor.aget_table_row_count(
                    asset.sf_database_name or "", asset.sf_schema_name, asset.sf_table_name
                )
            else:
                total_count = await asyncio.to_thread(
                    executor.get_table_row_count,
                    asset.sf_database_name or "", asset.sf_schema_name, asset.sf_table_name
                )

        # Volume check: compare against historical average if no threshold was set
        if rule.rule_type == "volume_check" and current_row_count is not None:
            config = rule.rule_config or {}
            if config.get("min_rows") is None and config.get("max_rows") is None:
                failed_count = await _volume_baseline_check(rule.rule_id, current_row_count, db)

        # llm_semantic_check: SQL samples failing rows; LLM validates them
        if rule.rule_type == "llm_semantic_check" and rows:
            sample_rows = [dict(r) for r in rows]
            failed_count = await _llm_semantic_validate(rule, sample_rows, db)
            total_count = total_count or len(sample_rows)

        passed_count = max(0, total_count - failed_count)
        failure_pct = (failed_count / total_count * 100) if total_count > 0 else 0.0
        quality_score = calculate_rule_quality_score(total_count, failed_count)
        status = "passed" if failed_count == 0 else ("warning" if rule.severity == "low" else "failed")

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
        return run

    except Exception as e:
        end = datetime.now(timezone.utc).replace(tzinfo=None)
        logger.error(f"Rule {rule_id} execution error: {e}")
        run = await _save_error_run(db, rule, asset, str(e), start, end, locals().get("sql"))
        from app.services.alert_service import create_alert_if_needed
        await create_alert_if_needed(run, rule, db)
        return run


async def _volume_baseline_check(rule_id: str, current_count: int, db: AsyncSession) -> int:
    """
    Compare current row count against the historical average from the last 7 runs.
    Returns 1 (fail) if the count deviates more than 30% from the average, else 0.
    """
    from sqlalchemy import desc as sqldesc
    result = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == rule_id, DQRuleRun.status == "passed")
        .order_by(sqldesc(DQRuleRun.created_at))
        .limit(7)
    )
    past_runs = result.scalars().all()
    if len(past_runs) < 3:
        return 0  # Not enough history yet — pass
    avg = sum(r.total_rows_scanned for r in past_runs if r.total_rows_scanned) / len(past_runs)
    if avg == 0:
        return 0
    deviation = abs(current_count - avg) / avg
    if deviation > 0.30:
        logger.info(f"Volume baseline check failed: current={current_count}, avg={avg:.0f}, deviation={deviation:.1%}")
        return 1
    return 0


async def _save_error_run(
    db: AsyncSession, rule: DQRule, asset: DataAsset,
    error_msg: str, start: Optional[datetime] = None, end: Optional[datetime] = None,
    sql: Optional[str] = None,
) -> DQRuleRun:
    run = DQRuleRun(
        run_id=_gen_id(),
        rule_id=rule.rule_id,
        asset_id=asset.asset_id,
        domain_id=rule.domain_id,
        subdomain_id=rule.subdomain_id,
        execution_start_time=start or datetime.now(timezone.utc).replace(tzinfo=None),
        execution_end_time=end or datetime.now(timezone.utc).replace(tzinfo=None),
        status="error",
        error_message=error_msg,
        executed_sql=sql,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def execute_asset_rules(asset_id: str, db: AsyncSession) -> list[DQRuleRun]:
    result = await db.execute(
        select(DQRule).where(DQRule.asset_id == asset_id, DQRule.is_active == True)
    )
    rules = result.scalars().all()

    semaphore = _get_semaphore()

    async def _run_one(rule: DQRule) -> Optional[DQRuleRun]:
        async with semaphore:
            try:
                return await execute_rule(rule.rule_id, db)
            except Exception as e:
                logger.error(f"Failed to execute rule {rule.rule_id}: {e}")
                return None

    results = await asyncio.gather(*[_run_one(r) for r in rules])
    runs = [r for r in results if r is not None]

    if runs:
        try:
            from app.services.scoring_service import aggregate_quality_scores
            await aggregate_quality_scores(db)
        except Exception as e:
            logger.error(f"Quality score aggregation failed: {e}")

    return runs
