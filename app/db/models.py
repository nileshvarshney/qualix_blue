from __future__ import annotations

import json as _json
import uuid
from datetime import datetime, timezone, date
from typing import Optional
from snowflake.sqlalchemy import VARIANT
from sqlalchemy import (
    String, Boolean, Float, Integer, BigInteger, SmallInteger, Text, DateTime,
    ForeignKey, Date, UniqueConstraint,
)
from sqlalchemy import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class JSONVariant(TypeDecorator):
    """VARIANT column that transparently handles Python dicts/lists.

    Snowflake rejects plain VARCHAR for VARIANT columns, so we:
    - serialize dict/list → JSON string on bind
    - wrap the bind expression with PARSE_JSON() so Snowflake accepts it
    - deserialize VARIANT → Python dict/list on read (connector returns dict directly)
    """
    impl = VARIANT
    cache_ok = True

    def bind_expression(self, bindvalue):
        from sqlalchemy import func, case
        # Snowflake rejects parse_json(null) in VALUES — only wrap non-null values
        return case((bindvalue.is_(None), None), else_=func.parse_json(bindvalue))

    def process_bind_param(self, value, dialect):
        if value is not None:
            return _json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            try:
                return _json.loads(value)
            except (ValueError, TypeError):
                return value
        return value


def gen_uuid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="viewer")
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # OAuth2 / SSO
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    oauth_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Domain(Base):
    __tablename__ = "domains"

    domain_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    domain_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    owner_name: Mapped[Optional[str]] = mapped_column(String(200))
    owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    subdomains: Mapped[list["Subdomain"]] = relationship("Subdomain", back_populates="domain")
    assets: Mapped[list["DataAsset"]] = relationship("DataAsset", back_populates="domain")
    rules: Mapped[list["DQRule"]] = relationship("DQRule", back_populates="domain")


class Subdomain(Base):
    __tablename__ = "subdomains"
    __table_args__ = (
        UniqueConstraint("domain_id", "subdomain_name", name="uq_subdomain_name_per_domain"),
    )

    subdomain_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    subdomain_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    owner_name: Mapped[Optional[str]] = mapped_column(String(200))
    owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    domain: Mapped["Domain"] = relationship("Domain", back_populates="subdomains")
    assets: Mapped[list["DataAsset"]] = relationship("DataAsset", back_populates="subdomain")
    rules: Mapped[list["DQRule"]] = relationship("DQRule", back_populates="subdomain")


class DataAsset(Base):
    __tablename__ = "data_assets"

    asset_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    subdomain_id: Mapped[str] = mapped_column(String(36), ForeignKey("subdomains.subdomain_id"), nullable=False)
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    snowflake_account: Mapped[Optional[str]] = mapped_column(String(200))
    sf_database_name: Mapped[Optional[str]] = mapped_column(String(200))
    sf_schema_name: Mapped[str] = mapped_column(String(200), nullable=False)
    sf_table_name: Mapped[str] = mapped_column(String(200), nullable=False)
    table_type: Mapped[Optional[str]] = mapped_column(String(50))
    table_description: Mapped[Optional[str]] = mapped_column(Text)
    view_definition: Mapped[Optional[str]] = mapped_column(Text)
    owner_name: Mapped[Optional[str]] = mapped_column(String(200))
    owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    technical_owner_name: Mapped[Optional[str]] = mapped_column(String(200))
    technical_owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    criticality: Mapped[str] = mapped_column(String(20), default="medium")
    certification_status: Mapped[str] = mapped_column(String(20), default="uncertified")
    certified_by: Mapped[Optional[str]] = mapped_column(String(200))
    certified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    domain: Mapped["Domain"] = relationship("Domain", back_populates="assets")
    subdomain: Mapped["Subdomain"] = relationship("Subdomain", back_populates="assets")
    rules: Mapped[list["DQRule"]] = relationship("DQRule", back_populates="asset")
    rule_runs: Mapped[list["DQRuleRun"]] = relationship("DQRuleRun", back_populates="asset")


class RuleTag(Base):
    __tablename__ = "rule_tags"

    tag_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=False)
    tag_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    rule: Mapped["DQRule"] = relationship("DQRule", back_populates="tags")


