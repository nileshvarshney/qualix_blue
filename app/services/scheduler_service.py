from __future__ import annotations
from typing import Optional
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from app.core.config import settings

logger = logging.getLogger("dq_platform.scheduler")

scheduler = AsyncIOScheduler(timezone=settings.default_timezone)


# ── Trigger builder ───────────────────────────────────────────────────────────

def build_trigger(frequency: str, cron_expr: Optional[str], timezone: str,
                  run_at_hour: int = 6, run_at_minute: int = 0) -> Optional[CronTrigger]:
    tz = timezone or settings.default_timezone
    if frequency == "on_demand":
        return None
    if frequency == "cron" and cron_expr:
        return CronTrigger.from_crontab(cron_expr, timezone=tz)
    if frequency == "hourly":
        return CronTrigger(minute=run_at_minute, timezone=tz)
    if frequency == "daily":
        return CronTrigger(hour=run_at_hour, minute=run_at_minute, timezone=tz)
    if frequency == "weekly":
        return CronTrigger(day_of_week="mon", hour=run_at_hour, minute=run_at_minute, timezone=tz)
    if frequency == "monthly":
        return CronTrigger(day=1, hour=run_at_hour, minute=run_at_minute, timezone=tz)
    return CronTrigger(hour=run_at_hour, minute=run_at_minute, timezone=tz)


# ── Job runner factory ────────────────────────────────────────────────────────

async def _run_rules_concurrently(
    rule_ids_to_run: list[str],
    already_scheduled: set[str],
    db,
    execute_rule,
) -> None:
    """Execute rules concurrently bounded by snowflake_pool_max_size."""
    max_concurrent = settings.snowflake_pool_max_size
    sem = asyncio.Semaphore(max_concurrent)

    async def _guarded(rid: str):
        async with sem:
            try:
                await execute_rule(rid, db)
            except Exception as e:
                logger.error("Rule %s failed during scheduled run: %s", rid, e)

    tasks = [_guarded(rid) for rid in rule_ids_to_run if rid not in already_scheduled]
    if tasks:
        await asyncio.gather(*tasks)


def _make_runner(schedule_id: str, rule_id: Optional[str], asset_id: Optional[str],
                 subdomain_id: Optional[str], domain_id: Optional[str],
                 rule_ids: Optional[list[str]] = None):
    async def run():
        from app.db.database import AsyncSessionLocal
        from app.db.models import DQRule, DQSchedule
        from app.services.execution_service import execute_rule, execute_asset_rules
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            try:
                # Rules already covered by an active rule-level schedule — skip to avoid duplicates
                rl_result = await db.execute(
                    select(DQSchedule).where(
                        DQSchedule.schedule_level == "rule",
                        DQSchedule.is_active == True,
                        DQSchedule.schedule_id != schedule_id,
                    )
                )
                already_scheduled = {s.rule_id for s in rl_result.scalars().all() if s.rule_id}

                if rule_id:
                    # Rule-level schedule — single rule, no concurrency needed
                    await execute_rule(rule_id, db)

                elif rule_ids:
                    # Explicit bundle — concurrent, skip duplicates
                    await _run_rules_concurrently(rule_ids, already_scheduled, db, execute_rule)

                elif asset_id:
                    asset_runs = await execute_asset_rules(asset_id, db)
                    skipped = [r.rule_id for r in asset_runs if r.rule_id in already_scheduled]
                    if skipped:
                        logger.debug("Skipped %d rule(s) with own rule-level schedule", len(skipped))

                elif subdomain_id:
                    result = await db.execute(
                        select(DQRule).where(DQRule.subdomain_id == subdomain_id, DQRule.is_active == True)
                    )
                    ids = [r.rule_id for r in result.scalars().all()]
                    await _run_rules_concurrently(ids, already_scheduled, db, execute_rule)

                elif domain_id:
                    result = await db.execute(
                        select(DQRule).where(DQRule.domain_id == domain_id, DQRule.is_active == True)
                    )
                    ids = [r.rule_id for r in result.scalars().all()]
                    await _run_rules_concurrently(ids, already_scheduled, db, execute_rule)

                else:
                    # Global schedule — all active rules, concurrent
                    result = await db.execute(select(DQRule).where(DQRule.is_active == True))
                    ids = [r.rule_id for r in result.scalars().all()]
                    await _run_rules_concurrently(ids, already_scheduled, db, execute_rule)

                logger.info("Scheduled job sched_%s completed", schedule_id)
            except Exception as e:
                logger.error("Scheduled job sched_%s failed: %s", schedule_id, e)
    return run


