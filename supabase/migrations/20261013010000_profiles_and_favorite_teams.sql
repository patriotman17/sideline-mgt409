-- Sideline: user profiles, NFL team reference data, and favorite teams.
-- Every table has Row Level Security enabled. Users can only see and change their own rows;
-- the team list is public read-only reference data.

-- ---------------------------------------------------------------- nfl_teams (reference data)

create table public.nfl_teams (
  abbr        text primary key check (abbr ~ '^[A-Z]{2,3}$'),  -- nflverse abbreviations (Rams = LA)
  city        text not null,
  name        text not null,
  conference  text not null check (conference in ('AFC', 'NFC')),
  division    text not null check (division ~ '^(AFC|NFC) (East|North|South|West)$')
);

alter table public.nfl_teams enable row level security;

create policy "Teams are readable by everyone"
  on public.nfl_teams for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.nfl_teams from anon, authenticated;

insert into public.nfl_teams (abbr, city, name, conference, division) values
  ('BUF', 'Buffalo', 'Bills', 'AFC', 'AFC East'),
  ('MIA', 'Miami', 'Dolphins', 'AFC', 'AFC East'),
  ('NE',  'New England', 'Patriots', 'AFC', 'AFC East'),
  ('NYJ', 'New York', 'Jets', 'AFC', 'AFC East'),
  ('BAL', 'Baltimore', 'Ravens', 'AFC', 'AFC North'),
  ('CIN', 'Cincinnati', 'Bengals', 'AFC', 'AFC North'),
  ('CLE', 'Cleveland', 'Browns', 'AFC', 'AFC North'),
  ('PIT', 'Pittsburgh', 'Steelers', 'AFC', 'AFC North'),
  ('HOU', 'Houston', 'Texans', 'AFC', 'AFC South'),
  ('IND', 'Indianapolis', 'Colts', 'AFC', 'AFC South'),
  ('JAX', 'Jacksonville', 'Jaguars', 'AFC', 'AFC South'),
  ('TEN', 'Tennessee', 'Titans', 'AFC', 'AFC South'),
  ('DEN', 'Denver', 'Broncos', 'AFC', 'AFC West'),
  ('KC',  'Kansas City', 'Chiefs', 'AFC', 'AFC West'),
  ('LV',  'Las Vegas', 'Raiders', 'AFC', 'AFC West'),
  ('LAC', 'Los Angeles', 'Chargers', 'AFC', 'AFC West'),
  ('DAL', 'Dallas', 'Cowboys', 'NFC', 'NFC East'),
  ('NYG', 'New York', 'Giants', 'NFC', 'NFC East'),
  ('PHI', 'Philadelphia', 'Eagles', 'NFC', 'NFC East'),
  ('WAS', 'Washington', 'Commanders', 'NFC', 'NFC East'),
  ('CHI', 'Chicago', 'Bears', 'NFC', 'NFC North'),
  ('DET', 'Detroit', 'Lions', 'NFC', 'NFC North'),
  ('GB',  'Green Bay', 'Packers', 'NFC', 'NFC North'),
  ('MIN', 'Minnesota', 'Vikings', 'NFC', 'NFC North'),
  ('ATL', 'Atlanta', 'Falcons', 'NFC', 'NFC South'),
  ('CAR', 'Carolina', 'Panthers', 'NFC', 'NFC South'),
  ('NO',  'New Orleans', 'Saints', 'NFC', 'NFC South'),
  ('TB',  'Tampa Bay', 'Buccaneers', 'NFC', 'NFC South'),
  ('ARI', 'Arizona', 'Cardinals', 'NFC', 'NFC West'),
  ('LA',  'Los Angeles', 'Rams', 'NFC', 'NFC West'),
  ('SF',  'San Francisco', '49ers', 'NFC', 'NFC West'),
  ('SEA', 'Seattle', 'Seahawks', 'NFC', 'NFC West');

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  -- Public handle: lowercase letters, digits and underscores, 3-20 chars, unique.
  username              text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name          text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  knowledge_level       text not null default 'regular'
                        check (knowledge_level in ('casual', 'regular', 'expert')),
  ai_explanation_style  text not null default 'balanced'
                        check (ai_explanation_style in ('simple', 'balanced', 'detailed')),
  spoiler_shield        boolean not null default false,  -- matches the app's existing default
  notifications_enabled boolean not null default true,   -- matches the app's existing default
  onboarded_at          timestamptz,                     -- null until the user finishes onboarding
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Finishing onboarding requires a username and a display name.
  constraint profiles_onboarding_complete
    check (onboarded_at is null or (username is not null and display_name is not null))
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are created only by the signup trigger below. Clients may edit only these columns;
-- id, created_at and updated_at are never client-writable.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  username, display_name, knowledge_level, ai_explanation_style,
  spoiler_shield, notifications_enabled, onboarded_at
) on public.profiles to authenticated;

-- Profiles are private (RLS), so a signed-in user checks a username here without seeing anyone's
-- row. Returns true when the name is valid and unused (or already theirs).
create function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles p
       where p.username = candidate and p.id <> (select auth.uid())
     );
$$;

revoke execute on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

-- ---------------------------------------------------------------- favorite_teams

create table public.favorite_teams (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  team_abbr   text not null references public.nfl_teams (abbr),
  created_at  timestamptz not null default now(),
  primary key (user_id, team_abbr)
);

alter table public.favorite_teams enable row level security;

create policy "Users can read their own favorite teams"
  on public.favorite_teams for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own favorite teams"
  on public.favorite_teams for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can remove their own favorite teams"
  on public.favorite_teams for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.favorite_teams from anon, authenticated;
grant select, insert, delete on public.favorite_teams to authenticated;

-- At most 8 favorite teams per user.
create function public.enforce_favorite_team_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.favorite_teams where user_id = new.user_id) >= 8 then
    raise exception 'You can follow at most 8 favorite teams.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger favorite_teams_limit
  before insert on public.favorite_teams
  for each row execute function public.enforce_favorite_team_limit();

-- ---------------------------------------------------------------- triggers

-- Keep updated_at current.
create function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create an empty profile for every new auth user (runs as the table owner, so clients
-- never need INSERT on profiles).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are not callable as RPCs.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_favorite_team_limit() from public, anon, authenticated;
