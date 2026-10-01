begin;
select * from no_plan();

-- Fixtures: A and B, C and D, E and F are three couples; S is a stranger, not linked to anyone. Section 6 generates
-- more couples for the league split.
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'a@test.local'),
  ('22222222-0000-0000-0000-00000000000b', 'b@test.local'),
  ('22222222-0000-0000-0000-00000000000c', 'c@test.local'),
  ('22222222-0000-0000-0000-00000000000d', 'd@test.local'),
  ('22222222-0000-0000-0000-00000000000e', 'e@test.local'),
  ('22222222-0000-0000-0000-00000000000f', 'f@test.local'),
  ('22222222-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values
  ('22222222-0000-0000-0000-0000000000ab'),
  ('22222222-0000-0000-0000-0000000000cd'),
  ('22222222-0000-0000-0000-0000000000ef');
insert into public.couple_members (couple_id, user_id) values
  ('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-00000000000b'),
  ('22222222-0000-0000-0000-0000000000cd', '22222222-0000-0000-0000-00000000000c'),
  ('22222222-0000-0000-0000-0000000000cd', '22222222-0000-0000-0000-00000000000d'),
  ('22222222-0000-0000-0000-0000000000ef', '22222222-0000-0000-0000-00000000000e'),
  ('22222222-0000-0000-0000-0000000000ef', '22222222-0000-0000-0000-00000000000f');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- This week's Monday in Riga.
create function pg_temp.wk() returns date language sql as $$
  select date_trunc('week', now() at time zone 'Europe/Riga')::date
$$;

-- The caller's leaderboard_status() as one text, for easy comparison.
create function pg_temp.status() returns text language sql as $$
  select coalesce(
    (select format('%s|%s|%s|%s', in_league, my_yes, partner_yes, needs_name) from public.leaderboard_status()),
    'no row')
$$;

-- The caller's my_league() rows as "name:points:is_me", best first, or '' when empty.
create function pg_temp.board() returns text language sql as $$
  select coalesce(string_agg(format('%s:%s:%s', couple_name, weekly_points, is_me), ', '), '')
  from public.my_league()
$$;

-- Names a couple, as the owner: the name RPCs have their own tests.
create function pg_temp.name(p_couple uuid, p_name text) returns void language sql as $$
  insert into private.couple_names (couple_id, name) values (p_couple, p_name)
  on conflict (couple_id) do update set name = excluded.name
$$;

-- A couple run with its quest points, as the owner: the awarding has its own tests.
create function pg_temp.quest(p_couple uuid, p_run uuid, p_week date, p_stop int, p_photo int, p_finish int, p_bonus int)
returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot) values (p_run, p_couple, 't', '{"stops": []}');
  insert into public.quest_points (run_id, couple_id, week_start, stop_points, photo_points, finish_points, week_bonus)
  values (p_run, p_couple, p_week, p_stop, p_photo, p_finish, p_bonus);
$$;

-- A couple's band in a week's league, read as the owner.
create function pg_temp.band(p_couple uuid, p_week date) returns text language sql as $$
  select my_band from private.league_board(p_couple, p_week) limit 1
$$;

-- ---------------------------------------------------------------------------
-- 1. Joining needs both partners' yes, and a name to be shown
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.status(), 'f|f|f|t', 'a linked couple starts outside the leaderboard, unnamed');
select is(public.join_leaderboard(), 'waiting', 'A says yes and waits for B');
select is(pg_temp.status(), 'f|t|f|t', 'A sees her yes');
select is(pg_temp.board(), '', 'one yes shows A no league');
select is(public.join_leaderboard(), 'waiting', 'saying yes twice changes nothing');

select pg_temp.login('22222222-0000-0000-0000-00000000000b');
select is(pg_temp.status(), 'f|f|t|t', 'B sees A''s yes');
select is(public.join_leaderboard(), 'joined', 'B says yes too, and the couple is in');
select is(pg_temp.status(), 't|t|t|t', 'both see the couple in, still needing a name');
select is(pg_temp.board(), '', 'an unnamed couple sees no league');
reset role;
select is((select count(*)::int from private.league_seats), 0, 'nor is it seated');

select pg_temp.name('22222222-0000-0000-0000-0000000000ab', 'Wild Ones');
select pg_temp.login('22222222-0000-0000-0000-00000000000b');
select is(pg_temp.status(), 't|t|t|f', 'once named, the couple needs nothing more');
select is(pg_temp.board(), 'Wild Ones:0:t', 'and sees itself in a league, at zero');

