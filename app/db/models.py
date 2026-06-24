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
from sqlalchemy.ext.associationproxy import association_proxy
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
    assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="domain_obj")
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
    assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="subdomain")
    rules: Mapped[list["DQRule"]] = relationship("DQRule", back_populates="subdomain")


class Asset(Base):
    __tablename__ = "assets"

    asset_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=True)
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("subdomains.subdomain_id"), nullable=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
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

    # Asset Registry fields
    parent_asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
    asset_type: Mapped[str] = mapped_column(String(50), server_default="table", nullable=False)
    physical_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    qualified_name: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    path: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    status: Mapped[str] = mapped_column(String(50), server_default="active", nullable=False)
    owner_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    owner_team_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    steward_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    domain: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sensitivity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    discovered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Operational metadata — written by discovery scanner
    last_scanned_at:           Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scan_status:               Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
    scan_duration_ms:          Mapped[Optional[int]]      = mapped_column(Integer, nullable=True)
    scan_version:              Mapped[Optional[str]]      = mapped_column(String(50), nullable=True)
    # Quality placeholders — written by Phase 2 profiler; NULL until then
    latest_profile_score:      Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
    latest_quality_status:     Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
    is_critical_data_element:  Mapped[bool]               = mapped_column(Boolean, default=False)
    attached_rule_count:       Mapped[int]                = mapped_column(Integer, default=0)

    domain_obj: Mapped[Optional["Domain"]] = relationship("Domain", back_populates="assets")
    subdomain: Mapped[Optional["Subdomain"]] = relationship("Subdomain", back_populates="assets")
    rules: Mapped[list["DQRule"]] = relationship("DQRule", back_populates="asset")
    rule_runs: Mapped[list["DQRuleRun"]] = relationship("DQRuleRun", back_populates="asset")
    parent: Mapped[Optional["Asset"]] = relationship(
        "Asset",
        remote_side="Asset.asset_id",
        foreign_keys="[Asset.parent_asset_id]",
        back_populates="children",
    )
    children: Mapped[list["Asset"]] = relationship(
        "Asset",
        foreign_keys="[Asset.parent_asset_id]",
        back_populates="parent",
    )
    source_meta: Mapped[Optional["AssetSourceMeta"]] = relationship(
        "AssetSourceMeta", back_populates="asset", uselist=False, cascade="all, delete-orphan"
    )

    # Backward-compat proxies for Python attribute access after Snowflake column drop
    sf_table_name = association_proxy("source_meta", "sf_table_name")
    sf_schema_name = association_proxy("source_meta", "sf_schema_name")
    sf_database_name = association_proxy("source_meta", "sf_database_name")
    sf_table_type = association_proxy("source_meta", "sf_table_type")
    view_definition = association_proxy("source_meta", "view_definition")
    row_count = association_proxy("source_meta", "row_count")
    bytes = association_proxy("source_meta", "bytes")
    snowflake_account = association_proxy("source_meta", "sf_account")

    @property
    def table_description(self) -> Optional[str]:
        return self.description


class AssetSourceMeta(Base):
    __tablename__ = "asset_source_meta"

    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(50), server_default="snowflake", nullable=False)
    sf_account: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_database_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_schema_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_table_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_table_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Provider-agnostic metadata (PostgreSQL, MySQL, BigQuery, S3 — avoids sf_* naming)
    generic_database_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    generic_schema_name:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    generic_object_name:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    generic_object_type:   Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    view_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    partition_info:    Mapped[Optional[dict]]     = mapped_column(JSONVariant, nullable=True)
    last_modified_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    table_created_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="source_meta")


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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset: Mapped["Asset"] = relationship("Asset", back_populates="rules")
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
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"))
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset: Mapped["Asset"] = relationship("Asset", back_populates="rule_runs")
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    columns_snapshot: Mapped[Optional[list]] = mapped_column(JSONVariant)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SchemaDriftEvent(Base):
    __tablename__ = "schema_drift_events"

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
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
    excluded_databases: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    excluded_schemas: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    filter_mode: Mapped[str] = mapped_column(String(20), default="exclude")
    included_databases: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    included_schemas: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
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
    environment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, deferred=True)
    last_successful_scan_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, deferred=True)
    scan_readiness_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="not_tested", deferred=True)
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
    log_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------------------
# Tamper-evident hash for AuditLog — computed automatically before INSERT
# ---------------------------------------------------------------------------
import hashlib as _hashlib
from sqlalchemy import event as _sa_event