# ── Public API ────────────────────────────────────────────────────────────────

def register_schedule(schedule_id: str, rule_id: Optional[str], asset_id: Optional[str],
                      subdomain_id: Optional[str], domain_id: Optional[str],
                      frequency: str, cron_expr: Optional[str], timezone: str,
                      run_at_hour: int = 6, run_at_minute: int = 0,
                      rule_ids: Optional[list[str]] = None):
    """Add or replace an APScheduler job for the given schedule record."""
    job_id = f"sched_{schedule_id}"
    trigger = build_trigger(frequency, cron_expr, timezone, run_at_hour, run_at_minute)
    if trigger is None:
        logger.debug(f"Schedule {schedule_id} is on_demand — not registered")
        return

    runner = _make_runner(schedule_id, rule_id, asset_id, subdomain_id, domain_id, rule_ids)
    scheduler.add_job(runner, trigger=trigger, id=job_id, replace_existing=True)
    next_run = scheduler.get_job(job_id)
    next_str = next_run.next_run_time.isoformat() if next_run and next_run.next_run_time else "unknown"
    logger.info(f"Registered schedule {schedule_id} | {frequency} | next={next_str}")


def remove_schedule(schedule_id: str):
    job_id = f"sched_{schedule_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Removed schedule job {schedule_id}")


def get_next_run(schedule_id: str) -> Optional[str]:
    job = scheduler.get_job(f"sched_{schedule_id}")
    if job and job.next_run_time:
        return job.next_run_time.isoformat()
    return None


def list_jobs() -> list[dict]:
    return [
        {
            "job_id":        job.id,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger":       str(job.trigger),
        }
        for job in scheduler.get_jobs()
    ]


# ── Rule-ID JSON helpers ──────────────────────────────────────────────────────

def _rule_ids_to_db(rule_ids: Optional[list[str]]) -> Optional[str]:
    import json
    return json.dumps(rule_ids) if rule_ids else None


def _rule_ids_from_db(raw: Optional[str]) -> Optional[list[str]]:
    import json
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


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


async def _bg_evaluate_policies():
    from app.db.database import AsyncSessionLocal
    from app.services.governance_service import evaluate_policies
    async with AsyncSessionLocal() as db:
        await evaluate_policies(db)


async def _nightly_column_profile():
    """Re-profile all active assets nightly to keep column stats fresh."""
    import asyncio as _asyncio
    from app.db.database import AsyncSessionLocal
    from app.db.models import Asset
    from sqlalchemy import select as _select
    from app.api.columns import _run_column_profile
    from app.services import job_tracker

    async with AsyncSessionLocal() as db:
        result = await db.execute(_select(Asset).where(Asset.is_active == True))
        assets = result.scalars().all()

    logger.info("Nightly column profiling: scheduling %d assets", len(assets))
    for asset in assets:
        job_id = job_tracker.create_job(
            job_type="column_profile",
            total=0,
            meta={"asset_id": asset.asset_id, "trigger": "nightly_schedule"},
        )
        _asyncio.create_task(_run_column_profile(job_id, asset.asset_id))


