-- Historical NFL season stats, 1999-2024 (nflverse, CC BY 4.0), for Ask Sideline's career and
-- past-season questions. Built by backend/scripts/build_history_stats.py and imported by
-- scripts/import_history_to_supabase.py --stats.
--
-- Same read model as the other history.* tables: private schema, RLS on, no client access, SELECT only for
-- the backend's `sideline_reader` role; writes only via migrations / the import (project owner).
--
-- No leakage, enforced by the database: the app's featured week is in 2025, so no 2025 (or later) season
-- can be stored here (check season <= 2024).

create table history.stats_builds (
  build_id        text primary key check (build_id ~ '^[a-z0-9-]{3,64}$'),
  first_season    integer not null check (first_season >= 1999),
  last_season     integer not null check (last_season <= 2024 and last_season >= first_season),
  sources         jsonb not null check (jsonb_typeof(sources) = 'array'),
  license         text not null,
  attribution     text not null,
  generated_at    timestamptz not null,
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  player_rows     integer not null check (player_rows > 0),
  team_rows       integer not null check (team_rows > 0),
  imported_at     timestamptz not null default now()
);

create table history.player_seasons (
  season            integer not null check (season between 1999 and 2024),
  player_id         text not null,
  player_name       text not null,
  position          text not null,
  team              text not null,
  games             integer not null check (games >= 0),
  completions       integer not null default 0,
  attempts          integer not null default 0,
  pass_yards        integer not null default 0,
  pass_td           integer not null default 0,
  interceptions     integer not null default 0,
  carries           integer not null default 0,
  rush_yards        integer not null default 0,
  rush_td           integer not null default 0,
  receptions        integer not null default 0,
  targets           integer not null default 0,
  rec_yards         integer not null default 0,
  rec_td            integer not null default 0,
  tackles           integer not null default 0,
  sacks             integer not null default 0,
  def_interceptions integer not null default 0,
  fg_made           integer not null default 0,
  fg_att            integer not null default 0,
  primary key (season, player_id)
);

create index player_seasons_player_idx on history.player_seasons (player_id);

create table history.team_seasons (
  season          integer not null check (season between 1999 and 2024),
  team            text not null check (team ~ '^[A-Z]{2,3}$'),
  wins            integer not null check (wins >= 0),
  losses          integer not null check (losses >= 0),
  ties            integer not null check (ties >= 0),
  points_for      integer not null check (points_for >= 0),
  points_against  integer not null check (points_against >= 0),
  playoff_result  text not null,
  primary key (season, team)
);

comment on table history.stats_builds is 'Provenance + checksum of the imported season stats. Backend-only.';
comment on table history.player_seasons is 'Regular-season totals per player and season, 1999-2024. Backend-only.';
comment on table history.team_seasons is 'Regular-season record, points and playoff result per team and season, 1999-2024. Backend-only.';

-- ---------------------------------------------------------------- access

alter table history.stats_builds enable row level security;
alter table history.player_seasons enable row level security;
alter table history.team_seasons enable row level security;

revoke all on history.stats_builds, history.player_seasons, history.team_seasons from public, anon, authenticated;

grant select on history.stats_builds, history.player_seasons, history.team_seasons to sideline_reader;

create policy "Backend reader can read stats builds"
  on history.stats_builds for select to sideline_reader using (true);

create policy "Backend reader can read player seasons"
  on history.player_seasons for select to sideline_reader using (true);

create policy "Backend reader can read team seasons"
  on history.team_seasons for select to sideline_reader using (true);