def _compute_audit_hash(log: "AuditLog") -> str:
    payload = "\x00".join([
        str(log.audit_id or ""),
        str(log.user_email or ""),
        str(log.action or ""),
        str(log.entity_type or ""),
        str(log.entity_id or ""),
        str(log.created_at.isoformat() if log.created_at else ""),
    ])
    return _hashlib.sha256(payload.encode()).hexdigest()


@_sa_event.listens_for(AuditLog, "before_insert")
def _audit_log_set_hash(mapper, connection, target: "AuditLog") -> None:
    # SQLAlchemy evaluates Python-side column defaults before firing
    # before_insert, so audit_id and created_at are guaranteed to be set here.
    if target.audit_id is None:
        target.audit_id = gen_uuid()
    if target.created_at is None:
        target.created_at = now()
    target.log_hash = _compute_audit_hash(target)


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
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class GlossaryTermAsset(Base):
    __tablename__ = "glossary_term_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    term_id: Mapped[str] = mapped_column(String(36), ForeignKey("glossary_terms.term_id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    column_name: Mapped[Optional[str]] = mapped_column(String(200))
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DataClassification(Base):
    __tablename__ = "data_classifications"

    classification_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    precision:             Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    scale:                 Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    character_max_length:  Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    default_value:         Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    is_partition_key:      Mapped[bool]           = mapped_column(Boolean, default=False)
    partition_key_index:   Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class ColumnProfileHistory(Base):
    __tablename__ = "column_profile_history"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", "profile_date", name="uq_col_profile_history"),
    )

    history_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)
    profile_date: Mapped[date] = mapped_column(Date, nullable=False)
    null_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    unique_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cardinality_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)


class AssetMetadataSnapshot(Base):
    __tablename__ = "asset_metadata_snapshots"
    __table_args__ = (
        UniqueConstraint("asset_id", "snapshot_date", name="uq_ams_asset_date"),
    )

    snapshot_id:           Mapped[str]             = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id:              Mapped[str]             = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date:         Mapped[date]            = mapped_column(Date, nullable=False)
    scan_version:          Mapped[Optional[str]]   = mapped_column(String(50), nullable=True)
    scan_status:           Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)
    scan_duration_ms:      Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    row_count:             Mapped[Optional[int]]   = mapped_column(BigInteger, nullable=True)
    bytes:                 Mapped[Optional[int]]   = mapped_column(BigInteger, nullable=True)
    last_modified_at:      Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    column_count:          Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    schema_hash:           Mapped[Optional[str]]   = mapped_column(String(64), nullable=True)
    latest_profile_score:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latest_quality_status: Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)
    attached_rule_count:   Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    created_at:            Mapped[datetime]        = mapped_column(DateTime, default=now)
    updated_at:            Mapped[datetime]        = mapped_column(DateTime, default=now, onupdate=now)


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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    user_email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetRating(Base):
    __tablename__ = "asset_ratings"
    __table_args__ = (
        UniqueConstraint("asset_id", "user_email", name="uq_asset_rating_user"),
    )

    rating_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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


class AssetDocument(Base):
    __tablename__ = "asset_documents"

    doc_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AssetOwner(Base):
    __tablename__ = "asset_owners"

    owner_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    owner_type: Mapped[str] = mapped_column(String(30), nullable=False)  # 'owner' | 'technical_owner'
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AnomalyDetector(Base):
    __tablename__ = "anomaly_detectors"

    detector_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    ai_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AssetMonitoringMetric(Base):
    __tablename__ = "asset_monitoring_metrics"

    metric_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    freshness_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    null_rate_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ContinuousMonitoringConfig(Base):
    __tablename__ = "continuous_monitoring_configs"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("snowflake_connections.connection_id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    interval_minutes: Mapped[int] = mapped_column(Integer, default=15)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    freshness_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    volume_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    schema_drift_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    distribution_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class VolumeBaseline(Base):
    __tablename__ = "volume_baselines"

    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True
    )
    readings: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class DistributionBaseline(Base):
    __tablename__ = "distribution_baselines"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", name="uq_dist_baseline_asset_col"),
    )

    baseline_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)
    baseline_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    established_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SLABreachPrediction(Base):
    __tablename__ = "sla_breach_predictions"

    prediction_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    horizon_days: Mapped[int] = mapped_column(Integer, default=7)
    forecast_scores: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    lower_band: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    upper_band: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    breach_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breach_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_at_risk: Mapped[bool] = mapped_column(Boolean, default=False)


class CorrelatedIncident(Base):
    __tablename__ = "correlated_incidents"

    incident_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    window_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    asset_ids: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    anomaly_ids: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    asset_count: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


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


class QualityCostConfig(Base):
    __tablename__ = "quality_cost_configs"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
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
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
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


