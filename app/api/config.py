from __future__ import annotations
from typing import Optional
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.services import config_service
from app.core.security import get_current_user
from app.core.config import settings

logger = logging.getLogger("dq_platform.config")
router = APIRouter(prefix="/config", tags=["Configuration"])

VALID_CATEGORIES = {"general", "platform_connection", "llm", "scheduler"}


@router.get("/public/display-timezone", include_in_schema=True)
async def get_display_timezone(db: AsyncSession = Depends(get_db)):
    """Return the configured display timezone — public endpoint, no auth required."""
    value = await config_service.get_value("display_timezone", db)
    return {"timezone": value or "America/Los_Angeles"}


@router.get("/platform-info")
async def get_platform_info(db: AsyncSession = Depends(get_db)):
    """Return platform Snowflake connection config (from AppConfig, editable in UI)."""
    keys = ["sf_platform_account", "sf_platform_user", "sf_platform_password",
            "sf_platform_warehouse", "sf_platform_role",
            "snowflake_app_database", "snowflake_app_schema"]
    data: dict = {}
    for k in keys:
        val = await config_service.get_value(k, db)
        if k == "sf_platform_password":
            data["has_password"] = bool(val)
        else:
            data[k] = val or ""
    return data


class PlatformConnectionTest(BaseModel):
    account: str = ""
    user: str = ""
    password: str = ""
    warehouse: str = ""
    role: str = ""


