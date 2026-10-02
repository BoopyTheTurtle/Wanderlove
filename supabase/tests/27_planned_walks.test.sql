begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('27272727-0000-0000-0000-00000000000a', 'a@test.local'),
  ('27272727-0000-0000-0000-00000000000b', 'b@test.local'),
  ('27272727-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('27272727-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab'));
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b'));

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Europe/Riga')::date $$;

-- The caller's plan as "days ahead|slot|mine", or 'none'.
create function pg_temp.plan() returns text language sql as $$
  select coalesce((select format('%s|%s|%s', day - pg_temp.today(), slot, planned_by_me) from public.my_planned_walk()),
    'none')
$$;

-- The caller's walk items as "kind:days ahead:slot:read", newest first.
create function pg_temp.feed() returns text language sql as $$
  select coalesce(string_agg(format('%s:%s:%s:%s', kind, (payload ->> 'day')::date - pg_temp.today(), payload ->> 'slot',
    read_at is not null), ',' order by created_at desc, id desc), '')
  from public.my_feed() where kind in ('walk_planned', 'walk_plan_cancelled')
$$;

-- ---------------------------------------------------------------------------
-- 1. Planning, replanning, and the partner's feed
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.plan(), 'none', 'a couple starts with no plan');
select lives_ok($$ select public.plan_walk(pg_temp.today() + 1, 'evening') $$, 'A plans tomorrow evening');
select is(pg_temp.plan(), '1|evening|t', 'A sees the plan as A''s');
select is(pg_temp.feed(), '', 'A gets no feed item for A''s own plan');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.plan(), '1|evening|f', 'B sees the same plan as A''s');
select is(pg_temp.feed(), 'walk_planned:1:evening:f', 'B finds it in the feed, by day and rough time only');

select pg_temp.login(pg_temp.u('a'));
select lives_ok($$ select public.plan_walk(pg_temp.today() + 2, 'morning') $$, 'A moves it');
select lives_ok($$ select public.plan_walk(pg_temp.today() + 3, 'afternoon') $$, 'and moves it again');
select is(pg_temp.plan(), '3|afternoon|t', 'one plan per couple: the last one stands');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'walk_planned:3:afternoon:f', 'B''s unread item is replaced, never piled up');
select is(public.mark_feed_read(), 1, 'B reads it');

select lives_ok($$ select public.plan_walk(pg_temp.today(), 'evening') $$, 'B replans it for tonight');
select is(pg_temp.plan(), '0|evening|t', 'the plan is B''s now');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), 'walk_planned:0:evening:f', 'A hears of it');

-- ---------------------------------------------------------------------------
-- 2. Cancelling
-- ---------------------------------------------------------------------------

select is(public.cancel_planned_walk(), true, 'A cancels B''s plan');
select is(pg_temp.plan(), 'none', 'the plan is gone for A');
select is(pg_temp.feed(), 'walk_planned:0:evening:f', 'A gets no item for A''s own cancelling');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.plan(), 'none', 'and for B');
select is(pg_temp.feed(), 'walk_plan_cancelled:0:evening:f,walk_planned:3:afternoon:t',
  'B hears it was cancelled; the read item stays');
select is(public.cancel_planned_walk(), false, 'cancelling nothing says so');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), 'walk_planned:0:evening:f', 'and tells nobody');

-- ---------------------------------------------------------------------------
-- 3. A passed plan just stops
-- ---------------------------------------------------------------------------

select lives_ok($$ select public.plan_walk(pg_temp.today() + 1, 'morning') $$, 'A plans again');
reset role;
update private.planned_walks set day = pg_temp.today() - 1 where couple_id = pg_temp.u('ab');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.plan(), 'none', 'once its day has passed, the plan is not returned');
select is(public.cancel_planned_walk(), false, 'cancelling a passed plan counts as nothing');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), 'walk_planned:0:evening:f', 'and tells A nothing: no follow-up on a passed plan');

-- ---------------------------------------------------------------------------
-- 4. Refusals, strangers, and the table
-- ---------------------------------------------------------------------------

select throws_ok($$ select public.plan_walk(pg_temp.today() + 1, 'midnight') $$, 'P0001', 'slot_invalid',
  'a rough time outside the three is refused');
select throws_ok($$ select public.plan_walk(pg_temp.today() - 1, 'morning') $$, 'P0001', 'day_invalid',
  'a day in the past is refused');
select throws_ok($$ select public.plan_walk(pg_temp.today() + 61, 'morning') $$, 'P0001', 'day_invalid',
  'so is one more than 60 days ahead');

select pg_temp.login(pg_temp.u('a'));
select lives_ok($$ select public.plan_walk(pg_temp.today() + 5, 'morning') $$, 'A plans once more');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.plan(), 'none', 'the stranger sees no plan');
select throws_ok($$ select public.plan_walk(pg_temp.today() + 1, 'morning') $$, 'P0001', 'not_linked',
  'nor can make one');
select throws_ok($$ select public.cancel_planned_walk() $$, 'P0001', 'not_linked', 'nor cancel one');
select is(pg_temp.feed(), '', 'nor hears of any');
select throws_ok($$ select * from private.planned_walks $$, '42501', null, 'nor reads the table');
select pg_temp.login(pg_temp.u('b'));
select throws_ok($$ select * from private.planned_walks $$, '42501', null, 'a member cannot read it directly either');
select is(pg_temp.plan(), '5|morning|f', 'and the stranger''s tries left the plan alone');

reset role;
set local role anon;
select throws_ok($$ select * from public.my_planned_walk() $$, '42501', null, 'anon cannot read a plan');
select throws_ok($$ select public.cancel_planned_walk() $$, '42501', null, 'nor cancel one');

select * from finish();
rollback;
