"""Tests for LLM provider config additions."""
from app.core.config import settings


def test_settings_has_groq_api_key():
    assert hasattr(settings, "groq_api_key")
    assert isinstance(settings.groq_api_key, str)


def test_settings_has_groq_model():
    assert hasattr(settings, "groq_model")
    assert settings.groq_model == "llama-3.3-70b-versatile"


def test_groq_config_defaults_present():
    from app.services.config_service import CONFIG_DEFAULTS
    keys = {d["key"] for d in CONFIG_DEFAULTS}
    assert "groq_api_key" in keys
    assert "groq_model" in keys
