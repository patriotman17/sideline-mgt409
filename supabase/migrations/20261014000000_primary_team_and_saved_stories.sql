-- Sideline: primary favorite team and saved Discover stories.
-- Extends 20261013010000_profiles_and_favorite_teams.sql (already applied; never edit it).
-- Same rules: RLS on every user table, users touch only their own rows, least-privilege grants.
--
-- Passwords are NOT stored here: Supabase Auth keeps bcrypt hashes (random salt per password) in
-- auth.users, which clients can't read. No public table has a password, hash, or salt column.

-- ---------------------------------------------------------------- primary favorite team

-- The primary team must be one of the user's own favorites: a composite foreign key to
-- favorite_teams(user_id, team_abbr), keyed on the profile's own id, so it can never point at
-- another user's row. Unfollowing that team clears it automatically (SET NULL on that column only).
alter table public.profiles
  add column primary_team_abbr text;

alter table public.profiles
  add constraint profiles_primary_team_is_a_favorite
  foreign key (id, primary_team_abbr)
  references public.favorite_teams (user_id, team_abbr)
  on delete set null (primary_team_abbr);

grant update (primary_team_abbr) on public.profiles to authenticated;

-- Index the team foreign key (lookups and future "fans of this team" queries).
create index favorite_teams_team_abbr_idx on public.favorite_teams (team_abbr);

-- ---------------------------------------------------------------- saved stories

create table public.saved_stories (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Discover story ids are short slugs today (sample data); validated so nothing else fits here.
  story_id    text not null check (story_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.saved_stories enable row level security;

create policy "Users can read their own saved stories"
  on public.saved_stories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save stories for themselves"
  on public.saved_stories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own saved stories"
  on public.saved_stories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.saved_stories from anon, authenticated;
grant select, delete on public.saved_stories to authenticated;
grant insert (user_id, story_id) on public.saved_stories to authenticated;  -- created_at is server-set

-- At most 200 saved stories per user (keeps one account from filling the table).
create function public.enforce_saved_story_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_stories where user_id = new.user_id) >= 200 then
    raise exception 'You can save at most 200 stories.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger saved_stories_limit
  before insert on public.saved_stories
  for each row execute function public.enforce_saved_story_limit();

revoke execute on function public.enforce_saved_story_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------- favorite_teams: server-set timestamp

-- Clients choose only the team; created_at (used for ordering) is always server time.
revoke insert on public.favorite_teams from authenticated;
grant insert (user_id, team_abbr) on public.favorite_teams to authenticated;
