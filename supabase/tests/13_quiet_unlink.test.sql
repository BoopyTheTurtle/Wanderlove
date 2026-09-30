begin;
select * from no_plan();

-- Fixtures: A and B are a couple and finished a shared run an hour ago; A finished a solo run an hour ago too.
-- S is a stranger.
insert into auth.users (id, email) values
  ('13131313-0000-0000-0000-00000000000a', 'a@test.local'),
  ('13131313-0000-0000-0000-00000000000b', 'b@test.local'),
  ('13131313-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('13131313-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('13131313-0000-0000-0000-0000000000cc', '13131313-0000-0000-0000-00000000000a'),
  ('13131313-0000-0000-0000-0000000000cc', '13131313-0000-0000-0000-00000000000b');
insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, completed_at) values
  ('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000cc', 't',
   '{"stops": [{"id": "osm-node-1"}]}', now() - interval '1 hour'),
  ('13131313-0000-0000-0000-0000000000a2', null, 't', '{"stops": [{"id": "osm-node-1"}]}', now() - interval '1 hour');
insert into public.trail_run_members (run_id, user_id) values
  ('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-00000000000a'),
  ('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-00000000000b'),
  ('13131313-0000-0000-0000-0000000000a2', '13131313-0000-0000-0000-00000000000a');
insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
select run_id, user_id, 'w', 'e', 'k' from public.trail_run_members where run_id::text like '13131313-%';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.photo(p_run text, p_photo text) returns text language sql as $$
  select format(
    $q$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
        values ('%2$s', '%1$s', 'osm-node-1', '%1$s/%2$s.bin', 10, 10, 'nonce') $q$,
    p_run, p_photo)
$$;
create function pg_temp.upload(p_run text, p_photo text) returns text language sql as $$
  select format(
    $q$ insert into storage.objects (bucket_id, name, owner_id) values ('photos', '%s/%s.bin', auth.uid()::text) $q$,
    p_run, p_photo)
$$;

-- Before the unlink, the grace window is open for both.
select pg_temp.login('13131313-0000-0000-0000-00000000000b');
select lives_ok(
  pg_temp.photo('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000f1'),
  'the partner adds a photo to the shared run within the grace window'
);
select is((select count(*)::int from public.couples where ended_at is null), 1, 'the partner sees the couple');
select throws_ok($$ select ended_by from public.couples $$, '42501', null, 'the partner cannot read ended_by');

select pg_temp.login('13131313-0000-0000-0000-00000000000a');
select lives_ok($$ select public.unlink() $$, 'A unlinks with today''s call');

-- ---------------------------------------------------------------------------
-- The past freezes: no photos on the couple's runs, from either side
-- ---------------------------------------------------------------------------

select throws_ok(
  pg_temp.photo('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000f2'),
  '42501', null,
  'the one who unlinked adds no photo to a shared run finished an hour ago'
);
select throws_ok(
  pg_temp.upload('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000f2'),
  '42501', null,
  'nor uploads one'
);
select lives_ok(
  pg_temp.photo('13131313-0000-0000-0000-0000000000a2', '13131313-0000-0000-0000-0000000000f3'),
  'a solo run keeps its grace window'
);

select pg_temp.login('13131313-0000-0000-0000-00000000000b');
select throws_ok(
  pg_temp.photo('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000f4'),
  '42501', null,
  'the ex adds no photo to the shared run'
);
select throws_ok(
  pg_temp.upload('13131313-0000-0000-0000-0000000000a1', '13131313-0000-0000-0000-0000000000f4'),
  '42501', null,
  'nor uploads one'
);
select is((select count(*)::int from public.photos), 1, 'the ex keeps the photo taken before the unlink');

-- ---------------------------------------------------------------------------
-- Nobody learns who ended the link
-- ---------------------------------------------------------------------------

select isnt((select ended_at from public.couples), null, 'the ex reads that the couple ended');
select throws_ok($$ select ended_by from public.couples $$, '42501', null, 'the ex cannot read who ended it');
select throws_ok($$ select * from public.couples $$, '42501', null, 'nor read every column at once');
select is(
  (select count(*)::int from public.couples c where c.id in (select couple_id from public.couple_members)),
  1,
  'the ex still reads the couple through its members, as today''s app does'
);

select pg_temp.login('13131313-0000-0000-0000-00000000000a');
select throws_ok($$ select ended_by from public.couples $$, '42501', null, 'the one who unlinked cannot read it either');

select pg_temp.login('13131313-0000-0000-0000-000000000005');
select is((select count(*)::int from public.couples), 0, 'a stranger sees no couple');

reset role;
select is(
  (select ended_by from public.couples where id = '13131313-0000-0000-0000-0000000000cc'),
  null,
  'unlink records nobody in ended_by'
);
select is((select count(*)::int from public.couples where ended_by is not null), 0, 'no couple names who ended it');

select * from finish();
rollback;
