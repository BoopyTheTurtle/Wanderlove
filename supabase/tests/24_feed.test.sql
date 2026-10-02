begin;
select * from no_plan();

-- Fixtures: A and B are a couple, C and D another; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('24242424-0000-0000-0000-00000000000a', 'a@test.local'),
  ('24242424-0000-0000-0000-00000000000b', 'b@test.local'),
  ('24242424-0000-0000-0000-00000000000c', 'c@test.local'),
  ('24242424-0000-0000-0000-00000000000d', 'd@test.local'),
  ('24242424-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('24242424-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab')), (pg_temp.u('cd'));
insert into public.couple_members (couple_id, user_id) values
  (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b')),
  (pg_temp.u('cd'), pg_temp.u('c')), (pg_temp.u('cd'), pg_temp.u('d'));

-- A run, as the owner: start_run has its own tests. p_couple null makes a Just me run.
create function pg_temp.run(p_run text, p_couple text, variadic p_members text[]) returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot)
  values (pg_temp.u(p_run), case when p_couple is not null then pg_temp.u(p_couple) end, 't', '{"stops": []}');
  insert into public.trail_run_members (run_id, user_id) select pg_temp.u(p_run), pg_temp.u(m) from unnest(p_members) m;
$$;

-- The caller's feed kinds, newest first.
create function pg_temp.feed() returns text language sql as $$
  select coalesce(string_agg(kind, ',' order by created_at desc, id desc), '') from public.my_feed()
$$;

-- ---------------------------------------------------------------------------
-- 1. No partner activity: starting, joining, and finishing quests add nothing (abuse-threat-model.md, X1)
-- ---------------------------------------------------------------------------

select pg_temp.run('f1', 'ab', 'a');
insert into public.run_invites (run_id, user_id) values (pg_temp.u('f1'), pg_temp.u('b'));
select pg_temp.run('f2', 'ab', 'a', 'b');
select pg_temp.run('f3', null, 'a');
select pg_temp.login(pg_temp.u('a'));
update public.trail_runs set completed_at = now() where id in (pg_temp.u('f2'), pg_temp.u('f3'));

select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), '', 'B hears nothing of A starting, inviting, or finishing quests, Together or Just me');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), '', 'nor does A');

-- ---------------------------------------------------------------------------
-- 2. Each reads only their own items
-- ---------------------------------------------------------------------------

reset role;
select private.feed_push(pg_temp.u('b'), 'walk_planned', jsonb_build_object('day', '2026-10-10', 'slot', 'morning'));
select private.feed_push(pg_temp.u('b'), 'badge_earned', jsonb_build_object('badge', 'first-walk'));
select private.feed_push(null, 'badge_earned', jsonb_build_object('badge', 'first-walk'));

select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'badge_earned,walk_planned', 'B reads B''s items, newest first');
select is((select payload from public.my_feed() where kind = 'walk_planned'),
  '{"day": "2026-10-10", "slot": "morning"}'::jsonb, 'with the payload as pushed');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), '', 'A, the partner, reads none of them');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.feed(), '', 'nor does the stranger');
reset role;
select is((select count(*)::int from private.feed_items where user_id::text like '24242424-%'), 2,
  'a push with no recipient adds nothing');

-- ---------------------------------------------------------------------------
-- 3. Unread count and marking read
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('b'));
select is(public.feed_unread_count(), 2, 'B has two unread items');
select pg_temp.login(pg_temp.u('a'));
select is(public.feed_unread_count(), 0, 'A has none');
select is(public.mark_feed_read(null), 0, 'A marking all touches none of B''s items');

reset role;
create temp table b_ids as select id from private.feed_items where user_id = pg_temp.u('b');
grant select on b_ids to authenticated;
select pg_temp.login(pg_temp.u('5'));
select is(public.mark_feed_read(array(select id from b_ids)), 0, 'the stranger cannot mark B''s items, even by id');
select pg_temp.login(pg_temp.u('a'));
select is(public.mark_feed_read(array(select id from b_ids)), 0, 'nor can the partner');
select pg_temp.login(pg_temp.u('b'));
select is(public.feed_unread_count(), 2, 'B''s items stay unread');

