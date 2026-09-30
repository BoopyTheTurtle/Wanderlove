begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. A and B share eight runs:
--   old       completed 31 days ago, two photos
--   gave_up   abandoned 31 days ago, one photo
--   recent    completed 29 days ago, one photo
--   active    started a day ago and still open, one photo
--   forgotten started 61 days ago and never closed, one photo
--   lingering started 59 days ago and never closed, one photo
--   orphan    completed 40 days ago, one file in the bucket with no photo row
--   empty     completed 40 days ago, never had a photo; a sealed run
-- "old" and "recent" hold a plain snapshot with places; S holds a stray copy of "old"'s key and an invitation to it.
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
   now() - interval '40 days', null);
insert into public.trail_runs (id, trail_id, trail_snapshot, started_at, completed_at, details_ciphertext,
  details_nonce, summary_ciphertext, summary_nonce, stop_count) values
  ('10101010-0000-0000-0000-0000000000a8', 'private', null, now() - interval '40 days 2 hours',
   now() - interval '40 days', 'details', 'dn', 'summary', 'sn', 3);
update public.trail_runs set trail_snapshot = '{
  "kind": "surprise", "name": "Old town", "location": "Riga, Old Town", "description": "Five stops near home",
  "durationMinutes": 45, "stopCount": 2, "coverImage": "cover.jpg", "distanceMeters": 2600,
  "stops": [
    {"id": "osm-node-1", "name": "Cafe", "lat": 56.95, "lng": 24.11, "radiusMeters": 40, "eyebrow": "Coffee",
     "prompt": "Order for each other", "image": "cafe.jpg"},
    {"id": "osm-way-2", "name": "Park", "lat": 56.96, "lng": 24.12, "radiusMeters": 60, "eyebrow": "Green",
     "prompt": "Find a bench", "image": "park.jpg"}
  ]}'
where id in ('10101010-0000-0000-0000-0000000000a1', '10101010-0000-0000-0000-0000000000a3');
insert into public.trail_run_members (run_id, user_id)
select r.id, u.id
from public.trail_runs r,
     (values ('10101010-0000-0000-0000-00000000000a'::uuid), ('10101010-0000-0000-0000-00000000000b'::uuid)) as u (id)
where r.id::text like '10101010-%';
insert into public.stop_completions (run_id, stop_id, completed_by, completed_at) values
  ('10101010-0000-0000-0000-0000000000a1', 'osm-node-1', '10101010-0000-0000-0000-00000000000a',
   now() - interval '31 days 1 hour'),
  ('10101010-0000-0000-0000-0000000000a1', 'osm-way-2', '10101010-0000-0000-0000-00000000000b',
   now() - interval '31 days'),
  ('10101010-0000-0000-0000-0000000000a3', 'osm-node-1', '10101010-0000-0000-0000-00000000000a',
   now() - interval '29 days 1 hour'),
  ('10101010-0000-0000-0000-0000000000a8', 's2', '10101010-0000-0000-0000-00000000000b',
   now() - interval '40 days 1 hour');
insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id, created_at) values
  ('10101010-0000-0000-0000-0000000000a1', '10101010-0000-0000-0000-00000000000a', 'wA', 'eA', 'a',
   now() - interval '31 days 2 hours'),
  ('10101010-0000-0000-0000-0000000000a1', '10101010-0000-0000-0000-000000000005', 'wS', 'eS', 's',
   now() - interval '31 days 2 hours');
update public.run_keys set wrapped_by = '10101010-0000-0000-0000-00000000000a'
where run_id = '10101010-0000-0000-0000-0000000000a1';
insert into public.run_invites (run_id, user_id) values
  ('10101010-0000-0000-0000-0000000000a1', '10101010-0000-0000-0000-000000000005');

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

-- ---------------------------------------------------------------------------
-- Purging trims every expired run to its history
-- ---------------------------------------------------------------------------

