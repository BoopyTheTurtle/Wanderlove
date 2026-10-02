begin;
select * from no_plan();

-- Fixtures: A and B are a couple with five shared runs (a1 has six stops; a3 to a5 one each); A also walks a Just me
-- run (a2, no couple). S is a stranger.
insert into auth.users (id, email) values
  ('21212121-0000-0000-0000-00000000000a', 'a@test.local'),
  ('21212121-0000-0000-0000-00000000000b', 'b@test.local'),
  ('21212121-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('21212121-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('21212121-0000-0000-0000-0000000000cc', '21212121-0000-0000-0000-00000000000a'),
  ('21212121-0000-0000-0000-0000000000cc', '21212121-0000-0000-0000-00000000000b');
insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot) values
  ('21212121-0000-0000-0000-0000000000a1', '21212121-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}, {"id": "osm-node-2"}, {"id": "osm-node-3"}, {"id": "osm-node-4"},
               {"id": "osm-node-5"}, {"id": "osm-node-6"}]}'),
  ('21212121-0000-0000-0000-0000000000a2', null, 't', '{"stops": [{"id": "osm-node-1"}]}'),
  ('21212121-0000-0000-0000-0000000000a3', '21212121-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}]}'),
  ('21212121-0000-0000-0000-0000000000a4', '21212121-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}]}'),
  ('21212121-0000-0000-0000-0000000000a5', '21212121-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}]}');
insert into public.trail_run_members (run_id, user_id)
select r.id, m.user_id
from public.trail_runs r
cross join (values ('21212121-0000-0000-0000-00000000000a'::uuid), ('21212121-0000-0000-0000-00000000000b'::uuid)) m (user_id)
where r.couple_id = '21212121-0000-0000-0000-0000000000cc';
insert into public.trail_run_members (run_id, user_id) values
  ('21212121-0000-0000-0000-0000000000a2', '21212121-0000-0000-0000-00000000000a');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A photo row for a run, uploaded by A or B. Inserted as the owner: the photo policies have their own tests.
create function pg_temp.photo(p_run text, p_photo text, p_uploader text) returns void language sql as $$
  insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height, nonce)
  values (('21212121-0000-0000-0000-' || p_photo)::uuid, ('21212121-0000-0000-0000-' || p_run)::uuid, 'osm-node-1',
          ('21212121-0000-0000-0000-' || p_uploader)::uuid, '21212121-0000-0000-0000-' || p_run
          || '/21212121-0000-0000-0000-' || p_photo || '.bin', 10, 10, 'nonce')
$$;

-- A run's points as [stop, photo, finish, week bonus, total], as the owner sees them, or null without a row.
create function pg_temp.run_points(p_run text) returns int[] language sql security definer as $$
  select array[stop_points, photo_points, finish_points, week_bonus, total] from public.quest_points
  where run_id = ('21212121-0000-0000-0000-' || p_run)::uuid
$$;

-- The couple's lifetime points, or null without a couple_stats row.
create function pg_temp.lifetime() returns int language sql security definer as $$
  select points from public.couple_stats where couple_id = '21212121-0000-0000-0000-0000000000cc'
$$;

select is(pg_temp.run_points('0000000000a1'), null, 'a run that has done nothing has no points row');
select is(pg_temp.lifetime(), null, 'nor does the couple have totals');

-- ---------------------------------------------------------------------------
-- Stops: 10 each, at most 5 per quest
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
insert into public.stop_completions (run_id, stop_id)
select '21212121-0000-0000-0000-0000000000a1', 'osm-node-' || n from generate_series(1, 5) n;
reset role;
select is(pg_temp.run_points('0000000000a1'), array[50, 0, 0, 0, 50], 'five stops earn 50');
select is(pg_temp.lifetime(), 50, 'and add 50 to the lifetime total');

select pg_temp.login('21212121-0000-0000-0000-00000000000b');
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id)
     values ('21212121-0000-0000-0000-0000000000a1', 'osm-node-6') $$,
  'the partner reaches a sixth stop'
);
reset role;
select is(pg_temp.run_points('0000000000a1'), array[50, 0, 0, 0, 50], 'the sixth stop earns nothing');
select is(pg_temp.lifetime(), 50, 'nor adds to the lifetime total');

-- ---------------------------------------------------------------------------
-- Photos: 5 each, at most 5 per quest, whoever uploads
-- ---------------------------------------------------------------------------

