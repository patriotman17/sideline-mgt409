-- Historical NFL play-by-play (nflverse, CC BY 4.0) for Sideline's replay engine.
--
-- Read model: ONLY the Sideline backend reads this data, through the dedicated `sideline_reader`
-- role, and turns it into game state with the deterministic replay engine. Clients never query it:
-- a client that could read `plays` could read a game's future plays and final score.
--
-- Defense in depth:
--   1. Private schema `history` (not in the API's exposed schemas), so PostgREST/GraphQL can't see it.
--   2. No privileges for anon / authenticated / public on the schema or its tables.
--   3. RLS on both tables; the only policies are SELECT for `sideline_reader`.
--   4. `sideline_reader` is NOLOGIN here; you enable login with a password you choose (kept out of git).
-- Writes happen only through migrations / the import script run as the project owner.

create schema if not exists history;
revoke all on schema history from public, anon, authenticated;
comment on schema history is 'Historical NFL play-by-play (nflverse, CC BY 4.0). Backend-only; never exposed to clients.';

-- ---------------------------------------------------------------- games (+ provenance)

create table history.games (
  game_id         text primary key check (game_id ~ '^[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}$'),
  season          integer not null check (season between 1999 and 2100),
  week            integer not null check (week between 1 and 22),
  season_type     text not null check (season_type in ('REG', 'POST')),
  game_date       date,
  kickoff_at      timestamptz,
  away_team       text not null,
  home_team       text not null,
  venue           text,
  neutral_site    boolean not null default false,
  -- nflverse provenance (from the extract's .source.json sidecar)
  source          text not null,
  source_url      text not null,
  source_sha256   text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at    timestamptz not null,
  license         text not null,
  attribution     text not null,
  columns         text[] not null,
  row_count       integer not null check (row_count > 0),
  -- SHA-256 of the extract's rows (canonical JSON), checked again after every import
  rows_sha256     text not null check (rows_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at     timestamptz not null default now()
);

create index games_season_week_idx on history.games (season, week);

-- ---------------------------------------------------------------- plays (one row per source row)

create table history.plays (
  game_id    text not null references history.games (game_id) on delete cascade,
  -- Position in the source extract (0-based). The replay engine's event order.
  row_index  integer not null check (row_index >= 0),
  -- The extracted nflverse row exactly as in the CSV (column -> string), so the backend runs the
  -- same ingestion code on it as on local files. Look-ahead columns are never extracted.
  row        jsonb not null check (jsonb_typeof(row) = 'object'),
  primary key (game_id, row_index)
);

comment on table history.plays is 'One nflverse play-by-play row per record, ordered by row_index. Backend-only.';

-- ---------------------------------------------------------------- access

alter table history.games enable row level security;
alter table history.plays enable row level security;

revoke all on all tables in schema history from public, anon, authenticated;
alter default privileges in schema history revoke all on tables from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sideline_reader') then
    create role sideline_reader nologin noinherit;
  end if;
end
$$;
comment on role sideline_reader is 'Sideline backend: read-only access to history.* (enable LOGIN with a private password).';

grant usage on schema history to sideline_reader;
grant select on history.games, history.plays to sideline_reader;

create policy "Backend reader can read games"
  on history.games for select
  to sideline_reader
  using (true);

create policy "Backend reader can read plays"
  on history.plays for select
  to sideline_reader
  using (true);
