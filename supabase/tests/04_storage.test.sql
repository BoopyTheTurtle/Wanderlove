begin;
select * from no_plan();

-- Fixtures: A and B share a run; S is a stranger.
insert into auth.users (id, email) values
  ('44444444-0000-0000-0000-00000000000a', 'a@test.local'),
  ('44444444-0000-0000-0000-00000000000b', 'b@test.local'),
  ('44444444-0000-0000-0000-000000000005', 's@test.local');
insert into public.trail_runs (id, trail_id, trail_snapshot)
values ('44444444-0000-0000-0000-0000000000aa', 't', '{"stops": [{"id": "osm-node-1"}]}');
insert into public.trail_run_members (run_id, user_id) values
  ('44444444-0000-0000-0000-0000000000aa', '44444444-0000-0000-0000-00000000000a'),
  ('44444444-0000-0000-0000-0000000000aa', '44444444-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

select is(
  (select public from storage.buckets where id = 'photos'), false, 'the photos bucket is private'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'photos'),
  array['application/octet-stream'],
  'the bucket takes only encrypted bytes (20260930100000)'
);

select pg_temp.login('44444444-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '44444444-0000-0000-0000-0000000000aa/44444444-0000-0000-0000-0000000000f1.bin', auth.uid()::text) $$,
  'a member uploads into their run folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '44444444-0000-0000-0000-0000000000aa/notes.txt', auth.uid()::text) $$,
  '42501', null,
  'a name outside the <run>/<photo>.bin pattern is refused'
);

select pg_temp.login('44444444-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos'), 1, 'the partner can read the object'
);

select pg_temp.login('44444444-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos'), 0, 'a stranger cannot read the object'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '44444444-0000-0000-0000-0000000000aa/44444444-0000-0000-0000-0000000000f2.bin', auth.uid()::text) $$,
  '42501', null,
  'a stranger cannot upload into someone else''s run'
);

select * from finish();
rollback;
