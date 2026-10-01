begin;
select * from no_plan();

-- Fixtures: A and B are a couple with an open shared run; A also walks a Just me run and a run from before the link
-- (no couple either). S is a stranger.
insert into auth.users (id, email) values
  ('18181818-0000-0000-0000-00000000000a', 'a@test.local'),
  ('18181818-0000-0000-0000-00000000000b', 'b@test.local'),
  ('18181818-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('18181818-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('18181818-0000-0000-0000-0000000000cc', '18181818-0000-0000-0000-00000000000a'),
  ('18181818-0000-0000-0000-0000000000cc', '18181818-0000-0000-0000-00000000000b');
insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot) values
  ('18181818-0000-0000-0000-0000000000a1', '18181818-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}, {"id": "osm-node-2"}]}'),
  ('18181818-0000-0000-0000-0000000000a2', null, 't', '{"stops": [{"id": "osm-node-1"}]}');
insert into public.trail_run_members (run_id, user_id) values
  ('18181818-0000-0000-0000-0000000000a1', '18181818-0000-0000-0000-00000000000a'),
  ('18181818-0000-0000-0000-0000000000a1', '18181818-0000-0000-0000-00000000000b'),
  ('18181818-0000-0000-0000-0000000000a2', '18181818-0000-0000-0000-00000000000a');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- A photo row for a run, uploaded by A. Inserted as the owner: the photo policies have their own tests.
create function pg_temp.photo(p_run text, p_photo text) returns void language sql as $$
  insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height, nonce)
  values (('18181818-0000-0000-0000-' || p_photo)::uuid, ('18181818-0000-0000-0000-' || p_run)::uuid, 'osm-node-1',
          '18181818-0000-0000-0000-00000000000a', '18181818-0000-0000-0000-' || p_run || '/18181818-0000-0000-0000-'
          || p_photo || '.bin', 10, 10, 'nonce')
$$;

-- The couple's totals as the owner sees them, or null without a row.
create function pg_temp.totals() returns int[] language sql security definer as $$
  select array[quests_done, photos_taken, challenges_done] from public.couple_stats
  where couple_id = '18181818-0000-0000-0000-0000000000cc'
$$;

select is(pg_temp.totals(), null, 'a couple that has done nothing has no row yet');

-- ---------------------------------------------------------------------------
-- The couple's run counts, once per stop and once per run
-- ---------------------------------------------------------------------------

select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id)
     values ('18181818-0000-0000-0000-0000000000a1', 'osm-node-1') $$,
  'A completes a stop of the shared run'
);
select pg_temp.login('18181818-0000-0000-0000-00000000000b');
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id)
     values ('18181818-0000-0000-0000-0000000000a1', 'osm-node-1') $$,
  '23505', null,
  'the partner cannot complete the same stop again'
);
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id)
     values ('18181818-0000-0000-0000-0000000000a1', 'osm-node-2') $$,
  'the partner completes the other stop'
);
reset role;
select pg_temp.photo('0000000000a1', '0000000000f1');
select pg_temp.photo('0000000000a1', '0000000000f2');
select is(pg_temp.totals(), array[0, 2, 2], 'each stop counts once and each photo once');

select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.trail_runs where id = '18181818-0000-0000-0000-0000000000a1'
   and completed_at is null),
  1, 'A sees the shared run still open'
);
update public.trail_runs set completed_at = now() where id = '18181818-0000-0000-0000-0000000000a1';
select is(pg_temp.totals(), array[1, 2, 2], 'finishing the shared run counts one quest');

reset role;
update public.trail_runs set completed_at = date_trunc('day', completed_at)
where id = '18181818-0000-0000-0000-0000000000a1';
select is(pg_temp.totals(), array[1, 2, 2], 'rounding a finished run''s time (the trim) counts nothing more');

-- ---------------------------------------------------------------------------
-- Just me and solo runs never count
-- ---------------------------------------------------------------------------

