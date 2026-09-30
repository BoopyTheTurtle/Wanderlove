begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. Everyone has published a key.
insert into auth.users (id, email) values
  ('12121212-0000-0000-0000-00000000000a', 'a@test.local'),
  ('12121212-0000-0000-0000-00000000000b', 'b@test.local'),
  ('12121212-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('12121212-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('12121212-0000-0000-0000-0000000000cc', '12121212-0000-0000-0000-00000000000a'),
  ('12121212-0000-0000-0000-0000000000cc', '12121212-0000-0000-0000-00000000000b');
insert into public.user_keys (user_id, public_key, key_id) values
  ('12121212-0000-0000-0000-00000000000a', 'pubA', 'a'),
  ('12121212-0000-0000-0000-00000000000b', 'pubB', 'b'),
  ('12121212-0000-0000-0000-000000000005', 'pubS', 's');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.keys_a() returns jsonb language sql as $$
  select '[{"user_id": "12121212-0000-0000-0000-00000000000a", "wrapped_key": "wA", "ephemeral_public_key": "eA",
            "for_key_id": "a"}]'::jsonb
$$;
create function pg_temp.keys_b() returns jsonb language sql as $$
  select '[{"user_id": "12121212-0000-0000-0000-00000000000b", "wrapped_key": "wB", "ephemeral_public_key": "eB",
            "for_key_id": "b"}]'::jsonb
$$;
create function pg_temp.keys_ab() returns jsonb language sql as $$
  select pg_temp.keys_a() || pg_temp.keys_b()
$$;

-- Starts a sealed run of three stops as the current user.
create function pg_temp.start(p_id uuid, p_partner text, p_keys jsonb) returns uuid language sql as $$
  select public.start_run('private', null, p_keys, p_id, p_partner => p_partner, p_details => 'd',
    p_details_nonce => 'n', p_summary => 's', p_summary_nonce => 'm', p_stop_count => 3)
$$;

create function pg_temp.is_open(p_run uuid) returns boolean language sql security definer as $$
  select completed_at is null and abandoned_at is null from public.trail_runs where id = p_run
$$;

-- B walks a Just me run before A's invitation arrives.
select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select pg_temp.start('12121212-0000-0000-0000-0000000000e0', 'none', pg_temp.keys_b());

-- ---------------------------------------------------------------------------
-- An invitation, as the starter, the invitee, and a stranger see it
-- ---------------------------------------------------------------------------

select pg_temp.login('12121212-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.start(gen_random_uuid(), 'invite', pg_temp.keys_a()) $$,
  'P0001', 'keys_mismatch',
  'an invite start needs the partner''s wrap too'
);
select is(
  pg_temp.start('12121212-0000-0000-0000-0000000000e1', 'invite', pg_temp.keys_ab()),
  '12121212-0000-0000-0000-0000000000e1'::uuid,
  'A starts a run that invites B'
);
select is(
  (select array_agg(user_id) from public.trail_run_members where run_id = '12121212-0000-0000-0000-0000000000e1'),
  array['12121212-0000-0000-0000-00000000000a'::uuid],
  'the starter is the only member until the partner joins'
);
select is(pg_temp.is_open('12121212-0000-0000-0000-0000000000e0'), true,
  'an invite start leaves the partner''s open run alone');
select is(
  (select count(*)::int from public.run_invites),
  0,
  'the starter cannot see the invitation, so a pending and a declined one look alike'
);

select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select is(
  (select array_agg(run_id) from public.run_invites),
  array['12121212-0000-0000-0000-0000000000e1'::uuid],
  'the invitee sees the invitation'
);
select is(
  (select count(*)::int from public.run_keys where run_id = '12121212-0000-0000-0000-0000000000e1'),
  1,
  'the invitee already holds their copy of the key'
);
select is(
  (select count(*)::int from public.trail_runs where id = '12121212-0000-0000-0000-0000000000e1'),
  0,
  'the invitee cannot read the run before joining'
);
select throws_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('12121212-0000-0000-0000-0000000000e1', 's1') $$,
  '42501', null,
  'the invitee cannot complete a stop before joining'
);
select throws_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
     values ('12121212-0000-0000-0000-0000000000f1', '12121212-0000-0000-0000-0000000000e1', 's1',
             '12121212-0000-0000-0000-0000000000e1/12121212-0000-0000-0000-0000000000f1.bin', 10, 10, 'nonce') $$,
  '42501', null,
  'the invitee cannot add a photo before joining'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', '12121212-0000-0000-0000-0000000000e1/12121212-0000-0000-0000-0000000000f1.bin', auth.uid()::text) $$,
  '42501', null,
  'the invitee cannot upload before joining'
);

