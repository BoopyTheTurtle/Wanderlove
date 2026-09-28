begin;
select * from no_plan();

-- Fixtures: A and B (strangers to each other until linked), created as the superuser.
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-00000000000a', 'a@test.local'),
  ('11111111-0000-0000-0000-00000000000b', 'b@test.local');

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

select is(
  (select count(*)::int from public.profiles where id::text like '11111111-%'),
  2,
  'the sign-up trigger creates a profile per user'
);

select pg_temp.login('11111111-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.profiles), 1, 'a user reads only their own profile');
select is((select count(*)::int from public.profile_cards), 1, 'unlinked strangers see no one else in profile_cards');

select lives_ok(
  $$ update public.profiles set display_name = 'Ann' where id = auth.uid() $$,
  'a user renames themselves'
);
select is(
  pg_temp.affected($$ update public.profiles set display_name = 'Hacked'
                      where id = '11111111-0000-0000-0000-00000000000b' $$),
  0,
  'a user cannot rename someone else'
);
select throws_ok(
  $$ update public.profiles set terms_version = 'forged' where id = auth.uid() $$,
  '42501', null,
  'consent fields cannot be written directly'
);

select lives_ok($$ select public.accept_terms('tester-v1') $$, 'accept_terms records consent');
select is((select terms_version from public.profiles), 'tester-v1', 'the consent version is stored');
select isnt((select age_confirmed_at from public.profiles), null, 'the age confirmation is stamped');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.profile_cards $$, '42501', null, 'anon cannot read profile_cards');

select * from finish();
rollback;
