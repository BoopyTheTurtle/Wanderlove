begin;
select * from no_plan();

-- Fixtures: A and B are a couple with totals, a quest this week, a name, both leaderboard yeses, and a seat. C later
-- links with A. E and F, G and H, and X and Y are further couples for the 90-day, 89-day, and account cases. S is a
-- stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('23232323-0000-0000-0000-00000000000a', 'a@test.local'),
  ('23232323-0000-0000-0000-00000000000b', 'b@test.local'),
  ('23232323-0000-0000-0000-00000000000c', 'c@test.local'),
  ('23232323-0000-0000-0000-00000000000e', 'e@test.local'),
  ('23232323-0000-0000-0000-00000000000f', 'f@test.local'),
  ('23232323-0000-0000-0000-000000000001', 'g@test.local'),
  ('23232323-0000-0000-0000-000000000002', 'h@test.local'),
  ('23232323-0000-0000-0000-000000000003', 'x@test.local'),
  ('23232323-0000-0000-0000-000000000004', 'y@test.local'),
  ('23232323-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('23232323-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

-- Links two people as a new couple, both members in one statement as confirm_link does. As the owner: linking has its
-- own tests.
create function pg_temp.link(p_couple text, p_one text, p_two text) returns void language sql as $$
  insert into public.couples (id) values (pg_temp.u(p_couple));
  insert into public.couple_members (couple_id, user_id)
  values (pg_temp.u(p_couple), pg_temp.u(p_one)), (pg_temp.u(p_couple), pg_temp.u(p_two));
$$;

-- This week's Monday in Riga.
create function pg_temp.wk() returns date language sql as $$
  select date_trunc('week', now() at time zone 'Europe/Riga')::date
$$;

-- Gives a couple totals, one finished quest this week, and a name. As the owner: each has its own tests.
create function pg_temp.history(p_couple text, p_run text, p_name text) returns void language sql as $$
  insert into public.couple_stats (couple_id, quests_done, photos_taken, challenges_done, points)
  values (pg_temp.u(p_couple), 3, 4, 7, 300);
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, completed_at)
  values (pg_temp.u(p_run), pg_temp.u(p_couple), 't', '{"stops": []}', now());
  insert into public.quest_points (run_id, couple_id, week_start, stop_points, photo_points, finish_points, week_bonus)
  values (pg_temp.u(p_run), pg_temp.u(p_couple), pg_temp.wk(), 50, 20, 100, 30);
  insert into private.couple_names (couple_id, name) values (pg_temp.u(p_couple), p_name);
$$;

-- What the caller sees of their couple, as one text: totals, quest point rows, name, leaderboard status.
create function pg_temp.seen() returns text language sql as $$
  select format('%s|%s|%s|%s',
    coalesce((select format('%s/%s/%s/%s', quests_done, photos_taken, challenges_done, points) from public.couple_stats),
      'no totals'),
    (select count(*) from public.quest_points),
    coalesce((select name from public.couple_name()), 'no name'),
    coalesce((select format('%s,%s,%s', in_league, my_yes, partner_yes) from public.leaderboard_status()), 'no status'))
$$;

create function pg_temp.archives() returns int language sql security definer as $$
  select count(*)::int from private.couple_archives
$$;

create function pg_temp.seats(p_couple text) returns int language sql security definer as $$
  select count(*)::int from private.league_seats where couple_id = pg_temp.u(p_couple)
$$;

-- ---------------------------------------------------------------------------
-- 1. Unlink keeps the couple's past where nobody reads it
-- ---------------------------------------------------------------------------

select pg_temp.link('ab1', 'a', 'b');
select pg_temp.history('ab1', 'a1', 'Wild Ones');
select pg_temp.login(pg_temp.u('a'));
select is(public.join_leaderboard(), 'waiting', 'A says yes to the leaderboard');
select pg_temp.login(pg_temp.u('b'));
select is(public.join_leaderboard(), 'joined', 'B says yes too');
select is((select couple_name from public.my_league() where is_me), 'Wild Ones', 'and the couple takes a seat');
select is(pg_temp.seen(), '3/4/7/300|1|Wild Ones|t,t,t', 'B sees the couple''s totals, quest, name, and opt-in');

