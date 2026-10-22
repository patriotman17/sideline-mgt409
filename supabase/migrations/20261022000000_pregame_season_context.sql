-- Pregame season context (nflverse, CC BY 4.0): what both teams did in the weeks BEFORE a game.
--
-- One "build" per previewed week (e.g. 2025 week 5 = regular-season games from weeks 1-4), made by
-- backend/scripts/build_pregame.py and imported by scripts/import_history_to_supabase.py --pregame.
-- Same read model as history.games / history.plays: private schema, RLS on, no client access, SELECT
-- only for the backend's `sideline_reader` role. Writes only via migrations / the import (owner).
--
-- No leakage, enforced by the database: a game can only be stored in a build if it was played before
-- the build's week (check `game_week < week`).

create table history.pregame_builds (
  season          integer not null check (season between 1999 and 2100),
  -- The week being previewed; the data covers only earlier weeks.
  week            integer not null check (week between 2 and 22),
  weeks_included  integer[] not null,
  source_url      text not null,
  source_sha256   text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  license         text not null,
  attribution     text not null,
  notes           text not null,
  generated_at    timestamptz not null,
  -- SHA-256 of the build's canonical JSON (games + players + metadata); re-checked by the backend.
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at     timestamptz not null default now(),
  primary key (season, week),
  check (weeks_included <> '{}' and week > all (weeks_included))
);

create table history.pregame_games (
  season          integer not null,
  week            integer not null,
  game_id         text not null check (game_id ~ '^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$'),
  game_week       integer not null check (game_week >= 1),
  game_date       date not null,
  home_team       text not null,
  away_team       text not null,
  home_score      integer not null check (home_score >= 0),
  away_score      integer not null check (away_score >= 0),
  home_yards      integer not null,
  away_yards      integer not null,
  home_giveaways  integer not null check (home_giveaways >= 0),
  away_giveaways  integer not null check (away_giveaways >= 0),
  primary key (season, week, game_id),
  foreign key (season, week) references history.pregame_builds (season, week) on delete cascade,
  check (game_week < week)
);

create table history.pregame_players (
  season          integer not null,
  week            integer not null,
  player_id       text not null,
  team            text not null,
  name            text not null,
  games           integer not null check (games >= 0),
  pass_yards      integer not null default 0,
  pass_td         integer not null default 0 check (pass_td >= 0),
  interceptions   integer not null default 0 check (interceptions >= 0),
  completions     integer not null default 0 check (completions >= 0),
  attempts        integer not null default 0 check (attempts >= 0),
  rush_yards      integer not null default 0,
  rush_td         integer not null default 0 check (rush_td >= 0),
  carries         integer not null default 0 check (carries >= 0),
  rec_yards       integer not null default 0,
  rec_td          integer not null default 0 check (rec_td >= 0),
  receptions      integer not null default 0 check (receptions >= 0),
  primary key (season, week, team, player_id),
  foreign key (season, week) references history.pregame_builds (season, week) on delete cascade
);

comment on table history.pregame_builds is 'Pregame season context per previewed week (earlier weeks only). Backend-only.';
comment on table history.pregame_games is 'Final score, yards and giveaways of each earlier game in a build. Backend-only.';
comment on table history.pregame_players is 'Season-to-date player totals as of a build''s week. Backend-only.';

-- ---------------------------------------------------------------- access

alter table history.pregame_builds enable row level security;
alter table history.pregame_games enable row level security;
alter table history.pregame_players enable row level security;

revoke all on history.pregame_builds, history.pregame_games, history.pregame_players
  from public, anon, authenticated;

grant select on history.pregame_builds, history.pregame_games, history.pregame_players to sideline_reader;

create policy "Backend reader can read pregame builds"
  on history.pregame_builds for select to sideline_reader using (true);

create policy "Backend reader can read pregame games"
  on history.pregame_games for select to sideline_reader using (true);

create policy "Backend reader can read pregame players"
  on history.pregame_players for select to sideline_reader using (true);
