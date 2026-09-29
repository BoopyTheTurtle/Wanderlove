begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger.
insert into auth.users (id, email) values
  ('88888888-0000-0000-0000-00000000000a', 'a@test.local'),
  ('88888888-0000-0000-0000-00000000000b', 'b@test.local'),
  ('88888888-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('88888888-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('88888888-0000-0000-0000-0000000000cc', '88888888-0000-0000-0000-00000000000a'),
  ('88888888-0000-0000-0000-0000000000cc', '88888888-0000-0000-0000-00000000000b');

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

select ok(
  not has_table_privilege('anon', 'public.user_keys', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.run_keys', 'select,insert,update,delete,truncate'),
  'anon has no access to the key tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_keys', 'delete,truncate')
  and not has_table_privilege('authenticated', 'public.run_keys', 'delete,truncate'),
  'signed-in users cannot delete or truncate key rows'
);
select ok(
  not has_function_privilege('anon', 'public.start_run(text, jsonb, jsonb, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.share_run_keys(jsonb)', 'execute'),
  'anon cannot call the key RPCs'
);

-- ---------------------------------------------------------------------------
-- user_keys
-- ---------------------------------------------------------------------------

select pg_temp.login('88888888-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.user_keys (public_key, key_id, recovery_blob, recovery_salt, recovery_iv)
     values ('pubA1', 'a1', 'blobA', 'saltA', 'ivA') $$,
  'a user publishes their own key pair'
);
select is((select key_id from public.user_keys where user_id = auth.uid()), 'a1', 'the owner reads their own key row');
select is(
  pg_temp.affected($$ update public.user_keys set public_key = 'pubA', key_id = 'a' where user_id = auth.uid() $$),
  1,
  'the owner replaces their key pair'
);
select throws_ok(
  $$ update public.user_keys set recovery_blob = null where user_id = auth.uid() $$,
  '23514', null,
  'the recovery fields are stored all together or not at all'
);
select throws_ok(
  $$ insert into public.user_keys (user_id, public_key, key_id)
     values ('88888888-0000-0000-0000-00000000000b', 'forged', 'x') $$,
  '42501', null,
  'a user cannot publish a key for someone else'
);

select pg_temp.login('88888888-0000-0000-0000-00000000000b');
insert into public.user_keys (public_key, key_id, recovery_blob, recovery_salt, recovery_iv)
values ('pubB', 'b1', 'blobB', 'saltB', 'ivB');
select is(
  (select count(*)::int from public.user_keys where user_id = '88888888-0000-0000-0000-00000000000a'),
  0,
  'the partner cannot read the recovery row'
);
select is(
  pg_temp.affected($$ update public.user_keys set public_key = 'hijack'
                      where user_id = '88888888-0000-0000-0000-00000000000a' $$),
  0,
  'the partner cannot replace someone else''s key'
);

select pg_temp.login('88888888-0000-0000-0000-000000000005');
insert into public.user_keys (public_key, key_id) values ('pubS', 's1');
select is(
  (select count(*)::int from public.user_keys where user_id <> auth.uid()),
  0,
  'a stranger reads no one else''s key row'
);

-- ---------------------------------------------------------------------------
-- profile_cards: public keys for self and partner, nothing for strangers
-- ---------------------------------------------------------------------------

select pg_temp.login('88888888-0000-0000-0000-00000000000a');
select is(
  (select public_key || '/' || key_id from public.profile_cards where id = '88888888-0000-0000-0000-00000000000b'),
  'pubB/b1',
  'profile_cards shows the partner''s public key'
);
select is(
  (select count(*)::int from public.profile_cards where id = '88888888-0000-0000-0000-000000000005'),
  0,
  'profile_cards shows no card for a stranger'
);

select pg_temp.login('88888888-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.profile_cards where id <> auth.uid()),
  0,
  'a stranger sees no one''s public key'
);

-- ---------------------------------------------------------------------------
-- start_run with keys
-- ---------------------------------------------------------------------------

select pg_temp.login('88888888-0000-0000-0000-00000000000a');
insert into ids values ('plain', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}'));
select isnt((select id from ids where name = 'plain'), null, 'start_run without keys still starts a plain run');
select is(
  (select count(*)::int from public.run_keys where run_id = (select id from ids where name = 'plain')),
  0,
  'a plain run has no wrapped keys'
);

select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"}
     ]', '88888888-0000-0000-0000-0000000000e9') $$,
  'P0001', 'keys_mismatch',
  'keys missing the partner are refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "88888888-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b1"},
       {"user_id": "88888888-0000-0000-0000-000000000005", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "s1"}
     ]', '88888888-0000-0000-0000-0000000000e9') $$,
  'P0001', 'keys_mismatch',
  'keys for someone outside the couple are refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "88888888-0000-0000-0000-000000000005", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "s1"}
     ]', '88888888-0000-0000-0000-0000000000e9') $$,
  'P0001', 'keys_mismatch',
  'a stranger in the partner''s place is refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "88888888-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "stale"}
     ]', '88888888-0000-0000-0000-0000000000e9') $$,
  'P0001', 'keys_mismatch',
  'a wrap for the partner''s old key is refused'
);
select is(
  (select abandoned_at from public.trail_runs where id = (select id from ids where name = 'plain')),
  null,
  'a refused start leaves the open run alone'
);

