"""Multi-turn Ask Sideline: context, follow-ups, player-vs-team, isolation, leakage, caching."""

from __future__ import annotations

import asyncio

import pytest

from app.agents import tools as t
from app.agents.conversation import Conversation, Turn
from app.agents.service import AIError
from app.agents.view import ReplayView
from app.replay.models import Game, PlayKind
from tests.agents.conftest import Step, conversation_model, scripted, simple_answer


def run(coro):
    return asyncio.run(coro)


def halftime(game: Game) -> int:
    return next(e for e in game.events if e.kind is PlayKind.END_QUARTER and e.quarter == 2).sequence + 1


def leader(returns, key: str = "leaderboard") -> str:
    row = returns["get_player_stats"][key][0]
    return f"{row['player']} ({row['team']}) leads with {row['value']} {row['stat']}."


# ---------------------------------------------------------------- the exact failing conversation


def test_rushing_leader_is_an_individual_player_across_both_teams(divisional):
    out = t.get_player_stats(ReplayView.at(divisional, halftime(divisional)), category="rushing")
    top = out.leaderboard[0]
    assert (top.player, top.team, top.value, top.rank) == ("J.Allen", "BUF", 51, 1)
    assert out.scope == "both teams" and set(out.leader_by_team) == {"KC", "BUF"}
    # Team totals are a different tool and a different number.
    assert {s.team: s.rushing_yards for s in t.get_team_stats(ReplayView.at(divisional, halftime(divisional))).teams}[
        "BUF"
    ] != 51


def test_failing_conversation_keeps_context_through_follow_ups(make_service, divisional):
    half = halftime(divisional)
    end = len(divisional.events)
    steps = [
        Step([("get_player_stats", {"category": "rushing"})], leader),
        Step(
            [("get_player_stats", {"category": "rushing"})],
            leader,
            expect_history=["user: Who has the most rushing yards?", "J.Allen (BUF) leads with 51 rushing yards"],
        ),
        Step(
            [("get_player_stats", {"category": "rushing", "team": "KC"})],
            leader,
            expect_history=["user: No, which player has the most?"],
        ),
        Step(
            [("get_player_stats", {"player": "C.Edwards-Helaire"})],
            lambda r: (
                f"{r['get_player_stats']['players'][0]['player']} has "
                f"{r['get_player_stats']['players'][0]['rushing']['yards']} rushing yards."
            ),
            expect_history=["user: What about the other team?", "(KC) leads with"],
        ),
        Step(
            [("get_player_stats", {"category": "rushing"})],
            leader,
            expect_history=["user: How many yards does he have?", f"play {half}]"],
        ),
    ]
    svc = make_service(conversation_model(steps))
    convo = Conversation()

    def ask(q: str, cursor: int = half):
        return run(svc.ask(game=divisional, cursor=cursor, question=q, session_id="s1", conversation=convo))

    first = ask("Who has the most rushing yards?")
    assert first.answer.answer == "J.Allen (BUF) leads with 51 rushing yards." and first.context_turns == 0
    second = ask("No, which player has the most?")
    assert second.answer.answer.startswith("J.Allen") and second.context_turns == 1
    other = ask("What about the other team?")
    assert "(KC) leads with" in other.answer.answer and other.context_turns == 2
    kc_leader_yards = t.get_player_stats(ReplayView.at(divisional, half), category="rushing", team="KC").leaderboard[0]
    assert other.answer.answer == f"{kc_leader_yards.player} (KC) leads with {kc_leader_yards.value} rushing yards."
    he = ask("How many yards does he have?")
    assert "rushing yards" in he.answer.answer
    # Replay moves on: "now" must use the current snapshot, not numbers from earlier answers.
    now = ask("Who leads now?", cursor=end)
    final_top = t.get_player_stats(ReplayView.at(divisional, end), category="rushing").leaderboard[0]
    assert now.answer.answer == f"{final_top.player} ({final_top.team}) leads with {final_top.value} rushing yards."
    assert final_top.player == "I.Pacheco" and now.as_of.cursor == end
    assert len(convo) == 5
    assert svc.audit.recent(1)[0].history_turns == 4


# ---------------------------------------------------------------- leakage, isolation, window, cache


