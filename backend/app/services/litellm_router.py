"""Universal LLM routing via LiteLLM.

Builds the appropriate kwargs for litellm.acompletion based on the model's
provider and any stored API keys.  Supports streaming.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, AsyncIterator

import litellm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.config import settings
from app.models import ModelRecord, Provider

logger = logging.getLogger(__name__)

# Silence litellm internal noise
litellm.suppress_debug_info = True
litellm.drop_params = True


async def _resolve_provider(provider_name: str, session: AsyncSession) -> Provider | None:
    """Fetch the full Provider row from the DB."""
    result = await session.execute(
        select(Provider).where(Provider.name == provider_name)
    )
    return result.scalars().first()


def _resolve_litellm_model(model_id: str, provider_name: str, base_url: str) -> str:
    """Return the correctly-prefixed model string for LiteLLM.

    Routing rules (order matters — first match wins):
      - Ollama          → "ollama/<model_id>"
      - OpenRouter      → "openrouter/<model_id>"
      - Anthropic       → "anthropic/<model_id>"
      - Nvidia          → "openai/<model_id>"  (OpenAI-compat with custom base)
      - OpenAI          → "openai/<model_id>"
      - Gemini          → "gemini/<model_id>"
      - Unknown custom  → "openai/<model_id>"  (assumes OpenAI-compat)
    """
    # Ollama
    if provider_name == "ollama" or model_id.startswith("ollama/"):
        return model_id if model_id.startswith("ollama/") else f"ollama/{model_id}"

    # Provider detection via base_url
    base = base_url.lower()

    if "openrouter.ai" in base:
        return model_id if model_id.startswith("openrouter/") else f"openrouter/{model_id}"

    if "anthropic.com" in base:
        return model_id if model_id.startswith("anthropic/") else f"anthropic/{model_id}"

    if "nvidia.com" in base:
        return model_id if model_id.startswith("openai/") else f"openai/{model_id}"

    if "openai.com" in base:
        return model_id if model_id.startswith("openai/") else f"openai/{model_id}"

    # Gemini (by provider name, since Google has various URLs)
    if provider_name == "gemini":
        return model_id if model_id.startswith("gemini/") else f"gemini/{model_id}"

    # Unknown custom provider — assume OpenAI-compatible
    if base:
        return model_id if model_id.startswith("openai/") else f"openai/{model_id}"

    return model_id


def sanitize_kwargs_for_provider(model_string: str, kwargs: dict[str, Any], base_url: str = "") -> dict[str, Any]:
    """Strip parameters that are incompatible with specific providers.

    Currently handles:
      - Anthropic: cannot receive both temperature and top_p.
        We always drop top_p for Anthropic models.
    """
    is_anthropic = model_string.startswith("anthropic/") or (
        base_url and "anthropic.com" in base_url.lower()
    )
    if is_anthropic:
        kwargs.pop("top_p", None)
    return kwargs


def _build_extra_headers(base_url: str, model_record: ModelRecord | None) -> dict[str, str]:
    """Build provider-specific extra headers."""
    headers: dict[str, str] = {}
    base = base_url.lower()

    if "openrouter.ai" in base:
        headers["HTTP-Referer"] = os.environ.get("NEXT_PUBLIC_BACKEND_URL", "http://localhost:3000")
        headers["X-Title"] = "ChatUI"

    if "anthropic.com" in base:
        # Use version from model record if available, else sensible default
        version = "2023-06-01"
        if model_record and model_record.context_window:
            # context_window field may store version for Anthropic models
            val = str(model_record.context_window).strip()
            if val and "-" in val and len(val) <= 12:
                version = val
        headers["anthropic-version"] = version

    return headers


async def build_completion_kwargs(
    model_id: str,
    messages: list[dict[str, Any]],
    session: AsyncSession,
    *,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    top_p: float = 1.0,
    stream: bool = True,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assemble keyword arguments for litellm.acompletion."""

    # Look up model record
    result = await session.execute(
        select(ModelRecord).where(ModelRecord.model_id == model_id)
    )
    record = result.scalars().first()

    provider_name = record.provider_name if record else _infer_provider(model_id)

    # Always fetch provider row fresh from DB
    provider = await _resolve_provider(provider_name, session)

    # Resolve base_url: DB first → env fallback for Ollama
    base_url = ""
    if provider and provider.base_url:
        base_url = provider.base_url
    elif provider_name == "ollama":
        base_url = settings.ollama_base_url

    # Resolve API key: DB first → env fallback
    api_key = ""
    if provider and provider.api_key:
        api_key = provider.api_key
    else:
        env_map = {
            "openai": settings.openai_api_key,
            "anthropic": settings.anthropic_api_key,
            "gemini": settings.gemini_api_key,
        }
        api_key = env_map.get(provider_name, "")

    # Build the correctly-prefixed model name for LiteLLM
    litellm_model = _resolve_litellm_model(model_id, provider_name, base_url)

    # Build provider-specific extra headers
    extra_headers = _build_extra_headers(base_url, record)

    logger.info(
        "LiteLLM call → model=%s  provider=%s  base_url=%s  has_key=%s  headers=%s",
        litellm_model, provider_name, base_url or "(none)", bool(api_key),
        list(extra_headers.keys()) if extra_headers else "none",
    )

    kwargs: dict[str, Any] = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": top_p,
        "stream": stream,
        "timeout": 60,
    }

    if api_key:
        kwargs["api_key"] = api_key

    # For Anthropic native routing, do NOT pass api_base — LiteLLM handles it.
    # For all others that have a custom base_url, pass it as api_base.
    if base_url and "anthropic.com" not in base_url.lower():
        kwargs["api_base"] = base_url

    if extra_headers:
        kwargs["extra_headers"] = extra_headers

    # Tools (MCP)
    if tools:
        kwargs["tools"] = tools

    # Strip provider-incompatible parameters
    sanitize_kwargs_for_provider(litellm_model, kwargs, base_url)

    return kwargs


