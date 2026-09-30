begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger.
insert into auth.users (id, email) values
  ('33333333-0000-0000-0000-00000000000a', 'a@test.local'),
  ('33333333-0000-0000-0000-00000000000b', 'b@test.local'),
  ('33333333-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('33333333-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('33333333-0000-0000-0000-0000000000cc', '33333333-0000-0000-0000-00000000000a'),
  ('33333333-0000-0000-0000-0000000000cc', '33333333-0000-0000-0000-00000000000b');
-- Every run is encrypted (20260930100000), so both members publish a key.
insert into public.user_keys (user_id, public_key, key_id) values
  ('33333333-0000-0000-0000-00000000000a', 'pubA', 'a'),
  ('33333333-0000-0000-0000-00000000000b', 'pubB', 'b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement as the current user and returns how many rows it touched.
create function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Starting a run
select pg_temp.login('33333333-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.start_run('t', '{"stops": [], "start": {"lat": 56.9, "lng": 24.1}}', '[
       {"user_id": "33333333-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "33333333-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b"}
     ]', gen_random_uuid()) $$,
  '23514', null,
  'a snapshot carrying the start point is refused'
);
select throws_ok(
  $$ insert into public.trail_runs (trail_id, trail_snapshot) values ('t', '{"stops": []}') $$,
  '42501', null,
  'runs cannot be created directly'
);
insert into ids values ('run', public.start_run('t', '{"stops": [{"id": "osm-node-1"}, {"id": "osm-node-2"}]}', '[
  {"user_id": "33333333-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
  {"user_id": "33333333-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b"}
]', gen_random_uuid()));
select is((select count(*)::int from public.trail_run_members), 2, 'start_run adds the caller and the partner');

select pg_temp.login('33333333-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.trail_runs), 1, 'the partner reads the run');

select pg_temp.login('33333333-0000-0000-0000-000000000005');
select is((select count(*)::int from public.trail_runs), 0, 'a stranger cannot read the run');
select is((select count(*)::int from public.trail_run_members), 0, 'a stranger cannot read the members');
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ((select id from ids where name = 'run'), 'osm-node-1') $$,
  '42501', null,
  'a stranger cannot complete a stop'
);

-- Completing stops
select pg_temp.login('33333333-0000-0000-0000-00000000000b');
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ((select id from ids where name = 'run'), 'osm-node-1') $$,
  'a member completes a stop on the run'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ((select id from ids where name = 'run'), 'osm-node-99') $$,
  '42501', null,
  'a stop outside the snapshot is refused'
);
select pg_temp.login('33333333-0000-0000-0000-00000000000a');
select is((select completed_by from public.stop_completions), '33333333-0000-0000-0000-00000000000b'::uuid, 'the partner sees who completed it');

-- Photos
select pg_temp.login('33333333-0000-0000-0000-00000000000b');
insert into ids values ('photo', gen_random_uuid());
select lives_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
     select p.id, r.id, 'osm-node-1', r.id || '/' || p.id || '.bin', 1600, 1200, 'nonce'
     from ids p, ids r where p.name = 'photo' and r.name = 'run' $$,
  'a member uploads a photo to the run'
);
select throws_ok(
  $$ insert into public.photos (run_id, stop_id, storage_path, width, height, nonce)
     select id, 'osm-node-1', 'elsewhere/x.bin', 10, 10, 'nonce' from ids where name = 'run' $$,
  '23514', null,
  'a storage path outside the run folder is refused'
);

select pg_temp.login('33333333-0000-0000-0000-000000000005');
select is((select count(*)::int from public.photos), 0, 'a stranger cannot see the photo');
select throws_ok(
  $$ insert into public.photo_hidden (photo_id) select id from ids where name = 'photo' $$,
  '42501', null,
  'a stranger cannot hide a photo they cannot see'
);

select pg_temp.login('33333333-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.photos), 1, 'the partner sees the photo');
select is(
  pg_temp.affected('delete from public.photos'),
  0,
  'a member cannot delete a photo someone else took'
);
select lives_ok($$ insert into public.photo_hidden (photo_id) select id from ids where name = 'photo' $$, 'a member hides a photo');
select is((select count(*)::int from public.photos), 0, 'a hidden photo leaves that member''s album');

select pg_temp.login('33333333-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.photos), 1, 'hiding leaves the photo for the uploader');

-- Unlinking keeps past runs for both and closes the open one
select lives_ok($$ select public.unlink() $$, 'B unlinks');
select is((select count(*)::int from public.trail_runs where abandoned_at is not null), 1, 'unlinking abandons the open run');
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ((select id from ids where name = 'run'), 'osm-node-2') $$,
  '42501', null,
  'an abandoned run takes no more stops'
);
select is((select count(*)::int from public.photos), 1, 'the uploader keeps the photo after unlinking');

select pg_temp.login('33333333-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.trail_runs), 1, 'the ex keeps the shared run');
select is((select count(*)::int from public.profile_cards), 2, 'exes still see each other''s card through the shared run');
insert into ids values ('solo', public.start_run('t', '{"stops": [{"id": "osm-node-3"}]}', '[
  {"user_id": "33333333-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"}
]', gen_random_uuid()));
select is(
  (select count(*)::int from public.trail_run_members where run_id = (select id from ids where name = 'solo')),
  1,
  'a run after unlinking has one member'
);

select pg_temp.login('33333333-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.trail_runs), 1, 'the ex cannot see new runs');
select is(
  pg_temp.affected('delete from public.photos'),
  1,
  'the uploader deletes their photo'
);

select * from finish();
rollback;