select lives_ok($$ select public.unlink() $$, 'B unlinks');
select is(pg_temp.seen(), 'no totals|0|no name|no status', 'B sees nothing of the old couple');
select throws_ok($$ select * from private.couple_archives $$, '42501', null, 'B cannot read the archive');
select throws_ok($$ select * from private.archived_quest_points $$, '42501', null, 'nor its quest points');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.seen(), 'no totals|0|no name|no status', 'nor does A');
select throws_ok($$ select * from private.couple_archives $$, '42501', null, 'A cannot read the archive');
select throws_ok($$ select * from private.archived_quest_points $$, '42501', null, 'nor its quest points');
select throws_ok($$ delete from private.couple_archives $$, '42501', null, 'nor delete it');
select pg_temp.login(pg_temp.u('5'));
select throws_ok($$ select * from private.couple_archives $$, '42501', null, 'a stranger cannot read the archive');
select throws_ok($$ select * from private.archived_quest_points $$, '42501', null, 'nor its quest points');
select throws_ok($$ select private.restore_couple(pg_temp.u('ab1'), pg_temp.u('a'), pg_temp.u('b')) $$, '42501', null,
  'nor call the restore');
set local role anon;
select throws_ok($$ select * from private.couple_archives $$, '42501', null, 'nor can anon');

reset role;
select is(pg_temp.archives(), 1, 'the pair has one archive');
select is(
  (select count(*)::int from public.couple_stats where couple_id = pg_temp.u('ab1'))
  + (select count(*)::int from public.quest_points where couple_id = pg_temp.u('ab1'))
  + (select count(*)::int from private.couple_names where couple_id = pg_temp.u('ab1'))
  + (select count(*)::int from private.leaderboard_yes where couple_id = pg_temp.u('ab1'))
  + pg_temp.seats('ab1'),
  0, 'and the old couple keeps nothing'
);
select is(
  (select array_agg(c.column_name::text order by c.column_name) from information_schema.columns c
   where c.table_schema = 'private' and c.table_name in ('couple_archives', 'archived_quest_points')
     and c.column_name ~ '^(start|path|lat|lng|stop_id|uploader_id|user_id|completed_by)$'),
  null, 'the archive holds no position and no per-person attribution'
);

-- ---------------------------------------------------------------------------
-- 2. Relinking restores totals, quests, and name, but the leaderboard needs both yeses again
-- ---------------------------------------------------------------------------

select pg_temp.link('ab2', 'b', 'a');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.seen(), '3/4/7/300|1|Wild Ones|f,f,f', 'A sees the totals, quest, and name again, but no opt-in');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.seen(), '3/4/7/300|1|Wild Ones|f,f,f', 'so does B');
reset role;
select is(pg_temp.seats('ab2'), 0, 'the new couple has no seat');
select is(pg_temp.archives(), 0, 'and the archive is gone');
select pg_temp.login(pg_temp.u('a'));
select is(public.join_leaderboard(), 'waiting', 'A says yes again');
select pg_temp.login(pg_temp.u('b'));
select is(public.join_leaderboard(), 'joined', 'B says yes again');
select is((select format('%s:%s', couple_name, weekly_points) from public.my_league() where is_me), 'Wild Ones:200',
  'the board shows the couple with this week''s quest');

-- ---------------------------------------------------------------------------
-- 3. A partner who links with someone else gets nothing
-- ---------------------------------------------------------------------------

select lives_ok($$ select public.unlink() $$, 'A unlinks B again');
reset role;
select pg_temp.link('ac', 'a', 'c');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.seen(), 'no totals|0|no name|f,f,f', 'A and C start from nothing');
select pg_temp.login(pg_temp.u('c'));
select is(pg_temp.seen(), 'no totals|0|no name|f,f,f', 'C sees nothing of A and B');
reset role;
select is(pg_temp.archives(), 1, 'the archive of A and B waits for them');

