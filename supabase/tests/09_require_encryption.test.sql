begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. Everyone has published a key. Run "nokey" has both A and B as
-- members but only A's copy of its key; run "legacy" holds a plain photo from before encryption.
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-00000000000a', 'a@test.local'),
  ('99999999-0000-0000-0000-00000000000b', 'b@test.local'),
  ('99999999-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('99999999-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('99999999-0000-0000-0000-0000000000cc', '99999999-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-0000000000cc', '99999999-0000-0000-0000-00000000000b');
insert into public.user_keys (user_id, public_key, key_id) values
  ('99999999-0000-0000-0000-00000000000a', 'pubA', 'a'),
  ('99999999-0000-0000-0000-00000000000b', 'pubB', 'b'),
  ('99999999-0000-0000-0000-000000000005', 'pubS', 's');

insert into public.trail_runs (id, trail_id, trail_snapshot) values
  ('99999999-0000-0000-0000-0000000000a2', 't', '{"stops": [{"id": "osm-node-1"}]}'),
  ('99999999-0000-0000-0000-0000000000a3', 't', '{"stops": [{"id": "osm-node-1"}]}');
insert into public.trail_run_members (run_id, user_id) values
  ('99999999-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-00000000000b'),
  ('99999999-0000-0000-0000-0000000000a3', '99999999-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-0000000000a3', '99999999-0000-0000-0000-00000000000b');
insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id) values
  ('99999999-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-00000000000a', 'w', 'e', 'a');
-- Written as the owner, bypassing the policies, as an old app's upload would have left it.
insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height) values
  ('99999999-0000-0000-0000-0000000000f0', '99999999-0000-0000-0000-0000000000a3', 'osm-node-1',
   '99999999-0000-0000-0000-00000000000a',
   '99999999-0000-0000-0000-0000000000a3/99999999-0000-0000-0000-0000000000f0.jpg', 10, 10);
insert into storage.objects (bucket_id, name, owner_id) values
  ('photos', '99999999-0000-0000-0000-0000000000a3/99999999-0000-0000-0000-0000000000f0.jpg',
   '99999999-0000-0000-0000-00000000000a');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values
  ('nokey', '99999999-0000-0000-0000-0000000000a2'),
  ('legacy', '99999999-0000-0000-0000-0000000000a3');

select is(
  (select allowed_mime_types from storage.buckets where id = 'photos'),
  array['application/octet-stream'],
  'the bucket takes only encrypted bytes'
);

-- ---------------------------------------------------------------------------
-- start_run refuses a plain run, for everyone
-- ---------------------------------------------------------------------------

select pg_temp.login('99999999-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}') $$,
  'P0001', 'keys_required',
  'a member''s plain start, as an old app sends it, is refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', null, '99999999-0000-0000-0000-0000000000e0') $$,
  'P0001', 'keys_required',
  'a start with an explicit null for the keys is refused'
);
select is(
  (select count(*)::int from public.trail_runs where abandoned_at is not null),
  0,
  'a refused plain start abandons no open run'
);

select pg_temp.login('99999999-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}') $$,
  'P0001', 'keys_required',
  'the partner''s plain start is refused'
);

select pg_temp.login('99999999-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}') $$,
  'P0001', 'keys_required',
  'a stranger''s plain solo start is refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "99999999-0000-0000-0000-000000000005", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "s"}
     ]', '99999999-0000-0000-0000-0000000000e4', p_partner => 'none') $$,
  'P0001', 'details_required',
  'an encrypted start with a plain snapshot is refused since the wave 2 cleanup'
);
select lives_ok(
  $$ select public.start_run('private', null, '[
       {"user_id": "99999999-0000-0000-0000-000000000005", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "s"}
     ]', '99999999-0000-0000-0000-0000000000e5', p_partner => 'none', p_details => 'd', p_details_nonce => 'n',
     p_summary => 's', p_summary_nonce => 'm', p_stop_count => 1) $$,
  'a stranger''s sealed solo start is accepted'
);

select pg_temp.login('99999999-0000-0000-0000-00000000000a');
insert into ids values ('enc', public.start_run('private', null, '[
  {"user_id": "99999999-0000-0000-0000-00000000000a", "wrapped_key": "wA", "ephemeral_public_key": "eA", "for_key_id": "a"},
  {"user_id": "99999999-0000-0000-0000-00000000000b", "wrapped_key": "wB", "ephemeral_public_key": "eB", "for_key_id": "b"}
]', '99999999-0000-0000-0000-0000000000e1', p_partner => 'invite', p_details => 'd', p_details_nonce => 'n',
  p_summary => 's', p_summary_nonce => 'm', p_stop_count => 1));