class Issue(Base):
    __tablename__ = "dq_issues"

    issue_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issue_type: Mapped[str] = mapped_column(String(20), default="manual")
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True, index=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    assigned_team_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("teams.team_id"), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


ISSUE_TRANSITIONS: dict[str, set[str]] = {
    "new":         {"confirmed", "closed"},
    "confirmed":   {"in_progress", "closed"},
    "in_progress": {"blocked", "resolved", "confirmed"},
    "blocked":     {"in_progress"},
    "resolved":    {"closed", "reopened"},
    "closed":      {"reopened"},
    "reopened":    {"confirmed", "in_progress"},
}


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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    status: Mapped[str] = mapped_column(String(20), default="active")
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    approval_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    entity_snapshot: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    requested_by: Mapped[str] = mapped_column(String(200), nullable=False)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(200))
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class GovernancePolicyVersion(Base):
    __tablename__ = "governance_policy_versions"

    version_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    policy_id: Mapped[str] = mapped_column(String(36), ForeignKey("governance_policies.policy_id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_by: Mapped[str] = mapped_column(String(200), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    change_summary: Mapped[Optional[str]] = mapped_column(String(500))
    field_diffs: Mapped[Optional[list]] = mapped_column(JSONVariant)
    snapshot: Mapped[Optional[dict]] = mapped_column(JSONVariant)


class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_email: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
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
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    masking_type: Mapped[str] = mapped_column(String(30), nullable=False)
    applies_to_roles: Mapped[Optional[str]] = mapped_column(Text)
    unmasked_roles: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DataSubjectRequest(Base):
    __tablename__ = "data_subject_requests"

    dsr_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    subject_email: Mapped[str] = mapped_column(String(200), nullable=False)
    request_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    description: Mapped[Optional[str]] = mapped_column(Text)
    affected_tables: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    requested_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    consent_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(300), nullable=False)
    legal_basis: Mapped[str] = mapped_column(String(50), nullable=False)
    data_subject_type: Mapped[Optional[str]] = mapped_column(String(100))
    requires_explicit_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    opt_in: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DataResidencyPolicy(Base):
    __tablename__ = "data_residency_policies"

    residency_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=True)
    allowed_regions: Mapped[Optional[str]] = mapped_column(Text)
    prohibited_regions: Mapped[Optional[str]] = mapped_column(Text)
    data_sovereignty_country: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
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


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    job_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("snowflake_connections.connection_id", ondelete="SET NULL"),
        nullable=True,
    )
    job_name: Mapped[str] = mapped_column(String(200), nullable=False)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    schedule_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="on_demand")
    cron_expr: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    max_retries: Mapped[int] = mapped_column(Integer, default=2)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)
    parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_run_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    runs: Mapped[list["ScanJobRun"]] = relationship(
        "ScanJobRun", back_populates="job", cascade="all, delete-orphan"
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("job_id", gen_uuid())
        super().__init__(**kwargs)


class ScanJobRun(Base):
    __tablename__ = "scan_job_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_jobs.job_id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    triggered_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    assets_scanned: Mapped[int] = mapped_column(Integer, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result_summary: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    job: Mapped["ScanJob"] = relationship("ScanJob", back_populates="runs")
    logs: Mapped[list["ScanJobRunLog"]] = relationship(
        "ScanJobRunLog", back_populates="run", cascade="all, delete-orphan"
    )
    summary: Mapped[Optional["ScanRunSummary"]] = relationship(
        "ScanRunSummary", back_populates="run", uselist=False, cascade="all, delete-orphan"
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("run_id", gen_uuid())
        super().__init__(**kwargs)


class ScanJobRunLog(Base):
    __tablename__ = "scan_job_run_logs"

    log_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="INFO")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["ScanJobRun"] = relationship("ScanJobRun", back_populates="logs")

    def __init__(self, **kwargs):
        kwargs.setdefault("log_id", gen_uuid())
        super().__init__(**kwargs)


# ---------------------------------------------------------------------------
# §M5  Results Storage
# ---------------------------------------------------------------------------

class ScanRunSummary(Base):
    """Enriched summary for a completed scan run. One row per ScanJobRun."""
    __tablename__ = "scan_run_summaries"

    summary_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    job_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_jobs.job_id", ondelete="SET NULL"), nullable=True
    )
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    scan_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    removed_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    schema_changes_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_score_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    scan_parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["ScanJobRun"] = relationship("ScanJobRun", back_populates="summary")

    def __init__(self, **kwargs):
        kwargs.setdefault("summary_id", gen_uuid())
        kwargs.setdefault("new_assets_count", 0)
        kwargs.setdefault("updated_assets_count", 0)
        kwargs.setdefault("removed_assets_count", 0)
        kwargs.setdefault("failed_assets_count", 0)
        kwargs.setdefault("schema_changes_count", 0)
        super().__init__(**kwargs)


