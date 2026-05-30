from __future__ import annotations
from typing import Optional
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import AppConfig
from app.core.encryption import encrypt, decrypt
from app.core.config import settings

logger = logging.getLogger("dq_platform.config")

MASKED = "***MASKED***"

# All platform-managed config keys with their defaults and metadata
CONFIG_DEFAULTS: list[dict] = [
    # General
    {"category": "general", "key": "app_name", "value": "Data Quality Platform", "is_secret": False, "description": "Display name shown in the UI and API"},
    {"category": "general", "key": "app_env", "value": "local", "is_secret": False, "description": "Environment: local, staging, or production"},
    {"category": "general", "key": "debug", "value": "true", "is_secret": False, "description": "Enable verbose SQL query logging (true/false)"},
    {"category": "general", "key": "display_timezone", "value": "America/Los_Angeles", "is_secret": False, "description": "Timezone used to display all timestamps across the UI"},

    # Platform Snowflake connection (app's own tables — seeded from env vars on first boot)
    {"category": "platform_connection", "key": "sf_platform_account",   "value": settings.sf_platform_account,  "is_secret": False, "description": "Snowflake account identifier for the platform DB (e.g. myorg-myaccount)"},
    {"category": "platform_connection", "key": "sf_platform_user",      "value": settings.sf_platform_user,     "is_secret": False, "description": "Snowflake username for the platform service account"},
    {"category": "platform_connection", "key": "sf_platform_password",  "value": settings.sf_platform_password, "is_secret": True,  "description": "Snowflake password for the platform service account"},
    {"category": "platform_connection", "key": "sf_platform_warehouse", "value": settings.sf_platform_warehouse,"is_secret": False, "description": "Snowflake warehouse used by the platform"},
    {"category": "platform_connection", "key": "sf_platform_role",      "value": settings.sf_platform_role,     "is_secret": False, "description": "Snowflake role for the platform service account"},
    {"category": "platform_connection", "key": "snowflake_app_database","value": settings.snowflake_app_database,"is_secret": False, "description": "Database where platform tables (rules, runs, users, etc.) are stored"},
    {"category": "platform_connection", "key": "snowflake_app_schema",  "value": settings.snowflake_app_schema, "is_secret": False, "description": "Schema within the platform database"},

    # LLM
    {"category": "llm", "key": "llm_provider", "value": "ollama", "is_secret": False, "description": "Active LLM provider: ollama, openai, claude, gemini_flash"},
    {"category": "llm", "key": "ollama_base_url", "value": "", "is_secret": False, "description": "Base URL for the Ollama API server"},
    {"category": "llm", "key": "ollama_model", "value": "qwen2.5:7b-instruct", "is_secret": False, "description": "Ollama model name (run 'ollama list' to see available models)"},
    {"category": "llm", "key": "openai_api_key", "value": "", "is_secret": True, "description": "OpenAI API key (starts with sk- or sk-proj-)"},
    {"category": "llm", "key": "openai_model", "value": "gpt-4o-mini", "is_secret": False, "description": "OpenAI model name"},
    {"category": "llm", "key": "anthropic_api_key", "value": "", "is_secret": True, "description": "Anthropic API key (starts with sk-ant-)"},
    {"category": "llm", "key": "claude_model", "value": "claude-3-5-sonnet-latest", "is_secret": False, "description": "Claude model name"},
    {"category": "llm", "key": "gemini_api_key", "value": "", "is_secret": True, "description": "Google AI API key (starts with AIza)"},
    {"category": "llm", "key": "gemini_model", "value": "gemini-2.5-flash", "is_secret": False, "description": "Gemini model name"},

    # Notifications
    {"category": "notifications", "key": "slack_webhook_url",          "value": "", "is_secret": True,  "description": "Global Slack incoming webhook URL"},
    {"category": "notifications", "key": "teams_webhook_url",          "value": "", "is_secret": True,  "description": "Microsoft Teams incoming webhook URL"},
    {"category": "notifications", "key": "pagerduty_integration_key",  "value": "", "is_secret": True,  "description": "PagerDuty Events API v2 integration key"},
    {"category": "notifications", "key": "alert_webhook_url",          "value": "", "is_secret": False, "description": "Generic JSON webhook URL for alert dispatch"},
    {"category": "notifications", "key": "alert_email_recipients",     "value": "", "is_secret": False, "description": "Comma-separated fallback alert email recipients"},
    {"category": "notifications", "key": "smtp_host",                  "value": "", "is_secret": False, "description": "SMTP server hostname"},
    {"category": "notifications", "key": "smtp_port",                  "value": "587", "is_secret": False, "description": "SMTP server port"},
    {"category": "notifications", "key": "smtp_user",                  "value": "", "is_secret": False, "description": "SMTP username"},
    {"category": "notifications", "key": "smtp_password",              "value": "", "is_secret": True,  "description": "SMTP password"},
    {"category": "notifications", "key": "smtp_from_email",            "value": "dq-platform@example.com", "is_secret": False, "description": "From address for alert emails"},
    # Scheduler
    {"category": "scheduler", "key": "default_timezone",          "value": "America/Los_Angeles", "is_secret": False, "description": "Default timezone for all scheduled rule runs"},
    {"category": "scheduler", "key": "scheduler_type",            "value": "apscheduler",         "is_secret": False, "description": "Scheduler backend (apscheduler)"},
    {"category": "scheduler", "key": "scheduler_enabled",         "value": "true",                "is_secret": False, "description": "Enable or disable the background scheduler entirely"},
    {"category": "scheduler", "key": "global_schedule_frequency", "value": "daily",               "is_secret": False, "description": "Global default schedule frequency: hourly, daily, weekly, monthly, cron, on_demand"},
    {"category": "scheduler", "key": "global_schedule_cron",      "value": "0 6 * * *",           "is_secret": False, "description": "Cron expression for global schedule when frequency=cron (default: 6 AM daily)"},

    # Governance
    {"category": "governance_config", "key": "auto_certify_enabled",       "value": "false", "is_secret": False, "description": "Automatically certify tables that meet quality thresholds for a consecutive period"},
    {"category": "governance_config", "key": "auto_certify_min_score",     "value": "95",    "is_secret": False, "description": "Minimum quality score (%) a table must sustain to be auto-certified"},
    {"category": "governance_config", "key": "auto_certify_min_rule_count","value": "3",     "is_secret": False, "description": "Minimum number of active passing rules required for auto-certification"},
    {"category": "governance_config", "key": "cert_required_after_days",   "value": "30",    "is_secret": False, "description": "Days after registration before a table is flagged as uncertified by policy"},

    # Quality Thresholds — used by dashboards and SLA breach detection
    {"category": "quality", "key": "sla_threshold",     "value": "95", "is_secret": False, "description": "Global SLA floor (%). Quality score below this triggers a breach and turns score red."},
    {"category": "quality", "key": "warning_threshold", "value": "85", "is_secret": False, "description": "Global warning level (%). Score below this turns score yellow before hitting SLA floor."},
    {"category": "quality", "key": "critical_penalty",  "value": "25", "is_secret": False, "description": "Points deducted from aggregate score per critical rule failure."},
    {"category": "quality", "key": "high_penalty",      "value": "15", "is_secret": False, "description": "Points deducted per high severity rule failure."},
    {"category": "quality", "key": "medium_penalty",    "value": "7",  "is_secret": False, "description": "Points deducted per medium severity rule failure."},
    {"category": "quality", "key": "low_penalty",       "value": "3",  "is_secret": False, "description": "Points deducted per low severity rule failure."},
]


