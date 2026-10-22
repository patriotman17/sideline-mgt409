"""Pregame season context: correct facts from earlier weeks, and never anything from the game's own week."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.pregame.season import PREGAME_DIR, PregameFile, SeasonData, load, season_for

BASE = "/api/v1/pregame"
DATA = PREGAME_DIR / "2025_w05.json"


@pytest.fixture(scope="module")
def season() -> SeasonData:
    s = season_for(2025, 5)
    assert s is not None
    return s


def test_data_file_holds_only_earlier_weeks():
    data = PregameFile.model_validate(json.loads(DATA.read_text()))
    assert data.week == 5
    assert data.weeks_included == [1, 2, 3, 4]
    assert {g.week for g in data.games} == {1, 2, 3, 4}
    assert len(data.games) == 64  # 16 games a week, no byes before Week 5 in 2025
    assert not any(g.game_id.startswith("2025_05_") for g in data.games)


def test_a_later_game_slipped_into_the_file_is_ignored():
    raw = json.loads(DATA.read_text())
    leak = {**raw["games"][0], "game_id": "2025_05_LEAK", "week": 5, "home_score": 99, "away_score": 0}
    raw["games"].append(leak)
    s = SeasonData(PregameFile.model_validate(raw), data_version="test")
    assert all(g.week < 5 for g in s.games)
    assert s.matchup(leak["home"], leak["away"]).home.games == 4


def test_records_and_league_totals_are_consistent(season):
    forms = [season.form(t) for t in season.teams]
    assert len(forms) == 32
    assert all(f.games == 4 for f in forms)
    assert sum(f.wins for f in forms) == sum(f.losses for f in forms)
    assert sum(f.wins + f.losses + f.ties for f in forms) == 2 * 64
    total_points = sum(g.home_score + g.away_score for g in season.games)
    assert round(sum(f.points_per_game * f.games for f in forms)) == total_points
    assert sum(f.turnover_margin for f in forms) == 0


def test_known_2025_facts(season):
    buf, nyj = season.form("BUF"), season.form("NYJ")
    assert (buf.record, buf.streak) == ("4-0", "W4")
    assert (nyj.record, nyj.streak) == ("0-4", "L4")
    assert buf.last_results[0].label == "W 31-19 vs NO"  # most recent first
    passing = {lead.player: lead for f in map(season.form, ("DAL", "LA")) for lead in f.leaders}
    assert passing["D.Prescott"].league_rank == 1 and passing["D.Prescott"].yards == 1119
    assert passing["P.Nacua"].category == "receiving" and passing["P.Nacua"].league_rank == 1


def test_storylines_are_rule_based_and_limited(season):
    m = season.matchup("NYJ", "DAL")
    texts = [s.text for s in m.storylines]
    assert "NYJ is 0-4 and still looking for its first win." in texts
    assert any("D.Prescott (DAL) leads the NFL" in t for t in texts)
    assert len(m.storylines) <= 5
    assert season.matchup("NYJ", "DAL") == m  # deterministic


def test_unknown_team_is_an_error(season):
    with pytest.raises(KeyError):
        season.matchup("BUF", "XXX")


def test_data_version_changes_with_the_file(tmp_path):
    copy = tmp_path / "2025_w05.json"
    copy.write_text(DATA.read_text())
    a = load(copy).data_version
    copy.write_text(DATA.read_text().replace('"notes": "', '"notes": "x', 1))
    assert load(copy).data_version != a


# ---------------------------------------------------------------- API


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_pregame_endpoint(client):
    r = client.get(f"{BASE}/2025_05_NE_BUF")
    assert r.status_code == 200
    body = r.json()
    assert body["home"]["team"] == "BUF" and body["away"]["team"] == "NE"
    assert max(body["weeks_included"]) < body["week"] == 5
    assert body["ai_preview"] is None  # nothing generated yet; GET never calls the model
    assert "nflverse" in body["attribution"]


def test_pregame_never_exposes_the_games_result(client):
    from app.replay.catalog import get_catalog

    for game in get_catalog().list():
        if not game.info.game_id.startswith("2025_05_"):
            continue
        body = client.get(f"{BASE}/{game.info.game_id}").json()
        text = json.dumps(body)
        assert "final" not in text
        # No result for the Week 5 game itself: only earlier weeks appear in results.
        for side in ("home", "away"):
            assert all(r["week"] < 5 for r in body[side]["last_results"])


def test_pregame_404s(client):
    assert client.get(f"{BASE}/nope").status_code == 404
    assert client.get(f"{BASE}/2023_20_KC_BUF").status_code == 404  # no pregame data for that week


# ---------------------------------------------------------------- Supabase copy (fake database)


def _rows(data: PregameFile):
    from app.pregame.season import content_sha256

    build = {
        "season": data.season,
        "week": data.week,
        "weeks_included": data.weeks_included,
        "source_url": data.source.url,
        "source_sha256": data.source.sha256,
        "license": data.source.license,
        "attribution": data.source.attribution,
        "notes": data.source.notes,
        "generated_at": "2026-10-21 23:52:00+00",  # Postgres text format differs; not part of the hash
        "content_sha256": content_sha256(data),
    }
    return build, [g.model_dump() for g in data.games], [p.model_dump() for p in data.players]


def test_supabase_copy_round_trips_with_the_same_data_version():
    from app.pregame.season import from_data, load_pregame_from_supabase

    local = PregameFile.model_validate(json.loads(DATA.read_text()))
    remote = load_pregame_from_supabase(lambda s, w: _rows(local), 2025, 5)
    assert remote is not None
    assert from_data(remote).data_version == load(DATA).data_version  # same AI cache keys either way
    assert from_data(remote).matchup("BUF", "NE") == load(DATA).matchup("BUF", "NE")
    assert load_pregame_from_supabase(lambda s, w: (None, [], []), 2025, 6) is None
    # Any row order (Postgres collation differs from Python's) gives the same data and version.
    build, games, players = _rows(local)
    shuffled = load_pregame_from_supabase(lambda s, w: (build, games[::-1], players[::-1]), 2025, 5)
    assert shuffled is not None
    assert from_data(shuffled).data_version == load(DATA).data_version
    assert from_data(shuffled).matchup("NYJ", "DAL") == load(DATA).matchup("NYJ", "DAL")


def test_tampered_supabase_rows_are_rejected():
    from app.pregame.season import PregameIntegrityError, load_pregame_from_supabase

    local = PregameFile.model_validate(json.loads(DATA.read_text()))
    build, games, players = _rows(local)
    games[0] = {**games[0], "home_score": games[0]["home_score"] + 7}
    with pytest.raises(PregameIntegrityError):
        load_pregame_from_supabase(lambda s, w: (build, games, players), 2025, 5)


def test_supabase_failure_falls_back_to_the_local_file(monkeypatch):
    from pydantic import SecretStr

    import app.pregame.season as mod
    from app.core.config import Settings

    settings = Settings(replay_data_source="supabase", supabase_db_url=SecretStr("postgresql://x:secret@nowhere/db"))
    monkeypatch.setattr(mod, "get_settings", lambda: settings)

    def broken(dsn):
        def fetch(season, week):
            raise ConnectionError("password=secret")

        return fetch

    monkeypatch.setattr(mod, "postgres_pregame_fetch", broken)
    mod.season_for.cache_clear()
    try:
        s = mod.season_for(2025, 5)
        assert s is not None and s.data_version == load(DATA).data_version
    finally:
        mod.season_for.cache_clear()