select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id)
     values ('18181818-0000-0000-0000-0000000000a2', 'osm-node-1') $$,
  'A completes a stop of a Just me run'
);
update public.trail_runs set completed_at = now() where id = '18181818-0000-0000-0000-0000000000a2';
reset role;
select pg_temp.photo('0000000000a2', '0000000000f3');
select is(pg_temp.totals(), array[1, 2, 2], 'a Just me run adds no quest, stop, or photo to the couple');

-- ---------------------------------------------------------------------------
-- Who reads the row, and nobody writes it
-- ---------------------------------------------------------------------------

select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select is(
  (select array[quests_done, photos_taken, challenges_done] from public.couple_stats),
  array[1, 2, 2], 'a member reads the couple''s totals'
);
select throws_ok(
  $$ update public.couple_stats set quests_done = 100 $$, '42501', null, 'a member cannot raise the totals'
);
select throws_ok(
  $$ insert into public.couple_stats (couple_id, quests_done)
     values ('18181818-0000-0000-0000-0000000000cc', 100) $$,
  '42501', null, 'a member cannot insert totals'
);
select throws_ok($$ delete from public.couple_stats $$, '42501', null, 'a member cannot delete the totals');
select throws_ok($$ truncate public.couple_stats $$, '42501', null, 'a member cannot truncate the totals');
select throws_ok(
  $$ select private.count_for_couple('18181818-0000-0000-0000-0000000000a1', 100, 0, 0) $$,
  '42501', null, 'a member cannot call the counter'
);

select pg_temp.login('18181818-0000-0000-0000-00000000000b');
select is(
  (select array[quests_done, photos_taken, challenges_done] from public.couple_stats),
  array[1, 2, 2], 'the partner reads the same totals'
);
select is(
  (select array_agg(key order by key) from public.couple_stats s, jsonb_object_keys(to_jsonb(s)) key),
  array['challenges_done', 'couple_id', 'photos_taken', 'points', 'quests_done', 'updated_at'],
  'the row says how much, never who'
);

select pg_temp.login('18181818-0000-0000-0000-000000000005');
select is((select count(*)::int from public.couple_stats), 0, 'a stranger reads no totals');

reset role;
set local role anon;
select throws_ok($$ select * from public.couple_stats $$, '42501', null, 'anon reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- Deleting photos keeps the counts
-- ---------------------------------------------------------------------------

select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.photos where id = '18181818-0000-0000-0000-0000000000f1'),
  1, 'A sees her photo'
);
delete from public.photos where id = '18181818-0000-0000-0000-0000000000f1';
reset role;
delete from public.photos where run_id = '18181818-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.photos where run_id = '18181818-0000-0000-0000-0000000000a1'), 0,
  'the shared run''s photos are gone');
select is(pg_temp.totals(), array[1, 2, 2], 'the photo count outlives the photos');

-- ---------------------------------------------------------------------------
-- Unlinking clears the totals, and nothing refills them
-- ---------------------------------------------------------------------------

select pg_temp.login('18181818-0000-0000-0000-00000000000b');
select lives_ok($$ select public.unlink() $$, 'B unlinks');
select is(pg_temp.totals(), null, 'unlinking deletes the couple''s totals');
select is((select count(*)::int from public.couple_stats), 0, 'B reads no totals after the unlink');
select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.couple_stats), 0, 'nor does A');

reset role;
select pg_temp.photo('0000000000a1', '0000000000f4');
select is(pg_temp.totals(), null, 'a late row on an ended couple''s run counts nothing');

-- The same two people linking again start from zero.
insert into public.couples (id) values ('18181818-0000-0000-0000-0000000000dd');
insert into public.couple_members (couple_id, user_id) values
  ('18181818-0000-0000-0000-0000000000dd', '18181818-0000-0000-0000-00000000000a'),
  ('18181818-0000-0000-0000-0000000000dd', '18181818-0000-0000-0000-00000000000b');
select pg_temp.login('18181818-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.couple_stats), 0, 'a new link starts with no totals');

select * from finish();
rollback;