select is(
  (select trail_snapshot from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a1'),
  '{"kind": "surprise", "name": "Old town", "durationMinutes": 45, "stopCount": 2, "coverImage": "cover.jpg",
    "distanceMeters": 2600, "stops": [
      {"id": "s1", "name": "Cafe", "lat": 0, "lng": 0, "radiusMeters": 40, "eyebrow": "", "prompt": "", "image": ""},
      {"id": "s2", "name": "Park", "lat": 0, "lng": 0, "radiusMeters": 60, "eyebrow": "", "prompt": "", "image": ""}
    ]}'::jsonb,
  'a plain run keeps its name and stop names, and loses places, prompts, area, and description'
);
select set_eq(
  $$ select stop_id, completed_by, completed_at from public.stop_completions
     where run_id = '10101010-0000-0000-0000-0000000000a1' $$,
  $$ values ('s1', '10101010-0000-0000-0000-00000000000a'::uuid,
             date_trunc('day', now() - interval '31 days 1 hour', 'UTC')),
            ('s2', '10101010-0000-0000-0000-00000000000b'::uuid,
             date_trunc('day', now() - interval '31 days', 'UTC')) $$,
  'its completions take the anonymous stop IDs and keep only the day'
);
select is(
  (select stop_id from public.photos where id = '10101010-0000-0000-0000-0000000000f1'),
  's1',
  'a photo row still waiting for its file takes the anonymous stop ID too'
);
select results_eq(
  $$ select started_at, completed_at, abandoned_at from public.trail_runs
     where id = '10101010-0000-0000-0000-0000000000a1' $$,
  $$ values (date_trunc('day', now() - interval '31 days 2 hours', 'UTC'),
             date_trunc('day', now() - interval '31 days', 'UTC'), null::timestamptz) $$,
  'the run keeps only the day it started and ended'
);
select results_eq(
  $$ select user_id, created_at, wrapped_by from public.run_keys
     where run_id = '10101010-0000-0000-0000-0000000000a1' $$,
  $$ values ('10101010-0000-0000-0000-00000000000a'::uuid,
             date_trunc('day', now() - interval '31 days 2 hours', 'UTC'),
             '10101010-0000-0000-0000-00000000000a'::uuid) $$,
  'a member''s copy of the key keeps only the day and its wrapper; a copy for someone who never joined goes'
);
select is(
  (select count(*)::int from public.run_invites where run_id = '10101010-0000-0000-0000-0000000000a1'),
  0,
  'the run''s invitations go'
);
select results_eq(
  $$ select trail_snapshot, details_ciphertext, details_nonce, summary_ciphertext, summary_nonce, stop_count
     from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a8' $$,
  $$ values (null::jsonb, null::text, null::text, 'summary', 'sn', 3) $$,
  'a sealed run loses its details and keeps its summary and stop count'
);
select is(
  (select completed_at from public.stop_completions where run_id = '10101010-0000-0000-0000-0000000000a8'),
  date_trunc('day', now() - interval '40 days 1 hour', 'UTC'),
  'a sealed run''s completions keep only the day'
);
select results_eq(
  $$ select completed_at, abandoned_at from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a5' $$,
  $$ values (null::timestamptz, date_trunc('day', now() - interval '31 days', 'UTC')) $$,
  'a forgotten open run counts as abandoned 30 days after it started'
);
select results_eq(
  $$ select trail_snapshot -> 'stops' -> 0 ->> 'id', trail_snapshot -> 'stops' -> 0 ->> 'lat',
            (select stop_id from public.stop_completions c where c.run_id = r.id)
     from public.trail_runs r where id = '10101010-0000-0000-0000-0000000000a3' $$,
  $$ values ('osm-node-1', '56.95', 'osm-node-1') $$,
  'a run whose photos have not expired keeps its places'
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
select results_eq(
  $$ select trail_snapshot -> 'stops' -> 1 ->> 'id',
            (select array_agg(stop_id order by stop_id) from public.stop_completions c where c.run_id = r.id)
     from public.trail_runs r where id = '10101010-0000-0000-0000-0000000000a1' $$,
  $$ values ('s2', array['s1', 's2']) $$,
  'trimming again changes nothing'
);

select pg_temp.login('10101010-0000-0000-0000-00000000000b');
select results_eq(
  $$ select summary_ciphertext, stop_count from public.trail_runs where id = '10101010-0000-0000-0000-0000000000a8' $$,
  $$ values ('summary', 3) $$,
  'the partner still reads a trimmed sealed run''s summary'
);
select pg_temp.login('10101010-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.trail_runs where id::text like '10101010-%'),
  0,
  'a stranger reads no trimmed run'
);

select * from finish();
rollback;
