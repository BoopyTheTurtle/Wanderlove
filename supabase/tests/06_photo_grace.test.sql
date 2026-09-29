begin;
select * from no_plan();

-- Fixtures: A and B share three runs: finished an hour ago, finished 25 hours ago, and abandoned. S is a stranger.
insert into auth.users (id, email) values
  ('66666666-0000-0000-0000-00000000000a', 'a@test.local'),
  ('66666666-0000-0000-0000-00000000000b', 'b@test.local'),
  ('66666666-0000-0000-0000-000000000005', 's@test.local');
insert into public.trail_runs (id, trail_id, trail_snapshot, completed_at, abandoned_at) values
  ('66666666-0000-0000-0000-0000000000a1', 't', '{"stops": [{"id": "osm-node-1"}]}', now() - interval '1 hour', null),
  ('66666666-0000-0000-0000-0000000000a2', 't', '{"stops": [{"id": "osm-node-1"}]}', now() - interval '25 hours', null),
  ('66666666-0000-0000-0000-0000000000a3', 't', '{"stops": [{"id": "osm-node-1"}]}', null, now() - interval '1 hour');
insert into public.trail_run_members (run_id, user_id)
select r.id, u.id
from (values ('66666666-0000-0000-0000-0000000000a1'::uuid), ('66666666-0000-0000-0000-0000000000a2'::uuid),
             ('66666666-0000-0000-0000-0000000000a3'::uuid)) as r (id),
     (values ('66666666-0000-0000-0000-00000000000a'::uuid), ('66666666-0000-0000-0000-00000000000b'::uuid)) as u (id);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Photo rows
select pg_temp.login('66666666-0000-0000-0000-00000000000b');
select lives_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
     values ('66666666-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-0000000000a1', 'osm-node-1',
             '66666666-0000-0000-0000-0000000000a1/66666666-0000-0000-0000-0000000000f1.jpg', 10, 10) $$,
  'the partner adds a photo to a run finished an hour ago'
);
select throws_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
     values ('66666666-0000-0000-0000-0000000000f2', '66666666-0000-0000-0000-0000000000a2', 'osm-node-1',
             '66666666-0000-0000-0000-0000000000a2/66666666-0000-0000-0000-0000000000f2.jpg', 10, 10) $$,
  '42501', null,
  'a run finished 25 hours ago takes no more photos'
);
select throws_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
     values ('66666666-0000-0000-0000-0000000000f3', '66666666-0000-0000-0000-0000000000a3', 'osm-node-1',
             '66666666-0000-0000-0000-0000000000a3/66666666-0000-0000-0000-0000000000f3.jpg', 10, 10) $$,
  '42501', null,
  'an abandoned run takes no photos'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('66666666-0000-0000-0000-0000000000a1', 'osm-node-1') $$,
  '42501', null,
  'a finished run still takes no stop completions'
);

select pg_temp.login('66666666-0000-0000-0000-000000000005');
select throws_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
     values ('66666666-0000-0000-0000-0000000000f4', '66666666-0000-0000-0000-0000000000a1', 'osm-node-1',
             '66666666-0000-0000-0000-0000000000a1/66666666-0000-0000-0000-0000000000f4.jpg', 10, 10) $$,
  '42501', null,
  'a stranger cannot add a photo during the grace window'
);

-- Storage objects
select pg_temp.login('66666666-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '66666666-0000-0000-0000-0000000000a1/66666666-0000-0000-0000-0000000000f5.jpg', auth.uid()::text) $$,
  'a member uploads to a run finished an hour ago'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '66666666-0000-0000-0000-0000000000a2/66666666-0000-0000-0000-0000000000f6.jpg', auth.uid()::text) $$,
  '42501', null,
  'a member cannot upload to a run finished 25 hours ago'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '66666666-0000-0000-0000-0000000000a3/66666666-0000-0000-0000-0000000000f7.jpg', auth.uid()::text) $$,
  '42501', null,
  'a member cannot upload to an abandoned run'
);

select pg_temp.login('66666666-0000-0000-0000-000000000005');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '66666666-0000-0000-0000-0000000000a1/66666666-0000-0000-0000-0000000000f8.jpg', auth.uid()::text) $$,
  '42501', null,
  'a stranger cannot upload during the grace window'
);

select * from finish();
rollback;