-- ---------------------------------------------------------------------------
-- 2. Best three finished quests of this week
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a1', pg_temp.wk(), 50, 25, 100, 30);
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a2', pg_temp.wk(), 50, 0, 100, 0);
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a3', pg_temp.wk(), 20, 5, 100, 0);
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a4', pg_temp.wk(), 10, 0, 100, 0);
-- Unfinished, though worth more than the fourth.
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a5', pg_temp.wk(), 50, 25, 0, 0);
-- Finished last week.
select pg_temp.quest('22222222-0000-0000-0000-0000000000ab', '22222222-0000-0000-0000-0000000001a6', pg_temp.wk() - 7, 50, 25, 100, 30);

select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t',
  'the week counts the best three finished quests: 205 + 150 + 125, not the fourth, the unfinished, or last week''s');
select is((select league_quests from public.my_league() limit 1), 4, 'the collective line counts this week''s four finished quests');
select is((select my_band from public.my_league() limit 1), 'top third', 'alone, the couple is in the top third');

-- ---------------------------------------------------------------------------
-- 3. What a member sees of the league, and band maths
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-0000-0000-0000-00000000000c');
select is(public.join_leaderboard(), 'waiting', 'C says yes');
select pg_temp.login('22222222-0000-0000-0000-00000000000d');
select is(public.join_leaderboard(), 'joined', 'D says yes');
select pg_temp.login('22222222-0000-0000-0000-00000000000e');
select is(public.join_leaderboard(), 'waiting', 'E says yes');
select pg_temp.login('22222222-0000-0000-0000-00000000000f');
select is(public.join_leaderboard(), 'joined', 'F says yes');
reset role;
select pg_temp.name('22222222-0000-0000-0000-0000000000cd', 'Night Owls');
select pg_temp.name('22222222-0000-0000-0000-0000000000ef', 'Bright Sparks');
select pg_temp.quest('22222222-0000-0000-0000-0000000000cd', '22222222-0000-0000-0000-0000000002c1', pg_temp.wk(), 0, 0, 100, 30);

select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Night Owls:130:f, Bright Sparks:0:f',
  'couples listed after the week''s draw join the league, best first');
select is((select league_quests from public.my_league() limit 1), 5, 'the collective line counts the league''s finished quests');
select is(
  (select array_agg(distinct key order by key) from public.my_league() l, jsonb_object_keys(to_jsonb(l)) key),
  array['couple_name', 'is_me', 'league_quests', 'my_band', 'weekly_points'],
  'a row holds names and points, never ids or avatars'
);

select pg_temp.login('22222222-0000-0000-0000-00000000000d');
select is(pg_temp.board(), 'Wild Ones:480:f, Night Owls:130:t, Bright Sparks:0:f',
  'the partner of another couple sees the same league with their own row marked');
select is((select my_band from public.my_league() limit 1), 'middle third', 'second of three is the middle third');
select pg_temp.login('22222222-0000-0000-0000-00000000000e');
select is((select my_band from public.my_league() limit 1), 'bottom third', 'third of three is the bottom third');

reset role;
select pg_temp.quest('22222222-0000-0000-0000-0000000000ef', '22222222-0000-0000-0000-0000000003e1', pg_temp.wk(), 0, 0, 100, 30);
select pg_temp.login('22222222-0000-0000-0000-00000000000e');
select is(pg_temp.board(), 'Wild Ones:480:f, Bright Sparks:130:t, Night Owls:130:f',
  'a tie orders by name');
select is((select my_band from public.my_league() limit 1), 'middle third', 'tied couples share a band');
select pg_temp.login('22222222-0000-0000-0000-00000000000c');
select is((select my_band from public.my_league() limit 1), 'middle third', 'whichever name comes first');

-- ---------------------------------------------------------------------------
-- 4. Hidden when unnamed; out at once on leaving or unlinking
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-0000-0000-0000-00000000000d');
select lives_ok($$ select public.clear_couple_name() $$, 'D clears the couple''s name');
select is(pg_temp.status(), 't|t|t|t', 'the couple stays in, needing a name');
select is(pg_temp.board(), '', 'and sees no league');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Bright Sparks:130:f',
  'nor does anyone else see it, though its points remain');
reset role;
select pg_temp.name('22222222-0000-0000-0000-0000000000cd', 'Night Owls');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Bright Sparks:130:f, Night Owls:130:f',
  'renamed, it shows again');

select pg_temp.login('22222222-0000-0000-0000-00000000000c');
select lives_ok($$ select public.leave_leaderboard() $$, 'C leaves alone');
select is(pg_temp.status(), 'f|f|f|f', 'both yeses are gone');
select is(pg_temp.board(), '', 'C sees no league');
select pg_temp.login('22222222-0000-0000-0000-00000000000d');
select is(pg_temp.status(), 'f|f|f|f', 'D''s yes went too');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Bright Sparks:130:f', 'the couple leaves every board at once');
reset role;
select is((select count(*)::int from private.league_seats where couple_id = '22222222-0000-0000-0000-0000000000cd'), 0,
  'and its seat is gone');