select is(public.mark_feed_read(array(select id from public.my_feed() where kind = 'walk_planned')), 1,
  'B marks one item');
select is(public.feed_unread_count(), 1, 'one unread is left');
select is((select count(*)::int from public.my_feed() where read_at is not null), 1, 'my_feed shows which was read');
select is(public.mark_feed_read(), 1, 'B marks the rest');
select is(public.feed_unread_count(), 0, 'nothing unread');
select is(public.mark_feed_read(), 0, 'marking twice changes nothing');
select is((select count(*)::int from public.my_feed(1)), 1, 'my_feed honours its limit');

-- ---------------------------------------------------------------------------
-- 4. League week item: lazy, once, and only for couples in before the week began
-- ---------------------------------------------------------------------------

reset role;
insert into private.leaderboard_yes (couple_id, user_id, created_at) values
  (pg_temp.u('ab'), pg_temp.u('a'), now() - interval '8 days'),
  (pg_temp.u('ab'), pg_temp.u('b'), now() - interval '8 days'),
  (pg_temp.u('cd'), pg_temp.u('c'), now()),
  (pg_temp.u('cd'), pg_temp.u('d'), now());

select pg_temp.login(pg_temp.u('a'));
select is(public.feed_unread_count(), 1, 'A''s first read this week adds the league item');
select is(pg_temp.feed(), 'league_week_started', 'it shows in A''s feed');
select is((select payload ->> 'week' from public.my_feed()),
  date_trunc('week', now() at time zone 'Europe/Riga')::date::text, 'naming the week''s Monday');
select is(pg_temp.feed(), 'league_week_started', 'a second read adds no second item');
select pg_temp.login(pg_temp.u('c'));
select is(pg_temp.feed(), '', 'a couple that joined this week gets no item until next week');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.feed(), '', 'nor does the stranger');

reset role;
delete from private.leaderboard_yes where couple_id = pg_temp.u('ab') and user_id = pg_temp.u('b');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'badge_earned,walk_planned', 'one yes alone is not the league');

-- ---------------------------------------------------------------------------
-- 5. Old items go; payloads stay minimal; nobody touches the table
-- ---------------------------------------------------------------------------

reset role;
insert into private.feed_items (user_id, kind, created_at) values (pg_temp.u('d'), 'walk_planned', now() - interval '91 days');
select pg_temp.login(pg_temp.u('d'));
select is(public.feed_unread_count(), 0, 'an item older than 90 days does not count');
select is(pg_temp.feed(), '', 'nor show');
reset role;
select is((select count(*)::int from private.feed_items where user_id = pg_temp.u('d')), 0, 'and is deleted');

select throws_ok(
  $$ select private.feed_push('24242424-0000-0000-0000-00000000000a', 'walk_planned', '{"place": "Old Town"}') $$,
  '23514', null, 'a payload with any key outside the short list is refused'
);
select throws_ok(
  $$ select private.feed_push('24242424-0000-0000-0000-00000000000a', 'badge_earned', '{"run_id": "x"}') $$,
  '23514', null, 'a run id included'
);
select throws_ok(
  $$ select private.feed_push('24242424-0000-0000-0000-00000000000a', 'partner_finished_quest') $$,
  '23514', null, 'and a kind outside the list, such as partner activity'
);

select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select * from private.feed_items $$, '42501', null, 'a member cannot read the table directly');
select throws_ok(
  $$ insert into private.feed_items (user_id, kind) values ('24242424-0000-0000-0000-00000000000b', 'walk_planned') $$,
  '42501', null, 'nor write to it'
);
select throws_ok(
  $$ select private.feed_push('24242424-0000-0000-0000-00000000000b', 'walk_planned') $$,
  '42501', null, 'nor call the push'
);

reset role;
set local role anon;
select throws_ok($$ select * from public.my_feed() $$, '42501', null, 'anon cannot read a feed');
select throws_ok($$ select public.feed_unread_count() $$, '42501', null, 'nor count one');
select throws_ok($$ select public.mark_feed_read() $$, '42501', null, 'nor mark one');

select * from finish();
rollback;