insert into ids values ('enc', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
  {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "wA", "ephemeral_public_key": "eA", "for_key_id": "a"},
  {"user_id": "88888888-0000-0000-0000-00000000000b", "wrapped_key": "wB", "ephemeral_public_key": "eB", "for_key_id": "b1"}
]', '88888888-0000-0000-0000-0000000000e1'));
select is(
  (select id from ids where name = 'enc'),
  '88888888-0000-0000-0000-0000000000e1'::uuid,
  'an encrypted run takes the ID the phone chose'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "88888888-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b1"}
     ]', '88888888-0000-0000-0000-0000000000e1') $$,
  '23505', null,
  'a reused run ID is refused'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
       {"user_id": "88888888-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b1"}
     ]') $$,
  'P0001', 'run_id_required',
  'keys without a run ID are refused'
);
select is(
  (select wrapped_key from public.run_keys where run_id = (select id from ids where name = 'enc')),
  'wA',
  'start_run with keys for both members stores the caller''s wrap, and the caller reads only that one'
);

-- ---------------------------------------------------------------------------
-- run_keys
-- ---------------------------------------------------------------------------

select pg_temp.login('88888888-0000-0000-0000-00000000000b');
select is(
  (select wrapped_key || '/' || for_key_id || '/' || wrapped_by::text from public.run_keys
   where run_id = (select id from ids where name = 'enc')),
  'wB/b1/88888888-0000-0000-0000-00000000000a',
  'the partner reads only their own wrap, made by the starter'
);

-- B's new phone replaces the key pair (option C); A's phone re-shares the run key for it.
update public.user_keys set public_key = 'pubB2', key_id = 'b2' where user_id = auth.uid();

select pg_temp.login('88888888-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.share_run_keys('[{"run_id": "%s", "user_id": "88888888-0000-0000-0000-00000000000b",
            "wrapped_key": "wB2", "ephemeral_public_key": "eB2", "for_key_id": "b1"}]') $$,
         (select id from ids where name = 'enc')),
  'P0001', 'keys_mismatch',
  'a re-share for the partner''s old key is refused'
);
select lives_ok(
  format($$ select public.share_run_keys('[{"run_id": "%s", "user_id": "88888888-0000-0000-0000-00000000000b",
            "wrapped_key": "wB2", "ephemeral_public_key": "eB2", "for_key_id": "b2"}]') $$,
         (select id from ids where name = 'enc')),
  'a run member re-shares the run key for the partner''s new key'
);
select is(
  pg_temp.affected(format($$ update public.run_keys set wrapped_key = 'wA2' where run_id = '%s' $$,
                          (select id from ids where name = 'enc'))),
  1,
  'a member updates their own wrap directly'
);
select throws_ok(
  format($$ insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
            values ('%s', '88888888-0000-0000-0000-000000000005', 'w', 'e', 's1') $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a member cannot wrap the run key for a non-member'
);
select throws_ok(
  format($$ delete from public.run_keys where run_id = '%s' $$, (select id from ids where name = 'enc')),
  '42501', null,
  'nobody deletes a wrap directly'
);

select pg_temp.login('88888888-0000-0000-0000-00000000000b');
select is(
  (select wrapped_key || '/' || for_key_id || '/' || wrapped_by::text from public.run_keys
   where run_id = (select id from ids where name = 'enc')),
  'wB2/b2/88888888-0000-0000-0000-00000000000a',
  'the partner reads the re-shared wrap'
);

select pg_temp.login('88888888-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.run_keys where run_id = (select id from ids where name = 'enc')),
  0,
  'a stranger reads no wraps'
);
select throws_ok(
  format($$ insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
            values ('%s', '88888888-0000-0000-0000-000000000005', 'w', 'e', 's1') $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger cannot insert a wrap into someone else''s run'
);
select is(
  pg_temp.affected(format($$ update public.run_keys set wrapped_key = 'evil' where run_id = '%s' $$,
                          (select id from ids where name = 'enc'))),
  0,
  'a stranger cannot update a wrap'
);
select throws_ok(
  format($$ select public.share_run_keys('[{"run_id": "%s", "user_id": "88888888-0000-0000-0000-00000000000b",
            "wrapped_key": "evil", "ephemeral_public_key": "e", "for_key_id": "b2"}]') $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger cannot re-share into someone else''s run'
);
select lives_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
       {"user_id": "88888888-0000-0000-0000-000000000005", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "s1"}
     ]', '88888888-0000-0000-0000-0000000000e9') $$,
  'a solo run takes a single wrap for the caller'
);