async def _observability_tick() -> None:
    """Runs every 5 minutes: processes any continuous-monitoring connection
    whose configured interval has elapsed."""
    from app.db.database import AsyncSessionLocal
    from app.services.observability_engine import run_due_connections

    async with AsyncSessionLocal() as db:
        processed = await run_due_connections(db)
    if processed:
        logger.info("Observability tick: processed %d connection(s)", processed)


def _schedule_quality_aggregation_job(enabled: bool = True, hour: int = 0, minute: int = 5):
    """Register (or remove) the nightly quality-score aggregation job."""
    if not enabled:
        try:
            scheduler.remove_job("nightly_aggregate")
            logger.info("Quality aggregation job disabled — removed from scheduler")
        except Exception:
            pass
        return
    scheduler.add_job(
        _nightly_aggregate,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=settings.default_timezone),
        id="nightly_aggregate", replace_existing=True,
    )
    logger.info("Registered quality aggregation job (%02d:%02d %s)", hour, minute, settings.default_timezone)


def _schedule_policy_evaluation_job(enabled: bool = True, hour: int = 0, minute: int = 15):
    """Register (or remove) the nightly policy-evaluation job."""
    if not enabled:
        try:
            scheduler.remove_job("nightly_policy_evaluation")
            logger.info("Policy evaluation job disabled — removed from scheduler")
        except Exception:
            pass
        return
    scheduler.add_job(
        _bg_evaluate_policies,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=settings.default_timezone),
        id="nightly_policy_evaluation", replace_existing=True,
    )
    logger.info("Registered policy evaluation job (%02d:%02d %s)", hour, minute, settings.default_timezone)


def _schedule_column_profile_job(enabled: bool = True, hour: int = 2, minute: int = 0):
    """Register (or remove) the nightly column-profiling job.
    Called at startup and whenever the config is saved from the UI."""
    if not enabled:
        try:
            scheduler.remove_job("nightly_column_profile")
            logger.info("Column profiling job disabled — removed from scheduler")
        except Exception:
            pass
        return
    scheduler.add_job(
        _nightly_column_profile,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=settings.default_timezone),
        id="nightly_column_profile",
        replace_existing=True,
    )
    logger.info("Registered nightly column profiling job (%02d:%02d %s)", hour, minute, settings.default_timezone)


def _register_nightly_aggregation():
    """Register all nightly system jobs with their default schedules."""
    _schedule_quality_aggregation_job()  # default 00:05
    _schedule_column_profile_job()       # default 02:00
    # policy evaluation is handled by the 6h policy_evaluation_sweep in start_scheduler()


async def load_all_schedules(db):
    """Called on startup — registers every active DB schedule with APScheduler."""
    import json
    from app.db.models import DQSchedule
    from sqlalchemy import select
    result = await db.execute(
        select(DQSchedule).where(DQSchedule.is_active == True)
    )
    schedules = result.scalars().all()
    loaded = 0
    for s in schedules:
        if s.frequency == "on_demand":
            continue
        rule_ids = None
        if s.rule_ids:
            try:
                rule_ids = json.loads(s.rule_ids)
            except Exception:
                pass
        register_schedule(
            schedule_id=s.schedule_id,
            rule_id=s.rule_id,
            asset_id=s.asset_id,
            subdomain_id=s.subdomain_id,
            domain_id=s.domain_id,
            frequency=s.frequency,
            cron_expr=s.cron_expression,
            timezone=s.timezone or settings.default_timezone,
            run_at_hour=s.run_at_hour if s.run_at_hour is not None else 6,
            run_at_minute=s.run_at_minute if s.run_at_minute is not None else 0,
            rule_ids=rule_ids,
        )
        loaded += 1
    _register_nightly_aggregation()
    logger.info(f"Loaded {loaded} schedule(s) from database into APScheduler")


async def _nightly_collect_metrics() -> None:
    """Nightly job: collect row_count, freshness, null_rate for all active assets."""
    from app.db.database import AsyncSessionLocal
    from app.services.monitoring_service import collect_asset_metrics
    logger.info("Nightly metric collection starting")
    async with AsyncSessionLocal() as db:
        count = await collect_asset_metrics(db)
    logger.info("Nightly metric collection complete: %d rows written", count)


