begin;
select * from no_plan();

-- Fixtures: A and B are a couple, each with a key row and a recovery code; S is a stranger without keys.
insert into auth.users (id, email) values
  ('15151515-0000-0000-0000-00000000000a', 'a@test.local'),
  ('15151515-0000-0000-0000-00000000000b', 'b@test.local'),
  ('15151515-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('15151515-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('15151515-0000-0000-0000-0000000000cc', '15151515-0000-0000-0000-00000000000a'),
  ('15151515-0000-0000-0000-0000000000cc', '15151515-0000-0000-0000-00000000000b');
insert into public.user_keys (user_id, public_key, key_id, recovery_blob, recovery_salt, recovery_iv) values
  ('15151515-0000-0000-0000-00000000000a', 'pubA', 'a', 'blobA', 'saltA', 'ivA'),
  ('15151515-0000-0000-0000-00000000000b', 'pubB', 'b', 'blobB', 'saltB', 'ivB');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.viewed(p_user uuid) returns timestamptz language sql security definer as $$
  select recovery_viewed_at from public.user_keys where user_id = p_user
$$;

select pg_temp.login('15151515-0000-0000-0000-00000000000a');
select is((select recovery_viewed_at from public.user_keys), null, 'a new code shows as never viewed');
select isnt(public.mark_recovery_viewed(), null, 'the owner''s phone records a viewing');
select is(
  (select recovery_viewed_at from public.user_keys where user_id = auth.uid()),
  now(),
  'the owner reads when the code was viewed'
);
select throws_ok(
  $$ update public.user_keys set recovery_viewed_at = null where user_id = auth.uid() $$,
  '42501', null,
  'the owner cannot clear the date directly'
);

-- A later viewing keeps the first date.
reset role;
update public.user_keys set recovery_viewed_at = now() - interval '2 days'
where user_id = '15151515-0000-0000-0000-00000000000a';
select pg_temp.login('15151515-0000-0000-0000-00000000000a');
select is(public.mark_recovery_viewed(), now() - interval '2 days', 'a second viewing keeps the first date');

-- A new recovery code has not been viewed yet.
select lives_ok(
  $$ update public.user_keys set recovery_blob = 'blobA2', recovery_salt = 'saltA2', recovery_iv = 'ivA2'
     where user_id = auth.uid() $$,
  'the owner makes a new recovery code'
);
select is(pg_temp.viewed('15151515-0000-0000-0000-00000000000a'), null, 'a new code clears the date');
select lives_ok(
  $$ update public.user_keys set public_key = 'pubA', key_id = 'a' where user_id = auth.uid() $$,
  'an update that keeps the code'
);
select is(public.mark_recovery_viewed(), now(), 'the new code''s viewing is recorded');
select lives_ok(
  $$ update public.user_keys set public_key = 'pubA', key_id = 'a' where user_id = auth.uid() $$,
  'another update that keeps the code'
);
select is(pg_temp.viewed('15151515-0000-0000-0000-00000000000a'), now(), 'keeps the date');

-- ---------------------------------------------------------------------------
-- Nobody else reads or sets it
-- ---------------------------------------------------------------------------

select pg_temp.login('15151515-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from public.user_keys where user_id = '15151515-0000-0000-0000-00000000000a'),
  0,
  'the partner cannot read the owner''s key row, date included'
);
select ok(
  not exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_cards'
      and column_name = 'recovery_viewed_at'
  ),
  'profile_cards does not carry the date'
);
select is(public.mark_recovery_viewed(), now(), 'the partner''s call marks only the partner''s own code');
select is(pg_temp.viewed('15151515-0000-0000-0000-00000000000a'), now(), 'and leaves the owner''s date alone');

select pg_temp.login('15151515-0000-0000-0000-000000000005');
select is(public.mark_recovery_viewed(), null, 'a user without a recovery code records nothing');
select is(
  (select count(*)::int from public.user_keys),
  0,
  'a stranger reads no key row'
);

reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$ select public.mark_recovery_viewed() $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
