"""nflverse play-by-play source constants (shared by the fetch script, ingestion and tests)."""

RELEASE_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
LICENSE = "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)"
ATTRIBUTION = "Play-by-play data from nflverse (nflfastR / nflverse-data), CC BY 4.0."

#: Schedule metadata, extracted when the source has it (older extracts don't, and still load).
#: ``start_time`` is the actual kickoff in US Eastern time; ``location`` is "Home" or "Neutral".
#: ``time_of_day`` is the real UTC time the play happened (it describes *that* play only, never a later
#: outcome); it drives the synchronized week clock. Marker rows (game start, quarter ends) leave it blank.
OPTIONAL_COLUMNS = ["start_time", "location", "time_of_day"]

# Only the columns the ingestion pipeline reads (see app/replay/ingest.py).
COLUMNS = [
    "game_id",
    "season",
    "season_type",
    "week",
    "game_date",
    "home_team",
    "away_team",
    "stadium",
    "roof",
    "spread_line",
    "total_line",
    "home_score",
    "away_score",
    "play_id",
    "drive",
    "qtr",
    "time",
    "quarter_seconds_remaining",
    "game_seconds_remaining",
    "posteam",
    "defteam",
    "down",
    "ydstogo",
    "yardline_100",
    "yrdln",
    "desc",
    "play_type",
    "play_type_nfl",
    "yards_gained",
    "first_down",
    "touchdown",
    "td_team",
    "field_goal_result",
    "extra_point_result",
    "two_point_conv_result",
    "defensive_two_point_conv",
    "defensive_extra_point_conv",
    "safety",
    "interception",
    "fumble_lost",
    "return_team",
    "penalty",
    "penalty_team",
    "penalty_yards",
    "penalty_type",
    "timeout",
    "timeout_team",
    "home_timeouts_remaining",
    "away_timeouts_remaining",
    "total_home_score",
    "total_away_score",
    "home_wp",
    "home_wp_post",
    "quarter_end",
    "aborted_play",
    # Player credits and per-play stats (Phase 2C player/team stats).
    "passer_player_name",
    "receiver_player_name",
    "rusher_player_name",
    "interception_player_name",
    "sack_player_name",
    "kicker_player_name",
    "fumbled_1_player_name",
    "pass_attempt",
    "complete_pass",
    "rush_attempt",
    "sack",
    "qb_scramble",
    "pass_touchdown",
    "rush_touchdown",
    "passing_yards",
    "receiving_yards",
    "rushing_yards",
    "kick_distance",
    "shotgun",
    "no_huddle",
]
# Deliberately NOT extracted — look-ahead columns that summarize the future at each play:
# fixed_drive_result, drive_play_count, drive_time_of_possession, drive_end_*,
# series_result. (home_score/away_score are read once for validation only.)