def _first_by_key(result) -> "Optional[AppConfig]":
    """Return the first row from a query result, safe when duplicates exist."""
    return result.scalars().first()


async def seed_config(db: AsyncSession):
    # Remove duplicate keys first (keep the newest updated_at per key)
    all_res = await db.execute(select(AppConfig).order_by(AppConfig.key, AppConfig.updated_at.desc()))
    seen: set[str] = set()
    for row in all_res.scalars().all():
        if row.key in seen:
            await db.delete(row)
        else:
            seen.add(row.key)
    if seen:
        await db.flush()

    for item in CONFIG_DEFAULTS:
        if item["key"] not in seen:
            db.add(AppConfig(config_id=str(uuid.uuid4()), updated_at=datetime.now(timezone.utc).replace(tzinfo=None), **item))
            await db.flush()
    await db.commit()


async def get_all(db: AsyncSession) -> list[AppConfig]:
    result = await db.execute(select(AppConfig).order_by(AppConfig.category, AppConfig.key, AppConfig.updated_at.desc()))
    seen: set[str] = set()
    rows = []
    for row in result.scalars().all():
        if row.key not in seen:
            seen.add(row.key)
            rows.append(row)
    return rows


async def get_by_category(category: str, db: AsyncSession) -> list[AppConfig]:
    result = await db.execute(
        select(AppConfig).where(AppConfig.category == category).order_by(AppConfig.key, AppConfig.updated_at.desc())
    )
    seen: set[str] = set()
    rows = []
    for row in result.scalars().all():
        if row.key not in seen:
            seen.add(row.key)
            rows.append(row)
    return rows


async def get_value(key: str, db: AsyncSession) -> Optional[str]:
    """Return the config value, decrypting it if it is marked secret."""
    result = await db.execute(select(AppConfig).where(AppConfig.key == key).order_by(AppConfig.updated_at.desc()))
    row = _first_by_key(result)
    if row is None:
        return None
    if row.is_secret and row.value:
        return decrypt(row.value)
    return row.value


async def set_value(key: str, value: str, user: str, db: AsyncSession) -> AppConfig:
    result = await db.execute(select(AppConfig).where(AppConfig.key == key).order_by(AppConfig.updated_at.desc()))
    row = _first_by_key(result)
    if not row:
        raise ValueError(f"Unknown config key: {key}")
    if value != MASKED:
        row.value = encrypt(value) if row.is_secret and value else value
        row.updated_by = user
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()
        await db.refresh(row)
    return row


async def bulk_update(updates: dict[str, str], user: str, db: AsyncSession) -> list[AppConfig]:
    updated = []
    for key, value in updates.items():
        if value == MASKED:
            continue
        result = await db.execute(select(AppConfig).where(AppConfig.key == key).order_by(AppConfig.updated_at.desc()))
        row = _first_by_key(result)
        if row:
            row.value = encrypt(value) if row.is_secret and value else value
            row.updated_by = user
            row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            updated.append(row)
    await db.commit()
    return updated


def mask(row: AppConfig) -> dict:
    return {
        "config_id": row.config_id,
        "category": row.category,
        "key": row.key,
        "value": MASKED if row.is_secret and row.value else row.value,
        "is_secret": row.is_secret,
        "description": row.description,
        "updated_by": row.updated_by,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "has_value": bool(row.value),
    }
