begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. Everyone has published a key.
insert into auth.users (id, email) values
  ('11011011-0000-0000-0000-00000000000a', 'a@test.local'),
  ('11011011-0000-0000-0000-00000000000b', 'b@test.local'),
  ('11011011-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('11011011-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('11011011-0000-0000-0000-0000000000cc', '11011011-0000-0000-0000-00000000000a'),
  ('11011011-0000-0000-0000-0000000000cc', '11011011-0000-0000-0000-00000000000b');
insert into public.user_keys (user_id, public_key, key_id) values
  ('11011011-0000-0000-0000-00000000000a', 'pubA', 'a'),
  ('11011011-0000-0000-0000-00000000000b', 'pubB', 'b'),
  ('11011011-0000-0000-0000-000000000005', 'pubS', 's');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Wraps for A alone, B alone, S alone, and the couple.
create function pg_temp.keys_a() returns jsonb language sql as $$
  select '[{"user_id": "11011011-0000-0000-0000-00000000000a", "wrapped_key": "wA", "ephemeral_public_key": "eA",
            "for_key_id": "a"}]'::jsonb
$$;
create function pg_temp.keys_b() returns jsonb language sql as $$
  select '[{"user_id": "11011011-0000-0000-0000-00000000000b", "wrapped_key": "wB", "ephemeral_public_key": "eB",
            "for_key_id": "b"}]'::jsonb
$$;
create function pg_temp.keys_s() returns jsonb language sql as $$
  select '[{"user_id": "11011011-0000-0000-0000-000000000005", "wrapped_key": "wS", "ephemeral_public_key": "eS",
            "for_key_id": "s"}]'::jsonb
$$;
create function pg_temp.keys_ab() returns jsonb language sql as $$
  select pg_temp.keys_a() || pg_temp.keys_b()
$$;

create function pg_temp.open_runs(p_user uuid) returns bigint language sql security definer as $$
  select count(*) from public.trail_runs r join public.trail_run_members m on m.run_id = r.id
  where m.user_id = p_user and r.completed_at is null and r.abandoned_at is null
$$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Today's call shapes still work
-- ---------------------------------------------------------------------------

select pg_temp.login('11011011-0000-0000-0000-00000000000a');
insert into ids values ('plain', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_ab(),
  '11011011-0000-0000-0000-0000000000e1'));
select is(
  (select count(*)::int from public.trail_run_members where run_id = (select id from ids where name = 'plain')),
  2,
  'today''s four-argument start still enrols the partner'
);
select throws_ok(
  $$ select public.start_run(p_trail_id => 't', p_snapshot => '{"stops": [{"id": "osm-node-1"}]}') $$,
  'P0001', 'keys_required',
  'today''s call without keys is still refused with keys_required'
);
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) select id, 'osm-node-1' from ids where name = 'plain' $$,
  'a plain run still takes its OSM stop IDs'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) select id, 's1' from ids where name = 'plain' $$,
  '42501', null,
  'a plain run refuses anonymous stop IDs'
);

-- ---------------------------------------------------------------------------
-- Sealed trails
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.start_run('private', null, pg_temp.keys_ab(), gen_random_uuid()) $$,
  'P0001', 'details_mismatch',
  'a run without a snapshot needs the sealed details'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_ab(), gen_random_uuid(),
       p_details => 'd', p_details_nonce => 'n', p_summary => 's', p_summary_nonce => 'm', p_stop_count => 3) $$,
  'P0001', 'details_mismatch',
  'a run cannot have both a plain snapshot and sealed details'
);
select throws_ok(
  $$ select public.start_run('sherlock-holmes-spikeri', null, pg_temp.keys_ab(), gen_random_uuid(),
       p_details => 'd', p_details_nonce => 'n', p_summary => 's', p_summary_nonce => 'm', p_stop_count => 3) $$,
  'P0001', 'details_mismatch',
  'a sealed run cannot name its trail'
);
select throws_ok(
  $$ select public.start_run('t', '{"stops": []}', pg_temp.keys_ab(), gen_random_uuid(), p_partner => 'everyone') $$,
  'P0001', 'partner_mode_invalid',
  'an unknown partner mode is refused'
);

insert into ids values ('sealed', public.start_run('private', null, pg_temp.keys_ab(),
  '11011011-0000-0000-0000-0000000000e2', p_details => 'details', p_details_nonce => 'dn', p_summary => 'summary',
  p_summary_nonce => 'sn', p_stop_count => 3));
select results_eq(
  $$ select trail_snapshot, details_ciphertext, summary_ciphertext, stop_count from public.trail_runs
     where id = '11011011-0000-0000-0000-0000000000e2' $$,
  $$ values (null::jsonb, 'details', 'summary', 3) $$,
  'a sealed run stores the ciphertexts and the stop count, and no snapshot'
);
select is(pg_temp.open_runs('11011011-0000-0000-0000-00000000000a'), 1::bigint, 'the sealed start abandoned the plain run');

