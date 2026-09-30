begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. A and B share six runs:
--   old       completed 31 days ago, two photos
--   gave_up   abandoned 31 days ago, one photo
--   recent    completed 29 days ago, one photo
--   active    started a day ago and still open, one photo
--   forgotten started 61 days ago and never closed, one photo
--   lingering started 59 days ago and never closed, one photo
--   orphan    completed 40 days ago, one file in the bucket with no photo row
--   empty     completed 40 days ago, never had a photo
insert into auth.users (id, email) values
  ('10101010-0000-0000-0000-00000000000a', 'a@test.local'),
  ('10101010-0000-0000-0000-00000000000b', 'b@test.local'),
  ('10101010-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('10101010-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('10101010-0000-0000-0000-0000000000cc', '10101010-0000-0000-0000-00000000000a'),
  ('10101010-0000-0000-0000-0000000000cc', '10101010-0000-0000-0000-00000000000b');

insert into public.trail_runs (id, trail_id, trail_snapshot, started_at, completed_at, abandoned_at) values
  ('10101010-0000-0000-0000-0000000000a1', 't', '{"stops": []}', now() - interval '31 days 2 hours',
   now() - interval '31 days', null),
  ('10101010-0000-0000-0000-0000000000a2', 't', '{"stops": []}', now() - interval '31 days 2 hours',
   null, now() - interval '31 days'),
  ('10101010-0000-0000-0000-0000000000a3', 't', '{"stops": []}', now() - interval '29 days 2 hours',
   now() - interval '29 days', null),
  ('10101010-0000-0000-0000-0000000000a4', 't', '{"stops": []}', now() - interval '1 day', null, null),
  ('10101010-0000-0000-0000-0000000000a5', 't', '{"stops": []}', now() - interval '61 days', null, null),
  ('10101010-0000-0000-0000-0000000000a6', 't', '{"stops": []}', now() - interval '59 days', null, null),
  ('10101010-0000-0000-0000-0000000000a7', 't', '{"stops": []}', now() - interval '40 days 2 hours',
   now() - interval '40 days', null),
  ('10101010-0000-0000-0000-0000000000a8', 't', '{"stops": []}', now() - interval '40 days 2 hours',
   now() - interval '40 days', null);
insert into public.trail_run_members (run_id, user_id)
select r.id, u.id
from public.trail_runs r,
     (values ('10101010-0000-0000-0000-00000000000a'::uuid), ('10101010-0000-0000-0000-00000000000b'::uuid)) as u (id)
where r.id::text like '10101010-%';

-- Photo rows, written as the owner (photo fN belongs to run aN; f1 and f0 both to run a1).
insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height, nonce)
select p.id, p.run_id, 'osm-node-1', '10101010-0000-0000-0000-00000000000a',
       p.run_id::text || '/' || p.id::text || '.bin', 10, 10, 'nonce'
from (values
  ('10101010-0000-0000-0000-0000000000f0'::uuid, '10101010-0000-0000-0000-0000000000a1'::uuid),
  ('10101010-0000-0000-0000-0000000000f1'::uuid, '10101010-0000-0000-0000-0000000000a1'::uuid),
  ('10101010-0000-0000-0000-0000000000f2'::uuid, '10101010-0000-0000-0000-0000000000a2'::uuid),
  ('10101010-0000-0000-0000-0000000000f3'::uuid, '10101010-0000-0000-0000-0000000000a3'::uuid),
  ('10101010-0000-0000-0000-0000000000f4'::uuid, '10101010-0000-0000-0000-0000000000a4'::uuid),
  ('10101010-0000-0000-0000-0000000000f5'::uuid, '10101010-0000-0000-0000-0000000000a5'::uuid),
  ('10101010-0000-0000-0000-0000000000f6'::uuid, '10101010-0000-0000-0000-0000000000a6'::uuid)
) as p (id, run_id);
insert into storage.objects (bucket_id, name, owner_id) values
  ('photos', '10101010-0000-0000-0000-0000000000a7/10101010-0000-0000-0000-0000000000f7.bin',
   '10101010-0000-0000-0000-00000000000a');

-- Other runs on a shared local stack may have expired too; stamp them, so the counts below cover the fixtures alone.
update public.trail_runs set photos_purged_at = now() where id::text not like '10101010-%';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.as_service() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  select set_config('role', 'service_role', true);
$$;

-- ---------------------------------------------------------------------------
-- Nobody but the service role may call either function
-- ---------------------------------------------------------------------------

select pg_temp.login('10101010-0000-0000-0000-00000000000a');
select throws_ok($$ select * from public.expired_photos() $$, '42501', null,
  'a member cannot list expired photos');
select throws_ok($$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f0}') $$, '42501', null,
  'a member cannot purge photos');

select pg_temp.login('10101010-0000-0000-0000-00000000000b');
select throws_ok($$ select * from public.expired_photos() $$, '42501', null,
  'the partner cannot list expired photos');
select throws_ok($$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f0}') $$, '42501', null,
  'the partner cannot purge photos');