async def _nightly_predict_sla() -> None:
    """Nightly job: compute SLA breach forecasts for all assets with SLAConfig."""
    from app.db.database import AsyncSessionLocal
    from app.services.monitoring_service import predict_sla_breaches
    logger.info("Nightly SLA prediction starting")
    async with AsyncSessionLocal() as db:
        count = await predict_sla_breaches(db)
    logger.info("Nightly SLA prediction complete: %d predictions upserted", count)


async def _nightly_auto_discovery() -> None:
    """Nightly job: run asset discovery for every active Snowflake connection."""
    import asyncio as _asyncio
    from app.db.database import AsyncSessionLocal
    from app.db.models import SnowflakeConnection
    from sqlalchemy import select
    from app.api.connections import _open_connector
    from app.services.discovery_service import run_discovery
    from app.services import job_tracker

    logger.info("Nightly auto-discovery: starting")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.is_active == True)
        )
        connections = result.scalars().all()

    logger.info("Nightly auto-discovery: %d active connection(s)", len(connections))

    for conn in connections:
        try:
            filter_mode = conn.filter_mode or "exclude"
            excluded_db_set = set(conn.excluded_databases or [])
            excluded_schema_set = {
                (e["database"], e["schema"])
                for e in (conn.excluded_schemas or [])
            }
            included_db_set = set(conn.included_databases or [])
            included_schema_set = {
                (e["database"], e["schema"])
                for e in (conn.included_schemas or [])
            }

            def _browse_all_sync(
                _conn=conn,
                _filter_mode=filter_mode,
                _excluded_db_set=excluded_db_set,
                _excluded_schema_set=excluded_schema_set,
                _included_db_set=included_db_set,
                _included_schema_set=included_schema_set,
            ):
                sf = _open_connector(_conn)
                selections = []
                try:
                    cur = sf.cursor()
                    try:
                        cur.execute("SHOW DATABASES")
                        col_names = [d[0].lower() for d in cur.description]
                        dbs = [dict(zip(col_names, r)) for r in cur.fetchall()]
                        for db_info in dbs:
                            db_name = db_info.get("name", "")
                            if not db_name or db_name.upper() in ("SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA"):
                                continue
                            if _filter_mode == "include" and _included_db_set and db_name not in _included_db_set:
                                continue
                            if _filter_mode == "exclude" and db_name in _excluded_db_set:
                                continue
                            try:
                                cur.execute(f'SHOW SCHEMAS IN DATABASE "{db_name}"')
                                s_col_names = [d[0].lower() for d in cur.description]
                                for s in [dict(zip(s_col_names, r)) for r in cur.fetchall()]:
                                    schema_name = s.get("name", "")
                                    if not schema_name or schema_name.upper() == "INFORMATION_SCHEMA":
                                        continue
                                    if _filter_mode == "include" and _included_schema_set and (db_name, schema_name) not in _included_schema_set:
                                        continue
                                    if _filter_mode == "exclude" and (db_name, schema_name) in _excluded_schema_set:
                                        continue
                                    selections.append({"database": db_name, "schema": schema_name})
                            except Exception as schema_err:
                                logger.warning(
                                    "Auto-discovery: failed to list schemas for %s: %s", db_name, schema_err
                                )
                    finally:
                        cur.close()
                finally:
                    sf.close()
                return selections

            selections = await _asyncio.to_thread(_browse_all_sync)

            if not selections:
                logger.info("Auto-discovery: no selections for connection %s", conn.connection_id)
                continue

            job_id = job_tracker.create_job(
                job_type="discovery",
                total=len(selections),
                meta={"connection_id": conn.connection_id, "trigger": "nightly_auto_discovery"},
            )
            _asyncio.create_task(run_discovery(job_id, {
                "connection_id": conn.connection_id,
                "selections": selections,
                "triggered_by": "nightly_auto_discovery",
            }))
            logger.info(
                "Auto-discovery: job %s queued for connection %s (%d selections)",
                job_id, conn.connection_id, len(selections),
            )

        except Exception as e:
            logger.error("Auto-discovery failed for connection %s: %s", conn.connection_id, e)

    logger.info("Nightly auto-discovery: all jobs queued")