class SLAConfig(Base):
    __tablename__ = "sla_configs"

    sla_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    min_quality_score: Mapped[float] = mapped_column(Float, default=95.0)
    max_failure_pct: Mapped[float] = mapped_column(Float, default=5.0)
    alert_on_breach: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_emails: Mapped[Optional[str]] = mapped_column(Text)
    notification_slack_channel: Mapped[Optional[str]] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class DQRule(Base):
    __tablename__ = "dq_rules"

    rule_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_description: Mapped[Optional[str]] = mapped_column(Text)
    domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    subdomain_id: Mapped[str] = mapped_column(String(36), ForeignKey("subdomains.subdomain_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    rule_category: Mapped[Optional[str]] = mapped_column(String(50))
    target_column: Mapped[Optional[str]] = mapped_column(String(200))
    rule_sql: Mapped[Optional[str]] = mapped_column(Text)
    rule_config: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(30), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    sla_threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    approved_by: Mapped[Optional[str]] = mapped_column(String(200))
    rejected_by: Mapped[Optional[str]] = mapped_column(String(200))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    business_owner_name: Mapped[Optional[str]] = mapped_column(String(200))
    business_owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    domain: Mapped["Domain"] = relationship("Domain", back_populates="rules")
    subdomain: Mapped["Subdomain"] = relationship("Subdomain", back_populates="rules")
    asset: Mapped["DataAsset"] = relationship("DataAsset", back_populates="rules")
    rule_runs: Mapped[list["DQRuleRun"]] = relationship("DQRuleRun", back_populates="rule")
    schedules: Mapped[list["DQSchedule"]] = relationship("DQSchedule", back_populates="rule")
    tags: Mapped[list["RuleTag"]] = relationship("RuleTag", back_populates="rule", cascade="all, delete-orphan")


class RuleVersion(Base):
    """Immutable snapshot of a rule taken before each update."""
    __tablename__ = "rule_versions"

    version_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_description: Mapped[Optional[str]] = mapped_column(Text)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_column: Mapped[Optional[str]] = mapped_column(String(200))
    rule_sql: Mapped[Optional[str]] = mapped_column(Text)
    rule_config: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by: Mapped[Optional[str]] = mapped_column(String(200))
    change_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DQSchedule(Base):
    __tablename__ = "dq_schedules"

    schedule_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"))
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("data_assets.asset_id"))
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("subdomains.subdomain_id"))
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"))
    schedule_level: Mapped[str] = mapped_column(String(20), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    cron_expression: Mapped[Optional[str]] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(50), default="America/Los_Angeles")
    run_at_hour: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    run_at_minute: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    # Explicit rule bundle for non-rule-level schedules (JSON list of rule_ids).
    # When set, only these rules execute — new rules are NOT auto-added.
    rule_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    rule: Mapped[Optional["DQRule"]] = relationship("DQRule", back_populates="schedules")


class DQRuleRun(Base):
    __tablename__ = "dq_rule_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    subdomain_id: Mapped[str] = mapped_column(String(36), ForeignKey("subdomains.subdomain_id"), nullable=False)
    execution_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    execution_end_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    total_rows_scanned: Mapped[Optional[int]] = mapped_column(Integer)
    failed_rows_count: Mapped[Optional[int]] = mapped_column(Integer)
    passed_rows_count: Mapped[Optional[int]] = mapped_column(Integer)
    failure_percentage: Mapped[Optional[float]] = mapped_column(Float)
    quality_score: Mapped[Optional[float]] = mapped_column(Float)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    executed_sql: Mapped[Optional[str]] = mapped_column(Text)
    ai_explanation: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    rule: Mapped["DQRule"] = relationship("DQRule", back_populates="rule_runs")
    asset: Mapped["DataAsset"] = relationship("DataAsset", back_populates="rule_runs")
    samples: Mapped[list["DQRuleRunSample"]] = relationship("DQRuleRunSample", back_populates="run")


class DQRuleRunSample(Base):
    __tablename__ = "dq_rule_run_samples"

    sample_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rule_runs.run_id"), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=False)
    failed_record: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["DQRuleRun"] = relationship("DQRuleRun", back_populates="samples")