@router.post("/test/platform-connection")
async def test_platform_connection(payload: PlatformConnectionTest = PlatformConnectionTest()):
    """Test the platform Snowflake connection.

    Accepts credentials in the request body. Falls back to DB-stored values,
    then to env vars — so this works even before the DB is reachable.
    """
    body = payload

    # Resolve each credential: body → DB → settings
    async def resolve(key: str, body_val: str, settings_val: str) -> str:
        if body_val:
            return body_val
        try:
            from app.db.database import get_session_ctx
            async with get_session_ctx() as session:
                db_val = await config_service.get_value(key, session)
                if db_val:
                    return db_val
        except Exception:
            pass
        return settings_val or ""

    account  = await resolve("sf_platform_account",   body.account,   settings.sf_platform_account)
    user     = await resolve("sf_platform_user",      body.user,      settings.sf_platform_user)
    password = await resolve("sf_platform_password",  body.password,  settings.sf_platform_password)
    warehouse= await resolve("sf_platform_warehouse", body.warehouse, settings.sf_platform_warehouse)
    role     = await resolve("sf_platform_role",      body.role,      settings.sf_platform_role)

    if not account or not user or not password:
        return {"status": "error", "message": "Account, user, and password are required"}

    try:
        import snowflake.connector
        kwargs = dict(account=account, user=user, password=password,
                      warehouse=warehouse or "COMPUTE_WH")
        if role:
            kwargs["role"] = role
        conn = await asyncio.to_thread(snowflake.connector.connect, **kwargs)
        cur = conn.cursor()
        await asyncio.to_thread(cur.execute, "SELECT CURRENT_VERSION(), CURRENT_ROLE(), CURRENT_WAREHOUSE()")
        row = await asyncio.to_thread(cur.fetchone)
        cur.close()
        conn.close()
        return {
            "status": "ok",
            "message": f"Connected successfully (Snowflake {row[0]})",
            "role": row[1],
            "warehouse": row[2],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


class ConfigUpdate(BaseModel):
    value: str


class BulkConfigUpdate(BaseModel):
    updates: dict[str, str]


# ── Read ──────────────────────────────────────────────────────────────────────

@router.get("")
async def get_all_config(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if category:
        if category not in VALID_CATEGORIES:
            raise HTTPException(400, f"Unknown category '{category}'. Valid: {sorted(VALID_CATEGORIES)}")
        rows = await config_service.get_by_category(category, db)
    else:
        rows = await config_service.get_all(db)

    # Group by category for easier frontend consumption
    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.category, []).append(config_service.mask(row))
    return {"config": grouped, "categories": sorted(grouped.keys())}


@router.get("/{key}")
async def get_config_key(key: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from app.db.models import AppConfig
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(404, f"Config key '{key}' not found")
    return config_service.mask(row)


# ── Write ─────────────────────────────────────────────────────────────────────

@router.put("/{key}")
async def update_config_key(
    key: str,
    payload: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        row = await config_service.set_value(key, payload.value, user.get("email", "ui"), db)
        return {"message": f"Config '{key}' updated", "entry": config_service.mask(row)}
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/bulk-update")
async def bulk_update_config(
    payload: BulkConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    updated = await config_service.bulk_update(payload.updates, user.get("email", "ui"), db)
    return {"message": f"Updated {len(updated)} config entries", "count": len(updated)}


# ── Test connections ──────────────────────────────────────────────────────────

@router.post("/test/database")
async def test_database(db: AsyncSession = Depends(get_db)):
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "message": "Platform Snowflake connection successful"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/llm")
async def test_llm(db: AsyncSession = Depends(get_db)):
    provider_name = await config_service.get_value("llm_provider", db) or "ollama"

    # Build a temporary provider using values from the config table
    ollama_url = await config_service.get_value("ollama_base_url", db)
    ollama_model = await config_service.get_value("ollama_model", db)
    openai_key = await config_service.get_value("openai_api_key", db)
    openai_model = await config_service.get_value("openai_model", db)
    anthropic_key = await config_service.get_value("anthropic_api_key", db)
    claude_model = await config_service.get_value("claude_model", db)
    gemini_key = await config_service.get_value("gemini_api_key", db)
    gemini_model = await config_service.get_value("gemini_model", db)

    try:
        if provider_name == "ollama":
            import httpx
            from app.core.config import settings as app_settings

            async def _probe_ollama(target_url: str) -> Optional[list[str]]:
                """Return model list if reachable, None if not."""
                try:
                    async with httpx.AsyncClient(timeout=8) as client:
                        resp = await client.get(f"{target_url}/api/tags")
                        resp.raise_for_status()
                    return [m["name"] for m in resp.json().get("models", [])]
                except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
                    return None

            url = (ollama_url or app_settings.ollama_base_url or "http://localhost:11434").rstrip("/")
            try:
                models = await _probe_ollama(url)
                if models is not None:
                    return {"status": "ok", "message": f"Ollama reachable at {url}. Available models: {models or ['none pulled yet']}"}

                # Primary URL failed — if it's a localhost URL, auto-try host.docker.internal
                # (API running inside Docker cannot reach host via 'localhost')
                from urllib.parse import urlparse
                parsed = urlparse(url)
                if parsed.hostname in ("localhost", "127.0.0.1"):
                    docker_url = url.replace(parsed.hostname, "host.docker.internal")
                    models = await _probe_ollama(docker_url)
                    if models is not None:
                        return {
                            "status": "error",
                            "message": (
                                f"Ollama is running but not reachable at {url} "
                                f"(the API is inside Docker). "
                                f"Update the URL to {docker_url} in Settings → LLM / AI "
                                f"and save, then test again."
                            ),
                        }

                return {
                    "status": "error",
                    "message": (
                        f"Cannot connect to Ollama at {url}. "
                        "If running in Docker, set the URL to http://host.docker.internal:11434 "
                        "in Settings → LLM / AI. Otherwise, make sure Ollama is running locally."
                    ),
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}

        elif provider_name == "openai":
            if not openai_key:
                return {"status": "error", "message": "OpenAI API key is not configured"}
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_key)
            resp = await client.chat.completions.create(
                model=openai_model or "gpt-4o-mini",
                messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                max_tokens=5,
            )
            return {"status": "ok", "message": f"OpenAI connection successful (model: {resp.model})"}

        elif provider_name == "claude":
            if not anthropic_key:
                return {"status": "error", "message": "Anthropic API key is not configured"}
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=anthropic_key)
            msg = await client.messages.create(
                model=claude_model or "claude-3-5-sonnet-latest",
                max_tokens=5,
                messages=[{"role": "user", "content": "Reply with the single word: ok"}],
            )
            return {"status": "ok", "message": f"Claude connection successful (model: {msg.model})"}

        elif provider_name in ("gemini_flash", "gemini"):
            if not gemini_key:
                return {"status": "error", "message": "Gemini API key is not configured"}
            from google import genai as google_genai
            client = google_genai.Client(api_key=gemini_key)
            resp = client.models.generate_content(
                model=gemini_model or "gemini-2.5-flash",
                contents="Reply with the single word: ok",
            )
            return {"status": "ok", "message": f"Gemini connection successful (model: {gemini_model or 'gemini-2.5-flash'})"}

        else:
            return {"status": "error", "message": f"Unknown provider: {provider_name}"}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Notification channel test endpoints ───────────────────────────────────────

@router.post("/test/notification/email")
async def test_notification_email(db: AsyncSession = Depends(get_db)):
    host     = await config_service.get_value("smtp_host", db)
    port_str = await config_service.get_value("smtp_port", db) or "587"
    user     = await config_service.get_value("smtp_user", db)
    password = await config_service.get_value("smtp_password", db)
    from_email = await config_service.get_value("smtp_from_email", db) or user
    recipients = await config_service.get_value("alert_email_recipients", db)

    if not host:
        return {"status": "error", "message": "SMTP host is not configured"}
    if not recipients:
        return {"status": "error", "message": "Alert recipients are not configured"}

    try:
        import smtplib
        from email.mime.text import MIMEText
        import asyncio

        def _send():
            msg = MIMEText("This is a test notification from the DQ Platform.")
            msg["Subject"] = "[DQ Platform] Test Notification"
            msg["From"] = from_email
            msg["To"] = recipients.split(",")[0].strip()
            with smtplib.SMTP(host, int(port_str), timeout=10) as server:
                server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(from_email, [recipients.split(",")[0].strip()], msg.as_string())

        await asyncio.to_thread(_send)
        return {"status": "ok", "message": f"Test email sent to {recipients.split(',')[0].strip()} via {host}:{port_str}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/notification/slack")
async def test_notification_slack(db: AsyncSession = Depends(get_db)):
    webhook_url = await config_service.get_value("slack_webhook_url", db)
    if not webhook_url:
        return {"status": "error", "message": "Slack webhook URL is not configured"}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(webhook_url, json={"text": "✅ DQ Platform — Slack notification test successful."})
        if resp.status_code == 200 and resp.text == "ok":
            return {"status": "ok", "message": "Slack webhook test successful — check your channel for the test message."}
        return {"status": "error", "message": f"Slack returned HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/notification/teams")
async def test_notification_teams(db: AsyncSession = Depends(get_db)):
    webhook_url = await config_service.get_value("teams_webhook_url", db)
    if not webhook_url:
        return {"status": "error", "message": "Microsoft Teams webhook URL is not configured"}
    try:
        import httpx
        payload = {"@type": "MessageCard", "@context": "http://schema.org/extensions",
                   "summary": "DQ Platform Test", "themeColor": "0078D4",
                   "title": "DQ Platform — Test Notification",
                   "text": "✅ Teams webhook is configured correctly."}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(webhook_url, json=payload)
        if resp.status_code == 200:
            return {"status": "ok", "message": "Teams webhook test successful — check your channel for the test message."}
        return {"status": "error", "message": f"Teams returned HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/notification/pagerduty")
async def test_notification_pagerduty(db: AsyncSession = Depends(get_db)):
    key = await config_service.get_value("pagerduty_integration_key", db)
    if not key:
        return {"status": "error", "message": "PagerDuty integration key is not configured"}
    try:
        import httpx
        payload = {
            "routing_key": key,
            "event_action": "trigger",
            "payload": {
                "summary": "DQ Platform — Test Alert (safe to resolve)",
                "severity": "info",
                "source": "dq-platform-settings-test",
            },
        }
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post("https://events.pagerduty.com/v2/enqueue", json=payload)
        data = resp.json()
        if resp.status_code == 202 and data.get("status") == "success":
            return {"status": "ok", "message": f"PagerDuty event triggered (dedup_key: {data.get('dedup_key', 'n/a')}). Resolve it in your PagerDuty dashboard."}
        return {"status": "error", "message": f"PagerDuty returned {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/notification/webhook")
async def test_notification_webhook(db: AsyncSession = Depends(get_db)):
    webhook_url = await config_service.get_value("alert_webhook_url", db)
    if not webhook_url:
        return {"status": "error", "message": "Custom webhook URL is not configured"}
    try:
        import httpx
        payload = {"event": "test", "rule_name": "dq_platform_test", "severity": "info",
                   "message": "DQ Platform webhook test", "domain": "test", "table": "test", "failure_pct": 0}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(webhook_url, json=payload)
        if resp.status_code < 400:
            return {"status": "ok", "message": f"Webhook responded with HTTP {resp.status_code} — connection successful."}
        return {"status": "error", "message": f"Webhook returned HTTP {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Integration test endpoints ────────────────────────────────────────────────

@router.post("/test/vault")
async def test_vault(db: AsyncSession = Depends(get_db)):
    addr  = await config_service.get_value("vault_addr", db)
    token = await config_service.get_value("vault_token", db)
    if not addr:
        return {"status": "error", "message": "Vault address is not configured"}
    try:
        import httpx
        url = addr.rstrip("/") + "/v1/sys/health"
        headers = {"X-Vault-Token": token} if token else {}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code in (200, 429, 473, 501, 503):
            data = resp.json()
            sealed = data.get("sealed", None)
            initialized = data.get("initialized", None)
            if sealed:
                return {"status": "error", "message": f"Vault is reachable but sealed. Initialize and unseal it before use."}
            return {"status": "ok", "message": f"Vault reachable at {addr} (initialized={initialized}, sealed={sealed})"}
        return {"status": "error", "message": f"Vault returned HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test/aws-secrets")
async def test_aws_secrets(db: AsyncSession = Depends(get_db)):
    secret_name = await config_service.get_value("aws_secrets_name", db)
    region      = await config_service.get_value("aws_region", db)
    if not secret_name:
        return {"status": "error", "message": "AWS secret name is not configured"}
    try:
        import asyncio, boto3
        from botocore.exceptions import ClientError

        def _check():
            client = boto3.client("secretsmanager", region_name=region or "us-east-1")
            client.describe_secret(SecretId=secret_name)
            return True

        await asyncio.to_thread(_check)
        return {"status": "ok", "message": f"AWS Secrets Manager: secret '{secret_name}' is accessible in region '{region or 'us-east-1'}'."}
    except ImportError:
        return {"status": "error", "message": "boto3 is not installed. Run: pip install boto3"}
    except Exception as e:
        msg = str(e)
        if "ResourceNotFoundException" in msg:
            return {"status": "error", "message": f"Secret '{secret_name}' not found in AWS Secrets Manager."}
        if "AccessDeniedException" in msg or "NoCredentialsError" in msg:
            return {"status": "error", "message": "AWS credentials not configured or insufficient permissions."}
        return {"status": "error", "message": msg}


@router.post("/test/otel")
async def test_otel(db: AsyncSession = Depends(get_db)):
    enabled  = await config_service.get_value("otel_enabled", db)
    endpoint = await config_service.get_value("otel_endpoint", db)
    if enabled != "true":
        return {"status": "error", "message": "OTEL is disabled. Enable it first."}
    if not endpoint:
        return {"status": "error", "message": "OTEL collector endpoint is not configured"}
    try:
        import httpx
        # Probe the gRPC/HTTP collector — a 400/405 means it's alive but rejecting plain HTTP (expected for gRPC)
        host_port = endpoint.rstrip("/")
        async with httpx.AsyncClient(timeout=6) as client:
            try:
                resp = await client.get(host_port)
                return {"status": "ok", "message": f"OTEL collector at {endpoint} responded with HTTP {resp.status_code}."}
            except httpx.ConnectError:
                return {"status": "error", "message": f"Cannot connect to OTEL collector at {endpoint}. Verify the collector is running."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── OAuth / SSO test endpoint ─────────────────────────────────────────────────

@router.post("/test/oauth")
async def test_oauth(db: AsyncSession = Depends(get_db)):
    client_id     = await config_service.get_value("google_client_id", db)
    client_secret = await config_service.get_value("google_client_secret", db)
    if not client_id:
        return {"status": "error", "message": "Google Client ID is not configured"}
    if not client_secret:
        return {"status": "error", "message": "Google Client Secret is not configured"}
    try:
        import httpx
        # Attempt to exchange an invalid code — Google returns "invalid_grant" (credentials valid)
        # vs "invalid_client" (credentials wrong). We use this to validate credentials without a real flow.
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": "test_code_dq_platform",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": "http://localhost",
                    "grant_type": "authorization_code",
                },
            )
        data = resp.json()
        error = data.get("error", "")
        if error == "invalid_grant":
            return {"status": "ok", "message": "Google OAuth credentials are valid (client_id and client_secret accepted by Google)."}
        if error == "invalid_client":
            return {"status": "error", "message": "Google Client ID or Client Secret is invalid. Check your Google Cloud Console credentials."}
        return {"status": "error", "message": f"Unexpected response from Google: {error} — {data.get('error_description', '')}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