class AssetScanSummary(Base):
    """Per-asset outcome for a specific run. Written by metadata_store.record_scan_result."""
    __tablename__ = "asset_scan_summaries"
    __table_args__ = (
        UniqueConstraint("run_id", "asset_id", name="uq_asset_scan_summary_run_asset"),
    )

    asset_summary_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_jobs.job_id", ondelete="SET NULL"), nullable=True
    )
    scan_status: Mapped[str] = mapped_column(String(20), nullable=False, default="succeeded")
    scan_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    column_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    schema_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    columns_added: Mapped[int] = mapped_column(Integer, default=0)
    columns_removed: Mapped[int] = mapped_column(Integer, default=0)
    columns_changed: Mapped[int] = mapped_column(Integer, default=0)
    schema_drift_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Phase 2 placeholders — NULL until profiling/rule engines run
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    null_ratio_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distinct_ratio_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    freshness_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("asset_summary_id", gen_uuid())
        kwargs.setdefault("scan_status", "succeeded")
        kwargs.setdefault("columns_added", 0)
        kwargs.setdefault("columns_removed", 0)
        kwargs.setdefault("columns_changed", 0)
        kwargs.setdefault("schema_drift_detected", False)
        super().__init__(**kwargs)


class ScanMetricsHistory(Base):
    """One row per (asset, run, metric_name). Supports trend queries."""
    __tablename__ = "scan_metrics_history"
    __table_args__ = (
        UniqueConstraint("asset_id", "metric_name", "metric_date", name="uq_scan_metrics_asset_metric_date"),
    )

    metric_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"), nullable=True
    )
    metric_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value_num: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    metric_value_str: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("metric_id", gen_uuid())
        super().__init__(**kwargs)


class ScanEvidenceLog(Base):
    """Structured diagnostics and evidence attached to a run or asset."""
    __tablename__ = "scan_evidence_logs"

    evidence_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="SET NULL"), nullable=True
    )
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    retention_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("evidence_id", gen_uuid())
        kwargs.setdefault("severity", "info")
        super().__init__(**kwargs)


class ProfilingResultPlaceholder(Base):
    """Per-column profiling result. Populated by Phase 2 profiling engine."""
    __tablename__ = "profiling_result_placeholders"
    __table_args__ = (
        UniqueConstraint("run_id", "asset_id", "column_name", name="uq_profiling_result_run_asset_col"),
    )

    profiling_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    null_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    null_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distinct_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    distinct_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avg_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_values: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    pattern_frequency: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    data_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    profiled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("profiling_id", gen_uuid())
        kwargs.setdefault("is_placeholder", True)
        super().__init__(**kwargs)


class RuleResultPlaceholder(Base):
    """Per-rule evaluation result linked to a scan run. Populated by Phase 2 rule engine."""
    __tablename__ = "rule_result_placeholders"

    result_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("dq_rules.rule_id", ondelete="SET NULL"), nullable=True
    )
    rule_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    rows_scanned: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    rows_failed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    failure_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("result_id", gen_uuid())
        kwargs.setdefault("status", "pending")
        kwargs.setdefault("is_placeholder", True)
        super().__init__(**kwargs)


class FailedSampleRecordPlaceholder(Base):
    """Evidence record for a failed row. Populated by Phase 2. Has retention TTL."""
    __tablename__ = "failed_sample_record_placeholders"

    sample_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    rule_result_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("rule_result_placeholders.result_id", ondelete="SET NULL"),
        nullable=True,
    )
    failed_record: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    retention_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("sample_id", gen_uuid())
        kwargs.setdefault("is_placeholder", True)
        super().__init__(**kwargs)


# ---------------------------------------------------------------------------
# §M6  User / Role / Team / Ownership
# ---------------------------------------------------------------------------