class DQQualityScore(Base):
    __tablename__ = "dq_quality_scores"

    score_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    score_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    score_level: Mapped[str] = mapped_column(String(20), nullable=False)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36))
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36))
    asset_id: Mapped[Optional[str]] = mapped_column(String(36))
    total_rules: Mapped[int] = mapped_column(Integer, default=0)
    passed_rules: Mapped[int] = mapped_column(Integer, default=0)
    failed_rules: Mapped[int] = mapped_column(Integer, default=0)
    warning_rules: Mapped[int] = mapped_column(Integer, default=0)
    error_rules: Mapped[int] = mapped_column(Integer, default=0)
    quality_score: Mapped[float] = mapped_column(Float, default=100.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DQAlert(Base):
    __tablename__ = "dq_alerts"

    alert_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    domain_id: Mapped[str] = mapped_column(String(36), nullable=False)
    subdomain_id: Mapped[str] = mapped_column(String(36), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(30), nullable=False, default="rule_failure")
    drift_asset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    alert_status: Mapped[str] = mapped_column(String(20), default="open")
    alert_message: Mapped[Optional[str]] = mapped_column(Text)
    notified_to: Mapped[Optional[str]] = mapped_column(String(500))
    notification_channel: Mapped[Optional[str]] = mapped_column(String(50))
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class SchemaBaseline(Base):
    __tablename__ = "schema_baselines"

    baseline_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    columns_snapshot: Mapped[Optional[list]] = mapped_column(JSONVariant)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SchemaDriftEvent(Base):
    __tablename__ = "schema_drift_events"

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), nullable=False)
    baseline_id: Mapped[str] = mapped_column(String(36), ForeignKey("schema_baselines.baseline_id"), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)


class SnowflakeConnection(Base):
    __tablename__ = "snowflake_connections"

    connection_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # database_type: snowflake | postgresql | mysql | bigquery | redshift | mongodb | csv | api
    database_type: Mapped[str] = mapped_column(String(30), default="snowflake")
    account: Mapped[str] = mapped_column(String(300), nullable=False)
    sf_user: Mapped[str] = mapped_column(String(200), nullable=False)
    password: Mapped[Optional[str]] = mapped_column(Text)
    warehouse: Mapped[str] = mapped_column(String(200), default="DQ_EXECUTION_WH")
    role: Mapped[Optional[str]] = mapped_column(String(200))
    default_database: Mapped[Optional[str]] = mapped_column(String(200))
    default_schema: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    connection_type: Mapped[str] = mapped_column(String(50), default="named")
    is_primary_target: Mapped[bool] = mapped_column(Boolean, default=False)
    # Multi-database fields (host-based DBs: PostgreSQL, MySQL, Redshift)
    host: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # BigQuery
    project: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    key_file: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # MongoDB
    connection_string: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # CSV / File
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delimiter: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # REST API
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    auth_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Test diagnostics
    last_test_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class AppConfig(Base):
    __tablename__ = "app_config"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    value: Mapped[Optional[str]] = mapped_column(Text)
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class ServiceAccount(Base):
    """Machine-to-machine service accounts that authenticate via X-API-Key header."""
    __tablename__ = "service_accounts"

    sa_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # First 8 chars of the generated key, stored in clear for fast lookup
    key_prefix: Mapped[str] = mapped_column(String(8), nullable=False)
    # bcrypt hash of the full key
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="viewer")
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_email: Mapped[Optional[str]] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    old_value: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    new_value: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------------------------------------------------------------------------
# §53-§68  NEW MODELS
# ---------------------------------------------------------------------------