-- An unlink purges archives older than 90 days, whoever they belong to.
update private.couple_archives set unlinked_at = now() - interval '91 days';
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$ select public.unlink() $$, 'C unlinks A');
reset role;
select is(
  (select count(*)::int from private.couple_archives where user_lo = pg_temp.u('a') and user_hi = pg_temp.u('b')),
  0, 'the unlink purged the expired archive of A and B'
);
select is(
  (select count(*)::int from private.archived_quest_points where user_lo = pg_temp.u('a') and user_hi = pg_temp.u('b')),
  0, 'with its quest points'
);
select is(pg_temp.archives(), 1, 'and kept the fresh one of A and C');

-- ---------------------------------------------------------------------------
-- 4. A relink weeks later still restores within 90 days
-- ---------------------------------------------------------------------------

select pg_temp.link('d1d', '1', '2');
select pg_temp.history('d1d', 'f01', 'Night Owls');
select pg_temp.login(pg_temp.u('1'));
select is(public.join_leaderboard(), 'waiting', 'G says yes');
select pg_temp.login(pg_temp.u('2'));
select is(public.join_leaderboard(), 'joined', 'H says yes');
select lives_ok($$ select public.unlink() $$, 'H unlinks');
reset role;
update private.couple_archives set unlinked_at = now() - interval '89 days'
where user_lo = pg_temp.u('1') and user_hi = pg_temp.u('2');
select pg_temp.link('d2d', '1', '2');
select pg_temp.login(pg_temp.u('1'));
select is(pg_temp.seen(), '3/4/7/300|1|Night Owls|f,f,f', 'G and H get their totals, quest, and name back at 89 days');
reset role;
select is(pg_temp.seats('d2d'), 0, 'but no seat');

-- ---------------------------------------------------------------------------
-- 5. After 90 days nothing comes back
-- ---------------------------------------------------------------------------

select pg_temp.link('ef1', 'e', 'f');
select pg_temp.history('ef1', 'e1', 'Bright Sparks');
select pg_temp.login(pg_temp.u('e'));
select lives_ok($$ select public.unlink() $$, 'E unlinks');
reset role;
update private.couple_archives set unlinked_at = now() - interval '90 days'
where user_lo = pg_temp.u('e') and user_hi = pg_temp.u('f');
select pg_temp.link('ef2', 'f', 'e');
select pg_temp.login(pg_temp.u('f'));
select is(pg_temp.seen(), 'no totals|0|no name|f,f,f', 'a relink 90 days on restores nothing');
reset role;
select is(
  (select count(*)::int from private.couple_archives where user_lo = pg_temp.u('e') and user_hi = pg_temp.u('f')),
  0, 'and the archive is gone'
);
select is(
  (select count(*)::int from private.archived_quest_points where user_lo = pg_temp.u('e') and user_hi = pg_temp.u('f')),
  0, 'with its quest points'
);

-- ---------------------------------------------------------------------------
-- 6. Deleting an account deletes the archive
-- ---------------------------------------------------------------------------

select pg_temp.link('dd', '3', '4');
select pg_temp.history('dd', 'f02', 'Odd Socks');
select pg_temp.login(pg_temp.u('3'));
select lives_ok($$ select public.unlink() $$, 'X unlinks');
reset role;
select is(
  (select count(*)::int from private.couple_archives where user_lo = pg_temp.u('3') and user_hi = pg_temp.u('4')),
  1, 'X and Y have an archive'
);
delete from auth.users where id = pg_temp.u('4');
select is(
  (select count(*)::int from private.couple_archives where user_lo = pg_temp.u('3') and user_hi = pg_temp.u('4')),
  0, 'Y''s account deletion takes it'
);
select is(
  (select count(*)::int from private.archived_quest_points where user_lo = pg_temp.u('3') and user_hi = pg_temp.u('4')),
  0, 'with its quest points'
);

select * from finish();
rollback;
