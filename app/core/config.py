from __future__ import annotations

from pydantic_settings import BaseSettings

_WEAK_SECRET_KEYS = {
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production",
    "secret",
    "changeme",
    "",
}


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "DataGuard"
    debug: bool = False

    # ── Platform Snowflake connection (app's own tables: DQ_PLATFORM_DB.DQ_APP) ──
    # Set via env vars: SF_PLATFORM_ACCOUNT, SF_PLATFORM_USER, etc.
    sf_platform_account: str = ""
    sf_platform_user: str = ""
    sf_platform_password: str = ""
    sf_platform_warehouse: str = "DQ_EXECUTION_WH"
    sf_platform_role: str = "DQ_PLATFORM_ROLE"
    # Platform app database and schema (where platform tables live)
    snowflake_app_database: str = "DQ_PLATFORM_DB"
    snowflake_app_schema: str = "DQ_APP"

    # Warehouse used for column profiling (smaller WH, optional)
    snowflake_profile_warehouse: str = "DQ_SMALL_WH"

    # LLM
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-latest"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Scheduler
    scheduler_type: str = "apscheduler"
    default_timezone: str = "America/Los_Angeles"

    # Security
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    encryption_key: str = ""

    # Alerts & Notifications
    slack_webhook_url: str = ""
    teams_webhook_url: str = ""
    pagerduty_integration_key: str = ""
    alert_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "dq-platform@example.com"
    smtp_use_tls: bool = True
    alert_email_recipients: str = ""

    # Security / Auth
    auth_required: bool = True
    allowed_origins: str = "http://localhost:3000,http://localhost:3001,https://dq-platform.pages.dev"
    rate_limit_per_minute: int = 120

    # OAuth2 / SSO
    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8000/auth/oauth/google/callback"
    frontend_url: str = "http://localhost:3000"

    # Secrets backends (production)
    vault_addr: str = ""
    vault_token: str = ""
    vault_secret_path: str = ""
    aws_secrets_name: str = ""
    aws_region: str = "us-east-1"

    # Performance
    db_pool_size: int = 10
    db_max_overflow: int = 20
    execution_timeout_seconds: int = 300
    execution_max_retries: int = 3

    # Snowflake connection pool (for target connections)
    snowflake_pool_min_size: int = 1
    snowflake_pool_max_size: int = 5
    snowflake_pool_acquire_timeout: float = 30.0

    # Auto data quality rule creation
    auto_rules_enabled: bool = True
    auto_rules_max_per_table: int = 10

    model_config = {"env_file": ".env", "case_sensitive": False}

    def is_weak_secret_key(self) -> bool:
        return self.secret_key.lower() in _WEAK_SECRET_KEYS or len(self.secret_key) < 32


settings = Settings()