select is(
  (select id from ids where name = 'enc'),
  '99999999-0000-0000-0000-0000000000e1'::uuid,
  'a member''s encrypted start is accepted'
);
select pg_temp.login('99999999-0000-0000-0000-00000000000b');
select is(public.accept_run('99999999-0000-0000-0000-0000000000e1'), 'joined', 'the partner joins the encrypted run');

-- The start and the join abandoned the fixture runs; reopen them, so the photo tests below fail for the key alone.
reset role;
update public.trail_runs set abandoned_at = null
where id in (select id from ids where name in ('nokey', 'legacy'));
select pg_temp.login('99999999-0000-0000-0000-00000000000a');

-- ---------------------------------------------------------------------------
-- Photo rows: a nonce, a .bin path, and the uploader's own run key
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
            values ('99999999-0000-0000-0000-0000000000f1', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f1.jpg', 10, 10) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a member''s plain .jpg row is refused'
);
select lives_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('99999999-0000-0000-0000-0000000000f2', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f2.bin', 10, 10, 'nonce') $$,
         (select id from ids where name = 'enc')),
  'a member''s .bin row with a nonce is accepted'
);

select pg_temp.login('99999999-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
            values ('99999999-0000-0000-0000-0000000000f3', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f3.jpg', 10, 10) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'the partner''s plain .jpg row is refused'
);
select lives_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('99999999-0000-0000-0000-0000000000f4', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f4.bin', 10, 10, 'nonce') $$,
         (select id from ids where name = 'enc')),
  'the partner''s .bin row with a nonce is accepted'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('99999999-0000-0000-0000-0000000000f5', '%1$s', 'osm-node-1',
                    '%1$s/99999999-0000-0000-0000-0000000000f5.bin', 10, 10, 'nonce') $$,
         (select id from ids where name = 'nokey')),
  '42501', null,
  'a member without their own copy of the run key cannot add a photo row'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('99999999-0000-0000-0000-0000000000f6', '%1$s', 'osm-node-1',
                    '%1$s/99999999-0000-0000-0000-0000000000f6.bin', 10, 10, 'nonce') $$,
         (select id from ids where name = 'legacy')),
  '42501', null,
  'a run started before encryption takes no new photos'
);
select is(
  (select storage_path from public.photos where id = '99999999-0000-0000-0000-0000000000f0'),
  '99999999-0000-0000-0000-0000000000a3/99999999-0000-0000-0000-0000000000f0.jpg',
  'the partner still reads a plain photo stored before encryption'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos'
     and name = '99999999-0000-0000-0000-0000000000a3/99999999-0000-0000-0000-0000000000f0.jpg'),
  1,
  'the partner still reads the plain object stored before encryption'
);

select pg_temp.login('99999999-0000-0000-0000-000000000005');
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('99999999-0000-0000-0000-0000000000f7', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f7.bin', 10, 10, 'nonce') $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger''s .bin row in someone else''s run is refused'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
            values ('99999999-0000-0000-0000-0000000000f8', '%1$s', 's1',
                    '%1$s/99999999-0000-0000-0000-0000000000f8.jpg', 10, 10) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger''s .jpg row in someone else''s run is refused'
);
select is(
  (select count(*)::int from public.photos where id = '99999999-0000-0000-0000-0000000000f0'),
  0,
  'a stranger cannot read the plain photo'
);

-- ---------------------------------------------------------------------------
-- Storage: .bin only
-- ---------------------------------------------------------------------------

select pg_temp.login('99999999-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000f9.jpg', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a member''s .jpg upload is refused'
);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000f2.bin', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  'a member''s .bin upload is accepted'
);

select pg_temp.login('99999999-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000fa.jpg', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'the partner''s .jpg upload is refused'
);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000f4.bin', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  'the partner''s .bin upload is accepted'
);

select pg_temp.login('99999999-0000-0000-0000-000000000005');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000fb.jpg', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger''s .jpg upload is refused'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/99999999-0000-0000-0000-0000000000fc.bin', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger''s .bin upload into someone else''s run is refused'
);

select * from finish();
rollback;