class GlossaryTerm(Base):
    __tablename__ = "glossary_terms"

    term_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    term_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    examples: Mapped[Optional[str]] = mapped_column(Text)
    synonyms: Mapped[Optional[str]] = mapped_column(Text)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="active")
    parent_term_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class GlossaryTermAsset(Base):
    __tablename__ = "glossary_term_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    term_id: Mapped[str] = mapped_column(String(36), ForeignKey("glossary_terms.term_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    column_name: Mapped[Optional[str]] = mapped_column(String(200))
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DataClassification(Base):
    __tablename__ = "data_classifications"

    classification_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    column_name: Mapped[Optional[str]] = mapped_column(String(200))
    classification: Mapped[str] = mapped_column(String(30), nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(Text)
    applied_by: Mapped[Optional[str]] = mapped_column(String(200))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ColumnMetadata(Base):
    __tablename__ = "column_metadata"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", name="uq_col_meta_asset_col"),
    )

    col_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    data_type: Mapped[Optional[str]] = mapped_column(String(100))
    is_nullable: Mapped[Optional[bool]] = mapped_column(Boolean)
    description: Mapped[Optional[str]] = mapped_column(Text)
    sample_values: Mapped[Optional[str]] = mapped_column(Text)
    is_primary_key: Mapped[bool] = mapped_column(Boolean, default=False)
    is_foreign_key: Mapped[bool] = mapped_column(Boolean, default=False)
    references_table: Mapped[Optional[str]] = mapped_column(String(200))
    ordinal_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    null_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    unique_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    min_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avg_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cardinality_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_profiled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class ColumnProfileHistory(Base):
    __tablename__ = "column_profile_history"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", "profile_date", name="uq_col_profile_history"),
    )

    history_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)
    profile_date: Mapped[date] = mapped_column(Date, nullable=False)
    null_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    unique_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cardinality_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)


