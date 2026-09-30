begin;
select * from no_plan();

-- Fixtures: A and B link; S is a stranger; C is a second stranger for the attempt limit.
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-00000000000a', 'a@test.local'),
  ('22222222-0000-0000-0000-00000000000b', 'b@test.local'),
  ('22222222-0000-0000-0000-00000000000c', 'c@test.local'),
  ('22222222-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temp table codes (who text primary key, code text);
grant all on codes to authenticated;

-- Creating an invite
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
insert into codes values ('a', public.create_invite());
select matches((select code from codes where who = 'a'), '^[0-9A-HJKMNP-TV-Z]{10}$', 'invite codes are 10 base32 characters');
select is((select count(*)::int from public.invites), 1, 'the inviter sees their invite');
select throws_ok($$ select code_hash from public.invites $$, '42501', null, 'the code hash stays unreadable');
select throws_ok(
  $$ insert into public.couples default values $$, '42501', null, 'couples cannot be created directly'
);

select pg_temp.login('22222222-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.invites), 0, 'others cannot see an invite');

-- Redeeming
select is(public.redeem_invite('WRONGCODE0'), 'invalid', 'a wrong code is refused');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(public.redeem_invite((select code from codes where who = 'a')), 'self', 'nobody links with themselves');

select pg_temp.login('22222222-0000-0000-0000-00000000000b');
select is(public.redeem_invite(lower((select code from codes where who = 'a'))), 'linked', 'the partner links, case-insensitively');
select is((select count(*)::int from public.couples where ended_at is null), 1, 'the partner sees the couple');
select is((select count(*)::int from public.couple_members), 2, 'the partner sees both members');
select is((select count(*)::int from public.profile_cards), 2, 'partners see each other in profile_cards');

select pg_temp.login('22222222-0000-0000-0000-000000000005');
select is(public.redeem_invite((select code from codes where who = 'a')), 'invalid', 'a used code is refused');
select is((select count(*)::int from public.couples), 0, 'a stranger sees no couple');
select is((select count(*)::int from public.couple_members), 0, 'a stranger sees no members');
select is((select count(*)::int from public.profile_cards), 1, 'a stranger sees only themselves');

-- Nobody belongs to two couples
insert into codes values ('s', public.create_invite());
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select is(public.redeem_invite((select code from codes where who = 's')), 'already_linked', 'a linked user cannot link again');
select throws_ok($$ select public.create_invite() $$, 'P0001', 'already linked', 'a linked user cannot invite');

-- Expiry
reset role;
update public.invites set expires_at = now() - interval '1 minute'
where inviter_id = '22222222-0000-0000-0000-000000000005';
select pg_temp.login('22222222-0000-0000-0000-00000000000c');
select is(public.redeem_invite((select code from codes where who = 's')), 'expired', 'an expired code is refused');

-- Attempt limit: C has one failure so far; nine more reach ten, and the next call is refused outright.
select is(
  (select count(*)::int from generate_series(1, 9) where public.redeem_invite('BADCODE000') = 'invalid'),
  9,
  'failed attempts under the limit report invalid'
);
select is(public.redeem_invite('BADCODE000'), 'rate_limited', 'the eleventh attempt within an hour is refused');

-- Unlinking
select pg_temp.login('22222222-0000-0000-0000-00000000000b');
select lives_ok($$ select public.unlink() $$, 'either partner unlinks alone');
select pg_temp.login('22222222-0000-0000-0000-00000000000a');
select isnt((select ended_at from public.couples), null, 'the other partner sees the couple ended');
select is((select count(*)::int from public.profile_cards), 1, 'an ex without shared runs drops out of profile_cards');
select lives_ok($$ select public.create_invite() $$, 'an unlinked user can invite again');

select * from finish();
rollback;