def test_rewinding_excludes_turns_from_later_in_the_game(make_service, divisional):
    steps = [
        Step([("get_player_stats", {"category": "rushing"})], leader),
        Step(
            [("get_game_state", {})], lambda r: "ok", tool="get_game_state", forbid_history=["Pacheco", "86", "rushing"]
        ),
    ]
    svc = make_service(conversation_model(steps))
    convo = Conversation()
    late = run(
        svc.ask(
            game=divisional, cursor=150, question="Who has the most rushing yards?", session_id="s", conversation=convo
        )
    )
    assert "I.Pacheco" in late.answer.answer
    early = run(
        svc.ask(game=divisional, cursor=40, question="How many yards does he have?", session_id="s", conversation=convo)
    )
    assert early.context_turns == 0  # the cursor-150 turn is invisible at cursor 40
    assert steps[1].seen_history == ["user: How many yards does he have?"]


def test_history_never_replays_tool_outputs(make_service, divisional):
    steps = [
        Step([("get_recent_plays", {"limit": 3})], lambda r: "Three plays.", tool="get_recent_plays"),
        Step([("get_game_state", {})], lambda r: "ok", tool="get_game_state", forbid_history=["description_untrusted"]),
    ]
    svc = make_service(conversation_model(steps))
    convo = Conversation()
    for q in ("What just happened?", "And before that?"):
        run(svc.ask(game=divisional, cursor=60, question=q, session_id="s", conversation=convo))
    first_q, prior_answer, new_q = steps[1].seen_history
    assert (first_q, new_q) == ("user: What just happened?", "user: And before that?")
    assert prior_answer.startswith("assistant: [answered as of ") and prior_answer.endswith("play 60] Three plays.")


def test_conversations_are_isolated_between_sessions(make_service, divisional):
    steps = [
        Step([("get_player_stats", {"category": "rushing"})], leader),
        Step([("get_game_state", {})], lambda r: "ok", tool="get_game_state", forbid_history=["rushing"]),
    ]
    svc = make_service(conversation_model(steps))
    a, b = Conversation(), Conversation()
    run(svc.ask(game=divisional, cursor=80, question="Who has the most rushing yards?", session_id="a", conversation=a))
    res = run(
        svc.ask(game=divisional, cursor=80, question="How many yards does he have?", session_id="b", conversation=b)
    )
    assert res.context_turns == 0 and len(a) == 1 and len(b) == 1


def test_window_limits_turns_and_keeps_only_older_questions():
    convo = Conversation()
    for i in range(10):
        convo.add(
            Turn(question=f"question {i}", answer=f"answer {i} " + "x" * 100, cursor=10 + i, period="Q1", clock="5:00")
        )
    ctx = convo.context(100, max_turns=3, max_chars=10_000)
    assert [tq.question for tq in ctx.turns] == ["question 7", "question 8", "question 9"]
    assert ctx.earlier_questions == ("question 2", "question 3", "question 4", "question 5", "question 6")
    tight = convo.context(100, max_turns=10, max_chars=250)
    assert len(tight.turns) == 2  # character budget wins
    assert convo.context(12, max_turns=10, max_chars=10_000).turns[-1].cursor == 12  # nothing after the cursor


def test_cache_is_conversation_aware(make_service, divisional):
    svc = make_service(scripted([("get_game_state", {})], simple_answer("ok")))
    fresh_a = run(
        svc.ask(
            game=divisional,
            cursor=50,
            question="How many yards does he have?",
            session_id="a",
            conversation=Conversation(),
        )
    )
    fresh_b = run(
        svc.ask(
            game=divisional,
            cursor=50,
            question="How many yards does he have?",
            session_id="b",
            conversation=Conversation(),
        )
    )
    assert (fresh_a.status, fresh_b.status) == ("ok", "cached")  # identical (empty) context may share

    with_context = Conversation()
    with_context.add(Turn("Who has the most rushing yards?", "J.Cook leads.", 50, "Q2", "9:00"))
    contextual = run(
        svc.ask(
            game=divisional,
            cursor=50,
            question="How many yards does he have?",
            session_id="c",
            conversation=with_context,
        )
    )
    assert contextual.status == "ok"  # different context: never served the context-free answer

    other_context = Conversation()
    other_context.add(Turn("Who has the most receiving yards?", "D.Kincaid leads.", 50, "Q2", "9:00"))
    other = run(
        svc.ask(
            game=divisional,
            cursor=50,
            question="How many yards does he have?",
            session_id="d",
            conversation=other_context,
        )
    )
    assert other.status == "ok"


def test_failed_questions_are_not_remembered(make_service, divisional):
    svc = make_service(scripted([], simple_answer()), portkey_api_key=None)
    convo = Conversation()
    with pytest.raises(AIError):
        run(svc.ask(game=divisional, cursor=50, question="score?", session_id="s", conversation=convo))
    assert len(convo) == 0
