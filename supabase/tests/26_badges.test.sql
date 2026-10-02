begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('26262626-0000-0000-0000-00000000000a', 'a@test.local'),
  ('26262626-0000-0000-0000-00000000000b', 'b@test.local'),
  ('26262626-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('26262626-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab'));
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b'));

-- A run, finished unless p_open, as the owner. p_couple null makes a Just me run.
create function pg_temp.run(p_run text, p_couple text, p_open boolean, variadic p_members text[])
returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, completed_at)
  values (pg_temp.u(p_run), case when p_couple is not null then pg_temp.u(p_couple) end, 't', '{"stops": []}',
    case when not p_open then now() end);
  insert into public.trail_run_members (run_id, user_id) select pg_temp.u(p_run), pg_temp.u(m) from unnest(p_members) m;
$$;

-- This season's badge, and one for a season that is not now.
create function pg_temp.season() returns text language sql security definer as $$ select private.season_badge(now()) $$;
create function pg_temp.other_season() returns text language sql security definer as $$
  select case when private.season_badge(now()) = 'season-winter' then 'season-summer' else 'season-winter' end
$$;

create function pg_temp.badges() returns text language sql as $$
  select coalesce(string_agg(format('%s:%s', badge, scope), ',' order by badge), '') from public.my_badges()
$$;

create function pg_temp.feed() returns text language sql as $$
  select coalesce(string_agg(payload ->> 'badge', ',' order by payload ->> 'badge'), '')
  from public.my_feed() where kind = 'badge_earned'
$$;

select pg_temp.run('c1', 'ab', false, 'a', 'b');
select pg_temp.run('c2', 'ab', false, 'a');
select pg_temp.run('c3', 'ab', true, 'a', 'b');
select pg_temp.run('f1', null, false, 'a');

-- ---------------------------------------------------------------------------
-- 1. What the server checks, trusts, and refuses
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(
  public.claim_badges(pg_temp.u('c1'), array['first-rain-walk', 'first-after-dark', pg_temp.season(), pg_temp.other_season()]),
  array['first-walk', 'first-after-dark', pg_temp.season()],
  'A''s claim earns first-walk unasked, the phone''s after-dark, and this season only; never rain, never another season'
);
select is((select earned_on from public.my_badges() where badge = 'first-walk'),
  (now() at time zone 'Europe/Riga')::date, 'earned today, by the day in Riga');

select pg_temp.login(pg_temp.u('b'));
select is(public.claim_badges(pg_temp.u('c1'), array['first-after-dark', pg_temp.season()]), '{}'::text[],
  'B''s claim for the same walk earns nothing more: once per couple');
select is(pg_temp.badges(), format('first-after-dark:couple,first-walk:couple,%s:couple', pg_temp.season()),
  'B sees the couple''s badges');
select is(pg_temp.feed(), format('first-after-dark,first-walk,%s', pg_temp.season()),
  'B, who walked it, finds each badge in the feed');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), '', 'A, who claimed them, gets no feed item');

select is(public.claim_badges(pg_temp.u('c2'), array['special-quest']), array['special-quest'],
  'a special quest is taken on the phone''s word');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), format('first-after-dark,first-walk,%s', pg_temp.season()),
  'a badge from a quest B did not join reaches B''s feed as nothing: it would tell B a walk happened');
select is((select count(*)::int from public.my_badges()), 4, 'though the couple holds it');

select pg_temp.login(pg_temp.u('a'));
select is(public.claim_badges(pg_temp.u('c1'), array['first-rain-walk']), '{}'::text[],
  'first-rain-walk is refused even asked alone');
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000c1', array['first-swim']) $$,
  'P0001', 'badge_unknown', 'an id outside the list is an error');
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000c3', '{}') $$,
  'P0001', 'run_not_finished', 'an open run earns nothing');

-- ---------------------------------------------------------------------------
-- 2. Just me badges stay the player's own
-- ---------------------------------------------------------------------------

select is(public.claim_badges(pg_temp.u('f1'), array['first-after-dark']), array['first-walk', 'first-after-dark'],
  'A''s Just me quest earns A''s own badges, apart from the couple''s');
select is(public.claim_badges(pg_temp.u('f1'), array['first-after-dark']), '{}'::text[], 'once each');
select is((select count(*)::int from public.my_badges() where scope = 'solo'), 2, 'A sees them as solo');
select pg_temp.login(pg_temp.u('b'));
select is((select count(*)::int from public.my_badges() where scope = 'solo'), 0, 'B never sees them');
select is(pg_temp.feed(), format('first-after-dark,first-walk,%s', pg_temp.season()), 'nor hears of them');
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000f1', '{}') $$,
  'P0001', 'not_member', 'nor can claim on A''s Just me run');

-- ---------------------------------------------------------------------------
-- 3. Strangers, exes, points, and the table
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('5'));
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000c1', '{}') $$,
  'P0001', 'not_member', 'the stranger cannot claim on the couple''s run');
select is(pg_temp.badges(), '', 'and sees no badges');
select throws_ok($$ select * from private.badges $$, '42501', null, 'nor reads the table');

reset role;
select is((select coalesce(sum(points), 0)::int from public.couple_stats where couple_id = pg_temp.u('ab')), 0,
  'badges award no points');

update public.couples set ended_at = now() where id = pg_temp.u('ab');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000c1', '{}') $$,
  'P0001', 'not_member', 'after the unlink, the old couple''s run earns nothing');
select is((select string_agg(scope, ',') from public.my_badges()), 'solo,solo', 'and an ex sees only their own solo badges');
select throws_ok($$ select * from private.badges $$, '42501', null, 'a member cannot read the table directly');

reset role;
set local role anon;
select throws_ok($$ select public.claim_badges('26262626-0000-0000-0000-0000000000c1', '{}') $$, '42501', null,
  'anon cannot claim');
select throws_ok($$ select * from public.my_badges() $$, '42501', null, 'nor list badges');

select * from finish();
rollback;