class Team(Base):
    __tablename__ = "teams"

    team_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class TeamMembership(Base):
    """Many-to-many join between users and teams."""
    __tablename__ = "team_memberships"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_membership"),
    )

    membership_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    role_in_team: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class UserRole(Base):
    """Additional roles beyond the primary User.role field. Supports multi-role."""
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role", name="uq_user_role"),
    )

    user_role_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    granted_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TeamRole(Base):
    """Roles assigned to an entire team — all members inherit them."""
    __tablename__ = "team_roles"
    __table_args__ = (
        UniqueConstraint("team_id", "role", name="uq_team_role"),
    )

    team_role_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    granted_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class NotificationTarget(Base):
    """Per-user or per-team notification channel configuration."""
    __tablename__ = "notification_targets"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "channel", name="uq_notification_target_entity_channel"),
    )

    target_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)   # "user" or "team"
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)        # "email", "slack", "pagerduty", "webhook"
    address: Mapped[str] = mapped_column(String(500), nullable=False)       # email addr, Slack channel, URL, etc.
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class AlertDefinition(Base):
    """User-defined alert rule: when to fire an alert and where to send it.

    trigger_type values:
      - rule_failure   : fire when a DQ rule run fails (default behaviour)
      - score_drop     : fire when an asset quality score drops below threshold_value
      - freshness_breach: fire when an asset hasn't been refreshed within threshold_value hours
      - anomaly        : fire when an anomaly detection fires for this asset/domain

    Scope: if both asset_id and domain_id are NULL the definition is global.
    """
    __tablename__ = "alert_definitions"

    definition_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- trigger ---
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False, default="rule_failure")
    # For score_drop: minimum acceptable score (0-100). Alert if score < threshold_value.
    # For freshness_breach: max age in hours. Alert if last_refresh > threshold_value hours ago.
    # For rule_failure/anomaly: not used.
    threshold_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # --- scope (null = all) ---
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="SET NULL"), nullable=True)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id", ondelete="SET NULL"), nullable=True)

    # --- output ---
    severity_override: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=240)
    # JSON list of channel configs: [{"channel": "slack", "address": "..."}, ...]
    notification_channels: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)

    # --- lifecycle ---
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    triggered_count: Mapped[int] = mapped_column(Integer, default=0)
    last_fired_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


# ---------------------------------------------------------------------------
# Operations Module — Pipeline Orchestration
# ---------------------------------------------------------------------------

class Pipeline(Base):
    __tablename__ = "ops_pipelines"

    pipeline_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    cron_expr: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    trigger_config: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    connection_ids: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=3600)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    steps: Mapped[list["PipelineStep"]] = relationship(
        "PipelineStep", back_populates="pipeline",
        cascade="all, delete-orphan", order_by="PipelineStep.step_order",
    )
    runs: Mapped[list["PipelineRun"]] = relationship(
        "PipelineRun", back_populates="pipeline", cascade="all, delete-orphan",
    )


class PipelineStep(Base):
    __tablename__ = "ops_pipeline_steps"

    step_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    pipeline_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ops_pipelines.pipeline_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_type: Mapped[str] = mapped_column(String(50), nullable=False)
    step_config: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    depends_on: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=1800)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    pipeline: Mapped["Pipeline"] = relationship("Pipeline", back_populates="steps")


class PipelineRun(Base):
    __tablename__ = "ops_pipeline_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    pipeline_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ops_pipelines.pipeline_id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    triggered_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    pipeline: Mapped["Pipeline"] = relationship("Pipeline", back_populates="runs")
    step_runs: Mapped[list["PipelineStepRun"]] = relationship(
        "PipelineStepRun", back_populates="run", cascade="all, delete-orphan",
    )


class PipelineStepRun(Base):
    __tablename__ = "ops_pipeline_step_runs"

    step_run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ops_pipeline_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    step_id: Mapped[str] = mapped_column(String(36), nullable=False)
    step_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_summary: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["PipelineRun"] = relationship("PipelineRun", back_populates="step_runs")


# ---------------------------------------------------------------------------
# Operations Module — Escalation Policies
# ---------------------------------------------------------------------------

class EscalationPolicy(Base):
    __tablename__ = "ops_escalation_policies"

    policy_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    steps: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    oncall_rotation: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    repeat_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_escalations: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    routing_rules: Mapped[list["AlertRoutingRule"]] = relationship(
        "AlertRoutingRule", back_populates="escalation_policy",
    )


# ---------------------------------------------------------------------------
# Operations Module — Alert Routing
# ---------------------------------------------------------------------------

class AlertRoutingRule(Base):
    __tablename__ = "ops_alert_routing_rules"

    rule_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    match_conditions: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    notification_channels: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    escalation_policy_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ops_escalation_policies.policy_id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    escalation_policy: Mapped[Optional["EscalationPolicy"]] = relationship(
        "EscalationPolicy", back_populates="routing_rules",
    )


class MaintenanceWindow(Base):
    __tablename__ = "ops_maintenance_windows"

    window_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    recurrence: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    suppress_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    suppress_scans: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class FlapDetectionConfig(Base):
    """Singleton config — only one row exists."""
    __tablename__ = "ops_flap_detection_config"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    flap_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    window_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    suppress_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
