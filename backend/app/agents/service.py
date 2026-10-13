"""Ask Sideline / insight orchestration.

Pipeline for every AI request:
  configured? → rate limit → cache (keyed by exact replay position) → daily budget →
  agent run (usage limits + timeout) → grounding check → spend + audit.

Cache keys always include the replay's ``state_version`` (game, cursor, data
hash), so an answer computed later in a game can never be served earlier.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from pydantic_ai.exceptions import (
    ContentFilterError,
    ModelAPIError,
    ModelHTTPError,
    UnexpectedModelBehavior,
    UsageLimitExceeded,
)
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModelSettings
from pydantic_ai.usage import UsageLimits

from app.agents.agent import (
    DEFAULT_STYLE,
    PROMPT_VERSION,
    AgentDeps,
    AnswerStyle,
    Clarification,
    SidelineAnswer,
    sideline_agent,
)
from app.agents.audit import AuditLog, AuditRecord, AuditStatus
from app.agents.budget import BudgetExceeded, RateLimited, RateLimiter, SpendTracker
from app.agents.cache import TTLCache
from app.agents.conversation import (
    Conversation,
    ConversationContext,
    Turn,
    ambiguous_reference,
    resolve_pronoun,
)
from app.agents.llm import SETUP_MESSAGE, build_model
from app.agents.pricing import estimate_cost
from app.agents.sanitize import clean_text, normalize_question
from app.agents.stats import player_stats
from app.agents.view import ReplayView
from app.core.config import Settings
from app.replay.models import Game

BLOCKED_MESSAGE = "That question was blocked by the AI provider's safety filter. Try rephrasing it."


def _is_content_filter(exc: Exception) -> bool:
    if isinstance(exc, ContentFilterError):
        return True
    if isinstance(exc, ModelHTTPError) and isinstance(exc.body, dict):
        body = exc.body
        return body.get("code") == "content_filter" or "content management policy" in str(body.get("message", ""))
    return False


#: Charged against the budget when a run's cost can't be estimated (conservative).
UNKNOWN_COST_FALLBACK = Decimal("0.01")


class AIError(Exception):
    """An AI request that couldn't produce an answer. ``code`` is safe to show clients."""

    def __init__(self, code: AuditStatus, message: str, status_code: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class AsOf(BaseModel):
    cursor: int
    period: str
    clock: str | None
    state_version: str


class Usage(BaseModel):
    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float | None = None


class AskResult(BaseModel):
    request_id: str
    status: Literal["ok", "cached", "clarification"]
    answer: SidelineAnswer
    as_of: AsOf
    model: str
    usage: Usage
    latency_ms: float
    grounding_issues: list[str] = []
    #: Earlier turns from this session's chat that were sent as context (0 = standalone question).
    context_turns: int = 0
    #: Tied players this answer names; a following "he/his" will be clarified rather than guessed.
    ambiguous_players: list[str] = []


@dataclass
class _Run:
    answer: SidelineAnswer
    record: AuditRecord
    tied_leaders: list[str]


def as_of(view: ReplayView) -> AsOf:
    s = view.state
    period = f"Q{s.quarter}" if s.quarter <= 4 else "OT"
    clock = None if s.clock_seconds is None else f"{s.clock_seconds // 60}:{s.clock_seconds % 60:02d}"
    return AsOf(cursor=view.cursor, period=period, clock=clock, state_version=view.state_version)


def history_messages(context: ConversationContext) -> list[ModelMessage]:
    """Earlier turns as plain user/assistant messages. Answers are labeled with their replay
    position so the model knows they may be outdated; tool outputs are never replayed."""
    messages: list[ModelMessage] = []
    if context.earlier_questions:
        listed = "; ".join(context.earlier_questions)
        messages.append(
            ModelRequest(parts=[UserPromptPart(f"(Earlier questions in this chat, answers omitted: {listed})")])
        )
        messages.append(ModelResponse(parts=[TextPart("Noted.")]))
    for t in context.turns:
        messages.append(ModelRequest(parts=[UserPromptPart(t.question)]))
        stamp = f"[answered as of {t.period} {t.clock or ''}, play {t.cursor}]".replace("  ", " ")
        messages.append(ModelResponse(parts=[TextPart(f"{stamp} {t.answer}")]))
    return messages


def check_grounding(answer: SidelineAnswer, view: ReplayView, called: set[str]) -> tuple[SidelineAnswer, list[str]]:
    """Drop evidence that cites tools never called or plays not yet revealed; downgrade confidence."""
    issues: list[str] = []
    kept = []
    for ev in answer.evidence:
        if ev.tool not in called:
            issues.append(f"evidence cites uncalled tool {ev.tool}")
        elif ev.play_sequence is not None and not 0 <= ev.play_sequence < view.cursor:
            issues.append(f"evidence cites unrevealed play {ev.play_sequence}")
        else:
            kept.append(ev)
    if answer.answerable and not kept:
        issues.append("answer has no supporting evidence")
    confidence = answer.confidence
    if issues and confidence == "high":
        confidence = "medium"
    if answer.answerable and not called:
        confidence = "low"
    return answer.model_copy(update={"evidence": kept, "confidence": confidence}), issues


class AIService:
    def __init__(
        self,
        settings: Settings,
        *,
        model_factory: Callable[[Settings], Model] = build_model,
        audit: AuditLog | None = None,
        spend: SpendTracker | None = None,
        limiter: RateLimiter | None = None,
        answer_cache: TTLCache[AskResult] | None = None,
        insight_cache: TTLCache[str] | None = None,
    ):
        self.settings = settings
        self._model_factory = model_factory
        self.audit = audit or AuditLog(settings)
        self.spend = spend or SpendTracker(settings.ai_daily_budget_usd)
        self.limiter = limiter or RateLimiter(settings.ai_rate_limit_per_minute)
        self.answer_cache: TTLCache[AskResult] = answer_cache or TTLCache(maxsize=2000)
        self.insight_cache: TTLCache[str] = insight_cache or TTLCache(maxsize=5000, ttl_seconds=24 * 3600)

    # ------------------------------------------------------------ public

    def status(self) -> dict[str, object]:
        return {
            "configured": self.settings.ai_configured,
            "model": self.settings.ai_model,
            "gateway": "portkey" if "portkey" in self.settings.ai_base_url else "custom",
            "daily_budget_usd": float(self.spend.budget),
            "spent_today_usd": float(self.spend.spent_today),
            "setup": None if self.settings.ai_configured else SETUP_MESSAGE,
        }

    async def ask(
        self,
        *,
        game: Game,
        cursor: int,
        question: str,
        session_id: str,
        conversation: Conversation | None = None,
        style: AnswerStyle | None = None,
    ) -> AskResult:
        """Answer ``question`` as of ``cursor``. With a ``conversation``, earlier turns from the same
        session (asked at or before ``cursor``) are sent as context and the new turn is recorded."""
        view = ReplayView.at(game, cursor)
        q = clean_text(question, max_length=500)
        style = style or DEFAULT_STYLE
        s = self.settings
        context = (
            conversation.context(view.cursor, max_turns=s.ai_history_turns, max_chars=s.ai_history_max_chars)
            if conversation is not None
            else ConversationContext(turns=(), earlier_questions=())
        )
        request_id = uuid.uuid4().hex[:12]
        base = AuditRecord(
            request_id=request_id,
            kind="ask",
            status="ok",
            game_id=view.info.game_id,
            cursor=view.cursor,
            session=session_id[:8],
            model=self.settings.ai_model,
            prompt_version=PROMPT_VERSION,
            question=q,
            history_turns=len(context.turns),
            context_fingerprint=context.fingerprint or None,
            answer_style=style.key,
        )
        try:
            self.limiter.hit(session_id)
        except RateLimited as exc:
            self.audit.write(base.model_copy(update={"status": "rate_limited"}))
            raise AIError("rate_limited", str(exc), 429) from None

        # "How many catches does he have?" right after a tie: ask which player instead of guessing.
        # Deterministic (no model call, no cost) and never cached.
        tied = ambiguous_reference(q, context.turns[-1] if context.turns else None)
        if tied:
            return self._clarify(q, tied, view, base, request_id, conversation, context)

        # Same position + same question + same conversation context -> same answer. Different
        # context (e.g. "how many yards does he have?" about a different player) never collides.
        key = (
            "ask",
            view.state_version,
            PROMPT_VERSION,
            s.ai_model,
            style.key,
            context.fingerprint,
            normalize_question(q),
        )
        cached = self.answer_cache.get(key)
        if cached is not None:
            self.audit.write(base.model_copy(update={"status": "cached"}))
            self._remember(conversation, q, cached.answer, view, request_id, tuple(cached.ambiguous_players))
            return cached.model_copy(
                update={"request_id": request_id, "status": "cached", "usage": Usage(), "latency_ms": 0.0}
            )

        run = await self._run(view, prompt=q, base=base, history=history_messages(context), style=style)
        # Only ties the answer actually names make a later pronoun ambiguous.
        named_ties = [p for p in run.tied_leaders if p in run.answer.answer]
        ambiguous = named_ties if len(named_ties) > 1 else []
        result = AskResult(
            request_id=request_id,
            status="ok",
            answer=run.answer,
            as_of=as_of(view),
            model=self.settings.ai_model,
            usage=Usage(
                requests=run.record.requests,
                input_tokens=run.record.input_tokens,
                output_tokens=run.record.output_tokens,
                estimated_cost_usd=run.record.estimated_cost_usd,
            ),
            latency_ms=run.record.latency_ms,
            grounding_issues=run.record.grounding_issues,
            context_turns=len(context.turns),
            ambiguous_players=ambiguous,
        )
        self.answer_cache.set(key, result)
        self._remember(conversation, q, run.answer, view, request_id, tuple(ambiguous))
        return result

    def _clarify(
        self,
        question: str,
        tied: tuple[str, ...],
        view: ReplayView,
        base: AuditRecord,
        request_id: str,
        conversation: Conversation | None,
        context: ConversationContext,
    ) -> AskResult:
        teams = {name: p.team for name, p in player_stats(view).items()}
        names = [f"{p} ({teams[p]})" if teams.get(p) else p for p in tied]
        listed = " and ".join(names) if len(names) == 2 else ", ".join(names[:-1]) + f", and {names[-1]}"
        text = f"{listed} are tied, so I'm not sure who you mean. Which player?"
        answer = SidelineAnswer(
            answer=text,
            confidence="low",
            answerable=False,
            uncertainty="The question refers to one player, but the previous answer named several tied players.",
            clarification=Clarification(
                question="Which player?", options=[resolve_pronoun(question, p) for p in tied[:4]]
            ),
        )
        self.audit.write(base.model_copy(update={"status": "clarification"}))
        # Keep the ambiguity on this turn too, so repeating "he" asks again rather than guessing.
        self._remember(conversation, question, answer, view, request_id, tied)
        return AskResult(
            request_id=request_id,
            status="clarification",
            answer=answer,
            as_of=as_of(view),
            model=self.settings.ai_model,
            usage=Usage(),
            latency_ms=0.0,
            context_turns=len(context.turns),
            ambiguous_players=list(tied),
        )

    @staticmethod
    def _remember(
        conversation: Conversation | None,
        question: str,
        answer: SidelineAnswer,
        view: ReplayView,
        request_id: str,
        ambiguous: tuple[str, ...] = (),
    ) -> None:
        if conversation is None:
            return
        a = as_of(view)
        conversation.add(
            Turn(
                question=question,
                answer=answer.answer,
                cursor=view.cursor,
                period=a.period,
                clock=a.clock,
                request_id=request_id,
                ambiguous_players=ambiguous,
            )
        )

    async def explain(self, *, game: Game, sequence: int, kind: str, headline: str, facts: str) -> str:
        """AI explanation of a deterministic insight, using only data up to that play. Shared cache."""
        view = ReplayView.at(game, sequence + 1)
        key = ("insight", view.state_version, sequence, kind, PROMPT_VERSION, self.settings.ai_model)
        cached = self.insight_cache.get(key)
        if cached is not None:
            return cached
        base = AuditRecord(
            request_id=uuid.uuid4().hex[:12],
            kind="insight",
            status="ok",
            game_id=view.info.game_id,
            cursor=view.cursor,
            model=self.settings.ai_model,
            prompt_version=PROMPT_VERSION,
            question=f"insight:{kind}@{sequence}",
        )
        prompt = (
            "Explain in at most 2 sentences why this just-completed moment matters, using tools to check "
            f"context. Moment (verified by the replay engine): {clean_text(headline, max_length=200)}. "
            f"Facts: {clean_text(facts, max_length=400)}"
        )
        run = await self._run(view, prompt=prompt, base=base)
        self.insight_cache.set(key, run.answer.answer)
        return run.answer.answer

    def cached_explanation(self, *, game: Game, sequence: int, kind: str) -> str | None:
        view_version = ReplayView.at(game, sequence + 1).state_version
        return self.insight_cache.get(("insight", view_version, sequence, kind, PROMPT_VERSION, self.settings.ai_model))

    # ------------------------------------------------------------ internals

    def _fail(
        self, base: AuditRecord, code: AuditStatus, message: str, status_code: int, started: float, **extra: object
    ) -> AIError:
        self.audit.write(
            base.model_copy(
                update={"status": code, "latency_ms": round((time.perf_counter() - started) * 1000, 1), **extra}
            )
        )
        return AIError(code, message, status_code)

    async def _run(
        self,
        view: ReplayView,
        *,
        prompt: str,
        base: AuditRecord,
        history: list[ModelMessage] | None = None,
        style: AnswerStyle = DEFAULT_STYLE,
    ) -> _Run:
        started = time.perf_counter()
        if not self.settings.ai_configured:
            raise self._fail(base, "not_configured", SETUP_MESSAGE, 503, started)
        try:
            self.spend.check()
        except BudgetExceeded as exc:
            raise self._fail(base, "budget_exceeded", str(exc), 429, started) from None

        deps = AgentDeps(view=view, style=style)
        s = self.settings
        limits = UsageLimits(
            request_limit=s.ai_request_limit,
            tool_calls_limit=s.ai_tool_calls_limit,
            output_tokens_limit=s.ai_max_output_tokens * s.ai_request_limit,
        )
        settings = OpenAIChatModelSettings(max_tokens=s.ai_max_output_tokens)
        if s.ai_reasoning_effort:
            settings["openai_reasoning_effort"] = s.ai_reasoning_effort  # type: ignore[typeddict-item]
        try:
            model = self._model_factory(s)
            result = await asyncio.wait_for(
                sideline_agent.run(
                    prompt,
                    message_history=history or None,
                    deps=deps,
                    model=model,
                    usage_limits=limits,
                    model_settings=settings,
                ),
                timeout=s.ai_timeout_seconds * 2,
            )
        except TimeoutError:
            raise self._fail(
                base, "timeout", "Sideline AI took too long to respond.", 504, started, tool_calls=deps.tool_calls
            ) from None
        except UsageLimitExceeded as exc:
            raise self._fail(
                base,
                "limit_exceeded",
                "The question needed more work than allowed; try a narrower question.",
                502,
                started,
                tool_calls=deps.tool_calls,
                error_type=type(exc).__name__,
                error=str(exc),
            ) from None
        except (ModelAPIError, UnexpectedModelBehavior, ContentFilterError) as exc:
            if _is_content_filter(exc):
                raise self._fail(
                    base,
                    "blocked",
                    BLOCKED_MESSAGE,
                    422,
                    started,
                    tool_calls=deps.tool_calls,
                    error_type=type(exc).__name__,
                    error="provider content filter",
                ) from None
            raise self._fail(
                base,
                "model_error",
                "Sideline AI is unavailable right now. Try again shortly.",
                502,
                started,
                tool_calls=deps.tool_calls,
                error_type=type(exc).__name__,
                error=str(exc),
            ) from None
        except Exception as exc:  # never leak internals to clients
            raise self._fail(
                base,
                "error",
                "Something went wrong answering that.",
                500,
                started,
                tool_calls=deps.tool_calls,
                error_type=type(exc).__name__,
                error=str(exc),
            ) from None

        usage = result.usage
        cost = estimate_cost(
            s,
            s.ai_model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=usage.cache_read_tokens,
        )
        self.spend.record(cost, fallback=UNKNOWN_COST_FALLBACK)
        answer, issues = check_grounding(result.output, view, {c.name for c in deps.tool_calls if c.ok})
        record = self.audit.write(
            base.model_copy(
                update={
                    "status": "ok",
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                    "requests": usage.requests,
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "estimated_cost_usd": float(cost) if cost is not None else None,
                    "tool_calls": deps.tool_calls,
                    "grounding_issues": issues,
                }
            )
        )
        return _Run(answer=answer, record=record, tied_leaders=deps.tied_leaders)