-- The start abandoned the plain run; the sealed run is open for stops.
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 's1') $$,
  'a member completes s1 on a sealed run'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 's4') $$,
  '42501', null,
  'a sealed run of three stops refuses s4'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 's0') $$,
  '42501', null,
  'a sealed run refuses s0'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 'osm-node-1') $$,
  '42501', null,
  'a sealed run refuses OSM stop IDs'
);
select lives_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
     values ('11011011-0000-0000-0000-0000000000f1', '11011011-0000-0000-0000-0000000000e2', 's2',
             '11011011-0000-0000-0000-0000000000e2/11011011-0000-0000-0000-0000000000f1.bin', 10, 10, 'nonce') $$,
  'a member adds a photo at s2 of a sealed run'
);

select pg_temp.login('11011011-0000-0000-0000-00000000000b');
select is(
  (select summary_ciphertext from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e2'),
  'summary',
  'the partner reads the sealed summary'
);
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 's3') $$,
  'the partner completes s3 on a sealed run'
);

select pg_temp.login('11011011-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e2'),
  0,
  'a stranger cannot read a sealed run'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e2', 's2') $$,
  '42501', null,
  'a stranger cannot complete a stop on a sealed run'
);
select lives_ok(
  $$ select public.start_run('private', null, pg_temp.keys_s(), gen_random_uuid(),
       p_details => 'd', p_details_nonce => 'n', p_summary => 's', p_summary_nonce => 'm', p_stop_count => 5) $$,
  'a stranger starts a sealed solo run'
);

-- ---------------------------------------------------------------------------
-- Just me
-- ---------------------------------------------------------------------------

-- B starts a shared run and A walks it; then A starts a Just me run.
select pg_temp.login('11011011-0000-0000-0000-00000000000b');
insert into ids values ('shared', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_ab(),
  '11011011-0000-0000-0000-0000000000e3'));

select pg_temp.login('11011011-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_ab(), gen_random_uuid(),
       p_partner => 'none') $$,
  'P0001', 'keys_mismatch',
  'a Just me run takes one wrap, not the partner''s too'
);
insert into ids values ('justme', public.start_run('private', null, pg_temp.keys_a(),
  '11011011-0000-0000-0000-0000000000e4', p_partner => 'none', p_details => 'd', p_details_nonce => 'n',
  p_summary => 's', p_summary_nonce => 'm', p_stop_count => 5));
select results_eq(
  $$ select couple_id, (select array_agg(user_id) from public.trail_run_members m where m.run_id = r.id)
     from public.trail_runs r where id = '11011011-0000-0000-0000-0000000000e4' $$,
  $$ values (null::uuid, array['11011011-0000-0000-0000-00000000000a'::uuid]) $$,
  'a Just me run belongs to no couple and has the caller as its only member'
);
select isnt(
  (select abandoned_at from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e3'),
  null,
  'Just me abandons the shared run the caller was walking'
);
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e4', 's5') $$,
  'the walker completes a stop on their Just me run'
);

select pg_temp.login('11011011-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e4'),
  0,
  'the partner cannot see the Just me run'
);
select is(
  (select count(*)::int from public.trail_run_members where run_id = '11011011-0000-0000-0000-0000000000e4')
  + (select count(*)::int from public.stop_completions where run_id = '11011011-0000-0000-0000-0000000000e4')
  + (select count(*)::int from public.run_keys where run_id = '11011011-0000-0000-0000-0000000000e4')
  + (select count(*)::int from public.run_invites where run_id = '11011011-0000-0000-0000-0000000000e4'),
  0,
  'the partner sees no member, stop, key, or invitation of the Just me run'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('11011011-0000-0000-0000-0000000000e4', 's1') $$,
  '42501', null,
  'the partner cannot complete a stop on the Just me run'
);

-- B's own Just me run survives A's next Just me start.
insert into ids values ('b_justme', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_b(),
  '11011011-0000-0000-0000-0000000000e5', p_partner => 'none'));
select pg_temp.login('11011011-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', pg_temp.keys_a(),
       '11011011-0000-0000-0000-0000000000e6', p_partner => 'none') $$,
  'A starts another Just me run'
);
select is(pg_temp.open_runs('11011011-0000-0000-0000-00000000000b'), 1::bigint,
  'a Just me start leaves the partner''s open run alone');
select is(
  (select count(*)::int from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e4' and abandoned_at is not null),
  1,
  'a Just me start abandons the caller''s previous run'
);

select lives_ok($$ select public.unlink() $$, 'A unlinks');
select is(
  (select abandoned_at from public.trail_runs where id = '11011011-0000-0000-0000-0000000000e6'),
  null,
  'unlinking leaves the Just me run open'
);
select is((select count(*)::int from public.profile_cards where id = '11011011-0000-0000-0000-00000000000b'), 1,
  'the ex still sees the partner''s card through the older shared run');

select * from finish();
rollback;
