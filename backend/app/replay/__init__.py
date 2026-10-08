"""Historical NFL replay: nflverse ingestion + a deterministic game engine.

Pipeline: nflverse CSV rows -> ``ingest`` (normalize + validate) -> ``Game``
(immutable events) -> ``engine`` (fold events into ``GameState``) ->
``sessions`` (per-user playback over wall-clock time) -> API.
"""