async def _run_policy_sweep() -> None:
    """APScheduler job — evaluate all policies and notify on new violations."""
    from app.db.database import AsyncSessionLocal
    from app.services.governance_service import evaluate_policies
    logger.info("Policy sweep starting")
    async with AsyncSessionLocal() as db:
        count = await evaluate_policies(db)
    logger.info("Policy sweep complete: %d violations", count)


async def _refresh_catalog_index() -> None:
    """Nightly job: refresh catalog_search_index materialized view."""
    import logging
    _log = logging.getLogger("dq_platform.catalog")
    from app.db.database import AsyncSessionLocal
    from app.services.catalog_service import refresh_search_index as _refresh
    try:
        async with AsyncSessionLocal() as db:
            ms = await _refresh(db)
        _log.info("Nightly catalog index refresh complete in %dms", ms)
    except Exception as exc:
        _log.error("Nightly catalog index refresh failed: %s", exc)


async def _bg_predict_all_assets() -> None:
    """Nightly job: run LLM quality prediction for all active assets."""
    import asyncio
    _log = logging.getLogger("dq_platform.prediction")
    try:
        from app.db.database import AsyncSessionLocal
        from app.db.models import Asset
        from app.services.ai_service import predict_asset_quality
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            assets_res = await db.execute(
                select(Asset.asset_id).where(Asset.is_active == True).limit(200)
            )
            asset_ids = assets_res.scalars().all()

        _log.info(f"Starting nightly quality prediction for {len(asset_ids)} assets")
        success = 0
        for asset_id in asset_ids:
            try:
                async with AsyncSessionLocal() as db:
                    result = await predict_asset_quality(asset_id, None, db)
                    if "error" not in result:
                        success += 1
            except Exception as exc:
                _log.warning(f"Prediction failed for asset {asset_id}: {exc}")
            await asyncio.sleep(0.5)

        _log.info(f"Nightly prediction complete: {success}/{len(asset_ids)} assets predicted")
    except Exception as exc:
        _log.error(f"Nightly prediction job failed: {exc}")


# ── Auto-schedule on approval ─────────────────────────────────────────────────