select pg_temp.login('22222222-0000-0000-0000-00000000000d');
select is(public.join_leaderboard(), 'waiting', 'returning needs both yeses again');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Bright Sparks:130:f', 'one yes does not bring it back');
select pg_temp.login('22222222-0000-0000-0000-00000000000c');
select is(public.join_leaderboard(), 'joined', 'C says yes again');
select is(pg_temp.board(), 'Wild Ones:480:f, Bright Sparks:130:f, Night Owls:130:t', 'and it is back');

select pg_temp.login('22222222-0000-0000-0000-00000000000f');
select lives_ok($$ select public.unlink() $$, 'F unlinks');
select is(pg_temp.status(), 'no row', 'an unlinked user has no status');
select is(pg_temp.board(), '', 'nor a league');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(pg_temp.board(), 'Wild Ones:480:t, Night Owls:130:f', 'unlinking removes the couple at once');
reset role;
select is(
  (select count(*)::int from private.leaderboard_yes where couple_id = '22222222-0000-0000-0000-0000000000ef')
  + (select count(*)::int from private.league_seats where couple_id = '22222222-0000-0000-0000-0000000000ef'),
  0, 'and deletes its yeses and seat'
);

-- ---------------------------------------------------------------------------
-- 5. Strangers and anon learn nothing; nobody writes the tables
-- ---------------------------------------------------------------------------

select pg_temp.login('22222222-0000-0000-0000-000000000005');
select is(pg_temp.status(), 'no row', 'a stranger has no status');
select is(pg_temp.board(), '', 'and sees no league');
select throws_ok($$ select public.join_leaderboard() $$, 'P0001', 'not_linked', 'a stranger cannot join');
select lives_ok($$ select public.leave_leaderboard() $$, 'leaving when not linked does nothing');
select throws_ok($$ select * from private.league_seats $$, '42501', null, 'a stranger cannot read the seats');
select throws_ok($$ select * from private.leaderboard_yes $$, '42501', null, 'nor the yeses');
select throws_ok($$ select * from private.league_weeks $$, '42501', null, 'nor the weeks');
select throws_ok(
  $$ select * from private.league_board('22222222-0000-0000-0000-0000000000ab', date_trunc('week', now())::date) $$,
  '42501', null, 'nor read another couple''s board'
);

select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into private.leaderboard_yes (couple_id, user_id)
     values ('22222222-0000-0000-0000-0000000000cd', '22222222-0000-0000-0000-00000000000a') $$,
  '42501', null, 'a member cannot write a yes directly'
);
select throws_ok($$ select private.seat_couples(date_trunc('week', now())::date) $$, '42501', null,
  'nor seat couples');

reset role;
set local role anon;
select throws_ok($$ select * from public.my_league() $$, '42501', null, 'anon cannot read a league');
select throws_ok($$ select * from public.leaderboard_status() $$, '42501', null, 'nor a status');
select throws_ok($$ select public.join_leaderboard() $$, '42501', null, 'nor join');
select throws_ok($$ select public.leave_leaderboard() $$, '42501', null, 'nor leave');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Week boundary: a new week starts at zero with a fresh draw
-- ---------------------------------------------------------------------------

select private.seat_couples(pg_temp.wk() + 7);
select is(
  (select string_agg(format('%s:%s:%s', couple_name, weekly_points, league_quests), ', ')
   from private.league_board('22222222-0000-0000-0000-0000000000ab', pg_temp.wk() + 7)),
  'Night Owls:0:0, Wild Ones:0:0', 'next week every couple starts at zero'
);
select is((select array_agg(week_start) from private.league_weeks), array[pg_temp.wk() + 7],
  'and the first call of the week deletes older weeks');

-- ---------------------------------------------------------------------------
-- 7. Leagues split above 30 couples
-- ---------------------------------------------------------------------------

