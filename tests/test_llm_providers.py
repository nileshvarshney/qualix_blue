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


def test_groq_provider_exists():
    from app.services.llm_providers import GroqProvider
    p = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
    assert p.api_key == "gsk_test"
    assert p.model == "llama-3.3-70b-versatile"


def test_get_provider_groq_returns_groq_provider():
    from app.services.llm_providers import get_provider, GroqProvider
    import os
    os.environ["GROQ_API_KEY"] = "gsk_test"
    p = get_provider("groq")
    assert isinstance(p, GroqProvider)


def test_groq_in_valid_provider_names():
    """test_llm endpoint must handle 'groq' as a valid provider name."""
    import inspect
    from app.api import config as config_module
    src = inspect.getsource(config_module.test_llm)
    assert "groq" in src, "test_llm endpoint missing 'groq' branch"