-- ---------------------------------------------------------------------------
-- Encrypted photos
-- ---------------------------------------------------------------------------

reset role;
select is(
  (select allowed_mime_types from storage.buckets where id = 'photos'),
  array['image/jpeg', 'application/octet-stream'],
  'the bucket takes JPEG and encrypted bytes'
);
select is(
  private.run_id_from_path('88888888-0000-0000-0000-0000000000aa/88888888-0000-0000-0000-0000000000f1.bin'),
  '88888888-0000-0000-0000-0000000000aa'::uuid,
  'run_id_from_path reads .bin names'
);

select pg_temp.login('88888888-0000-0000-0000-00000000000a');
select lives_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('88888888-0000-0000-0000-0000000000f1', '%1$s', 'osm-node-1',
                    '%1$s/88888888-0000-0000-0000-0000000000f1.bin', 800, 600, 'nonce') $$,
         (select id from ids where name = 'enc')),
  'a member adds an encrypted photo row with its nonce'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('88888888-0000-0000-0000-0000000000f2', '%1$s', 'osm-node-1',
                    '%1$s/88888888-0000-0000-0000-0000000000f2.jpg', 800, 600, 'nonce') $$,
         (select id from ids where name = 'enc')),
  '23514', null,
  'a row with a nonce must point at a .bin file'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height)
            values ('88888888-0000-0000-0000-0000000000f3', '%1$s', 'osm-node-1',
                    '%1$s/88888888-0000-0000-0000-0000000000f3.bin', 800, 600) $$,
         (select id from ids where name = 'enc')),
  '23514', null,
  'a row without a nonce must point at a .jpg file'
);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/88888888-0000-0000-0000-0000000000f1.bin', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  'a member uploads a .bin object into their run folder'
);

select pg_temp.login('88888888-0000-0000-0000-00000000000b');
select is(
  (select nonce from public.photos where id = '88888888-0000-0000-0000-0000000000f1'),
  'nonce',
  'the partner reads the nonce'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos' and name like '%.bin'
     and name like (select id from ids where name = 'enc')::text || '/%'),
  1,
  'the partner can read the .bin object'
);

select pg_temp.login('88888888-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.photos where id = '88888888-0000-0000-0000-0000000000f1'),
  0,
  'a stranger cannot read the encrypted photo row'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'photos'
     and name like (select id from ids where name = 'enc')::text || '/%'),
  0,
  'a stranger cannot read the .bin object'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('photos', '%s/88888888-0000-0000-0000-0000000000f4.bin', auth.uid()::text) $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger cannot upload a .bin object into someone else''s run'
);
select throws_ok(
  format($$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
            values ('88888888-0000-0000-0000-0000000000f4', '%1$s', 'osm-node-1',
                    '%1$s/88888888-0000-0000-0000-0000000000f4.bin', 800, 600, 'nonce') $$,
         (select id from ids where name = 'enc')),
  '42501', null,
  'a stranger cannot add an encrypted photo row to someone else''s run'
);

select * from finish();
rollback;
