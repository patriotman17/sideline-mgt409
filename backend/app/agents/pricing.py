"""Inference cost estimates (USD). Estimates only — billing through Portkey/Azure may differ."""

from __future__ import annotations

from decimal import Decimal

from app.core.config import Settings


def estimate_cost(
    settings: Settings, model: str, *, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0
) -> Decimal | None:
    """Explicit price overrides win; otherwise use the bundled genai-prices data. ``None`` = unknown."""
    if settings.ai_input_price_per_mtok is not None and settings.ai_output_price_per_mtok is not None:
        per_in = Decimal(str(settings.ai_input_price_per_mtok)) / 1_000_000
        per_out = Decimal(str(settings.ai_output_price_per_mtok)) / 1_000_000
        return (per_in * input_tokens + per_out * output_tokens).quantize(Decimal("0.000001"))
    try:
        from genai_prices import Usage, calc_price

        price = calc_price(
            Usage(input_tokens=input_tokens, output_tokens=output_tokens, cache_read_tokens=cache_read_tokens),
            model_ref=model,
            provider_id="openai",
        )
        return Decimal(str(price.total_price)).quantize(Decimal("0.000001"))
    except Exception:  # unknown model or missing price data
        return None