select pg_temp.photo('0000000000a1', '0000000000f1', '00000000000a');
select pg_temp.photo('0000000000a1', '0000000000f2', '00000000000b');
select is(pg_temp.run_points('0000000000a1'), array[50, 10, 0, 0, 60], 'a photo from each member earns 5 each');
select pg_temp.photo('0000000000a1', '0000000000f3', '00000000000a');
select pg_temp.photo('0000000000a1', '0000000000f4', '00000000000b');
select pg_temp.photo('0000000000a1', '0000000000f5', '00000000000a');
select pg_temp.photo('0000000000a1', '0000000000f6', '00000000000b');
select is(pg_temp.run_points('0000000000a1'), array[50, 25, 0, 0, 75], 'the sixth photo earns nothing');
select is(pg_temp.lifetime(), 75, 'the lifetime total follows the caps');

-- ---------------------------------------------------------------------------
-- Finishing: 100 once, plus 30 for the couple's first quest of the week
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
update public.trail_runs set completed_at = now() where id = '21212121-0000-0000-0000-0000000000a1';
reset role;
select is(pg_temp.run_points('0000000000a1'), array[50, 25, 100, 30, 205],
  'finishing the week''s first quest earns 100 and the 30 bonus');
select is(pg_temp.lifetime(), 205, 'the lifetime total takes both');
select is(
  (select week_start from public.quest_points where run_id = '21212121-0000-0000-0000-0000000000a1'),
  date_trunc('week', now() at time zone 'Europe/Riga')::date,
  'the quest sits in this week, Monday in Riga'
);

update public.trail_runs set completed_at = date_trunc('day', completed_at)
where id = '21212121-0000-0000-0000-0000000000a1';
update public.trail_runs set completed_at = null where id = '21212121-0000-0000-0000-0000000000a1';
update public.trail_runs set completed_at = now() where id = '21212121-0000-0000-0000-0000000000a1';
select is(pg_temp.run_points('0000000000a1'), array[50, 25, 100, 30, 205],
  'rounding, clearing, and setting completed_at again earns nothing more');
select is(pg_temp.lifetime(), 205, 'the lifetime total stays');

select pg_temp.login('21212121-0000-0000-0000-00000000000b');
update public.trail_runs set completed_at = now() where id = '21212121-0000-0000-0000-0000000000a3';
reset role;
select is(pg_temp.run_points('0000000000a3'), array[0, 0, 100, 0, 100],
  'a second quest the same week earns 100 and no bonus');
select is(pg_temp.lifetime(), 305, 'the lifetime total takes the 100');

-- Next week: the two finished quests move back a week, as if a week had passed.
update public.quest_points set week_start = week_start - 7 where couple_id = '21212121-0000-0000-0000-0000000000cc';
select pg_temp.login('21212121-0000-0000-0000-00000000000a');
insert into public.stop_completions (run_id, stop_id) values ('21212121-0000-0000-0000-0000000000a4', 'osm-node-1');
update public.trail_runs set completed_at = now() where id = '21212121-0000-0000-0000-0000000000a4';
reset role;
select is(pg_temp.run_points('0000000000a4'), array[10, 0, 100, 30, 140],
  'the first quest of the next week earns the bonus again');
select is(pg_temp.lifetime(), 445, 'the lifetime total takes it');

-- ---------------------------------------------------------------------------
-- A quest that never finishes keeps its stop and photo points
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000b');
insert into public.stop_completions (run_id, stop_id) values ('21212121-0000-0000-0000-0000000000a5', 'osm-node-1');
reset role;
select pg_temp.photo('0000000000a5', '0000000000f7', '00000000000b');
select is(pg_temp.run_points('0000000000a5'), array[10, 5, 0, 0, 15], 'an open quest earns its stop and photo');
select is(pg_temp.lifetime(), 460, 'and they count toward the lifetime total');
select is(
  (select sum(total)::int from public.quest_points where couple_id = '21212121-0000-0000-0000-0000000000cc'),
  pg_temp.lifetime(), 'the lifetime total is the sum of the quests'
);

