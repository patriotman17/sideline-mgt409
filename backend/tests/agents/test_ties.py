"""Ambiguous pronouns after a tie: ask which player instead of guessing."""

from __future__ import annotations

import asyncio

from app.agents import tools as t
from app.agents.conversation import Conversation, Turn, ambiguous_reference, resolve_pronoun
from app.agents.view import ReplayView
from app.replay.models import Game, PlayKind
from tests.agents.conftest import Step, conversation_model


def run(coro):
    return asyncio.run(coro)


def end_of_q3(game: Game) -> int:
    return next(e for e in game.events if e.kind is PlayKind.END_QUARTER and e.quarter == 3).sequence + 1


def tied_answer(returns) -> str:
    rows = [r for r in returns["get_player_stats"]["leaderboard"] if r["rank"] == 1]
    return (
        " and ".join(f"{r['player']} ({r['team']})" for r in rows)
        + f" are tied with {rows[0]['value']} receiving yards."
    )


def test_fixture_has_a_real_tie(super_bowl):
    board = t.get_player_stats(ReplayView.at(super_bowl, end_of_q3(super_bowl)), category="receiving").leaderboard
    assert [(r.player, r.rank, r.tied) for r in board[:2]] == [("C.McCaffrey", 1, True), ("M.Hardman", 1, True)]


def test_pronoun_after_tie_asks_which_player_without_calling_the_model(make_service, super_bowl):
    cursor = end_of_q3(super_bowl)
    # Only ONE scripted step: if the model were called for the follow-up, the script would run out and fail.
    svc = make_service(conversation_model([Step([("get_player_stats", {"category": "receiving"})], tied_answer)]))
    chat = Conversation()
    first = run(
        svc.ask(
            game=super_bowl, cursor=cursor, question="Who leads in receiving yards?", session_id="s", conversation=chat
        )
    )
    assert set(first.ambiguous_players) == {"C.McCaffrey", "M.Hardman"}

    follow = run(
        svc.ask(
            game=super_bowl, cursor=cursor, question="How many catches does he have?", session_id="s", conversation=chat
        )
    )
    assert follow.status == "clarification" and follow.answer.answerable is False
    assert "C.McCaffrey (SF)" in follow.answer.answer and "M.Hardman (KC)" in follow.answer.answer
    assert follow.answer.clarification is not None
    assert follow.answer.clarification.options == [
        "How many catches does C.McCaffrey have?",
        "How many catches does M.Hardman have?",
    ]
    assert follow.usage.requests == 0 and svc.audit.recent(1)[0].status == "clarification"

    # Repeating the pronoun keeps asking rather than guessing.
    again = run(svc.ask(game=super_bowl, cursor=cursor, question="And his longest?", session_id="s", conversation=chat))
    assert again.status == "clarification"
    assert again.answer.clarification and "M.Hardman's" in again.answer.clarification.options[1]


def test_choosing_an_option_answers_normally(make_service, super_bowl):
    cursor = end_of_q3(super_bowl)
    steps = [
        Step([("get_player_stats", {"category": "receiving"})], tied_answer),
        Step(
            [("get_player_stats", {"player": "C.McCaffrey"})],
            lambda r: f"C.McCaffrey has {r['get_player_stats']['players'][0]['receiving']['receptions']} catches.",
        ),
    ]
    svc = make_service(conversation_model(steps))
    chat = Conversation()
    run(
        svc.ask(
            game=super_bowl, cursor=cursor, question="Who leads in receiving yards?", session_id="s", conversation=chat
        )
    )
    run(
        svc.ask(
            game=super_bowl, cursor=cursor, question="How many catches does he have?", session_id="s", conversation=chat
        )
    )
    picked = run(
        svc.ask(
            game=super_bowl,
            cursor=cursor,
            question="How many catches does C.McCaffrey have?",
            session_id="s",
            conversation=chat,
        )
    )
    assert picked.status == "ok" and picked.answer.answer == "C.McCaffrey has 6 catches."


def test_no_clarification_without_a_tie_or_when_a_player_is_named():
    tie = Turn("q", "a", 10, "Q3", "0:00", ambiguous_players=("C.McCaffrey", "M.Hardman"))
    single = Turn("q", "a", 10, "Q3", "0:00")
    assert ambiguous_reference("How many catches does he have?", tie) == ("C.McCaffrey", "M.Hardman")
    assert ambiguous_reference("How many catches does he have?", single) == ()
    assert ambiguous_reference("How many catches does Hardman have?", tie) == ()
    assert ambiguous_reference("Who leads now?", tie) == ()
    assert ambiguous_reference("He?", None) == ()
    assert resolve_pronoun("What is his longest catch?", "M.Hardman") == "What is M.Hardman's longest catch?"


def test_untied_leader_does_not_trigger_clarification(make_service, super_bowl):
    steps = [
        Step(
            [("get_player_stats", {"category": "receiving"})], lambda r: "T.Kelce (KC) leads with 93 receiving yards."
        ),
        Step([("get_player_stats", {"player": "Kelce"})], lambda r: "T.Kelce has 9 catches."),
    ]
    svc = make_service(conversation_model(steps))
    chat = Conversation()
    end = len(super_bowl.events)
    first = run(
        svc.ask(
            game=super_bowl, cursor=end, question="Who leads in receiving yards?", session_id="s", conversation=chat
        )
    )
    assert first.ambiguous_players == []
    follow = run(
        svc.ask(
            game=super_bowl, cursor=end, question="How many catches does he have?", session_id="s", conversation=chat
        )
    )
    assert follow.status == "ok" and follow.answer.answer == "T.Kelce has 9 catches."


def test_cached_tied_answer_still_flags_ambiguity(make_service, super_bowl):
    cursor = end_of_q3(super_bowl)
    svc = make_service(conversation_model([Step([("get_player_stats", {"category": "receiving"})], tied_answer)]))
    run(
        svc.ask(
            game=super_bowl,
            cursor=cursor,
            question="Who leads in receiving yards?",
            session_id="a",
            conversation=Conversation(),
        )
    )
    other = Conversation()
    cached = run(
        svc.ask(
            game=super_bowl, cursor=cursor, question="Who leads in receiving yards?", session_id="b", conversation=other
        )
    )
    assert cached.status == "cached" and len(cached.ambiguous_players) == 2
    follow = run(
        svc.ask(
            game=super_bowl,
            cursor=cursor,
            question="How many catches does he have?",
            session_id="b",
            conversation=other,
        )
    )
    assert follow.status == "clarification"