select pg_temp.login('10101010-0000-0000-0000-000000000005');
select throws_ok($$ select * from public.expired_photos() $$, '42501', null,
  'a stranger cannot list expired photos');
select throws_ok($$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f0}') $$, '42501', null,
  'a stranger cannot purge photos');

reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$ select * from public.expired_photos() $$, '42501', null,
  'anon cannot list expired photos');
select throws_ok($$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f0}') $$, '42501', null,
  'anon cannot purge photos');

select pg_temp.login('10101010-0000-0000-0000-00000000000a');
select is(
  (select photos_purged_at from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a1'),
  null,
  'a member reads photos_purged_at on their run'
);
select throws_ok(
  $$ update public.trail_runs set photos_purged_at = now() where id = '10101010-0000-0000-0000-0000000000a4' $$,
  '42501', null,
  'a member cannot set photos_purged_at'
);

-- ---------------------------------------------------------------------------
-- The service role gets exactly the expired photos
-- ---------------------------------------------------------------------------

select pg_temp.as_service();
select set_eq(
  $$ select photo_id, run_id, storage_path from public.expired_photos(1000) where run_id::text like '10101010-%' $$,
  $$ values
       ('10101010-0000-0000-0000-0000000000f0'::uuid, '10101010-0000-0000-0000-0000000000a1'::uuid,
        '10101010-0000-0000-0000-0000000000a1/10101010-0000-0000-0000-0000000000f0.bin'),
       ('10101010-0000-0000-0000-0000000000f1'::uuid, '10101010-0000-0000-0000-0000000000a1'::uuid,
        '10101010-0000-0000-0000-0000000000a1/10101010-0000-0000-0000-0000000000f1.bin'),
       ('10101010-0000-0000-0000-0000000000f2'::uuid, '10101010-0000-0000-0000-0000000000a2'::uuid,
        '10101010-0000-0000-0000-0000000000a2/10101010-0000-0000-0000-0000000000f2.bin'),
       ('10101010-0000-0000-0000-0000000000f5'::uuid, '10101010-0000-0000-0000-0000000000a5'::uuid,
        '10101010-0000-0000-0000-0000000000a5/10101010-0000-0000-0000-0000000000f5.bin'),
       (null::uuid, '10101010-0000-0000-0000-0000000000a7'::uuid,
        '10101010-0000-0000-0000-0000000000a7/10101010-0000-0000-0000-0000000000f7.bin') $$,
  'expired: runs completed or abandoned over 30 days ago, open runs started over 60 days ago, and orphan files'
);
select is(
  (select count(*)::int from public.expired_photos(2)),
  2,
  'a batch holds at most p_limit photos'
);

-- ---------------------------------------------------------------------------
-- Purging forgets the rows and stamps the runs
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f0, 10101010-0000-0000-0000-0000000000f2,
       10101010-0000-0000-0000-0000000000f3, 10101010-0000-0000-0000-0000000000f4}') $$,
  $$ values (2, 2) $$,
  'purge deletes the two expired rows it was given and stamps the two emptied expired runs'
);

reset role;
select set_eq(
  $$ select id from public.photos where run_id::text like '10101010-%' $$,
  $$ values ('10101010-0000-0000-0000-0000000000f1'::uuid), ('10101010-0000-0000-0000-0000000000f3'::uuid),
            ('10101010-0000-0000-0000-0000000000f4'::uuid), ('10101010-0000-0000-0000-0000000000f5'::uuid),
            ('10101010-0000-0000-0000-0000000000f6'::uuid) $$,
  'purge removes only the expired rows it was given; recent and active photos stay'
);
select set_eq(
  $$ select id from public.trail_runs where id::text like '10101010-%' and photos_purged_at is not null $$,
  $$ values ('10101010-0000-0000-0000-0000000000a2'::uuid), ('10101010-0000-0000-0000-0000000000a8'::uuid) $$,
  'runs with nothing left get photos_purged_at; runs still holding a row or a file do not'
);

select pg_temp.as_service();
select results_eq(
  $$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f1, 10101010-0000-0000-0000-0000000000f5}') $$,
  $$ values (2, 2) $$,
  'purging the remaining expired rows stamps their runs'
);
select results_eq(
  $$ select * from public.purge_photos('{10101010-0000-0000-0000-0000000000f1, 10101010-0000-0000-0000-0000000000f5}') $$,
  $$ values (0, 0) $$,
  'purging again changes nothing'
);
select set_eq(
  $$ select photo_id from public.expired_photos(1000) where run_id::text like '10101010-%' $$,
  $$ values (null::uuid) $$,
  'only the orphan file is left, until the Storage API deletes it'
);

reset role;
select is(
  (select photos_purged_at from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a7'),
  null,
  'a run whose file is still in the bucket stays unstamped'
);
select is(
  (select count(*)::int from public.trail_runs where id::text like '10101010-%'),
  8,
  'purging keeps every run'
);

select * from finish();
rollback;
