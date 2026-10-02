begin;
select * from no_plan();

-- Fixtures: A and B are a couple and walked a run together, so the run membership outlives their unlink. S is a
-- stranger throughout.
insert into auth.users (id, email) values
  ('17171717-0000-0000-0000-00000000000a', 'a@test.local'),
  ('17171717-0000-0000-0000-00000000000b', 'b@test.local'),
  ('17171717-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('17171717-0000-0000-0000-0000000000ab');
insert into public.couple_members (couple_id, user_id) values
  ('17171717-0000-0000-0000-0000000000ab', '17171717-0000-0000-0000-00000000000a'),
  ('17171717-0000-0000-0000-0000000000ab', '17171717-0000-0000-0000-00000000000b');
insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, completed_at) values
  ('17171717-0000-0000-0000-0000000000a1', '17171717-0000-0000-0000-0000000000ab', 't',
   '{"stops": [{"id": "osm-node-1"}]}', now() - interval '1 hour');
insert into public.trail_run_members (run_id, user_id) values
  ('17171717-0000-0000-0000-0000000000a1', '17171717-0000-0000-0000-00000000000a'),
  ('17171717-0000-0000-0000-0000000000a1', '17171717-0000-0000-0000-00000000000b');

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

-- A's appearance as profile_cards shows it to the caller.
create function pg_temp.card_of_a() returns jsonb language sql as $$
  select appearance from public.profile_cards where id = '17171717-0000-0000-0000-00000000000a'
$$;

-- ---------------------------------------------------------------------------
-- The owner writes and reads
-- ---------------------------------------------------------------------------

select pg_temp.login('17171717-0000-0000-0000-00000000000a');
select is((select appearance from public.profiles where id = auth.uid()), null, 'a new profile has no avatar');
select lives_ok(
  $$ update public.profiles set appearance = '{"v": 1, "skin": 3, "hair": "curly"}' where id = auth.uid() $$,
  'the owner saves an appearance'
);
select is(
  (select appearance from public.profiles where id = auth.uid()), '{"v": 1, "skin": 3, "hair": "curly"}'::jsonb,
  'the owner reads it back'
);
select is(pg_temp.card_of_a(), '{"v": 1, "skin": 3, "hair": "curly"}'::jsonb, 'the owner sees it on their own card');

select throws_ok(
  $$ update public.profiles set appearance = '[1, 2, 3]' where id = auth.uid() $$, '23514', null,
  'an array is refused'
);
select throws_ok(
  $$ update public.profiles set appearance = '"curly"' where id = auth.uid() $$, '23514', null,
  'a string is refused'
);
select throws_ok(
  $$ update public.profiles set appearance = 'null'::jsonb where id = auth.uid() $$, '23514', null,
  'a JSON null is refused; only SQL null clears the avatar'
);
select throws_ok(
  $$ update public.profiles set appearance = jsonb_build_object('pad', repeat('x', 3000)) where id = auth.uid() $$,
  '23514', null,
  'an oversized appearance is refused'
);
select lives_ok(
  $$ update public.profiles set appearance = jsonb_build_object('pad', repeat('x', 1500)) where id = auth.uid() $$,
  'an appearance under the cap is accepted'
);
select lives_ok(
  $$ update public.profiles set appearance = '{"v": 1, "skin": 3, "hair": "curly"}' where id = auth.uid() $$,
  'the owner restores the appearance'
);

-- ---------------------------------------------------------------------------
-- The partner reads it through profile_cards, and cannot write it
-- ---------------------------------------------------------------------------

select pg_temp.login('17171717-0000-0000-0000-00000000000b');
select is(pg_temp.card_of_a(), '{"v": 1, "skin": 3, "hair": "curly"}'::jsonb, 'the partner reads the appearance');
select is(
  (select count(*)::int from public.profiles where id = '17171717-0000-0000-0000-00000000000a'), 0,
  'the partner cannot read the profile row itself'
);
select is(
  pg_temp.affected(
    $$ update public.profiles set appearance = '{"v": 1}' where id = '17171717-0000-0000-0000-00000000000a' $$),
  0,
  'the partner cannot write it'
);
select throws_ok($$ select mobility from public.profile_cards $$, '42703', null, 'profile_cards still hides mobility');
select throws_ok(
  $$ update public.profile_cards set appearance = '{"v": 1}' $$, '55000', null,
  'nobody writes through profile_cards'
);

-- ---------------------------------------------------------------------------
-- A stranger sees nothing
-- ---------------------------------------------------------------------------

select pg_temp.login('17171717-0000-0000-0000-000000000005');
select is(pg_temp.card_of_a(), null, 'a stranger cannot read it');
select is(
  pg_temp.affected(
    $$ update public.profiles set appearance = '{"v": 1}' where id = '17171717-0000-0000-0000-00000000000a' $$),
  0,
  'a stranger cannot write it'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select appearance from public.profile_cards $$, '42501', null, 'anon cannot read it');

-- ---------------------------------------------------------------------------
-- After an unlink the ex sees nothing
-- ---------------------------------------------------------------------------

select pg_temp.login('17171717-0000-0000-0000-00000000000b');
select lives_ok($$ select public.unlink() $$, 'B unlinks');
select is(
  (select count(*)::int from public.profile_cards where id = '17171717-0000-0000-0000-00000000000a'), 1,
  'the ex still sees A''s card through their shared run'
);
select is(pg_temp.card_of_a(), null, 'but no longer reads A''s appearance');

select pg_temp.login('17171717-0000-0000-0000-00000000000a');
select lives_ok(
  $$ update public.profiles set appearance = '{"v": 1, "skin": 5}' where id = auth.uid() $$,
  'A edits the appearance after the unlink'
);
select is(pg_temp.card_of_a(), '{"v": 1, "skin": 5}'::jsonb, 'A still reads their own');

select pg_temp.login('17171717-0000-0000-0000-00000000000b');
select is(pg_temp.card_of_a(), null, 'the edit does not reach the ex');

reset role;
select is(
  (select appearance from public.profiles where id = '17171717-0000-0000-0000-00000000000a'),
  '{"v": 1, "skin": 5}'::jsonb,
  'only the owner''s writes landed'
);

select * from finish();
rollback;
