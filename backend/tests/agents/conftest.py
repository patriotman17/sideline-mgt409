"""Shared fixtures for AI tests. No test makes a real (paid) model call."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from pydantic import BaseModel, SecretStr
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.agents.audit import AuditLog
from app.agents.budget import RateLimiter, SpendTracker
from app.agents.service import AIService
from app.core.config import Settings

FAKE_KEY = "pk-test-SECRET-DO-NOT-LOG-1234567890"

Answer = dict[str, Any] | Callable[[dict[str, Any]], dict[str, Any]]


def tool_returns(messages: list[ModelMessage]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for m in messages:
        for p in getattr(m, "parts", []):
            if isinstance(p, ToolReturnPart):
                c = p.content
                out[p.tool_name] = c.model_dump() if isinstance(c, BaseModel) else c
    return out


def scripted(calls: list[tuple[str, dict[str, Any]]], answer: Answer) -> FunctionModel:
    """First turn: call ``calls``; second turn: return the structured answer (may read tool results)."""

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        returns = tool_returns(messages)
        if calls and not returns:
            return ModelResponse(parts=[ToolCallPart(name, args) for name, args in calls])
        out = answer(returns) if callable(answer) else answer
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, out)])

    return FunctionModel(fn, model_name="scripted-test-model")


def simple_answer(text: str = "ok", tool: str = "get_game_state", **extra: Any) -> dict[str, Any]:
    return {
        "answer": text,
        "evidence": [{"tool": tool, "fact": text}],
        "uncertainty": None,
        "confidence": "high",
        "answerable": True,
        **extra,
    }


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "portkey_api_key": SecretStr(FAKE_KEY),
        "ai_model": "gpt-6-luna",
        "ai_audit_log_path": None,
        "ai_daily_budget_usd": 1.0,
        "ai_rate_limit_per_minute": 100,
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def make_service() -> Callable[..., AIService]:
    def build(model: Model | Callable[[Settings], Model], **settings_overrides: Any) -> AIService:
        settings = make_settings(**settings_overrides)
        factory = model if callable(model) and not isinstance(model, Model) else (lambda _s: model)
        return AIService(
            settings,
            model_factory=factory,
            audit=AuditLog(settings),
            spend=SpendTracker(settings.ai_daily_budget_usd),
            limiter=RateLimiter(settings.ai_rate_limit_per_minute),
        )

    return build


# ---------------------------------------------------------------- multi-turn scripting


def history_text(messages: list[ModelMessage]) -> list[str]:
    """User prompts and plain-text assistant turns sent to the model, in order (tool traffic excluded)."""
    from pydantic_ai.messages import ModelRequest, TextPart, UserPromptPart

    out: list[str] = []
    for m in messages:
        for p in getattr(m, "parts", []):
            if isinstance(m, ModelRequest) and isinstance(p, UserPromptPart) and isinstance(p.content, str):
                out.append(f"user: {p.content}")
            elif isinstance(p, TextPart):
                out.append(f"assistant: {p.content}")
    return out


class Step:
    """One scripted turn: assert on the context received, call tools, answer from their results."""

    def __init__(
        self,
        calls: list[tuple[str, dict[str, Any]]],
        answer: Callable[[dict[str, Any]], str],
        *,
        expect_history: list[str] | None = None,
        forbid_history: list[str] | None = None,
        tool: str = "get_player_stats",
    ):
        self.calls, self.answer, self.tool = calls, answer, tool
        self.expect_history = expect_history or []
        self.forbid_history = forbid_history or []
        self.seen_history: list[str] = []


def conversation_model(steps: list[Step]) -> FunctionModel:
    """Plays ``steps`` in order, one per agent run."""
    state = {"i": 0}

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        step = steps[state["i"]]
        returns = tool_returns(messages)
        if not returns:
            hist = history_text(messages)
            step.seen_history = hist
            joined = "\n".join(hist)
            for needle in step.expect_history:
                assert needle in joined, f"expected {needle!r} in history:\n{joined}"
            for needle in step.forbid_history:
                assert needle not in joined, f"unexpected {needle!r} in history:\n{joined}"
            return ModelResponse(parts=[ToolCallPart(name, args) for name, args in step.calls])
        state["i"] += 1
        text = step.answer(returns)
        out = {
            "answer": text,
            "evidence": [{"tool": step.tool, "fact": text}],
            "uncertainty": None,
            "confidence": "high",
            "answerable": True,
        }
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, out)])

    return FunctionModel(fn, model_name="scripted-conversation")
