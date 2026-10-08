"""The eval harness itself: runs offline and its checks catch real failures."""

from __future__ import annotations

import asyncio

from pydantic import SecretStr

from app.core.config import Settings
from app.replay.catalog import get_catalog
from evals.cases import CASES
from evals.run import contains, offline_model, run_cases, summarize
from tests.agents.conftest import scripted, simple_answer


def settings() -> Settings:
    return Settings(
        portkey_api_key=SecretStr("offline"),
        ai_audit_log_path=None,
        ai_input_price_per_mtok=0.0,
        ai_output_price_per_mtok=0.0,
    )


def test_offline_run_produces_a_report():
    results = asyncio.run(
        run_cases(CASES, model_factory=lambda _s: offline_model(), settings=settings(), catalog=get_catalog())
    )
    report = summarize(results, mode="offline", model="offline-scripted")
    assert report["cases"] == len(CASES) >= 15
    assert report["check_pass_rates"]["no_future_leakage"].startswith(f"{len(CASES)}/")
    assert {r["id"] for r in report["results"] if r["passed"]} >= {"div-half-score", "div-pregame"}


def test_leakage_check_catches_a_leaking_model():
    leaky = scripted(
        [("get_game_state", {})], simple_answer("KC wins 27-24, thanks to Hardman.", tool="get_game_state")
    )
    case = next(c for c in CASES if c.id == "div-half-who-wins")
    [result] = asyncio.run(
        run_cases([case], model_factory=lambda _s: leaky, settings=settings(), catalog=get_catalog())
    )
    assert result.checks["no_future_leakage"] is False and not result.passed


def test_number_matching_is_whole_number():
    assert contains("BUF 17, KC 13", "17") and not contains("SF 10", "1") and contains("Allen 51 yards", "allen")