-- Generated couple i: users X and Y, both said yes, named "Pair i", one finished quest worth 100 + i in week + 14.
create function pg_temp.generate(p_from int, p_to int) returns void language sql as $$
  insert into auth.users (id, email)
  select ('22222222-0000-0000-000' || s || '-' || lpad(i::text, 12, '0'))::uuid, 'gen' || s || '-' || i || '@test.local'
  from generate_series(p_from, p_to) i cross join (values (2), (3)) v (s);
  insert into public.couples (id)
  select ('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(p_from, p_to) i;
  insert into public.couple_members (couple_id, user_id)
  select ('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid,
    ('22222222-0000-0000-000' || s || '-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(p_from, p_to) i cross join (values (2), (3)) v (s);
  insert into private.leaderboard_yes (couple_id, user_id)
  select couple_id, user_id from public.couple_members
  where couple_id in (select ('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid
                      from generate_series(p_from, p_to) i);
  insert into private.couple_names (couple_id, name)
  select ('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'Pair ' || i from generate_series(p_from, p_to) i;
  select pg_temp.quest(('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid,
    ('22222222-0000-0000-0004-' || lpad(i::text, 12, '0'))::uuid, pg_temp.wk() + 14, i, 0, 100, 0)
  from generate_series(p_from, p_to) i;
$$;

create function pg_temp.gen(i int) returns uuid language sql as $$
  select ('22222222-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid
$$;

-- League sizes for a week, largest first.
create function pg_temp.sizes(p_week date) returns int[] language sql as $$
  select array_agg(n order by n desc)
  from (select count(*)::int n from private.league_seats where week_start = p_week group by league) t
$$;

-- With Wild Ones and Night Owls listed, 28 more make 30.
select pg_temp.generate(1, 28);
select private.seat_couples(pg_temp.wk() + 14);
select is((select league_count from private.league_weeks where week_start = pg_temp.wk() + 14), 1,
  '30 couples share one league');
select is(pg_temp.sizes(pg_temp.wk() + 14), array[30], 'all 30 seated');

-- Band maths in a league of 30: Pair 28 leads; Pair i ranks 29 - i; the two couples at zero tie last.
select is(pg_temp.band(pg_temp.gen(19), pg_temp.wk() + 14), 'top third', 'tenth of 30 is the top third');
select is(pg_temp.band(pg_temp.gen(18), pg_temp.wk() + 14), 'middle third', 'eleventh is the middle third');
select is(pg_temp.band(pg_temp.gen(9), pg_temp.wk() + 14), 'middle third', 'twentieth is the middle third');
select is(pg_temp.band(pg_temp.gen(8), pg_temp.wk() + 14), 'bottom third', 'twenty-first is the bottom third');
select is(pg_temp.band('22222222-0000-0000-0000-0000000000ab', pg_temp.wk() + 14), 'bottom third',
  'tied last is the bottom third');
select is(
  (select string_agg(couple_name, ',') filter (where is_me) || '|' || count(*) || '|' || max(weekly_points)
   from private.league_board(pg_temp.gen(28), pg_temp.wk() + 14)),
  'Pair 28|30|128', 'the board marks one row as mine and leads with the highest points'
);

-- A 31st couple: the next week's draw splits.
select pg_temp.generate(29, 29);
select private.seat_couples(pg_temp.wk() + 21);
select is((select league_count from private.league_weeks where week_start = pg_temp.wk() + 21), 2,
  '31 couples split into two leagues');
select is(pg_temp.sizes(pg_temp.wk() + 21), array[16, 15], 'of 16 and 15');

-- The draw is the same however often it runs: no client can steer it by calling again.
create temp table first_draw as
select couple_id, league from private.league_seats where week_start = pg_temp.wk() + 21;
delete from private.league_weeks where week_start = pg_temp.wk() + 21;
select private.seat_couples(pg_temp.wk() + 21);
select is(
  (select count(*)::int from private.league_seats s join first_draw f using (couple_id)
   where s.week_start = pg_temp.wk() + 21 and s.league = f.league),
  31, 'drawing the week again seats every couple in the same league'
);
select is(
  (select count(*)::int from private.league_board(pg_temp.gen(1), pg_temp.wk() + 21)),
  (select count(*)::int from private.league_seats
   where week_start = pg_temp.wk() + 21
     and league = (select league from private.league_seats where week_start = pg_temp.wk() + 21 and couple_id = pg_temp.gen(1))),
  'a member sees only their own league'
);
select is(
  (select count(*)::int from private.league_board(pg_temp.gen(1), pg_temp.wk() + 21) b
   join private.couple_names n on n.name = b.couple_name
   join private.league_seats s on s.couple_id = n.couple_id and s.week_start = pg_temp.wk() + 21
   where s.league <> (select league from private.league_seats where week_start = pg_temp.wk() + 21 and couple_id = pg_temp.gen(1))),
  0, 'and no couple from the other league'
);

-- Couples listed mid-week fill the smaller league; the count stays.
select pg_temp.generate(30, 30);
select private.seat_couples(pg_temp.wk() + 21);
select is(pg_temp.sizes(pg_temp.wk() + 21), array[16, 16], 'a couple joining mid-week takes the smaller league');
select pg_temp.generate(31, 31);
select private.seat_couples(pg_temp.wk() + 21);
select is(pg_temp.sizes(pg_temp.wk() + 21), array[17, 16], 'and the next one either, the count fixed for the week');
select is(
  (select league from private.league_seats where week_start = pg_temp.wk() + 21 and couple_id = pg_temp.gen(31)), 0,
  'a tie goes to the lowest league'
);

select * from finish();
rollback;