class DataProduct(Base):
    __tablename__ = "data_products"

    product_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"))
    owner_email: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    tags: Mapped[Optional[str]] = mapped_column(Text)
    readme: Mapped[Optional[str]] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class DataProductAsset(Base):
    __tablename__ = "data_product_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_products.product_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    role: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetComment(Base):
    __tablename__ = "asset_comments"

    comment_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    comment_type: Mapped[str] = mapped_column(String(20), default="comment")
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    author_email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class AssetUsage(Base):
    __tablename__ = "asset_usage"

    usage_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    user_email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetRating(Base):
    __tablename__ = "asset_ratings"
    __table_args__ = (
        UniqueConstraint("asset_id", "user_email", name="uq_asset_rating_user"),
    )

    rating_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    review: Mapped[Optional[str]] = mapped_column(Text)
    user_email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetAnnouncement(Base):
    __tablename__ = "asset_announcements"

    announcement_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    announcement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AccessRequest(Base):
    __tablename__ = "access_requests"

    request_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    requester_email: Mapped[str] = mapped_column(String(200), nullable=False)
    requester_name: Mapped[Optional[str]] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    access_level: Mapped[str] = mapped_column(String(20), default="read")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewer_email: Mapped[Optional[str]] = mapped_column(String(200))
    review_note: Mapped[Optional[str]] = mapped_column(Text)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Tag(Base):
    __tablename__ = "tags"

    tag_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tag_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetTag(Base):
    __tablename__ = "asset_tags"
    __table_args__ = (
        UniqueConstraint("tag_id", "entity_type", "entity_id", name="uq_asset_tag"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    tag_id: Mapped[str] = mapped_column(String(36), ForeignKey("tags.tag_id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class CustomAttribute(Base):
    __tablename__ = "custom_attributes"
    __table_args__ = (
        UniqueConstraint("attr_key", "entity_type", "entity_id", name="uq_custom_attr"),
    )

    attr_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    attr_key: Mapped[str] = mapped_column(String(100), nullable=False)
    attr_value: Mapped[Optional[str]] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class AnomalyDetector(Base):
    __tablename__ = "anomaly_detectors"

    detector_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    column_name: Mapped[Optional[str]] = mapped_column(String(200))
    detector_type: Mapped[str] = mapped_column(String(30), nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_trained_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AnomalyDetection(Base):
    __tablename__ = "anomaly_detections"

    detection_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    detector_id: Mapped[str] = mapped_column(String(36), ForeignKey("anomaly_detectors.detector_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), nullable=False)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    column_name: Mapped[Optional[str]] = mapped_column(String(200))
    anomaly_type: Mapped[Optional[str]] = mapped_column(String(50))
    severity: Mapped[Optional[str]] = mapped_column(String(20))
    observed_value: Mapped[Optional[str]] = mapped_column(Text)
    expected_range: Mapped[Optional[str]] = mapped_column(Text)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)


class QualityCostConfig(Base):
    __tablename__ = "quality_cost_configs"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=True)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=True)
    cost_per_failed_row: Mapped[Optional[float]] = mapped_column(Float)
    cost_per_incident: Mapped[Optional[float]] = mapped_column(Float)
    revenue_impact_pct: Mapped[Optional[float]] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    updated_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class QualityIncident(Base):
    __tablename__ = "quality_incidents"

    incident_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[Optional[str]] = mapped_column(String(200))
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    severity: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="open")
    trigger_run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    rca_report: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    timeline: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(200))
    ttd_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    ttr_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ComplianceFramework(Base):
    __tablename__ = "compliance_frameworks"

    framework_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    framework_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(20))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ComplianceRequirement(Base):
    __tablename__ = "compliance_requirements"

    req_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    framework_id: Mapped[str] = mapped_column(String(36), ForeignKey("compliance_frameworks.framework_id"), nullable=False)
    req_code: Mapped[Optional[str]] = mapped_column(String(50))
    req_name: Mapped[Optional[str]] = mapped_column(String(200))
    req_description: Mapped[Optional[str]] = mapped_column(Text)
    dq_rule_types: Mapped[Optional[str]] = mapped_column(Text)


class ComplianceMapping(Base):
    __tablename__ = "compliance_mappings"

    mapping_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    framework_id: Mapped[str] = mapped_column(String(36), ForeignKey("compliance_frameworks.framework_id"), nullable=False)
    req_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("compliance_requirements.req_id"), nullable=True)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="mapped")
    evidence_note: Mapped[Optional[str]] = mapped_column(Text)
    mapped_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class GovernancePolicy(Base):
    __tablename__ = "governance_policies"

    policy_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    policy_name: Mapped[str] = mapped_column(String(200), nullable=False)
    policy_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PolicyViolation(Base):
    __tablename__ = "policy_violations"

    violation_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    policy_id: Mapped[str] = mapped_column(String(36), ForeignKey("governance_policies.policy_id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    violation_detail: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class DataContract(Base):
    __tablename__ = "data_contracts"

    contract_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    contract_name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    producer_team: Mapped[Optional[str]] = mapped_column(String(200))
    consumer_team: Mapped[Optional[str]] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    schema_json: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    min_quality_score: Mapped[float] = mapped_column(Float, default=95.0)
    max_null_pct: Mapped[Optional[float]] = mapped_column(Float)
    max_staleness_hours: Mapped[int] = mapped_column(Integer, default=24)
    sla_description: Mapped[Optional[str]] = mapped_column(Text)
    breach_action: Mapped[Optional[str]] = mapped_column(String(50))
    effective_from: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    effective_until: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class RuleTemplate(Base):
    __tablename__ = "rule_templates"

    template_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    template_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    default_config: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    target_domains: Mapped[Optional[str]] = mapped_column(Text)
    target_industries: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[str]] = mapped_column(Text)
    author_email: Mapped[Optional[str]] = mapped_column(String(200))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class OncallSchedule(Base):
    __tablename__ = "oncall_schedules"

    schedule_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=True)
    oncall_email: Mapped[str] = mapped_column(String(200), nullable=False)
    oncall_slack: Mapped[Optional[str]] = mapped_column(String(200))
    pagerduty_key: Mapped[Optional[str]] = mapped_column(String(200))
    effective_from: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    effective_until: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class IncidentRunbook(Base):
    __tablename__ = "incident_runbooks"

    runbook_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("dq_rules.rule_id"), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(200))
    steps: Mapped[str] = mapped_column(Text, nullable=False)
    escalation_path: Mapped[Optional[str]] = mapped_column(Text)
    related_dashboards: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)



class DataSharingAgreement(Base):
    __tablename__ = "data_sharing_agreements"

    agreement_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    producer_domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    consumer_domain_id: Mapped[str] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    quality_sla: Mapped[float] = mapped_column(Float, nullable=False)
    freshness_sla: Mapped[int] = mapped_column(Integer, nullable=False)
    breach_action: Mapped[Optional[str]] = mapped_column(String(30))
    effective_from: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    signed_by_producer: Mapped[Optional[str]] = mapped_column(String(200))
    signed_by_consumer: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class MaskingPolicy(Base):
    __tablename__ = "masking_policies"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", name="uq_masking_policy_col"),
    )

    policy_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    masking_type: Mapped[str] = mapped_column(String(30), nullable=False)
    applies_to_roles: Mapped[Optional[str]] = mapped_column(Text)
    unmasked_roles: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    search_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_email: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    query: Mapped[Optional[str]] = mapped_column(String(500))
    filters: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
