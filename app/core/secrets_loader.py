from __future__ import annotations

"""
Secrets bootstrap — load sensitive config from external secret stores at startup.

Supports:
  • HashiCorp Vault  (KV v2) via VAULT_ADDR + VAULT_TOKEN + VAULT_SECRET_PATH
  • AWS Secrets Manager      via AWS_SECRETS_NAME + AWS_REGION (uses IAM role or env creds)

The loaded key/value pairs are merged into `settings` so the rest of the app
reads them from the same `settings` object without any code changes.

This module is intentionally optional: if neither backend is configured the
function is a no-op.  Local dev uses OS environment variables directly.
"""
import logging

logger = logging.getLogger("dq_platform.secrets_loader")

# Keys that should be pulled from the secret store when found
_SENSITIVE_KEYS = {
    "secret_key",
    "encryption_key",
    "sf_platform_password",
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "google_client_secret",
    "smtp_password",
    "pagerduty_integration_key",
}


def _merge(settings, data: dict) -> None:
    """Overwrite matching settings fields with values from the secret store."""
    applied = 0
    for key, value in data.items():
        k = key.lower()
        if k in _SENSITIVE_KEYS and hasattr(settings, k) and value:
            setattr(settings, k, value)
            applied += 1
    if applied:
        logger.info(f"Secrets loader applied {applied} secret(s) from external store")


def load_from_vault(settings) -> None:
    """
    Fetch secrets from HashiCorp Vault KV v2.

    Vault Agent sidecar is the recommended production pattern — it injects
    secrets as env vars which pydantic-settings picks up automatically.
    Use this function only when the app itself must authenticate to Vault.
    """
    if not (settings.vault_addr and settings.vault_token and settings.vault_secret_path):
        return
    try:
        import httpx
        url = f"{settings.vault_addr.rstrip('/')}/v1/{settings.vault_secret_path}"
        resp = httpx.get(url, headers={"X-Vault-Token": settings.vault_token}, timeout=5)
        resp.raise_for_status()
        data = resp.json().get("data", {}).get("data", {})
        _merge(settings, data)
        logger.info(f"Loaded secrets from Vault path: {settings.vault_secret_path}")
    except Exception as e:
        logger.error(f"Vault secrets load failed: {e}")


def load_from_aws_sm(settings) -> None:
    """
    Fetch secrets from AWS Secrets Manager.

    The secret value should be a JSON object whose keys match settings field
    names (case-insensitive).  AWS credentials are resolved by boto3's default
    chain: env vars → ~/.aws → EC2/ECS IAM role.
    """
    if not settings.aws_secrets_name:
        return
    try:
        import boto3
        import json
        client = boto3.client("secretsmanager", region_name=settings.aws_region)
        resp = client.get_secret_value(SecretId=settings.aws_secrets_name)
        raw = resp.get("SecretString") or ""
        data = json.loads(raw) if raw else {}
        _merge(settings, data)
        logger.info(f"Loaded secrets from AWS SM: {settings.aws_secrets_name}")
    except ImportError:
        logger.warning("boto3 not installed — AWS Secrets Manager integration skipped")
    except Exception as e:
        logger.error(f"AWS Secrets Manager load failed: {e}")


def bootstrap(settings) -> None:
    """
    Call both secret backends in order.  Safe to call at startup even when
    neither is configured.
    """
    load_from_vault(settings)
    load_from_aws_sm(settings)
