from __future__ import annotations
from typing import Optional
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger("dq_platform.llm")

# Approximate chars-per-token ratio used only for cache-eligibility check.
_CHARS_PER_TOKEN = 4
# Anthropic requires ≥1024 cached tokens to honour cache_control.
_CLAUDE_CACHE_MIN_CHARS = 1024 * _CHARS_PER_TOKEN


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        ...


# ── Concrete providers ────────────────────────────────────────────────────────

class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        import httpx
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{self.base_url}/api/chat",
                    json={"model": self.model, "messages": messages, "stream": False},
                )
                resp.raise_for_status()
                return resp.json()["message"]["content"]
        except httpx.ConnectError:
            msg = (
                f"Cannot connect to Ollama at {self.base_url}. "
                f"If running in Docker, set the URL to http://host.docker.internal:11434 "
                f"in Settings → LLM / AI."
            )
            logger.error(msg)
            raise RuntimeError(msg)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                available = await self.list_models()
                hint = (
                    f" Available models: {', '.join(available)}."
                    " Update the model name in Settings → LLM / AI."
                ) if available else f" Run: ollama pull {self.model}"
                raise RuntimeError(f"Model '{self.model}' not found in Ollama.{hint}")
            raise RuntimeError(f"Ollama HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            raise RuntimeError(str(e))

    async def list_models(self) -> list[str]:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                resp.raise_for_status()
                return [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            return []


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        # Create client once; avoids per-call construction overhead.
        if api_key:
            from openai import AsyncOpenAI
            self._client: "Optional[AsyncOpenAI]" = AsyncOpenAI(api_key=api_key)
        else:
            self._client = None

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key or self._client is None:
            raise RuntimeError("OpenAI API key is not configured. Add it in Settings → LLM / AI.")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
            )
            tok = resp.usage
            if tok:
                logger.debug(
                    "OpenAI usage: prompt=%d completion=%d total=%d",
                    tok.prompt_tokens, tok.completion_tokens, tok.total_tokens,
                )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            raise RuntimeError(f"OpenAI: {e}")


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        # Create client once; avoids per-call construction overhead.
        if api_key:
            import anthropic
            self._client: "Optional[anthropic.AsyncAnthropic]" = anthropic.AsyncAnthropic(api_key=api_key)
        else:
            self._client = None

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key or self._client is None:
            raise RuntimeError("Anthropic API key is not configured. Add it in Settings → LLM / AI.")

        # ── Prompt caching ────────────────────────────────────────────────────
        # Mark system prompts ≥1024 tokens as ephemeral cache candidates.
        # Within a 5-minute window, cached tokens cost only 10% of normal input price.
        if system and len(system) >= _CLAUDE_CACHE_MIN_CHARS:
            system_payload: list | str = [
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
            ]
        else:
            system_payload = system  # type: ignore[assignment]

        # Cache large user context blocks (prompt > 4096 chars ≈ 1024 tokens).
        if len(prompt) > _CLAUDE_CACHE_MIN_CHARS:
            user_content: list | str = [
                {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}
            ]
        else:
            user_content = prompt

        kwargs: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": user_content}],
        }
        if system_payload:
            kwargs["system"] = system_payload

        try:
            msg = await self._client.messages.create(**kwargs)
            usage = msg.usage
            logger.debug(
                "Claude usage: input=%d output=%d cache_write=%d cache_read=%d",
                usage.input_tokens,
                usage.output_tokens,
                getattr(usage, "cache_creation_input_tokens", 0),
                getattr(usage, "cache_read_input_tokens", 0),
            )
            return msg.content[0].text
        except Exception as e:
            logger.error(f"Claude error: {e}")
            raise RuntimeError(f"Claude: {e}")


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key:
            raise RuntimeError("Gemini API key is not configured. Add it in Settings → LLM / AI.")
        try:
            import asyncio
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=self.api_key)
            config = types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
            ) if system else types.GenerateContentConfig(max_output_tokens=max_tokens)

            # google-genai's generate_content is synchronous — run it in a thread
            # so we don't block the asyncio event loop during inference.
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=self.model,
                contents=prompt,
                config=config,
            )
            return response.text or ""
        except Exception as e:
            logger.error(f"Gemini error: {e}")
            raise RuntimeError(f"Gemini: {e}")


# ── DB-aware factory ──────────────────────────────────────────────────────────

async def get_provider_from_db(name: Optional[str], db) -> LLMProvider:
    """
    Build an LLM provider using settings from the app_config DB table.
    Falls back to environment variables if a key is missing from the DB.
    This means changes made in the Settings UI take effect immediately
    without restarting the server.
    """
    from app.services.config_service import get_value
    from app.core.config import settings

    async def cfg(key: str, fallback: str = "") -> str:
        val = await get_value(key, db)
        return val if val else fallback

    provider_name = (
        name
        or await cfg("llm_provider", settings.llm_provider)
        or "ollama"
    ).lower()

    if provider_name == "ollama":
        return OllamaProvider(
            base_url=await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434"),
            model=await cfg("ollama_model", settings.ollama_model or "qwen2.5:7b-instruct"),
        )
    if provider_name == "openai":
        return OpenAIProvider(
            api_key=await cfg("openai_api_key", settings.openai_api_key),
            model=await cfg("openai_model", settings.openai_model or "gpt-4o-mini"),
        )
    if provider_name in ("claude", "anthropic"):
        return ClaudeProvider(
            api_key=await cfg("anthropic_api_key", settings.anthropic_api_key),
            model=await cfg("claude_model", settings.claude_model or "claude-3-5-sonnet-latest"),
        )
    if provider_name in ("gemini_flash", "gemini"):
        return GeminiProvider(
            api_key=await cfg("gemini_api_key", settings.gemini_api_key),
            model=await cfg("gemini_model", settings.gemini_model or "gemini-2.5-flash"),
        )
    # Unknown provider → default to Ollama
    return OllamaProvider(
        base_url=await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434"),
        model=await cfg("ollama_model", settings.ollama_model or "qwen2.5:7b-instruct"),
    )


# Kept for backward compatibility with any callers that don't have a DB session
def get_provider(name: Optional[str] = None) -> LLMProvider:
    from app.core.config import settings
    provider_name = (name or settings.llm_provider or "ollama").lower()
    if provider_name == "openai":
        return OpenAIProvider(settings.openai_api_key, settings.openai_model or "gpt-4o-mini")
    if provider_name in ("claude", "anthropic"):
        return ClaudeProvider(settings.anthropic_api_key, settings.claude_model or "claude-3-5-sonnet-latest")
    if provider_name in ("gemini_flash", "gemini"):
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model or "gemini-2.5-flash")
    return OllamaProvider(
        settings.ollama_base_url or "http://localhost:11434",
        settings.ollama_model or "qwen2.5:7b-instruct",
    )