async def _find_best_time(db) -> tuple[int, int]:
    """Return (hour, minute) with the most room in the 6–10 AM window (max-gap)."""
    from app.db.models import DQSchedule
    from sqlalchemy import select

    WINDOW_START = 360   # 6:00 AM in minutes since midnight
    WINDOW_END   = 600   # 10:00 AM

    result = await db.execute(select(DQSchedule).where(DQSchedule.is_active == True))
    schedules = result.scalars().all()

    occupied = sorted({
        (s.run_at_hour or 6) * 60 + (s.run_at_minute or 0)
        for s in schedules
        if WINDOW_START <= (s.run_at_hour or 6) * 60 + (s.run_at_minute or 0) <= WINDOW_END
    })

    if not occupied:
        return (6, 0)

    boundaries = [WINDOW_START] + occupied + [WINDOW_END]
    best_gap, best_mid = 0, WINDOW_START
    for i in range(len(boundaries) - 1):
        gap = boundaries[i + 1] - boundaries[i]
        if gap > best_gap:
            best_gap = gap
            best_mid = (boundaries[i] + boundaries[i + 1]) // 2

    return (best_mid // 60, best_mid % 60)


async def ensure_table_schedule(rule, db) -> None:
    """Add rule to its asset's table-level schedule, creating one if needed."""
    import uuid
    from datetime import datetime, timezone
    from app.db.models import DQSchedule
    from sqlalchemy import select

    result = await db.execute(
        select(DQSchedule).where(
            DQSchedule.schedule_level == "table",
            DQSchedule.asset_id == rule.asset_id,
            DQSchedule.is_active == True,
        ).limit(1)
    )
    sched = result.scalar_one_or_none()

    if sched:
        rule_ids = _rule_ids_from_db(sched.rule_ids) or []
        if rule.rule_id in rule_ids:
            return
        rule_ids.append(rule.rule_id)
        sched.rule_ids = _rule_ids_to_db(rule_ids)
        sched.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(sched)
        await db.commit()
        register_schedule(
            schedule_id=sched.schedule_id,
            rule_id=None, asset_id=None, subdomain_id=None, domain_id=None,
            rule_ids=rule_ids,
            frequency=sched.frequency,
            cron_expr=sched.cron_expression,
            timezone=sched.timezone or settings.default_timezone,
            run_at_hour=sched.run_at_hour if sched.run_at_hour is not None else 6,
            run_at_minute=sched.run_at_minute if sched.run_at_minute is not None else 0,
        )
        logger.info("Added rule %s to existing table schedule %s", rule.rule_id, sched.schedule_id)
    else:
        hour, minute = await _find_best_time(db)
        schedule_id = str(uuid.uuid4())
        new_sched = DQSchedule(
            schedule_id=schedule_id,
            schedule_level="table",
            asset_id=rule.asset_id,
            domain_id=rule.domain_id,
            subdomain_id=rule.subdomain_id,
            frequency="daily",
            timezone=settings.default_timezone,
            run_at_hour=hour,
            run_at_minute=minute,
            rule_ids=_rule_ids_to_db([rule.rule_id]),
            is_active=True,
        )
        db.add(new_sched)
        await db.commit()
        await db.refresh(new_sched)
        register_schedule(
            schedule_id=schedule_id,
            rule_id=None, asset_id=None, subdomain_id=None, domain_id=None,
            rule_ids=[rule.rule_id],
            frequency="daily",
            cron_expr=None,
            timezone=settings.default_timezone,
            run_at_hour=hour,
            run_at_minute=minute,
        )
        logger.info(
            "Created table schedule %s for asset %s at %02d:%02d",
            schedule_id, rule.asset_id, hour, minute,
        )


async def remove_rule_from_table_schedule(rule_id: str, asset_id: str, db) -> None:
    """Remove a rule from its asset's table-level schedule; deactivate if empty."""
    from datetime import datetime, timezone
    from app.db.models import DQSchedule
    from sqlalchemy import select

    result = await db.execute(
        select(DQSchedule).where(
            DQSchedule.schedule_level == "table",
            DQSchedule.asset_id == asset_id,
            DQSchedule.is_active == True,
        ).limit(1)
    )
    sched = result.scalar_one_or_none()
    if not sched:
        return

    rule_ids = _rule_ids_from_db(sched.rule_ids) or []
    if rule_id not in rule_ids:
        return

    rule_ids.remove(rule_id)
    sched.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    if not rule_ids:
        sched.is_active = False
        db.add(sched)
        await db.commit()
        remove_schedule(sched.schedule_id)
        logger.info("Deactivated table schedule %s — no rules remain", sched.schedule_id)
    else:
        sched.rule_ids = _rule_ids_to_db(rule_ids)
        db.add(sched)
        await db.commit()
        register_schedule(
            schedule_id=sched.schedule_id,
            rule_id=None, asset_id=None, subdomain_id=None, domain_id=None,
            rule_ids=rule_ids,
            frequency=sched.frequency,
            cron_expr=sched.cron_expression,
            timezone=sched.timezone or settings.default_timezone,
            run_at_hour=sched.run_at_hour if sched.run_at_hour is not None else 6,
            run_at_minute=sched.run_at_minute if sched.run_at_minute is not None else 0,
        )
        logger.info("Removed rule %s from table schedule %s", rule_id, sched.schedule_id)


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")
        scheduler.add_job(
            _refresh_catalog_index,
            trigger=CronTrigger(hour=0, minute=30, timezone=settings.default_timezone),
            id="catalog_index_refresh",
            replace_existing=True,
        )
        scheduler.add_job(
            _bg_predict_all_assets,
            trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
            id="nightly_quality_prediction",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _nightly_auto_discovery,
            trigger=CronTrigger(hour=1, minute=0, timezone=settings.default_timezone),
            id="nightly_auto_discovery",
            replace_existing=True,
        )
        scheduler.add_job(
            _nightly_predict_sla,
            trigger=CronTrigger(hour=0, minute=10, timezone="UTC"),
            id="nightly_predict_sla",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _nightly_collect_metrics,
            trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
            id="nightly_collect_metrics",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _observability_tick,
            trigger=IntervalTrigger(minutes=5),
            id="observability_tick",
            replace_existing=True,
            misfire_grace_time=120,
        )
        from app.core.config import settings as _s
        sweep_hours = getattr(_s, "policy_eval_interval_hours", 6)
        scheduler.add_job(
            _run_policy_sweep,
            trigger=CronTrigger(hour=f"*/{sweep_hours}", timezone="UTC"),
            id="policy_evaluation_sweep",
            replace_existing=True,
        )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped")


# Legacy shims — kept so existing code that calls these doesn't break
def schedule_rule(rule_id: str, frequency: str, cron_expr: Optional[str] = None):
    register_schedule(rule_id, rule_id, None, None, None, frequency, cron_expr,
                      settings.default_timezone)


def remove_rule_job(rule_id: str):
    remove_schedule(rule_id)


# ── Scan Job scheduling ───────────────────────────────────────────────────────

def schedule_scan_job(job) -> None:
    """Register a scan job with APScheduler using its schedule_frequency."""
    trigger = build_trigger(
        frequency=job.schedule_frequency,
        cron_expr=job.cron_expr,
        timezone=job.timezone,
    )
    if trigger is None:
        return

    apscheduler_id = f"scan_job:{job.job_id}"
    scheduler.add_job(
        _make_scan_runner(job.job_id),
        trigger=trigger,
        id=apscheduler_id,
        replace_existing=True,
    )
    logger.info(
        "Scheduled scan job %s (%s) freq=%s", job.job_id, job.job_name, job.schedule_frequency
    )


def unschedule_scan_job(job_id: str) -> None:
    """Remove a scan job from APScheduler."""
    apscheduler_id = f"scan_job:{job_id}"
    if scheduler.get_job(apscheduler_id):
        scheduler.remove_job(apscheduler_id)
        logger.info("Unscheduled scan job %s", job_id)


def _make_scan_runner(job_id: str):
    async def run():
        from app.db.database import AsyncSessionLocal
        from app.services.scan_orchestrator import (
            create_run_for_scheduler,
            execute_run_with_retries,
        )
        async with AsyncSessionLocal() as db:
            try:
                run_id = await create_run_for_scheduler(job_id=job_id, db=db)
            except Exception as exc:
                logger.error(
                    "Could not create scheduled run for scan job %s: %s", job_id, exc
                )
                return
        await execute_run_with_retries(run_id)
    return run


async def load_all_scan_schedules(db) -> None:
    """Called at startup: register all active scheduled scan jobs with APScheduler."""
    from app.db.models import ScanJob
    from sqlalchemy import select

    result = await db.execute(
        select(ScanJob).where(
            ScanJob.is_active == True,
            ScanJob.schedule_frequency != "on_demand",
        )
    )
    jobs = result.scalars().all()
    for job in jobs:
        try:
            schedule_scan_job(job)
        except Exception as exc:
            logger.error("Failed to schedule scan job %s at startup: %s", job.job_id, exc)
    logger.info("Loaded %d scan job schedules at startup", len(jobs))
