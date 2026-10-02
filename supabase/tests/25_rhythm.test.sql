begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('25252525-0000-0000-0000-00000000000a', 'a@test.local'),
  ('25252525-0000-0000-0000-00000000000b', 'b@test.local'),
  ('25252525-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('25252525-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab'));
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b'));

-- A run finished p_ago ago (null: open), as the owner. A couple run gets its quest_points row as the triggers would
-- write it; the awarding has its own tests.
create function pg_temp.run(p_run text, p_couple text, p_ago interval, variadic p_members text[])
returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, completed_at)
  values (pg_temp.u(p_run), case when p_couple is not null then pg_temp.u(p_couple) end, 't', '{"stops": []}',
    now() - p_ago);
  insert into public.trail_run_members (run_id, user_id) select pg_temp.u(p_run), pg_temp.u(m) from unnest(p_members) m;
  insert into public.quest_points (run_id, couple_id, week_start, stop_points, finish_points)
  select pg_temp.u(p_run), pg_temp.u(p_couple), private.riga_week(coalesce(now() - p_ago, now())), 10,
    case when p_ago is null then 0 else 100 end
  where p_couple is not null;
$$;

-- The caller's rhythm as "days ago:quests", oldest first.
create function pg_temp.rhythm(p_weeks int default 26) returns text language sql as $$
  select coalesce(string_agg(format('%s:%s', (now() at time zone 'Europe/Riga')::date - day, quests), ',' order by day), '')
  from public.my_rhythm(p_weeks)
$$;

create function pg_temp.goal() returns text language sql as $$
  select coalesce((select format('%s|%s', goal, paused) from public.rhythm_goal()), 'none')
$$;

select pg_temp.run('a1', 'ab', interval '0 days', 'a', 'b');
select pg_temp.run('a2', 'ab', interval '0 days', 'a', 'b');
select pg_temp.run('a3', 'ab', interval '15 days', 'a', 'b');
select pg_temp.run('a4', 'ab', interval '30 weeks', 'a', 'b');
select pg_temp.run('a5', 'ab', null, 'a', 'b');
-- A's Just me quest and the stranger's solo quest.
select pg_temp.run('f1', null, interval '3 days', 'a');
select pg_temp.run('f2', null, interval '1 day', '5');

-- ---------------------------------------------------------------------------
-- 1. Days with finished quests
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.rhythm(), '15:1,0:2', 'A sees the couple''s finished quests by day over 26 weeks, never the open one');
select is(pg_temp.rhythm(40), '210:1,15:1,0:2', 'a longer window reaches the older quest');
select is(pg_temp.rhythm(1), '0:2', 'one week is this week alone');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.rhythm(), '15:1,0:2', 'B sees the same, and nothing of A''s Just me quest');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.rhythm(), '1:1', 'the stranger sees only their own solo quest');

reset role;
delete from public.couple_members where couple_id = pg_temp.u('ab') and user_id = pg_temp.u('b');
update public.couples set ended_at = now() where id = pg_temp.u('ab');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.rhythm(), '3:1', 'unlinked, A sees only A''s own Just me quest');
reset role;
update public.couples set ended_at = null where id = pg_temp.u('ab');
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('b'));

-- ---------------------------------------------------------------------------
-- 2. The goal: either partner sets, pauses, clears; no one else
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.goal(), 'none', 'a couple starts without a goal');
select lives_ok($$ select public.set_rhythm_goal('weekly') $$, 'A sets one walk a week');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.goal(), 'weekly|f', 'B sees the goal');
select lives_ok($$ select public.pause_rhythm_goal(true) $$, 'B pauses it, no reason asked');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.goal(), 'weekly|t', 'A sees it paused');
select lives_ok($$ select public.pause_rhythm_goal(false) $$, 'A resumes it');
select is(pg_temp.goal(), 'weekly|f', 'and it runs again');
select lives_ok($$ select public.pause_rhythm_goal(true) $$, 'A pauses it again');
select lives_ok($$ select public.set_rhythm_goal('twice_monthly') $$, 'A switches to two a month');
select is(pg_temp.goal(), 'twice_monthly|f', 'a new goal starts unpaused');
select throws_ok($$ select public.set_rhythm_goal('daily') $$, 'P0001', 'goal_invalid', 'a goal outside the two is refused');

select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.goal(), 'none', 'the stranger sees no goal');
select throws_ok($$ select public.set_rhythm_goal('weekly') $$, 'P0001', 'not_linked', 'nor can set one');
select throws_ok($$ select public.pause_rhythm_goal(true) $$, 'P0001', 'not_linked', 'nor pause one');
select throws_ok($$ select * from private.rhythm_goals $$, '42501', null, 'nor read the table');

select pg_temp.login(pg_temp.u('b'));
select lives_ok($$ select public.set_rhythm_goal(null) $$, 'B clears the goal alone');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.goal(), 'none', 'and it is gone for A too');
select lives_ok($$ select public.pause_rhythm_goal(true) $$, 'pausing no goal does nothing');
select is(pg_temp.goal(), 'none', 'and makes none');
select throws_ok($$ select * from private.rhythm_goals $$, '42501', null, 'a member cannot read the table either');
select throws_ok(
  $$ insert into private.rhythm_goals (couple_id, goal) values ('25252525-0000-0000-0000-0000000000ab', 'weekly') $$,
  '42501', null, 'nor write it'
);

reset role;
set local role anon;
select throws_ok($$ select * from public.my_rhythm() $$, '42501', null, 'anon cannot read a rhythm');
select throws_ok($$ select * from public.rhythm_goal() $$, '42501', null, 'nor a goal');

select * from finish();
rollback;
