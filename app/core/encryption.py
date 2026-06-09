from __future__ import annotations
from typing import Optional
"""Fernet symmetric encryption for credentials stored in the database.

Usage:
  from app.core.encryption import encrypt, decrypt

  # Store
  conn.password = encrypt(plain_password)

  # Read
  plain = decrypt(conn.password)
"""
import logging
from functools import lru_cache

logger = logging.getLogger("dq_platform.encryption")

# Fernet tokens always begin with this prefix — used to detect already-encrypted values.
_FERNET_PREFIX = b"gAAAAAB"


@lru_cache(maxsize=1)
def _get_fernet():
    """Return a cached Fernet instance, or None if ENCRYPTION_KEY is not set."""
    from app.core.config import settings
    key = (settings.encryption_key or "").strip()
    if not key:
        logger.warning(
            "ENCRYPTION_KEY is not set — credentials will be stored unencrypted. "
            "Generate a key: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode())
    except Exception as e:
        logger.error(f"Invalid ENCRYPTION_KEY — credentials will be stored unencrypted: {e}")
        return None


def encrypt(value: Optional[str]) -> Optional[str]:
    """Encrypt a plaintext string. Returns the original if no key is configured."""
    if not value:
        return value
    f = _get_fernet()
    if f is None:
        return value
    try:
        return f.encrypt(value.encode()).decode()
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        return value


def decrypt(value: Optional[str]) -> Optional[str]:
    """Decrypt a Fernet-encrypted string.

    Returns the original value when:
    - The value is plain-text (stored before encryption was enabled)
    - ENCRYPTION_KEY is not configured

    Returns None (instead of the encrypted token) when the value looks
    Fernet-encrypted but cannot be decrypted, to prevent passing the
    ciphertext as a password to downstream services.
    """
    if not value:
        return value
    f = _get_fernet()
    if f is None:
        if is_encrypted(value):
            logger.error(
                "Credential is Fernet-encrypted but ENCRYPTION_KEY is not set. "
                "Set ENCRYPTION_KEY to the same value used when the credential was saved. "
                "Returning None to avoid passing ciphertext as a password."
            )
            return None
        return value
    try:
        from cryptography.fernet import InvalidToken  # noqa: F401 (kept for clarity)
        return f.decrypt(value.encode()).decode()
    except Exception as exc:
        if is_encrypted(value):
            logger.error(
                "Failed to decrypt Fernet-encrypted credential — ENCRYPTION_KEY may have "
                "changed since this credential was saved. Returning None to avoid passing "
                "ciphertext as a password. Original error: %s", exc
            )
            return None
        # Value is plain-text (stored before encryption was introduced) — return as-is.
        return value


def is_encrypted(value: Optional[str]) -> bool:
    """True if the value looks like a Fernet token."""
    if not value:
        return False
    try:
        return value.encode().startswith(_FERNET_PREFIX)
    except Exception:
        return False
