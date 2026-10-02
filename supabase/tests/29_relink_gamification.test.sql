begin;
select * from no_plan();

-- Fixtures: A and B are a couple with a goal, badges, a shared quest, a plan, and an open proposal. C later links with
-- A. S is a stranger.
insert into auth.users (id, email) values
  ('29292929-0000-0000-0000-00000000000a', 'a@test.local'),
  ('29292929-0000-0000-0000-00000000000b', 'b@test.local'),
  ('29292929-0000-0000-0000-00000000000c', 'c@test.local'),
  ('29292929-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('29292929-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Links two people as a new couple, both members in one statement, as confirm_link does.
create function pg_temp.link(p_couple text, p_one text, p_two text) returns void language sql as $$
  insert into public.couples (id) values (pg_temp.u(p_couple));
  insert into public.couple_members (couple_id, user_id)
  values (pg_temp.u(p_couple), pg_temp.u(p_one)), (pg_temp.u(p_couple), pg_temp.u(p_two));
$$;

-- A finished couple run with photos by A, as the owner, so the points triggers run.
create function pg_temp.run(p_run text, p_couple text, p_photos text[]) returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot)
  values (pg_temp.u(p_run), pg_temp.u(p_couple), 't', '{"stops": []}');
  insert into public.trail_run_members (run_id, user_id) values (pg_temp.u(p_run), pg_temp.u('a')), (pg_temp.u(p_run), pg_temp.u('b'));
  insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height)
  select pg_temp.u(p), pg_temp.u(p_run), 's1', pg_temp.u('a'), pg_temp.u(p_run)::text || '/' || pg_temp.u(p)::text || '.jpg',
    1, 1
  from unnest(p_photos) p;
  update public.trail_runs set completed_at = now() where id = pg_temp.u(p_run);
$$;

-- What the caller sees of the couple's stage 9 state, as one text.
create function pg_temp.seen() returns text language sql as $$
  select format('%s|%s|%s|%s|%s',
    (select count(*) from public.my_rhythm()),
    coalesce((select format('%s,%s', goal, paused) from public.rhythm_goal()), 'no goal'),
    coalesce((select string_agg(badge, ',' order by badge) from public.my_badges() where scope = 'couple'), 'no badges'),
    coalesce((select slot from public.my_planned_walk()), 'no plan'),
    coalesce((select points from public.couple_stats), 0))
$$;

create function pg_temp.shares(p_status text) returns int language sql security definer as $$
  select count(*)::int from private.photo_shares where run_id in (pg_temp.u('a1'), pg_temp.u('a2')) and status = p_status
$$;

select pg_temp.link('ab1', 'a', 'b');
select pg_temp.run('a1', 'ab1', array['e1']);
select pg_temp.run('a2', 'ab1', array['e2']);

select pg_temp.login(pg_temp.u('a'));
select public.set_rhythm_goal('weekly');
select public.pause_rhythm_goal(true);
select public.claim_badges(pg_temp.u('a1'), array['special-quest']);
select public.plan_walk((now() at time zone 'Europe/Riga')::date + 1, 'evening');
select public.propose_share(pg_temp.u('e1'));
select pg_temp.login(pg_temp.u('b'));
select public.answer_share((select share_id from public.pending_share_requests()), true);
select pg_temp.login(pg_temp.u('a'));
select public.confirm_share((select share_id from public.run_share(pg_temp.u('a1'))));
select public.propose_share(pg_temp.u('e2'));

select is(pg_temp.seen(), '1|weekly,t|first-walk,special-quest|evening|260',
  'A sees the rhythm, the paused goal, two badges, the plan, and 260 points with a share');

-- ---------------------------------------------------------------------------
-- 1. Unlink puts the lasting things away and drops the passing ones
-- ---------------------------------------------------------------------------

select public.unlink();
select is(pg_temp.seen(), '0|no goal|no badges|no plan|0', 'unlinked, A sees none of it');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.seen(), '0|no goal|no badges|no plan|0', 'nor does B');
select is((select count(*)::int from public.pending_share_requests()), 0, 'B has no request left to answer');
select is(pg_temp.shares('pending'), 0, 'the open proposal is gone');
select is(pg_temp.shares('shared'), 1, 'the made share stays, behind the weekly cap');
select throws_ok($$ select * from private.archived_badges $$, '42501', null, 'nobody reads the archived badges');

-- ---------------------------------------------------------------------------
-- 2. Someone else gets nothing; the same two get it back
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.link('ac1', 'a', 'c');
select pg_temp.login(pg_temp.u('c'));
select is(pg_temp.seen(), '0|no goal|no badges|no plan|0', 'A linking with C brings C nothing');
reset role;
update public.couples set ended_at = now() where id = pg_temp.u('ac1');

select pg_temp.link('ab2', 'a', 'b');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.seen(), '1|weekly,t|first-walk,special-quest|no plan|260',
  'relinked, the same two get back rhythm, goal, badges, and points with the share; the plan stays gone');
select is((select share_points from public.quest_points where run_id = pg_temp.u('a1')), 20, 'the share points came back');
select throws_ok($$ select public.claim_badges('29292929-0000-0000-0000-0000000000a2', '{}') $$, 'P0001', 'not_member',
  'a run of the old couple earns the new couple nothing');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.seen(), '0|no goal|no badges|no plan|0', 'the stranger sees nothing throughout');

select * from finish();
rollback;