-- ---------------------------------------------------------------------------
-- Just me and solo runs never earn
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
insert into public.stop_completions (run_id, stop_id) values ('21212121-0000-0000-0000-0000000000a2', 'osm-node-1');
update public.trail_runs set completed_at = now() where id = '21212121-0000-0000-0000-0000000000a2';
reset role;
select pg_temp.photo('0000000000a2', '0000000000f8', '00000000000a');
select is(pg_temp.run_points('0000000000a2'), null, 'a Just me run gets no points row');
select is(pg_temp.lifetime(), 460, 'and adds nothing to the couple');

-- ---------------------------------------------------------------------------
-- Who reads the rows, and nobody writes them
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.quest_points), 4, 'a member reads the couple''s quest points');
select is((select points from public.couple_stats), 460, 'and the lifetime total');
select throws_ok(
  $$ insert into public.quest_points (run_id, couple_id, week_start, finish_points)
     values ('21212121-0000-0000-0000-0000000000a2', '21212121-0000-0000-0000-0000000000cc', '2026-09-28', 100) $$,
  '42501', null, 'a member cannot insert points'
);
select throws_ok(
  $$ update public.quest_points set week_bonus = 30 $$, '42501', null, 'a member cannot raise a quest''s points'
);
select throws_ok($$ delete from public.quest_points $$, '42501', null, 'a member cannot delete points');
select throws_ok($$ truncate public.quest_points $$, '42501', null, 'a member cannot truncate points');
select throws_ok(
  $$ update public.couple_stats set points = 10000 $$, '42501', null, 'a member cannot raise the lifetime total'
);
select throws_ok(
  $$ select private.award_points('21212121-0000-0000-0000-0000000000a5', 5, 5, true) $$,
  '42501', null, 'a member cannot call the award function'
);

select pg_temp.login('21212121-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.quest_points), 4, 'the partner reads the same rows');
select is((select points from public.couple_stats), 460, 'and the same total');
select is(
  (select array_agg(key order by key) from public.quest_points q, jsonb_object_keys(to_jsonb(q)) key
   where q.run_id = '21212121-0000-0000-0000-0000000000a1'),
  array['couple_id', 'finish_points', 'photo_points', 'run_id', 'share_points', 'stop_points', 'total', 'updated_at',
        'week_bonus', 'week_start'],
  'a row says how much, never who'
);
select throws_ok(
  $$ update public.quest_points set stop_points = 0 $$, '42501', null, 'the partner cannot change points either'
);

select pg_temp.login('21212121-0000-0000-0000-000000000005');
select is((select count(*)::int from public.quest_points), 0, 'a stranger reads no quest points');
select throws_ok(
  $$ insert into public.quest_points (run_id, couple_id, week_start)
     values ('21212121-0000-0000-0000-0000000000a2', '21212121-0000-0000-0000-0000000000cc', '2026-09-28') $$,
  '42501', null, 'a stranger cannot insert points'
);

reset role;
set local role anon;
select throws_ok($$ select * from public.quest_points $$, '42501', null, 'anon reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- Deleting photos keeps the points
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
delete from public.photos where id = '21212121-0000-0000-0000-0000000000f1';
reset role;
delete from public.photos where run_id = '21212121-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.photos where run_id = '21212121-0000-0000-0000-0000000000a1'), 0,
  'the quest''s photos are gone');
select is(pg_temp.run_points('0000000000a1'), array[50, 25, 100, 30, 205], 'the quest keeps its photo points');
select is(pg_temp.lifetime(), 460, 'and so does the lifetime total');

-- ---------------------------------------------------------------------------
-- Unlinking clears the points, and nothing refills them
-- ---------------------------------------------------------------------------

select pg_temp.login('21212121-0000-0000-0000-00000000000b');
select lives_ok($$ select public.unlink() $$, 'B unlinks');
reset role;
select is(
  (select count(*)::int from public.quest_points where couple_id = '21212121-0000-0000-0000-0000000000cc'), 0,
  'unlinking deletes the couple''s quest points'
);
select is(pg_temp.lifetime(), null, 'and its lifetime total');

select pg_temp.photo('0000000000a1', '0000000000f9', '00000000000a');
select pg_temp.photo('0000000000a5', '0000000000fa', '00000000000b');
select is(
  (select count(*)::int from public.quest_points where couple_id = '21212121-0000-0000-0000-0000000000cc'), 0,
  'a late photo on an ended couple''s run earns nothing'
);
select is(pg_temp.lifetime(), null, 'nor refills the total');

select pg_temp.login('21212121-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.quest_points), 0, 'A reads no quest points after the unlink');

select * from finish();
rollback;
