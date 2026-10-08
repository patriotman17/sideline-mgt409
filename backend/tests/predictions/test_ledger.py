"""Answers, points, accuracy, and streaks."""

from __future__ import annotations

import pytest

from app.predictions.ledger import PredictionError, PredictionLedger, visible_items
from app.predictions.models import POINTS, Answer, Option, Prediction, PredictionStatus, PredictionType
from tests.predictions.helpers import EVERY, final, ledger_at, pred

T = PredictionType


def test_answer_rules(divisional):
    led = ledger_at(divisional, 2)
    pid = pred(led, T.NEXT_SCORE, 2).id
    with pytest.raises(PredictionError) as bad:
        led.answer(pid, "maybe", 2)
    assert bad.value.code == "invalid_option"
    first, created = led.answer(pid, "BUF", 2)
    again, created_again = led.answer(pid, "BUF", 2)
    assert created and not created_again and again == first
    with pytest.raises(PredictionError) as changed:
        led.answer(pid, "KC", 2)
    assert changed.value.code == "already_answered"
    with pytest.raises(PredictionError) as future:
        led.answer(pid, "BUF", 1)  # not visible before it opened
    assert future.value.code == "not_found"


def test_cannot_answer_after_lock(divisional):
    led = ledger_at(divisional, 3)  # the play after opening has been revealed
    with pytest.raises(PredictionError) as exc:
        led.answer(pred(led, T.NEXT_SCORE, 2).id, "BUF", 3)
    assert exc.value.code == "locked"


def test_points_accuracy_and_streaks_on_a_real_game(divisional):
    """Answer every eligible question with its first option the moment it opens, then check the arithmetic."""
    from app.replay.engine import apply_event, initial_state

    led = PredictionLedger(divisional.info, EVERY)
    state = initial_state(divisional)
    for i, e in enumerate(divisional.events):
        state = apply_event(state, e, divisional)
        for p in led.observe(e, state, i + 1):
            led.answer(p.id, p.options[0].id, i + 1)
    s = led.stats()
    by_id = {p.id: p for p in led.all()}
    outcomes = [led.outcome(by_id[pid]) for pid in led._resolution_order]
    assert s.correct == outcomes.count("correct") and s.incorrect == outcomes.count("incorrect")
    assert s.void == outcomes.count("void") and s.pending == 0
    assert s.points == sum(led.points_for(p) for p in led.all())
    assert s.accuracy == round(s.correct / (s.correct + s.incorrect), 4)
    longest = run = 0
    for o in outcomes:
        if o == "correct":
            run += 1
            longest = max(longest, run)
        elif o == "incorrect":
            run = 0
    assert (s.longest_streak, s.current_streak) == (longest, run)


def _graded(ledger: PredictionLedger, n: int, correct_option: str | None, answered: str = "yes") -> None:
    """Add an answered, already-graded question (correct_option None = void)."""
    pid = f"g:{T.NEXT_PLAY_GAIN_5.value}:{n}"
    ledger._predictions[pid] = Prediction(
        id=pid,
        type=T.NEXT_PLAY_GAIN_5,
        question="q",
        options=[Option(id="yes", label="Yes"), Option(id="no", label="No")],
        points=POINTS[T.NEXT_PLAY_GAIN_5],
        window="w",
        opened_cursor=n,
        locked_cursor=n + 1,
        resolved_cursor=n + 1,
        status=PredictionStatus.RESOLVED if correct_option else PredictionStatus.VOID,
        correct_option_id=correct_option,
        situation="s",
    )
    ledger._answers[pid] = Answer(prediction_id=pid, option_id=answered, answered_cursor=n, answered_at="t")
    ledger._resolution_order.append(pid)


def test_streak_rules_voids_do_not_break_streaks(divisional):
    led = PredictionLedger(divisional.info)
    # correct, correct, void, correct, incorrect, correct
    for n, correct_option in enumerate(["yes", "yes", None, "yes", "no", "yes"]):
        _graded(led, n, correct_option)
    s = led.stats()
    assert (s.correct, s.incorrect, s.void) == (4, 1, 1)
    assert (s.longest_streak, s.current_streak) == (3, 1)
    assert s.points == 4 * POINTS[T.NEXT_PLAY_GAIN_5]
    assert s.accuracy == 0.8


def test_unanswered_questions_score_nothing(divisional):
    s = final(divisional).stats()
    assert (s.points, s.answered, s.correct, s.incorrect, s.void, s.accuracy) == (0, 0, 0, 0, 0, None)


def test_rewound_view_hides_later_outcomes(divisional):
    led = final(divisional)
    p = pred(led, T.NEXT_SCORE, 2)
    early = next(i for i in visible_items(led, 5) if i.prediction.id == p.id)
    assert early.prediction.status is PredictionStatus.LOCKED and early.prediction.correct_option_id is None
    assert early.result_hidden_until == p.resolved_cursor
    assert all(i.prediction.opened_cursor <= 5 for i in visible_items(led, 5))
    late = next(i for i in visible_items(led, 20) if i.prediction.id == p.id)
    assert late.prediction.correct_option_id == "BUF" and late.result_hidden_until is None
