"""NFL team metadata keyed by nflverse abbreviations (note: Rams are ``LA``)."""

from __future__ import annotations

from app.replay.models import Team

_TEAMS: dict[str, tuple[str, str, str]] = {
    "ARI": ("Arizona", "Cardinals", "NFC"),
    "ATL": ("Atlanta", "Falcons", "NFC"),
    "BAL": ("Baltimore", "Ravens", "AFC"),
    "BUF": ("Buffalo", "Bills", "AFC"),
    "CAR": ("Carolina", "Panthers", "NFC"),
    "CHI": ("Chicago", "Bears", "NFC"),
    "CIN": ("Cincinnati", "Bengals", "AFC"),
    "CLE": ("Cleveland", "Browns", "AFC"),
    "DAL": ("Dallas", "Cowboys", "NFC"),
    "DEN": ("Denver", "Broncos", "AFC"),
    "DET": ("Detroit", "Lions", "NFC"),
    "GB": ("Green Bay", "Packers", "NFC"),
    "HOU": ("Houston", "Texans", "AFC"),
    "IND": ("Indianapolis", "Colts", "AFC"),
    "JAX": ("Jacksonville", "Jaguars", "AFC"),
    "KC": ("Kansas City", "Chiefs", "AFC"),
    "LA": ("Los Angeles", "Rams", "NFC"),
    "LAC": ("Los Angeles", "Chargers", "AFC"),
    "LV": ("Las Vegas", "Raiders", "AFC"),
    "MIA": ("Miami", "Dolphins", "AFC"),
    "MIN": ("Minnesota", "Vikings", "NFC"),
    "NE": ("New England", "Patriots", "AFC"),
    "NO": ("New Orleans", "Saints", "NFC"),
    "NYG": ("New York", "Giants", "NFC"),
    "NYJ": ("New York", "Jets", "AFC"),
    "PHI": ("Philadelphia", "Eagles", "NFC"),
    "PIT": ("Pittsburgh", "Steelers", "AFC"),
    "SEA": ("Seattle", "Seahawks", "NFC"),
    "SF": ("San Francisco", "49ers", "NFC"),
    "TB": ("Tampa Bay", "Buccaneers", "NFC"),
    "TEN": ("Tennessee", "Titans", "AFC"),
    "WAS": ("Washington", "Commanders", "NFC"),
}


def team(abbr: str) -> Team:
    """Look up a team; unknown abbreviations are kept as-is rather than guessed."""
    city, name, conference = _TEAMS.get(abbr, (None, None, None))
    return Team(abbr=abbr, city=city, name=name, conference=conference)
