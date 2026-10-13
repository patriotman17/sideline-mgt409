-- Sideline RLS / constraint verification against the LIVE schema. Safe to run: it creates two
-- throwaway users inside one transaction, checks what each role can and cannot do, then ALWAYS
-- rolls back (the final 'VERIFY_OK' exception is the success signal; any 'FAIL: ...' is a bug).
--
--   npx supabase db query --linked -f supabase/tests/02_primary_team_saved_stories_rls.sql
--   expected: ERROR P0001: VERIFY_OK

begin;
-- (migration already applied: testing the live schema)

insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
 ('a1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','verify-a@example.invalid', extensions.crypt('Touchdown24', extensions.gen_salt('bf'))),
 ('b2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','verify-b@example.invalid', extensions.crypt('Touchdown24', extensions.gen_salt('bf')));
do $t$ begin if not ((select count(*) from information_schema.columns where table_schema='public' and column_name ~* '(pass|hash|salt|secret)') = 0) then raise exception 'FAIL: no password/hash/salt columns in public tables'; end if; end $t$;
do $t$ begin if not ((select encrypted_password like '$2%' from auth.users where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: auth stores bcrypt hash'; end if; end $t$;
do $t$ begin if not ((select (select encrypted_password from auth.users where id='a1111111-1111-4111-8111-111111111111') <> (select encrypted_password from auth.users where id='b2222222-2222-4222-8222-222222222222'))) then raise exception 'FAIL: same password -> different hashes (unique salts)'; end if; end $t$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $t$ begin begin select encrypted_password from auth.users; raise exception 'FAIL: clients cannot read auth.users hashes'; exception when insufficient_privilege then null; end; end $t$;
insert into public.favorite_teams (user_id, team_abbr) values ('a1111111-1111-4111-8111-111111111111','KC'),('a1111111-1111-4111-8111-111111111111','BUF');
do $t$ begin begin insert into public.favorite_teams (user_id, team_abbr, created_at) values ('a1111111-1111-4111-8111-111111111111','SF', now() - interval '1 year'); raise exception 'FAIL: favorite created_at not client-writable'; exception when insufficient_privilege then null; end; end $t$;
update public.profiles set primary_team_abbr='KC' where id='a1111111-1111-4111-8111-111111111111';
do $t$ begin if not ((select primary_team_abbr='KC' from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: A sets primary to own favorite'; end if; end $t$;
do $t$ begin begin update public.profiles set primary_team_abbr='SF' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: primary must be one of own favorites'; exception when foreign_key_violation then null; end; end $t$;
do $t$ begin begin update public.profiles set primary_team_abbr='ZZZ' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: unknown primary team'; exception when foreign_key_violation then null; end; end $t$;
delete from public.favorite_teams where user_id='a1111111-1111-4111-8111-111111111111' and team_abbr='KC';
do $t$ begin if not ((select primary_team_abbr is null from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: unfollowing the primary clears it'; end if; end $t$;
insert into public.saved_stories (user_id, story_id) values ('a1111111-1111-4111-8111-111111111111','s1'),('a1111111-1111-4111-8111-111111111111','tp2');
do $t$ begin if not ((select count(*) from public.saved_stories) = 2) then raise exception 'FAIL: A saves stories'; end if; end $t$;
do $t$ begin begin insert into public.saved_stories (user_id, story_id) values ('a1111111-1111-4111-8111-111111111111','../etc; drop'); raise exception 'FAIL: story id format'; exception when check_violation then null; end; end $t$;
do $t$ begin begin insert into public.saved_stories (user_id, story_id, created_at) values ('a1111111-1111-4111-8111-111111111111','s3', now()); raise exception 'FAIL: saved created_at not client-writable'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin insert into public.saved_stories (user_id, story_id) values ('b2222222-2222-4222-8222-222222222222','s1'); raise exception 'FAIL: cannot save for B'; exception when insufficient_privilege then null; end; end $t$;
do $t$ begin begin update public.saved_stories set story_id='s9'; raise exception 'FAIL: saved stories not updatable'; exception when insufficient_privilege then null; end; end $t$;
delete from public.saved_stories where user_id='a1111111-1111-4111-8111-111111111111' and story_id='tp2';
do $t$ begin if not ((select count(*) from public.saved_stories) = 1) then raise exception 'FAIL: A removes a saved story'; end if; end $t$;
reset role;
insert into public.favorite_teams (user_id, team_abbr) values ('b2222222-2222-4222-8222-222222222222','SF');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $t$ begin begin update public.profiles set primary_team_abbr='SF' where id='a1111111-1111-4111-8111-111111111111'; raise exception 'FAIL: cannot borrow B favorite as primary'; exception when foreign_key_violation then null; end; end $t$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $t$ begin if not ((select count(*) from public.saved_stories) = 0) then raise exception 'FAIL: B cannot see A saved stories'; end if; end $t$;
delete from public.saved_stories where user_id='a1111111-1111-4111-8111-111111111111';
update public.profiles set primary_team_abbr='SF' where id='a1111111-1111-4111-8111-111111111111';
reset role;
do $t$ begin if not ((select count(*) from public.saved_stories where user_id='a1111111-1111-4111-8111-111111111111') = 1) then raise exception 'FAIL: B could not delete A stories'; end if; end $t$;
do $t$ begin if not ((select primary_team_abbr is null from public.profiles where id='a1111111-1111-4111-8111-111111111111')) then raise exception 'FAIL: B could not set A primary'; end if; end $t$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $t$ begin begin select * from public.saved_stories; raise exception 'FAIL: anon cannot read saved stories'; exception when insufficient_privilege then null; end; end $t$;
reset role;
update public.profiles set primary_team_abbr=null where id='b2222222-2222-4222-8222-222222222222';
update public.profiles set username='bee', display_name='Bee', primary_team_abbr='SF', onboarded_at=now() where id='b2222222-2222-4222-8222-222222222222';
delete from auth.users where id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222');
do $t$ begin if not ((select count(*) from public.profiles where id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222')) = 0 and (select count(*) from public.favorite_teams where user_id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222')) = 0 and (select count(*) from public.saved_stories where user_id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222')) = 0) then raise exception 'FAIL: deleting a user removes all their data'; end if; end $t$;
do $t$ begin raise exception 'VERIFY_OK'; end $t$;
rollback;
