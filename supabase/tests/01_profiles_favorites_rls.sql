-- Sideline RLS / constraint verification against the LIVE schema. Safe to run: it creates two
-- throwaway users inside one transaction, checks what each role can and cannot do, then ALWAYS
-- rolls back (the final 'VERIFY_OK' exception is the success signal; any 'FAIL: ...' is a bug).
--
--   npx supabase db query --linked -f supabase/tests/01_profiles_favorites_rls.sql
--   expected: ERROR P0001: VERIFY_OK

begin;
-- (migration already applied: testing the live schema)

insert into auth.users (id, instance_id, aud, role, email) values
 ('a1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','verify-a@example.invalid'),
 ('b2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','verify-b@example.invalid');
do $t$ begin if not ((select count(*) from public.profiles where id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222')) = 2) then raise exception 'FAIL: signup trigger creates profiles'; end if; end $t$;
do $t$ begin if not ((select knowledge_level='regular' and ai_explanation_style='balanced' and spoiler_shield=false and notifications_enabled=true and onboarded_at is null from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: defaults'; end if; end $t$;
do $t$ begin if not ((select count(*) from public.nfl_teams) = 32) then raise exception 'FAIL: 32 teams'; end if; end $t$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $t$ begin if not ((select count(*) from public.profiles) = 1) then raise exception 'FAIL: A sees only own profile'; end if; end $t$;
do $t$ begin begin update public.profiles set onboarded_at = now() where id = 'a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: cannot finish onboarding without username'; exception when check_violation then null; end; end $t$;
do $t$ begin if not (public.is_username_available('alice')) then raise exception 'FAIL: alice available'; end if; end $t$;
do $t$ begin if not (not public.is_username_available('Bad Name!')) then raise exception 'FAIL: invalid username rejected by availability check'; end if; end $t$;
update public.profiles set username='alice', display_name='Alice', knowledge_level='expert', ai_explanation_style='detailed', spoiler_shield=true, notifications_enabled=false, onboarded_at=now() where id='a1111111-1111-4111-8111-111111111111';
do $t$ begin if not ((select username='alice' and knowledge_level='expert' and onboarded_at is not null from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: A completes onboarding'; end if; end $t$;
do $t$ begin if not (public.is_username_available('alice')) then raise exception 'FAIL: own username counts as available to self'; end if; end $t$;
update public.profiles set ai_explanation_style='simple', spoiler_shield=false where id='a1111111-1111-4111-8111-111111111111';
do $t$ begin if not ((select ai_explanation_style='simple' from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: A updates preferences later'; end if; end $t$;
update public.profiles set display_name='hacked' where id='b2222222-2222-4222-8222-222222222222';
do $t$ begin begin update public.profiles set created_at = now(); raise exception 'FAIL: created_at not writable'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin update public.profiles set updated_at = now(); raise exception 'FAIL: updated_at not writable'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin update public.profiles set id = 'b2222222-2222-4222-8222-222222222222'; raise exception 'FAIL: id not writable'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin insert into public.profiles (id) values ('a1111111-1111-4111-8111-111111111111'); raise exception 'FAIL: clients cannot insert profiles'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin delete from public.profiles; raise exception 'FAIL: clients cannot delete profiles'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin update public.profiles set knowledge_level='genius' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: knowledge level constraint'; exception when check_violation then null; end; end $t$;
do $t$ begin begin update public.profiles set ai_explanation_style='verbose' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: style constraint'; exception when check_violation then null; end; end $t$;
do $t$ begin begin update public.profiles set username='Has Caps' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: username format'; exception when check_violation then null; end; end $t$;
do $t$ begin begin update public.profiles set display_name='   ' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: blank display name'; exception when check_violation then null; end; end $t$;
do $t$ begin begin insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','XXX'); raise exception 'FAIL: unknown team'; exception when foreign_key_violation then null; end; end $t$;
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','BUF');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','KC');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','SF');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','DET');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','PHI');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','DAL');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','GB');
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','BAL');
do $t$ begin begin insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','MIA'); raise exception 'FAIL: 8-team limit'; exception when check_violation then null; end; end $t$;
do $t$ begin begin insert into public.favorite_teams (user_id, team_abbr) values ('b2222222-2222-4222-8222-222222222222','BUF'); raise exception 'FAIL: cannot add favorites for B'; exception when insufficient_privilege then null; end; end $t$;
delete from public.favorite_teams where user_id='a1111111-1111-4111-8111-111111111111' and team_abbr='BAL';
do $t$ begin if not ((select count(*) from public.favorite_teams) = 7) then raise exception 'FAIL: A removes a favorite'; end if; end $t$;
do $t$ begin begin insert into public.nfl_teams values ('ZZZ','X','Y','AFC','AFC East'); raise exception 'FAIL: teams read-only'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin select public.handle_new_user(); raise exception 'FAIL: trigger fn not callable'; exception when insufficient_privilege then null; end; end $t$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $t$ begin if not ((select count(*) from public.favorite_teams) = 0) then raise exception 'FAIL: B cannot see A favorites'; end if; end $t$;
do $t$ begin if not ((select count(*) from public.profiles where id='a1111111-1111-4111-8111-111111111111') = 0) then raise exception 'FAIL: B cannot see A profile'; end if; end $t$;
do $t$ begin if not (not public.is_username_available('alice')) then raise exception 'FAIL: taken username unavailable to B'; end if; end $t$;
do $t$ begin begin update public.profiles set username='alice' where id='b2222222-2222-4222-8222-222222222222'; raise exception 'FAIL: duplicate username'; exception when unique_violation then null; end; end $t$;
delete from public.favorite_teams where user_id='a1111111-1111-4111-8111-111111111111';
reset role;
do $t$ begin if not ((select count(*) from public.favorite_teams where user_id='a1111111-1111-4111-8111-111111111111') = 7) then raise exception 'FAIL: B could not delete A favorites'; end if; end $t$;
do $t$ begin if not ((select display_name='Alice' from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: B update attempt changed nothing'; end if; end $t$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $t$ begin if not ((select count(*) from public.nfl_teams) = 32) then raise exception 'FAIL: anon reads teams'; end if; end $t$;
do $t$ begin begin select * from public.profiles; raise exception 'FAIL: anon cannot read profiles'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin select * from public.favorite_teams; raise exception 'FAIL: anon cannot read favorites'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin select public.is_username_available('x'); raise exception 'FAIL: anon cannot probe usernames'; exception when insufficient_privilege then null; end; end $t$;
reset role;
do $t$ begin raise exception 'VERIFY_OK'; end $t$;
rollback;
