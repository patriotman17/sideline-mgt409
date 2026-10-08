"""Model construction. All provider traffic goes through the Portkey gateway by default.

Keys come only from server-side settings and are sent only as request headers
to the configured gateway — never logged, cached, or returned to clients.
"""

from __future__ import annotations

from openai import AsyncOpenAI
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from app.core.config import Settings

SETUP_MESSAGE = (
    "Sideline AI isn't configured. Add PORTKEY_API_KEY to the repo-root .env (and optionally "
    "AI_MODEL in backend/.env, default gpt-6-luna), then restart the backend."
)


class AINotConfigured(RuntimeError):
    def __init__(self) -> None:
        super().__init__(SETUP_MESSAGE)


def build_model(settings: Settings) -> Model:
    if not settings.ai_configured or settings.portkey_api_key is None:
        raise AINotConfigured()
    key = settings.portkey_api_key.get_secret_value()
    headers = {"x-portkey-api-key": key}
    if settings.portkey_provider:
        headers["x-portkey-provider"] = settings.portkey_provider
    client = AsyncOpenAI(
        base_url=settings.ai_base_url,
        api_key=key,
        default_headers=headers,
        timeout=settings.ai_timeout_seconds,
        max_retries=1,
    )
    return OpenAIChatModel(settings.ai_model, provider=OpenAIProvider(openai_client=client))