select pg_temp.login('12121212-0000-0000-0000-000000000005');
select is((select count(*)::int from public.run_invites), 0, 'a stranger sees no invitation');
select is(public.accept_run('12121212-0000-0000-0000-0000000000e1'), 'gone', 'a stranger cannot join');
select is(
  (select count(*)::int from public.trail_run_members where run_id = '12121212-0000-0000-0000-0000000000e1'),
  0,
  'a stranger sees no member of the run'
);

-- ---------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------

select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select is(public.accept_run('12121212-0000-0000-0000-0000000000e1'), 'joined', 'the invitee joins');
select is(
  (select count(*)::int from public.trail_run_members where run_id = '12121212-0000-0000-0000-0000000000e1'),
  2,
  'the run now has both members'
);
select is((select count(*)::int from public.run_invites), 0, 'the invitation is gone once accepted');
select is(pg_temp.is_open('12121212-0000-0000-0000-0000000000e0'), false,
  'joining abandons the invitee''s other open run');
select lives_ok(
  $$ insert into public.stop_completions (run_id, stop_id) values ('12121212-0000-0000-0000-0000000000e1', 's1') $$,
  'a joined partner completes a stop'
);
select lives_ok(
  $$ insert into public.photos (id, run_id, stop_id, storage_path, width, height, nonce)
     values ('12121212-0000-0000-0000-0000000000f2', '12121212-0000-0000-0000-0000000000e1', 's1',
             '12121212-0000-0000-0000-0000000000e1/12121212-0000-0000-0000-0000000000f2.bin', 10, 10, 'nonce') $$,
  'a joined partner adds a photo'
);
select is(public.accept_run('12121212-0000-0000-0000-0000000000e1'), 'gone', 'accepting twice changes nothing');

-- ---------------------------------------------------------------------------
-- Declining, and invitations that lapse
-- ---------------------------------------------------------------------------

select pg_temp.login('12121212-0000-0000-0000-00000000000a');
select pg_temp.start('12121212-0000-0000-0000-0000000000e2', 'invite', pg_temp.keys_ab());
select is(pg_temp.is_open('12121212-0000-0000-0000-0000000000e1'), false,
  'a new start abandons the starter''s previous run');

select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select lives_ok($$ select public.decline_run('12121212-0000-0000-0000-0000000000e2') $$, 'the invitee declines');
select is(
  (select count(*)::int from public.run_invites) + (select count(*)::int from public.run_keys
     where run_id = '12121212-0000-0000-0000-0000000000e2'),
  0,
  'declining drops the invitation and the invitee''s copy of the key'
);
select is(public.accept_run('12121212-0000-0000-0000-0000000000e2'), 'gone', 'a declined invitation cannot be accepted');
select lives_ok($$ select public.decline_run('12121212-0000-0000-0000-0000000000e2') $$, 'declining twice is harmless');

select pg_temp.login('12121212-0000-0000-0000-00000000000a');
select pg_temp.start('12121212-0000-0000-0000-0000000000e3', 'invite', pg_temp.keys_ab());
update public.trail_runs set completed_at = now() where id = '12121212-0000-0000-0000-0000000000e3';

select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.run_invites), 0, 'an invitation to an ended run no longer shows');
select is(public.accept_run('12121212-0000-0000-0000-0000000000e3'), 'gone', 'nobody joins an ended run');

select pg_temp.login('12121212-0000-0000-0000-00000000000a');
select pg_temp.start('12121212-0000-0000-0000-0000000000e4', 'invite', pg_temp.keys_ab());
select lives_ok($$ select public.unlink() $$, 'A unlinks with an invitation open');

select pg_temp.login('12121212-0000-0000-0000-00000000000b');
select is(public.accept_run('12121212-0000-0000-0000-0000000000e4'), 'gone', 'nobody joins after an unlink');
select is(
  (select count(*)::int from public.trail_run_members where run_id = '12121212-0000-0000-0000-0000000000e4'),
  0,
  'the ex never becomes a member'
);

reset role;
select is(
  (select count(*)::int from public.run_invites where run_id = '12121212-0000-0000-0000-0000000000e4'),
  0,
  'unlinking drops the couple''s open invitations'
);

-- Without a partner, an invite start is a solo run.
select pg_temp.login('12121212-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select pg_temp.start('12121212-0000-0000-0000-0000000000e5', 'invite', pg_temp.keys_a()) $$,
  'an unlinked invite start takes the caller''s wrap alone'
);
reset role;
select is(
  (select count(*)::int from public.run_invites where run_id = '12121212-0000-0000-0000-0000000000e5'),
  0,
  'an unlinked invite start invites nobody'
);

select * from finish();
rollback;
