begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger.
insert into auth.users (id, email) values
  ('77777777-0000-0000-0000-00000000000a', 'a@test.local'),
  ('77777777-0000-0000-0000-00000000000b', 'b@test.local'),
  ('77777777-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('77777777-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('77777777-0000-0000-0000-0000000000cc', '77777777-0000-0000-0000-00000000000a'),
  ('77777777-0000-0000-0000-0000000000cc', '77777777-0000-0000-0000-00000000000b');
insert into public.user_keys (user_id, public_key, key_id) values
  ('77777777-0000-0000-0000-00000000000a', 'pubA', 'a'),
  ('77777777-0000-0000-0000-00000000000b', 'pubB', 'b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select pg_temp.login('77777777-0000-0000-0000-00000000000a');
insert into ids values ('run', public.start_run('t', '{"stops": [{"id": "osm-node-1"}]}', '[
  {"user_id": "77777777-0000-0000-0000-00000000000a", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "a"},
  {"user_id": "77777777-0000-0000-0000-00000000000b", "wrapped_key": "w", "ephemeral_public_key": "e", "for_key_id": "b"}
]', gen_random_uuid()));
select is(
  (select started_by from public.trail_runs where id = (select id from ids where name = 'run')),
  '77777777-0000-0000-0000-00000000000a'::uuid,
  'start_run records the caller as the starter'
);

select pg_temp.login('77777777-0000-0000-0000-00000000000b');
select is(
  (select started_by from public.trail_runs where id = (select id from ids where name = 'run')),
  '77777777-0000-0000-0000-00000000000a'::uuid,
  'the partner sees who started the run'
);
select throws_ok(
  $$ update public.trail_runs set started_by = auth.uid() where id = (select id from ids where name = 'run') $$,
  '42501', null,
  'a member cannot change who started the run'
);

select pg_temp.login('77777777-0000-0000-0000-000000000005');
select is((select count(*)::int from public.trail_runs where started_by is not null and id = (select id from ids where name = 'run')), 0, 'a stranger cannot see the starter');

select * from finish();
rollback;