def _infer_provider(model_id: str) -> str:
    """Best-effort provider inference from model_id prefix."""
    lower = model_id.lower()
    if lower.startswith("ollama/"):
        return "ollama"
    if lower.startswith("gemini/"):
        return "gemini"
    if "claude" in lower:
        return "anthropic"
    return "openai"


async def is_model_local(model_id: str, session: AsyncSession) -> bool:
    result = await session.execute(
        select(ModelRecord).where(ModelRecord.model_id == model_id)
    )
    record = result.scalars().first()
    if record:
        return record.is_local
    return model_id.lower().startswith("ollama/")


async def chat_completion(
    kwargs: dict[str, Any],
) -> Any:
    """Non-streaming completion."""
    kwargs["stream"] = False
    response = await litellm.acompletion(**kwargs)
    return response


async def chat_completion_stream(
    kwargs: dict[str, Any],
) -> AsyncIterator[Any]:
    """Streaming completion — yields SSE-compatible chunks."""
    kwargs["stream"] = True
    try:
        response = await litellm.acompletion(**kwargs)
        async for chunk in response:
            yield chunk
    except Exception as e:
        logger.error("LiteLLM streaming error: %s", e)
        raise


# ── Mode overrides ───────────────────────────────────────────

_ANTHROPIC_THINKING_MODELS = ("claude-3-5", "claude-3-7", "claude-sonnet-4", "claude-opus-4", "haiku-4")


def apply_mode_overrides(mode: str | None, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Apply mode-specific parameter overrides to the LiteLLM kwargs.

    Temperature and max_tokens are always controlled by the frontend sliders.
    The only backend override is adding the Anthropic thinking parameter
    when mode is "thinking" and the model supports it.
    """
    if not mode or mode == "auto":
        return kwargs

    if mode == "fast":
        return kwargs

    if mode == "thinking":
        litellm_model = kwargs.get("model", "")
        if litellm_model.startswith("anthropic/"):
            model_name = litellm_model.lower()
            if any(sub in model_name for sub in _ANTHROPIC_THINKING_MODELS):
                kwargs["thinking"] = {"type": "enabled", "budget_tokens": 5000}

        return kwargs

    return kwargs
